# Banani implementation status — Merrudit (Espace Freelance)

Last updated: 2026-08-14

Flow: "Espace Freelance Merrudit" (`gCDOtOcM4d1l`). Full plan: [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md). Raw fetch cached: `_raw/selected-designs-raw.txt`.

> ⚠️ **2026-08-14, later same day: the Banani terracotta/cream/Space-Grotesk palette below was REPLACED wholesale** by a client-supplied design system (green `#059669` primary, IBM Plex Sans, pill badges, 12px cards, `rounded-full`/`shadow-card` tokens — see `frontend/src/app/globals.css` and `frontend/src/lib/constants.ts`). This was a design-only pass (colors/typography/component shapes) — it did **not** change any data model, route, or feature scope. Layout structure and component composition inherited from Banani screens are still the reference; only the *visual skin* changed. Don't re-apply the old hex values from this file's history.

## Done

_(none yet — Dashboard below is implemented but held at "in progress" pending user's visual sign-off)_

## In progress

- `Dashboard` — `src/app/(app)/dashboard/page.tsx` — plan: `dashboard.md` — redesign pass implemented (top bar + date + notification bell/dropdown, conditional alert banner, quick actions row, "À encaisser" panel), re-themed to the new green design system, awaiting user visual confirmation at 375/768/1280px before moving to the next screen
- App-wide re-theme (2026-08-14): all existing screens (Dashboard, Clients, Projects, Invoices + their `[id]` detail pages, public `/suivi/[token]` portal) had their design tokens swapped to the new system — primary green, pill status badges, 12px card radius + light shadow, IBM Plex Sans. `Devis & Factures`' empty state was rebuilt per the new "no generic empty states" rule (`InvoicesEmptyState.tsx`) with a contextual icon, value-prop copy, and a single green CTA — the header's own "+Nouveau" button is now hidden while the list is truly empty so only one green button is ever on screen at once.

## Pending (fetched from Banani, not yet planned/implemented in detail)

- `DashboardNotifications` — `DashboardNotifications.jsx` — Phase A (folded into Dashboard's `NotificationBell` dropdown, not a separate page)
- `DashboardNotifications` — `DashboardNotifications.jsx` — Phase A (variant of Dashboard)
- `ProjectsListView` — `ProjectsListView.jsx` — Phase A
- `ClientsListView` — `ClientsListView.jsx` — Phase A
- `InvoicesListView` — `InvoicesListView.jsx` — Phase A
- `NewProjectFormFull` — `NewProjectFormFull.jsx` — Phase B
- `AddClientFlow` — `AddClientFlow.jsx` — Phase B
- `NewQuoteFlow` — `NewQuoteFlow.jsx` — Phase B
- `SendPaymentReminderFlow` — `SendPaymentReminderFlow.jsx` — Phase C
- `ClientLinkBakeli` — `ClientLinkBakeli.jsx` — Phase C (public portal)
- `SettingsView` — `SettingsView.jsx` — Phase D
- `LandingPage` — `LandingPage.jsx` — Phase D (no backend dependency, can parallelize)

## Backend prerequisites (not screens, but block Phase A) — DONE 2026-08-14

- [x] Added `Client`, `Project`, `Invoice` models to `frontend/prisma/schema.prisma` — migration `20260814010828_freelance_crm_phase_a`, applied to Neon
- [x] `/api/clients` (GET cursor list + POST), `/api/projects` (GET + POST, validates `clientId` ownership), `/api/invoices` (GET + POST, sequential per-user numbering with P2002 retry) — each with a `route.test.ts` alongside it
- [x] `/api/dashboard/stats` (GET) — feeds the 4 Dashboard StatCards; returns raw numbers only, no French copy (that's the frontend's job)
- Full suite green: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` → 70 files / 612 tests passing

**Next**: the 4 Phase A screens (`Dashboard`, `ProjectsListView`, `ClientsListView`, `InvoicesListView`) still need actual UI — Prisma models + routes only get you data, not pixels. Each screen should get its own `.planning/banani/<screen-slug>.md` plan file per the `banani-design-implementation` skill's Step 3 before code, written right before that screen is built.

## Open design questions — resolved 2026-08-14 (defaults chosen, no user pushback yet)

- **Single vs multi-tenant** → single-tenant, `userId`-owned models, no `Organization`. Matches "Espace Freelance" (singular workspace) framing.
- **Invoice numbering** → per-user sequential, computed at creation time (`count()` inside the creating transaction). `INVOICE` → `{year}-{seq}` (e.g. `2025-001`), `QUOTE` → `QT-{year}-{seq}` (e.g. `QT-2025-008`) — matches the Banani mock data exactly.
- **Client Link Portal pay action** → CONFIRMED via source inspection (not guessed): `ClientLinkPortal.jsx` line 131 has a "Payer par MoMo" button. It's a **deposit/balance split**, not a flat invoice: "Acompte (30%)" paid up front via mobile money, "Solde" (balance) due at final delivery. The portal also shows a **5-step milestone tracker per project** (`ClientLinkStepCard`: stepNumber/title/status/description/fileCount/commentCount) and a **client comment thread** (`ClientComment`) feeding the freelancer's activity feed. This means Phase C needs two more models beyond the original plan: `ProjectStep` and `ProjectComment`, and `Invoice.docType` gains `DEPOSIT`/`BALANCE` alongside `INVOICE`/`QUOTE`. Not built in Phase A (out of scope for read-only dashboard/lists) — documented here so Phase C isn't a surprise.
- **Time tracking** ("Suivi du temps" in the sidebar nav) → out of scope, no screen was fetched for it. Revisit if/when a screen is provided.
