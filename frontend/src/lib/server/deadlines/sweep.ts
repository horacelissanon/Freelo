// frontend/src/lib/server/deadlines/sweep.ts
//
// Turns silent deadline facts (an Invoice.dueDate that's passed, a
// Project.dueDate coming up) into the two things the freelancer actually
// sees: the Invoice.status flip to OVERDUE (read by /api/dashboard/stats'
// overdueCount and the dashboard AlertBanner) and a real Notification row
// (read by the bell's badge count + list). Before this, nothing ever set
// status: 'OVERDUE' — the stat and banner existed but could never fire.
//
// Idempotent: createNotification's dedupeKey uniqueness means re-running
// the sweep on the same facts is a no-op after the first tick.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { createNotification } from '../notifications/index';
import { invoiceOverdue, projectDeadlineSoon, quoteExpired } from '../notifications/templates';

const PROJECT_REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export interface SweepDeadlineAlertsResult {
  invoicesFlaggedOverdue: number;
  invoiceNotifications: number;
  quotesFlaggedExpired: number;
  quoteNotifications: number;
  projectNotifications: number;
}

export async function sweepDeadlineAlerts(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<SweepDeadlineAlertsResult> {
  let invoicesFlaggedOverdue = 0;
  let invoiceNotifications = 0;

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
    const created = await createNotification(
      prisma,
      invoiceOverdue(inv.userId, inv.id, inv.number, inv.amount, inv.currency),
    );
    if (created) invoiceNotifications++;
  }

  // Same pattern as the OVERDUE flip above, mirrored for devis: a SENT quote
  // whose dueDate has passed without being accepted expires. `dueDate: null`
  // (no échéance set) is naturally excluded by the `lt: now` filter.
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

  let projectNotifications = 0;
  const reminderCutoff = new Date(now.getTime() + PROJECT_REMINDER_WINDOW_MS);
  const upcomingProjects = await prisma.project.findMany({
    where: {
      status: { not: 'DELIVERED' },
      dueDate: { gt: now, lte: reminderCutoff },
    },
    select: { id: true, userId: true, name: true, dueDate: true },
  });
  for (const p of upcomingProjects) {
    if (!p.dueDate) continue;
    const created = await createNotification(
      prisma,
      projectDeadlineSoon(p.userId, p.id, p.name, p.dueDate.toISOString()),
    );
    if (created) projectNotifications++;
  }

  return {
    invoicesFlaggedOverdue,
    invoiceNotifications,
    quotesFlaggedExpired,
    quoteNotifications,
    projectNotifications,
  };
}
