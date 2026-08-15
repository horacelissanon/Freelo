'use client';

// Mensuel/Annuel switch for the landing page pricing cards. Real Freelo
// figures only (Toggle component + math below, nothing fabricated) — same
// numbers the settings/billing screens already quote elsewhere in the app.
import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Toggle } from '@/components/ui/Toggle';
import { formatPrice } from '@/lib/utils';

const MONTHLY_PRICE = 3500;
const ANNUAL_PRICE = 35000;
const ANNUAL_SAVINGS = MONTHLY_PRICE * 12 - ANNUAL_PRICE;

const cardClass = 'rounded-lg border border-border bg-canvas p-5 shadow-card';

function FeatureList({ items, tone }: { items: string[]; tone: 'muted' | 'foreground' }) {
  return (
    <ul className="mt-4 flex flex-col gap-2">
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

  return (
    <div className="mx-auto mt-8 flex max-w-2xl flex-col items-center gap-6">
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

      <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2">
        <div className={cardClass}>
          <p className="font-headings text-base font-semibold text-foreground">Gratuit</p>
          <p className="mt-1 font-headings text-3xl font-bold text-foreground">0 FCFA</p>
          <FeatureList items={freeFeatures} tone="muted" />
          <Link
            href="/signup"
            className="mt-6 block rounded-md border border-border px-4 py-2.5 text-center font-body text-sm font-medium text-foreground"
          >
            Commencer gratuitement
          </Link>
        </div>

        <div className={`${cardClass} relative border-primary`}>
          <span className="absolute -top-3 left-5 rounded-full bg-primary px-2.5 py-0.5 font-body text-[11px] font-semibold tracking-wide text-primary-foreground uppercase">
            Le plus choisi
          </span>
          <p className="font-headings text-base font-semibold text-foreground">Pro</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <p className="font-headings text-3xl font-bold text-foreground">
              {annual ? formatPrice(ANNUAL_PRICE, 'FCFA') : formatPrice(MONTHLY_PRICE, 'FCFA')}
            </p>
            <span className="font-body text-xs text-muted-foreground">
              {annual ? '/an' : '/mois'}
            </span>
          </div>
          <p className="font-body text-xs text-muted-foreground">
            {annual
              ? `Économise ${formatPrice(ANNUAL_SAVINGS, 'FCFA')} par an vs mensuel`
              : `ou ${formatPrice(ANNUAL_PRICE, 'FCFA')}/an`}
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
    </div>
  );
}
