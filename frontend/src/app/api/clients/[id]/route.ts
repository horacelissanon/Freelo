// Freelance CRM — single-client detail (Phase A follow-up: the dashboard
// linked to /clients/[id] from day one but this route didn't exist, so the
// page 404'd). Scoped to `auth.user.sub` like the list route — a client
// belonging to another user resolves as 404, not 403, to avoid leaking
// existence.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CLIENT_STATUSES = ['active', 'pending', 'archived'] as const;

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  contactName: z.string().max(200).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  company: z.string().max(200).nullable().optional(),
  website: z.string().url().max(300).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  sector: z.string().max(60).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  status: z.enum(CLIENT_STATUSES).optional(),
});

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    const client = await prisma.client.findFirst({
      where: { id, userId: auth.user.sub },
      include: {
        projects: {
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true,
            name: true,
            status: true,
            progress: true,
            amount: true,
            currency: true,
            step: true,
            dueDate: true,
            publicToken: true,
          },
        },
        invoices: {
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true,
            number: true,
            docType: true,
            status: true,
            amount: true,
            currency: true,
            dueDate: true,
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json(
        { error: 'CLIENT_NOT_FOUND', message: 'Client does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(client, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    const existing = await prisma.client.findFirst({
      where: { id, userId: auth.user.sub },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'CLIENT_NOT_FOUND', message: 'Client does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const {
      name,
      contactName,
      email,
      phone,
      company,
      website,
      city,
      sector,
      notes,
      imageUrl,
      status,
    } = parsed.data;

    const client = await prisma.client.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(contactName !== undefined ? { contactName } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(company !== undefined ? { company } : {}),
        ...(website !== undefined ? { website } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(sector !== undefined ? { sector } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(imageUrl !== undefined ? { imageUrl } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });

    return NextResponse.json(client, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
