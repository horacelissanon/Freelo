// GET + PATCH /api/settings/ui-prefs tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET, PATCH } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/settings/ui-prefs', { method: 'GET' });
}

function makePatch(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return body === undefined
    ? new NextRequest('http://test/api/settings/ui-prefs', { method: 'PATCH', headers })
    : new NextRequest('http://test/api/settings/ui-prefs', {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
});

describe('GET /api/settings/ui-prefs', () => {
  it('Test 1: no row exists → { prefs: {} }', async () => {
    prismaMock.uiPreferences.findUnique.mockResolvedValue(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ prefs: {} });
  });

  it('Test 2: row exists → returns existing prefs', async () => {
    prismaMock.uiPreferences.findUnique.mockResolvedValue({
      prefs: { theme: 'dark', sidebarShape: 'dock' },
    } as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ prefs: { theme: 'dark', sidebarShape: 'dock' } });
  });

  it('Test 3: requireAuth bail → 401', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(prismaMock.uiPreferences.findUnique).not.toHaveBeenCalled();
  });

  it('GET: scopes findUnique by userId: ctx.user.sub', async () => {
    prismaMock.uiPreferences.findUnique.mockResolvedValue(null);
    await GET(makeGet());
    const args = prismaMock.uiPreferences.findUnique.mock.calls[0]?.[0];
    expect(args?.where?.userId).toBe('user-1');
  });
});

describe('PATCH /api/settings/ui-prefs', () => {
  it('Test 4: missing CSRF header → 403', async () => {
    const res = await PATCH(makePatch({ theme: 'dark' }, { csrf: 'missing' }));
    expect(res.status).toBe(403);
    expect(prismaMock.uiPreferences.upsert).not.toHaveBeenCalled();
  });

  it('Test 5: no existing row + valid patch → upsert with the new value', async () => {
    prismaMock.uiPreferences.findUnique.mockResolvedValue(null);
    prismaMock.uiPreferences.upsert.mockResolvedValue({} as never);
    const res = await PATCH(makePatch({ theme: 'dark' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prefs).toEqual({ theme: 'dark' });

    const upsertArg = prismaMock.uiPreferences.upsert.mock.calls[0]?.[0];
    expect(upsertArg?.where?.userId).toBe('user-1');
    expect(upsertArg?.create?.userId).toBe('user-1');
    expect(upsertArg?.create?.prefs).toEqual({ theme: 'dark' });
    expect(upsertArg?.update?.prefs).toEqual({ theme: 'dark' });
  });

  it('Test 6: existing row → shallow-merges, leaves untouched keys alone', async () => {
    prismaMock.uiPreferences.findUnique.mockResolvedValue({
      prefs: { theme: 'light', sidebarShape: 'capsule' },
    } as never);
    prismaMock.uiPreferences.upsert.mockResolvedValue({} as never);
    const res = await PATCH(makePatch({ theme: 'dark' }));
    const body = await res.json();
    expect(body.prefs).toEqual({ theme: 'dark', sidebarShape: 'capsule' });
  });

  it('Test 7: invalid enum value → 400 VALIDATION_FAILED', async () => {
    const res = await PATCH(makePatch({ theme: 'blue' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.uiPreferences.upsert).not.toHaveBeenCalled();
  });

  it('Test 8: empty patch ({}) → upsert called; response equals existing prefs', async () => {
    prismaMock.uiPreferences.findUnique.mockResolvedValue({
      prefs: { theme: 'light' },
    } as never);
    prismaMock.uiPreferences.upsert.mockResolvedValue({} as never);
    const res = await PATCH(makePatch({}));
    const body = await res.json();
    expect(body.prefs).toEqual({ theme: 'light' });
    expect(prismaMock.uiPreferences.upsert).toHaveBeenCalledTimes(1);
  });

  it('Test 9: sidebarColor accepts explicit null (reset to default)', async () => {
    prismaMock.uiPreferences.findUnique.mockResolvedValue({
      prefs: { sidebarColor: '#112233' },
    } as never);
    prismaMock.uiPreferences.upsert.mockResolvedValue({} as never);
    const res = await PATCH(makePatch({ sidebarColor: null }));
    const body = await res.json();
    expect(body.prefs).toEqual({ sidebarColor: null });
  });

  it('Test 10: invalid hex for accentCustomHex → 400', async () => {
    const res = await PATCH(makePatch({ accentCustomHex: 'not-a-hex' }));
    expect(res.status).toBe(400);
  });

  it('PATCH: requireAuth bail → 401, no upsert', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await PATCH(makePatch({ theme: 'dark' }));
    expect(res.status).toBe(401);
    expect(prismaMock.uiPreferences.upsert).not.toHaveBeenCalled();
  });
});

describe('source invariants', () => {
  it("route source contains runtime='nodejs', verifyCsrf, withRequestContext", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('verifyCsrf(req)');
    expect(src).toContain('withRequestContext');
  });
});
