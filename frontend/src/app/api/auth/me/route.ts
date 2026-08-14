// GET /api/auth/me — AUTH-06.
//
// Source: RESEARCH.md Pattern 14.
//
// requireAuth handles the cookie/Bearer lookup, JWT verification, and the
// DB-side tokenVersion re-check (T-1-02 mitigation against stale-JWT bypass
// after change-password bumps tokenVersion). Returns AuthContext on success
// or a 401 NextResponse on failure.
//
// Extra fields beyond { sub, email } (id, emailVerifiedAt, createdAt,
// updatedAt, hasPassword, linkedProviders) are fetched via a second DB hit
// so the AuthContext / settings page can branch on them without an extra
// round-trip. `hasPassword` distinguishes OAuth-only accounts (passwordHash
// is null) — used by /settings to switch between "Set password" and
// "Change password". `linkedProviders` is a string[] of provider names
// already wired (e.g. ['google']).
//
// No CSRF: GET is a safe method; verifyCsrf is a no-op for GET anyway.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    // Defensive shape: tests sometimes stub findUnique with a minimal
    // `{ id, email, tokenVersion }` payload (the requireAuth contract).
    // We only read fields we know are present, and default the rest.
    const dbUser = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        passwordHash: true,
        oauthAccounts: { select: { provider: true } },
        name: true,
        avatarUrl: true,
        phone: true,
        bio: true,
        studioName: true,
        taxId: true,
        address: true,
        defaultCurrency: true,
        language: true,
        showPaidInvoicesDefault: true,
        publicPortalEnabled: true,
      },
    });

    const user = {
      // Keep `sub` for back-compat with the AuthContext payload contract
      // (older callers may still read it). New code should use `id`.
      sub: auth.user.sub,
      id: dbUser?.id ?? auth.user.sub,
      email: dbUser?.email ?? auth.user.email,
      emailVerifiedAt: dbUser?.emailVerifiedAt
        ? dbUser.emailVerifiedAt instanceof Date
          ? dbUser.emailVerifiedAt.toISOString()
          : dbUser.emailVerifiedAt
        : null,
      createdAt: dbUser?.createdAt
        ? dbUser.createdAt instanceof Date
          ? dbUser.createdAt.toISOString()
          : dbUser.createdAt
        : null,
      updatedAt: dbUser?.updatedAt
        ? dbUser.updatedAt instanceof Date
          ? dbUser.updatedAt.toISOString()
          : dbUser.updatedAt
        : null,
      hasPassword: !!dbUser?.passwordHash,
      linkedProviders: (dbUser?.oauthAccounts ?? []).map((a) => a.provider),
      name: dbUser?.name ?? null,
      avatarUrl: dbUser?.avatarUrl ?? null,
      phone: dbUser?.phone ?? null,
      bio: dbUser?.bio ?? null,
      studioName: dbUser?.studioName ?? null,
      taxId: dbUser?.taxId ?? null,
      address: dbUser?.address ?? null,
      defaultCurrency: dbUser?.defaultCurrency ?? 'XOF',
      language: dbUser?.language ?? 'fr',
      showPaidInvoicesDefault: dbUser?.showPaidInvoicesDefault ?? true,
      publicPortalEnabled: dbUser?.publicPortalEnabled ?? true,
    };

    return NextResponse.json({ user }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}

const PatchBody = z.object({
  name: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  bio: z.string().max(1000).optional(),
  avatarUrl: z.string().url().optional(),
  studioName: z.string().max(200).optional(),
  taxId: z.string().max(60).optional(),
  address: z.string().max(300).optional(),
  defaultCurrency: z.string().length(3).optional(),
  language: z.string().min(2).max(10).optional(),
  showPaidInvoicesDefault: z.boolean().optional(),
  publicPortalEnabled: z.boolean().optional(),
});

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const {
      name,
      phone,
      bio,
      avatarUrl,
      studioName,
      taxId,
      address,
      defaultCurrency,
      language,
      showPaidInvoicesDefault,
      publicPortalEnabled,
    } = parsed.data;

    const user = await prisma.user.update({
      where: { id: auth.user.sub },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(bio !== undefined ? { bio } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        ...(studioName !== undefined ? { studioName } : {}),
        ...(taxId !== undefined ? { taxId } : {}),
        ...(address !== undefined ? { address } : {}),
        ...(defaultCurrency !== undefined ? { defaultCurrency } : {}),
        ...(language !== undefined ? { language } : {}),
        ...(showPaidInvoicesDefault !== undefined ? { showPaidInvoicesDefault } : {}),
        ...(publicPortalEnabled !== undefined ? { publicPortalEnabled } : {}),
      },
      select: {
        name: true,
        phone: true,
        bio: true,
        avatarUrl: true,
        studioName: true,
        taxId: true,
        address: true,
        defaultCurrency: true,
        language: true,
        showPaidInvoicesDefault: true,
        publicPortalEnabled: true,
      },
    });

    return NextResponse.json({ user }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
