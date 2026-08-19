'use client';

// Super Admin → Paramètres → Profil. Reuses the same role-agnostic
// PATCH /api/auth/me endpoint the freelance workspace's CompteTab uses (it
// already works for any authenticated user, SUPERADMIN included) — only the
// `name` field is relevant here, everything else on that endpoint
// (studioName, taxId, brandColor…) is freelance-workspace-specific. Styled
// like SubscriptionsTab.tsx: hardcoded slate/emerald, not the Freelo
// workspace theme tokens — reusing CompteTab.tsx directly would leak a
// freelancer's theme personalization into this console (see admin/layout.tsx).
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth, type User } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { formatLongDate } from '@/lib/utils';

const inputClass =
  'rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none';
const cardClass = 'rounded-xl border border-slate-200 bg-white shadow-sm';

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: 'Super Admin',
  ADMIN: 'Admin',
};

export function AdminProfileTab({ user }: { user: User }) {
  const { refresh } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user.name ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function onSave() {
    setSubmitting(true);
    try {
      await api('/api/auth/me', { method: 'PATCH', body: { name: name.trim() } });
      await refresh();
      toast('Profil mis à jour.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`flex flex-col gap-4 p-5 ${cardClass}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 font-headings text-base font-bold text-white">
          {(user.name || user.email).slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="font-headings text-base font-semibold text-slate-900">
            {user.name || user.email}
          </p>
          <span className="mt-0.5 inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 font-body text-xs font-medium text-emerald-700">
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-body text-xs font-medium text-slate-500">Nom</span>
        <input
          type="text"
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          className={`${inputClass} max-w-sm`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-body text-xs font-medium text-slate-500">Email</span>
        <input
          type="text"
          value={user.email}
          disabled
          className={`${inputClass} max-w-sm bg-slate-50 text-slate-400`}
        />
      </label>

      {user.createdAt && (
        <p className="font-body text-xs text-slate-400">
          Membre depuis {formatLongDate(user.createdAt)}
        </p>
      )}

      <button
        type="button"
        disabled={submitting}
        onClick={() => void onSave()}
        className="mt-1 w-fit rounded-md bg-emerald-600 px-4 py-2 font-body text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {submitting ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </div>
  );
}
