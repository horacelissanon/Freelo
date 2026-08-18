'use client';

import { useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { Icon } from '@/components/ui/Icon';
import { UsersTab } from '@/components/admin/UsersTab';
import { AuditLogTab } from '@/components/admin/AuditLogTab';

type TabKey = 'users' | 'audit-log';

const ADMIN_TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'users', label: 'Utilisateurs', icon: 'users' },
  { key: 'audit-log', label: "Journal d'audit", icon: 'file-clock' },
];

export default function AdminPage() {
  const user = useUser();
  const [activeTab, setActiveTab] = useState<TabKey>('users');

  if (!user) return null;

  // The nav entry is already hidden for USER (Sidebar.tsx / BottomNav.tsx),
  // but a direct /admin visit still needs this client-side gate. Every
  // mutation is re-checked server-side by requireAdmin anyway — this is
  // presentational only, same as the capability list in /api/admin/me.
  if (user.role === 'USER') {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-canvas shadow-card px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary">
            <Icon i="shield" size={22} className="text-muted-foreground" />
          </div>
          <p className="font-headings text-base font-semibold text-foreground">Accès réservé</p>
          <p className="max-w-xs font-body text-sm text-muted-foreground">
            Cette section est réservée aux administrateurs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">
          Administration
        </h1>
        <p className="font-body text-sm text-muted-foreground">
          Connecté en tant que {user.email} ·{' '}
          {user.role === 'SUPERADMIN' ? 'Super-administrateur' : 'Administrateur'}
        </p>
      </header>

      <div className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-border font-body">
        {ADMIN_TABS.map((tab) => (
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

      {activeTab === 'users' && <UsersTab viewerRole={user.role} viewerId={user.id} />}
      {activeTab === 'audit-log' && <AuditLogTab />}
    </div>
  );
}
