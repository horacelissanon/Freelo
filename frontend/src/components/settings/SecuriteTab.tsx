// Moved from the old standalone /settings page verbatim (see git history)
// as part of the Paramètres tab rebuild. Flows live here:
//   1. Set / change password
//      - If the account was created via OAuth (hasPassword=false), the
//        "Set password" form calls POST /api/auth/set-password — no current
//        password required, because there isn't one.
//      - Otherwise the "Change password" form calls PUT /api/auth/change-password
//        with currentPassword + newPassword.
//   2. Link a provider (Google)
//      - When Google is not already linked, the button kicks the user to
//        GET /api/auth/oauth/google/start?next=/settings, which goes through
//        the normal OAuth dance and lands back on /settings linked.
//      - When already linked, we just show a "linked" pill — no unlink action
//        yet (would need a /api/auth/oauth/google/unlink endpoint with a
//        guard refusing to leave the user without any sign-in method).
//   3. Sessions actives — device bookkeeping layered on top of the stateless
//      JWT design (see lib/server/sessions.ts) via a separate device cookie,
//      NOT a jti embedded in the refresh token itself. Revoking a device
//      takes effect on its next refresh (≤15min), same tolerance the app
//      already accepts for ACCOUNT_SUSPENDED.
//
// 2FA, activity log, API keys, and trusted devices (also shown in the
// reference mockup) are still out of scope — each is its own real feature
// (TOTP secret + backup codes, a dedicated audit table, a programmatic-auth
// scheme) rather than an afternoon's addition on top of Sessions actives.
'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth, type User } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useApi, invalidateCache } from '@/lib/useApi';
import { Icon } from '@/components/ui/Icon';
import { LoadingState } from '@/components/ui/PageStates';
import { formatLongDate } from '@/lib/utils';
import { describeDevice, describeLocation, type DeviceKind } from '@/lib/sessionDisplay';

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  city: string | null;
  country: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

const SESSIONS_PATH = '/api/auth/sessions';

const DEVICE_ICON: Record<DeviceKind, string> = {
  desktop: 'monitor',
  mobile: 'smartphone',
  tablet: 'tablet',
  unknown: 'help-circle',
};

function SessionsSection() {
  const { data, loading, refresh } = useApi<{ sessions: SessionRow[] }>(SESSIONS_PATH);
  const { toast } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const sessions = data?.sessions ?? [];
  const otherCount = sessions.filter((s) => !s.current).length;

  async function revokeOne(id: string) {
    setPendingId(id);
    try {
      await api(`/api/auth/sessions/${id}/revoke`, { method: 'POST' });
      invalidateCache(SESSIONS_PATH);
      await refresh();
      toast('Session déconnectée.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue.', 'error');
    } finally {
      setPendingId(null);
    }
  }

  async function revokeAll() {
    setRevokingAll(true);
    try {
      await api('/api/auth/sessions/revoke-all', { method: 'POST' });
      invalidateCache(SESSIONS_PATH);
      await refresh();
      toast('Toutes les autres sessions ont été déconnectées.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue.', 'error');
    } finally {
      setRevokingAll(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-canvas p-5 shadow-card">
      <div>
        <h2 className="font-headings text-lg font-semibold text-foreground">Sessions actives</h2>
        <p className="font-body text-sm text-muted-foreground">
          Les appareils actuellement connectés à ton compte.
        </p>
      </div>
      {loading ? (
        <LoadingState />
      ) : sessions.length === 0 ? (
        <p className="font-body text-sm text-muted-foreground">Aucune session active détectée.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
          {sessions.map((s) => {
            const device = describeDevice(s.userAgent);
            const location = describeLocation(s.city, s.country);
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Icon
                      i={DEVICE_ICON[device.kind]}
                      size={14}
                      className="text-muted-foreground"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2 font-body text-sm font-medium text-foreground">
                      <span className="truncate">{device.label}</span>
                      {s.current && (
                        <span className="flex-shrink-0 rounded-full bg-tag-green px-2 py-0.5 font-body text-[11px] font-medium text-tag-green-fg">
                          Actuellement
                        </span>
                      )}
                    </span>
                    <span className="font-body text-xs text-muted-foreground">
                      {location ? `${location} · ` : s.ip ? `${s.ip} · ` : ''}Actif{' '}
                      {formatLongDate(s.lastSeenAt)}
                    </span>
                  </div>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    onClick={() => revokeOne(s.id)}
                    disabled={pendingId === s.id}
                    className="flex-shrink-0 rounded-md border border-border px-3 py-1.5 font-body text-xs font-medium text-tag-red-fg disabled:opacity-50"
                  >
                    {pendingId === s.id ? 'Déconnexion…' : 'Fermer'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {otherCount > 0 && (
        <button
          type="button"
          onClick={revokeAll}
          disabled={revokingAll}
          className="flex w-fit items-center gap-1.5 font-body text-sm font-medium text-tag-red-fg disabled:opacity-50"
        >
          <Icon i="x-circle" size={14} />
          {revokingAll ? 'Déconnexion…' : `Fermer toutes les autres sessions (${otherCount})`}
        </button>
      )}
    </section>
  );
}

export function SecuriteTab({ user }: { user: User }) {
  const { refresh } = useAuth();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPassword = user.hasPassword;
  const googleLinked = user.linkedProviders.includes('google');

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length === 0) {
      setError('Saisis un nouveau mot de passe.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    setSubmitting(true);
    try {
      if (hasPassword) {
        await api('/api/auth/change-password', {
          method: 'PUT',
          body: { currentPassword, newPassword },
        });
        toast('Mot de passe mis à jour.', 'success');
      } else {
        await api('/api/auth/set-password', {
          method: 'POST',
          body: { newPassword },
        });
        toast('Mot de passe défini. Tu peux maintenant te connecter par email.', 'success');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          INVALID_CREDENTIALS: 'Mot de passe actuel incorrect.',
          PASSWORD_BANNED: 'Ce mot de passe est trop courant.',
          PASSWORD_TOO_SHORT: err.message || 'Mot de passe trop court.',
          PASSWORD_PWNED: 'Ce mot de passe a fuité — choisis-en un autre.',
          PASSWORD_ALREADY_SET:
            'Un mot de passe est déjà défini. Utilise « changer le mot de passe ».',
          VALIDATION_FAILED: 'Champs invalides.',
        };
        setError(map[err.code] ?? err.message);
      } else {
        setError('Erreur réseau. Réessaie.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-canvas p-5 shadow-card">
        <h2 className="font-headings text-lg font-semibold text-foreground">
          {hasPassword ? 'Changer le mot de passe' : 'Définir un mot de passe'}
        </h2>
        <p className="font-body text-sm text-muted-foreground">
          {hasPassword
            ? 'Tu peux modifier ton mot de passe ici. Les autres sessions seront déconnectées.'
            : 'Tu t’es connecté via Google. Définis un mot de passe pour pouvoir aussi te connecter par email.'}
        </p>
        <form onSubmit={onSubmitPassword} className="mt-2 flex flex-col gap-4">
          {hasPassword && (
            <label className="flex flex-col gap-1 font-body text-sm text-foreground">
              Mot de passe actuel
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputClass}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 font-body text-sm text-foreground">
            Nouveau mot de passe
            <input
              type="password"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 font-body text-sm text-foreground">
            Confirmer le nouveau mot de passe
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </label>
          {error && (
            <p role="alert" className="font-body text-sm text-tag-red-fg">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {submitting
              ? 'Enregistrement…'
              : hasPassword
                ? 'Changer le mot de passe'
                : 'Définir le mot de passe'}
          </button>
        </form>
        {hasPassword && user.passwordChangedAt && (
          <p className="font-body text-xs text-muted-foreground">
            Dernière modification : {formatLongDate(user.passwordChangedAt)}
          </p>
        )}
      </section>

      <SessionsSection />

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-canvas p-5 shadow-card">
        <h2 className="font-headings text-lg font-semibold text-foreground">Comptes liés</h2>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-body text-sm font-medium text-foreground">Google</span>
            <span className="font-body text-xs text-muted-foreground">
              {googleLinked
                ? 'Tu peux te connecter via Google.'
                : 'Lie ton compte Google pour te connecter en un clic.'}
            </span>
          </div>
          {googleLinked ? (
            <span className="rounded-full bg-tag-green px-3 py-1 font-body text-xs font-medium text-tag-green-fg">
              Lié
            </span>
          ) : (
            <a
              href="/api/auth/oauth/google/start?next=/settings?tab=securite"
              className="rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-foreground"
            >
              Lier Google
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
