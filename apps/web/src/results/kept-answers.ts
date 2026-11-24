import {
  answersForRecalculation,
  noSavedAnswers,
  savedAnswersToReuse,
  type SavedPackRef,
} from '@khums/core';
import type {
  Answers,
  FactAnswers,
  FinancialFactSheet,
  QuestionDefinition,
  Workflow,
  YearAnswers,
} from '@khums/shared-types';

import type { ReopenRequest } from '@/lib/reopen-request';

/**
 * The answers a person gives on the verified results view, kept in the calculator's memory (never
 * stored or sent) so that leaving the results view ("Back", "Edit entry") and returning does not
 * lose or revert them (audit M-2). They are kept per Marja, assessment type and EXACT pack version
 * (id, version, digest): answers are never applied to another pack's questions (audit H-1).
 */

export interface AnswerSet {
  readonly answers: Answers;
  readonly yearAnswers: YearAnswers;
  readonly factAnswers: FactAnswers;
}

/** Answer sets by `answersKey`. */
export type KeptAnswers = Readonly<Record<string, AnswerSet>>;

export const answersKey = (marjaId: string, workflow: Workflow, pack: SavedPackRef): string =>
  JSON.stringify([marjaId, workflow, pack.packId, pack.version, pack.contentDigest]);

const keptFor = (kept: KeptAnswers, key: string): AnswerSet | undefined =>
  Object.hasOwn(kept, key) ? kept[key] : undefined;

/**
 * The answers in effect: the person's own answers for this pack if they gave any, otherwise the
 * saved answers of a reopened calculation where they may be reused (`savedAnswersToReuse`: edit
 * mode and exactly the same pack only; never for a copy), otherwise none. Always filtered to the
 * questions the pack asks and the entries and years now in the sheet (`answersForRecalculation`),
 * so an edited or removed entry never carries a stale answer.
 */
export function answersInEffect(
  kept: KeptAnswers,
  key: string,
  reopened: ReopenRequest | null,
  current: {
    readonly ref: SavedPackRef;
    readonly pack: { readonly questions: readonly QuestionDefinition[] };
  },
  sheet: FinancialFactSheet,
): AnswerSet {
  const base =
    keptFor(kept, key) ??
    (reopened === null
      ? noSavedAnswers()
      : savedAnswersToReuse(reopened.saved, reopened.mode, current, sheet));
  return answersForRecalculation(base, current.pack, sheet);
}

/** Records a change to the answers for `key`, starting from `inEffect` the first time. */
export function changeKeptAnswers(
  kept: KeptAnswers,
  key: string,
  inEffect: AnswerSet,
  change: (set: AnswerSet) => AnswerSet,
): KeptAnswers {
  return { ...kept, [key]: change(keptFor(kept, key) ?? inEffect) };
}
