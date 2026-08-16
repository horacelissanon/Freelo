// Shared project-creation core, extracted from POST /api/projects so the
// new "create project from an accepted devis" route (invoices/[id]/
// create-project) can reuse the exact same insert — including the default
// steps fallback — inside its own transaction, without duplicating this
// logic or changing POST /api/projects' behavior. Callers keep doing their
// own ownership/plan-limit checks; this function only inserts.
import 'server-only';
import type { Prisma } from '@prisma/client';
import type { ProjectType } from '@/lib/constants';
import { PROJECT_TYPE_DEFAULT_STEPS } from '@/lib/projectDefaults';

// Structurally satisfied by both the plain `prisma` client and a `tx`
// passed into `prisma.$transaction(async (tx) => ...)` — only the one
// delegate this needs.
type Db = Pick<Prisma.TransactionClient, 'project'>;

export interface CreateProjectInput {
  userId: string;
  clientId: string;
  name: string;
  sector: string;
  type: ProjectType;
  description?: string;
  // Callers always pass 'PENDING' — status is fully derived from step
  // completion from creation onward (see lib/server/projects/progress.ts),
  // never a freelance-chosen value. Typed against the full set for
  // completeness, not because other values are ever actually passed here.
  status: 'PENDING' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DELIVERED';
  progress: number;
  amount: number;
  currency: string;
  dueDate?: string;
  step?: string;
  steps?: { title: string; description?: string | undefined }[];
  // Deposit terms for this project (NONE | FIXED | PERCENT + depositValue).
  // Omitted -> the schema default (PERCENT, 50) applies.
  depositType?: 'NONE' | 'FIXED' | 'PERCENT';
  depositValue?: number;
}

export function createProject(db: Db, input: CreateProjectInput) {
  // Falls back to the type's professional-practice step template when the
  // caller doesn't supply a custom `steps` list — keeps the Client Link
  // Portal demoable out of the box, and matches what ProjectForm.tsx/
  // QuoteBuilderForm.tsx already pre-fill client-side for the same type so
  // a user who touches nothing gets identical behavior whichever creation
  // path they used.
  const fallbackSteps = PROJECT_TYPE_DEFAULT_STEPS[input.type] ?? PROJECT_TYPE_DEFAULT_STEPS.OTHER;
  return db.project.create({
    data: {
      userId: input.userId,
      clientId: input.clientId,
      name: input.name,
      sector: input.sector,
      type: input.type,
      status: input.status,
      progress: input.progress,
      amount: input.amount,
      currency: input.currency,
      ...(input.description ? { description: input.description } : {}),
      ...(input.dueDate ? { dueDate: new Date(input.dueDate) } : {}),
      ...(input.step ? { step: input.step } : {}),
      ...(input.depositType ? { depositType: input.depositType } : {}),
      ...(input.depositValue != null ? { depositValue: input.depositValue } : {}),
      steps: {
        create: input.steps
          ? input.steps.map((s, index) => ({
              order: index + 1,
              title: s.title,
              ...(s.description ? { description: s.description } : {}),
            }))
          : fallbackSteps.map((s, index) => ({
              order: index + 1,
              title: s.title,
              description: s.description,
            })),
      },
    },
  });
}
