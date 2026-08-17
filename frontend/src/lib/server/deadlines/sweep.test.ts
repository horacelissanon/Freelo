import { describe, it, expect, beforeEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { sweepDeadlineAlerts } from './sweep';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

// Fixed "now" so dedupeKey day-keys are deterministic across assertions.
const NOW = new Date('2026-08-17T12:00:00.000Z');
const TODAY_KEY = '2026-08-17';

beforeEach(() => {
  mockReset(prismaMock);
  // Call order inside sweepDeadlineAlerts: overdueCandidates, stillOverdue,
  // expiredCandidates, expiringSoonQuotes (all prisma.invoice.findMany),
  // then prisma.project.findMany.
  prismaMock.invoice.findMany.mockResolvedValue([]);
  prismaMock.project.findMany.mockResolvedValue([]);
});

describe('sweepDeadlineAlerts', () => {
  it('flips a SENT invoice past dueDate to OVERDUE and sends a daily-keyed notification', async () => {
    prismaMock.invoice.findMany
      .mockResolvedValueOnce([
        { id: 'inv_1', userId: 'u_1', number: '2026-001', amount: 50000, currency: 'XOF' },
      ] as never) // overdueCandidates
      .mockResolvedValueOnce([
        { id: 'inv_1', userId: 'u_1', number: '2026-001', amount: 50000, currency: 'XOF' },
      ] as never) // stillOverdue (includes the row just flipped)
      .mockResolvedValueOnce([]) // expiredCandidates
      .mockResolvedValueOnce([]); // expiringSoonQuotes
    prismaMock.invoice.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.notification.create.mockResolvedValueOnce({ id: 'n_1' } as never);

    const result = await sweepDeadlineAlerts(prismaMock, NOW);

    expect(prismaMock.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv_1', status: 'SENT' },
      data: { status: 'OVERDUE' },
    });
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dedupeKey: `invoice-overdue:inv_1:${TODAY_KEY}` }),
      }),
    );
    expect(result).toEqual({
      invoicesFlaggedOverdue: 1,
      invoiceNotifications: 1,
      quotesFlaggedExpired: 0,
      quoteNotifications: 0,
      quoteReminderNotifications: 0,
      projectNotifications: 0,
    });
  });

  it('skips the flip when the row already moved away from SENT (race), but still reminds if already OVERDUE', async () => {
    prismaMock.invoice.findMany
      .mockResolvedValueOnce([
        { id: 'inv_2', userId: 'u_1', number: '2026-002', amount: 1000, currency: 'XOF' },
      ] as never) // overdueCandidates
      .mockResolvedValueOnce([]) // stillOverdue — none currently OVERDUE
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.invoice.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await sweepDeadlineAlerts(prismaMock, NOW);

    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    expect(result.invoicesFlaggedOverdue).toBe(0);
    expect(result.invoiceNotifications).toBe(0);
  });

  it('reminds daily for an invoice that was already OVERDUE on a prior tick', async () => {
    prismaMock.invoice.findMany
      .mockResolvedValueOnce([]) // overdueCandidates — nothing newly crossing dueDate
      .mockResolvedValueOnce([
        { id: 'inv_5', userId: 'u_1', number: '2026-005', amount: 9000, currency: 'XOF' },
      ] as never) // stillOverdue — flipped on an earlier tick, still unpaid
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.notification.create.mockResolvedValueOnce({ id: 'n_5' } as never);

    const result = await sweepDeadlineAlerts(prismaMock, NOW);

    expect(prismaMock.invoice.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dedupeKey: `invoice-overdue:inv_5:${TODAY_KEY}` }),
      }),
    );
    expect(result.invoicesFlaggedOverdue).toBe(0);
    expect(result.invoiceNotifications).toBe(1);
  });

  it('flips a SENT quote past dueDate to EXPIRED and notifies once', async () => {
    prismaMock.invoice.findMany
      .mockResolvedValueOnce([]) // overdueCandidates (INVOICE)
      .mockResolvedValueOnce([]) // stillOverdue
      .mockResolvedValueOnce([{ id: 'q_1', userId: 'u_1', number: 'QT-2026-001' }] as never) // expiredCandidates (QUOTE)
      .mockResolvedValueOnce([]); // expiringSoonQuotes
    prismaMock.invoice.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.notification.create.mockResolvedValueOnce({ id: 'n_3' } as never);

    const result = await sweepDeadlineAlerts(prismaMock, NOW);

    expect(prismaMock.invoice.findMany).toHaveBeenNthCalledWith(3, {
      where: { docType: 'QUOTE', status: 'SENT', dueDate: { lt: NOW } },
      select: { id: true, userId: true, number: true },
    });
    expect(prismaMock.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'q_1', status: 'SENT' },
      data: { status: 'EXPIRED' },
    });
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dedupeKey: 'quote-expired:q_1' }),
      }),
    );
    expect(result.quotesFlaggedExpired).toBe(1);
    expect(result.quoteNotifications).toBe(1);
  });

  it('skips the quote-expired notification when the row already flipped away from SENT (race)', async () => {
    prismaMock.invoice.findMany
      .mockResolvedValueOnce([]) // overdueCandidates
      .mockResolvedValueOnce([]) // stillOverdue
      .mockResolvedValueOnce([{ id: 'q_2', userId: 'u_1', number: 'QT-2026-002' }] as never)
      .mockResolvedValueOnce([]);
    prismaMock.invoice.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await sweepDeadlineAlerts(prismaMock, NOW);

    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    expect(result.quotesFlaggedExpired).toBe(0);
    expect(result.quoteNotifications).toBe(0);
  });

  it('reminds daily for a devis whose dueDate falls in the reminder window', async () => {
    const dueDate = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
    prismaMock.invoice.findMany
      .mockResolvedValueOnce([]) // overdueCandidates
      .mockResolvedValueOnce([]) // stillOverdue
      .mockResolvedValueOnce([]) // expiredCandidates
      .mockResolvedValueOnce([
        { id: 'q_3', userId: 'u_1', number: 'QT-2026-003', dueDate },
      ] as never); // expiringSoonQuotes
    prismaMock.notification.create.mockResolvedValueOnce({ id: 'n_4' } as never);

    const result = await sweepDeadlineAlerts(prismaMock, NOW);

    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dedupeKey: `quote-expiring-soon:q_3:${TODAY_KEY}` }),
      }),
    );
    expect(result.quoteReminderNotifications).toBe(1);
  });

  it('notifies for a non-DELIVERED project whose dueDate falls in the reminder window', async () => {
    const dueDate = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
    prismaMock.project.findMany.mockResolvedValueOnce([
      { id: 'p_1', userId: 'u_1', name: 'Refonte identité', dueDate },
    ] as never);
    prismaMock.notification.create.mockResolvedValueOnce({ id: 'n_2' } as never);

    const result = await sweepDeadlineAlerts(prismaMock, NOW);

    expect(prismaMock.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { notIn: ['DELIVERED', 'DRAFT'] } }),
      }),
    );
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dedupeKey: `project-deadline-soon:p_1:${TODAY_KEY}`,
        }),
      }),
    );
    expect(result.projectNotifications).toBe(1);
  });

  it('does not double-count when createNotification dedupes (P2002)', async () => {
    prismaMock.invoice.findMany
      .mockResolvedValueOnce([
        { id: 'inv_3', userId: 'u_1', number: '2026-003', amount: 2000, currency: 'XOF' },
      ] as never) // overdueCandidates
      .mockResolvedValueOnce([
        { id: 'inv_3', userId: 'u_1', number: '2026-003', amount: 2000, currency: 'XOF' },
      ] as never) // stillOverdue
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.invoice.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.notification.create.mockRejectedValueOnce({ code: 'P2002' });

    const result = await sweepDeadlineAlerts(prismaMock, NOW);

    expect(result.invoicesFlaggedOverdue).toBe(1);
    expect(result.invoiceNotifications).toBe(0);
  });
});
