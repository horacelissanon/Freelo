import { describe, it, expect } from 'vitest';
import {
  resolveDateRange,
  isWithinDateFilter,
  formatDateFilterPeriodLabel,
  localDateValue,
  DEFAULT_DATE_FILTER,
} from './dateFilter';

// Wednesday 2026-08-19 12:00 UTC — mid-week, mid-month, mid-year, so every
// range (week/month/year) has both "before" and "after" neighbors to test.
const NOW = new Date(2026, 7, 19, 12, 0, 0);

describe('resolveDateRange', () => {
  it("'all' has no bound", () => {
    expect(resolveDateRange({ key: 'all' }, NOW)).toBeNull();
  });

  it("'today' spans the calendar day only", () => {
    const range = resolveDateRange({ key: 'today' }, NOW);
    expect(range?.start.getDate()).toBe(19);
    expect(range?.start.getHours()).toBe(0);
    expect(range?.end.getHours()).toBe(23);
    expect(range?.end.getDate()).toBe(19);
  });

  it("'week' is Monday-first and spans 7 days", () => {
    const range = resolveDateRange({ key: 'week' }, NOW);
    // 2026-08-19 is a Wednesday -> Monday is 2026-08-17.
    expect(range?.start.getDate()).toBe(17);
    expect(range?.end.getDate()).toBe(23);
  });

  it("'month' spans the full calendar month", () => {
    const range = resolveDateRange({ key: 'month' }, NOW);
    expect(range?.start.getDate()).toBe(1);
    expect(range?.start.getMonth()).toBe(7);
    expect(range?.end.getMonth()).toBe(7);
    expect(range?.end.getDate()).toBe(31);
  });

  it("'year' spans Jan 1 to Dec 31", () => {
    const range = resolveDateRange({ key: 'year' }, NOW);
    expect(range?.start.getMonth()).toBe(0);
    expect(range?.start.getDate()).toBe(1);
    expect(range?.end.getMonth()).toBe(11);
    expect(range?.end.getDate()).toBe(31);
  });

  it("'custom' resolves the given start/end, inclusive", () => {
    const range = resolveDateRange(
      { key: 'custom', custom: { start: '2026-08-01', end: '2026-08-05' } },
      NOW,
    );
    expect(range?.start.getDate()).toBe(1);
    expect(range?.end.getDate()).toBe(5);
    expect(range?.end.getHours()).toBe(23);
  });

  it("'custom' with a missing bound has no range", () => {
    expect(resolveDateRange({ key: 'custom' }, NOW)).toBeNull();
  });
});

describe('isWithinDateFilter', () => {
  it("'all' matches everything, including null", () => {
    expect(isWithinDateFilter(null, { key: 'all' }, NOW)).toBe(true);
    expect(isWithinDateFilter('2020-01-01T00:00:00Z', { key: 'all' }, NOW)).toBe(true);
  });

  it('a null/missing date never matches a bounded filter', () => {
    expect(isWithinDateFilter(null, { key: 'month' }, NOW)).toBe(false);
    expect(isWithinDateFilter(undefined, { key: 'month' }, NOW)).toBe(false);
  });

  it("'month' matches dates inside the current month, excludes outside", () => {
    expect(isWithinDateFilter('2026-08-05T10:00:00', { key: 'month' }, NOW)).toBe(true);
    expect(isWithinDateFilter('2026-07-31T23:59:59', { key: 'month' }, NOW)).toBe(false);
    expect(isWithinDateFilter('2026-09-01T00:00:00', { key: 'month' }, NOW)).toBe(false);
  });

  it("DEFAULT_DATE_FILTER is 'month' — freelances land scoped to the current month", () => {
    expect(DEFAULT_DATE_FILTER.key).toBe('month');
  });
});

describe('formatDateFilterPeriodLabel', () => {
  it("'all' has no period label", () => {
    expect(formatDateFilterPeriodLabel({ key: 'all' }, NOW)).toBeNull();
  });

  it("'month' shows the French month + year", () => {
    expect(formatDateFilterPeriodLabel({ key: 'month' }, NOW)).toBe('Août 2026');
  });

  it("'year' shows just the year", () => {
    expect(formatDateFilterPeriodLabel({ key: 'year' }, NOW)).toBe('2026');
  });
});

describe('localDateValue', () => {
  it('formats using local calendar fields, not UTC (Date#toISOString would roll over near midnight)', () => {
    // 2026-01-05 23:30 local time — toISOString() on a UTC+ offset machine
    // would report 2026-01-06, which is the exact bug this helper avoids.
    const late = new Date(2026, 0, 5, 23, 30);
    expect(localDateValue(late)).toBe('2026-01-05');
  });

  it('pads single-digit months and days', () => {
    expect(localDateValue(new Date(2026, 2, 4))).toBe('2026-03-04');
  });
});
