'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { relativeTime } from '@/lib/utils';

export interface NotificationBellItem {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

const TYPE_STYLE: Record<string, { bg: string; fg: string; icon: string }> = {
  comment: { bg: 'bg-tag-orange', fg: 'text-tag-orange-fg', icon: 'message-square' },
  payment: { bg: 'bg-tag-green', fg: 'text-tag-green-fg', icon: 'credit-card' },
  signature: { bg: 'bg-tag-green', fg: 'text-tag-green-fg', icon: 'pen-line' },
  invoice: { bg: 'bg-tag-green', fg: 'text-tag-green-fg', icon: 'file-check' },
};
const DEFAULT_STYLE = { bg: 'bg-secondary', fg: 'text-muted-foreground', icon: 'bell' };

export function NotificationBell({
  unreadCount,
  notifications,
  onMarkAllRead,
}: {
  unreadCount: number;
  notifications: NotificationBellItem[];
  onMarkAllRead: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="flex h-10 items-center gap-2 rounded-md bg-muted px-3 text-sm text-muted-foreground"
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
          <div className="absolute top-12 right-0 z-50 w-80 max-w-[90vw] rounded-lg border border-border bg-canvas shadow-lg sm:w-96">
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
                  return (
                    <div
                      key={n.id}
                      className={`flex gap-3 border-b border-muted px-5 py-4 last:border-b-0 ${!n.readAt ? 'bg-secondary' : ''}`}
                    >
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
                    </div>
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
