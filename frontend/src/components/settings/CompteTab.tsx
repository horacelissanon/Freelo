'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { uploadFile } from '@/lib/upload';
import { useAuth, type User } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';

const inputClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

export function CompteTab({ user }: { user: User }) {
  const { refresh } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user.name ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/me', {
        method: 'PATCH',
        body: { name: name.trim(), phone: phone.trim(), bio: bio.trim() },
      });
      await refresh();
      toast('Profil mis à jour.', 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

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
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Nom complet
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Email
          <input
            type="email"
            value={user.email}
            disabled
            readOnly
            className={`${inputClass} opacity-60`}
          />
        </label>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Téléphone
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Bio
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
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
        <button
          type="submit"
          disabled={submitting}
          className="mt-1 w-fit rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </div>
  );
}
