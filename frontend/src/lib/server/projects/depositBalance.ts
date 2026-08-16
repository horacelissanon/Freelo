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

export async function computeDepositBalance(
  db: Db,
  project: { id: string; amount: number; depositType: string; depositValue: number },
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
  const invoiceSettled = Boolean(paidInvoice);
  return {
    deposit: {
      amount: depositAmount,
      paid: noDepositExpected || paidByKind.has('DEPOSIT') || invoiceSettled,
    },
    balance: { amount: balanceAmount, paid: paidByKind.has('BALANCE') || invoiceSettled },
  };
}
