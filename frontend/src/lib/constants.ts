// Monolith: the API lives in the same Next.js app under /api/*, so the
// default is an empty string (same-origin / relative fetch). Override only
// for rare cross-origin setups (e.g. a mobile client hitting a hosted
// instance). The legacy `http://localhost:4000` default was a leftover from
// the pre-monolith era when the backend ran as a separate Express server.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
export const COOKIE_PREFIX = process.env.NEXT_PUBLIC_COOKIE_PREFIX ?? 'app';

// ─────────────────────────────────────────────────────────────────────────
// Merrudit (freelance CRM) — French labels + status→color mapping. Centralized
// here per the banani-design-implementation skill's i18n rule (no strings
// scattered across JSX). Colors reference the Merrudit `@theme` tag tokens
// (see app/globals.css).
// ─────────────────────────────────────────────────────────────────────────

export type ProjectType =
  | 'LOGO'
  | 'IDENTITY'
  | 'POSTER'
  | 'PACKAGING'
  | 'SOCIAL'
  | 'PRINT'
  | 'UI_WEB'
  | 'OTHER';

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  LOGO: 'Logo',
  IDENTITY: 'Identité visuelle',
  POSTER: 'Affiche / Flyer',
  PACKAGING: 'Packaging',
  SOCIAL: 'Réseaux sociaux',
  PRINT: 'Print / Presse',
  UI_WEB: 'UI / Web',
  OTHER: 'Autre',
};

export const PROJECT_TYPE_ICONS: Record<ProjectType, string> = {
  LOGO: 'layers',
  IDENTITY: 'palette',
  POSTER: 'image',
  PACKAGING: 'package',
  SOCIAL: 'share-2',
  PRINT: 'printer',
  UI_WEB: 'globe',
  OTHER: 'tag',
};

export type ProjectStatus = 'IN_PROGRESS' | 'PENDING' | 'DELIVERED';

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  IN_PROGRESS: 'En cours',
  PENDING: 'En attente',
  DELIVERED: 'Livré',
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, { bg: string; fg: string }> = {
  IN_PROGRESS: { bg: 'bg-tag-orange', fg: 'text-tag-orange-fg' },
  PENDING: { bg: 'bg-tag-orange', fg: 'text-tag-orange-fg' },
  DELIVERED: { bg: 'bg-tag-green', fg: 'text-tag-green-fg' },
};

export type ClientStatus = 'active' | 'pending' | 'archived';

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: 'Actif',
  pending: 'En attente',
  archived: 'Archivé',
};

export const CLIENT_STATUS_COLORS: Record<ClientStatus, { bg: string; fg: string }> = {
  active: { bg: 'bg-tag-green', fg: 'text-tag-green-fg' },
  pending: { bg: 'bg-tag-orange', fg: 'text-tag-orange-fg' },
  archived: { bg: 'bg-muted', fg: 'text-muted-foreground' },
};

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'ACCEPTED';

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Brouillon',
  SENT: 'En attente',
  PAID: 'Payée',
  OVERDUE: 'En retard',
  ACCEPTED: 'Acceptée',
};

export const INVOICE_STATUS_COLORS: Record<
  InvoiceStatus,
  { bg: string; fg: string; icon: string }
> = {
  DRAFT: { bg: 'bg-muted', fg: 'text-muted-foreground', icon: 'file-text' },
  SENT: { bg: 'bg-tag-orange', fg: 'text-tag-orange-fg', icon: 'clock' },
  PAID: { bg: 'bg-tag-green', fg: 'text-tag-green-fg', icon: 'check-circle' },
  OVERDUE: { bg: 'bg-tag-red', fg: 'text-tag-red-fg', icon: 'alert-circle' },
  ACCEPTED: { bg: 'bg-tag-green', fg: 'text-tag-green-fg', icon: 'check-circle' },
};

export type InvoiceDocType = 'INVOICE' | 'QUOTE';

export const DOC_TYPE_LABELS: Record<InvoiceDocType, { short: string; long: string }> = {
  INVOICE: { short: 'FAC', long: 'Facture' },
  QUOTE: { short: 'QT', long: 'Devis' },
};

export type ProjectStepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export const STEP_STATUS_LABELS: Record<ProjectStepStatus, string> = {
  COMPLETED: 'Complétée',
  IN_PROGRESS: 'En cours',
  PENDING: 'À venir',
};

export const STEP_STATUS_COLORS: Record<ProjectStepStatus, { bg: string; fg: string }> = {
  COMPLETED: { bg: 'bg-tag-green', fg: 'text-tag-green-fg' },
  IN_PROGRESS: { bg: 'bg-tag-orange', fg: 'text-tag-orange-fg' },
  PENDING: { bg: 'bg-muted', fg: 'text-muted-foreground' },
};
