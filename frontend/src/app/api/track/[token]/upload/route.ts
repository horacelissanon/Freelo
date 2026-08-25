// POST /api/track/[token]/upload — public, token-gated file upload for the
// Client Link Portal messaging thread (mirrors POST /api/upload's pipeline —
// size cap, MIME allowlist, magic-byte sniff, HEIC transcode — but resolves
// the caller via the project's publicToken instead of a session, same
// pattern as POST /api/track/[token]/comments). The uploaded file is never
// linked to Project.files ("Livrable final" stays freelance-only) — it's
// meant to be attached to a ProjectComment right after via that same
// comments route, exactly like the freelance side's own chat-attachment
// upload (which also creates an unlinked FileUpload row).
export const runtime = 'nodejs';

import { randomUUID } from 'node:crypto';
import heicConvert from 'heic-convert';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { enforceTokenRateLimit } from '@/lib/server/middleware/rate-limit-by-token';
import { isProActive } from '@/lib/server/billing/subscription';
import { StorageNotConfiguredError, uploadBuffer } from '@/lib/server/upload/cloudinary-client';
import { sanitizeFilename } from '@/lib/server/upload/sanitize-filename';
import { verifyMagicBytes } from '@/lib/server/upload/sniff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const HEIC_MIMES = new Set(['image/heic', 'image/heif']);
const RATE_LIMIT_PREFIX = 'rl:track:upload:';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_HITS = 10;
const MAX_BYTES = 52428800; // 52 MB — matches the "Livrable final" project-deliverable cap.

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const { token } = await ctx.params;

    const limited = await enforceTokenRateLimit(RATE_LIMIT_PREFIX, token, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxHits: RATE_LIMIT_MAX_HITS,
    });
    if (limited) return limited;

    const project = await prisma.project.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            publicPortalEnabled: true,
            subscription: { select: { plan: true, status: true, currentPeriodEnd: true } },
          },
        },
      },
    });
    if (!project || !project.user.publicPortalEnabled) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Lien de suivi invalide ou expiré.' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (
      !isProActive(
        project.user.subscription ?? { plan: 'FREE', status: 'ACTIVE', currentPeriodEnd: null },
      )
    ) {
      return NextResponse.json(
        {
          error: 'PLAN_REQUIRES_PRO',
          message: 'La messagerie est réservée aux freelances en plan Pro.',
        },
        { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return NextResponse.json(
        { code: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
        { status: 503, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Matches what the client can reasonably want to send back: photo, or a
    // generic document (PDF/zip/etc, same allowlist as the deliverable
    // dropzone), never arbitrary executables. Voice notes (audio/webm,
    // audio/mp4) were removed 2026-08-25 — not useful yet, dropped SaaS-wide.
    const allowedMime = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/pdf',
      'application/zip',
      'application/postscript',
    ];

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { code: 'UPLOAD_MISSING_FILE', message: 'file field is required' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { code: 'FILE_TOO_LARGE', message: `Max ${MAX_BYTES} bytes` },
        { status: 413, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (!allowedMime.includes(file.type)) {
      return NextResponse.json(
        { code: 'INVALID_MIME', message: `MIME ${file.type} not allowed` },
        { status: 415, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const ab = await file.arrayBuffer();
    let buf = Buffer.from(ab);
    const { match, sniffed } = verifyMagicBytes(buf, file.type);
    if (sniffed && !match) {
      return NextResponse.json(
        { code: 'MAGIC_BYTE_MISMATCH', message: 'File bytes do not match declared MIME' },
        { status: 415, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    let storedMime = file.type;
    let storedFilename = sanitizeFilename(file.name);

    if (HEIC_MIMES.has(storedMime)) {
      try {
        const converted = await heicConvert({
          buffer: buf as unknown as ArrayBufferLike,
          format: 'JPEG',
          quality: 0.9,
        });
        buf = Buffer.from(converted);
        storedMime = 'image/jpeg';
        storedFilename = storedFilename.replace(/\.(heic|heif)$/i, '.jpg');
      } catch {
        return NextResponse.json(
          { code: 'HEIC_CONVERSION_FAILED', message: 'HEIC conversion failed' },
          { status: 502, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }

    const publicId = `${project.user.id}/${randomUUID()}`;

    let uploaded;
    try {
      uploaded = await uploadBuffer(publicId, buf, storedMime);
    } catch (e) {
      if (e instanceof StorageNotConfiguredError) {
        return NextResponse.json(
          { code: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
          { status: 503, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
      return NextResponse.json(
        { code: 'UPLOAD_FAILED', message: 'Storage write failed' },
        { status: 502, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Recorded under the freelance's own account (never linked to
    // Project.files) — same bookkeeping the freelance's own chat-attachment
    // upload already gets via POST /api/upload without a projectId.
    const row = await prisma.fileUpload.create({
      data: {
        userId: project.user.id,
        key: uploaded.publicId,
        url: uploaded.secureUrl,
        filename: storedFilename,
        mimeType: storedMime,
        sizeBytes: uploaded.bytes,
      },
      select: { url: true },
    });

    return NextResponse.json(row, {
      status: 201,
      headers: { 'x-request-id': reqCtx.requestId },
    });
  });
}
