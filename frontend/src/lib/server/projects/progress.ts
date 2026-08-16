// Single source of truth for deriving Project.progress from its steps —
// mirrors the formula scripts/seed-demo.ts already used at seed time, now
// applied live whenever a step's completion state changes (see
// app/api/projects/[id]/steps/[stepId]/route.ts).
import 'server-only';

export function computeProjectProgress(steps: { status: string }[]): number {
  if (steps.length === 0) return 0;
  const completed = steps.filter((s) => s.status === 'COMPLETED').length;
  return Math.round((completed / steps.length) * 100);
}
