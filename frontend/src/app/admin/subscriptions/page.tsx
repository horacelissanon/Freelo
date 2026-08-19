'use client';

import { useAuth } from '@/contexts/AuthContext';
import { SubscriptionsTab } from '@/components/admin/SubscriptionsTab';

export default function AdminSubscriptionsPage() {
  const { user } = useAuth();

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-foreground">Abonnements</h1>
        <p className="font-body text-sm text-muted-foreground">
          Qui est sur quel plan, et depuis quand.
        </p>
      </header>
      <SubscriptionsTab canOverride={user?.role === 'SUPERADMIN'} />
    </div>
  );
}
