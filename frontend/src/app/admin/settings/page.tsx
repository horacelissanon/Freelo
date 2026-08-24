'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Icon } from '@/components/ui/Icon';
import { AdminProfileTab } from '@/components/admin/AdminProfileTab';
import { AdminAffichageTab } from '@/components/admin/AdminAffichageTab';
import { AdminSecurityTab } from '@/components/admin/AdminSecurityTab';
import { AdminGeneralTab } from '@/components/admin/AdminGeneralTab';

type TabKey = 'profil' | 'affichage' | 'securite' | 'general';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'profil', label: 'Profil', icon: 'user' },
  { key: 'affichage', label: 'Affichage', icon: 'palette' },
  { key: 'securite', label: 'Sécurité', icon: 'shield' },
  { key: 'general', label: 'Général', icon: 'settings' },
];

function isTabKey(value: string | null): value is TabKey {
  return value === 'profil' || value === 'affichage' || value === 'securite' || value === 'general';
}

// useSearchParams() opts a subtree out of static rendering unless wrapped in
// Suspense — same reasoning as the freelance settings page's identical
// wrapper.
function AdminSettingsInner() {
  const { user } = useAuth();
  const params = useSearchParams();
  const initialTab = params.get('tab');
  const [activeTab, setActiveTab] = useState<TabKey>(isTabKey(initialTab) ? initialTab : 'profil');

  if (!user) return null;

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-foreground">Paramètres</h1>
        <p className="font-body text-sm text-muted-foreground">Ton compte Super Admin.</p>
      </header>

      <div className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-border font-body">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-muted-foreground'
            }`}
          >
            <Icon i={tab.icon} size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profil' && <AdminProfileTab user={user} />}
      {activeTab === 'affichage' && <AdminAffichageTab />}
      {activeTab === 'securite' && <AdminSecurityTab user={user} />}
      {activeTab === 'general' && <AdminGeneralTab canEdit={user.role === 'SUPERADMIN'} />}
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={null}>
      <AdminSettingsInner />
    </Suspense>
  );
}
