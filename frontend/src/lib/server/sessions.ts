// Device/session bookkeeping — layered ON TOP of the stateless refresh-token
// design in lib/server/auth.ts, which stays untouched (no jti embedded in
// the JWT, no change to createRefreshToken/verifyRefreshToken). A device is
// identified by a separate, path-scoped cookie set alongside the normal auth
// cookies at login/signup. Revocation is checked at the next refresh (see
// app/api/auth/refresh/route.ts) — same ≤15min staleness window the app
// already accepts for ACCOUNT_SUSPENDED — rather than instantly on the
// current access token, so requireAuth (protected, hot path) never needs to
// change.
import 'server-only';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { log } from './observability/log';

const COOKIE_PREFIX = process.env.COOKIE_PREFIX || 'app';
export const DEVICE_COOKIE_NAME = `${COOKIE_PREFIX}-device`;
// Mirrors the refresh cookie's 7-day TTL — once the refresh token itself
// expires, the device identity is moot anyway.
const DEVICE_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

function clientIp(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return headers.get('x-real-ip');
}

/**
 * Creates a new Session row + sets the device-identity cookie. Called right
 * after setAuthCookies() at login and at signup verification. Best-effort by
 * design and swallows its own errors — Sessions actives is a convenience
 * feature, not part of the auth invariants, so a Prisma hiccup here must
 * never turn into a failed login/signup for the caller.
 */
export async function startSession(userId: string, headers: Headers): Promise<void> {
  try {
    const session = await prisma.session.create({
      data: {
        userId,
        userAgent: headers.get('user-agent')?.slice(0, 300) ?? null,
        ip: clientIp(headers),
      },
    });
    const store = await cookies();
    store.set(DEVICE_COOKIE_NAME, session.id, {
      httpOnly: true,
      secure: isProd(),
      sameSite: 'lax',
      maxAge: DEVICE_COOKIE_MAX_AGE,
      path: '/api/auth',
    });
  } catch (err) {
    log.warn('startSession failed — continuing without device bookkeeping', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Reads the current device's session id from its cookie, if any. */
export async function getCurrentSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(DEVICE_COOKIE_NAME)?.value ?? null;
}

export async function clearDeviceCookie(): Promise<void> {
  const store = await cookies();
  store.set(DEVICE_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    maxAge: 0,
    path: '/api/auth',
  });
}

/**
 * Returns null if the session is missing/revoked/not this user's — the
 * refresh route treats that as "nothing to enforce" for sessions created
 * before this feature shipped (no device cookie at all) and as "blocked"
 * for a session explicitly revoked from Sécurité.
 */
export async function checkSessionRevoked(userId: string, sessionId: string): Promise<boolean> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { userId: true, revokedAt: true },
  });
  if (!session || session.userId !== userId) return false;
  return session.revokedAt !== null;
}

export async function touchSession(sessionId: string): Promise<void> {
  await prisma.session
    .update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } })
    .catch(() => {
      // Session row may have been deleted (cascade on account deletion) —
      // never let a bookkeeping write break the refresh flow.
    });
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, userId },
    data: { revokedAt: new Date() },
  });
}

export async function revokeOtherSessions(
  userId: string,
  keepSessionId: string | null,
): Promise<void> {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(keepSessionId ? { id: { not: keepSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}
