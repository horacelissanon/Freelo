// Freelancer's own default payment methods (Paramètres → Facturation) — a
// single ordered list, replaced wholesale on save rather than exposing
// granular per-entry CRUD (no per-entry status/lifecycle to track, unlike
// ProjectStep). Consumed by QuoteBuilderForm (pre-fills a new devis' own
// PAYMENT_METHOD blocks) and GET /api/track/[token] (live fallback for
// anything with no copy of its own).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  methods: z
    .array(
      z.object({
        primaryText: z.string().min(1).max(100),
        secondaryText: z.string().max(200).optional(),
      }),
    )
    .max(10),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const methods = await prisma.defaultPaymentMethod.findMany({
      where: { userId: auth.user.sub },
      orderBy: { order: 'asc' },
      select: { id: true, primaryText: true, secondaryText: true },
    });

    return NextResponse.json({ methods }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const userId = auth.user.sub;
    const methods = await prisma.$transaction(async (tx) => {
      await tx.defaultPaymentMethod.deleteMany({ where: { userId } });
      if (parsed.data.methods.length === 0) return [];
      await tx.defaultPaymentMethod.createMany({
        data: parsed.data.methods.map((m, index) => ({
          userId,
          order: index + 1,
          primaryText: m.primaryText,
          ...(m.secondaryText ? { secondaryText: m.secondaryText } : {}),
        })),
      });
      return tx.defaultPaymentMethod.findMany({
        where: { userId },
        orderBy: { order: 'asc' },
        select: { id: true, primaryText: true, secondaryText: true },
      });
    });

    return NextResponse.json({ methods }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
