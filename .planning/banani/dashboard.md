# Dashboard — Banani → izikit (redesign pass)

## Source
- Banani screen: `Dashboard.jsx` (gCDOtOcM4d1l), shared: `StatCard.jsx`, `ProjectRow.jsx`, `ActivityItem.jsx`, `NotificationDropdown.jsx`
- Fetched: 2026-08-14 (cached `_raw/selected-designs-raw.txt`)

## Context (already true, not being changed)
- `StatCard`/`ActivityItem`/`ProjectRow` already match the Banani source ~1:1 (built in a prior session).
- Data already exists for everything below — **no schema or route changes**:
  - `/api/dashboard/stats` → revenue, activeProjects, pendingInvoices (amount + overdueCount), newClients
  - `/api/notifications?limit=8` (list) + `/api/notifications/count` (unread badge) + `PATCH /api/notifications {ids:'all'}` (mark-all-read) — all already built
  - `/api/invoices?limit=50` — filter client-side to `SENT`/`OVERDUE` for the "À encaisser" panel (no new backend query needed)
  - `/api/projects?status=IN_PROGRESS&limit=5` — already used for the projects list

## Gap vs current `(app)/dashboard/page.tsx`
1. Top bar is just "Bonjour, {firstName}" — Banani has title + French date + bell (unread dot) + primary "Nouveau projet" button
2. No alert banner (Banani: single most-urgent thing, orange)
3. No quick-actions row (3 buttons)
4. No "À encaisser" panel (unpaid invoices summary) — only the activity feed exists
5. No notification dropdown on bell click

## Design decisions (data-honest, no invented features)
- **Alert banner**: conditional, never fabricated. Priority: (a) `overdueCount > 0` → "N facture(s) en retard" linking to `/invoices`, else (b) soonest `IN_PROGRESS` project due within 7 days → links to `/projects/[id]`, else no banner.
- **Quick actions**: "Nouveau devis" → `openCreate('quote')`; "Lien client" → `/clients` (copy-link lives on the client detail page already); "Paiement Mobile Money" → `/invoices` (view what's pending).
- **À encaisser**: top 3 unpaid invoices (SENT/OVERDUE) by amount + total, each row links to `/clients/[id]`. **No "Envoyer rappel" button** — that requires an unbuilt reminder-email feature (out of scope for a design-only pass); omitted rather than faked.
- **Notification bell**: reuses the page's already-fetched `/api/notifications` data (passed as props, no duplicate fetch) + a fresh `/api/notifications/count` call for the badge. Dropdown = existing data, "Marquer tout comme lu" wired to the existing PATCH endpoint.

## Components
- **NEW** `src/components/dashboard/NotificationBell.tsx` — bell + unread dot + dropdown (list + mark-all-read), primitive-ish but domain-shaped so lives in `dashboard/`
- **NEW** `src/components/dashboard/AlertBanner.tsx` — single conditional banner, `{icon, text, href}` props
- **NEW** `src/components/dashboard/QuickActions.tsx` — 3-button row
- **NEW** `src/components/dashboard/UnpaidInvoicesPanel.tsx` — "À encaisser" card
- **REUSE** `StatCard`, `ProjectRow`, `ActivityItem`, `Icon`, `useCreateMenu`

## Responsive plan
- Base (375px): top bar wraps — title/date stack above bell+button row if needed; quick actions stack to 1 column; alert banner text wraps; À encaisser panel sits below activity feed in normal doc flow (already the case, single column on mobile since the grid is `grid-cols-1 lg:grid-cols-3`)
- `sm:` quick actions 2-3 col
- `lg:` full Banani layout — top bar single row, quick actions 3-col, 2:1 grid split

## Checklist
- [x] Plan written
- [x] Build `NotificationBell`, `AlertBanner`, `QuickActions`, `UnpaidInvoicesPanel`
- [x] Wire into `(app)/dashboard/page.tsx`
- [ ] 375px / 768px / 1280px check on dev server — pending user's visual review (they asked to see Dashboard first before I continue)
- [x] lint + typecheck + test (648/648 passing)
- [ ] Show user, get confirmation before continuing to Projects/Clients/Invoices lists
