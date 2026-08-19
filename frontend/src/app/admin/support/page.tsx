'use client';

import { SupportTicketsTab } from '@/components/admin/SupportTicketsTab';

export default function AdminSupportPage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-foreground">Support</h1>
        <p className="font-body text-sm text-muted-foreground">
          Demandes envoyées par les freelances depuis Paramètres → Support.
        </p>
      </header>
      <SupportTicketsTab />
    </div>
  );
}
