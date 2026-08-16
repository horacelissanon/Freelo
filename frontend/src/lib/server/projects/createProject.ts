// Shared project-creation core, extracted from POST /api/projects so the
// new "create project from an accepted devis" route (invoices/[id]/
// create-project) can reuse the exact same insert — including the default
// steps fallback — inside its own transaction, without duplicating this
// logic or changing POST /api/projects' behavior. Callers keep doing their
// own ownership/plan-limit checks; this function only inserts.
import 'server-only';
import type { Prisma } from '@prisma/client';

// Structurally satisfied by both the plain `prisma` client and a `tx`
// passed into `prisma.$transaction(async (tx) => ...)` — only the one
// delegate this needs.
type Db = Pick<Prisma.TransactionClient, 'project'>;

export interface CreateProjectInput {
  userId: string;
  clientId: string;
  name: string;
  type: 'LOGO' | 'IDENTITY' | 'POSTER' | 'PACKAGING' | 'SOCIAL' | 'PRINT' | 'UI_WEB' | 'OTHER';
  description?: string;
  status: 'IN_PROGRESS' | 'PENDING' | 'DELIVERED';
  progress: number;
  amount: number;
  currency: string;
  dueDate?: string;
  step?: string;
  steps?: { title: string; description?: string | undefined }[];
}

// Generic lifecycle seeded when the caller doesn't supply a custom `steps`
// list — keeps the Client Link Portal demoable out of the box. Mirrors
// ProjectForm.tsx's client-side DEFAULT_STEPS so a user who touches
// nothing gets identical behavior whichever creation path they used.
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

export function createProject(db: Db, input: CreateProjectInput) {
  return db.project.create({
    data: {
      userId: input.userId,
      clientId: input.clientId,
      name: input.name,
      type: input.type,
      status: input.status,
      progress: input.progress,
      amount: input.amount,
      currency: input.currency,
      ...(input.description ? { description: input.description } : {}),
      ...(input.dueDate ? { dueDate: new Date(input.dueDate) } : {}),
      ...(input.step ? { step: input.step } : {}),
      steps: {
        create: input.steps
          ? input.steps.map((s, index) => ({
              order: index + 1,
              title: s.title,
              ...(s.description ? { description: s.description } : {}),
            }))
          : DEFAULT_STEPS,
      },
    },
  });
}
