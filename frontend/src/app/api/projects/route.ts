// Freelance CRM (Banani "Espace Freelance Merrudit" import, Phase A —
// see .planning/banani/IMPLEMENTATION-PLAN.md). GET list (cursor
// pagination) + POST create. `clientId` must belong to the caller —
// checked at create time so a user can't attach a project to someone
// else's client.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, decodeCursor, cursorWhere, buildPage } from '@/lib/server/pagination/paginate';
import {
  getOrCreateSubscription,
  isProActive,
  FREE_PLAN_LIMITS,
} from '@/lib/server/billing/subscription';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1).max(200),
  type: z
    .enum(['LOGO', 'IDENTITY', 'POSTER', 'PACKAGING', 'SOCIAL', 'PRINT', 'UI_WEB', 'OTHER'])
    .default('OTHER'),
  description: z.string().max(2000).optional(),
  status: z.enum(['IN_PROGRESS', 'PENDING', 'DELIVERED']).default('IN_PROGRESS'),
  progress: z.number().int().min(0).max(100).default(0),
  amount: z.number().int().positive(),
  currency: z.string().length(3).default('XOF'),
  dueDate: z.string().datetime().optional(),
  step: z.string().max(200).optional(),
  steps: z
    .array(
      z.object({ title: z.string().min(1).max(200), description: z.string().max(500).optional() }),
    )
    .min(1)
    .max(20)
    .optional(),
});

// Generic lifecycle seeded on every new project when the caller doesn't
// supply a custom `steps` list (e.g. an older client, or the seed script) —
// keeps the Client Link Portal (Phase C) demoable out of the box rather than
// showing an empty "Étapes" section on day one.
const DEFAULT_STEPS: { order: number; title: string; description: string }[] = [
  {
    order: 1,
    title: 'Brief & découverte',
    description: 'Collecte de vos informations et objectifs',
  },
  { order: 2, title: 'Premiers concepts', description: 'Premières propositions à valider' },
  { order: 3, title: 'Révisions', description: 'Ajustements selon vos retours' },
  { order: 4, title: 'Livraison finale', description: 'Remise des fichiers finaux' },
];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    const status = url.searchParams.get('status');
    const clientId = url.searchParams.get('clientId');

    const where: Prisma.ProjectWhereInput = {
      userId: auth.user.sub,
      ...(status ? { status } : {}),
      ...(clientId ? { clientId } : {}),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.project.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(buildPage(rows, limit), {
      headers: { 'x-request-id': ctx.requestId },
    });
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

    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, userId: auth.user.sub },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json(
        { error: 'CLIENT_NOT_FOUND', message: 'Client does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const subscription = await getOrCreateSubscription(prisma, auth.user.sub);
    if (!isProActive(subscription)) {
      if (parsed.data.currency !== 'XOF') {
        return NextResponse.json(
          {
            error: 'PLAN_LIMIT_CURRENCY',
            message: 'Le plan Gratuit ne permet que la devise XOF. Passe en Pro pour EUR/USD.',
          },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      const activeProjectCount = await prisma.project.count({
        where: { userId: auth.user.sub, status: 'IN_PROGRESS' },
      });
      if (activeProjectCount >= FREE_PLAN_LIMITS.maxActiveProjects) {
        return NextResponse.json(
          {
            error: 'PLAN_LIMIT_PROJECTS',
            message: `Le plan Gratuit est limité à ${FREE_PLAN_LIMITS.maxActiveProjects} projets actifs. Passe en Pro pour en créer davantage.`,
          },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const project = await prisma.project.create({
      data: {
        userId: auth.user.sub,
        clientId: parsed.data.clientId,
        name: parsed.data.name,
        type: parsed.data.type,
        status: parsed.data.status,
        progress: parsed.data.progress,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        ...(parsed.data.description ? { description: parsed.data.description } : {}),
        ...(parsed.data.dueDate ? { dueDate: new Date(parsed.data.dueDate) } : {}),
        ...(parsed.data.step ? { step: parsed.data.step } : {}),
        steps: {
          create: parsed.data.steps
            ? parsed.data.steps.map((s, index) => ({
                order: index + 1,
                title: s.title,
                ...(s.description ? { description: s.description } : {}),
              }))
            : DEFAULT_STEPS,
        },
      },
    });

    return NextResponse.json(project, { status: 201, headers: { 'x-request-id': ctx.requestId } });
  });
}
