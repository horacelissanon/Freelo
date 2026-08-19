// GET /api/admin/plans — Super Admin "Plans" listing. Read-only for ADMIN
// (same precedent as the other admin listings); editing is SUPERADMIN-only
// via PATCH /api/admin/plans/[plan] (real-money change).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getAllPlanConfigs } from '@/lib/server/billing/plans';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { free, pro } = await getAllPlanConfigs(prisma);
    return NextResponse.json(
      { free, pro },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
