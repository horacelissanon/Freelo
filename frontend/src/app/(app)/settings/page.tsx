'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { Icon } from '@/components/ui/Icon';
import { CompteTab } from '@/components/settings/CompteTab';
import { EspaceTab } from '@/components/settings/EspaceTab';
import { SecuriteTab } from '@/components/settings/SecuriteTab';
import { FacturationTab } from '@/components/settings/FacturationTab';
import { SupportTab } from '@/components/settings/SupportTab';

type TabKey = 'compte' | 'espace' | 'securite' | 'abonnement' | 'support';
type AccountTabKey = TabKey;

const ALL_TAB_KEYS: readonly TabKey[] = ['compte', 'espace', 'securite', 'abonnement', 'support'];

// "Mon compte" is the single settings hub: Compte plus every tab that used
// to live under a separate Paramètres nav entry (Affichage included — it's
// not a distinct destination anymore). Every nav link (Sidebar, BottomNav,
// ProUpsellBanner, PlanLimitPrompt) points at /settings?tab=<key> and all of
// them must land inside this hub with that tab pre-selected — there used to
// be a second "legacy" branch here that only opened for ?tab=compte, so
// every other tab (notably ?tab=abonnement, the one actually linked
// everywhere) silently fell through to a stray duplicate page instead.
const ACCOUNT_TABS: { key: AccountTabKey; label: string; icon: string }[] = [
  { key: 'compte', label: 'Compte', icon: 'user' },
  { key: 'espace', label: 'Affichage', icon: 'palette' },
  { key: 'securite', label: 'Sécurité', icon: 'shield' },
  { key: 'support', label: 'Support', icon: 'message-circle' },
  { key: 'abonnement', label: 'Abonnement', icon: 'credit-card' },
];

function isTabKey(value: string | null): value is TabKey {
  return value !== null && (ALL_TAB_KEYS as readonly string[]).includes(value);
}

function SettingsPageInner() {
  const user = useUser();
  const params = useSearchParams();
  const initialTab = params.get('tab');
  const [activeAccountTab, setActiveAccountTab] = useState<AccountTabKey>(
    isTabKey(initialTab) ? initialTab : 'compte',
  );

  // Every "Passer en Pro" link across the app points at /settings?tab=X —
  // App Router keeps this page mounted across that navigation (same route),
  // so the useState initializer above only fires once and a click while
  // already on /settings silently updated the URL without switching tabs.
  // Re-sync whenever the query param actually changes.
  useEffect(() => {
    if (isTabKey(initialTab)) setActiveAccountTab(initialTab);
  }, [initialTab]);

  if (!user) return null;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">Mon compte</h1>
        <p className="font-body text-sm text-muted-foreground">Connecté en tant que {user.email}</p>
      </header>

      <div className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-border font-body">
        {ACCOUNT_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveAccountTab(tab.key)}
            className={`flex flex-shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab.key === 'abonnement'
                ? `text-amber-500 dark:text-amber-400 ${
                    activeAccountTab === tab.key ? 'border-amber-500' : 'border-transparent'
                  }`
                : activeAccountTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground'
            }`}
          >
            <Icon i={tab.icon} size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeAccountTab === 'compte' && <CompteTab user={user} />}
      {activeAccountTab === 'espace' && <EspaceTab user={user} />}
      {activeAccountTab === 'securite' && <SecuriteTab user={user} />}
      {activeAccountTab === 'support' && <SupportTab />}
      {activeAccountTab === 'abonnement' && <FacturationTab />}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}
