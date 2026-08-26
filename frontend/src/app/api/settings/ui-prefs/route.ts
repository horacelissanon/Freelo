// GET + PATCH /api/settings/ui-prefs — cross-device sync for the
// Paramètres → Espace de travail personalization (theme, accent color,
// sidebar color/shape, mobile nav style, bottom nav glass). Same shape as
// /api/notifications/prefs (flat JSON map on a one-row-per-user table), but
// a shallow merge — unlike notification prefs there's no nested per-key
// object to merge field-by-field, just top-level string values.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const HEX = /^#[0-9a-fA-F]{6}$/;

const PatchBody = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  accent: z.enum(['green', 'blue', 'violet', 'orange', 'rose', 'slate', 'custom']).optional(),
  accentCustomHex: z.string().regex(HEX).optional(),
  sidebarColor: z.union([z.string().regex(HEX), z.null()]).optional(),
  sidebarShape: z.enum(['classic', 'capsule', 'dock']).optional(),
  mobileNavStyle: z.enum(['bottom', 'drawer']).optional(),
  bottomNavGlass: z.enum(['off', 'transparent', 'tinted']).optional(),
});

function readPrefs(raw: Prisma.JsonValue | undefined | null): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const row = await prisma.uiPreferences.findUnique({
      where: { userId: auth.user.sub },
      select: { prefs: true },
    });

    return NextResponse.json(
      { prefs: readPrefs(row?.prefs) },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existingRow = await prisma.uiPreferences.findUnique({
      where: { userId: auth.user.sub },
      select: { prefs: true },
    });
    const merged = { ...readPrefs(existingRow?.prefs), ...parsed.data };

    await prisma.uiPreferences.upsert({
      where: { userId: auth.user.sub },
      create: { userId: auth.user.sub, prefs: merged as unknown as Prisma.InputJsonValue },
      update: { prefs: merged as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json(
      { prefs: merged },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
