'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils';
import { useToast } from '@/contexts/ToastContext';
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_ICONS,
  type ProjectStatus,
  type ProjectType,
} from '@/lib/constants';

// Card variant of ProjectRow, used only on the main /projects grid (per the
// user's reference screenshots for that page). ProjectRow stays a compact
// row for the Dashboard widget, client detail sub-list, and the public
// tracking portal — those contexts expect a dense list, not a padded card.
export interface ProjectCardData {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  progress: number;
  amount: number;
  currency: string;
  dueDateLabel: string | null;
  publicToken: string;
  clientName?: string;
}

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const { toast } = useToast();
  const colors = PROJECT_STATUS_COLORS[project.status];

  async function copyTrackingLink() {
    const url = `${window.location.origin}/suivi/${project.publicToken}`;
    await navigator.clipboard.writeText(url);
    toast('Lien de suivi copié.', 'success');
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-canvas shadow-card p-4 font-body transition-shadow hover:shadow-md">
      <Link href={`/projects/${project.id}`} className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-secondary">
            <Icon i={PROJECT_TYPE_ICONS[project.type]} size={18} className="text-primary" />
          </div>
          <span
            className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${colors.bg} ${colors.fg}`}
          >
            {PROJECT_STATUS_LABELS[project.status]}
          </span>
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{project.name}</p>
          {project.clientName && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Icon i="user" size={12} />
              {project.clientName}
            </p>
          )}
        </div>

        <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {PROJECT_TYPE_LABELS[project.type]}
        </span>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Progression</span>
            <span>{project.progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-sm bg-muted">
            <div
              className="h-full rounded-sm bg-primary"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>
      </Link>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {formatPrice(project.amount)}{' '}
            <span className="text-xs font-normal text-muted-foreground">{project.currency}</span>
          </p>
          {project.dueDateLabel && (
            <p className="text-xs text-muted-foreground">Échéance {project.dueDateLabel}</p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={copyTrackingLink}
            title="Copier le lien de suivi"
            aria-label="Copier le lien de suivi"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <Icon i="link" size={14} />
          </button>
          <Link
            href={`/projects/${project.id}`}
            aria-label="Voir le projet"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-foreground"
          >
            <Icon i="chevron-right" size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
