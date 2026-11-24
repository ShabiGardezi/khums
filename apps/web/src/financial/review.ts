import { FACT_DATE_FIELDS } from '@khums/core';
import type { DateValue, FinancialFact, FinancialFactSheet } from '@khums/shared-types';

import { frameFromDraft } from './drafts';
import { savedFactIssues, type FactEntryState } from './entry-state';

/**
 * Review of the in-memory fact sheet (M4.3.3). Pure: no React, no storage. Nothing is
 * classified, totalled or filled in.
 */
export type ReviewStatus =
  | { readonly kind: 'incomplete-frame' }
  | { readonly kind: 'empty'; readonly sheet: FinancialFactSheet }
  | {
      readonly kind: 'issues';
      readonly sheet: FinancialFactSheet;
      readonly factIds: ReadonlySet<string>;
    }
  | { readonly kind: 'ready'; readonly sheet: FinancialFactSheet };

export function reviewSheet(state: FactEntryState): ReviewStatus {
  const frame = frameFromDraft(state.frame, state.workflow);
  if (!frame.ok) return { kind: 'incomplete-frame' };
  const sheet: FinancialFactSheet = { schemaVersion: 1, ...frame.frame, facts: state.facts };
  if (state.facts.length === 0) return { kind: 'empty', sheet };
  const issues = savedFactIssues(state);
  if (issues.size > 0) return { kind: 'issues', sheet, factIds: new Set(issues.keys()) };
  return { kind: 'ready', sheet };
}

export interface DateStateCounts {
  readonly approximate: number;
  readonly unknown: number;
  readonly notProvided: number;
}

/** Counts uncertain dates across all facts (descriptive only). */
export function dateStateCounts(facts: readonly FinancialFact[]): DateStateCounts {
  const counts = { approximate: 0, unknown: 0, notProvided: 0 };
  for (const fact of facts) {
    for (const field of FACT_DATE_FIELDS[fact.kind]) {
      const value = (fact as unknown as Readonly<Record<string, DateValue>>)[field];
      if (value?.status === 'APPROXIMATE') counts.approximate += 1;
      if (value?.status === 'UNKNOWN') counts.unknown += 1;
      if (value?.status === 'NOT_PROVIDED') counts.notProvided += 1;
    }
  }
  return counts;
}
