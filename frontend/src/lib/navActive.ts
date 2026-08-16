// Some nav items point at a query-scoped view (e.g. /invoices?tab=devis)
// that Next's usePathname() alone can't tell apart from its sibling tab,
// since it never includes the query string. Mirrors the ?tab= defaulting
// logic on app/(app)/invoices/page.tsx itself
// (`tabParam === 'devis' ? 'devis' : 'factures'`) so the two never drift
// apart — a nav item and the page it links to must agree on what "active"
// means for the same href.
export function isNavItemActive(
  pathname: string | null,
  currentTab: string | null,
  href: string,
): boolean {
  const [path, query] = href.split('?');
  const targetTab = query ? new URLSearchParams(query).get('tab') : null;
  if (!targetTab) return pathname?.startsWith(path ?? href) ?? false;
  const normalizedCurrentTab = currentTab === 'devis' ? 'devis' : 'factures';
  return pathname === path && normalizedCurrentTab === targetTab;
}
