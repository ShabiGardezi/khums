import type { BuilderRuleContent, ScholarRuleRevision } from '@khums/validation';
import {
  builderAiPreparationSchema,
  builderRuleContentSchema,
  scholarRuleRevisionSchema,
} from '@khums/validation';
import { err, ok, type Result } from '@khums/utils';

import { deepFreeze } from '../governance/ledger';
import { validateBuilderRule, type BuilderErrorCode, type BuilderIssue } from './validate';

/**
 * Append-only revisions of builder rules (Phase 2 step 3): every save is a new revision with its
 * actor, time and reason; nothing is overwritten. Pure: the API supplies stored revisions, the
 * server-resolved ruling version, the actor and the clock.
 */

export type RuleRevisionRefusal =
  /** The stored revisions are not a contiguous chain of one rule of one Marja (fail closed). */
  | { readonly code: 'HISTORY_INVALID' }
  /** The caller read an older (or newer) state: `expectedRevision` differs. */
  | { readonly code: 'REVISION_CONFLICT' }
  /** The content has errors (never saved; drafts with only missing fields are saved). */
  | { readonly code: 'CONTENT_INVALID'; readonly errors: readonly BuilderIssue<BuilderErrorCode>[] }
  /** The new revision does not pass the record schema. */
  | { readonly code: 'RECORD_INVALID' }
  /**
   * AI marked the revision approved for scholar testing although it is not complete and
   * supported (READY_FOR_VERIFICATION), or together with a rejection (decision 76).
   */
  | { readonly code: 'AI_APPROVAL_INVALID' };

/** Parses and orders stored revisions of one rule; null when they do not form a valid history. */
export function replayRuleRevisions(
  raw: readonly unknown[],
): readonly ScholarRuleRevision[] | null {
  const parsed: ScholarRuleRevision[] = [];
  for (const item of raw) {
    const one = scholarRuleRevisionSchema.safeParse(item);
    if (!one.success) return null;
    parsed.push(one.data);
  }
  parsed.sort((a, b) => a.revision - b.revision);
  const first = parsed[0];
  if (first === undefined) return null;
  const valid = parsed.every(
    (r, i) => r.revision === i && r.ruleId === first.ruleId && r.marjaId === first.marjaId,
  );
  return valid ? deepFreeze(parsed) : null;
}

export interface RuleRevisionInput {
  readonly ruleId: string;
  readonly marjaId: string;
  /** Stored revisions (empty when creating). */
  readonly history: readonly ScholarRuleRevision[];
  /** The number of revisions the caller read (0 when creating). */
  readonly expectedRevision: number;
  readonly content: unknown;
  /** Resolved by the server from the research store (null without a ruling). */
  readonly rulingVersion: number | null;
  readonly actor: string;
  readonly at: string;
  readonly reason: unknown;
  /** Declared AI preparation of this revision (Phase 4), or undefined. */
  readonly aiPreparation?: unknown;
  /** `true` when this revision rejects the rule (Phase 4). */
  readonly rejected?: boolean;
}

/** The next revision of a rule, or why it cannot be saved. */
export function nextRuleRevision(
  input: RuleRevisionInput,
): Result<ScholarRuleRevision, RuleRevisionRefusal> {
  const history = input.history;
  if (
    !history.every(
      (r, i) => r.revision === i && r.ruleId === input.ruleId && r.marjaId === input.marjaId,
    )
  ) {
    return err({ code: 'HISTORY_INVALID' });
  }
  if (input.expectedRevision !== history.length) return err({ code: 'REVISION_CONFLICT' });
  const content = builderRuleContentSchema.safeParse(input.content);
  if (!content.success) return err({ code: 'RECORD_INVALID' });
  const check = validateBuilderRule(content.data);
  if (check.errors.length > 0) return err({ code: 'CONTENT_INVALID', errors: check.errors });
  const ai =
    input.aiPreparation === undefined
      ? undefined
      : builderAiPreparationSchema.safeParse(input.aiPreparation);
  if (ai !== undefined && !ai.success) return err({ code: 'RECORD_INVALID' });
  if (
    ai?.data.stage === 'APPROVED_FOR_SCHOLAR_TESTING' &&
    (check.status !== 'READY_FOR_VERIFICATION' || input.rejected === true)
  ) {
    return err({ code: 'AI_APPROVAL_INVALID' });
  }
  const record = scholarRuleRevisionSchema.safeParse({
    ruleId: input.ruleId,
    revision: history.length,
    marjaId: input.marjaId,
    content: content.data,
    rulingVersion: content.data.rulingId === null ? null : input.rulingVersion,
    actor: input.actor,
    at: input.at,
    reason: input.reason,
    ...(ai === undefined ? {} : { aiPreparation: ai.data }),
    ...(input.rejected === true ? { rejected: true } : {}),
  });
  return record.success ? ok(deepFreeze(record.data)) : err({ code: 'RECORD_INVALID' });
}

/** Builder content read from an API response or a form (null when it is not valid content). */
export function parseBuilderRuleContent(raw: unknown): BuilderRuleContent | null {
  const parsed = builderRuleContentSchema.safeParse(raw);
  return parsed.success ? deepFreeze(parsed.data) : null;
}
