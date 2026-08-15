'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApi } from '@/lib/useApi';
import { Icon } from '@/components/ui/Icon';
import { LoadingState, ErrorState } from '@/components/ui/PageStates';
import { QuoteBuilderForm } from '@/components/forms/QuoteBuilderForm';
import type { InvoiceDocType } from '@/lib/constants';

interface QuoteDetail {
  id: string;
  docType: InvoiceDocType;
  status: string;
  description: string | null;
  currency: string;
  dueDate: string | null;
  paymentTermsNote: string | null;
  client: { id: string };
  project: { id: string } | null;
  packs: {
    title: string;
    description: string | null;
    items: { designation: string; quantity: number; unitPrice: number }[];
  }[];
  contentBlocks: { kind: string; primaryText: string; secondaryText: string | null }[];
}

export default function EditQuotePage() {
  const { id } = useParams<{ id: string }>();
  const { data: quote, loading, error, refresh } = useApi<QuoteDetail>(`/api/invoices/${id}`);

  const notEditable = quote && (quote.docType !== 'QUOTE' || quote.status !== 'DRAFT');

  return (
    <div className="pt-6 lg:pt-8">
      <Link
        href={`/invoices/${id}`}
        className="mb-4 inline-flex items-center gap-1 px-4 font-body text-sm text-muted-foreground hover:text-foreground sm:px-6 lg:px-8"
      >
        <Icon i="chevron-left" size={16} />
        Retour au devis
      </Link>

      {loading ? (
        <div className="px-4 sm:px-6 lg:px-8">
          <LoadingState />
        </div>
      ) : error || !quote ? (
        <div className="px-4 sm:px-6 lg:px-8">
          <ErrorState message={error ?? 'Devis introuvable.'} onRetry={refresh} />
        </div>
      ) : notEditable ? (
        <div className="px-4 sm:px-6 lg:px-8">
          <ErrorState
            message="Seul un devis à l'état Brouillon peut être modifié ici."
            onRetry={refresh}
          />
        </div>
      ) : (
        <QuoteBuilderForm
          quote={{
            id: quote.id,
            clientId: quote.client.id,
            projectId: quote.project?.id ?? null,
            description: quote.description,
            currency: quote.currency,
            dueDate: quote.dueDate,
            paymentTermsNote: quote.paymentTermsNote,
            packs: quote.packs,
            contentBlocks: quote.contentBlocks,
          }}
        />
      )}
    </div>
  );
}
