'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

interface QuickAction {
  icon: string;
  iconBg: string;
  iconFg?: string;
  title: string;
  subtitle: string;
  href?: string;
  onClick?: () => void;
}

function ActionCard({ action }: { action: QuickAction }) {
  const content = (
    <>
      <div
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md ${action.iconBg}`}
      >
        <Icon i={action.icon} size={17} {...(action.iconFg ? { className: action.iconFg } : {})} />
      </div>
      <div className="min-w-0 text-left">
        <p className="font-body text-sm font-semibold text-foreground">{action.title}</p>
        <p className="truncate font-body text-xs text-muted-foreground">{action.subtitle}</p>
      </div>
    </>
  );
  const className =
    'flex items-center gap-3 rounded-lg border border-border bg-canvas shadow-card px-4 py-4 text-left hover:border-primary/40';

  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={className}>
      {content}
    </button>
  );
}

export function QuickActions({ onNewQuote }: { onNewQuote: () => void }) {
  const actions: QuickAction[] = [
    {
      icon: 'file-plus',
      iconBg: 'bg-secondary',
      title: 'Nouveau devis',
      subtitle: 'En FCFA, envoi direct',
      onClick: onNewQuote,
    },
    {
      icon: 'link',
      iconBg: 'bg-tag-green',
      iconFg: 'text-tag-green-fg',
      title: 'Lien client',
      subtitle: 'Sans compte requis',
      href: '/clients',
    },
    {
      icon: 'smartphone',
      iconBg: 'bg-tag-orange',
      iconFg: 'text-tag-orange-fg',
      title: 'Paiement Mobile Money',
      subtitle: 'MTN · Moov Money',
      href: '/invoices',
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {actions.map((a) => (
        <ActionCard key={a.title} action={a} />
      ))}
    </div>
  );
}
