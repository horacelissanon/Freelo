import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS, type ClientStatus } from '@/lib/constants';

export interface ClientRowData {
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

export function ClientRow({ client, index }: { client: ClientRowData; index: number }) {
  const colors = CLIENT_STATUS_COLORS[client.status];
  return (
    <Link
      href={`/clients/${client.id}`}
      className="flex items-center gap-4 border-b border-border py-3.5 font-body last:border-b-0"
    >
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-secondary font-body text-xs font-bold text-foreground">
        {index + 1}
      </span>
      <Avatar name={client.name} className="h-9 w-9 flex-shrink-0 text-xs" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{client.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono">{client.code}</span> ·{' '}
          {client.contactName || client.email || client.phone || '—'}
        </p>
      </div>
      <div
        className={`hidden flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:block ${colors.bg} ${colors.fg}`}
      >
        {CLIENT_STATUS_LABELS[client.status]}
      </div>
      {client.activeProjectCount > 0 && (
        <div className="hidden flex-shrink-0 rounded-full bg-tag-green px-2.5 py-1 text-xs font-medium text-tag-green-fg sm:block">
          {client.activeProjectCount} actif{client.activeProjectCount !== 1 ? 's' : ''}
        </div>
      )}
      <div className="flex-shrink-0 text-right text-xs text-muted-foreground">
        {client.projectCount} projet{client.projectCount !== 1 ? 's' : ''}
      </div>
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-secondary">
        <Icon i="chevron-right" size={14} />
      </div>
    </Link>
  );
}
