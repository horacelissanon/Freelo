'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOO_MANY_RESET_REQUESTS') {
        setError('Trop de demandes pour cet email. Réessayez dans une heure.');
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
          <svg
            viewBox="0 0 64 64"
            className="h-5 w-5 text-primary-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth={8}
            strokeLinecap="square"
          >
            <line x1="17" y1="19" x2="47" y2="19" />
            <line x1="17" y1="45" x2="47" y2="45" />
            <line x1="15" y1="47" x2="49" y2="17" strokeWidth={7.5} />
          </svg>
        </div>
        <span className="font-headings text-xl font-bold tracking-tight text-foreground">
          ZeFacto
        </span>
      </Link>

      <div className="rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
        {submitted ? (
          <>
            <h1 className="font-headings text-2xl font-bold text-foreground">
              Vérifiez votre email
            </h1>
            <p className="mt-2 font-body text-sm text-muted-foreground">
              Si un compte existe pour <strong className="text-foreground">{email}</strong>, vous
              recevrez un code de réinitialisation dans la minute.
            </p>
            <p className="mt-4 font-body text-sm text-muted-foreground">
              <Link href="/reset-password" className="font-medium text-primary">
                Vous avez déjà votre code ?
              </Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="font-headings text-2xl font-bold text-foreground">
              Mot de passe oublié ?
            </h1>
            <p className="mt-1 font-body text-sm text-muted-foreground">
              Entrez votre email, nous vous enverrons un code de réinitialisation.
            </p>
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
                {submitting ? 'Envoi…' : 'Envoyer le code'}
              </button>
            </form>
          </>
        )}
      </div>

      <p className="text-center font-body text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary">
          Retour à la connexion
        </Link>
      </p>
    </main>
  );
}
