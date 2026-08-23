/**
 * dispatchNotification — creates the in-app Notification row, then
 * optionally enqueues an email, honoring NotificationPreferences on the
 * email channel (mirrors the opt-out default already documented in
 * `prefs-merge.ts`: missing = enabled, explicit false = disabled).
 *
 * The in-app channel's own preference check lives in
 * `notifications/index.ts::createNotification` — this wrapper only adds the
 * email leg so call sites don't have to duplicate the
 * "createNotification, then maybe enqueue" pattern by hand (see the
 * pre-existing inline version in cron/subscription-expiry/route.ts).
 *
 * A few account-security event types are exempt from the email preference
 * check — same exemption list as createNotification's in-app gate, kept in
 * sync here so a user can't silently miss a suspension/role-change email by
 * disabling notifications for that type.
 */
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { createNotification, type CreateNotificationInput } from './index';
import { isChannelEnabled, type NotificationPrefs } from './prefs-merge';
import { getEmailQueue } from '../queues/email-queue-singleton';

const EMAIL_PREFERENCE_EXEMPT_TYPES: ReadonlySet<string> = new Set([
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_RESTORED',
  'ROLE_CHANGED',
  'WITHDRAWAL_PIN_ABUSE_WARNING',
]);

export interface EmailRender {
  to: string;
  subject: string;
  html: string;
}

export interface DispatchNotificationOptions {
  input: CreateNotificationInput;
  /** Lazily rendered — only called if the notification was created AND the
   *  email channel is enabled for this type, so a deduped/opted-out event
   *  never pays the render cost. */
  email?: () => EmailRender;
}

export async function dispatchNotification(
  prisma: PrismaClient,
  opts: DispatchNotificationOptions,
): Promise<void> {
  const created = await createNotification(prisma, opts.input);
  if (!created || !opts.email) return;

  if (!EMAIL_PREFERENCE_EXEMPT_TYPES.has(opts.input.type)) {
    const prefsRow = await prisma.notificationPreferences.findUnique({
      where: { userId: opts.input.userId },
      select: { prefs: true },
    });
    const prefs = (prefsRow?.prefs ?? null) as NotificationPrefs | null;
    if (!isChannelEnabled(prefs, opts.input.type, 'email')) return;
  }

  const queue = getEmailQueue();
  if (!queue) return;
  await queue.enqueue(opts.email());
}
