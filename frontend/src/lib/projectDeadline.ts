// Shared (client + server-agnostic) urgency classification for a project's
// dueDate — drives the red/amber "Échéance" coloring on ProjectRow/
// ProjectCard/project detail, so every surface agrees on what counts as
// overdue or due today instead of each screen inventing its own threshold.
import type { ProjectStatus } from './constants';

export type DeadlineUrgency = 'overdue' | 'today';

/**
 * Returns null when there's nothing to flag: no dueDate set, the deadline is
 * still more than a day out, or the project is DRAFT (not a real commitment
 * yet) or DELIVERED (nothing left to chase).
 */
export function projectDeadlineUrgency(
  dueDate: string | null,
  status: ProjectStatus,
): DeadlineUrgency | null {
  if (!dueDate || status === 'DRAFT' || status === 'DELIVERED') return null;
  const daysLeft = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86_400_000);
  if (daysLeft < 0) return 'overdue';
  if (daysLeft === 0) return 'today';
  return null;
}

export const DEADLINE_URGENCY_STYLE: Record<DeadlineUrgency, string> = {
  overdue: 'text-tag-red-fg font-semibold',
  today: 'text-tag-orange-fg font-semibold',
};

/** Same pastel tokens the status badges already use (never a saturated
 *  pure red/orange) — applied to the whole row so a late or due-today
 *  project stands out in a list, not just its small date label. */
export const DEADLINE_URGENCY_ROW_BG: Record<DeadlineUrgency, string> = {
  overdue: 'bg-tag-red',
  today: 'bg-tag-orange',
};

export const DEADLINE_URGENCY_LABEL: Record<DeadlineUrgency, string> = {
  overdue: 'Échéance dépassée',
  today: "Échéance aujourd'hui",
};
