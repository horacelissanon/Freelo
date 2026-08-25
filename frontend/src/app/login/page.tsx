'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Icon } from '@/components/ui/Icon';
import { PhoneInput } from '@/components/ui/PhoneInput';

const HIGHLIGHTS: { icon: string; label: string }[] = [
  { icon: 'folder-open', label: 'Projets suivis étape par étape' },
  { icon: 'file-text', label: 'Devis et factures en quelques clics' },
  { icon: 'bar-chart', label: 'Statistiques claires sur votre activité' },
];

const fieldClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

type AuthMode = 'login' | 'signup';

// Read by verify-email/page.tsx right after the code is confirmed (there's
// no session yet at signup time to PATCH /api/auth/me against) — see the
// comment on PENDING_PHONE_KEY there for the full handoff.
const PENDING_PHONE_KEY = 'merrudit-pending-signup-phone';

const googleSignInHref = '/api/auth/oauth/google/start?next=/dashboard';

function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<AuthMode>(params.get('mode') === 'signup' ? 'signup' : 'login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
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
      const name = `${firstName.trim()} ${lastName.trim()}`.trim();
      await api('/api/auth/signup', { method: 'POST', body: { name, email, password } });
      // POST /api/auth/signup doesn't accept a phone (no session exists yet
      // to attach it to) — stash it so verify-email can PATCH it in once the
      // account is confirmed and cookies are issued.
      if (phone.trim()) {
        try {
          sessionStorage.setItem(PENDING_PHONE_KEY, phone.trim());
        } catch {
          // Storage unavailable — the phone is simply skipped, not fatal.
        }
      }
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
          <span className="font-headings text-xl font-bold tracking-tight">ZeFacto</span>
        </Link>

        <div className="max-w-md">
          <h1 className="font-headings text-3xl font-bold leading-tight xl:text-4xl">
            Le CRM taillé sur mesure pour les freelances.
          </h1>
          <p className="mt-4 font-body text-base text-sidebar-foreground/80">
            ZeFacto centralise vos projets, vos devis, vos factures et le suivi de vos clients —
            pour que rien ne se perde entre deux outils.
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
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
                  Prénom
                  <input
                    type="text"
                    required
                    autoComplete="given-name"
                    maxLength={100}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
                  Nom
                  <input
                    type="text"
                    required
                    autoComplete="family-name"
                    maxLength={100}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={fieldClass}
                  />
                </label>
              </div>
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
                Téléphone (Optionnel)
                <PhoneInput value={phone} onChange={setPhone} />
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

          {mode === 'signup' && (
            <>
              <div className="mt-6 flex items-center gap-3 font-body text-xs tracking-wider text-muted-foreground uppercase">
                <span className="h-px flex-1 bg-border" />
                Ou continuer avec
                <span className="h-px flex-1 bg-border" />
              </div>

              <a
                href={googleSignInHref}
                className="mt-4 flex items-center justify-center gap-2 rounded-md border border-border bg-canvas px-5 py-2.5 font-body text-sm font-medium text-foreground hover:bg-secondary"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continuer avec Google
              </a>

              <p className="mt-4 text-center font-body text-xs text-muted-foreground">
                En créant un compte vous acceptez nos{' '}
                <Link href="/cgu" className="text-primary hover:underline">
                  conditions d&apos;utilisation
                </Link>{' '}
                et notre{' '}
                <Link href="/confidentialite" className="text-primary hover:underline">
                  politique de confidentialité
                </Link>
                .
              </p>
            </>
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
