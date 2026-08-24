// Public, unauthenticated on purpose — site-wide settings like the
// community WhatsApp link aren't sensitive data, and both anonymous
// visitors (landing page) and logged-in freelancers (dashboard banner) need
// it without assuming a session. Mirrors api/plans/route.ts's pattern —
// same reasoning, same shape. Super Admin editing here (via PATCH
// /api/admin/settings) takes effect for every consumer at once.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { getAppSettings } from '@/lib/server/settings/appSettings';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const settings = await getAppSettings(prisma);
    return NextResponse.json(settings, {
      headers: { 'x-request-id': ctx.requestId, 'Cache-Control': 'public, max-age=300' },
    });
  });
}
