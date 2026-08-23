// GET /api/auth/sessions — Sécurité → Sessions actives.
//
// Lists this user's non-revoked device sessions (see lib/server/sessions.ts),
// newest-active-first, flagging which one is the caller's own device so the
// UI can grey out its "Fermer" action (closing the session you're reading
// this page from belongs to Déconnexion, not this list).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getCurrentSessionId } from '@/lib/server/sessions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const [sessions, currentSessionId] = await Promise.all([
      prisma.session.findMany({
        where: { userId: auth.user.sub, revokedAt: null },
        orderBy: { lastSeenAt: 'desc' },
        take: 20,
        select: {
          id: true,
          userAgent: true,
          ip: true,
          city: true,
          country: true,
          createdAt: true,
          lastSeenAt: true,
        },
      }),
      getCurrentSessionId(),
    ]);

    return NextResponse.json(
      {
        sessions: sessions.map((s) => ({ ...s, current: s.id === currentSessionId })),
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
