'use client';

// Debounced push of a Paramètres → Espace de travail change (theme, accent,
// sidebar color/shape, mobile nav style, bottom nav glass) to
// /api/settings/ui-prefs, so a choice made on one device reaches the others.
// Each of the 6 preference contexts calls this right next to its existing
// localStorage.setItem — same guard AuthContext.tsx uses to skip /api/auth/me
// for anonymous visitors (the JS-readable CSRF cookie only exists once
// logged in), reused here since these contexts live outside AuthProvider in
// the tree and can't call useAuth() themselves.
import { api } from '@/lib/api';
import { COOKIE_PREFIX } from '@/lib/constants';

const DEBOUNCE_MS = 600;

function isLoggedIn(): boolean {
  if (typeof document === 'undefined') return false;
  const name = `${COOKIE_PREFIX}-csrf=`;
  return document.cookie.split(';').some((c) => c.trim().startsWith(name));
}

let pending: Record<string, unknown> = {};
let timer: ReturnType<typeof setTimeout> | null = null;

export function syncUiPrefs(patch: Record<string, string | null>): void {
  if (!isLoggedIn()) return;
  pending = { ...pending, ...patch };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const body = pending;
    pending = {};
    timer = null;
    void api('/api/settings/ui-prefs', { method: 'PATCH', body }).catch(() => {
      // Best-effort — the change still applies locally either way; a
      // failed sync just means it won't reach other devices this time.
    });
  }, DEBOUNCE_MS);
}
