import {
  checkActivationEligibility,
  checkApprovalEligibility,
  checkProductionReadiness,
  checkPublicationEligibility,
  computeRulePackIntegrity,
  type ReadinessRequest,
} from '@khums/calculation-engine';
import type {
  ApprovalRecord,
  ContentIntegrity,
  GovernanceActorRef,
  GovernanceLedger,
  GovernancePolicyId,
  GovernanceRecord,
  ReviewEvidenceRef,
  RulePack,
  RulePackActivation,
  WithdrawalReason,
} from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import { rulePackSchema } from '@khums/validation';

import {
  append,
  deepFreeze,
  replayLedger,
  type GovernanceIssue,
  type GovernanceIssueCode,
  type GovernanceView,
} from './ledger';
import { isGovernancePolicyId } from './policy';

/**
 * Governance commands (M4.4.3; RULE_PACK_STRUCTURE §5.9). Each command:
 * 1. replays the ledger (never trusting it),
 * 2. checks the pack identity and RECOMPUTES its content digest where content matters,
 * 3. runs the relevant engine eligibility gate,
 * 4. appends one immutable record through the shared transition rules,
 * and returns a new ledger. Nothing is persisted, and identities are unverified references (FR-2).
 */

export interface CommandContext {
  readonly ledger: GovernanceLedger;
  readonly actor: GovernanceActorRef;
  /** ISO 8601 UTC with milliseconds; supplied by the caller (core has no clock). */
  readonly at: string;
}

type CommandResult<T = object> = Result<
  { readonly ledger: GovernanceLedger; readonly record: GovernanceRecord } & T,
  readonly GovernanceIssue[]
>;

const fail = <T = object>(
  code: GovernanceIssueCode,
  recordId: string | null = null,
): CommandResult<T> => err([{ code, recordId }]);
const lift = <T>(result: Result<T, GovernanceIssue>): Result<T, readonly GovernanceIssue[]> =>
  result.ok ? result : err([result.error]);

/**
 * Detached, validated snapshot of a caller-supplied pack: the strict rule-pack schema builds new
 * objects for every nested value and reads each property once. Every governance check then runs
 * on this copy, so later changes to the caller's objects (or getters and proxies) cannot affect a
 * decision, and the caller's objects are never retained or frozen.
 */
function detachPack(pack: RulePack): Result<RulePack, readonly GovernanceIssue[]> {
  const parsed = rulePackSchema.safeParse(pack);
  return parsed.success ? ok(parsed.data) : err([{ code: 'PACK_MALFORMED', recordId: null }]);
}

/** Recomputes the pack's integrity and checks its identity against the ledger. */
function packCheck(
  ledger: GovernanceLedger,
  pack: RulePack,
): Result<ContentIntegrity, readonly GovernanceIssue[]> {
  if (pack.metadata.packId !== ledger.packId)
    return err([{ code: 'PACK_MISMATCH', recordId: null }]);
  if (pack.metadata.version !== ledger.version) {
    return err([{ code: 'VERSION_MISMATCH', recordId: null }]);
  }
  const computed = computeRulePackIntegrity(pack);
  if (!computed.ok) return err([{ code: 'PACK_NOT_CANONICALIZABLE', recordId: null }]);
  return ok(computed.value);
}

const notEligible = (codes: readonly { readonly code: GovernanceIssue['code'] }[]) =>
  err([
    { code: 'NOT_ELIGIBLE' as const, recordId: null },
    ...codes.map((i) => ({ code: i.code, recordId: null })),
  ]);

/** Replays, then checks the pack's recomputed digest against the digest a record bound. */
function current(
  ledger: GovernanceLedger,
  pack: RulePack,
  expected: (view: GovernanceView) => ContentIntegrity | null,
): Result<{ view: GovernanceView; integrity: ContentIntegrity }, readonly GovernanceIssue[]> {
  const view = lift(replayLedger(ledger));
  if (!view.ok) return view;
  const integrity = packCheck(ledger, pack);
  if (!integrity.ok) return integrity;
  const bound = expected(view.value);
  if (bound !== null && bound.digest !== integrity.value.digest) {
    return err([{ code: 'STALE_CONTENT', recordId: null }]);
  }
  return ok({ view: view.value, integrity: integrity.value });
}

/** Author submits sealed, verified, non-MOCK content for review. */
export function submit(
  ctx: CommandContext & {
    readonly pack: RulePack;
    /**
     * The server-configured policy for the pack's Marja. Bound only if this pack version has no
     * policy yet (its first submission); a resubmission always keeps the bound policy, so a
     * Marja's policy change affects only new pack versions.
     */
    readonly policyForNewVersion: GovernancePolicyId;
  },
): CommandResult {
  if (!isGovernancePolicyId(ctx.policyForNewVersion)) return fail('POLICY_INVALID');
  const detached = detachPack(ctx.pack);
  if (!detached.ok) return detached;
  const pack = detached.value;
  const integrity = packCheck(ctx.ledger, pack);
  if (!integrity.ok) return integrity;
  const replayed = replayLedger(ctx.ledger);
  if (!replayed.ok) return err([replayed.error]);
  const governancePolicy = replayed.value.policy ?? ctx.policyForNewVersion;
  const eligibility = checkApprovalEligibility(pack);
  if (eligibility.length > 0) return notEligible(eligibility);
  return lift(
    append(ctx.ledger, {
      type: 'SUBMITTED',
      recordedAt: ctx.at,
      actor: ctx.actor,
      integrity: integrity.value,
      governancePolicy,
    }),
  );
}

/** A reviewer (not the author) starts reviewing the exact submitted content. */
export function startReview(ctx: CommandContext & { readonly pack: RulePack }): CommandResult {
  const detached = detachPack(ctx.pack);
  if (!detached.ok) return detached;
  const pack = detached.value;
  const state = current(ctx.ledger, pack, (v) => v.submission?.integrity ?? null);
  if (!state.ok) return state;
  return lift(
    append(ctx.ledger, {
      type: 'REVIEW_STARTED',
      recordedAt: ctx.at,
      actor: ctx.actor,
      integrity: state.value.integrity,
    }),
  );
}

/** The reviewer returns the content to the author; a resubmission must change the content. */
export function requestChanges(
  ctx: CommandContext & { readonly pack: RulePack; readonly evidence: ReviewEvidenceRef },
): CommandResult {
  const detached = detachPack(ctx.pack);
  if (!detached.ok) return detached;
  const pack = detached.value;
  const state = current(ctx.ledger, pack, (v) => v.submission?.integrity ?? null);
  if (!state.ok) return state;
  return lift(
    append(ctx.ledger, {
      type: 'CHANGES_REQUESTED',
      recordedAt: ctx.at,
      actor: ctx.actor,
      integrity: state.value.integrity,
      evidence: ctx.evidence,
    }),
  );
}

/** The reviewer completes the review of this exact content. */
export function completeReview(
  ctx: CommandContext & { readonly pack: RulePack; readonly evidence: ReviewEvidenceRef },
): CommandResult {
  const detached = detachPack(ctx.pack);
  if (!detached.ok) return detached;
  const pack = detached.value;
  const state = current(ctx.ledger, pack, (v) => v.submission?.integrity ?? null);
  if (!state.ok) return state;
  return lift(
    append(ctx.ledger, {
      type: 'REVIEW_COMPLETED',
      recordedAt: ctx.at,
      actor: ctx.actor,
      integrity: state.value.integrity,
      evidence: ctx.evidence,
    }),
  );
}

/** A separate approver approves exactly the reviewed digest. */
export function approve(
  ctx: CommandContext & { readonly pack: RulePack; readonly evidence: ReviewEvidenceRef },
): CommandResult {
  const detached = detachPack(ctx.pack);
  if (!detached.ok) return detached;
  const pack = detached.value;
  const state = current(ctx.ledger, pack, (v) => v.reviewCompleted?.integrity ?? null);
  if (!state.ok) return state;
  const review = state.value.view.reviewCompleted;
  if (review === null) return fail('INVALID_TRANSITION');
  return lift(
    append(ctx.ledger, {
      type: 'APPROVED',
      recordedAt: ctx.at,
      actor: ctx.actor,
      integrity: state.value.integrity,
      reviewRecordId: review.recordId,
      evidence: ctx.evidence,
    }),
  );
}

/**
 * Reference to one exact ledger record: its id plus its record digest. Binding to the digest
 * means an approval or activation copied from another ledger (even for the same pack version,
 * people and content) never matches.
 */
export const recordReference = (record: GovernanceRecord): string =>
  `${record.recordId}/${record.recordDigest}`;

/**
 * The approval records a pack must carry for its CURRENT approved cycle, derived ONLY from the
 * verified ledger and the policy bound to that pack version (never from the caller):
 * - independent review (`INDEPENDENT_REVIEW_V1`, pre-policy ledgers, or a single-scholar ledger
 *   where different people reviewed and approved): the reviewer (`SCHOLAR_REVIEWER`) and the
 *   separate approver (`APPROVER`);
 * - one governing scholar who reviewed AND approved under `SINGLE_SCHOLAR_V1`: a single
 *   `GOVERNING_SCHOLAR` approval referencing the approval record;
 * - the source verifier of a rule-builder pack under `SOURCE_VERIFIED_AUTO_V1` (decision 67): a
 *   single `SOURCE_VERIFIER` approval referencing the approval record.
 * Every approval is bound to the approved digest and references its exact ledger record.
 */
export function approvalsFromLedger(
  ledger: GovernanceLedger,
): Result<readonly ApprovalRecord[], readonly GovernanceIssue[]> {
  const view = lift(replayLedger(ledger));
  if (!view.ok) return view;
  const { reviewCompleted, approval, policy, policySource } = view.value;
  // Fail closed (M5.2.1): approvals are never derived under an assumed policy.
  if (policySource === 'LEGACY_UNRECORDED')
    return err([{ code: 'POLICY_UNBOUND', recordId: null }]);
  if (reviewCompleted === null || approval === null) {
    return err([{ code: 'INVALID_TRANSITION', recordId: null }]);
  }
  if (
    (policy === 'SINGLE_SCHOLAR_V1' || policy === 'SOURCE_VERIFIED_AUTO_V1') &&
    reviewCompleted.actor.subject === approval.actor.subject
  ) {
    return ok(
      Object.freeze([
        Object.freeze({
          // Decision 67: under the rule-builder policy the one sign-off is the source verification.
          role:
            policy === 'SOURCE_VERIFIED_AUTO_V1'
              ? ('SOURCE_VERIFIER' as const)
              : ('GOVERNING_SCHOLAR' as const),
          reviewerId: approval.actor.subject,
          approvedAt: approval.recordedAt.slice(0, 10),
          reference: recordReference(approval),
          integrity: Object.freeze({ ...approval.integrity }),
        }),
      ]),
    );
  }
  // Fresh, frozen values: nothing aliases ledger records.
  const scholar: ApprovalRecord = Object.freeze({
    role: 'SCHOLAR_REVIEWER',
    reviewerId: reviewCompleted.actor.subject,
    approvedAt: reviewCompleted.recordedAt.slice(0, 10),
    reference: recordReference(reviewCompleted),
    integrity: Object.freeze({ ...reviewCompleted.integrity }),
  });
  const approver: ApprovalRecord = Object.freeze({
    role: 'APPROVER',
    reviewerId: approval.actor.subject,
    approvedAt: approval.recordedAt.slice(0, 10),
    reference: recordReference(approval),
    integrity: Object.freeze({ ...approval.integrity }),
  });
  return ok(Object.freeze([scholar, approver]));
}

/**
 * Returns the pack with the ledger's approvals and status APPROVED. Both fields are outside the
 * hashed content, so the content digest is unchanged (asserted).
 */
export function preparePackForPublication(
  pack: RulePack,
  ledger: GovernanceLedger,
): Result<RulePack, readonly GovernanceIssue[]> {
  const approvals = approvalsFromLedger(ledger);
  if (!approvals.ok) return approvals;
  return ok({
    ...pack,
    metadata: { ...pack.metadata, approvals: approvals.value, status: 'APPROVED' },
  });
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The pack's approvals must be exactly those of the ledger's approved cycle (no replays). */
function approvalsMatch(
  pack: RulePack,
  ledger: GovernanceLedger,
): Result<true, readonly GovernanceIssue[]> {
  const expected = approvalsFromLedger(ledger);
  if (!expected.ok) return expected;
  return sameJson(pack.metadata.approvals, expected.value)
    ? ok(true)
    : err([{ code: 'APPROVALS_INCONSISTENT', recordId: null }]);
}

/**
 * Publishes the approved content. Requires every publication gate (structure, recomputed
 * integrity, current bound approvals with separation, rule and source approvals, effective dates,
 * not MOCK). Returns the published pack: only `status` changes, and the digest is re-verified.
 */
export function publish(
  ctx: CommandContext & { readonly pack: RulePack },
): CommandResult<{ readonly pack: RulePack }> {
  const detached = detachPack(ctx.pack);
  if (!detached.ok) return detached;
  const pack = detached.value;
  const state = current(ctx.ledger, pack, (v) => v.approval?.integrity ?? null);
  if (!state.ok) return state;
  const approval = state.value.view.approval;
  if (approval === null || state.value.view.state !== 'APPROVED') return fail('INVALID_TRANSITION');
  if (pack.metadata.status !== 'APPROVED') return fail('STATUS_INCONSISTENT');
  const approvals = approvalsMatch(pack, ctx.ledger);
  if (!approvals.ok) return approvals;
  const eligibility = checkPublicationEligibility(pack);
  if (eligibility.length > 0) return notEligible(eligibility);
  const appended = lift(
    append(ctx.ledger, {
      type: 'PUBLISHED',
      recordedAt: ctx.at,
      actor: ctx.actor,
      integrity: state.value.integrity,
      approvalRecordId: approval.recordId,
    }),
  );
  if (!appended.ok) return appended;
  // The detached, validated snapshot with only `status` changed, deeply frozen. No caller-owned
  // object is retained or frozen.
  const published: RulePack = deepFreeze({
    ...pack,
    metadata: { ...pack.metadata, status: 'PUBLISHED' as const },
  });
  const after = computeRulePackIntegrity(published);
  if (!after.ok || after.value.digest !== state.value.integrity.digest) {
    return fail('CONTENT_CHANGED_AFTER_PUBLICATION');
  }
  return ok({ ...appended.value, pack: published });
}

/**
 * Activates the published content (explicit action; publication never activates). Returns the
 * activation record bound to the verified digest, the publication record and the approvals.
 */
export function activate(
  ctx: CommandContext & { readonly pack: RulePack },
): CommandResult<{ readonly activation: RulePackActivation }> {
  const detached = detachPack(ctx.pack);
  if (!detached.ok) return detached;
  const pack = detached.value;
  const state = current(ctx.ledger, pack, (v) => v.publication?.integrity ?? null);
  if (!state.ok) return state;
  const { publication, approval, reviewCompleted } = state.value.view;
  if (
    state.value.view.state !== 'PUBLISHED' ||
    publication === null ||
    approval === null ||
    reviewCompleted === null
  ) {
    return fail('INVALID_TRANSITION');
  }
  if (state.value.view.activation !== null) return fail('ALREADY_ACTIVATED');
  if (pack.metadata.status !== 'PUBLISHED') return fail('STATUS_INCONSISTENT');
  const approvals = approvalsMatch(pack, ctx.ledger);
  if (!approvals.ok) return approvals;
  const ledgerApprovals = approvalsFromLedger(ctx.ledger);
  if (!ledgerApprovals.ok) return ledgerApprovals;
  const eligibility = checkActivationEligibility(pack);
  if (eligibility.length > 0) return notEligible(eligibility);
  const appended = lift(
    append(ctx.ledger, {
      type: 'ACTIVATED',
      recordedAt: ctx.at,
      actor: ctx.actor,
      integrity: state.value.integrity,
      publicationRecordId: publication.recordId,
      approvalRecordId: approval.recordId,
    }),
  );
  if (!appended.ok) return appended;
  return ok({
    ...appended.value,
    // Built from the appended (frozen) record, not from caller input, and frozen.
    activation: Object.freeze({
      packId: appended.value.record.packId,
      version: appended.value.record.version,
      integrity: Object.freeze({ ...state.value.integrity }),
      activatedAt: appended.value.record.recordedAt.slice(0, 10),
      activatedBy: appended.value.record.actor.subject,
      // The references of the ledger-derived approvals, in order (two for independent review,
      // one for a single governing scholar).
      approvalReferences: Object.freeze(ledgerApprovals.value.map((a) => a.reference)),
      publicationReference: recordReference(publication),
    }),
  });
}

/** Withdraws the pack version (terminal). */
/**
 * Administrative emergency withdrawal (M5.2.1): only a PUBLISHED pack version. The required free
 * text reason is recorded in the audit event by the caller; the ledger records the reason code.
 */
export function emergencyWithdraw(
  ctx: CommandContext & { readonly reason: WithdrawalReason },
): CommandResult {
  const view = lift(replayLedger(ctx.ledger));
  if (!view.ok) return view;
  if (view.value.state !== 'PUBLISHED') return fail('INVALID_TRANSITION');
  return withdraw(ctx);
}

/**
 * Explicit policy binding of a legacy pack version (M5.2.1). `policy` is the Marja's current
 * policy resolved by the caller from the verified, dual-controlled registry (never a client
 * value). Appends one `POLICY_BOUND` record; earlier records are never rewritten.
 */
export function bindLegacyPolicy(
  ctx: CommandContext & { readonly policy: GovernancePolicyId },
): CommandResult {
  if (!isGovernancePolicyId(ctx.policy)) return fail('POLICY_INVALID');
  return lift(
    append(ctx.ledger, {
      type: 'POLICY_BOUND',
      recordedAt: ctx.at,
      actor: ctx.actor,
      governancePolicy: ctx.policy,
    }),
  );
}

export function withdraw(
  ctx: CommandContext & { readonly reason: WithdrawalReason },
): CommandResult {
  return lift(
    append(ctx.ledger, {
      type: 'WITHDRAWN',
      recordedAt: ctx.at,
      actor: ctx.actor,
      reason: ctx.reason,
    }),
  );
}

const semverParts = (v: string) => v.split('.').map(Number);
const newer = (a: string, b: string) => {
  const [x, y] = [semverParts(a), semverParts(b)];
  for (let i = 0; i < 3; i += 1) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
};

/** Marks this published version superseded by a NEWER published version of the same pack. */
export function supersede(
  ctx: CommandContext & { readonly successor: GovernanceLedger },
): CommandResult {
  const successorView = lift(replayLedger(ctx.successor));
  if (!successorView.ok) return successorView;
  const publication = successorView.value.publication;
  if (
    ctx.successor.packId !== ctx.ledger.packId ||
    !newer(ctx.successor.version, ctx.ledger.version) ||
    successorView.value.state !== 'PUBLISHED' ||
    publication === null
  ) {
    return fail('SUCCESSOR_INVALID');
  }
  return lift(
    append(ctx.ledger, {
      type: 'SUPERSEDED',
      recordedAt: ctx.at,
      actor: ctx.actor,
      successor: { packId: ctx.successor.packId, version: ctx.successor.version },
      successorPublicationRecordId: publication.recordId,
    }),
  );
}

/**
 * Production readiness under governance: the engine gate (recomputed integrity, bound approvals,
 * activation, rules, dates) PLUS the ledger. The ledger must replay cleanly and be PUBLISHED (not
 * withdrawn or superseded). Its activation record must match the activation exactly, the pack's
 * recomputed digest must equal the published digest, and the approvals must be the ledger's.
 */
export function checkGovernedProductionReadiness(
  rawPack: RulePack,
  ledger: GovernanceLedger,
  request: ReadinessRequest & { readonly activation: RulePackActivation },
): readonly GovernanceIssue[] {
  const detached = rulePackSchema.safeParse(rawPack);
  if (!detached.success) return [{ code: 'PACK_MALFORMED', recordId: null }];
  const pack = detached.data;
  const issues: GovernanceIssue[] = checkProductionReadiness(pack, request).map((i) => ({
    code: i.code,
    recordId: null,
  }));
  const view = replayLedger(ledger);
  if (!view.ok) return [...issues, view.error];
  const { state, publication, activation, approval, reviewCompleted, policySource } = view.value;
  // Fail closed (M5.2.1): a legacy ledger is never production-ready until explicitly bound.
  if (policySource === 'LEGACY_UNRECORDED') issues.push({ code: 'POLICY_UNBOUND', recordId: null });
  if (pack.metadata.packId !== ledger.packId)
    issues.push({ code: 'PACK_MISMATCH', recordId: null });
  if (pack.metadata.version !== ledger.version)
    issues.push({ code: 'VERSION_MISMATCH', recordId: null });
  if (state !== 'PUBLISHED' || publication === null) {
    issues.push({
      code:
        state === 'WITHDRAWN' || state === 'SUPERSEDED' ? 'LEDGER_TERMINAL' : 'INVALID_TRANSITION',
      recordId: null,
    });
    return issues;
  }
  const computed = computeRulePackIntegrity(pack);
  if (!computed.ok || computed.value.digest !== publication.integrity.digest) {
    issues.push({ code: 'CONTENT_CHANGED_AFTER_PUBLICATION', recordId: publication.recordId });
  }
  const approvals = approvalsMatch(pack, ledger);
  if (!approvals.ok) issues.push(...approvals.error);
  const a = request.activation;
  const expectedApprovals = approvalsFromLedger(ledger);
  const matchesLedger =
    activation !== null &&
    approval !== null &&
    reviewCompleted !== null &&
    expectedApprovals.ok &&
    a.publicationReference === recordReference(publication) &&
    activation.publicationRecordId === publication.recordId &&
    a.integrity.digest === activation.integrity.digest &&
    sameJson(
      a.approvalReferences,
      expectedApprovals.value.map((x) => x.reference),
    );
  if (!matchesLedger) issues.push({ code: 'UNKNOWN_REFERENCE', recordId: publication.recordId });
  return issues;
}
