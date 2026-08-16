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

// Pro-only beyond XOF (see PLAN_LIMIT_CURRENCY gating in /api/projects and
// /api/invoices) — the list itself is shown to everyone; the plan-limit
// error surfaces on submit for FREE accounts via the existing
// PlanLimitPrompt pattern, no separate plan check needed client-side.
export const CURRENCIES: { value: string; label: string }[] = [
  { value: 'XOF', label: 'XOF — Franc CFA (UEMOA)' },
  { value: 'XAF', label: 'XAF — Franc CFA (CEMAC)' },
  { value: 'MAD', label: 'MAD — Dirham marocain' },
  { value: 'GNF', label: 'GNF — Franc guinéen' },
  { value: 'GHS', label: 'GHS — Cedi ghanéen' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'USD', label: 'USD — Dollar américain' },
];

// Secteur freelance — the domain of work, chosen per project/devis (not a
// fixed user profile trait: one freelancer account can span several
// sectors). Drives which ProjectType values SECTOR_PROJECT_TYPES offers.
// List sourced from the landing page's rotating hero words + personas
// (frontend/src/app/page.tsx TARGET_PROFESSIONS/PERSONAS).
export type FreelanceSector =
  | 'DESIGN'
  | 'DEV'
  | 'REDACTION'
  | 'CONSULTING'
  | 'VIDEO'
  | 'COMMUNITY'
  | 'OTHER';

export const FREELANCE_SECTOR_LABELS: Record<FreelanceSector, string> = {
  DESIGN: 'Design & Graphisme',
  DEV: 'Développement',
  REDACTION: 'Rédaction',
  CONSULTING: 'Consulting',
  VIDEO: 'Vidéo',
  COMMUNITY: 'Community management',
  OTHER: 'Autre',
};

export const FREELANCE_SECTOR_ICONS: Record<FreelanceSector, string> = {
  DESIGN: 'palette',
  DEV: 'globe',
  REDACTION: 'pen-line',
  CONSULTING: 'briefcase',
  VIDEO: 'camera',
  COMMUNITY: 'message-circle',
  OTHER: 'tag',
};

export type ProjectType =
  // Design & Graphisme
  | 'LOGO'
  | 'IDENTITY'
  | 'POSTER'
  | 'PACKAGING'
  | 'SOCIAL'
  | 'PRINT'
  | 'UI_WEB'
  // Développement
  | 'WEBSITE'
  | 'MOBILE_APP'
  | 'SAAS_APP'
  | 'API_INTEGRATION'
  | 'MAINTENANCE'
  // Rédaction
  | 'BLOG_ARTICLE'
  | 'SEO_CONTENT'
  | 'COPYWRITING'
  | 'TECHNICAL_DOC'
  | 'NEWSLETTER'
  // Consulting
  | 'STRATEGY'
  | 'AUDIT'
  | 'TRAINING'
  | 'COACHING'
  | 'MARKET_RESEARCH'
  // Vidéo
  | 'PROMO_VIDEO'
  | 'SOCIAL_VIDEO'
  | 'MOTION_DESIGN'
  | 'VIDEO_EDITING'
  | 'DOCUMENTARY'
  // Community management
  | 'CONTENT_CALENDAR'
  | 'SOCIAL_CAMPAIGN'
  | 'COMMUNITY_GROWTH'
  | 'MODERATION'
  | 'ADS_MANAGEMENT'
  // Universal fallback, available in every sector
  | 'OTHER';

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  LOGO: 'Logo',
  IDENTITY: 'Identité visuelle',
  POSTER: 'Affiche / Flyer',
  PACKAGING: 'Packaging',
  SOCIAL: 'Réseaux sociaux',
  PRINT: 'Print / Presse',
  UI_WEB: 'UI / Web',
  WEBSITE: 'Site web',
  MOBILE_APP: 'Application mobile',
  SAAS_APP: 'Application SaaS',
  API_INTEGRATION: 'Intégration API',
  MAINTENANCE: 'Maintenance',
  BLOG_ARTICLE: 'Article de blog',
  SEO_CONTENT: 'Contenu SEO',
  COPYWRITING: 'Copywriting',
  TECHNICAL_DOC: 'Documentation technique',
  NEWSLETTER: 'Newsletter',
  STRATEGY: 'Stratégie',
  AUDIT: 'Audit',
  TRAINING: 'Formation',
  COACHING: 'Coaching',
  MARKET_RESEARCH: 'Étude de marché',
  PROMO_VIDEO: 'Vidéo promotionnelle',
  SOCIAL_VIDEO: 'Vidéo réseaux sociaux',
  MOTION_DESIGN: 'Motion design',
  VIDEO_EDITING: 'Montage vidéo',
  DOCUMENTARY: 'Documentaire',
  CONTENT_CALENDAR: 'Calendrier de contenu',
  SOCIAL_CAMPAIGN: 'Campagne réseaux sociaux',
  COMMUNITY_GROWTH: 'Croissance de communauté',
  MODERATION: 'Modération',
  ADS_MANAGEMENT: 'Gestion des publicités',
  OTHER: 'Autre',
};

// Zod `.enum()` needs a non-empty tuple, not a plain string[] — reused by
// both project-creation routes' Body schemas instead of duplicating the
// full ~30-value literal list in each.
export const PROJECT_TYPE_VALUES = Object.keys(PROJECT_TYPE_LABELS) as [
  ProjectType,
  ...ProjectType[],
];

export const PROJECT_TYPE_ICONS: Record<ProjectType, string> = {
  LOGO: 'layers',
  IDENTITY: 'palette',
  POSTER: 'image',
  PACKAGING: 'package',
  SOCIAL: 'share-2',
  PRINT: 'printer',
  UI_WEB: 'globe',
  WEBSITE: 'globe',
  MOBILE_APP: 'smartphone',
  SAAS_APP: 'layout-dashboard',
  API_INTEGRATION: 'link',
  MAINTENANCE: 'wrench',
  BLOG_ARTICLE: 'file-text',
  SEO_CONTENT: 'search',
  COPYWRITING: 'pen-line',
  TECHNICAL_DOC: 'file-check',
  NEWSLETTER: 'mail',
  STRATEGY: 'trending-up',
  AUDIT: 'shield',
  TRAINING: 'lightbulb',
  COACHING: 'message-square',
  MARKET_RESEARCH: 'bar-chart',
  PROMO_VIDEO: 'camera',
  SOCIAL_VIDEO: 'share-2',
  MOTION_DESIGN: 'layers',
  VIDEO_EDITING: 'film',
  DOCUMENTARY: 'monitor',
  CONTENT_CALENDAR: 'calendar',
  SOCIAL_CAMPAIGN: 'megaphone',
  COMMUNITY_GROWTH: 'users',
  MODERATION: 'shield',
  ADS_MANAGEMENT: 'send',
  OTHER: 'tag',
};

// Which ProjectType values the UI offers once a FreelanceSector is chosen.
// 'OTHER' (type) is always included as the universal escape hatch, in every
// sector including the 'OTHER' sector itself (where it's the only option —
// "Autre : précisez" is captured as free text alongside the sector picker,
// not as a further type breakdown).
export const SECTOR_PROJECT_TYPES: Record<FreelanceSector, ProjectType[]> = {
  DESIGN: ['LOGO', 'IDENTITY', 'POSTER', 'PACKAGING', 'SOCIAL', 'PRINT', 'UI_WEB', 'OTHER'],
  DEV: ['WEBSITE', 'MOBILE_APP', 'SAAS_APP', 'API_INTEGRATION', 'MAINTENANCE', 'OTHER'],
  REDACTION: ['BLOG_ARTICLE', 'SEO_CONTENT', 'COPYWRITING', 'TECHNICAL_DOC', 'NEWSLETTER', 'OTHER'],
  CONSULTING: ['STRATEGY', 'AUDIT', 'TRAINING', 'COACHING', 'MARKET_RESEARCH', 'OTHER'],
  VIDEO: ['PROMO_VIDEO', 'SOCIAL_VIDEO', 'MOTION_DESIGN', 'VIDEO_EDITING', 'DOCUMENTARY', 'OTHER'],
  COMMUNITY: [
    'CONTENT_CALENDAR',
    'SOCIAL_CAMPAIGN',
    'COMMUNITY_GROWTH',
    'MODERATION',
    'ADS_MANAGEMENT',
    'OTHER',
  ],
  OTHER: ['OTHER'],
};

// Projects/devis created before the sector picker existed only have `type`
// set (e.g. LOGO), not `sector` (defaults to 'OTHER' at the DB level, which
// doesn't include LOGO in its type list). Reverse-lookup the sector whose
// list contains that type so the form pre-selects the right sector instead
// of silently hiding the already-chosen type.
export function inferSectorFromType(type: ProjectType): FreelanceSector {
  if (type === 'OTHER') return 'OTHER';
  const entry = (Object.entries(SECTOR_PROJECT_TYPES) as [FreelanceSector, ProjectType[]][]).find(
    ([sector, types]) => sector !== 'OTHER' && types.includes(type),
  );
  return entry?.[0] ?? 'OTHER';
}

// `sector` is stored as a plain string: either one of the known
// FreelanceSector codes, or arbitrary free text captured via "Autre :
// précisez" (e.g. "Traduction"). Resolves a stored value back into a
// {code, other} pair for the sector picker UI — an unrecognized string is
// treated as free-text "Autre", a missing/'OTHER' value falls back to
// inferring from `type` (handles data saved before this field existed).
export function resolveFreelanceSector(
  raw: string | null | undefined,
  type?: ProjectType,
): { code: FreelanceSector; other: string } {
  const knownCodes = Object.keys(FREELANCE_SECTOR_LABELS) as string[];
  if (raw && raw !== 'OTHER' && knownCodes.includes(raw)) {
    return { code: raw as FreelanceSector, other: '' };
  }
  if (raw && raw !== 'OTHER') {
    return { code: 'OTHER', other: raw };
  }
  if (type) return { code: inferSectorFromType(type), other: '' };
  return { code: 'OTHER', other: '' };
}

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

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'ACCEPTED' | 'CANCELED';

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Brouillon',
  SENT: 'En attente',
  PAID: 'Payée',
  OVERDUE: 'En retard',
  ACCEPTED: 'Acceptée',
  CANCELED: 'Annulée',
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
  CANCELED: { bg: 'bg-muted', fg: 'text-muted-foreground', icon: 'x-circle' },
};

export type InvoiceDocType = 'INVOICE' | 'QUOTE' | 'CREDIT_NOTE';

export const DOC_TYPE_LABELS: Record<InvoiceDocType, { short: string; long: string }> = {
  INVOICE: { short: 'FAC', long: 'Facture' },
  QUOTE: { short: 'QT', long: 'Devis' },
  CREDIT_NOTE: { short: 'AV', long: 'Avoir' },
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
