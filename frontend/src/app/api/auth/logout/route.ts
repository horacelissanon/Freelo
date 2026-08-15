// POST /api/auth/logout — AUTH-05.
//
// Source: RESEARCH.md Pattern 13.
//
// Mutating route — CSRF-gated per D-02 (T-1-03 mitigation: prevents
// attacker-forced logout via CSRF). verifyCsrf returns null if header+cookie
// match (or for safe methods); a NextResponse 403 to short-circuit otherwise.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import {
  REFRESH_COOKIE_NAME,
  clearAuthCookies,
  clearCsrfCookie,
  verifyRefreshToken,
  verifyCsrf,
} from '@/lib/server/auth';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { clearDeviceCookie, getCurrentSessionId, revokeSession } from '@/lib/server/sessions';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    // Best-effort: mark this device's Session row revoked so it stops
    // showing as "active" in Sécurité → Sessions actives. Never blocks
    // logout — an unresolvable refresh token here just means nothing to mark.
    const refreshCookie = req.cookies.get(REFRESH_COOKIE_NAME)?.value;
    if (refreshCookie) {
      const payload = await verifyRefreshToken(refreshCookie);
      const sessionId = await getCurrentSessionId();
      if (payload && sessionId) {
        await revokeSession(payload.sub, sessionId);
      }
    }
    await clearDeviceCookie();

    await clearAuthCookies();
    await clearCsrfCookie();

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
