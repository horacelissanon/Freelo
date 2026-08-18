'use client';

import { useAuth } from '@/contexts/AuthContext';
import { UsersTab } from '@/components/admin/UsersTab';

export default function AdminUsersPage() {
  const { user } = useAuth();
  if (!user || user.role === 'USER') return null;

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-slate-900">Utilisateurs</h1>
        <p className="font-body text-sm text-slate-500">
          Recherche, rôles et statut de tous les comptes de la plateforme.
        </p>
      </header>
      <UsersTab viewerRole={user.role} viewerId={user.id} />
    </div>
  );
}
