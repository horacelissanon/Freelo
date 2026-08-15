'use client';

import Link from 'next/link';
import { useUser } from '@/contexts/AuthContext';
import { useApi } from '@/lib/useApi';
import { StatCard } from '@/components/dashboard/StatCard';
import { RevenueTrendCard, type RevenueTrendPoint } from '@/components/dashboard/RevenueTrendCard';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils';

interface ProjectTypeBreakdown {
  type: string;
  label: string;
  amount: number;
  count: number;
  sharePercent: number;
}

interface TopClient {
  clientId: string;
  name: string;
  amount: number;
}

interface Suggestion {
  severity: 'info' | 'warning';
  message: string;
}

interface StatsResponse {
  overview: {
    revenue: { amount: number; currency: string; trendPercent: number | null };
    avgProjectValue: { amount: number; currency: string } | null;
    overdueRate: number | null;
  };
  revenueByProjectType: ProjectTypeBreakdown[];
  topClients: TopClient[];
  revenueTrend: RevenueTrendPoint[];
  suggestions: Suggestion[];
}

function ProjectTypeBreakdownCard({ items }: { items: ProjectTypeBreakdown[] }) {
  return (
    <div className="rounded-lg border border-border bg-canvas shadow-card p-5">
      <h2 className="mb-4 font-headings text-base font-semibold text-foreground">
        Répartition par type de projet
      </h2>
      {items.length === 0 ? (
        <EmptyState
          icon="layers"
          title="Pas encore de données"
          description="Les projets livrés apparaîtront ici, répartis par type."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div key={item.type} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-body text-sm font-medium text-foreground">{item.label}</span>
                <span className="flex-shrink-0 font-body text-xs text-muted-foreground">
                  {formatPrice(item.amount)} · {item.sharePercent}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${item.sharePercent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TopClientsCard({ items }: { items: TopClient[] }) {
  return (
    <div className="rounded-lg border border-border bg-canvas shadow-card p-5">
      <h2 className="mb-4 font-headings text-base font-semibold text-foreground">
        Meilleurs clients
      </h2>
      {items.length === 0 ? (
        <EmptyState
          icon="users"
          title="Pas encore de données"
          description="Vos clients les plus rentables apparaîtront ici, classés par montant encaissé."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((c, i) => (
            <Link
              key={c.clientId}
              href={`/clients/${c.clientId}`}
              className="flex items-center gap-3"
            >
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-secondary font-body text-xs font-bold text-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-body text-sm text-foreground">
                {c.name}
              </span>
              <span className="flex-shrink-0 font-body text-sm font-bold text-primary">
                {formatPrice(c.amount)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionsCard({ items }: { items: Suggestion[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-canvas shadow-card p-5">
      <h2 className="mb-4 font-headings text-base font-semibold text-foreground">Suggestions</h2>
      <div className="flex flex-col gap-2.5">
        {items.map((s, i) => {
          const isWarning = s.severity === 'warning';
          return (
            <div
              key={i}
              className={`flex items-start gap-2.5 rounded-md p-3 ${isWarning ? 'bg-tag-orange' : 'bg-tag-purple'}`}
            >
              <Icon
                i={isWarning ? 'alert-circle' : 'lightbulb'}
                size={15}
                className={`mt-0.5 flex-shrink-0 ${isWarning ? 'text-tag-orange-fg' : 'text-tag-purple-fg'}`}
              />
              <p
                className={`font-body text-sm ${isWarning ? 'text-tag-orange-fg' : 'text-tag-purple-fg'}`}
              >
                {s.message}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function StatsPage() {
  const user = useUser();
  const { data, loading, error, refresh } = useApi<StatsResponse>('/api/stats');

  if (!user) return null;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6">
        <h1 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">
          Statistiques
        </h1>
        <p className="font-body text-sm text-muted-foreground">
          Analyse de votre activité — comparaisons, tendances et suggestions.
        </p>
      </div>

      {loading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState
          message={error ?? 'Impossible de charger les statistiques.'}
          onRetry={refresh}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <StatCard
              label="Revenu du mois"
              value={formatPrice(data.overview.revenue.amount)}
              unit={data.overview.revenue.currency}
              icon="banknote"
              trend={
                data.overview.revenue.trendPercent != null
                  ? {
                      text: `${data.overview.revenue.trendPercent > 0 ? '+' : ''}${data.overview.revenue.trendPercent}%`,
                      up: data.overview.revenue.trendPercent >= 0,
                    }
                  : undefined
              }
            />
            <StatCard
              label="Panier moyen / projet"
              value={
                data.overview.avgProjectValue
                  ? formatPrice(data.overview.avgProjectValue.amount)
                  : '—'
              }
              icon="briefcase"
              {...(data.overview.avgProjectValue
                ? { unit: data.overview.avgProjectValue.currency }
                : {})}
            />
            <StatCard
              label="Taux de retard"
              value={data.overview.overdueRate != null ? `${data.overview.overdueRate}%` : '—'}
              icon="alert-circle"
            />
          </div>

          <RevenueTrendCard data={data.revenueTrend} title="Revenus (12 derniers mois)" />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ProjectTypeBreakdownCard items={data.revenueByProjectType} />
            <TopClientsCard items={data.topClients} />
          </div>

          <SuggestionsCard items={data.suggestions} />
        </div>
      )}
    </div>
  );
}
