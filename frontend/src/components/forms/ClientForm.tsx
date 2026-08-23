'use client';

import { useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { invalidateCachePrefix } from '@/lib/useApi';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { PlanLimitPrompt, isPlanLimitCode } from '@/components/ui/PlanLimitPrompt';

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-primary/40 focus:outline-none';

const SECTORS = [
  'Restauration & Alimentation',
  'Mode & Textile',
  'Beauté & Bien-être',
  'Associations & ONG',
  'Événementiel',
  'Technologie & Startups',
  'Conseil & Juridique',
  'Art & Culture',
  'Immobilier',
  'Éducation & Formation',
  'Autre',
];

function SectionHeading({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary">
        <Icon i={icon} size={14} />
      </div>
      <h3 className="font-headings text-sm font-bold text-foreground">{label}</h3>
    </div>
  );
}

export interface ClientFormExisting {
  id: string;
  name: string;
  company: string | null;
  contactName: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  sector: string | null;
  notes: string | null;
}

export function ClientForm({
  client,
  onDone,
}: {
  client?: ClientFormExisting;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(client?.name ?? '');
  const [company, setCompany] = useState(client?.company ?? '');
  const [contactName, setContactName] = useState(client?.contactName ?? '');
  const [website, setWebsite] = useState(client?.website ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [city, setCity] = useState(client?.city ?? '');
  const [sector, setSector] = useState(client?.sector ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [planLimitMessage, setPlanLimitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError('Le nom du client est obligatoire.');
      nameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      nameRef.current?.focus();
      return;
    }
    setNameError(null);
    setSubmitting(true);
    setError(null);
    setPlanLimitMessage(null);
    try {
      if (client) {
        await api(`/api/clients/${client.id}`, {
          method: 'PATCH',
          body: {
            name,
            company: company || null,
            contactName: contactName || null,
            website: website || null,
            phone: phone || null,
            email: email || null,
            city: city || null,
            sector: sector || null,
            notes: notes || null,
          },
        });
        invalidateCachePrefix('/api/clients');
        toast('Client mis à jour.', 'success');
      } else {
        await api('/api/clients', {
          method: 'POST',
          body: {
            name,
            ...(company ? { company } : {}),
            ...(contactName ? { contactName } : {}),
            ...(website ? { website } : {}),
            ...(phone ? { phone } : {}),
            ...(email ? { email } : {}),
            ...(city ? { city } : {}),
            ...(sector ? { sector } : {}),
            ...(notes ? { notes } : {}),
          },
        });
        invalidateCachePrefix('/api/clients');
        invalidateCachePrefix('/api/dashboard/stats');
        toast('Client ajouté.', 'success');
      }
      onDone();
    } catch (err) {
      if (err instanceof ApiError && isPlanLimitCode(err.code)) {
        const detail = err.body.message;
        setPlanLimitMessage(typeof detail === 'string' ? detail : err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-8 sm:grid-cols-3">
      <div className="flex flex-col gap-6 sm:col-span-2">
        <div>
          <SectionHeading icon="user" label="Profil" />
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
              Nom du client *
              <input
                ref={nameRef}
                type="text"
                placeholder="Ex : Aïssatou Ndiaye"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                aria-invalid={!!nameError}
                className={
                  nameError
                    ? `${inputClass} border-tag-red-fg focus:ring-tag-red-fg/40`
                    : inputClass
                }
              />
              {nameError && (
                <span role="alert" className="font-body text-xs font-normal text-tag-red-fg">
                  {nameError}
                </span>
              )}
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
                Entreprise (optionnel)
                <input
                  type="text"
                  placeholder="Ex : Tekki Foods"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
                Personne à contacter
                <input
                  type="text"
                  placeholder="Si différent du nom ci-dessus"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
              Site web (optionnel)
              <input
                type="url"
                placeholder="https://exemple.sn"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
        </div>

        <div>
          <SectionHeading icon="phone" label="Coordonnées" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
              Téléphone (WhatsApp)
              <input
                type="tel"
                placeholder="+221 77 000 00 00"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
              Email
              <input
                type="email"
                placeholder="client@entreprise.sn"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 font-body text-sm text-foreground sm:col-span-2">
              Ville
              <input
                type="text"
                placeholder="Ex : Cotonou, Akpakpa"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
        </div>

        <div>
          <SectionHeading icon="tag" label="Secteur d'activité" />
          <div className="flex flex-wrap gap-2">
            {SECTORS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSector((prev) => (prev === s ? '' : s))}
                className={`rounded-full border px-3 py-1.5 font-body text-xs font-medium ${
                  sector === s
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <SectionHeading icon="file-text" label="Notes internes" />
          <textarea
            rows={3}
            placeholder="Préférences, contexte, historique…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputClass} resize-none`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:col-span-1">
        <div className="rounded-lg border border-border bg-secondary/40 p-4">
          <p className="mb-3 font-body text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Aperçu
          </p>
          <div className="flex items-center gap-3">
            <Avatar name={name || '?'} className="h-11 w-11 flex-shrink-0 text-sm" />
            <div className="min-w-0">
              <p className="truncate font-body text-sm font-medium text-foreground">
                {name || 'Nom du client'}
              </p>
              {company && (
                <p className="truncate font-body text-xs text-muted-foreground">{company}</p>
              )}
            </div>
          </div>
          {sector && (
            <div className="mt-3 inline-block rounded-full bg-tag-orange px-2.5 py-1 font-body text-xs font-medium text-tag-orange-fg">
              {sector}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="mb-2 flex items-center gap-2">
            <Icon i="lightbulb" size={14} className="text-muted-foreground" />
            <p className="font-body text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Conseils
            </p>
          </div>
          <ul className="flex flex-col gap-2 font-body text-xs text-muted-foreground">
            <li>Le nom du client apparaît tel quel sur vos devis et factures.</li>
            <li>Un secteur bien choisi facilite le filtrage quand votre portefeuille grandit.</li>
          </ul>
        </div>

        {planLimitMessage && <PlanLimitPrompt message={planLimitMessage} />}
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
            : client
              ? 'Enregistrer les modifications'
              : 'Enregistrer le client'}
        </button>
      </div>
    </form>
  );
}
