import { describe, expect, it } from 'vitest';

import type { FinancialFact, FinancialFactSheet } from '@khums/shared-types';

import {
  addPeriod,
  copyEntryStateForNewYear,
  entryStateFromSheet,
  initialEntryState,
  newFactId,
  removeFact,
  removePeriod,
  saveFact,
  savedFactIssues,
} from './entry-state';
import { frameFromDraft } from './drafts';

const fact = (id: string, date: string): FinancialFact => ({
  id,
  kind: 'EXPENSE',
  subtype: 'HOUSEHOLD',
  label: null,
  note: null,
  currency: 'USD',
  value: { status: 'KNOWN', amount: '5' },
  periodId: 'period-1',
  paidOn: { status: 'KNOWN', date },
});

describe('entry state', () => {
  it('starts empty with no preferred currency chosen', () => {
    const state = initialEntryState('annual');
    expect(state.facts).toEqual([]);
    expect(state.frame.currency).toBe('');
  });

  it('adds, updates and removes facts by id', () => {
    let state = initialEntryState('first-time');
    const [id, next] = newFactId(state);
    expect(id).toBe('fact-1');
    state = saveFact(next, fact(id, '2024-01-01'));
    state = saveFact(state, { ...fact(id, '2024-02-01') });
    expect(state.facts).toHaveLength(1);
    expect(state.facts[0]).toMatchObject({ paidOn: { date: '2024-02-01' } });
    expect(removeFact(state, id).facts).toEqual([]);
    expect(newFactId(state)[0]).toBe('fact-2');
  });

  it('flags saved facts whose period was removed or no longer fits', () => {
    let state = addPeriod(initialEntryState('missed-year'));
    state = {
      ...state,
      frame: {
        ...state.frame,
        currency: 'USD',
        assessmentDate: '2026-06-30',
        periods: [{ id: 'period-1', start: '2024-01-01', end: '2024-12-31' }],
      },
    };
    state = saveFact(state, fact('fact-1', '2024-03-01'));
    expect(savedFactIssues(state).size).toBe(0);
    const narrowed = {
      ...state,
      frame: {
        ...state.frame,
        periods: [{ id: 'period-1', start: '2024-06-01', end: '2024-12-31' }],
      },
    };
    expect(savedFactIssues(narrowed).get('fact-1')).toEqual([
      { path: 'paidOn', code: 'DATE_OUTSIDE_PERIOD' },
    ]);
    // Without any valid period the dates are incomplete: nothing is flagged yet.
    expect(savedFactIssues(removePeriod(state, 'period-1')).size).toBe(0);
  });
});

describe('entryStateFromSheet', () => {
  it('rebuilds the frame, facts and counters of a sheet losslessly', () => {
    const sheets: FinancialFactSheet[] = [
      {
        schemaVersion: 1,
        currency: 'USD',
        context: { workflow: 'annual', period: { start: '2025-01-01', end: '2025-12-31' } },
        facts: [
          { ...fact('fact-1', '2025-03-01'), periodId: null },
          { ...fact('fact-2', '2025-06-01'), periodId: null },
        ],
      },
    ];
    for (const sheet of sheets) {
      const scenario = { sheet, workflow: sheet.context.workflow };
      const state = entryStateFromSheet(scenario.sheet);
      expect(state.workflow).toBe(scenario.workflow);
      expect(state.facts).toEqual(scenario.sheet.facts);
      expect(state.frame.currency).toBe(scenario.sheet.currency);
      expect(state.nextFact).toBe(scenario.sheet.facts.length + 1);
      expect(frameFromDraft(state.frame, state.workflow).ok).toBe(true);
      expect(savedFactIssues(state).size).toBe(0);
      const { context } = scenario.sheet;
      if (context.workflow === 'annual') {
        expect([state.frame.periodStart, state.frame.periodEnd]).toEqual([
          context.period.start,
          context.period.end,
        ]);
      } else {
        expect(state.frame.assessmentDate).toBe(context.assessmentDate);
      }
      if (context.workflow === 'missed-year') expect(state.frame.periods).toEqual(context.periods);
    }
  });
});

describe('saved calculations (decision 71)', () => {
  const annual = (ids: readonly string[]) =>
    entryStateFromSheet({
      schemaVersion: 1,
      currency: 'USD',
      context: { workflow: 'annual', period: { start: '2025-01-01', end: '2025-12-31' } },
      facts: ids.map((id) => ({ ...fact(id, '2025-03-01'), periodId: null })),
    });

  it('never reuses an id still in a saved sheet with gaps (regression)', () => {
    const state = annual(['fact-1', 'fact-3']);
    expect(state.nextFact).toBe(4);
    const [id] = newFactId(state);
    expect(id).toBe('fact-4');
  });

  it('copies entries for a new year with the assessment dates cleared, entry dates unchanged', () => {
    const original = annual(['fact-1']);
    const copy = copyEntryStateForNewYear(original);
    expect(copy.facts).toEqual(original.facts);
    expect(copy.frame).toEqual({ ...original.frame, periodStart: '', periodEnd: '' });
    expect(frameFromDraft(copy.frame, copy.workflow).ok).toBe(false);
    // With new dates, an entry from the old year is flagged for the person to update.
    const moved = {
      ...copy,
      frame: { ...copy.frame, periodStart: '2026-01-01', periodEnd: '2026-12-31' },
    };
    expect(savedFactIssues(moved).get('fact-1')).toEqual([
      { path: 'paidOn', code: 'DATE_OUTSIDE_PERIOD' },
    ]);
  });
});
