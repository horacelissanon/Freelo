'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { uploadFile } from '@/lib/upload';
import { useAuth, type User } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useApi } from '@/lib/useApi';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { PlanLimitPrompt } from '@/components/ui/PlanLimitPrompt';
import { DefaultPaymentMethodsSection } from '@/components/settings/DefaultPaymentMethodsSection';
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
  const logoInputRef = useRef<HTMLInputElement>(null);
  // Logo only renders on devis/factures/suivi for Pro plans (see
  // resolveDocumentIdentity + the /pdf and /suivi/[token] routes) — fetched
  // here just to show the upsell hint below the upload field, same source
  // FacturationTab reads from.
  const { data: subscriptionData } = useApi<{ subscription: { isProActive: boolean } }>(
    '/api/billing/subscription',
  );
  const isProActive = subscriptionData?.subscription.isProActive ?? false;

  const initialName = splitName(user.name ?? '');
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [studioName, setStudioName] = useState(user.studioName ?? '');
  const [companyPhone, setCompanyPhone] = useState(user.companyPhone ?? '');
  const [slogan, setSlogan] = useState(user.slogan ?? '');
  const [taxId, setTaxId] = useState(user.taxId ?? '');
  const [commerceRegistry, setCommerceRegistry] = useState(user.commerceRegistry ?? '');
  const [address, setAddress] = useState(user.address ?? '');
  const [documentIdentity, setDocumentIdentity] = useState<'PERSONAL' | 'COMPANY'>(
    user.documentIdentity,
  );
  const [defaultLegalMention, setDefaultLegalMention] = useState(user.defaultLegalMention ?? '');
  const [defaultCurrency, setDefaultCurrency] = useState(user.defaultCurrency);
  const [language, setLanguage] = useState(user.language);

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

  async function onPickLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file);
      await api('/api/auth/me', { method: 'PATCH', body: { logoUrl: uploaded.url } });
      await refresh();
      toast('Logo mis à jour.', 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec du téléversement.');
    } finally {
      setUploadingLogo(false);
    }
  }

  // Single unified save for the whole page — the bottom sticky bar is the
  // only save action now (Personnel + Entreprise used to be two separate
  // forms with their own submit buttons; the Entreprise card's own button
  // was removed so every field on this page goes through one PATCH).
  async function saveProfile() {
    setSubmitting(true);
    setError(null);
    try {
      const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
      await api('/api/auth/me', {
        method: 'PATCH',
        body: {
          name,
          phone: phone.trim(),
          bio: bio.trim(),
          studioName: studioName.trim(),
          companyPhone: companyPhone.trim(),
          slogan: slogan.trim(),
          taxId: taxId.trim(),
          commerceRegistry: commerceRegistry.trim(),
          address: address.trim(),
          documentIdentity,
          defaultLegalMention: defaultLegalMention.trim(),
          defaultCurrency,
          language,
        },
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

  function onCancel() {
    setFirstName(initialName.firstName);
    setLastName(initialName.lastName);
    setPhone(user.phone ?? '');
    setBio(user.bio ?? '');
    setStudioName(user.studioName ?? '');
    setCompanyPhone(user.companyPhone ?? '');
    setSlogan(user.slogan ?? '');
    setTaxId(user.taxId ?? '');
    setCommerceRegistry(user.commerceRegistry ?? '');
    setAddress(user.address ?? '');
    setDocumentIdentity(user.documentIdentity);
    setDefaultLegalMention(user.defaultLegalMention ?? '');
    setDefaultCurrency(user.defaultCurrency);
    setLanguage(user.language);
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

      {/* One shared form for both cards below — display:contents so it
          doesn't add an extra flex item and break the parent's gap-6. The
          bottom sticky bar is the single save action for the whole page. */}
      <form onSubmit={onSubmit} className="contents">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-canvas p-5 shadow-card">
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
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-border bg-canvas p-5 shadow-card">
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
                onClick={() => {
                  setDocumentIdentity('PERSONAL');
                  markDirty();
                }}
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
                onClick={() => {
                  setDocumentIdentity('COMPANY');
                  markDirty();
                }}
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

          <div className="flex flex-col gap-2">
            <p className="font-body text-sm font-medium text-foreground">
              Logo de l&apos;entreprise
            </p>
            <p className="font-body text-xs text-muted-foreground">
              Affiché sur tes devis, factures et la page de suivi à la place de ton avatar, quand
              l&apos;identité « Entreprise » est sélectionnée ci-dessus.
            </p>
            <div className="flex items-center gap-4">
              {user.logoUrl ? (
                <img
                  src={user.logoUrl}
                  alt=""
                  className="h-16 w-16 flex-shrink-0 rounded-lg border border-border object-contain p-1.5"
                />
              ) : (
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                  <Icon i="image" size={20} />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-body text-sm font-medium text-foreground disabled:opacity-50"
                >
                  <Icon
                    i={uploadingLogo ? 'loader' : 'upload'}
                    size={14}
                    className={uploadingLogo ? 'animate-spin' : ''}
                  />
                  {uploadingLogo ? 'Envoi…' : user.logoUrl ? 'Changer le logo' : 'Ajouter un logo'}
                </button>
                <span className="font-body text-xs text-muted-foreground">
                  JPG, PNG ou WEBP — 10 Mo max.
                </span>
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onPickLogo}
                className="hidden"
              />
            </div>
            {!isProActive && (
              <PlanLimitPrompt message="Le logo s'affiche sur tes devis, factures et la page de suivi avec le forfait Pro." />
            )}
          </div>

          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Slogan
            <span className="font-body text-xs font-normal text-muted-foreground">
              Affiché juste sous ton nom sur tes devis/factures, quelle que soit l&apos;identité
              choisie ci-dessus.
            </span>
            <input
              type="text"
              value={slogan}
              onChange={(e) => {
                setSlogan(e.target.value);
                markDirty();
              }}
              maxLength={150}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Nom de l&apos;entreprise
            <input
              type="text"
              value={studioName}
              onChange={(e) => {
                setStudioName(e.target.value);
                markDirty();
              }}
              maxLength={200}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Téléphone de l&apos;entreprise
            <span className="font-body text-xs font-normal text-muted-foreground">
              Affiché sur vos devis/factures à la place de votre téléphone personnel.
            </span>
            <input
              type="tel"
              value={companyPhone}
              onChange={(e) => {
                setCompanyPhone(e.target.value);
                markDirty();
              }}
              maxLength={30}
              className={inputClass}
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
              Numéro fiscal / NIF
              <input
                type="text"
                value={taxId}
                onChange={(e) => {
                  setTaxId(e.target.value);
                  markDirty();
                }}
                maxLength={60}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
              Registre de commerce
              <input
                type="text"
                value={commerceRegistry}
                onChange={(e) => {
                  setCommerceRegistry(e.target.value);
                  markDirty();
                }}
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
              onChange={(e) => {
                setAddress(e.target.value);
                markDirty();
              }}
              maxLength={300}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Mention légale par défaut
            <span className="font-body text-xs font-normal text-muted-foreground">
              Pré-remplit le pied de page de chaque nouvelle facture — reste modifiable facture par
              facture.
            </span>
            <textarea
              value={defaultLegalMention}
              onChange={(e) => {
                setDefaultLegalMention(e.target.value);
                markDirty();
              }}
              maxLength={1000}
              rows={3}
              className={inputClass}
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
              Devise par défaut
              <select
                value={defaultCurrency}
                onChange={(e) => {
                  setDefaultCurrency(e.target.value);
                  markDirty();
                }}
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
                onChange={(e) => {
                  setLanguage(e.target.value);
                  markDirty();
                }}
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
        </div>
        {error && (
          <p role="alert" className="font-body text-sm text-tag-red-fg">
            {error}
          </p>
        )}
      </form>

      <DefaultPaymentMethodsSection />

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
