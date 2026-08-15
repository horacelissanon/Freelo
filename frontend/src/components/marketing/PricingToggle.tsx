'use client';

// Mensuel/Annuel + FCFA/EUR/USD switches for the landing page pricing
// cards. Real Freelo figures only (Toggle component + math below, nothing
// fabricated) — same numbers the settings/billing screens already quote
// elsewhere in the app. Styled to sit on the dark gradient "Tarifs" panel
// (page.tsx) — white floating cards for contrast, glass toggle pills — not
// a standalone-on-white component, since that's its only usage.
import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Toggle } from '@/components/ui/Toggle';
import { formatPrice } from '@/lib/utils';

const MONTHLY_PRICE = 3500;
const ANNUAL_PRICE = 35000;
const ANNUAL_SAVINGS = MONTHLY_PRICE * 12 - ANNUAL_PRICE;

const CURRENCIES = ['FCFA', 'EUR', 'USD'] as const;
type Currency = (typeof CURRENCIES)[number];

// EUR rate is the real, treaty-fixed XOF/EUR peg (1 EUR = 655.957 FCFA) —
// stated as fact, not an estimate. USD floats, so its rate is explicitly
// flagged approximate in the UI. Freelo's own Pro subscription is still
// billed in FCFA — this is a display conversion for visitors thinking in
// another currency, not a claim that Merrudit bills in EUR/USD.
const FX: Record<Currency, { perFcfa: number; symbol: string }> = {
  FCFA: { perFcfa: 1, symbol: 'FCFA' },
  EUR: { perFcfa: 1 / 655.957, symbol: '€' },
  USD: { perFcfa: 1 / 610, symbol: '$' },
};

function formatAmount(amountFcfa: number, currency: Currency): string {
  const { perFcfa, symbol } = FX[currency];
  if (currency === 'FCFA') return formatPrice(amountFcfa, symbol);
  const converted = Math.round(amountFcfa * perFcfa);
  return `≈ ${converted.toLocaleString('fr-FR')} ${symbol}`;
}

const cardClass = 'rounded-2xl bg-canvas p-6 shadow-2xl';

function FeatureList({ items, tone }: { items: string[]; tone: 'muted' | 'foreground' }) {
  return (
    <ul className="mt-4 flex flex-col gap-2.5">
      {items.map((line) => (
        <li
          key={line}
          className={`flex items-start gap-2 font-body text-sm ${tone === 'muted' ? 'text-muted-foreground' : 'text-foreground'}`}
        >
          <Icon i="check-circle" size={15} className="mt-0.5 flex-shrink-0 text-primary" />
          {line}
        </li>
      ))}
    </ul>
  );
}

export function PricingToggle({
  freeFeatures,
  proFeatures,
}: {
  freeFeatures: string[];
  proFeatures: string[];
}) {
  const [annual, setAnnual] = useState(false);
  const [currency, setCurrency] = useState<Currency>('FCFA');

  return (
    <div className="mx-auto mt-8 flex max-w-2xl flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-1.5">
        <p className="font-body text-xs font-medium text-white/70">Afficher les tarifs en</p>
        <div className="flex items-center gap-1 rounded-full border border-white/25 bg-white/10 p-1 backdrop-blur">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={`rounded-full px-3 py-1.5 font-body text-xs font-semibold transition-colors ${
                currency === c ? 'bg-white text-primary' : 'text-white/70 hover:text-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-full border border-white/25 bg-white/10 px-4 py-2 backdrop-blur">
        <span
          className={`font-body text-sm font-medium ${!annual ? 'text-white' : 'text-white/60'}`}
        >
          Mensuel
        </span>
        <Toggle checked={annual} onChange={setAnnual} label="Facturation annuelle" />
        <span
          className={`font-body text-sm font-medium ${annual ? 'text-white' : 'text-white/60'}`}
        >
          Annuel
        </span>
        <span className="rounded-full bg-white px-2 py-0.5 font-body text-[11px] font-semibold text-primary">
          -{Math.round((ANNUAL_SAVINGS / (MONTHLY_PRICE * 12)) * 100)}%
        </span>
      </div>

      <div className="mt-3 grid w-full grid-cols-1 gap-5 sm:grid-cols-2">
        <div className={cardClass}>
          <p className="font-headings text-base font-semibold text-foreground">Gratuit</p>
          <p className="mt-1 font-headings text-3xl font-bold text-foreground">
            {formatAmount(0, currency)}
          </p>
          <FeatureList items={freeFeatures} tone="muted" />
          <Link
            href="/signup"
            className="mt-6 block rounded-md border border-border px-4 py-2.5 text-center font-body text-sm font-medium text-foreground"
          >
            Commencer gratuitement
          </Link>
        </div>

        <div className={`${cardClass} relative border-2 border-primary`}>
          <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 font-body text-[11px] font-semibold tracking-wide text-primary-foreground uppercase">
            Le plus choisi
          </span>
          <p className="font-headings text-base font-semibold text-foreground">Pro</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <p className="font-headings text-3xl font-bold text-foreground">
              {formatAmount(annual ? ANNUAL_PRICE : MONTHLY_PRICE, currency)}
            </p>
            <span className="font-body text-xs text-muted-foreground">
              {annual ? '/an' : '/mois'}
            </span>
          </div>
          <p className="font-body text-xs text-muted-foreground">
            {annual
              ? `Économise ${formatAmount(ANNUAL_SAVINGS, currency)} par an vs mensuel`
              : `ou ${formatAmount(ANNUAL_PRICE, currency)}/an`}
          </p>
          <FeatureList items={proFeatures} tone="foreground" />
          <Link
            href="/signup"
            className="mt-6 block rounded-md bg-primary px-4 py-2.5 text-center font-body text-sm font-medium text-primary-foreground"
          >
            Essayer le plan Pro
          </Link>
        </div>
      </div>

      {currency !== 'FCFA' && (
        <p className="font-body text-[11px] text-white/60">
          Conversion {currency === 'EUR' ? 'officielle (parité fixe XOF/EUR)' : 'indicative'} —
          facturation en FCFA.
        </p>
      )}
    </div>
  );
}
