import { describe, it, expect } from 'vitest';
import { computeProjectProgress, computeProjectStatus } from './progress';

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

describe('computeProjectStatus', () => {
  it('no steps -> PENDING', () => {
    expect(computeProjectStatus([])).toBe('PENDING');
  });

  it('nothing completed -> PENDING', () => {
    expect(
      computeProjectStatus([{ status: 'PENDING' }, { status: 'PENDING' }, { status: 'PENDING' }]),
    ).toBe('PENDING');
  });

  it('everything completed -> DELIVERED', () => {
    expect(computeProjectStatus([{ status: 'COMPLETED' }, { status: 'COMPLETED' }])).toBe(
      'DELIVERED',
    );
  });

  it('1-step project has no intermediate state: PENDING then straight to DELIVERED', () => {
    expect(computeProjectStatus([{ status: 'PENDING' }])).toBe('PENDING');
    expect(computeProjectStatus([{ status: 'COMPLETED' }])).toBe('DELIVERED');
  });

  it('2-step project skips IN_PROGRESS: the first step done is already the second-to-last', () => {
    expect(computeProjectStatus([{ status: 'COMPLETED' }, { status: 'PENDING' }])).toBe(
      'IN_REVIEW',
    );
  });

  it('3-step project: first done -> IN_PROGRESS, second (second-to-last) done -> IN_REVIEW', () => {
    expect(
      computeProjectStatus([{ status: 'COMPLETED' }, { status: 'PENDING' }, { status: 'PENDING' }]),
    ).toBe('IN_PROGRESS');
    expect(
      computeProjectStatus([
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
        { status: 'PENDING' },
      ]),
    ).toBe('IN_REVIEW');
  });

  it('5-step project: strictly between first and second-to-last stays IN_PROGRESS', () => {
    expect(
      computeProjectStatus([
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
        { status: 'PENDING' },
        { status: 'PENDING' },
      ]),
    ).toBe('IN_PROGRESS');
  });

  it('is symmetric — recomputing after un-completing a step lands on the same value either direction', () => {
    const threeStepsAllDone = [
      { status: 'COMPLETED' },
      { status: 'COMPLETED' },
      { status: 'COMPLETED' },
    ];
    expect(computeProjectStatus(threeStepsAllDone)).toBe('DELIVERED');
    const lastUndone = [{ status: 'COMPLETED' }, { status: 'COMPLETED' }, { status: 'PENDING' }];
    expect(computeProjectStatus(lastUndone)).toBe('IN_REVIEW');
  });
});
