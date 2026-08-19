'use client';

import { useAuth } from '@/contexts/AuthContext';
import { PlansTab } from '@/components/admin/PlansTab';

export default function AdminPlansPage() {
  const { user } = useAuth();

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-slate-900">Plans</h1>
        <p className="font-body text-sm text-slate-500">
          Prix, limites du plan Gratuit et fonctionnalités affichées sur chaque offre —
          s&apos;applique instantanément à tout le SaaS (landing, Paramètres → Abonnement,
          facturation).
        </p>
      </header>
      <PlansTab canEdit={user?.role === 'SUPERADMIN'} />
    </div>
  );
}
