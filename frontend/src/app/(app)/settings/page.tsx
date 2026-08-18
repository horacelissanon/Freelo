'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { Icon } from '@/components/ui/Icon';
import { CompteTab } from '@/components/settings/CompteTab';
import { EspaceTab } from '@/components/settings/EspaceTab';
import { SecuriteTab } from '@/components/settings/SecuriteTab';
import { FacturationTab } from '@/components/settings/FacturationTab';

type TabKey = 'compte' | 'espace' | 'securite' | 'abonnement';
type SettingsTabKey = Exclude<TabKey, 'compte'>;

const ALL_TAB_KEYS: readonly TabKey[] = ['compte', 'espace', 'securite', 'abonnement'];

// "Compte" is deliberately NOT in this tab bar — it has its own dedicated
// entry point (the "Mon compte" sidebar link, ?tab=compte) rendered below
// as a single-purpose page with no tab chrome, so profile data doesn't sit
// redundantly alongside workspace/security/billing settings. Abonnement is
// still reachable from both here and its own permanently-amber Sidebar
// entry — keeps its own amber/orange identity here too, matching
// FacturationTab's "don't blend into the rest of the workspace" styling.
const SETTINGS_TABS: { key: SettingsTabKey; label: string; icon: string }[] = [
  { key: 'espace', label: 'Affichage', icon: 'palette' },
  { key: 'securite', label: 'Sécurité', icon: 'shield' },
  { key: 'abonnement', label: 'Abonnement', icon: 'credit-card' },
];

function isTabKey(value: string | null): value is TabKey {
  return value !== null && (ALL_TAB_KEYS as readonly string[]).includes(value);
}

function SettingsPageInner() {
  const user = useUser();
  const params = useSearchParams();
  const initialTab = params.get('tab');
  const isAccountView = initialTab === 'compte';
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(
    isTabKey(initialTab) && initialTab !== 'compte' ? initialTab : 'espace',
  );

  if (!user) return null;

  if (isAccountView) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="mb-6">
          <h1 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">
            Mon compte
          </h1>
          <p className="font-body text-sm text-muted-foreground">
            Connecté en tant que {user.email}
          </p>
        </header>
        <CompteTab user={user} />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">Paramètres</h1>
        <p className="font-body text-sm text-muted-foreground">Connecté en tant que {user.email}</p>
      </header>

      <div className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-border font-body">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab.key === 'abonnement'
                ? `text-amber-500 dark:text-amber-400 ${
                    activeTab === tab.key ? 'border-amber-500' : 'border-transparent'
                  }`
                : activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground'
            }`}
          >
            <Icon i={tab.icon} size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'espace' && <EspaceTab user={user} />}
      {activeTab === 'securite' && <SecuriteTab user={user} />}
      {activeTab === 'abonnement' && <FacturationTab />}
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
