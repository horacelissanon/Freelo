import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getAppSettings = vi.fn();
vi.mock('@/lib/server/settings/appSettings', () => ({ getAppSettings }));
vi.mock('@/lib/server/prisma', () => ({ prisma: {} }));

describe('GET /api/settings', () => {
  it('returns site-wide settings with no auth required', async () => {
    const settings = {
      communityWhatsappUrl: 'https://chat.whatsapp.com/real-invite',
      updatedAt: '2026-08-25T00:00:00Z',
    };
    getAppSettings.mockResolvedValueOnce(settings);
    const { GET } = await import('./route');
    const res = await GET(new NextRequest('http://localhost/api/settings'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(settings);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
  });

  it('returns null communityWhatsappUrl when unset', async () => {
    getAppSettings.mockResolvedValueOnce({
      communityWhatsappUrl: null,
      updatedAt: '2026-08-25T00:00:00Z',
    });
    const { GET } = await import('./route');
    const res = await GET(new NextRequest('http://localhost/api/settings'));
    expect((await res.json()).communityWhatsappUrl).toBeNull();
  });
});
