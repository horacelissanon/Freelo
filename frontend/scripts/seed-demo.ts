// One-off dev seed: populates an EXISTING real user account with the demo
// dataset from data.json (repo root) — 7 clients, 7 projects with steps,
// 2 devis, 5 factures, 2 comments — so the UI has realistic content to
// click through. Distinct from seed-dev.ts (which creates throwaway auth
// test users): this seeds business data onto a real, already-signed-up
// account.
//
// Usage: pnpm seed:demo [email]
// Defaults to lissanonpren@gmail.com if no email is given.
//
// Idempotent — reruns skip rows that already exist instead of duplicating:
//   - clients matched by (userId, name)
//   - projects matched by (userId, clientId, name)
//   - invoices matched by (userId, clientId, projectId, docType, amount)
//   - comments matched by (projectId, body)
//
// Invoice numbers are generated with the app's own sequential-per-year
// convention (see src/app/api/invoices/route.ts's `formatNumber`), not
// data.json's literal "DV-009"/"FAC-014" strings — those are Banani mock
// IDs, not real app-issued numbers.
//
// Fields present in data.json but not in the Prisma schema — client
// country, project description/closedAt/dechargeSignedAt, invoice
// recurring/paymentMethod/seenAt, itemized line items — are intentionally
// dropped rather than added as new columns (design adaptation, not a
// schema/spec change; see CLAUDE.md).

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_EMAIL = 'lissanonpren@gmail.com';

interface DataJson {
  clients: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    city: string | null;
    notes: string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    clientId: string;
    status: string;
    dueDate: string;
    shareToken: string;
    steps: Array<{ label: string; status: string }>;
  }>;
  devis: Array<{
    id: string;
    clientId: string;
    projectId: string;
    status: string;
    createdAt: string;
    lines: Array<{ qty: number; unitPrice: number }>;
  }>;
  factures: Array<{
    id: string;
    clientId: string;
    projectId: string;
    status: string;
    createdAt: string;
    lines: Array<{ qty: number; unitPrice: number }>;
  }>;
  comments: Array<{
    id: string;
    projectId: string;
    text: string;
    createdAt: string;
  }>;
}

function loadData(): DataJson {
  const raw = readFileSync(join(__dirname, '..', '..', 'data.json'), 'utf-8');
  return JSON.parse(raw) as DataJson;
}

const PROJECT_STATUS_MAP: Record<string, string> = {
  en_cours: 'IN_PROGRESS',
  termine: 'DELIVERED',
  en_attente: 'PENDING',
};

const STEP_STATUS_MAP: Record<string, string> = {
  termine: 'COMPLETED',
  en_cours: 'IN_PROGRESS',
  a_faire: 'PENDING',
};

const QUOTE_STATUS_MAP: Record<string, string> = {
  en_attente: 'SENT',
  accepte: 'ACCEPTED',
};

const INVOICE_STATUS_MAP: Record<string, string> = {
  envoyee: 'SENT',
  payee: 'PAID',
  en_retard: 'OVERDUE',
};

// Mirrors src/app/api/invoices/route.ts's formatNumber exactly, so seeded
// numbers look identical to ones the app itself would issue.
function formatNumber(docType: 'INVOICE' | 'QUOTE', year: number, seq: number): string {
  const padded = String(seq).padStart(3, '0');
  return docType === 'QUOTE' ? `QT-${year}-${padded}` : `${year}-${padded}`;
}

// Mirrors src/app/api/clients/route.ts's formatClientCode exactly.
function formatClientCode(seq: number): string {
  return `CL-${String(seq).padStart(4, '0')}`;
}

function sumLines(lines: Array<{ qty: number; unitPrice: number }>): number {
  return lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function parseRelativeDays(s: string): Date {
  const match = /il y a (\d+) j/.exec(s);
  return daysAgo(match?.[1] ? Number(match[1]) : 0);
}

interface SeedDeps {
  prisma?: PrismaClient;
}

export async function main(args: string[] = [], deps: SeedDeps = {}): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed-demo in production.');
    process.exit(1);
  }

  const email = args[0] ?? DEFAULT_EMAIL;
  const data = loadData();
  const prisma = deps.prisma ?? new PrismaClient();

  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      console.error(`No user found with email ${email}. Sign up (and verify) that account first.`);
      process.exit(1);
    }
    const userId = user.id;

    let clientSeq = await prisma.client.count({ where: { userId } });

    const clientIdMap = new Map<string, string>();
    for (const c of data.clients) {
      let row = await prisma.client.findFirst({ where: { userId, name: c.name } });
      if (!row) {
        clientSeq += 1;
        row = await prisma.client.create({
          data: {
            userId,
            code: formatClientCode(clientSeq),
            name: c.name,
            email: c.email,
            phone: c.phone,
            company: c.company,
            city: c.city,
            notes: c.notes || null,
            status: c.notes.toLowerCase().includes('prospect') ? 'pending' : 'active',
          },
        });
        console.log(`✓ client created: ${row.name}`);
      } else {
        console.log(`= client exists: ${row.name}`);
      }
      clientIdMap.set(c.id, row.id);
    }

    const projectIdMap = new Map<string, string>();
    for (const p of data.projects) {
      const clientId = clientIdMap.get(p.clientId);
      if (!clientId) throw new Error(`Unresolved clientId ${p.clientId} on project ${p.id}`);

      let row = await prisma.project.findFirst({ where: { userId, clientId, name: p.name } });
      if (!row) {
        const completed = p.steps.filter((s) => s.status === 'termine').length;
        const total = p.steps.length;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
        const currentStep = p.steps.find((s) => s.status !== 'termine');
        const status = PROJECT_STATUS_MAP[p.status] ?? 'IN_PROGRESS';

        // Schema has no standalone project budget field — derive amount
        // from whichever devis/facture is linked to this project.
        const linkedDoc =
          data.factures.find((f) => f.projectId === p.id) ??
          data.devis.find((d) => d.projectId === p.id);
        const amount = linkedDoc ? sumLines(linkedDoc.lines) : 0;

        row = await prisma.project.create({
          data: {
            userId,
            clientId,
            name: p.name,
            status,
            progress,
            amount,
            currency: 'XOF',
            dueDate: new Date(p.dueDate),
            step: status === 'DELIVERED' ? null : (currentStep?.label ?? null),
            publicToken: p.shareToken,
          },
        });
        console.log(`✓ project created: ${row.name} (${amount} XOF, ${progress}%)`);

        for (const [i, s] of p.steps.entries()) {
          const stepStatus = STEP_STATUS_MAP[s.status] ?? 'PENDING';
          await prisma.projectStep.create({
            data: {
              projectId: row.id,
              order: i + 1,
              title: s.label,
              status: stepStatus,
              completedAt: stepStatus === 'COMPLETED' ? new Date() : null,
            },
          });
        }
        console.log(`  + ${p.steps.length} steps`);
      } else {
        console.log(`= project exists: ${row.name}`);
      }
      projectIdMap.set(p.id, row.id);
    }

    const year = new Date().getFullYear();
    let quoteSeq = await prisma.invoice.count({ where: { userId, docType: 'QUOTE' } });
    let invoiceSeq = await prisma.invoice.count({ where: { userId, docType: 'INVOICE' } });

    const devisSorted = [...data.devis].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const d of devisSorted) {
      const clientId = clientIdMap.get(d.clientId);
      const projectId = projectIdMap.get(d.projectId);
      if (!clientId || !projectId) throw new Error(`Unresolved refs on devis ${d.id}`);
      const amount = sumLines(d.lines);

      const existing = await prisma.invoice.findFirst({
        where: { userId, clientId, projectId, docType: 'QUOTE', amount },
      });
      if (existing) {
        console.log(`= devis exists: ${existing.number}`);
        continue;
      }

      quoteSeq += 1;
      const invoice = await prisma.invoice.create({
        data: {
          userId,
          clientId,
          projectId,
          docType: 'QUOTE',
          number: formatNumber('QUOTE', year, quoteSeq),
          amount,
          currency: 'XOF',
          status: QUOTE_STATUS_MAP[d.status] ?? 'DRAFT',
          issueDate: new Date(d.createdAt),
        },
      });
      console.log(`✓ devis created: ${invoice.number} (${amount} XOF)`);
    }

    const facturesSorted = [...data.factures].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    for (const f of facturesSorted) {
      const clientId = clientIdMap.get(f.clientId);
      const projectId = projectIdMap.get(f.projectId);
      if (!clientId || !projectId) throw new Error(`Unresolved refs on facture ${f.id}`);
      const amount = sumLines(f.lines);

      const existing = await prisma.invoice.findFirst({
        where: { userId, clientId, projectId, docType: 'INVOICE', amount },
      });
      if (existing) {
        console.log(`= facture exists: ${existing.number}`);
        continue;
      }

      invoiceSeq += 1;
      const invoice = await prisma.invoice.create({
        data: {
          userId,
          clientId,
          projectId,
          docType: 'INVOICE',
          number: formatNumber('INVOICE', year, invoiceSeq),
          amount,
          currency: 'XOF',
          status: INVOICE_STATUS_MAP[f.status] ?? 'DRAFT',
          issueDate: new Date(f.createdAt),
        },
      });
      console.log(`✓ facture created: ${invoice.number} (${amount} XOF)`);
    }

    for (const c of data.comments) {
      const projectId = projectIdMap.get(c.projectId);
      if (!projectId) throw new Error(`Unresolved projectId ${c.projectId} on comment ${c.id}`);

      const existing = await prisma.projectComment.findFirst({
        where: { projectId, body: c.text },
      });
      if (existing) {
        console.log(`= comment exists on project ${c.projectId}`);
        continue;
      }

      await prisma.projectComment.create({
        data: {
          projectId,
          author: 'CLIENT',
          body: c.text,
          createdAt: parseRelativeDays(c.createdAt),
        },
      });
      console.log(`✓ comment created on project ${c.projectId}`);
    }

    console.log('\nDone.');
  } finally {
    if (!deps.prisma) {
      await prisma.$disconnect();
    }
  }
}

// pathToFileURL (not `file://${process.argv[1]}`) — plain string
// concatenation never matches on Windows, where argv[1] uses backslashes
// and lacks the triple-slash file:// prefix import.meta.url produces.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
