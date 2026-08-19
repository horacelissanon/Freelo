// Freelance CRM (Banani "Espace Freelance Merrudit" import, Phase A —
// see .planning/banani/IMPLEMENTATION-PLAN.md). GET list (cursor
// pagination, shared helper) + POST create. Every row is scoped to
// `auth.user.sub` (single-tenant — no Organization involved).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, decodeCursor, cursorWhere, buildPage } from '@/lib/server/pagination/paginate';
import { getOrCreateSubscription, isProActive } from '@/lib/server/billing/subscription';
import { getPlanConfig } from '@/lib/server/billing/plans';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getDefaultCurrency } from '@/lib/server/fx/validateExchangeRate';
import { getCachedRates } from '@/lib/server/fx/rates';
import { sumConverted } from '@/lib/server/fx/convert';

const Body = z.object({
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  company: z.string().max(200).optional(),
  website: z.string().url().max(300).optional(),
  city: z.string().max(120).optional(),
  sector: z.string().max(60).optional(),
  notes: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
});

const MAX_CODE_RETRIES = 3;

// "CL-0001" — sequential per user, disambiguates clients sharing the same
// name. Same count()+retry-on-P2002 pattern as Invoice.number (see
// /api/invoices), since the `@@unique` constraint is the real safety net.
function formatClientCode(seq: number): string {
  return `CL-${String(seq).padStart(4, '0')}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    const status = url.searchParams.get('status');

    const where: Prisma.ClientWhereInput = {
      userId: auth.user.sub,
      ...(status ? { status } : {}),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.client.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        _count: { select: { projects: true } },
        // Bounded existence check (not a real list — `select: { id: true }`
        // only) so the "Clients actifs" cadran can mean something real: has
        // at least one non-draft, non-delivered project right now. Separate
        // from `_count.projects` above (a plain total, still used for the
        // "Plus de projets" sort) since Prisma can't filter the same
        // relation twice within one `_count.select`.
        projects: {
          where: { status: { notIn: ['DRAFT', 'DELIVERED'] } },
          select: { id: true },
        },
      },
    });

    // Portfolio-wide, not scoped to the current page/cursor slice — "how
    // much have I actually earned from my clients" is meant to answer that
    // question for the whole client base, not just the 50 most recent rows.
    const [defaultCurrency, liveRates, revenueRows] = await Promise.all([
      getDefaultCurrency(prisma, auth.user.sub),
      getCachedRates(),
      prisma.invoice.findMany({
        where: { userId: auth.user.sub, docType: 'INVOICE', status: 'PAID' },
        select: { amount: true, currency: true, exchangeRateToDefault: true },
      }),
    ]);
    // sumConverted takes a plain numeric rates record — CachedFxRates also
    // carries `fetchedAt: string`, which isn't a rate.
    const rates: Record<string, number> = {
      XOF: liveRates.XOF,
      EUR: liveRates.EUR,
      USD: liveRates.USD,
    };
    const revenue = sumConverted(revenueRows, defaultCurrency, rates);

    return NextResponse.json(
      {
        ...buildPage(rows, limit),
        totalRevenue: revenue.amountDefault,
        totalRevenueCurrency: defaultCurrency,
        totalRevenueByCurrency: revenue.amountsByCurrency,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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

    const subscription = await getOrCreateSubscription(prisma, auth.user.sub);
    if (!isProActive(subscription)) {
      const freeConfig = await getPlanConfig(prisma, 'FREE');
      const maxClients = freeConfig.maxClients ?? Infinity;
      const clientCount = await prisma.client.count({ where: { userId: auth.user.sub } });
      if (clientCount >= maxClients) {
        return NextResponse.json(
          {
            error: 'PLAN_LIMIT_CLIENTS',
            message: `Le plan Gratuit est limité à ${maxClients} client. Passe en Pro pour en ajouter davantage.`,
          },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    let client = null;
    for (let attempt = 0; attempt < MAX_CODE_RETRIES && !client; attempt++) {
      const count = await prisma.client.count({ where: { userId: auth.user.sub } });
      const code = formatClientCode(count + 1 + attempt);

      try {
        client = await prisma.client.create({
          data: {
            userId: auth.user.sub,
            code,
            name: parsed.data.name,
            ...(parsed.data.contactName ? { contactName: parsed.data.contactName } : {}),
            ...(parsed.data.email ? { email: parsed.data.email } : {}),
            ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
            ...(parsed.data.company ? { company: parsed.data.company } : {}),
            ...(parsed.data.website ? { website: parsed.data.website } : {}),
            ...(parsed.data.city ? { city: parsed.data.city } : {}),
            ...(parsed.data.sector ? { sector: parsed.data.sector } : {}),
            ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
            ...(parsed.data.imageUrl ? { imageUrl: parsed.data.imageUrl } : {}),
          },
        });
      } catch (err) {
        const isUniqueConflict =
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: unknown }).code === 'P2002';
        if (!isUniqueConflict) throw err;
        // retry with a higher sequence number on the next loop iteration
      }
    }
    if (!client) {
      return NextResponse.json(
        { error: 'CODE_GENERATION_FAILED', message: 'Could not generate a unique client code' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(client, { status: 201, headers: { 'x-request-id': ctx.requestId } });
  });
}
