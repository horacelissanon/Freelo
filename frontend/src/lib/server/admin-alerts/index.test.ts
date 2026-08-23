// Companion unit test for `admin-alerts/index.ts::createAdminAlert` — mirrors
// notifications/index.ts::createNotification's test (TEST-02): the
// AdminAlert.dedupeKey @unique catch is centralized here.
//
// Asserts:
//   1. valid input creates an AdminAlert row with the expected `data` shape.
//   2. P2002 (unique-violation on dedupeKey) is caught and returns null.
//   3. non-P2002 errors re-throw to the caller.
import { describe, it, expect, beforeEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { createAdminAlert } from './index';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => mockReset(prismaMock));

const baseInput = {
  type: 'payments.circuit_open',
  severity: 'CRITICAL' as const,
  title: 'Circuit open',
  body: 'The bictorys.charge breaker is open.',
  dedupeKey: 'circuit-open:bictorys.charge:12345',
};

describe('createAdminAlert', () => {
  it('creates an AdminAlert row when input is valid', async () => {
    const created = { id: 'a_1', ...baseInput, data: null, createdAt: new Date() };
    prismaMock.adminAlert.create.mockResolvedValue(created as never);

    const out = await createAdminAlert(prismaMock, baseInput);

    expect(out).toEqual(created);
    expect(prismaMock.adminAlert.create).toHaveBeenCalledOnce();
    const arg = prismaMock.adminAlert.create.mock.calls[0]?.[0];
    expect(arg?.data).toMatchObject({
      type: 'payments.circuit_open',
      severity: 'CRITICAL',
      title: 'Circuit open',
      body: 'The bictorys.charge breaker is open.',
      dedupeKey: 'circuit-open:bictorys.charge:12345',
    });
  });

  it('returns null silently when prisma throws P2002 (dedupeKey collision)', async () => {
    const p2002 = Object.assign(
      new Error('Unique constraint failed on the fields: (`dedupeKey`)'),
      { code: 'P2002', name: 'PrismaClientKnownRequestError' },
    );
    prismaMock.adminAlert.create.mockRejectedValueOnce(p2002 as never);

    const out = await createAdminAlert(prismaMock, baseInput);

    expect(out).toBeNull();
  });

  it('rethrows non-P2002 errors so callers can decide whether to retry', async () => {
    const generic = new Error('connection lost');
    prismaMock.adminAlert.create.mockRejectedValueOnce(generic as never);

    await expect(createAdminAlert(prismaMock, baseInput)).rejects.toThrow('connection lost');
  });

  it('forwards optional `data` payload through to prisma when provided', async () => {
    const created = {
      id: 'a_2',
      ...baseInput,
      data: { breakerName: 'bictorys.charge' },
      createdAt: new Date(),
    };
    prismaMock.adminAlert.create.mockResolvedValue(created as never);

    await createAdminAlert(prismaMock, { ...baseInput, data: { breakerName: 'bictorys.charge' } });

    const arg = prismaMock.adminAlert.create.mock.calls[0]?.[0];
    expect(arg?.data?.data).toEqual({ breakerName: 'bictorys.charge' });
  });
});
