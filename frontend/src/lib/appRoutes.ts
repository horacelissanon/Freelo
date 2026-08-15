// Path segments that make up the private, authenticated route group
// (frontend/src/app/(app)/*: dashboard, clients, invoices, projects,
// settings). Next.js route groups — the parenthesized `(app)` folder —
// don't add a URL segment, so there's no shared literal prefix to test
// against; this list has to be kept in sync with the folders under
// app/(app)/ by hand.
//
// Used to scope freelancer personalization (accent/sidebar color — see
// contexts/AccentColorContext.tsx, contexts/SidebarColorContext.tsx,
// components/ScopedColorGuard.tsx) to their own dashboard so it never
// bleeds into public pages (landing, login, signup, /suivi/[token]...)
// that represent Freelo's own brand, not any one freelancer's.
export const APP_ROUTE_SEGMENTS = [
  'dashboard',
  'clients',
  'invoices',
  'projects',
  'settings',
] as const;

export function isAppRoute(pathname: string): boolean {
  const first = pathname.split('/')[1] ?? '';
  return (APP_ROUTE_SEGMENTS as readonly string[]).includes(first);
}
