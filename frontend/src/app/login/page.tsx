'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const justReset = params.get('reset') === 'ok';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOO_MANY_LOGIN_ATTEMPTS') {
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
        <h1 className="font-headings text-2xl font-bold text-foreground">Connexion</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Accédez à votre espace freelance.
        </p>

        {justReset && (
          <p className="mt-4 rounded-md bg-tag-green px-3 py-2 font-body text-sm text-tag-green-fg">
            Mot de passe réinitialisé. Vous pouvez vous connecter.
          </p>
        )}

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
            Mot de passe
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {submitting ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="mt-4 font-body text-sm text-muted-foreground">
          <Link href="/forgot-password" className="font-medium text-primary">
            Mot de passe oublié ?
          </Link>
        </p>
      </div>

      <p className="text-center font-body text-sm text-muted-foreground">
        Pas de compte ?{' '}
        <Link href="/signup" className="font-medium text-primary">
          Créer un compte
        </Link>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
