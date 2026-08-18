'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Icon } from '@/components/ui/Icon';

const HIGHLIGHTS: { icon: string; label: string }[] = [
  { icon: 'folder-open', label: 'Projets suivis étape par étape' },
  { icon: 'file-text', label: 'Devis et factures en quelques clics' },
  { icon: 'bar-chart', label: 'Statistiques claires sur votre activité' },
];

const fieldClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

type AuthMode = 'login' | 'signup';

function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const justReset = params.get('reset') === 'ok';

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
  }

  async function onLoginSubmit(e: FormEvent) {
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

  async function onSignupSubmit(e: FormEvent) {
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
    <main className="flex min-h-screen flex-col bg-background text-foreground lg:flex-row">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex lg:w-1/2 xl:w-[45%]">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <span className="font-headings text-lg font-bold text-primary-foreground">F</span>
          </div>
          <span className="font-headings text-xl font-bold tracking-tight">Freelo</span>
        </Link>

        <div className="max-w-md">
          <h1 className="font-headings text-3xl font-bold leading-tight xl:text-4xl">
            Le CRM taillé sur mesure pour les freelances.
          </h1>
          <p className="mt-4 font-body text-base text-sidebar-foreground/80">
            Freelo centralise vos projets, vos devis, vos factures et le suivi de vos clients — pour
            que rien ne se perde entre deux outils.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {HIGHLIGHTS.map((h) => (
            <div key={h.label} className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-sidebar-muted">
                <Icon i={h.icon} size={16} className="text-sidebar-foreground" />
              </div>
              <span className="font-body text-sm text-sidebar-foreground/90">{h.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-12 xl:px-20">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center justify-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <span className="font-headings text-lg font-bold text-primary-foreground">F</span>
            </div>
            <span className="font-headings text-xl font-bold tracking-tight text-foreground">
              Freelo
            </span>
          </Link>

          <h2 className="text-center font-headings text-2xl font-bold text-foreground">
            Bienvenue
          </h2>
          <p className="mt-1 text-center font-body text-sm text-muted-foreground">
            Connectez-vous ou créez un compte pour continuer.
          </p>

          <div className="mt-5 flex gap-1 rounded-lg bg-secondary p-1">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 rounded-md py-2 font-body text-sm font-medium transition-colors ${
                mode === 'login' ? 'bg-canvas text-foreground shadow-card' : 'text-muted-foreground'
              }`}
            >
              Se connecter
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`flex-1 rounded-md py-2 font-body text-sm font-medium transition-colors ${
                mode === 'signup'
                  ? 'bg-canvas text-foreground shadow-card'
                  : 'text-muted-foreground'
              }`}
            >
              Créer un compte
            </button>
          </div>

          {justReset && mode === 'login' && (
            <p className="mt-4 rounded-md bg-tag-green px-3 py-2 font-body text-sm text-tag-green-fg">
              Mot de passe réinitialisé. Vous pouvez vous connecter.
            </p>
          )}

          {mode === 'login' ? (
            <form onSubmit={onLoginSubmit} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
                Email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
                Mot de passe
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${fieldClass} w-full pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                    }
                    title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <Icon i={showPassword ? 'eye-off' : 'eye'} size={16} />
                  </button>
                </div>
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
              <p className="font-body text-sm text-muted-foreground">
                <Link href="/forgot-password" className="font-medium text-primary">
                  Mot de passe oublié ?
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={onSignupSubmit} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
                Nom complet
                <input
                  type="text"
                  required
                  autoComplete="name"
                  maxLength={200}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={fieldClass}
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
                  className={fieldClass}
                />
              </label>
              <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
                Mot de passe
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${fieldClass} w-full pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                    }
                    title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <Icon i={showPassword ? 'eye-off' : 'eye'} size={16} />
                  </button>
                </div>
                <span className="font-body text-xs text-muted-foreground">
                  8 caractères minimum.
                </span>
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
          )}
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}
