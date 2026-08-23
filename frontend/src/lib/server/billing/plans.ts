// PlanConfig — the admin-editable source of truth for subscription pricing,
// FREE-tier limits, and the marketing feature lists shown on every pricing
// surface (landing page, Paramètres → Abonnement, Super Admin → Plans,
// Super Admin → Abonnements). Previously these were hardcoded constants
// (PRO_PRICING/FREE_PLAN_LIMITS in subscription.ts) duplicated in 5 places —
// this file replaces all of them with one DB-backed accessor so a Super
// Admin price/limit/feature edit actually takes effect everywhere at once.
import 'server-only';
import type { PrismaClient } from '@prisma/client';

export type Plan = 'FREE' | 'PRO';

export interface PlanConfigShape {
  plan: Plan;
  monthlyAmount: number | null;
  yearlyAmount: number | null;
  currency: string;
  maxClients: number | null;
  maxActiveProjects: number | null;
  maxInvoices: number | null;
  maxQuotes: number | null;
  features: string[];
  updatedAt: string;
}

// Today's real figures — used only to seed a plan's row the first time it's
// read (mirrors getOrCreateSubscription's upsert-on-read pattern), so
// behavior is byte-for-byte unchanged until a Super Admin actually edits it.
// Feature text is scoped to what's actually enforced/operational today —
// Bictorys (online payment) and Cloudinary (file upload, logo image) are
// unconfigured in every environment right now, so those aren't claimed here
// even though the gating code for them exists and is ready to activate the
// moment their env vars are set.
const DEFAULT_PLAN_CONFIG: Record<Plan, Omit<PlanConfigShape, 'updatedAt'>> = {
  FREE: {
    plan: 'FREE',
    monthlyAmount: null,
    yearlyAmount: null,
    currency: 'XOF',
    maxClients: 1,
    maxActiveProjects: 2,
    maxInvoices: 1,
    maxQuotes: 1,
    features: [
      '1 client',
      '2 projets actifs',
      '1 devis et 1 facture, en FCFA',
      'Lien de suivi avec commentaires client',
      'Badge « Créé avec Freelo » sur ton lien de suivi',
    ],
  },
  PRO: {
    plan: 'PRO',
    monthlyAmount: 3500,
    yearlyAmount: 35000,
    currency: 'XOF',
    maxClients: null,
    maxActiveProjects: null,
    maxInvoices: null,
    maxQuotes: null,
    features: [
      'Clients & projets illimités',
      'Devis & factures illimités, en FCFA, EUR, USD',
      'Nom d’entreprise, adresse et infos fiscales sur tes documents',
      'Export Excel et PDF',
      'Personnalisation de l’espace de travail',
      'Sans badge « Créé avec Freelo » sur ton lien de suivi',
    ],
  },
};

export async function getPlanConfig(prisma: PrismaClient, plan: Plan): Promise<PlanConfigShape> {
  const existing = await prisma.planConfig.findUnique({ where: { plan } });
  if (existing) {
    return {
      plan: existing.plan as Plan,
      monthlyAmount: existing.monthlyAmount,
      yearlyAmount: existing.yearlyAmount,
      currency: existing.currency,
      maxClients: existing.maxClients,
      maxActiveProjects: existing.maxActiveProjects,
      maxInvoices: existing.maxInvoices,
      maxQuotes: existing.maxQuotes,
      features: existing.features,
      updatedAt: existing.updatedAt.toISOString(),
    };
  }
  const defaults = DEFAULT_PLAN_CONFIG[plan];
  const created = await prisma.planConfig.upsert({
    where: { plan },
    create: defaults,
    update: {},
  });
  return {
    plan: created.plan as Plan,
    monthlyAmount: created.monthlyAmount,
    yearlyAmount: created.yearlyAmount,
    currency: created.currency,
    maxClients: created.maxClients,
    maxActiveProjects: created.maxActiveProjects,
    maxInvoices: created.maxInvoices,
    maxQuotes: created.maxQuotes,
    features: created.features,
    updatedAt: created.updatedAt.toISOString(),
  };
}

/** Sequential, not Promise.all — this dev DB's connection pool caps at
 *  connection_limit=1 (see api/admin/overview/route.ts's identical note). */
export async function getAllPlanConfigs(
  prisma: PrismaClient,
): Promise<{ free: PlanConfigShape; pro: PlanConfigShape }> {
  const free = await getPlanConfig(prisma, 'FREE');
  const pro = await getPlanConfig(prisma, 'PRO');
  return { free, pro };
}
