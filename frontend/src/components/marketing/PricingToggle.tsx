'use client';

// Mensuel/Annuel + FCFA/EUR/USD switches for the landing page pricing
// cards. Real Zeloom figures only (Toggle component + math below, nothing
// fabricated) — same numbers the settings/billing screens already quote
// elsewhere in the app. Sits on a light "Tarifs" panel (page.tsx) — green
// is reserved for the featured Pro card itself, not the whole section, so
// it's the one thing that actually pops instead of competing with a
// saturated background.
import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Toggle } from '@/components/ui/Toggle';
import { useApi } from '@/lib/useApi';
import { formatPrice } from '@/lib/utils';

// Real, live figures from GET /api/plans (public — see that route's
// header), Super Admin-editable via Super Admin → Plans. The constants
// below are only a fallback shown before that fetch resolves — same
// "degrade, never block" philosophy as FALLBACK_FX below, and the same real
// numbers that shipped as hardcoded defaults before this became editable.
const FALLBACK_FREE_FEATURES = [
  '1 client',
  '2 projets actifs',
  '1 devis et 1 facture, en FCFA',
  'Lien de suivi avec commentaires client',
  'Badge « Créé avec Zeloom » sur ton lien de suivi',
];
const FALLBACK_PRO_FEATURES = [
  'Clients & projets illimités',
  'Devis & factures illimités, en FCFA, EUR, USD',
  'Nom d’entreprise, adresse et infos fiscales sur tes documents',
  'Export Excel et PDF',
  'Personnalisation de l’espace de travail',
  'Sans badge « Créé avec Zeloom » sur ton lien de suivi',
];
const FALLBACK_MONTHLY_PRICE = 3500;
const FALLBACK_ANNUAL_PRICE = 35000;

interface PlansResponse {
  free: { features: string[] };
  pro: { monthlyAmount: number | null; yearlyAmount: number | null; features: string[] };
}

const CURRENCIES = ['FCFA', 'EUR', 'USD'] as const;
type Currency = (typeof CURRENCIES)[number];

// EUR rate is the real, treaty-fixed XOF/EUR peg (1 EUR = 655.957 FCFA) —
// stated as fact, never a network call. USD floats, so its rate is fetched
// live from GET /api/fx-rates (public, cached daily — see
// lib/server/fx/rates.ts) and only falls back to this hardcoded constant if
// that fetch hasn't resolved yet or fails — same "degrade, never block"
// philosophy as the app's other optional providers. Zeloom's own Pro
// subscription is still billed in FCFA — this is a display conversion for
// visitors thinking in another currency, not a claim that Merrudit bills in
// EUR/USD.
const FALLBACK_FX: Record<Currency, { perFcfa: number; symbol: string }> = {
  FCFA: { perFcfa: 1, symbol: 'FCFA' },
  EUR: { perFcfa: 1 / 655.957, symbol: '€' },
  USD: { perFcfa: 1 / 610, symbol: '$' },
};

// flex + h-full + flex-col: the grid below stretches both cards to the same
// height (CSS Grid's default align-items:stretch), then this lets each
// card's CTA pin to the bottom via mt-auto regardless of how many feature
// bullets the other card has — keeps "Commencer gratuitement" and "Essayer
// le plan Pro" on the same row instead of drifting apart.
const cardClass = 'flex h-full flex-col rounded-2xl p-6 shadow-card';

function FeatureList({
  items,
  tone,
}: {
  items: string[];
  tone: 'muted' | 'foreground' | 'inverted';
}) {
  const textClass =
    tone === 'muted'
      ? 'text-muted-foreground'
      : tone === 'inverted'
        ? 'text-primary-foreground/90'
        : 'text-foreground';
  const iconClass = tone === 'inverted' ? 'text-primary-foreground' : 'text-primary';
  return (
    // flex-1: absorbs the leftover height once the parent grid stretches
    // both cards to match the taller one, so the CTA below always sits at a
    // consistent mt-6 from the last bullet instead of drifting with list
    // length — see cardClass's comment for why the cards match height at all.
    <ul className="mt-4 flex flex-1 flex-col gap-2.5">
      {items.map((line) => (
        <li key={line} className={`flex items-start gap-2 font-body text-sm ${textClass}`}>
          <Icon i="check-circle" size={15} className={`mt-0.5 flex-shrink-0 ${iconClass}`} />
          {line}
        </li>
      ))}
    </ul>
  );
}

export function PricingToggle() {
  const [annual, setAnnual] = useState(false);
  const [currency, setCurrency] = useState<Currency>('FCFA');
  const { data: fx } = useApi<{ XOF: number; EUR: number; USD: number }>('/api/fx-rates');
  const { data: plans } = useApi<PlansResponse>('/api/plans');
  // fx values are "units of X per 1 EUR" (open.er-api.com's EUR base) —
  // USD per 1 FCFA is (USD per EUR) / (XOF per EUR). XOF/EUR themselves stay
  // the fallback constant's legally pegged 655.957 either way.
  const FX: Record<Currency, { perFcfa: number; symbol: string }> = fx
    ? { ...FALLBACK_FX, USD: { perFcfa: fx.USD / fx.XOF, symbol: '$' } }
    : FALLBACK_FX;

  const freeFeatures = plans?.free.features ?? FALLBACK_FREE_FEATURES;
  const proFeatures = plans?.pro.features ?? FALLBACK_PRO_FEATURES;
  const MONTHLY_PRICE = plans?.pro.monthlyAmount ?? FALLBACK_MONTHLY_PRICE;
  const ANNUAL_PRICE = plans?.pro.yearlyAmount ?? FALLBACK_ANNUAL_PRICE;
  const ANNUAL_SAVINGS = MONTHLY_PRICE * 12 - ANNUAL_PRICE;

  function formatAmount(amountFcfa: number, curr: Currency): string {
    const { perFcfa, symbol } = FX[curr];
    if (curr === 'FCFA') return formatPrice(amountFcfa, symbol);
    const converted = Math.round(amountFcfa * perFcfa);
    return `≈ ${converted.toLocaleString('fr-FR')} ${symbol}`;
  }

  return (
    <div className="mx-auto mt-8 flex max-w-2xl flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-1.5">
        <p className="font-body text-xs font-medium text-muted-foreground">
          Afficher les tarifs en
        </p>
        <div className="flex items-center gap-1 rounded-full border border-border bg-canvas p-1 shadow-card">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={`rounded-full px-3 py-1.5 font-body text-xs font-semibold transition-colors ${
                currency === c
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-full border border-border bg-canvas px-4 py-2 shadow-card">
        <span
          className={`font-body text-sm font-medium ${!annual ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          Mensuel
        </span>
        <Toggle checked={annual} onChange={setAnnual} label="Facturation annuelle" />
        <span
          className={`font-body text-sm font-medium ${annual ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          Annuel
        </span>
        <span className="rounded-full bg-tag-green px-2 py-0.5 font-body text-[11px] font-semibold text-tag-green-fg">
          -{Math.round((ANNUAL_SAVINGS / (MONTHLY_PRICE * 12)) * 100)}%
        </span>
      </div>

      <div className="mt-3 grid w-full grid-cols-1 gap-5 sm:grid-cols-2">
        <div className={`${cardClass} border border-border bg-canvas`}>
          <p className="font-headings text-base font-semibold text-foreground">Gratuit</p>
          <p className="mt-1 font-headings text-3xl font-bold text-foreground">
            {formatAmount(0, currency)}
          </p>
          <FeatureList items={freeFeatures} tone="muted" />
          <Link
            href="/login?mode=signup"
            className="mt-6 block rounded-md border border-border px-4 py-2.5 text-center font-body text-sm font-medium text-foreground"
          >
            Commencer gratuitement
          </Link>
        </div>

        {/* The one deliberately green card — everything around it (panel,
            toggles, the other card) stays light so this is unambiguously
            the featured plan, not one of several green things fighting for
            attention. */}
        <div className={`${cardClass} relative bg-primary shadow-xl`}>
          <span className="absolute -top-3 left-6 rounded-full bg-canvas px-2.5 py-0.5 font-body text-[11px] font-semibold tracking-wide text-primary uppercase shadow-card">
            Le plus choisi
          </span>
          <p className="font-headings text-base font-semibold text-primary-foreground">Pro</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <p className="font-headings text-3xl font-bold text-primary-foreground">
              {formatAmount(annual ? ANNUAL_PRICE : MONTHLY_PRICE, currency)}
            </p>
            <span className="font-body text-xs text-primary-foreground/70">
              {annual ? '/an' : '/mois'}
            </span>
          </div>
          <p className="font-body text-xs text-primary-foreground/70">
            {annual
              ? `Économise ${formatAmount(ANNUAL_SAVINGS, currency)} par an vs mensuel`
              : `ou ${formatAmount(ANNUAL_PRICE, currency)}/an`}
          </p>
          <FeatureList items={proFeatures} tone="inverted" />
          <Link
            href="/login?mode=signup"
            className="mt-6 block rounded-md bg-canvas px-4 py-2.5 text-center font-body text-sm font-medium text-primary"
          >
            Essayer le plan Pro
          </Link>
        </div>
      </div>

      {currency !== 'FCFA' && (
        <p className="font-body text-[11px] text-muted-foreground">
          Conversion {currency === 'EUR' ? 'officielle (parité fixe XOF/EUR)' : 'indicative'} —
          facturation en FCFA.
        </p>
      )}
    </div>
  );
}
