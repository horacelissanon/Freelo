'use client';

import { useId, useState } from 'react';
import { formatPrice } from '@/lib/utils';
import { EmptyState } from '@/components/ui/PageStates';

export interface RevenueTrendPoint {
  month: string; // "YYYY-MM"
  amount: number;
}

const CHART_WIDTH = 600;
const CHART_HEIGHT = 140;
const PADDING_X = 16;
const PADDING_Y = 16;

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year ?? 2026, (month ?? 1) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'short' })
    .replace('.', '');
}

function monthLabelFull(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year ?? 2026, (month ?? 1) - 1, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}

interface Point {
  x: number;
  y: number;
}

// Catmull-Rom -> cubic Bezier conversion so the line passes through every
// point (unlike a generic bezier smoothing) while staying visually curved
// rather than the sharp-cornered polyline a plain "L" path would give.
function buildSmoothPath(points: Point[]): string {
  const first = points[0];
  if (!first) return '';
  if (points.length === 1) return `M ${first.x} ${first.y}`;
  let d = `M ${first.x} ${first.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

// Boundaries between hover zones sit at the midpoint between two consecutive
// points, so the zone a pointer is over always maps to the visually nearest
// point instead of a fixed even split.
function buildHoverZones(points: Point[]): { x: number; width: number }[] {
  if (points.length === 0) return [];
  const edges = [0];
  for (let i = 0; i < points.length - 1; i++) {
    edges.push((points[i]!.x + points[i + 1]!.x) / 2);
  }
  edges.push(CHART_WIDTH);
  return points.map((_, i) => ({ x: edges[i]!, width: edges[i + 1]! - edges[i]! }));
}

export function RevenueTrendCard({
  data,
  masked,
  title = 'Revenus (6 derniers mois)',
  unit,
}: {
  data: RevenueTrendPoint[];
  masked?: boolean;
  title?: string;
  /** Currency these amounts are expressed in — shown next to the total and
   *  in the hover tooltip so neither reads as an unlabeled, ambiguous
   *  figure once the global currency-display switcher is in play. */
  unit?: string;
}) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.amount));
  const hasRevenue = data.some((d) => d.amount > 0);

  const innerWidth = CHART_WIDTH - PADDING_X * 2;
  const innerHeight = CHART_HEIGHT - PADDING_Y * 2;
  const baseY = PADDING_Y + innerHeight;

  const points: (Point & RevenueTrendPoint)[] = data.map((d, i) => ({
    x: data.length === 1 ? PADDING_X : PADDING_X + (i / (data.length - 1)) * innerWidth,
    y: baseY - (d.amount / max) * innerHeight,
    month: d.month,
    amount: d.amount,
  }));

  const linePath = buildSmoothPath(points);
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1]!.x} ${baseY} L ${points[0]!.x} ${baseY} Z`
      : '';
  const last = points[points.length - 1];
  const hoverZones = buildHoverZones(points);
  const hovered = hoverIndex !== null ? points[hoverIndex] : undefined;

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-canvas shadow-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-headings text-base font-semibold text-foreground">{title}</h2>
        {last && (
          <p className="font-body text-sm font-semibold text-primary">
            {masked ? '••••' : formatPrice(last.amount)}
            {!masked && unit && (
              <span className="ml-1 font-normal text-muted-foreground">{unit}</span>
            )}
          </p>
        )}
      </div>
      {!hasRevenue ? (
        <EmptyState
          icon="trending-up"
          title="Pas encore de revenus"
          description="Les factures payées apparaîtront ici, mois par mois."
        />
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <div className="relative">
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="w-full"
              preserveAspectRatio="none"
              role="img"
              aria-label={title}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    style={{ stopColor: 'var(--color-primary)', stopOpacity: 0.3 }}
                  />
                  <stop
                    offset="100%"
                    style={{ stopColor: 'var(--color-primary)', stopOpacity: 0 }}
                  />
                </linearGradient>
              </defs>
              <line
                x1={PADDING_X}
                y1={baseY}
                x2={CHART_WIDTH - PADDING_X}
                y2={baseY}
                className="stroke-border"
                strokeDasharray="4 4"
              />
              <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
              <path
                d={linePath}
                fill="none"
                className="stroke-primary"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {hovered && (
                <line
                  x1={hovered.x}
                  x2={hovered.x}
                  y1={PADDING_Y}
                  y2={baseY}
                  className="stroke-primary/30"
                  strokeWidth={1}
                />
              )}
              {points.map((p, i) => (
                <circle
                  key={p.month}
                  cx={p.x}
                  cy={p.y}
                  r={i === hoverIndex ? 6 : i === points.length - 1 ? 5 : 3}
                  className={
                    i === hoverIndex || i === points.length - 1 ? 'fill-primary' : 'fill-canvas'
                  }
                  strokeWidth={2}
                  stroke="var(--color-primary)"
                />
              ))}
              {hoverZones.map((zone, i) => (
                <rect
                  key={points[i]!.month}
                  x={zone.x}
                  y={0}
                  width={zone.width}
                  height={CHART_HEIGHT}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() => setHoverIndex((prev) => (prev === i ? null : prev))}
                  onTouchStart={() => setHoverIndex(i)}
                />
              ))}
            </svg>
            {hovered && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-center shadow-lg"
                style={{
                  left: `${(hovered.x / CHART_WIDTH) * 100}%`,
                  top: `${Math.max((hovered.y / CHART_HEIGHT) * 100, 12)}%`,
                  marginTop: '-10px',
                }}
              >
                <p className="whitespace-nowrap font-body text-xs font-medium text-foreground capitalize">
                  {monthLabelFull(hovered.month)}
                </p>
                <p className="whitespace-nowrap font-body text-xs font-semibold text-primary">
                  {masked ? '••••' : formatPrice(hovered.amount)}
                  {!masked && unit && <span className="ml-1 font-normal">{unit}</span>}
                </p>
              </div>
            )}
          </div>
          <div className="mt-2 flex justify-between">
            {data.map((d) => (
              <span
                key={d.month}
                className="flex-1 text-center font-body text-xs text-muted-foreground capitalize"
              >
                {monthLabel(d.month)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
