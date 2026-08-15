'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { uploadFile } from '@/lib/upload';
import { useAuth, type User } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { CURRENCIES } from '@/lib/constants';

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

const LANGUAGES: { value: string; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

// Prénom/Nom is a UI-only split — the schema still stores one `User.name`
// string (no migration needed). Split on the first whitespace on load,
// rejoin on submit. A single-word name lands entirely in "Prénom".
function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, spaceIndex), lastName: trimmed.slice(spaceIndex + 1) };
}

function accountDeletionErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const detail = err.body.message;
    return typeof detail === 'string' ? detail : err.message;
  }
  return 'Une erreur est survenue.';
}

export function CompteTab({ user }: { user: User }) {
  const router = useRouter();
  const { refresh, logout } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialName = splitName(user.name ?? '');
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [studioName, setStudioName] = useState(user.studioName ?? '');
  const [taxId, setTaxId] = useState(user.taxId ?? '');
  const [commerceRegistry, setCommerceRegistry] = useState(user.commerceRegistry ?? '');
  const [address, setAddress] = useState(user.address ?? '');
  const [documentIdentity, setDocumentIdentity] = useState<'PERSONAL' | 'COMPANY'>(
    user.documentIdentity,
  );
  const [defaultCurrency, setDefaultCurrency] = useState(user.defaultCurrency);
  const [language, setLanguage] = useState(user.language);
  const [entrepriseSubmitting, setEntrepriseSubmitting] = useState(false);
  const [entrepriseError, setEntrepriseError] = useState<string | null>(null);

  const [exportPending, setExportPending] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function markDirty() {
    setDirty(true);
  }

  async function onPickAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingAvatar(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file);
      await api('/api/auth/me', { method: 'PATCH', body: { avatarUrl: uploaded.url } });
      await refresh();
      toast('Photo de profil mise à jour.', 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec du téléversement.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function saveProfile() {
    setSubmitting(true);
    setError(null);
    try {
      const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
      await api('/api/auth/me', {
        method: 'PATCH',
        body: { name, phone: phone.trim(), bio: bio.trim() },
      });
      await refresh();
      setDirty(false);
      toast('Profil mis à jour.', 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void saveProfile();
  }

  async function onSubmitEntreprise(e: FormEvent) {
    e.preventDefault();
    setEntrepriseSubmitting(true);
    setEntrepriseError(null);
    try {
      await api('/api/auth/me', {
        method: 'PATCH',
        body: {
          studioName: studioName.trim(),
          taxId: taxId.trim(),
          commerceRegistry: commerceRegistry.trim(),
          address: address.trim(),
          documentIdentity,
          defaultCurrency,
          language,
        },
      });
      await refresh();
      toast('Informations mises à jour.', 'success');
    } catch (err) {
      setEntrepriseError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setEntrepriseSubmitting(false);
    }
  }

  function onCancel() {
    setFirstName(initialName.firstName);
    setLastName(initialName.lastName);
    setPhone(user.phone ?? '');
    setBio(user.bio ?? '');
    setDirty(false);
    setError(null);
  }

  async function onExport() {
    setExportPending(true);
    try {
      window.location.href = '/api/auth/export';
    } finally {
      setTimeout(() => setExportPending(false), 1000);
    }
  }

  async function onConfirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api('/api/auth/account', { method: 'DELETE' });
      await logout();
      router.push('/');
    } catch (err) {
      setDeleteError(accountDeletionErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const canDelete = deleteConfirmText.trim().toLowerCase() === user.email.toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-canvas p-5 shadow-card">
        <h2 className="font-headings text-lg font-semibold text-foreground">Photo de profil</h2>
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-16 w-16 flex-shrink-0 rounded-full object-cover"
            />
          ) : (
            <Avatar name={user.name || user.email} className="h-16 w-16 flex-shrink-0 text-lg" />
          )}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-body text-sm font-medium text-foreground disabled:opacity-50"
            >
              <Icon
                i={uploadingAvatar ? 'loader' : 'camera'}
                size={14}
                className={uploadingAvatar ? 'animate-spin' : ''}
              />
              {uploadingAvatar ? 'Envoi…' : 'Changer la photo'}
            </button>
            <span className="font-body text-xs text-muted-foreground">
              JPG, PNG ou WEBP — 10 Mo max.
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPickAvatar}
            className="hidden"
          />
        </div>
      </section>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 rounded-lg border border-border bg-canvas p-5 shadow-card"
      >
        <h2 className="font-headings text-lg font-semibold text-foreground">
          Informations personnelles
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Prénom
            <input
              type="text"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                markDirty();
              }}
              maxLength={100}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Nom
            <input
              type="text"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                markDirty();
              }}
              maxLength={100}
              className={inputClass}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Email
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={user.email}
              disabled
              readOnly
              className={`${inputClass} flex-1 opacity-60`}
            />
            {user.emailVerifiedAt ? (
              <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-tag-green px-2.5 py-1 font-body text-xs font-medium text-tag-green-fg">
                <Icon i="check-circle" size={12} />
                Vérifié
              </span>
            ) : (
              <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-tag-orange px-2.5 py-1 font-body text-xs font-medium text-tag-orange-fg">
                Non vérifié
              </span>
            )}
          </div>
        </label>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Téléphone
          <input
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              markDirty();
            }}
            maxLength={30}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Bio
          <textarea
            value={bio}
            onChange={(e) => {
              setBio(e.target.value);
              markDirty();
            }}
            maxLength={1000}
            rows={3}
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="font-body text-sm text-tag-red-fg">
            {error}
          </p>
        )}
      </form>

      <form
        onSubmit={onSubmitEntreprise}
        className="flex flex-col gap-4 rounded-lg border border-border bg-canvas p-5 shadow-card"
      >
        <div>
          <h2 className="font-headings text-lg font-semibold text-foreground">Entreprise</h2>
          <p className="font-body text-xs text-muted-foreground">
            Ces informations apparaissent sur tes devis et factures.
          </p>
        </div>

        <div>
          <p className="font-body text-sm font-medium text-foreground">
            Informations affichées sur tes documents
          </p>
          <p className="mb-2 font-body text-xs text-muted-foreground">
            Choisis ce que tes clients voient en en-tête de tes devis et factures : ton identité
            personnelle ou celle de ton entreprise.
          </p>
          <div className="inline-flex rounded-md border border-border p-1">
            <button
              type="button"
              onClick={() => setDocumentIdentity('PERSONAL')}
              className={`rounded px-3 py-1.5 font-body text-sm font-medium transition-colors ${
                documentIdentity === 'PERSONAL'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Personnelles
            </button>
            <button
              type="button"
              onClick={() => setDocumentIdentity('COMPANY')}
              className={`rounded px-3 py-1.5 font-body text-sm font-medium transition-colors ${
                documentIdentity === 'COMPANY'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Entreprise
            </button>
          </div>
        </div>

        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Nom de l&apos;entreprise
          <input
            type="text"
            value={studioName}
            onChange={(e) => setStudioName(e.target.value)}
            maxLength={200}
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Numéro fiscal / NIF
            <input
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              maxLength={60}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Registre de commerce
            <input
              type="text"
              value={commerceRegistry}
              onChange={(e) => setCommerceRegistry(e.target.value)}
              maxLength={60}
              className={inputClass}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Adresse
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={300}
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Devise par défaut
            <select
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value)}
              className={inputClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Langue
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={inputClass}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {entrepriseError && (
          <p role="alert" className="font-body text-sm text-tag-red-fg">
            {entrepriseError}
          </p>
        )}
        <button
          type="submit"
          disabled={entrepriseSubmitting}
          className="mt-1 w-fit rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {entrepriseSubmitting ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>

      <section className="flex flex-col gap-4 rounded-lg border border-tag-red-fg/30 bg-canvas p-5 shadow-card">
        <div>
          <h2 className="font-headings text-lg font-semibold text-foreground">Zone dangereuse</h2>
          <p className="font-body text-sm text-muted-foreground">
            Exporte tes données ou supprime définitivement ton compte.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onExport}
            disabled={exportPending}
            className="flex items-center gap-1.5 rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-foreground disabled:opacity-50"
          >
            <Icon i="file-text" size={14} />
            {exportPending ? 'Préparation…' : 'Exporter mes données'}
          </button>
          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-tag-red-fg px-4 py-2 font-body text-sm font-medium text-tag-red-fg"
          >
            <Icon i="trash" size={14} />
            Supprimer mon compte
          </button>
        </div>
      </section>

      {dirty && (
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-canvas/95 px-4 py-3 shadow-xl backdrop-blur sm:-mx-6 lg:-mx-8">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-foreground disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void saveProfile()}
              disabled={submitting}
              className="rounded-md bg-primary px-5 py-2 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {deleteModalOpen && (
        <Modal
          title="Supprimer mon compte"
          onClose={() => {
            setDeleteModalOpen(false);
            setDeleteConfirmText('');
            setDeleteError(null);
          }}
        >
          <p className="font-body text-sm text-muted-foreground">
            Cette action est irréversible. Tous tes clients, projets, devis et factures seront
            définitivement supprimés. Tape ton email (<strong>{user.email}</strong>) pour confirmer.
          </p>
          <input
            type="email"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={user.email}
            className={`${inputClass} mt-3 w-full`}
          />
          {deleteError && (
            <p role="alert" className="mt-2 font-body text-sm text-tag-red-fg">
              {deleteError}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDeleteModalOpen(false);
                setDeleteConfirmText('');
                setDeleteError(null);
              }}
              className="rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-foreground"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={!canDelete || deleting}
              className="rounded-md bg-tag-red-fg px-4 py-2 font-body text-sm font-medium text-white disabled:opacity-50"
            >
              {deleting ? 'Suppression…' : 'Supprimer définitivement'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
