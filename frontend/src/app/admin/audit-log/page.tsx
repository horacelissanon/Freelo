'use client';

import { AuditLogTab } from '@/components/admin/AuditLogTab';

export default function AdminAuditLogPage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-foreground">Journal d&apos;audit</h1>
        <p className="font-body text-sm text-muted-foreground">
          Historique de toutes les actions d&apos;administration — qui a fait quoi, quand.
        </p>
      </header>
      <AuditLogTab />
    </div>
  );
}
