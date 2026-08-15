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

  it('notifies for a non-DELIVERED project whose dueDate falls in the reminder window', async () => {
    const dueDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    prismaMock.project.findMany.mockResolvedValueOnce([
      { id: 'p_1', userId: 'u_1', name: 'Refonte identité', dueDate },
    ] as never);
    prismaMock.notification.create.mockResolvedValueOnce({ id: 'n_2' } as never);

    const result = await sweepDeadlineAlerts(prismaMock);

    expect(prismaMock.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: 'DELIVERED' } }),
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
