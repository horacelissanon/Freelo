'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/signup', { method: 'POST', body: { name, email, password } });
      // Signup never logs in directly — the user must verify their email.
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOO_MANY_SIGNUP_ATTEMPTS') {
        setError('Trop de tentatives. Réessayez dans quelques minutes.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <Link href="/" className="flex items-center justify-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
          <span className="font-headings text-lg font-bold text-primary-foreground">F</span>
        </div>
        <span className="font-headings text-xl font-bold tracking-tight text-foreground">
          Freelo
        </span>
      </Link>

      <div className="rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
        <h1 className="font-headings text-2xl font-bold text-foreground">Créer un compte</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Gérez vos clients, projets et factures en un seul endroit.
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Nom complet
            <input
              type="text"
              required
              autoComplete="name"
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none"
            />
          </label>
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
            Mot de passe
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {submitting ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>
      </div>

      <p className="text-center font-body text-sm text-muted-foreground">
        Déjà un compte ?{' '}
        <Link href="/login" className="font-medium text-primary">
          Se connecter
        </Link>
      </p>
    </main>
  );
}
