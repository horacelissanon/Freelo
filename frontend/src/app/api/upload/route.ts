/**
 * POST /api/upload — authenticated multipart file upload.
 *
 * Pipeline (D-UP-04 ordering — gates BEFORE byte read):
 *   1. CSRF (verifyCsrf) → bail 403 on mismatch
 *   2. Auth (requireAuth) → bail 401 on missing/invalid session
 *   3. Cloudinary lazy-init → 503 STORAGE_NOT_CONFIGURED on missing creds
 *   4. formData parse → 400 UPLOAD_MISSING_FILE if no `file` field
 *   5. Optional `projectId` field → ownership check (404 PROJECT_NOT_FOUND)
 *      + 5-file cap (400 MAX_FILES_REACHED) — only exercised when present,
 *      so callers that don't attach a project (avatars, chat attachments)
 *      skip this entirely.
 *   6. Size cap (UPLOAD_MAX_BYTES, raised for project deliverables) → 413 FILE_TOO_LARGE
 *   7. MIME allowlist (UPLOAD_ALLOWED_MIME) → 415 INVALID_MIME
 *   8. Magic-byte sniff (verifyMagicBytes) → 415 MAGIC_BYTE_MISMATCH if sniffed && !match
 *   9. Cloudinary upload_stream → 502 UPLOAD_FAILED on throw
 *   10. prisma.fileUpload.create → 201 with row + x-request-id header
 *
 * Magic-byte invariant: sniff happens server-side BEFORE the upload call.
 * Do NOT delegate validation to Cloudinary alone — the route is the single
 * trust boundary for declared-vs-actual MIME parity.
 *
 * ⚠️ Privacy invariant: Cloudinary `secure_url` is publicly accessible —
 * anyone with the URL can fetch the file (no auth, no expiry). Safe for
 * avatars / product images / public posts. For private files (KYC docs,
 * invoices, IDs) this route must be wrapped with Cloudinary signed delivery
 * URLs or an owner-gated proxy. The v1 starter ships neither — adding either
 * is project-specific.
 *
 * Key naming: `{userId}/{cuid}.{ext}` — random UUID prevents collisions and
 * blocks path-traversal via attacker-controlled filename (T-04-02-02). The
 * resulting string is passed to Cloudinary as `public_id` and stored in
 * `FileUpload.key` (column kept as-is from the R2 era; semantically now a
 * Cloudinary public_id, same unique-string column).
 *
 * Env is read at handler-call time (never module-top) so vi.stubEnv works in
 * tests and the route picks up env changes without restart.
 */
export const runtime = 'nodejs';

import { randomUUID } from 'node:crypto';
import heicConvert from 'heic-convert';
import { NextResponse, type NextRequest } from 'next/server';

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';
import { StorageNotConfiguredError, uploadBuffer } from '@/lib/server/upload/cloudinary-client';
import { sanitizeFilename } from '@/lib/server/upload/sanitize-filename';
import { verifyMagicBytes } from '@/lib/server/upload/sniff';

const HEIC_MIMES = new Set(['image/heic', 'image/heif']);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    // Read env at handler-call time so vi.stubEnv works and operators can flip
    // limits without redeploy. Never hoist these to module top.
    const allowedMime = (
      process.env.UPLOAD_ALLOWED_MIME ??
      'image/jpeg,image/png,image/webp,application/pdf,application/zip,application/postscript'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    // Probe Cloudinary configuration BEFORE consuming the request body — we
    // want STORAGE_NOT_CONFIGURED to be a cheap 503, not a body-parse-after.
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return NextResponse.json(
        { code: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { code: 'UPLOAD_MISSING_FILE', message: 'file field is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Project deliverables ("Livrable final") link to a Project the caller
    // owns and are capped at 5 files/project — checked here rather than a
    // separate route so every upload (avatar, chat attachment, deliverable)
    // shares one validated pipeline (CSRF/auth/size/MIME/magic-byte/HEIC).
    const projectId = form.get('projectId');
    let linkedProjectId: string | undefined;
    if (typeof projectId === 'string' && projectId.length > 0) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: auth.user.sub },
        select: { id: true },
      });
      if (!project) {
        return NextResponse.json(
          {
            code: 'PROJECT_NOT_FOUND',
            message: 'Project does not exist or does not belong to you',
          },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      const existingCount = await prisma.fileUpload.count({ where: { projectId } });
      if (existingCount >= 5) {
        return NextResponse.json(
          { code: 'MAX_FILES_REACHED', message: 'This project already has 5 files' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      linkedProjectId = project.id;
    }

    // Project deliverables (design files, PDFs, zipped source) run larger
    // than the 10MB default meant for avatars/photos.
    const maxBytes = linkedProjectId
      ? 52428800
      : Number.parseInt(process.env.UPLOAD_MAX_BYTES ?? '10485760', 10);

    if (file.size > maxBytes) {
      return NextResponse.json(
        { code: 'FILE_TOO_LARGE', message: `Max ${maxBytes} bytes` },
        { status: 413, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (!allowedMime.includes(file.type)) {
      return NextResponse.json(
        { code: 'INVALID_MIME', message: `MIME ${file.type} not allowed` },
        { status: 415, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Read bytes only AFTER size + MIME gates (D-UP-04 — never allocate before
    // the cheap rejections fire).
    const ab = await file.arrayBuffer();
    let buf = Buffer.from(ab);
    const { match, sniffed } = verifyMagicBytes(buf, file.type);
    if (sniffed && !match) {
      return NextResponse.json(
        { code: 'MAGIC_BYTE_MISMATCH', message: 'File bytes do not match declared MIME' },
        { status: 415, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    // sniffed=false → operator allowed a MIME we don't sniff (e.g. text/csv).
    // sniff.ts logs a warn at boot for those; we accept here per its docs.

    let storedMime = file.type;
    let storedFilename = sanitizeFilename(file.name);

    // HEIC/HEIF lacks broad browser support — transcode to JPEG so the
    // returned Cloudinary URL can be used in <img> tags without a
    // client-side decoder.
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
          { status: 502, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    // Cloudinary stores `public_id` without extension by convention; we keep
    // the {userId}/{uuid} form (no extension) so the path semantics match the
    // R2 era and the stored `key` remains a stable unique opaque string.
    const publicId = `${auth.user.sub}/${randomUUID()}`;

    let uploaded;
    try {
      uploaded = await uploadBuffer(publicId, buf, storedMime);
    } catch (e) {
      if (e instanceof StorageNotConfiguredError) {
        return NextResponse.json(
          { code: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        { code: 'UPLOAD_FAILED', message: 'Storage write failed' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const row = await prisma.fileUpload.create({
      data: {
        userId: auth.user.sub,
        key: uploaded.publicId,
        url: uploaded.secureUrl,
        filename: storedFilename,
        mimeType: storedMime,
        sizeBytes: uploaded.bytes,
        ...(linkedProjectId ? { projectId: linkedProjectId } : {}),
      },
      select: {
        id: true,
        key: true,
        url: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        projectId: true,
        createdAt: true,
      },
    });

    return NextResponse.json(row, {
      status: 201,
      headers: { 'x-request-id': ctx.requestId },
    });
  });
}
