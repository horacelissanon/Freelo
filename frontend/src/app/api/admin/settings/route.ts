// PATCH /api/admin/settings — SUPERADMIN-only edit of the single AppSettings
// row (site-wide config, currently just the community WhatsApp link).
// Mirrors admin/plans/[plan]/route.ts's CSRF/rate-limit/requireSuperadmin +
// upsert-on-read + audit-log boilerplate.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getAppSettings } from '@/lib/server/settings/appSettings';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const SINGLETON_ID = 'default';

// Empty string clears the link back to "unset" (falls back to the
// placeholder everywhere it's consumed) — trimmed first so accidental
// whitespace-only input clears it too, rather than saving as a bogus URL.
const Body = z.object({
  communityWhatsappUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === '' || /^https:\/\//.test(v), {
      message: 'Must be empty or start with https://',
    })
    .optional(),
});

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const { communityWhatsappUrl } = parsed.data;

    const existing = await getAppSettings(prisma);
    const nextValue = communityWhatsappUrl === '' ? null : communityWhatsappUrl;
    const updated = await prisma.appSettings.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        ...(nextValue !== undefined ? { communityWhatsappUrl: nextValue } : {}),
      },
      update: { ...(nextValue !== undefined ? { communityWhatsappUrl: nextValue } : {}) },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'app_settings.update',
      targetType: 'AppSettings',
      targetId: SINGLETON_ID,
      metadata: {
        from: { communityWhatsappUrl: existing.communityWhatsappUrl },
        to: { communityWhatsappUrl: updated.communityWhatsappUrl },
      },
    });

    return NextResponse.json(
      { communityWhatsappUrl: updated.communityWhatsappUrl, updatedAt: updated.updatedAt },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
