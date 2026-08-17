import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS, type ClientStatus } from '@/lib/constants';

// Card variant of ClientRow, used only in the /clients grid view (view-mode
// toggle). ClientRow stays the compact row for list mode.
export interface ClientCardData {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: ClientStatus;
  projectCount: number;
  activeProjectCount: number;
}

export function ClientCard({ client }: { client: ClientCardData }) {
  const colors = CLIENT_STATUS_COLORS[client.status];
  return (
    <Link
      href={`/clients/${client.id}`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-canvas shadow-card p-4 font-body transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <Avatar name={client.name} className="h-10 w-10 flex-shrink-0 text-sm" />
        <span
          className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${colors.bg} ${colors.fg}`}
        >
          {CLIENT_STATUS_LABELS[client.status]}
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{client.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono">{client.code}</span> ·{' '}
          {client.contactName || client.email || client.phone || '—'}
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            {client.projectCount} projet{client.projectCount !== 1 ? 's' : ''}
          </span>
          {client.activeProjectCount > 0 && (
            <span className="rounded-full bg-tag-green px-2 py-0.5 text-xs font-medium text-tag-green-fg">
              {`${client.activeProjectCount} projet${client.activeProjectCount !== 1 ? 's' : ''} actif${client.activeProjectCount !== 1 ? 's' : ''}`}
            </span>
          )}
        </div>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
          <Icon i="chevron-right" size={14} />
        </div>
      </div>
    </Link>
  );
}
