# Merrudit (Espace Freelance) — Banani → izikit implementation plan

Source: Banani flow "Espace Freelance Merrudit" (`gCDOtOcM4d1l`), 12 screens, 17 shared components, fetched 2026-08-14.
Raw fetch cached at `.planning/banani/_raw/selected-designs-raw.txt` (JSON: `flow`, `designs[]`, `sharedFiles[]` — component-project shape, not raw HTML/CSS).

## What the app is

A workspace for a solo freelancer (design/dev/consulting) in francophone West Africa to manage **clients, projects, quotes/invoices, and payments**. French-first copy, FCFA amounts, mobile-money payment mentions (MTN MoMo, Wave, Orange Money) — this is squarely what Bictorys already covers in the starter.

Design tokens (`/style.css`): warm terracotta/cream palette (`--color-primary: #D4501A`, `--color-accent: #2A5C45` dark green, `--color-background: #F5F1EB`), dark sidebar (`#1A1714`), font **Space Grotesk**, Tailwind v4 `@theme` — compatible as-is with the starter's zero-config Tailwind v4 setup ([frontend/src/app/globals.css](../../frontend/src/app/globals.css)).

## Screens fetched (12)

| Screen | File | Auth? | Maps to |
|---|---|---|---|
| Dashboard | `Dashboard.jsx` | ✅ | stats + projects + activity feed |
| Dashboard — Notification Dropdown | `DashboardNotifications.jsx` | ✅ | Dashboard variant, dropdown open |
| Projects List | `ProjectsListView.jsx` | ✅ | full project list |
| Clients List | `ClientsListView.jsx` | ✅ | full client list |
| New Project (full form) | `NewProjectFormFull.jsx` | ✅ | modal/flow over Dashboard |
| Add Client (modal) | `AddClientFlow.jsx` | ✅ | modal over Clients List |
| Landing Page | `LandingPage.jsx` | ❌ public | marketing |
| New Quote (modal) | `NewQuoteFlow.jsx` | ✅ | modal over Dashboard |
| Invoices & Quotes | `InvoicesListView.jsx` | ✅ | unified list, `type: invoice\|quote` |
| Client Link Portal — Bakeli Studio | `ClientLinkBakeli.jsx` | ❌ public, token-scoped | client-facing project/invoice view |
| Send Payment Reminder (modal) | `SendPaymentReminderFlow.jsx` | ✅ | modal over Dashboard |
| Settings | `SettingsView.jsx` | ✅ | account + business profile |

## Backend gap analysis

### Reused as-is (no backend work)

- **Auth** — every authenticated screen just needs `requireAuth` + the existing session/cookie flow. No changes.
- **Notifications** — `NotificationDropdown.jsx`'s shape (`type/icon/title/text/time/unread`) maps directly onto the existing `Notification` model (`type/title/body/data/dedupeKey`) and `/api/notifications`, `/api/notifications/count` routes. Just add new `type` values (`comment`, `payment`, `link_opened`, `quote_accepted`, `discharge_signed`).
- **Payments** — client-side mobile money payment (MTN MoMo mentioned in mock data) is exactly what `PaymentProvider`/Bictorys already does. Reuse `Order` as the payment-transaction ledger (see Invoice design below), not as the freelancer-facing document.
- **File uploads** — client avatars (`image: true` in `ClientsList` mock data) and the freelancer's business logo (`AccountSettings.jsx`) go through the existing `/api/upload` (Cloudinary).
- **Email** — `SendReminderModal` → new notification template in [notifications/templates.ts](../../frontend/src/lib/server/notifications/templates.ts), dispatched via the existing outbox, delivered by Resend.

### New domain models needed (none of these exist yet)

The starter's `Order`/`Withdrawal` models are payer-owned marketplace-checkout models — they don't fit "freelancer bills an external client." Three new models, all `userId`-owned (no `Organization` needed — this is single-freelancer, not multi-tenant):

```prisma
model Client {
  id          String   @id @default(cuid())
  userId      String   // owning freelancer
  name        String
  contactName String?
  email       String?
  phone       String?
  status      String   @default("active") // active | pending | archived
  imageUrl    String?  // Cloudinary
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  projects    Project[]
  invoices    Invoice[]
}

model Project {
  id          String    @id @default(cuid())
  userId      String
  clientId    String
  name        String
  status      String    @default("IN_PROGRESS") // IN_PROGRESS | PENDING | DELIVERED
  progress    Int       @default(0) // 0-100
  amount      Int       // smallest unit, matches Order convention
  currency    String    @default("XOF")
  dueDate     DateTime?
  step        String?   // current milestone label, freeform
  publicToken String    @unique @default(cuid()) // for Client Link Portal
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  invoices    Invoice[]
}

model Invoice {
  id          String    @id @default(cuid())
  userId      String
  clientId    String
  projectId   String?
  docType     String    // INVOICE | QUOTE
  number      String    // "2025-001" / "QT-2025-008", sequential per user+docType
  description String?
  amount      Int
  currency    String    @default("XOF")
  status      String    @default("DRAFT") // DRAFT | SENT | PAID | OVERDUE | ACCEPTED
  issueDate   DateTime  @default(now())
  dueDate     DateTime?
  orderId     String?   @unique // set once a payment Order is created against this invoice
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

Payment flow reuses existing infra: client opens the public `Project.publicToken` link → "Payer" action creates a guest `Order` (nullable `userId`, `customerEmail`/`customerName` already supported) with `metadata: { invoiceId }` → Bictorys webhook marks it `PAID` → outbox event updates `Invoice.status = 'PAID'` and notifies the freelancer. No changes to the protected `webhook/handler.ts` or `payments/circuit-breaker.ts` — this is pure composition.

### New routes needed

| Route | Verb | Notes |
|---|---|---|
| `/api/clients` | GET, POST | `requireAuth` + `verifyCsrf` on POST |
| `/api/clients/[id]` | GET, PATCH, DELETE | |
| `/api/projects` | GET, POST | list needs join-count for dashboard stats |
| `/api/projects/[id]` | GET, PATCH | |
| `/api/invoices` | GET, POST | filter by `docType` for the unified list |
| `/api/invoices/[id]` | GET, PATCH | |
| `/api/invoices/[id]/send-reminder` | POST | enqueues outbox email event |
| `/api/public/projects/[token]` | GET | no auth — Client Link Portal read |
| `/api/public/projects/[token]/pay` | POST | no auth — creates guest `Order`, mirrors existing guest-checkout path in `/api/orders` |
| `/api/dashboard/stats` | GET | revenue-this-month, active-project-count, etc. for `StatCard` |

Settings screen (`AccountSettings.jsx`, 11.6KB — largest shared component) needs new `User` fields: `businessName`, `logoUrl`, `defaultCurrency` — small additive migration, no `PATCH /api/auth/me` contract break.

## Open questions for you

1. **Single-tenant or multi-tenant?** Plan above assumes each signed-up `User` is one freelancer with their own clients/projects/invoices (no `Organization`). Confirm, or say if teams/multiple freelancers should share a workspace (would pull in `Organization` + `requireOrgRole`).
2. **Invoice numbering** — sequential per user (`2025-001`, `2025-002`...) or per year? Needs a counter somewhere (simplest: `count()` + zero-pad at creation time inside a transaction to avoid races).
3. **Client Link Portal payment** — should the client be able to pay a quote directly (converting it to accepted+paid), or only pay invoices? The mock only shows a Bakeli Studio *project* portal, not explicitly a pay button — need to see that screen's actual actions before wiring `/pay`.
4. **"Suivi du temps" (time tracking)** appears in the `Sidebar` nav (`clock` icon) but no screen was fetched for it — out of scope for this batch, or should I plan for it too?

## Suggested build order (phased)

1. **Phase A — data + read-only dashboard**: `Client`/`Project`/`Invoice` Prisma models + migration, `/api/clients`, `/api/projects`, `/api/invoices` (GET only), `/api/dashboard/stats`. Build `Dashboard.jsx` + `ProjectsListView.jsx` + `ClientsListView.jsx` + `InvoicesListView.jsx` (read-only UI first — fastest path to something clickable).
2. **Phase B — write flows**: POST endpoints, `NewProjectFormFull`, `AddClientFlow`, `NewQuoteFlow` modals.
3. **Phase C — money loop**: public token route + guest `Order` creation + Bictorys webhook wiring for invoice payment, `SendPaymentReminderFlow` (email template + outbox), `ClientLinkBakeli` portal page.
4. **Phase D — polish**: `SettingsView` (business profile + logo upload), `LandingPage` (public marketing, no backend dependency — can actually be built anytime in parallel).

Each screen gets its own detailed plan file (`.planning/banani/<screen-slug>.md`, per the `banani-design-implementation` skill template — structure map, component breakdown, token mapping, responsive plan, checklist) written **right before** that screen is implemented, not all upfront. See `STATUS.md` for tracking.
