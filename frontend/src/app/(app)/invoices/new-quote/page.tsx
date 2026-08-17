'use client';

import { useSearchParams } from 'next/navigation';
import { BackButton } from '@/components/ui/BackButton';
import { QuoteBuilderForm } from '@/components/forms/QuoteBuilderForm';
import { useApi } from '@/lib/useApi';
import { LoadingState } from '@/components/ui/PageStates';

export default function NewQuotePage() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId');
  const { data: client, loading: clientLoading } = useApi<{ name: string }>(
    clientId ? `/api/clients/${clientId}` : '',
    { skip: !clientId },
  );

  return (
    <div className="pt-6 lg:pt-8">
      <BackButton
        fallbackHref="/invoices?tab=devis"
        label="Devis"
        className="mb-4 px-4 sm:px-6 lg:px-8"
      />
      {clientId && clientLoading ? (
        <LoadingState />
      ) : (
        <QuoteBuilderForm
          {...(clientId && client ? { lockedClient: { id: clientId, label: client.name } } : {})}
        />
      )}
    </div>
  );
}
