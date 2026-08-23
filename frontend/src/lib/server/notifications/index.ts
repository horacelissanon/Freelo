/**
 * createNotification — single entry point for every Notification row.
 *
 * The Notification.dedupeKey @unique constraint is the at-most-once
 * delivery gate (mirrors the cagnottes.sn P01 + P06 pattern). Project
 * code MUST always go through this function — never call
 * `prisma.notification.create` inline. Typed wrappers (e.g.
 * `fireWelcome(userId)`) live in `templates.ts`.
 */
import type { PrismaClient, Notification, Prisma } from '@prisma/client';
import { isChannelEnabled, type NotificationPrefs } from './prefs-merge';

// Account-security event types always fire in-app regardless of the user's
// NotificationPreferences — a user must not be able to silently miss "your
// account was suspended" or "a PIN abuse pattern was detected on your
// account" by having opted out of some other notification type. Kept in
// sync with EMAIL_PREFERENCE_EXEMPT_TYPES in ./dispatch.ts.
const IN_APP_PREFERENCE_EXEMPT_TYPES: ReadonlySet<string> = new Set([
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_RESTORED',
  'ROLE_CHANGED',
  'WITHDRAWAL_PIN_ABUSE_WARNING',
]);

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Caller-supplied — must be deterministic for the dedup window. */
  dedupeKey: string;
}

/**
 * Returns the created Notification row, or `null` if the dedupeKey already
 * exists (silently deduplicated).
 *
 * Other Prisma errors are re-thrown so callers can decide whether to retry.
 */
export async function createNotification(
  prisma: PrismaClient,
  input: CreateNotificationInput,
): Promise<Notification | null> {
  if (!IN_APP_PREFERENCE_EXEMPT_TYPES.has(input.type)) {
    const prefsRow = await prisma.notificationPreferences.findUnique({
      where: { userId: input.userId },
      select: { prefs: true },
    });
    const prefs = (prefsRow?.prefs ?? null) as NotificationPrefs | null;
    if (!isChannelEnabled(prefs, input.type, 'inApp')) {
      return null;
    }
  }
  try {
    return await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        dedupeKey: input.dedupeKey,
        data: (input.data ?? null) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      },
    });
  } catch (err) {
    // Duck-typed P2002 catch (Prisma unique violation). Mirrors slug.ts
    // pattern from Phase 1 — works across Prisma client edge cases that
    // don't always tag the error with the proper subclass.
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 'P2002'
    ) {
      return null;
    }
    throw err;
  }
}
