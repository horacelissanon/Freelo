// Single source of truth for deriving Project.progress/status from its
// steps — mirrors the formula scripts/seed-demo.ts already used at seed
// time, now applied live whenever a step's completion state (or count)
// changes (see app/api/projects/[id]/steps/route.ts and .../[stepId]/route.ts).
import 'server-only';
import type { Prisma } from '@prisma/client';

export function computeProjectProgress(steps: { status: string }[]): number {
  if (steps.length === 0) return 0;
  const completed = steps.filter((s) => s.status === 'COMPLETED').length;
  return Math.round((completed / steps.length) * 100);
}

// Status is fully derived from step position, in both directions — no
// independent manual write path (see PATCH /api/projects/[id], which no
// longer accepts a `status` field). PENDING before anything is validated,
// DELIVERED once every step is, IN_REVIEW at the second-to-last step (the
// project is one step away from done), IN_PROGRESS anywhere strictly
// between the first and second-to-last. A 1-step project has no
// intermediate state (PENDING -> DELIVERED directly); a 2-step project has
// no IN_PROGRESS state (its first step IS the second-to-last).
export function computeProjectStatus(steps: { status: string }[]): string {
  const total = steps.length;
  const completed = steps.filter((s) => s.status === 'COMPLETED').length;
  if (completed === 0) return 'PENDING';
  if (completed === total) return 'DELIVERED';
  if (completed === total - 1) return 'IN_REVIEW';
  return 'IN_PROGRESS';
}

type Db = Pick<Prisma.TransactionClient, 'projectStep' | 'project'>;

// Called after any mutation that changes a project's step count or
// completion (add, delete, or toggle a step's status) — never after a pure
// reorder or title/description edit, which affect neither.
//
// DRAFT is the one status this function must never touch — it's the
// freelance's own choice (see PATCH /api/projects/[id]'s status field),
// not derived from steps. A DRAFT project's steps are edited as local form
// state inside ProjectForm, not through these live per-step routes, but the
// guard stays defensive in case that ever changes.
export async function recomputeProjectStepsState(db: Db, projectId: string): Promise<void> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { status: true },
  });
  if (project?.status === 'DRAFT') return;

  const steps = await db.projectStep.findMany({
    where: { projectId },
    select: { status: true },
  });
  await db.project.update({
    where: { id: projectId },
    data: {
      progress: computeProjectProgress(steps),
      status: computeProjectStatus(steps),
    },
  });
}
