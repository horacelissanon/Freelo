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

type TabKey = 'compte' | 'espace' | 'notifications' | 'securite' | 'facturation';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'compte', label: 'Compte', icon: 'user' },
  { key: 'espace', label: 'Espace de travail', icon: 'building' },
  { key: 'notifications', label: 'Notifications', icon: 'bell' },
  { key: 'securite', label: 'Sécurité', icon: 'shield' },
  { key: 'facturation', label: 'Facturation', icon: 'credit-card' },
];

const TAB_KEYS: readonly TabKey[] = TABS.map((t) => t.key);

function isTabKey(value: string | null): value is TabKey {
  return value !== null && (TAB_KEYS as readonly string[]).includes(value);
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
        {TABS.map((tab) => (
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
      {activeTab === 'facturation' && <FacturationTab />}
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
