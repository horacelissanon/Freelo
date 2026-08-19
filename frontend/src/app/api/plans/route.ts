// Public, unauthenticated on purpose — subscription pricing isn't sensitive
// data, and both anonymous visitors (landing page) and logged-in freelancers
// (Paramètres → Abonnement) need it without assuming a session. Mirrors
// api/fx-rates/route.ts's pattern. This is the single canonical read
// surface for PlanConfig — Super Admin editing here (via
// PATCH /api/admin/plans/[plan]) takes effect for every consumer at once.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { getAllPlanConfigs } from '@/lib/server/billing/plans';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const { free, pro } = await getAllPlanConfigs(prisma);
    return NextResponse.json(
      { free, pro },
      { headers: { 'x-request-id': ctx.requestId, 'Cache-Control': 'public, max-age=300' } },
    );
  });
}
