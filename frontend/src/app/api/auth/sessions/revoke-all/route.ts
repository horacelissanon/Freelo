// POST /api/auth/sessions/revoke-all — "Fermer toutes les autres sessions".
// Always keeps the caller's own current device logged in (per the explicit
// product requirement: disconnecting other devices must never end the
// session the request itself is made from).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { getCurrentSessionId, revokeOtherSessions } from '@/lib/server/sessions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const currentSessionId = await getCurrentSessionId();
    await revokeOtherSessions(auth.user.sub, currentSessionId);

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
