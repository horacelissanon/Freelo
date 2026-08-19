'use client';

// Super Admin → Paramètres → Sécurité. Same UX and endpoints as the
// freelance workspace's SecuriteTab.tsx (change/set password, active
// sessions, Google link status) — re-skinned in the admin console's
// hardcoded slate/emerald so it doesn't inherit a freelancer's theme
// personalization (see admin/layout.tsx's styling note).
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth, type User } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useApi, invalidateCache } from '@/lib/useApi';
import { Icon } from '@/components/ui/Icon';
import { formatLongDate } from '@/lib/utils';

const inputClass =
  'rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none';
const cardClass = 'rounded-xl border border-slate-200 bg-white shadow-sm';

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

const SESSIONS_PATH = '/api/auth/sessions';

function describeDevice(ua: string | null): string {
  if (!ua) return 'Appareil inconnu';
  let browser = 'Navigateur';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = 'Chrome';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';

  let os = 'Appareil';
  if (/iphone/i.test(ua)) os = 'iPhone';
  else if (/ipad/i.test(ua)) os = 'iPad';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/mac os x/i.test(ua)) os = 'macOS';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/linux/i.test(ua)) os = 'Linux';

  return `${browser} — ${os}`;
}

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
    <section className={`flex flex-col gap-3 p-5 ${cardClass}`}>
      <div>
        <h2 className="font-headings text-base font-semibold text-slate-900">Sessions actives</h2>
        <p className="font-body text-sm text-slate-500">
          Les appareils actuellement connectés à ce compte.
        </p>
      </div>
      {loading ? (
        <p className="font-body text-sm text-slate-500">Chargement…</p>
      ) : sessions.length === 0 ? (
        <p className="font-body text-sm text-slate-500">Aucune session active détectée.</p>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100">
                  <Icon i="smartphone" size={14} className="text-slate-500" />
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 font-body text-sm font-medium text-slate-800">
                    <span className="truncate">{describeDevice(s.userAgent)}</span>
                    {s.current && (
                      <span className="flex-shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 font-body text-[11px] font-medium text-emerald-700">
                        Actuellement
                      </span>
                    )}
                  </span>
                  <span className="font-body text-xs text-slate-400">
                    {s.ip ? `${s.ip} · ` : ''}Actif {formatLongDate(s.lastSeenAt)}
                  </span>
                </div>
              </div>
              {!s.current && (
                <button
                  type="button"
                  onClick={() => revokeOne(s.id)}
                  disabled={pendingId === s.id}
                  className="flex-shrink-0 rounded-md border border-slate-200 px-3 py-1.5 font-body text-xs font-medium text-red-600 disabled:opacity-50"
                >
                  {pendingId === s.id ? 'Déconnexion…' : 'Fermer'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {otherCount > 0 && (
        <button
          type="button"
          onClick={revokeAll}
          disabled={revokingAll}
          className="flex w-fit items-center gap-1.5 font-body text-sm font-medium text-red-600 disabled:opacity-50"
        >
          <Icon i="x-circle" size={14} />
          {revokingAll ? 'Déconnexion…' : `Fermer toutes les autres sessions (${otherCount})`}
        </button>
      )}
    </section>
  );
}

export function AdminSecurityTab({ user }: { user: User }) {
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
    <div className="flex flex-col gap-4">
      <section className={`flex flex-col gap-3 p-5 ${cardClass}`}>
        <h2 className="font-headings text-base font-semibold text-slate-900">
          {hasPassword ? 'Changer le mot de passe' : 'Définir un mot de passe'}
        </h2>
        <p className="font-body text-sm text-slate-500">
          {hasPassword
            ? 'Les autres sessions seront déconnectées après ce changement.'
            : 'Ce compte a été créé via Google. Définis un mot de passe pour pouvoir aussi te connecter par email.'}
        </p>
        <form onSubmit={onSubmitPassword} className="mt-2 flex max-w-sm flex-col gap-4">
          {hasPassword && (
            <label className="flex flex-col gap-1 font-body text-sm text-slate-700">
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
          <label className="flex flex-col gap-1 font-body text-sm text-slate-700">
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
          <label className="flex flex-col gap-1 font-body text-sm text-slate-700">
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
            <p role="alert" className="font-body text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-fit rounded-md bg-emerald-600 px-5 py-2.5 font-body text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting
              ? 'Enregistrement…'
              : hasPassword
                ? 'Changer le mot de passe'
                : 'Définir le mot de passe'}
          </button>
        </form>
        {hasPassword && user.passwordChangedAt && (
          <p className="font-body text-xs text-slate-400">
            Dernière modification : {formatLongDate(user.passwordChangedAt)}
          </p>
        )}
      </section>

      <SessionsSection />

      <section className={`flex flex-col gap-3 p-5 ${cardClass}`}>
        <h2 className="font-headings text-base font-semibold text-slate-900">Comptes liés</h2>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-body text-sm font-medium text-slate-800">Google</span>
            <span className="font-body text-xs text-slate-500">
              {googleLinked
                ? 'Connexion via Google possible.'
                : 'Lie ce compte Google pour te connecter en un clic.'}
            </span>
          </div>
          {googleLinked ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-body text-xs font-medium text-emerald-700">
              Lié
            </span>
          ) : (
            <a
              href="/api/auth/oauth/google/start?next=/admin/settings?tab=securite"
              className="rounded-md border border-slate-200 px-4 py-2 font-body text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Lier Google
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
