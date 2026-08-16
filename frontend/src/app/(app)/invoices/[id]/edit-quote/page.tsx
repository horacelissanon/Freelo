'use client';

import { useParams } from 'next/navigation';
import { useApi } from '@/lib/useApi';
import { BackButton } from '@/components/ui/BackButton';
import { LoadingState, ErrorState } from '@/components/ui/PageStates';
import { QuoteBuilderForm } from '@/components/forms/QuoteBuilderForm';
import type { InvoiceDocType } from '@/lib/constants';

interface QuoteDetail {
  id: string;
  docType: InvoiceDocType;
  status: string;
  description: string | null;
  sector: string | null;
  type: string | null;
  currency: string;
  dueDate: string | null;
  paymentTermsNote: string | null;
  client: { id: string };
  project: { id: string } | null;
  packs: {
    title: string;
    description: string | null;
    items: { designation: string; quantity: number; unitPrice: number }[];
    depositType: string | null;
    depositValue: number | null;
  }[];
  contentBlocks: { kind: string; primaryText: string; secondaryText: string | null }[];
}

export default function EditQuotePage() {
  const { id } = useParams<{ id: string }>();
  const { data: quote, loading, error, refresh } = useApi<QuoteDetail>(`/api/invoices/${id}`);

  // Brouillon/En attente/Expiré stay freely editable; Accepté is also
  // editable (gated by a confirmation modal on the devis detail page before
  // navigating here — see invoices/[id]/page.tsx). Only Annulé is frozen.
  const notEditable = quote && (quote.docType !== 'QUOTE' || quote.status === 'CANCELED');

  return (
    <div className="pt-6 lg:pt-8">
      <BackButton
        fallbackHref={`/invoices/${id}`}
        label="Retour au devis"
        className="mb-4 px-4 sm:px-6 lg:px-8"
      />

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
            message="Ce devis est annulé et ne peut plus être modifié."
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
            sector: quote.sector,
            type: quote.type,
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
