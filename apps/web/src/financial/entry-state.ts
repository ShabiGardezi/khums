import {
  factIssuesById,
  MAX_FACT_PERIODS,
  MAX_FACTS_PER_SHEET,
  type FactSheetIssue,
} from '@khums/core';
import type { FinancialFact, FinancialFactSheet, Workflow } from '@khums/shared-types';

import { emptyFrameDraft, frameFromDraft, type FrameDraft } from './drafts';

/**
 * In-memory state of the financial details step. Pure functions only; the React component holds
 * the value in `useState`. It is never written to storage, cookies, URLs or a server.
 */
export interface FactEntryState {
  readonly workflow: Workflow;
  readonly frame: FrameDraft;
  readonly facts: readonly FinancialFact[];
  /** Counters for generated ids (not user data). */
  readonly nextFact: number;
  readonly nextPeriod: number;
}

export function initialEntryState(workflow: Workflow): FactEntryState {
  return { workflow, frame: emptyFrameDraft(''), facts: [], nextFact: 1, nextPeriod: 1 };
}

/**
 * The next counter after a sheet's own items: never reuses a generated id still in use (a saved
 * sheet may have gaps, e.g. `fact-1` and `fact-3` after a removal).
 */
function nextCounter(ids: readonly string[], prefix: string): number {
  let highest = ids.length;
  for (const id of ids) {
    const match = new RegExp(`^${prefix}-(\\d{1,9})$`).exec(id);
    if (match?.[1] !== undefined) highest = Math.max(highest, Number.parseInt(match[1], 10));
  }
  return highest + 1;
}

/**
 * The entry state for a prepared fact sheet (M5.4 review scenarios) or a calculation saved on
 * this device (decision 71): the same frame and facts the person could have typed, in memory
 * only. Counters continue after the sheet's own items.
 */
export function entryStateFromSheet(sheet: FinancialFactSheet): FactEntryState {
  const { context } = sheet;
  const frame: FrameDraft = {
    ...emptyFrameDraft(sheet.currency),
    ...(context.workflow === 'annual'
      ? { periodStart: context.period.start, periodEnd: context.period.end }
      : { assessmentDate: context.assessmentDate }),
    periods: context.workflow === 'missed-year' ? [...context.periods] : [],
  };
  return {
    workflow: context.workflow,
    frame,
    facts: [...sheet.facts],
    nextFact: nextCounter(
      sheet.facts.map((f) => f.id),
      'fact',
    ),
    nextPeriod: nextCounter(
      frame.periods.map((p) => p.id),
      'period',
    ),
  };
}

/**
 * A copy of the entries for a new year (decision 71): the same currency, entries and (missed-year)
 * past years, with the assessment dates cleared for the person to enter. Entry dates are never
 * shifted; entries dated outside the new dates are flagged by the usual checks for the person to
 * update. Nothing is saved until they choose Save.
 */
export function copyEntryStateForNewYear(state: FactEntryState): FactEntryState {
  return {
    ...state,
    frame: { ...state.frame, periodStart: '', periodEnd: '', assessmentDate: '' },
  };
}

export const canAddFact = (state: FactEntryState) => state.facts.length < MAX_FACTS_PER_SHEET;
export const canAddPeriod = (state: FactEntryState) =>
  state.frame.periods.length < MAX_FACT_PERIODS;

export function newFactId(state: FactEntryState): [string, FactEntryState] {
  return [`fact-${String(state.nextFact)}`, { ...state, nextFact: state.nextFact + 1 }];
}

export function saveFact(state: FactEntryState, fact: FinancialFact): FactEntryState {
  const exists = state.facts.some((f) => f.id === fact.id);
  return {
    ...state,
    facts: exists ? state.facts.map((f) => (f.id === fact.id ? fact : f)) : [...state.facts, fact],
  };
}

export function removeFact(state: FactEntryState, id: string): FactEntryState {
  return { ...state, facts: state.facts.filter((f) => f.id !== id) };
}

export function addPeriod(state: FactEntryState): FactEntryState {
  if (!canAddPeriod(state)) return state;
  const period = { id: `period-${String(state.nextPeriod)}`, start: '', end: '' };
  return {
    ...state,
    frame: { ...state.frame, periods: [...state.frame.periods, period] },
    nextPeriod: state.nextPeriod + 1,
  };
}

export function removePeriod(state: FactEntryState, id: string): FactEntryState {
  return {
    ...state,
    frame: { ...state.frame, periods: state.frame.periods.filter((p) => p.id !== id) },
  };
}

/**
 * Issues for saved facts against the current dates (e.g. after the user changed them), keyed by
 * fact id. Empty while the dates themselves are incomplete or invalid.
 */
export function savedFactIssues(
  state: FactEntryState,
): ReadonlyMap<string, readonly FactSheetIssue[]> {
  const frame = frameFromDraft(state.frame, state.workflow);
  if (!frame.ok) return new Map();
  const sheet: FinancialFactSheet = { schemaVersion: 1, ...frame.frame, facts: state.facts };
  return factIssuesById(sheet);
}
