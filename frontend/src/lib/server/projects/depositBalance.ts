// Shared acompte/solde derivation — extracted from GET /api/projects/[id]
// and GET /api/track/[token] (which had it duplicated verbatim, plus a third
// theoretical-only copy in track/[token]/pay/route.ts) so all three agree by
// construction instead of by comment-promise. Reads the actual PAID Order
// amount for each bucket (DEPOSIT/BALANCE) when one was recorded — a manually
// entered partial acompte (e.g. via the devis->projet flow) is reflected
// exactly, not silently overwritten by the theoretical deposit split.
//
// Also reconciles against a Facture: a freelance who marks a project-linked
// Invoice (docType INVOICE, never QUOTE) as PAID via the invoice detail page
// is declaring the whole project settled, even if no Order was ever created
// for it (e.g. the project predates the acompte-tracking system, or was
// billed in one lump sum instead of a deposit+balance split). Without this,
// a delivered, fully-invoiced, fully-paid project keeps showing "unpaid" on
// the client-facing tracking page forever.
import 'server-only';
import type { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'order' | 'invoice'>;

interface PaidOrderMeta {
  projectId?: string;
  docType?: 'DEPOSIT' | 'BALANCE';
}

export interface DepositBalance {
  deposit: { amount: number; paid: boolean };
  balance: { amount: number; paid: boolean };
}

// Mirrors InvoicePack's depositType/depositValue: NONE = nothing due upfront
// (the deposit bucket is trivially satisfied, everything is due as balance),
// FIXED = depositValue is a raw amount, PERCENT = depositValue is a 0-100 rate.
// Exported so callers that need the theoretical figure without a full
// paid-orders lookup (e.g. seeding the initial Order amount right after
// project creation) can reuse the exact same split instead of re-deriving it.
export function theoreticalDepositAmount(project: {
  amount: number;
  depositType: string;
  depositValue: number;
}): number {
  if (project.depositType === 'NONE') return 0;
  if (project.depositType === 'FIXED') return project.depositValue;
  return Math.round((project.amount * project.depositValue) / 100);
}

type ProjectDepositFields = {
  id: string;
  amount: number;
  depositType: string;
  depositValue: number;
};

// Pure per-project math, shared by the single-project (computeDepositBalance)
// and batched (computeDepositBalanceBatch) entry points below, so a list
// page's bulk computation can never silently drift from a detail page's.
function deriveDepositBalance(
  project: ProjectDepositFields,
  paidOrders: { amount: number; metadata: unknown }[],
  invoiceSettled: boolean,
): DepositBalance {
  const paidByKind = new Map<'DEPOSIT' | 'BALANCE', number>();
  for (const o of paidOrders) {
    const kind = (o.metadata as PaidOrderMeta | null)?.docType;
    if (kind === 'DEPOSIT' || kind === 'BALANCE') {
      paidByKind.set(kind, (paidByKind.get(kind) ?? 0) + o.amount);
    }
  }
  const noDepositExpected = project.depositType === 'NONE';
  const theoreticalDeposit = theoreticalDepositAmount(project);
  const depositAmount = paidByKind.get('DEPOSIT') ?? theoreticalDeposit;
  const balanceAmount = paidByKind.get('BALANCE') ?? Math.max(0, project.amount - depositAmount);
  return {
    deposit: {
      amount: depositAmount,
      paid: noDepositExpected || paidByKind.has('DEPOSIT') || invoiceSettled,
    },
    balance: { amount: balanceAmount, paid: paidByKind.has('BALANCE') || invoiceSettled },
  };
}

export async function computeDepositBalance(
  db: Db,
  project: ProjectDepositFields,
): Promise<DepositBalance> {
  const [paidOrders, paidInvoice] = await Promise.all([
    db.order.findMany({
      where: { status: 'PAID', metadata: { path: ['projectId'], equals: project.id } },
      select: { amount: true, metadata: true },
    }),
    db.invoice.findFirst({
      where: { projectId: project.id, docType: 'INVOICE', status: 'PAID' },
      select: { id: true },
    }),
  ]);
  return deriveDepositBalance(project, paidOrders, Boolean(paidInvoice));
}

// Bulk variant for list pages (GET /api/projects) — 2 queries total instead
// of 2×N. `order.metadata.projectId` is a JSON path, not a real column, so it
// can't use a plain `in` filter; an OR of per-id equals checks is the
// documented Prisma way to batch a JSON-path lookup across several ids in one
// round trip. `invoice.projectId` IS a real column, so that half uses `in`
// directly.
export async function computeDepositBalanceBatch(
  db: Db,
  projects: ProjectDepositFields[],
): Promise<Map<string, DepositBalance>> {
  if (projects.length === 0) return new Map();
  const ids = projects.map((p) => p.id);
  const [allPaidOrders, paidInvoices] = await Promise.all([
    db.order.findMany({
      where: {
        status: 'PAID',
        OR: ids.map((id) => ({ metadata: { path: ['projectId'], equals: id } })),
      },
      select: { amount: true, metadata: true },
    }),
    db.invoice.findMany({
      where: { projectId: { in: ids }, docType: 'INVOICE', status: 'PAID' },
      select: { projectId: true },
    }),
  ]);

  const ordersByProject = new Map<string, { amount: number; metadata: unknown }[]>();
  for (const order of allPaidOrders) {
    const projectId = (order.metadata as PaidOrderMeta | null)?.projectId;
    if (!projectId) continue;
    const bucket = ordersByProject.get(projectId);
    if (bucket) bucket.push(order);
    else ordersByProject.set(projectId, [order]);
  }
  const settledProjectIds = new Set(
    paidInvoices.map((i) => i.projectId).filter((id) => id != null),
  );

  const result = new Map<string, DepositBalance>();
  for (const project of projects) {
    result.set(
      project.id,
      deriveDepositBalance(
        project,
        ordersByProject.get(project.id) ?? [],
        settledProjectIds.has(project.id),
      ),
    );
  }
  return result;
}
