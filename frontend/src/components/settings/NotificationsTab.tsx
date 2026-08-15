'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, invalidateCache } from '@/lib/useApi';
import { useToast } from '@/contexts/ToastContext';
import { Toggle } from '@/components/ui/Toggle';
import { LoadingState, ErrorState } from '@/components/ui/PageStates';

type ChannelPrefs = { email?: boolean; inApp?: boolean };
type NotificationPrefs = Record<string, ChannelPrefs>;
type Channel = 'email' | 'inApp';

// Only two event types are actually fired anywhere in the app today
// (grep-confirmed: lib/server/notifications/templates.ts + withdrawals/route.ts).
// Everything else (WELCOME, EMAIL_VERIFY, PASSWORD_RESET, …) is always-on
// transactional/security mail and intentionally not exposed as a toggle.
const EVENTS: { key: string; label: string; description: string }[] = [
  {
    key: 'PAYMENT_RECEIVED',
    label: 'Paiement reçu',
    description: 'Un client règle un acompte, un solde ou une facture.',
  },
  {
    key: 'WITHDRAWAL_REQUESTED',
    label: 'Retrait demandé',
    description: 'Une demande de retrait vient d’être enregistrée.',
  },
];

function isEnabled(prefs: NotificationPrefs, key: string, channel: Channel): boolean {
  const v = prefs[key]?.[channel];
  return v !== false;
}

const PREFS_PATH = '/api/notifications/prefs';

export function NotificationsTab() {
  const { data, loading, error, refresh } = useApi<{ prefs: NotificationPrefs }>(PREFS_PATH);
  const { toast } = useToast();
  const [pending, setPending] = useState<string | null>(null);

  async function onToggle(eventKey: string, channel: Channel, next: boolean) {
    const pendingKey = `${eventKey}:${channel}`;
    setPending(pendingKey);
    try {
      await api(PREFS_PATH, {
        method: 'PATCH',
        body: { prefs: { [eventKey]: { [channel]: next } } },
      });
      invalidateCache(PREFS_PATH);
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue.', 'error');
    } finally {
      setPending(null);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const prefs = data?.prefs ?? {};

  return (
    <section className="flex flex-col divide-y divide-border rounded-lg border border-border bg-canvas p-5 shadow-card">
      <h2 className="mb-3 font-headings text-lg font-semibold text-foreground">Notifications</h2>
      {EVENTS.map((event) => (
        <div
          key={event.key}
          className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
        >
          <div className="flex min-w-0 flex-col">
            <span className="font-body text-sm font-medium text-foreground">{event.label}</span>
            <span className="font-body text-xs text-muted-foreground">{event.description}</span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-5">
            <label className="flex flex-col items-center gap-1">
              <span className="font-body text-[11px] text-muted-foreground">Email</span>
              <Toggle
                checked={isEnabled(prefs, event.key, 'email')}
                onChange={(v) => onToggle(event.key, 'email', v)}
                disabled={pending === `${event.key}:email`}
                label={`${event.label} — email`}
              />
            </label>
            <label className="flex flex-col items-center gap-1">
              <span className="font-body text-[11px] text-muted-foreground">In-app</span>
              <Toggle
                checked={isEnabled(prefs, event.key, 'inApp')}
                onChange={(v) => onToggle(event.key, 'inApp', v)}
                disabled={pending === `${event.key}:inApp`}
                label={`${event.label} — in-app`}
              />
            </label>
          </div>
        </div>
      ))}
    </section>
  );
}
