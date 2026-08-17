'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils';
import { useToast } from '@/contexts/ToastContext';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, type ProjectStatus } from '@/lib/constants';

export interface ProjectRowData {
  id: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  amount: number;
  currency: string;
  step: string | null;
  dueDateLabel: string | null;
  publicToken: string;
  clientName?: string;
  deposit?: { amount: number; paid: boolean };
  balance?: { amount: number; paid: boolean };
}

export function ProjectRow({
  project,
  masked,
  index,
}: {
  project: ProjectRowData;
  masked?: boolean;
  /** Only the main Projets list view passes this — other call sites (dashboard widget, client detail sub-list) render without a number. */
  index?: number;
}) {
  const { toast } = useToast();
  const colors = PROJECT_STATUS_COLORS[project.status];

  async function copyTrackingLink() {
    const url = `${window.location.origin}/suivi/${project.publicToken}`;
    await navigator.clipboard.writeText(url);
    toast('Lien de suivi copié.', 'success');
  }

  return (
    <div className="flex items-center gap-2 border-b border-border py-3.5 font-body last:border-b-0">
      <Link href={`/projects/${project.id}`} className="flex min-w-0 flex-1 items-center gap-4">
        {index !== undefined && (
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-secondary font-body text-xs font-bold text-foreground">
            {index + 1}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
          {(project.clientName || project.step) && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {[project.clientName, project.step].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div
          className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${colors.bg} ${colors.fg}`}
        >
          {PROJECT_STATUS_LABELS[project.status]}
        </div>
        <div className="w-16 flex-shrink-0 sm:w-20">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{project.progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-sm bg-muted">
            <div
              className="h-full rounded-sm bg-primary"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>
        <div className="hidden w-36 flex-shrink-0 text-right sm:block">
          <p className="text-sm font-medium text-foreground">
            {masked ? (
              '••••••'
            ) : (
              <>
                {formatPrice(project.amount)}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  {project.currency}
                </span>
              </>
            )}
          </p>
          {project.dueDateLabel && (
            <p className="text-xs text-muted-foreground">Échéance {project.dueDateLabel}</p>
          )}
          {!masked && (project.deposit || project.balance) && (
            <p className="text-xs">
              {project.deposit && (
                <span
                  className={project.deposit.paid ? 'text-tag-green-fg' : 'text-muted-foreground'}
                >
                  Ac. {formatPrice(project.deposit.amount)}
                </span>
              )}
              {project.deposit && project.balance && ' · '}
              {project.balance && (
                <span
                  className={project.balance.paid ? 'text-tag-green-fg' : 'text-muted-foreground'}
                >
                  Sd. {formatPrice(project.balance.amount)}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-secondary">
          <Icon i="chevron-right" size={14} />
        </div>
      </Link>
      <button
        type="button"
        onClick={copyTrackingLink}
        title="Copier le lien de suivi"
        aria-label="Copier le lien de suivi"
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
      >
        <Icon i="link" size={14} />
      </button>
    </div>
  );
}
