import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deriveClientStatus } from './status';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deriveClientStatus', () => {
  it('at least one non-DRAFT project -> active', async () => {
    prismaMock.project.count.mockResolvedValue(1 as never);
    prismaMock.invoice.count.mockResolvedValue(0 as never);
    await expect(deriveClientStatus(prismaMock, 'c-1')).resolves.toBe('active');
    const projectArg = prismaMock.project.count.mock.calls[0]?.[0];
    expect(projectArg?.where).toEqual({ clientId: 'c-1', status: { not: 'DRAFT' } });
  });

  it('no project but an accepted devis -> pending', async () => {
    prismaMock.project.count.mockResolvedValue(0 as never);
    prismaMock.invoice.count.mockResolvedValue(1 as never);
    await expect(deriveClientStatus(prismaMock, 'c-1')).resolves.toBe('pending');
    const invoiceArg = prismaMock.invoice.count.mock.calls[0]?.[0];
    expect(invoiceArg?.where).toEqual({ clientId: 'c-1', docType: 'QUOTE', status: 'ACCEPTED' });
  });

  it('no project and no accepted devis -> new', async () => {
    prismaMock.project.count.mockResolvedValue(0 as never);
    prismaMock.invoice.count.mockResolvedValue(0 as never);
    await expect(deriveClientStatus(prismaMock, 'c-1')).resolves.toBe('new');
  });

  it('a non-DRAFT project outranks an accepted devis -> active, not pending', async () => {
    prismaMock.project.count.mockResolvedValue(1 as never);
    prismaMock.invoice.count.mockResolvedValue(1 as never);
    await expect(deriveClientStatus(prismaMock, 'c-1')).resolves.toBe('active');
    expect(prismaMock.invoice.count).not.toHaveBeenCalled();
  });
});
