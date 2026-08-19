import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getAllPlanConfigs = vi.fn();
vi.mock('@/lib/server/billing/plans', () => ({ getAllPlanConfigs }));
vi.mock('@/lib/server/prisma', () => ({ prisma: {} }));

describe('GET /api/plans', () => {
  it('returns free/pro plan config with no auth required', async () => {
    const plans = {
      free: {
        plan: 'FREE',
        monthlyAmount: null,
        yearlyAmount: null,
        currency: 'XOF',
        maxClients: 1,
        maxActiveProjects: 2,
        features: ['1 client'],
        updatedAt: '2026-08-18T00:00:00Z',
      },
      pro: {
        plan: 'PRO',
        monthlyAmount: 3500,
        yearlyAmount: 35000,
        currency: 'XOF',
        maxClients: null,
        maxActiveProjects: null,
        features: ['Clients illimités'],
        updatedAt: '2026-08-18T00:00:00Z',
      },
    };
    getAllPlanConfigs.mockResolvedValueOnce(plans);
    const { GET } = await import('./route');
    const res = await GET(new NextRequest('http://localhost/api/plans'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(plans);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
  });
});
