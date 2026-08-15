'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If both query params are present (user clicked the email link), submit
  // automatically — the form below is just a fallback for manual entry.
  useEffect(() => {
    const qEmail = params.get('email');
    const qCode = params.get('code');
    if (qEmail && qCode) {
      void verify(qEmail, qCode);
    }
    // Run once on mount only — verify is stable across renders and re-running
    // on every params change would re-submit on unrelated navigation.
  }, []);

  async function verify(emailValue: string, codeValue: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/verify-email', {
        method: 'POST',
        body: { email: emailValue, code: codeValue },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOO_MANY_VERIFY_ATTEMPTS') {
        setError('Trop de tentatives. Réessayez dans quelques minutes.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void verify(email, code);
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
        <h1 className="font-headings text-2xl font-bold text-foreground">Vérifiez votre email</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Nous avons envoyé un code à 8 caractères. Il expire dans 10 minutes.
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
          <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Code de vérification
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
            {submitting ? 'Vérification…' : 'Vérifier'}
          </button>
        </form>
      </div>

      <p className="text-center font-body text-sm text-muted-foreground">
        Pas reçu de code ?{' '}
        <Link href="/signup" className="font-medium text-primary">
          Réessayer l&apos;inscription
        </Link>
      </p>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
