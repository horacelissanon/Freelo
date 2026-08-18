// frontend/src/lib/server/deadlines/sweep.ts
//
// Turns silent deadline facts (an Invoice.dueDate that's passed, a
// Project.dueDate coming up) into the two things the freelancer actually
// sees: the Invoice.status flip to OVERDUE (read by /api/dashboard/stats'
// overdueCount and the dashboard AlertBanner) and a real Notification row
// (read by the bell's badge count + list). Before this, nothing ever set
// status: 'OVERDUE' — the stat and banner existed but could never fire.
//
// Idempotent per calendar day: overdue invoices, expiring quotes and
// upcoming project deadlines all key their dedupeKey on `todayKey`, so
// re-running the sweep within the same day on the same facts is a no-op,
// but the next day's tick fires again for as long as the condition holds —
// a freelance gets nudged daily until the invoice is paid, the quote is
// decided, or the project is delivered. Terminal transitions (quote
// expired, project delivered) fire once, since there's nothing left to
// remind about afterwards.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { createNotification } from '../notifications/index';
import {
  invoiceOverdue,
  projectDeadlineSoon,
  projectOverdue,
  quoteExpired,
  quoteExpiringSoon,
} from '../notifications/templates';

const REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export interface SweepDeadlineAlertsResult {
  invoicesFlaggedOverdue: number;
  invoiceNotifications: number;
  quotesFlaggedExpired: number;
  quoteNotifications: number;
  quoteReminderNotifications: number;
  projectNotifications: number;
  projectOverdueNotifications: number;
}

export async function sweepDeadlineAlerts(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<SweepDeadlineAlertsResult> {
  const todayKey = now.toISOString().slice(0, 10);

  let invoicesFlaggedOverdue = 0;

  const overdueCandidates = await prisma.invoice.findMany({
    where: { docType: 'INVOICE', status: 'SENT', dueDate: { lt: now } },
    select: { id: true, userId: true, number: true, amount: true, currency: true },
  });
  for (const inv of overdueCandidates) {
    // Per-row WHERE-guard: only flip rows still SENT, in case a payment
    // webhook raced this in between the findMany and the update.
    const updated = await prisma.invoice.updateMany({
      where: { id: inv.id, status: 'SENT' },
      data: { status: 'OVERDUE' },
    });
    if (updated.count === 0) continue;
    invoicesFlaggedOverdue++;
  }

  // Daily reminder for every invoice currently OVERDUE and unpaid — includes
  // the ones just flipped above (first firing coincides with the flip), and
  // repeats once per calendar day until the invoice is marked paid (it then
  // drops out of this query).
  let invoiceNotifications = 0;
  const stillOverdue = await prisma.invoice.findMany({
    where: { docType: 'INVOICE', status: 'OVERDUE' },
    select: { id: true, userId: true, number: true, amount: true, currency: true },
  });
  for (const inv of stillOverdue) {
    const created = await createNotification(
      prisma,
      invoiceOverdue(inv.userId, inv.id, inv.number, inv.amount, inv.currency, todayKey),
    );
    if (created) invoiceNotifications++;
  }

  // Same flip pattern, mirrored for devis: a SENT quote whose dueDate has
  // passed without being accepted expires. `dueDate: null` (no échéance
  // set) is naturally excluded by the `lt: now` filter. Expiry is terminal
  // (nothing more will happen to the quote) so this notification fires once,
  // unlike the daily reminders below.
  let quotesFlaggedExpired = 0;
  let quoteNotifications = 0;

  const expiredCandidates = await prisma.invoice.findMany({
    where: { docType: 'QUOTE', status: 'SENT', dueDate: { lt: now } },
    select: { id: true, userId: true, number: true },
  });
  for (const q of expiredCandidates) {
    const updated = await prisma.invoice.updateMany({
      where: { id: q.id, status: 'SENT' },
      data: { status: 'EXPIRED' },
    });
    if (updated.count === 0) continue;
    quotesFlaggedExpired++;
    const created = await createNotification(prisma, quoteExpired(q.userId, q.id, q.number));
    if (created) quoteNotifications++;
  }

  const reminderCutoff = new Date(now.getTime() + REMINDER_WINDOW_MS);

  // Daily reminder for a devis about to expire — mirrors the project
  // reminder below, stops once it's accepted or expired (leaves status:
  // 'SENT' either way).
  let quoteReminderNotifications = 0;
  const expiringSoonQuotes = await prisma.invoice.findMany({
    where: { docType: 'QUOTE', status: 'SENT', dueDate: { gt: now, lte: reminderCutoff } },
    select: { id: true, userId: true, number: true, dueDate: true },
  });
  for (const q of expiringSoonQuotes) {
    if (!q.dueDate) continue;
    const created = await createNotification(
      prisma,
      quoteExpiringSoon(q.userId, q.id, q.number, q.dueDate.toISOString(), todayKey),
    );
    if (created) quoteReminderNotifications++;
  }

  // Single query covering both "coming up soon" and "already passed" —
  // branched in-memory by comparing each row's dueDate to `now`, same
  // one-round-trip-then-bucket pattern as the revenue trend queries. Before
  // this, only the soon-due half fired: a project whose dueDate slipped by
  // (dueDate < now) fell out of the `gt: now` filter and got zero alert,
  // forever, since Project has no OVERDUE status to flip like Invoice does.
  let projectNotifications = 0;
  let projectOverdueNotifications = 0;
  const projectsNeedingAttention = await prisma.project.findMany({
    where: {
      status: { notIn: ['DELIVERED', 'DRAFT'] },
      dueDate: { lte: reminderCutoff },
    },
    select: { id: true, userId: true, name: true, dueDate: true },
  });
  for (const p of projectsNeedingAttention) {
    if (!p.dueDate) continue;
    if (p.dueDate < now) {
      const created = await createNotification(
        prisma,
        projectOverdue(p.userId, p.id, p.name, p.dueDate.toISOString(), todayKey),
      );
      if (created) projectOverdueNotifications++;
    } else {
      const created = await createNotification(
        prisma,
        projectDeadlineSoon(p.userId, p.id, p.name, p.dueDate.toISOString(), todayKey),
      );
      if (created) projectNotifications++;
    }
  }

  return {
    invoicesFlaggedOverdue,
    invoiceNotifications,
    quotesFlaggedExpired,
    quoteNotifications,
    quoteReminderNotifications,
    projectNotifications,
    projectOverdueNotifications,
  };
}
