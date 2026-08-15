'use client';

import Link from 'next/link';
import { useUser } from '@/contexts/AuthContext';
import { useApi } from '@/lib/useApi';
import { StatCard } from '@/components/dashboard/StatCard';
import { StarRating } from '@/components/ui/StarRating';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { formatDate } from '@/lib/utils';

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  client: { id: string; name: string };
  project: { id: string; name: string };
}

interface ReviewsResponse {
  items: ReviewRow[];
  average: number | null;
  total: number;
}

export default function ReviewsPage() {
  const user = useUser();
  const { data, loading, error, refresh } = useApi<ReviewsResponse>('/api/reviews?limit=50');

  if (!user) return null;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">
          Avis clients
        </h1>
        <p className="font-body text-sm text-muted-foreground">
          Les avis laissés par vos clients une fois leurs projets livrés.
        </p>
      </div>

      {loading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState message={error ?? 'Impossible de charger les avis.'} onRetry={refresh} />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon="star"
          title="Aucun avis pour le moment"
          description="Une fois un projet marqué comme livré, votre client peut laisser un avis depuis son lien de suivi."
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
            <StatCard
              label="Note moyenne"
              value={data.average != null ? data.average.toFixed(1) : '—'}
              unit="/ 5"
              icon="star"
            />
            <StatCard label="Total avis" value={String(data.total)} icon="message-square" />
          </div>

          <div className="flex flex-col gap-3">
            {data.items.map((r) => (
              <Link
                key={r.id}
                href={`/projects/${r.project.id}`}
                className="flex flex-col gap-2 rounded-lg border border-border bg-canvas shadow-card p-5 hover:border-primary/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-body text-sm font-semibold text-foreground">
                      {r.client.name}
                    </p>
                    <p className="truncate font-body text-xs text-muted-foreground">
                      {r.project.name}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <StarRating value={r.rating} size={16} />
                    <p className="font-body text-xs text-muted-foreground">
                      {formatDate(r.createdAt)}
                    </p>
                  </div>
                </div>
                {r.comment && <p className="font-body text-sm text-foreground">{r.comment}</p>}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
