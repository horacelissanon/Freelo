import { describe, it, expect, beforeEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { sweepDeadlineAlerts } from './sweep';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
  prismaMock.invoice.findMany.mockResolvedValue([]);
  prismaMock.project.findMany.mockResolvedValue([]);
});

describe('sweepDeadlineAlerts', () => {
  it('flips a SENT invoice past dueDate to OVERDUE and notifies once', async () => {
    prismaMock.invoice.findMany.mockResolvedValueOnce([
      { id: 'inv_1', userId: 'u_1', number: '2026-001', amount: 50000, currency: 'XOF' },
    ] as never);
    prismaMock.invoice.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.notification.create.mockResolvedValueOnce({ id: 'n_1' } as never);

    const result = await sweepDeadlineAlerts(prismaMock);

    expect(prismaMock.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv_1', status: 'SENT' },
      data: { status: 'OVERDUE' },
    });
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dedupeKey: 'invoice-overdue:inv_1' }),
      }),
    );
    expect(result).toEqual({
      invoicesFlaggedOverdue: 1,
      invoiceNotifications: 1,
      quotesFlaggedExpired: 0,
      quoteNotifications: 0,
      projectNotifications: 0,
    });
  });

  it('skips the notification when the row already flipped away from SENT (race)', async () => {
    prismaMock.invoice.findMany.mockResolvedValueOnce([
      { id: 'inv_2', userId: 'u_1', number: '2026-002', amount: 1000, currency: 'XOF' },
    ] as never);
    prismaMock.invoice.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await sweepDeadlineAlerts(prismaMock);

    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    expect(result.invoicesFlaggedOverdue).toBe(0);
    expect(result.invoiceNotifications).toBe(0);
  });

  it('flips a SENT quote past dueDate to EXPIRED and notifies once', async () => {
    prismaMock.invoice.findMany
      .mockResolvedValueOnce([]) // overdueCandidates (INVOICE)
      .mockResolvedValueOnce([{ id: 'q_1', userId: 'u_1', number: 'QT-2026-001' }] as never); // expiredCandidates (QUOTE)
    prismaMock.invoice.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.notification.create.mockResolvedValueOnce({ id: 'n_3' } as never);

    const result = await sweepDeadlineAlerts(prismaMock);

    expect(prismaMock.invoice.findMany).toHaveBeenNthCalledWith(2, {
      where: { docType: 'QUOTE', status: 'SENT', dueDate: { lt: expect.any(Date) } },
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
      .mockResolvedValueOnce([{ id: 'q_2', userId: 'u_1', number: 'QT-2026-002' }] as never);
    prismaMock.invoice.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await sweepDeadlineAlerts(prismaMock);

    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    expect(result.quotesFlaggedExpired).toBe(0);
    expect(result.quoteNotifications).toBe(0);
  });

  it('notifies for a non-DELIVERED project whose dueDate falls in the reminder window', async () => {
    const dueDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    prismaMock.project.findMany.mockResolvedValueOnce([
      { id: 'p_1', userId: 'u_1', name: 'Refonte identité', dueDate },
    ] as never);
    prismaMock.notification.create.mockResolvedValueOnce({ id: 'n_2' } as never);

    const result = await sweepDeadlineAlerts(prismaMock);

    expect(prismaMock.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { notIn: ['DELIVERED', 'DRAFT'] } }),
      }),
    );
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dedupeKey: `project-deadline-soon:p_1:${dueDate.toISOString().slice(0, 10)}`,
        }),
      }),
    );
    expect(result.projectNotifications).toBe(1);
  });

  it('does not double-count when createNotification dedupes (P2002)', async () => {
    prismaMock.invoice.findMany.mockResolvedValueOnce([
      { id: 'inv_3', userId: 'u_1', number: '2026-003', amount: 2000, currency: 'XOF' },
    ] as never);
    prismaMock.invoice.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.notification.create.mockRejectedValueOnce({ code: 'P2002' });

    const result = await sweepDeadlineAlerts(prismaMock);

    expect(result.invoicesFlaggedOverdue).toBe(1);
    expect(result.invoiceNotifications).toBe(0);
  });
});
