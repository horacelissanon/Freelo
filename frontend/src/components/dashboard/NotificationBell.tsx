'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { relativeTime } from '@/lib/utils';

export interface NotificationBellItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: {
    projectId?: string;
    invoiceId?: string;
    subscriptionId?: string;
    orderId?: string;
  } | null;
  readAt: string | null;
  createdAt: string;
}

const TYPE_STYLE: Record<string, { bg: string; fg: string; icon: string }> = {
  comment: { bg: 'bg-tag-orange', fg: 'text-tag-orange-fg', icon: 'message-square' },
  payment: { bg: 'bg-tag-green', fg: 'text-tag-green-fg', icon: 'credit-card' },
  signature: { bg: 'bg-tag-green', fg: 'text-tag-green-fg', icon: 'pen-line' },
  invoice: { bg: 'bg-tag-green', fg: 'text-tag-green-fg', icon: 'file-check' },
  'invoice-overdue': { bg: 'bg-tag-red', fg: 'text-tag-red-fg', icon: 'alert-circle' },
  'quote-expired': { bg: 'bg-tag-red', fg: 'text-tag-red-fg', icon: 'alert-circle' },
  'quote-expiring-soon': { bg: 'bg-tag-orange', fg: 'text-tag-orange-fg', icon: 'clock' },
  'project-deadline': { bg: 'bg-tag-orange', fg: 'text-tag-orange-fg', icon: 'clock' },
  'project-overdue': { bg: 'bg-tag-red', fg: 'text-tag-red-fg', icon: 'alert-circle' },
  WELCOME: { bg: 'bg-tag-green', fg: 'text-tag-green-fg', icon: 'star' },
  PAYMENT_RECEIVED: { bg: 'bg-tag-green', fg: 'text-tag-green-fg', icon: 'credit-card' },
  SUBSCRIPTION_RENEWED: { bg: 'bg-tag-green', fg: 'text-tag-green-fg', icon: 'credit-card' },
  SUBSCRIPTION_EXPIRING_SOON: {
    bg: 'bg-tag-orange',
    fg: 'text-tag-orange-fg',
    icon: 'alert-circle',
  },
  SUBSCRIPTION_EXPIRED: { bg: 'bg-tag-red', fg: 'text-tag-red-fg', icon: 'alert-circle' },
  WITHDRAWAL_REQUESTED: { bg: 'bg-tag-purple', fg: 'text-tag-purple-fg', icon: 'banknote' },
};
const DEFAULT_STYLE = { bg: 'bg-secondary', fg: 'text-muted-foreground', icon: 'bell' };

function hrefFor(n: NotificationBellItem): string | null {
  if (n.data?.invoiceId) return `/invoices/${n.data.invoiceId}`;
  if (n.data?.projectId) return `/projects/${n.data.projectId}`;
  if (n.data?.subscriptionId) return '/settings?tab=abonnement';
  return null;
}

export function NotificationBell({
  unreadCount,
  notifications,
  onMarkAllRead,
  onMarkRead,
  /** Overrides the trigger button's default bg-muted styling — needed when
   *  the bell sits on a dark surface (e.g. the dashboard's gradient header)
   *  instead of the persistent top bar's normal canvas background. */
  triggerClassName = 'bg-muted text-muted-foreground',
}: {
  unreadCount: number;
  notifications: NotificationBellItem[];
  onMarkAllRead: () => void;
  onMarkRead?: (id: string) => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className={`flex h-10 items-center gap-2 rounded-md px-3 text-sm ${triggerClassName}`}
      >
        <Icon i="bell" size={16} />
        {unreadCount > 0 && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fermer les notifications"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          {/* Positioned `fixed` + viewport-margin below the top bar on
              mobile/tablet — `absolute right-0` on a small bell wrapper
              anchors the panel's right edge to the *button*, not the
              screen, so a w-80+ panel overflowed off the left edge on
              narrow viewports. From lg (desktop, where the bell sits in a
              wide, already right-aligned toolbar) it reverts to the
              original absolute anchoring. */}
          <div className="fixed inset-x-4 top-16 z-50 rounded-lg border border-border bg-canvas shadow-lg sm:inset-x-auto sm:right-4 sm:left-auto sm:w-96 lg:absolute lg:inset-x-auto lg:top-12 lg:right-0 lg:left-auto lg:w-96">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-headings text-base font-bold text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="font-body text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Marquer tout comme lu
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-5 py-6 text-center font-body text-sm text-muted-foreground">
                  Aucune notification.
                </p>
              ) : (
                notifications.map((n) => {
                  const style = TYPE_STYLE[n.type] ?? DEFAULT_STYLE;
                  const href = hrefFor(n);
                  const content = (
                    <>
                      <div
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md ${style.bg}`}
                      >
                        <Icon i={style.icon} size={15} className={style.fg} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-body text-sm leading-tight font-medium text-foreground">
                            {n.title}
                          </p>
                          {!n.readAt && (
                            <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                        {n.body && (
                          <p className="mt-1 font-body text-xs text-muted-foreground">{n.body}</p>
                        )}
                        <p className="mt-1.5 font-body text-xs text-muted-foreground">
                          {relativeTime(n.createdAt)}
                        </p>
                      </div>
                    </>
                  );
                  const rowClass = `flex w-full gap-3 border-b border-muted px-5 py-4 text-left last:border-b-0 ${!n.readAt ? 'bg-secondary' : ''}`;
                  if (!href) {
                    return (
                      <div key={n.id} className={rowClass}>
                        {content}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        if (!n.readAt) onMarkRead?.(n.id);
                        setOpen(false);
                        router.push(href);
                      }}
                      className={`${rowClass} cursor-pointer transition-colors hover:bg-secondary`}
                    >
                      {content}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
