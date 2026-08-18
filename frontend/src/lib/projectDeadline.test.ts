import { describe, it, expect, vi, afterEach } from 'vitest';
import { projectDeadlineUrgency } from './projectDeadline';

// Midnight UTC keeps the day-boundary math unambiguous (dueDate is stored as
// a plain date, effectively midnight, so anchoring "now" the same way avoids
// off-by-one flakiness from time-of-day).
const NOW = new Date('2026-08-18T00:00:00.000Z');

describe('projectDeadlineUrgency', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function withFixedNow<T>(fn: () => T): T {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      return fn();
    } finally {
      vi.useRealTimers();
    }
  }

  it('returns null when there is no dueDate', () => {
    expect(projectDeadlineUrgency(null, 'IN_PROGRESS')).toBeNull();
  });

  it('returns null for DRAFT projects even past their dueDate', () => {
    withFixedNow(() => {
      expect(projectDeadlineUrgency('2026-08-01T00:00:00.000Z', 'DRAFT')).toBeNull();
    });
  });

  it('returns null for DELIVERED projects even past their dueDate', () => {
    withFixedNow(() => {
      expect(projectDeadlineUrgency('2026-08-01T00:00:00.000Z', 'DELIVERED')).toBeNull();
    });
  });

  it('returns "overdue" when dueDate is in the past', () => {
    withFixedNow(() => {
      expect(projectDeadlineUrgency('2026-08-17T00:00:00.000Z', 'IN_PROGRESS')).toBe('overdue');
    });
  });

  it('returns "today" when dueDate is exactly today', () => {
    withFixedNow(() => {
      expect(projectDeadlineUrgency('2026-08-18T00:00:00.000Z', 'IN_REVIEW')).toBe('today');
    });
  });

  it('returns null when dueDate is more than a day out', () => {
    withFixedNow(() => {
      expect(projectDeadlineUrgency('2026-08-25T00:00:00.000Z', 'PENDING')).toBeNull();
    });
  });
});
