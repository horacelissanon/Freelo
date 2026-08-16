// Shared relative-date filter used across the list pages (Projets, Clients,
// Devis, Factures) — one consistent set of quick ranges instead of each page
// inventing its own ad-hoc date picker. Weeks are Monday-first (French
// convention), matching DatePicker.tsx's calendar grid.
export type DateFilterKey = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';

export interface DateFilterValue {
  key: DateFilterKey;
  /** 'YYYY-MM-DD' strings, only meaningful when key === 'custom'. */
  custom?: { start: string; end: string };
}

export interface DateRange {
  start: Date;
  end: Date;
}

export const DATE_FILTER_OPTIONS: { key: DateFilterKey; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week', label: 'Cette semaine' },
  { key: 'month', label: 'Ce mois' },
  { key: 'year', label: 'Cette année' },
  { key: 'custom', label: 'Personnaliser' },
];

export const DEFAULT_DATE_FILTER: DateFilterValue = { key: 'month' };

// Local calendar date as 'YYYY-MM-DD' — Date#toISOString() reports UTC, which
// rolls over to the next/previous day for any timezone offset from UTC, so
// it must never be used to seed a "today" default for a date picker.
export function localDateValue(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const day = r.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  return r;
}

function endOfWeek(d: Date): Date {
  const r = startOfWeek(d);
  r.setDate(r.getDate() + 6);
  return endOfDay(r);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
}

/** null means "no bound" (the 'all' filter, or an incomplete custom range). */
export function resolveDateRange(value: DateFilterValue, now: Date = new Date()): DateRange | null {
  switch (value.key) {
    case 'all':
      return null;
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'week':
      return { start: startOfWeek(now), end: endOfWeek(now) };
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'year':
      return { start: startOfYear(now), end: endOfYear(now) };
    case 'custom': {
      if (!value.custom?.start || !value.custom?.end) return null;
      return {
        start: startOfDay(parseDateOnly(value.custom.start)),
        end: endOfDay(parseDateOnly(value.custom.end)),
      };
    }
  }
}

export function isWithinDateFilter(
  iso: string | null | undefined,
  value: DateFilterValue,
  now: Date = new Date(),
): boolean {
  const range = resolveDateRange(value, now);
  if (!range) return true;
  if (!iso) return false;
  const d = new Date(iso);
  return d >= range.start && d <= range.end;
}

const MONTH_YEAR_FORMAT: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
const DAY_MONTH_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
const DAY_MONTH_YEAR_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Shown alongside the filter so a freelance always knows which period
// they're looking at, without having to work it out from the pill label —
// most useful for 'month'/'year' where "now" isn't visually obvious.
export function formatDateFilterPeriodLabel(
  value: DateFilterValue,
  now: Date = new Date(),
): string | null {
  const range = resolveDateRange(value, now);
  if (!range) return null;
  switch (value.key) {
    case 'today':
      return capitalize(range.start.toLocaleDateString('fr-FR', DAY_MONTH_YEAR_FORMAT));
    case 'week':
    case 'custom':
      return `${range.start.toLocaleDateString('fr-FR', DAY_MONTH_FORMAT)} – ${range.end.toLocaleDateString('fr-FR', DAY_MONTH_YEAR_FORMAT)}`;
    case 'month':
      return capitalize(range.start.toLocaleDateString('fr-FR', MONTH_YEAR_FORMAT));
    case 'year':
      return String(range.start.getFullYear());
    default:
      return null;
  }
}
