'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: { email, code, newPassword },
      });
      // No auto-login — reset bumps tokenVersion, invalidating stolen sessions.
      router.push('/login?reset=ok');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOO_MANY_RESET_ATTEMPTS') {
        setError('Trop de tentatives. Réessayez dans 10 minutes.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
          <span className="font-headings text-lg font-bold text-primary-foreground">F</span>
        </div>
        <span className="font-headings text-xl font-bold tracking-tight text-foreground">
          Freelo
        </span>
      </div>

      <div className="rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
        <h1 className="font-headings text-2xl font-bold text-foreground">
          Réinitialiser le mot de passe
        </h1>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Code de réinitialisation
            <input
              type="text"
              required
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              className="rounded-md border border-border bg-input px-3 py-2.5 font-mono text-sm tracking-widest text-foreground uppercase focus:ring-2 focus:ring-primary/40 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Nouveau mot de passe
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none"
            />
            <span className="font-body text-xs text-muted-foreground">8 caractères minimum.</span>
          </label>
          {error && (
            <p role="alert" className="font-body text-sm text-tag-red-fg">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {submitting ? 'Réinitialisation…' : 'Réinitialiser'}
          </button>
        </form>
      </div>

      <p className="text-center font-body text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary">
          Retour à la connexion
        </Link>
      </p>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
