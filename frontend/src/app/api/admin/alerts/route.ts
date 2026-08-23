// GET /api/admin/alerts — Admin visibility (read-only, paginated) into
// AdminAlert rows. Mirrors GET /api/admin/outbox's shape (cursor pagination,
// status/kind-style filters) since both are platform-wide operational feeds
// an admin scans rather than a per-user list.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { AdminAlert, Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { prisma } from '@/lib/server/prisma';
import { buildPage, clampLimit, cursorWhere, decodeCursor } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const VALID_SEVERITIES: ReadonlySet<string> = new Set(['INFO', 'WARNING', 'CRITICAL']);

interface SerializedAdminAlert {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string;
  data: unknown;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

function serialize(a: AdminAlert): SerializedAdminAlert {
  return {
    id: a.id,
    type: a.type,
    severity: a.severity,
    title: a.title,
    body: a.body,
    data: a.data,
    acknowledgedAt: a.acknowledgedAt ? a.acknowledgedAt.toISOString() : null,
    acknowledgedBy: a.acknowledgedBy,
    resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const severityParam = url.searchParams.get('severity');
    const severity = severityParam && VALID_SEVERITIES.has(severityParam) ? severityParam : null;
    const type = url.searchParams.get('type');
    const acknowledgedParam = url.searchParams.get('acknowledged');
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.AdminAlertWhereInput = {
      ...(severity ? { severity } : {}),
      ...(type ? { type } : {}),
      ...(acknowledgedParam === 'true' ? { acknowledgedAt: { not: null } } : {}),
      ...(acknowledgedParam === 'false' ? { acknowledgedAt: null } : {}),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.adminAlert.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(
      { items: page.items.map(serialize), nextCursor: page.nextCursor },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
