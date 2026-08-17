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
import { deriveClientStatus } from '@/lib/server/clients/status';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CLIENT_STATUSES = ['new', 'pending', 'active', 'archived'] as const;

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
            projectId: true,
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

    // 'archived' is the one status a freelance actually chooses (the
    // "Archiver" button); anything else in the request is really just an
    // "un-archive" intent (the "Réactiver" button sends 'active' without
    // knowing whether the client really has a project yet) — resolved to
    // the true, live-derived state instead of trusting the literal value,
    // so reactivating never fabricates a status the data doesn't support.
    const resolvedStatus =
      status === undefined
        ? undefined
        : status === 'archived'
          ? 'archived'
          : await deriveClientStatus(prisma, id);

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
        ...(resolvedStatus !== undefined ? { status: resolvedStatus } : {}),
      },
    });

    return NextResponse.json(client, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}

// Client/Project and Client/Invoice both cascade-delete at the DB level
// (schema.prisma), so this guard is the only thing standing between
// "delete this client" and silently wiping their whole project/devis/
// facture history. Only a client with zero links in the system — the
// freelance's own words — may actually be deleted; everyone else can only
// be archived.
export async function DELETE(
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
      select: { id: true, _count: { select: { projects: true, invoices: true } } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'CLIENT_NOT_FOUND', message: 'Client does not exist or does not belong to you' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (existing._count.projects > 0 || existing._count.invoices > 0) {
      return NextResponse.json(
        {
          error: 'CLIENT_HAS_LINKED_RECORDS',
          message:
            'Ce client a des projets, devis ou factures liés — archive-le plutôt que de le supprimer.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.client.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
