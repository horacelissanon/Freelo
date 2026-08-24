// PATCH /api/admin/settings tests. Mirrors admin/plans/[plan]/route.test.ts's
// CSRF/rate-limit/requireSuperadmin boilerplate. getAppSettings (the
// "existing row" lookup) is mocked directly rather than simulated through
// prismaMock's appSettings.upsert — its own upsert-on-read behavior isn't
// this route's concern.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

vi.mock('@/lib/server/middleware', () => ({
  requireSuperadmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/settings/appSettings', () => ({ getAppSettings: vi.fn() }));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { getAppSettings } from '@/lib/server/settings/appSettings';
import { PATCH } from './route';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);
const mockGetAppSettings = vi.mocked(getAppSettings);

const superadmin = seedSuperadmin({ id: 'superadmin-1', email: 'superadmin@test.local' });
const superadminCtx = {
  user: { sub: superadmin.id, email: superadmin.email },
  admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
};

function makePatch(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockGetAppSettings.mockResolvedValue({
    communityWhatsappUrl: null,
    updatedAt: '2026-08-25T00:00:00Z',
  });
});

describe('PATCH /api/admin/settings', () => {
  it('sets the community WhatsApp link and logs app_settings.update', async () => {
    prismaMock.appSettings.upsert.mockResolvedValue({
      id: 'default',
      communityWhatsappUrl: 'https://chat.whatsapp.com/real-invite',
      updatedAt: new Date('2026-08-25T00:00:00.000Z'),
    } as never);

    const res = await PATCH(
      makePatch({ communityWhatsappUrl: 'https://chat.whatsapp.com/real-invite' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.communityWhatsappUrl).toBe('https://chat.whatsapp.com/real-invite');

    expect(prismaMock.appSettings.upsert).toHaveBeenCalledWith({
      where: { id: 'default' },
      create: { id: 'default', communityWhatsappUrl: 'https://chat.whatsapp.com/real-invite' },
      update: { communityWhatsappUrl: 'https://chat.whatsapp.com/real-invite' },
    });
    expect(mockLogAdminAction).toHaveBeenCalledTimes(1);
    const call = mockLogAdminAction.mock.calls[0]?.[1];
    expect(call).toMatchObject({
      action: 'app_settings.update',
      targetType: 'AppSettings',
      targetId: 'default',
      metadata: {
        from: { communityWhatsappUrl: null },
        to: { communityWhatsappUrl: 'https://chat.whatsapp.com/real-invite' },
      },
    });
  });

  it('empty string clears the link back to null', async () => {
    mockGetAppSettings.mockResolvedValue({
      communityWhatsappUrl: 'https://chat.whatsapp.com/old',
      updatedAt: '2026-08-25T00:00:00Z',
    });
    prismaMock.appSettings.upsert.mockResolvedValue({
      id: 'default',
      communityWhatsappUrl: null,
      updatedAt: new Date('2026-08-25T00:00:00.000Z'),
    } as never);

    const res = await PATCH(makePatch({ communityWhatsappUrl: '' }));
    expect(res.status).toBe(200);
    expect(prismaMock.appSettings.upsert).toHaveBeenCalledWith({
      where: { id: 'default' },
      create: { id: 'default', communityWhatsappUrl: null },
      update: { communityWhatsappUrl: null },
    });
  });

  it('rejects a non-https link', async () => {
    const res = await PATCH(makePatch({ communityWhatsappUrl: 'not-a-url' }));
    expect(res.status).toBe(400);
    expect(prismaMock.appSettings.upsert).not.toHaveBeenCalled();
  });

  it('403s for ADMIN (SUPERADMIN-only)', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ communityWhatsappUrl: 'https://chat.whatsapp.com/x' }));
    expect(res.status).toBe(403);
    expect(prismaMock.appSettings.upsert).not.toHaveBeenCalled();
  });

  it('missing CSRF -> 403, no Prisma call', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_MISMATCH' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ communityWhatsappUrl: 'https://chat.whatsapp.com/x' }));
    expect(res.status).toBe(403);
    expect(prismaMock.appSettings.upsert).not.toHaveBeenCalled();
  });

  it('rate limited -> 429', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await PATCH(makePatch({ communityWhatsappUrl: 'https://chat.whatsapp.com/x' }));
    expect(res.status).toBe(429);
    expect(prismaMock.appSettings.upsert).not.toHaveBeenCalled();
  });
});
