import { describe, expect, it } from 'vitest';

import type { FinancialFact } from '@khums/shared-types';

import { initialEntryState, saveFact, type FactEntryState } from './entry-state';
import { dateStateCounts, reviewSheet } from './review';

const fact: FinancialFact = {
  id: 'fact-1',
  kind: 'LIABILITY',
  subtype: 'LOAN',
  label: null,
  note: null,
  currency: 'USD',
  value: { status: 'KNOWN', amount: '5' },
  periodId: null,
  valuedOn: { status: 'APPROXIMATE', date: '2026-01-01' },
  incurredOn: { status: 'UNKNOWN' },
  dueOn: { status: 'NOT_PROVIDED' },
};

const withFrame = (state: FactEntryState): FactEntryState => ({
  ...state,
  frame: { ...state.frame, currency: 'USD', periodStart: '2025-07-01', periodEnd: '2026-06-30' },
});

describe('reviewSheet', () => {
  it('reports incomplete dates, an empty sheet, issues and readiness', () => {
    const state = initialEntryState('annual');
    expect(reviewSheet(state).kind).toBe('incomplete-frame');
    expect(reviewSheet(withFrame(state)).kind).toBe('empty');
    const ready = saveFact(withFrame(state), fact);
    expect(reviewSheet(ready).kind).toBe('ready');
    const late = saveFact(withFrame(state), {
      ...fact,
      valuedOn: { status: 'KNOWN', date: '2027-01-01' },
    });
    const status = reviewSheet(late);
    expect(status.kind === 'issues' && [...status.factIds]).toEqual(['fact-1']);
  });

  it('returns the sheet unchanged (no rounding, filling in or totals)', () => {
    const status = reviewSheet(saveFact(withFrame(initialEntryState('annual')), fact));
    expect(status.kind === 'ready' && status.sheet.facts).toEqual([fact]);
  });
});

describe('dateStateCounts', () => {
  it('counts approximate, unknown and missing dates', () => {
    expect(dateStateCounts([fact])).toEqual({ approximate: 1, unknown: 1, notProvided: 1 });
  });
});
