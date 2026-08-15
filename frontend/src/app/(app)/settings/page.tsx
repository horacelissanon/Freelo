'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { Icon } from '@/components/ui/Icon';
import { CompteTab } from '@/components/settings/CompteTab';
import { EspaceTab } from '@/components/settings/EspaceTab';
import { NotificationsTab } from '@/components/settings/NotificationsTab';
import { SecuriteTab } from '@/components/settings/SecuriteTab';
import { FacturationTab } from '@/components/settings/FacturationTab';

type TabKey = 'compte' | 'espace' | 'notifications' | 'securite' | 'abonnement';

// 'abonnement' stays a valid tab (so a direct link still resolves to it —
// see Sidebar.tsx, which now links to /settings?tab=abonnement) even though
// it's no longer one of the buttons rendered in the tab bar below: it moved
// to its own permanently-amber entry in the main nav, just above
// "Paramètres", instead of being just another tab a freelance has to click
// into to notice.
const ALL_TAB_KEYS: readonly TabKey[] = [
  'compte',
  'espace',
  'notifications',
  'securite',
  'abonnement',
];

const VISIBLE_TABS: { key: Exclude<TabKey, 'abonnement'>; label: string; icon: string }[] = [
  { key: 'compte', label: 'Compte', icon: 'user' },
  { key: 'espace', label: 'Affichage', icon: 'palette' },
  { key: 'notifications', label: 'Notifications', icon: 'bell' },
  { key: 'securite', label: 'Sécurité', icon: 'shield' },
];

function isTabKey(value: string | null): value is TabKey {
  return value !== null && (ALL_TAB_KEYS as readonly string[]).includes(value);
}

function SettingsPageInner() {
  const user = useUser();
  const params = useSearchParams();
  const initialTab = params.get('tab');
  const [activeTab, setActiveTab] = useState<TabKey>(isTabKey(initialTab) ? initialTab : 'compte');

  if (!user) return null;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">Paramètres</h1>
        <p className="font-body text-sm text-muted-foreground">Connecté en tant que {user.email}</p>
      </header>

      <div className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-border font-body">
        {VISIBLE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground'
            }`}
          >
            <Icon i={tab.icon} size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'compte' && <CompteTab user={user} />}
      {activeTab === 'espace' && <EspaceTab user={user} />}
      {activeTab === 'notifications' && <NotificationsTab />}
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
