// POST /api/auth/sessions/[id]/revoke — disconnect one other device.
//
// Refuses to revoke the caller's own current session (id === the device
// cookie's session id) — closing the session you're issuing the request
// from is what Déconnexion is for, and doing it here would 401 the very
// next request this browser makes without going through the normal logout
// cookie-clearing flow.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { getCurrentSessionId, revokeSession } from '@/lib/server/sessions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const currentSessionId = await getCurrentSessionId();
    if (id === currentSessionId) {
      return NextResponse.json(
        {
          error: 'CANNOT_REVOKE_CURRENT_SESSION',
          message: 'Use Déconnexion to close your current session.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await revokeSession(auth.user.sub, id);

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
