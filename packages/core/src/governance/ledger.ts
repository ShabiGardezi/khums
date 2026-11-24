import { canonicalDigest, sameIntegrity } from '@khums/calculation-engine';
import type {
  ActivationRecordEntry,
  ApprovalRecordEntry,
  CalculationIssueCode,
  ContentIntegrity,
  GovernanceActorRef,
  GovernanceLedger,
  GovernancePolicyId,
  GovernanceRecord,
  GovernanceState,
  PublicationRecord,
  ReviewCompletedRecord,
  ReviewStartedRecord,
  SubmissionRecord,
} from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import { governanceLedgerSchema } from '@khums/validation';

import { GOVERNANCE_POLICIES, LEGACY_GOVERNANCE_POLICY } from './policy';

/**
 * Append-only, hash-chained governance ledger for one pack version (M4.4.3;
 * RULE_PACK_STRUCTURE §5.9).
 *
 * Domain-level immutability:
 * - records and ledgers are deeply frozen;
 * - there is no update or delete operation, only `append`, which returns a NEW ledger;
 * - every record carries the digest of the previous one and its own digest, so a modified,
 *   deleted, inserted or reordered record is detected on replay, even outside this process.
 * Database-level enforcement (write-once storage, retention) is future work (FR-3).
 *
 * The lifecycle state is never stored: it is derived by replaying every record through the same
 * transition rules that `append` uses, on every call.
 */

export type GovernanceIssueCode =
  | 'LEDGER_MALFORMED'
  | 'LEDGER_TAMPERED'
  | 'LEDGER_TERMINAL'
  | 'INVALID_TRANSITION'
  | 'DUPLICATE_TRANSITION'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_ACTOR'
  | 'PACK_MISMATCH'
  | 'VERSION_MISMATCH'
  | 'DIGEST_MISMATCH'
  | 'STALE_CONTENT'
  | 'RESUBMISSION_UNCHANGED'
  | 'SELF_REVIEW'
  | 'SELF_APPROVAL'
  | 'NOT_THE_REVIEWER'
  | 'UNKNOWN_REFERENCE'
  | 'ALREADY_ACTIVATED'
  | 'APPROVALS_INCONSISTENT'
  | 'STATUS_INCONSISTENT'
  | 'NOT_ELIGIBLE'
  | 'CONTENT_CHANGED_AFTER_PUBLICATION'
  | 'SUCCESSOR_INVALID'
  /** A resubmission names a different governance policy than the one bound to the version. */
  | 'POLICY_MISMATCH'
  /** A command named a governance policy that does not exist. */
  | 'POLICY_INVALID'
  /** The Marja has no configured governance policy (nothing new can be submitted). */
  | 'POLICY_NOT_CONFIGURED'
  /** The policy registry failed verification. */
  | 'POLICY_REGISTRY_INVALID'
  | 'POLICY_UNCHANGED'
  | 'POLICY_CHANGE_INVALID'
  | 'POLICY_PROPOSAL_NOT_PENDING'
  | 'POLICY_PROPOSAL_MISMATCH'
  | 'POLICY_SELF_CONFIRMATION'
  /**
   * Decision 67: a rule-builder pack (`<marja>-builder`) may only be submitted together with a
   * source verification by the submitting principal of a rule the pack approves.
   */
  | 'BUILDER_VERIFICATION_REQUIRED'
  /**
   * M5.2.1: the pack version's SUBMITTED records name no policy (a legacy ledger). It accepts no
   * new record except an explicit `POLICY_BOUND` record or a withdrawal (fail closed).
   */
  | 'POLICY_UNBOUND'
  /** M5.2.1: `POLICY_BOUND` on a ledger whose policy is already recorded or bound. */
  | 'POLICY_ALREADY_BOUND'
  /** The pack does not pass the strict rule-pack schema (it cannot be safely detached). */
  | 'PACK_MALFORMED';

export interface GovernanceIssue {
  readonly code: GovernanceIssueCode | CalculationIssueCode;
  /** The ledger record concerned, if any (never pack content). */
  readonly recordId: string | null;
}

/** State derived from replaying a ledger. Never stored, always recomputed. */
export interface GovernanceView {
  readonly state: GovernanceState;
  /**
   * Policy bound at the first submission (null while DRAFT). Never changes afterwards, except
   * once for a legacy ledger through an explicit `POLICY_BOUND` record (M5.2.1).
   */
  readonly policy: GovernancePolicyId | null;
  /**
   * Where `policy` comes from (M5.2.1): `RECORDED` in the first SUBMITTED record; `LEGACY_UNRECORDED`
   * when no SUBMITTED record names one (replay verifies such history under `INDEPENDENT_REVIEW_V1`,
   * but no new record is accepted except `POLICY_BOUND` or a withdrawal); `BOUND` by an explicit
   * `POLICY_BOUND` record. Null while DRAFT.
   */
  readonly policySource: 'RECORDED' | 'LEGACY_UNRECORDED' | 'BOUND' | null;
  readonly submitter: GovernanceActorRef | null;
  readonly submission: SubmissionRecord | null;
  readonly reviewStart: ReviewStartedRecord | null;
  /** Digest the reviewer returned with CHANGES_REQUESTED (a resubmission must differ). */
  readonly changesRequestedDigest: string | null;
  readonly reviewCompleted: ReviewCompletedRecord | null;
  readonly approval: ApprovalRecordEntry | null;
  readonly publication: PublicationRecord | null;
  readonly activation: ActivationRecordEntry | null;
  readonly lastRecordedAt: string | null;
  readonly lastDigest: string | null;
}

const EMPTY_VIEW: GovernanceView = {
  state: 'DRAFT',
  policy: null,
  policySource: null,
  submitter: null,
  submission: null,
  reviewStart: null,
  changesRequestedDigest: null,
  reviewCompleted: null,
  approval: null,
  publication: null,
  activation: null,
  lastRecordedAt: null,
  lastDigest: null,
};

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SUBJECT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const TERMINAL: ReadonlySet<GovernanceState> = new Set(['WITHDRAWN', 'SUPERSEDED']);

export const isValidTimestamp = (at: string): boolean =>
  TIMESTAMP.test(at) && !Number.isNaN(Date.parse(at)) && new Date(at).toISOString() === at;

/** Checked at runtime because records may come from untrusted storage. */
export const isValidActor = (actor: GovernanceActorRef): boolean => {
  const kind = (actor as { readonly kind: unknown }).kind;
  return (
    (kind === 'STAFF_PRINCIPAL' || kind === 'UNVERIFIED_REFERENCE') && SUBJECT.test(actor.subject)
  );
};

const sameActor = (a: GovernanceActorRef | null, b: GovernanceActorRef) => a?.subject === b.subject;
const sameDigest = (a: ContentIntegrity | null | undefined, b: ContentIntegrity) =>
  sameIntegrity(a, b);

/**
 * Recursively freezes every object and array reachable from `value`. Unlike an early-exit freeze,
 * it also descends into objects that are already frozen, so a shallow-frozen parent cannot hide
 * mutable children.
 */
export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

/**
 * Detached copy of plain record data (objects, arrays, strings, numbers, booleans, null). Each
 * property is read exactly once, so getters or proxies cannot return one value to the digest and
 * another to the transition checks, and no reference to caller-owned objects is kept. Non-plain
 * values (functions, class instances, symbols, bigints) are refused.
 */
function snapshot(value: unknown, seen = new WeakSet<object>()): Result<unknown, null> {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return ok(value);
  if (typeof value === 'number') return Number.isFinite(value) ? ok(value) : err(null);
  if (typeof value !== 'object') return err(null);
  if (seen.has(value)) return err(null); // cycles are not record data
  seen.add(value);
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      const copied = snapshot(item, seen);
      if (!copied.ok) return copied;
      items.push(copied.value);
    }
    return ok(items);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return err(null);
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const copied = snapshot(item, seen);
    if (!copied.ok) return copied;
    copy[key] = copied.value;
  }
  return ok(copy);
}

export function createLedger(packId: string, version: string): GovernanceLedger {
  return deepFreeze({ packId, version, records: [] });
}

/** The state that record type `T` moves the ledger into (used to detect duplicates). */
const RESULT_STATE: Partial<Record<GovernanceRecord['type'], GovernanceState>> = {
  SUBMITTED: 'SUBMITTED',
  REVIEW_STARTED: 'UNDER_REVIEW',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  WITHDRAWN: 'WITHDRAWN',
  SUPERSEDED: 'SUPERSEDED',
};

/** The rules of the policy bound to this pack version (legacy rules before any submission). */
const rulesOf = (view: GovernanceView) =>
  GOVERNANCE_POLICIES[view.policy ?? LEGACY_GOVERNANCE_POLICY];

/**
 * The single transition function, used both by `append` and by replay. Content-level checks
 * (recomputed pack digests, eligibility) happen in the commands, which have the pack.
 */
export function applyRecord(
  view: GovernanceView,
  record: GovernanceRecord,
): Result<GovernanceView, GovernanceIssueCode> {
  if (TERMINAL.has(view.state)) return err('LEDGER_TERMINAL');
  if (!isValidTimestamp(record.recordedAt)) return err('INVALID_TIMESTAMP');
  if (view.lastRecordedAt !== null && record.recordedAt < view.lastRecordedAt) {
    return err('INVALID_TIMESTAMP');
  }
  if (!isValidActor(record.actor)) return err('INVALID_ACTOR');
  const invalid = (): Result<GovernanceView, GovernanceIssueCode> =>
    err(RESULT_STATE[record.type] === view.state ? 'DUPLICATE_TRANSITION' : 'INVALID_TRANSITION');
  const next = { ...view, lastRecordedAt: record.recordedAt, lastDigest: record.recordDigest };

  switch (record.type) {
    case 'SUBMITTED':
      if (view.state !== 'DRAFT' && view.state !== 'CHANGES_REQUESTED') return invalid();
      if (view.changesRequestedDigest === record.integrity.digest)
        return err('RESUBMISSION_UNCHANGED');
      {
        const policy = record.governancePolicy ?? LEGACY_GOVERNANCE_POLICY;
        // The policy is bound once per pack version; a resubmission cannot switch it.
        if (view.policy !== null && view.policy !== policy) return err('POLICY_MISMATCH');
        const policySource =
          view.policySource ??
          (record.governancePolicy === undefined ? 'LEGACY_UNRECORDED' : 'RECORDED');
        // A (re)submission starts a fresh review cycle: no earlier review state carries over.
        return ok({
          ...EMPTY_VIEW,
          policy,
          policySource,
          lastRecordedAt: record.recordedAt,
          lastDigest: record.recordDigest,
          state: 'SUBMITTED',
          submitter: record.actor,
          submission: record,
          changesRequestedDigest: view.changesRequestedDigest,
        });
      }
    case 'REVIEW_STARTED':
      if (view.state !== 'SUBMITTED') return invalid();
      if (!sameDigest(view.submission?.integrity, record.integrity)) return err('DIGEST_MISMATCH');
      if (rulesOf(view).reviewerMustDifferFromAuthor && sameActor(view.submitter, record.actor)) {
        return err('SELF_REVIEW');
      }
      return ok({ ...next, state: 'UNDER_REVIEW', reviewStart: record });
    case 'CHANGES_REQUESTED':
      if (view.state !== 'UNDER_REVIEW' || view.reviewCompleted !== null) return invalid();
      if (!sameActor(view.reviewStart?.actor ?? null, record.actor)) return err('NOT_THE_REVIEWER');
      if (!sameDigest(view.submission?.integrity, record.integrity)) return err('DIGEST_MISMATCH');
      return ok({
        ...next,
        state: 'CHANGES_REQUESTED',
        changesRequestedDigest: record.integrity.digest,
      });
    case 'REVIEW_COMPLETED':
      if (view.state !== 'UNDER_REVIEW') return invalid();
      if (view.reviewCompleted !== null) return err('DUPLICATE_TRANSITION');
      if (!sameActor(view.reviewStart?.actor ?? null, record.actor)) return err('NOT_THE_REVIEWER');
      if (!sameDigest(view.submission?.integrity, record.integrity)) return err('DIGEST_MISMATCH');
      return ok({ ...next, reviewCompleted: record });
    case 'APPROVED': {
      if (view.state !== 'UNDER_REVIEW' || view.reviewCompleted === null) return invalid();
      if (record.reviewRecordId !== view.reviewCompleted.recordId) return err('UNKNOWN_REFERENCE');
      if (!sameDigest(view.reviewCompleted.integrity, record.integrity))
        return err('DIGEST_MISMATCH');
      // Under independent review the approver is neither the reviewer nor the author.
      if (
        rulesOf(view).approverMustBeIndependent &&
        (sameActor(view.reviewCompleted.actor, record.actor) ||
          sameActor(view.submitter, record.actor))
      ) {
        return err('SELF_APPROVAL');
      }
      return ok({ ...next, state: 'APPROVED', approval: record });
    }
    case 'PUBLISHED':
      if (view.state !== 'APPROVED' || view.approval === null) return invalid();
      if (record.approvalRecordId !== view.approval.recordId) return err('UNKNOWN_REFERENCE');
      if (!sameDigest(view.approval.integrity, record.integrity)) return err('DIGEST_MISMATCH');
      return ok({ ...next, state: 'PUBLISHED', publication: record });
    case 'ACTIVATED':
      if (view.state !== 'PUBLISHED' || view.publication === null || view.approval === null) {
        return invalid();
      }
      if (view.activation !== null) return err('ALREADY_ACTIVATED');
      if (
        record.publicationRecordId !== view.publication.recordId ||
        record.approvalRecordId !== view.approval.recordId
      ) {
        return err('UNKNOWN_REFERENCE');
      }
      if (!sameDigest(view.publication.integrity, record.integrity)) return err('DIGEST_MISMATCH');
      return ok({ ...next, activation: record });
    case 'WITHDRAWN':
      if (view.state === 'DRAFT') return invalid();
      return ok({ ...next, state: 'WITHDRAWN' });
    case 'SUPERSEDED':
      if (view.state !== 'PUBLISHED') return invalid();
      return ok({ ...next, state: 'SUPERSEDED' });
    case 'POLICY_BOUND':
      // Only a legacy ledger, once, and never before a submission (terminal ledgers are refused
      // above). The lifecycle state and every earlier record stay exactly as they are.
      if (view.state === 'DRAFT') return invalid();
      if (view.policySource !== 'LEGACY_UNRECORDED') return err('POLICY_ALREADY_BOUND');
      return ok({ ...next, policy: record.governancePolicy, policySource: 'BOUND' });
  }
}

/** M5.2.1: the only records a legacy ledger without a recorded policy may still receive. */
const ALLOWED_WHILE_UNBOUND: ReadonlySet<GovernanceRecord['type']> = new Set([
  'POLICY_BOUND',
  'WITHDRAWN',
]);

/** Digest of a record's canonical form without its own `recordDigest`. */
export function recordDigestOf(
  record: Omit<GovernanceRecord, 'recordDigest'> | GovernanceRecord,
): string | null {
  const { recordDigest: _omit, ...rest } = record as GovernanceRecord;
  const digest = canonicalDigest(rest);
  return digest.ok ? digest.value : null;
}

/**
 * Replays a ledger (possibly loaded from untrusted storage): shape, identity, contiguous
 * sequence, record ids, hash chain, record digests, timestamps and every transition rule.
 * Fails closed on the first problem.
 */
export function replayLedger(raw: unknown): Result<GovernanceView, GovernanceIssue> {
  const replayed = replayInternal(raw);
  // The view is deeply frozen and made of validated copies: it cannot alias caller objects, and
  // changing the source afterwards cannot change it.
  return replayed.ok ? ok(deepFreeze(replayed.value.view)) : replayed;
}

/**
 * Replays and returns both the view and the validated, detached ledger copy, deeply frozen.
 * Internal to core (authorization reads record actors from the copy, never the caller's ledger).
 */
export function replayDetached(
  raw: unknown,
): Result<{ readonly view: GovernanceView; readonly ledger: GovernanceLedger }, GovernanceIssue> {
  const replayed = replayInternal(raw);
  return replayed.ok ? ok(deepFreeze(replayed.value)) : replayed;
}

/** Replays and also returns the validated, detached copy of the ledger. */
function replayInternal(
  raw: unknown,
): Result<{ readonly view: GovernanceView; readonly ledger: GovernanceLedger }, GovernanceIssue> {
  // Zod builds new objects for every record (validated copies); the caller's objects are never
  // used past this point.
  const parsed = governanceLedgerSchema.safeParse(raw);
  if (!parsed.success) return err({ code: 'LEDGER_MALFORMED', recordId: null });
  const ledger = parsed.data;
  let view = EMPTY_VIEW;
  for (const [index, record] of ledger.records.entries()) {
    const id = `${ledger.packId}@${ledger.version}#${String(index)}`;
    if (record.packId !== ledger.packId)
      return err({ code: 'PACK_MISMATCH', recordId: record.recordId });
    if (record.version !== ledger.version) {
      return err({ code: 'VERSION_MISMATCH', recordId: record.recordId });
    }
    if (
      record.sequence !== index ||
      record.recordId !== id ||
      record.previousRecordDigest !== view.lastDigest ||
      recordDigestOf(record) !== record.recordDigest
    ) {
      return err({ code: 'LEDGER_TAMPERED', recordId: record.recordId });
    }
    const applied = applyRecord(view, record);
    if (!applied.ok) return err({ code: applied.error, recordId: record.recordId });
    view = applied.value;
  }
  return ok({ view, ledger });
}

/** Fields a command supplies for a new record. */
export type RecordDraft = GovernanceRecord extends infer R
  ? R extends GovernanceRecord
    ? Omit<
        R,
        'sequence' | 'recordId' | 'packId' | 'version' | 'previousRecordDigest' | 'recordDigest'
      >
    : never
  : never;

/**
 * Appends a record: replays the existing ledger first (never trusting it), builds the record with
 * its chain and digest, applies the transition rules, and returns a NEW frozen ledger. The
 * original ledger is unchanged.
 */
export function append(
  ledger: GovernanceLedger,
  draft: RecordDraft,
): Result<
  { readonly ledger: GovernanceLedger; readonly record: GovernanceRecord },
  GovernanceIssue
> {
  const replayed = replayInternal(ledger);
  if (!replayed.ok) return replayed;
  // Work only on the validated copy of the ledger and a detached snapshot of the draft.
  const base = replayed.value.ledger;
  const copiedDraft = snapshot(draft);
  if (!copiedDraft.ok) return err({ code: 'LEDGER_MALFORMED', recordId: null });
  // Fail closed (M5.2.1): a legacy ledger never falls back to a policy for NEW records. Replay still
  // verifies its existing history under the rules it was written under.
  if (
    replayed.value.view.policySource === 'LEGACY_UNRECORDED' &&
    !ALLOWED_WHILE_UNBOUND.has((copiedDraft.value as RecordDraft).type)
  ) {
    return err({ code: 'POLICY_UNBOUND', recordId: null });
  }
  const sequence = base.records.length;
  const partial = {
    ...(copiedDraft.value as RecordDraft),
    sequence,
    recordId: `${base.packId}@${base.version}#${String(sequence)}`,
    packId: base.packId,
    version: base.version,
    previousRecordDigest: replayed.value.view.lastDigest,
  };
  const digest = recordDigestOf(partial);
  if (digest === null) return err({ code: 'LEDGER_MALFORMED', recordId: null });
  const record = deepFreeze({ ...partial, recordDigest: digest });
  const applied = applyRecord(replayed.value.view, record);
  if (!applied.ok) return err({ code: applied.error, recordId: null });
  return ok({
    ledger: deepFreeze({
      packId: base.packId,
      version: base.version,
      records: [...base.records, record],
    }),
    record,
  });
}
