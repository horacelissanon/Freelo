// GET /api/auth/export — Compte → Zone dangereuse "Exporter mes données".
// Full JSON dump of everything this user owns. Explicit `select` allowlist
// on User (not a denylist that strips known secrets) so a future secret
// field added to the model doesn't silently leak through here — mirrors
// the allowlist already used by GET /api/auth/me.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const user = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
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
        createdAt: true,
        updatedAt: true,
        clients: true,
        projects: { include: { steps: true, comments: true } },
        invoices: true,
        orders: true,
        withdrawals: true,
        notifications: true,
        subscription: { include: { transactions: true } },
      },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { exportedAt: new Date().toISOString(), user },
      {
        status: 200,
        headers: {
          'x-request-id': ctx.requestId,
          'Content-Disposition': `attachment; filename="merrudit-export-${user.id}.json"`,
        },
      },
    );
  });
}
