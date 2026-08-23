'use client';

import { useAuth } from '@/contexts/AuthContext';
import { CouponsTab } from '@/components/admin/CouponsTab';

export default function AdminCouponsPage() {
  const { user } = useAuth();

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-foreground">Coupons</h1>
        <p className="font-body text-sm text-muted-foreground">
          Codes de réduction appliqués au checkout Pro (Paramètres → Abonnement). Immuables une fois
          créés — désactive un coupon et crée-en un nouveau pour changer le taux.
        </p>
      </header>
      <CouponsTab canEdit={user?.role === 'SUPERADMIN'} />
    </div>
  );
}
