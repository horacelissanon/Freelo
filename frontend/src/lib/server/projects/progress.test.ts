import { describe, it, expect } from 'vitest';
import { computeProjectProgress } from './progress';

describe('computeProjectProgress', () => {
  it('no steps -> 0', () => {
    expect(computeProjectProgress([])).toBe(0);
  });

  it('all steps pending -> 0', () => {
    expect(computeProjectProgress([{ status: 'PENDING' }, { status: 'IN_PROGRESS' }])).toBe(0);
  });

  it('partial completion rounds to the nearest percent', () => {
    expect(
      computeProjectProgress([
        { status: 'COMPLETED' },
        { status: 'PENDING' },
        { status: 'PENDING' },
      ]),
    ).toBe(33);
  });

  it('all steps completed -> 100', () => {
    expect(computeProjectProgress([{ status: 'COMPLETED' }, { status: 'COMPLETED' }])).toBe(100);
  });
});
