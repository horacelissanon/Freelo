'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { QuoteBuilderForm } from '@/components/forms/QuoteBuilderForm';

export default function NewQuotePage() {
  return (
    <div className="pt-6 lg:pt-8">
      <Link
        href="/invoices"
        className="mb-4 inline-flex items-center gap-1 px-4 font-body text-sm text-muted-foreground hover:text-foreground sm:px-6 lg:px-8"
      >
        <Icon i="chevron-left" size={16} />
        Devis &amp; Factures
      </Link>
      <QuoteBuilderForm />
    </div>
  );
}
