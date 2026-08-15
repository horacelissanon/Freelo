'use client';

import { BackButton } from '@/components/ui/BackButton';
import { QuoteBuilderForm } from '@/components/forms/QuoteBuilderForm';

export default function NewQuotePage() {
  return (
    <div className="pt-6 lg:pt-8">
      <BackButton
        fallbackHref="/invoices"
        label="Devis & Factures"
        className="mb-4 px-4 sm:px-6 lg:px-8"
      />
      <QuoteBuilderForm />
    </div>
  );
}
