import { canonicalDigest } from '@khums/calculation-engine';
import type {
  AiInvolvement,
  GovernanceActorRef,
  ResearchChain,
  ResearchEntityType,
  ResearchQuestionRef,
  ResearchReference,
  ResearchRevisionKind,
  ResearchRevisionRecord,
  ResearchState,
} from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import { researchChainSchema } from '@khums/validation';

import { deepFreeze, isValidActor, isValidTimestamp } from '../governance/ledger';
import { type AiIssueCode, aiReviewPending, checkAiInvolvement } from './ai-involvement';
import { isQuestionOfCatalogueRevision } from './catalogue';
import { researchDisplayRef } from './ids';
import {
  ALLOWED_REFERENCES,
  APPROVAL_KINDS,
  REASON_REQUIRED,
  RESEARCH_TRANSITIONS,
  TERMINAL_RESEARCH_STATES,
} from './lifecycle';

/**
 * Research revision chains (M5.3.2; docs/SCHOLAR_RESEARCH_ARCHITECTURE.md §4–§5). An entity's
 * records are an append-only, hash-chained list of full-snapshot revisions. The state is derived by
 * replaying every record through ONE transition function (also used to append), never stored.
 *
 * Rules: revision 0 is `CREATED`; the entity type, id, display reference (recomputed from the
 * UUID, Marja, entity type and question), Marja, ruling version and question (with its supported
 * catalogue revision) never change; contiguous revisions and `${entityId}#${n}` record ids; digest
 * links, recomputed record and payload digests; staff-principal actors only; non-decreasing server
 * times; content (payload, references, AI involvement) only on CREATED/REVISED; a reason on
 * DISPUTED, WITHDRAWN and DRAFT_DELETED; references of the same Marja, allowed types, never itself;
 * AI involvement is cumulative (a revision keeps every earlier declaration, unchanged except that
 * NOT_REVIEWED may become reviewed; new declarations and append-only corrections may be added);
 * approval-type transitions refused while any effective (uncorrected) declaration is unreviewed; every transition allowed by the entity's lifecycle;
 * nothing after a terminal state.
 */

export type ResearchIssueCode =
  /** A stored chain fails verification (replay). */
  | 'RESEARCH_CHAIN_INVALID'
  | 'INVALID_TRANSITION'
  | 'CHAIN_TERMINAL'
  | 'REASON_REQUIRED'
  | 'CONTENT_REQUIRED'
  | 'CONTENT_NOT_ALLOWED'
  | 'AI_REVIEW_REQUIRED'
  /** Cumulative AI involvement and corrections (ai-involvement.ts). */
  | AiIssueCode
  | 'BINDING_INVALID'
  | 'QUESTION_UNKNOWN'
  | 'REFERENCE_OTHER_MARJA'
  | 'REFERENCE_SELF'
  | 'REFERENCE_TYPE_INVALID'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_ACTOR';

/** The state derived by replaying a chain. */
export interface ResearchView {
  readonly entityType: ResearchEntityType;
  readonly entityId: string;
  readonly displayRef: string;
  readonly marjaId: string;
  readonly rulingVersion: number | null;
  /** RULING: the series shared by all its versions (version 1's entity id); null otherwise. */
  readonly rulingSeriesId: string | null;
  readonly question: ResearchQuestionRef | null;
  readonly state: ResearchState;
  /** The state after each revision (index = revision). */
  readonly states: readonly ResearchState[];
  /** The latest content revision (CREATED or REVISED). */
  readonly content: ResearchRevisionRecord;
  readonly last: ResearchRevisionRecord;
  /** The number of records; sent back as `expectedRevision` with the next command. */
  readonly length: number;
}

const recordDigestOf = (record: Omit<ResearchRevisionRecord, 'recordDigest'>): string | null => {
  const digest = canonicalDigest(record);
  return digest.ok ? digest.value : null;
};
const payloadDigestOf = (payload: unknown): string | null => {
  const digest = canonicalDigest(payload);
  return digest.ok ? digest.value : null;
};

interface ReplayState {
  readonly view: ResearchView | null;
  readonly lastDigest: string | null;
  readonly lastRecordedAt: string | null;
}

const sameQuestion = (a: ResearchQuestionRef | null, b: ResearchQuestionRef | null): boolean =>
  a === null || b === null ? a === b : a.id === b.id && a.catalogueRevision === b.catalogueRevision;

function bindingValid(record: ResearchRevisionRecord): boolean {
  if (record.entityType === 'RULING') {
    if (record.rulingVersion === null || record.question !== null) return false;
    // Every ruling belongs to a series; version 1 starts it (its own entity id).
    if (record.rulingSeriesId === undefined) return false;
    if (record.rulingVersion === 1 && record.rulingSeriesId !== record.entityId) return false;
    if (record.rulingVersion > 1 && record.rulingSeriesId === record.entityId) return false;
  } else if (record.rulingVersion !== null || record.rulingSeriesId !== undefined) {
    return false;
  }
  if (record.entityType === 'FINDING') return record.question !== null;
  return record.question === null;
}

/** The single transition function (append and replay). */
function applyRecord(
  state: ReplayState,
  record: ResearchRevisionRecord,
  index: number,
  chain: { readonly entityType: ResearchEntityType; readonly entityId: string },
): Result<ReplayState, ResearchIssueCode> {
  const { view } = state;
  if (view !== null && TERMINAL_RESEARCH_STATES.has(view.state)) return err('CHAIN_TERMINAL');
  if (
    record.revision !== index ||
    record.recordId !== `${chain.entityId}#${String(index)}` ||
    record.entityType !== chain.entityType ||
    record.entityId !== chain.entityId ||
    record.previousRecordDigest !== state.lastDigest
  ) {
    return err('RESEARCH_CHAIN_INVALID');
  }
  const { recordDigest, ...rest } = record;
  if (recordDigestOf(rest) !== recordDigest) return err('RESEARCH_CHAIN_INVALID');
  if (!isValidTimestamp(record.recordedAt)) return err('INVALID_TIMESTAMP');
  if (state.lastRecordedAt !== null && record.recordedAt < state.lastRecordedAt) {
    return err('INVALID_TIMESTAMP');
  }
  // Research records are written only by authenticated staff (governance ledgers keep their own
  // actor rules, including legacy unverified references).
  if (!isValidActor(record.actor) || record.actor.kind !== 'STAFF_PRINCIPAL') {
    return err('INVALID_ACTOR');
  }

  // Immutable bindings.
  if (view === null) {
    if (record.kind !== 'CREATED') return err('INVALID_TRANSITION');
    if (!bindingValid(record)) return err('BINDING_INVALID');
    if (
      record.question !== null &&
      !isQuestionOfCatalogueRevision(record.question.id, record.question.catalogueRevision)
    ) {
      return err('QUESTION_UNKNOWN');
    }
    const expectedRef = researchDisplayRef(
      record.entityType,
      record.marjaId,
      record.entityId,
      record.question?.id ?? null,
    );
    if (record.displayRef !== expectedRef) return err('BINDING_INVALID');
  } else if (
    record.kind === 'CREATED' ||
    record.displayRef !== view.displayRef ||
    record.marjaId !== view.marjaId ||
    record.rulingVersion !== view.rulingVersion ||
    (record.rulingSeriesId ?? null) !== view.rulingSeriesId ||
    !sameQuestion(record.question, view.question)
  ) {
    return err(record.kind === 'CREATED' ? 'INVALID_TRANSITION' : 'BINDING_INVALID');
  }

  // Content only on CREATED / REVISED.
  const isContent = record.kind === 'CREATED' || record.kind === 'REVISED';
  if (isContent) {
    if (record.payload === null || record.payloadDigest !== payloadDigestOf(record.payload)) {
      return err(record.payload === null ? 'CONTENT_REQUIRED' : 'RESEARCH_CHAIN_INVALID');
    }
    for (const reference of record.references) {
      if (reference.marjaId !== record.marjaId) return err('REFERENCE_OTHER_MARJA');
      if (reference.entityId === record.entityId) return err('REFERENCE_SELF');
      if (!ALLOWED_REFERENCES[record.entityType].includes(reference.entityType)) {
        return err('REFERENCE_TYPE_INVALID');
      }
      if ((reference.entityType === 'RULING') !== (reference.rulingVersion !== null)) {
        return err('REFERENCE_TYPE_INVALID');
      }
    }
    const aiIssue = checkAiInvolvement(view?.content.aiInvolvement ?? [], record.aiInvolvement);
    if (aiIssue !== null) return err(aiIssue);
  } else if (
    record.payload !== null ||
    record.payloadDigest !== null ||
    record.references.length > 0 ||
    record.aiInvolvement.length > 0
  ) {
    return err('CONTENT_NOT_ALLOWED');
  }
  if (REASON_REQUIRED.has(record.kind) && record.reason === null) return err('REASON_REQUIRED');

  // Lifecycle.
  let next: ResearchState;
  if (view === null) {
    next = 'DRAFT';
  } else {
    const target = RESEARCH_TRANSITIONS[record.entityType][view.state]?.[record.kind];
    if (target === undefined) return err('INVALID_TRANSITION');
    // The latest content revision carries every declaration ever made (cumulative), so this gate
    // sees all AI involvement in the entity's history; a corrected declaration is replaced in the
    // gate by its correction, which starts unreviewed.
    if (APPROVAL_KINDS.has(record.kind) && aiReviewPending(view.content.aiInvolvement)) {
      return err('AI_REVIEW_REQUIRED');
    }
    next = target;
  }
  const content = isContent ? record : (view?.content ?? record);
  return ok({
    view: {
      entityType: record.entityType,
      entityId: record.entityId,
      displayRef: record.displayRef,
      marjaId: record.marjaId,
      rulingVersion: record.rulingVersion,
      rulingSeriesId: record.rulingSeriesId ?? null,
      question: record.question,
      state: next,
      states: [...(view?.states ?? []), next],
      content,
      last: record,
      length: index + 1,
    },
    lastDigest: recordDigest,
    lastRecordedAt: record.recordedAt,
  });
}

function replayInternal(
  raw: unknown,
): Result<{ readonly view: ResearchView; readonly chain: ResearchChain }, ResearchIssueCode> {
  const parsed = researchChainSchema.safeParse(raw);
  if (!parsed.success || parsed.data.records.length === 0) return err('RESEARCH_CHAIN_INVALID');
  const chain = parsed.data;
  let state: ReplayState = { view: null, lastDigest: null, lastRecordedAt: null };
  for (const [index, record] of chain.records.entries()) {
    const applied = applyRecord(state, record, index, chain);
    if (!applied.ok) return err('RESEARCH_CHAIN_INVALID');
    state = applied.value;
  }
  if (state.view === null) return err('RESEARCH_CHAIN_INVALID');
  return ok({ view: state.view, chain });
}

/** Replays and verifies a research chain (possibly from untrusted storage). Fails closed. */
export function replayResearchChain(raw: unknown): Result<ResearchView, ResearchIssueCode> {
  const replayed = replayInternal(raw);
  return replayed.ok ? ok(deepFreeze(replayed.value.view)) : replayed;
}

/** The immutable bindings of a new entity (revision 0). */
export interface ResearchBinding {
  readonly entityType: ResearchEntityType;
  readonly entityId: string;
  readonly displayRef: string;
  readonly marjaId: string;
  readonly rulingVersion: number | null;
  /** RULING: the series (version 1's entity id); absent or null for every other entity type. */
  readonly rulingSeriesId?: string | null;
  readonly question: ResearchQuestionRef | null;
}

/** What a command supplies for a new revision. */
export interface ResearchRevisionDraft {
  readonly kind: ResearchRevisionKind;
  readonly payload: Readonly<Record<string, unknown>> | null;
  readonly references: readonly ResearchReference[];
  readonly aiInvolvement: readonly AiInvolvement[];
  readonly actor: GovernanceActorRef;
  readonly recordedAt: string;
  readonly reason: string | null;
  readonly decisionId: string;
  readonly requestId: string;
}

/**
 * Appends one revision. `chain` null starts a new entity with `binding` (revision 0 must be
 * CREATED). The result is re-verified with the same rules used on read; the input is unchanged.
 */
export function appendResearchRevision(
  chain: ResearchChain | null,
  binding: ResearchBinding | null,
  draft: ResearchRevisionDraft,
): Result<
  { readonly chain: ResearchChain; readonly record: ResearchRevisionRecord },
  ResearchIssueCode
> {
  let base: ResearchChain;
  let state: ReplayState;
  let bind: ResearchBinding;
  if (chain === null) {
    if (binding === null) return err('BINDING_INVALID');
    base = { entityType: binding.entityType, entityId: binding.entityId, records: [] };
    state = { view: null, lastDigest: null, lastRecordedAt: null };
    bind = binding;
  } else {
    const replayed = replayInternal(chain);
    if (!replayed.ok) return replayed;
    base = replayed.value.chain;
    const { view } = replayed.value;
    state = { view, lastDigest: view.last.recordDigest, lastRecordedAt: view.last.recordedAt };
    bind = view;
  }
  const revision = base.records.length;
  const seriesId = bind.rulingSeriesId ?? null;
  const partial: Omit<ResearchRevisionRecord, 'recordDigest'> = {
    entityType: bind.entityType,
    entityId: bind.entityId,
    displayRef: bind.displayRef,
    marjaId: bind.marjaId,
    rulingVersion: bind.rulingVersion,
    ...(seriesId === null ? {} : { rulingSeriesId: seriesId }),
    question: bind.question,
    revision,
    recordId: `${bind.entityId}#${String(revision)}`,
    kind: draft.kind,
    payload: draft.payload,
    payloadDigest: draft.payload === null ? null : payloadDigestOf(draft.payload),
    references: draft.references,
    aiInvolvement: draft.aiInvolvement,
    actor: draft.actor,
    recordedAt: draft.recordedAt,
    reason: draft.reason,
    decisionId: draft.decisionId,
    requestId: draft.requestId,
    previousRecordDigest: state.lastDigest,
  };
  const recordDigest = recordDigestOf(partial);
  if (recordDigest === null) return err('RESEARCH_CHAIN_INVALID');
  const record: ResearchRevisionRecord = { ...partial, recordDigest };
  // Shape first (bounded sizes, strict fields), then the transition rules.
  const next = {
    entityType: base.entityType,
    entityId: base.entityId,
    records: [...base.records, record],
  };
  if (!researchChainSchema.safeParse(next).success) return err('RESEARCH_CHAIN_INVALID');
  const applied = applyRecord(state, record, revision, base);
  if (!applied.ok) return applied;
  return ok(deepFreeze({ chain: next, record }));
}
