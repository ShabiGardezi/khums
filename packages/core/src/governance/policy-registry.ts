import { canonicalDigest } from '@khums/calculation-engine';
import type {
  AuthorizationDecision,
  GovernanceActorRef,
  GovernancePolicyAssignmentRecord,
  GovernancePolicyId,
  GovernancePolicyRegistry,
} from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import { governancePolicyRegistrySchema } from '@khums/validation';

import { authorize } from '../authorization/evaluate';
import { isTrustedPrincipal } from '../authorization/principal';
import { deepFreeze, isValidActor, isValidTimestamp } from './ledger';
import { isRegistryAssignablePolicy } from './policy';

/**
 * Per-Marja governance policy registry (single-scholar stage 4; docs/AUTH_ARCHITECTURE.md §5.7).
 *
 * The ONE source of each Marja's active policy: an append-only, hash-chained list of records,
 * replayed and verified on every read (like a pack ledger). A change needs TWO administrators:
 * `proposeGovernancePolicyChange` records a proposal (the policy does not change), and
 * `confirmGovernancePolicyChange` by a different administrator records the confirmation, which
 * applies it. A confirmation binds the exact proposal immediately before it, so any intervening
 * registry record invalidates a pending proposal, and a confirmation cannot be replayed.
 *
 * The registry decides only which policy NEW pack versions get at their first submission; a pack
 * version keeps the policy in its own ledger forever, so a change never touches existing ledgers
 * or published packs. Changing a policy grants nobody religious permissions.
 */

export type PolicyRegistryIssueCode =
  /** Shape, sequence, ids, hash chain, digests, timestamps, links or dual control are wrong. */
  | 'POLICY_REGISTRY_INVALID'
  /** The Marja has no policy (fail closed: nothing new can be submitted for it). */
  | 'POLICY_NOT_CONFIGURED'
  /** The proposal would set the policy the Marja already has. */
  | 'POLICY_UNCHANGED'
  /** The reason, policy id or request id is missing or invalid. */
  | 'POLICY_CHANGE_INVALID'
  /** No pending proposal: none was made, or another record was appended after it. */
  | 'POLICY_PROPOSAL_NOT_PENDING'
  /** The confirmation does not match the pending proposal exactly (tampering or a stale view). */
  | 'POLICY_PROPOSAL_MISMATCH'
  /** The proposer tried to confirm their own proposal. */
  | 'POLICY_SELF_CONFIRMATION';

/** The actor of initial, version-controlled configuration records (no person, no decision). */
export const INITIAL_CONFIGURATION_ACTOR: GovernanceActorRef = Object.freeze({
  kind: 'UNVERIFIED_REFERENCE',
  subject: 'system:initial-configuration',
});

/** A proposal awaiting confirmation (it is the most recent registry record). */
export interface PendingPolicyProposal {
  readonly recordId: string;
  readonly recordDigest: string;
  readonly marjaId: string;
  readonly previousPolicy: GovernancePolicyId | null;
  readonly newPolicy: GovernancePolicyId;
  readonly reason: string;
  readonly requestId: string;
  readonly proposedBy: string;
}

export interface PolicyRegistryView {
  /** Active policy per Marja id. */
  readonly policies: Readonly<Record<string, GovernancePolicyId>>;
  readonly pending: PendingPolicyProposal | null;
  readonly lastRecordedAt: string | null;
  readonly lastDigest: string | null;
}

type RecordDraft = Omit<
  GovernancePolicyAssignmentRecord,
  'sequence' | 'recordId' | 'previousRecordDigest' | 'recordDigest'
>;

const recordDigestOf = (record: Omit<GovernancePolicyAssignmentRecord, 'recordDigest'>) => {
  const digest = canonicalDigest(record);
  return digest.ok ? digest.value : null;
};

const pendingOf = (record: GovernancePolicyAssignmentRecord): PendingPolicyProposal | null =>
  record.kind === 'CHANGE_PROPOSED' && record.newPolicy !== record.previousPolicy
    ? {
        recordId: record.recordId,
        recordDigest: record.recordDigest,
        marjaId: record.marjaId,
        previousPolicy: record.previousPolicy,
        newPolicy: record.newPolicy,
        reason: record.reason,
        requestId: record.requestId,
        proposedBy: record.actor.subject,
      }
    : null;

/** Kind-specific rules, checked on every read and every append. */
function recordIsValid(
  record: GovernancePolicyAssignmentRecord,
  current: GovernancePolicyId | null,
  previous: GovernancePolicyAssignmentRecord | null,
): boolean {
  if (record.previousPolicy !== current || record.newPolicy === record.previousPolicy) return false;
  const system = record.actor.subject === INITIAL_CONFIGURATION_ACTOR.subject;
  switch (record.kind) {
    case 'INITIAL_CONFIGURATION':
      return system && record.decisionId === null && record.proposal === null && current === null;
    case 'CHANGE_PROPOSED':
      return !system && record.decisionId !== null && record.proposal === null;
    case 'CHANGE_CONFIRMED': {
      const proposal = previous === null ? null : pendingOf(previous);
      return (
        !system &&
        record.decisionId !== null &&
        proposal !== null &&
        record.proposal !== null &&
        record.proposal.recordId === proposal.recordId &&
        record.proposal.recordDigest === proposal.recordDigest &&
        record.proposal.requestId === proposal.requestId &&
        record.marjaId === proposal.marjaId &&
        record.previousPolicy === proposal.previousPolicy &&
        record.newPolicy === proposal.newPolicy &&
        record.reason === proposal.reason &&
        // Dual control: the confirming administrator is not the proposer.
        record.actor.subject !== proposal.proposedBy
      );
    }
  }
}

function replayInternal(
  raw: unknown,
): Result<
  { view: PolicyRegistryView; registry: GovernancePolicyRegistry },
  PolicyRegistryIssueCode
> {
  const parsed = governancePolicyRegistrySchema.safeParse(raw);
  if (!parsed.success) return err('POLICY_REGISTRY_INVALID');
  const registry = parsed.data;
  const policies = new Map<string, GovernancePolicyId>();
  let lastRecordedAt: string | null = null;
  let lastDigest: string | null = null;
  let previous: GovernancePolicyAssignmentRecord | null = null;
  for (const [index, record] of registry.records.entries()) {
    const { recordDigest, ...rest } = record;
    if (
      record.sequence !== index ||
      record.recordId !== `policy#${String(index)}` ||
      record.previousRecordDigest !== lastDigest ||
      recordDigestOf(rest) !== recordDigest ||
      !isValidTimestamp(record.recordedAt) ||
      (lastRecordedAt !== null && record.recordedAt < lastRecordedAt) ||
      !isValidActor(record.actor) ||
      !recordIsValid(record, policies.get(record.marjaId) ?? null, previous)
    ) {
      return err('POLICY_REGISTRY_INVALID');
    }
    if (record.kind !== 'CHANGE_PROPOSED') policies.set(record.marjaId, record.newPolicy);
    lastRecordedAt = record.recordedAt;
    lastDigest = recordDigest;
    previous = record;
  }
  return ok({
    view: {
      policies: Object.fromEntries(policies),
      pending: previous === null ? null : pendingOf(previous),
      lastRecordedAt,
      lastDigest,
    },
    registry,
  });
}

/** Replays and verifies a registry (possibly from untrusted storage). Fails closed. */
export function replayPolicyRegistry(
  raw: unknown,
): Result<PolicyRegistryView, PolicyRegistryIssueCode> {
  const replayed = replayInternal(raw);
  return replayed.ok ? ok(deepFreeze(replayed.value.view)) : replayed;
}

/** The active policy for a Marja from a verified registry. Never a default. */
export function activeGovernancePolicy(
  raw: unknown,
  marjaId: string,
): Result<GovernancePolicyId, PolicyRegistryIssueCode> {
  const replayed = replayInternal(raw);
  if (!replayed.ok) return replayed;
  const policy = Object.hasOwn(replayed.value.view.policies, marjaId)
    ? replayed.value.view.policies[marjaId]
    : undefined;
  return policy === undefined ? err('POLICY_NOT_CONFIGURED') : ok(policy);
}

function appendRecord(
  base: GovernancePolicyRegistry,
  view: PolicyRegistryView,
  draft: RecordDraft,
): Result<GovernancePolicyRegistry, PolicyRegistryIssueCode> {
  const sequence = base.records.length;
  const partial = {
    ...draft,
    sequence,
    recordId: `policy#${String(sequence)}`,
    previousRecordDigest: view.lastDigest,
  };
  const digest = recordDigestOf(partial);
  if (digest === null) return err('POLICY_REGISTRY_INVALID');
  const next = deepFreeze({ records: [...base.records, { ...partial, recordDigest: digest }] });
  // Re-verify the result with the same rules used on read.
  return replayInternal(next).ok ? ok(next) : err('POLICY_REGISTRY_INVALID');
}

export const createPolicyRegistry = (): GovernancePolicyRegistry => deepFreeze({ records: [] });

/**
 * Builds a NEW registry from version-controlled initial configuration (server start-up only;
 * it cannot modify an existing registry). Each entry is a first assignment by
 * `system:initial-configuration`, with a reason and request id, and no authorization decision.
 */
export function initialPolicyRegistry(
  assignments: readonly { readonly marjaId: string; readonly policy: GovernancePolicyId }[],
  at: string,
  reason: string,
  requestId: string,
): Result<GovernancePolicyRegistry, PolicyRegistryIssueCode> {
  let registry = createPolicyRegistry();
  for (const { marjaId, policy } of assignments) {
    if (!isRegistryAssignablePolicy(policy)) return err('POLICY_CHANGE_INVALID');
    const replayed = replayInternal(registry);
    if (!replayed.ok) return replayed;
    const appended = appendRecord(registry, replayed.value.view, {
      kind: 'INITIAL_CONFIGURATION',
      marjaId,
      previousPolicy: null,
      newPolicy: policy,
      actor: INITIAL_CONFIGURATION_ACTOR,
      recordedAt: at,
      reason,
      requestId,
      decisionId: null,
      proposal: null,
    });
    if (!appended.ok) return appended;
    registry = appended.value;
  }
  return ok(registry);
}

/** Server-side facts only: decision id, server time, session record, request id. */
export interface PolicyDecisionContext {
  readonly decisionId: unknown;
  readonly evaluatedAt: unknown;
  readonly session: unknown;
  readonly requestId: unknown;
}

export interface PolicyProposalInput {
  /** Must be a principal returned by `establishPrincipal`. */
  readonly principal: unknown;
  readonly registry: unknown;
  readonly marjaId: unknown;
  readonly newPolicy: unknown;
  readonly reason: unknown;
  readonly context: PolicyDecisionContext;
}

export interface PolicyConfirmationInput {
  readonly principal: unknown;
  readonly registry: unknown;
  /**
   * What the confirming administrator was shown and agrees to. It must equal the pending
   * proposal exactly; it never supplies values of its own.
   */
  readonly expected: {
    readonly proposalRecordId: unknown;
    readonly marjaId: unknown;
    readonly previousPolicy: unknown;
    readonly newPolicy: unknown;
    readonly reason: unknown;
    readonly proposalRequestId: unknown;
  };
  readonly context: PolicyDecisionContext;
}

export type PolicyChangeOutcome =
  | { readonly status: 'DENIED'; readonly decision: AuthorizationDecision }
  | {
      readonly status: 'REFUSED';
      readonly decision: AuthorizationDecision;
      readonly issue: PolicyRegistryIssueCode;
    }
  | {
      readonly status: 'APPLIED';
      readonly decision: AuthorizationDecision;
      readonly registry: GovernancePolicyRegistry;
      readonly record: GovernancePolicyAssignmentRecord;
    };

/** Authorizes `governance.policy.change` on the Marja for the principal (active, in scope, MFA). */
function authorizeChange(
  principal: unknown,
  marjaId: string,
  context: PolicyDecisionContext,
): AuthorizationDecision {
  return authorize({
    principal,
    permission: 'governance.policy.change',
    resource: { type: 'GOVERNANCE_POLICY', marjaId },
    context: {
      decisionId: context.decisionId,
      evaluatedAt: context.evaluatedAt,
      session: context.session,
      governance: null,
    },
  });
}

const validRequestId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 200;

function finish(
  decision: AuthorizationDecision,
  appended: Result<GovernancePolicyRegistry, PolicyRegistryIssueCode>,
): PolicyChangeOutcome {
  if (!appended.ok) return Object.freeze({ status: 'REFUSED', decision, issue: appended.error });
  const record = appended.value.records.at(-1);
  if (record === undefined) {
    return Object.freeze({ status: 'REFUSED', decision, issue: 'POLICY_REGISTRY_INVALID' });
  }
  return Object.freeze({ status: 'APPLIED', decision, registry: appended.value, record });
}

/**
 * Step 1 of 2: an authorized administrator proposes a policy change for one Marja. Records the
 * proposal (Marja, current and new policy, reason, request, actor, server time); the Marja's
 * policy does NOT change until another administrator confirms.
 */
export function proposeGovernancePolicyChange(input: PolicyProposalInput): PolicyChangeOutcome {
  const marjaId = typeof input.marjaId === 'string' ? input.marjaId : '';
  const decision = authorizeChange(input.principal, marjaId, input.context);
  if (!decision.allowed || !isTrustedPrincipal(input.principal)) {
    return Object.freeze({ status: 'DENIED', decision });
  }
  const refuse = (issue: PolicyRegistryIssueCode): PolicyChangeOutcome =>
    Object.freeze({ status: 'REFUSED', decision, issue });
  const { newPolicy, reason } = input;
  const requestId = input.context.requestId;
  if (
    // Never the rule-builder policy (decision 67): it is bound only by builder publication.
    !isRegistryAssignablePolicy(newPolicy) ||
    typeof reason !== 'string' ||
    reason.trim().length === 0 ||
    reason.length > 500 ||
    !validRequestId(requestId)
  ) {
    return refuse('POLICY_CHANGE_INVALID');
  }
  const replayed = replayInternal(input.registry);
  if (!replayed.ok) return refuse(replayed.error);
  const { view, registry } = replayed.value;
  const previousPolicy = Object.hasOwn(view.policies, marjaId)
    ? (view.policies[marjaId] ?? null)
    : null;
  if (previousPolicy === newPolicy) return refuse('POLICY_UNCHANGED');
  return finish(
    decision,
    appendRecord(registry, view, {
      kind: 'CHANGE_PROPOSED',
      marjaId,
      previousPolicy,
      newPolicy,
      actor: { kind: 'STAFF_PRINCIPAL', subject: input.principal.principalId },
      recordedAt: decision.evaluatedAt,
      reason: reason.trim(),
      requestId,
      decisionId: decision.decisionId,
      proposal: null,
    }),
  );
}

/**
 * Step 2 of 2: a DIFFERENT authorized administrator confirms the pending proposal, which must be
 * the most recent registry record and match `expected` exactly. Records the confirmation and
 * applies the change. A self-confirmation, a stale or tampered view, an intervening record or a
 * replayed confirmation is refused.
 */
export function confirmGovernancePolicyChange(input: PolicyConfirmationInput): PolicyChangeOutcome {
  const marjaId = typeof input.expected.marjaId === 'string' ? input.expected.marjaId : '';
  const decision = authorizeChange(input.principal, marjaId, input.context);
  if (!decision.allowed || !isTrustedPrincipal(input.principal)) {
    return Object.freeze({ status: 'DENIED', decision });
  }
  const refuse = (issue: PolicyRegistryIssueCode): PolicyChangeOutcome =>
    Object.freeze({ status: 'REFUSED', decision, issue });
  const requestId = input.context.requestId;
  if (!validRequestId(requestId)) return refuse('POLICY_CHANGE_INVALID');
  const replayed = replayInternal(input.registry);
  if (!replayed.ok) return refuse(replayed.error);
  const { view, registry } = replayed.value;
  const pending = view.pending;
  if (pending === null) return refuse('POLICY_PROPOSAL_NOT_PENDING');
  const { expected } = input;
  if (
    expected.proposalRecordId !== pending.recordId ||
    expected.marjaId !== pending.marjaId ||
    expected.previousPolicy !== pending.previousPolicy ||
    expected.newPolicy !== pending.newPolicy ||
    expected.reason !== pending.reason ||
    expected.proposalRequestId !== pending.requestId
  ) {
    return refuse('POLICY_PROPOSAL_MISMATCH');
  }
  if (pending.proposedBy === input.principal.principalId) return refuse('POLICY_SELF_CONFIRMATION');
  return finish(
    decision,
    appendRecord(registry, view, {
      kind: 'CHANGE_CONFIRMED',
      marjaId: pending.marjaId,
      previousPolicy: pending.previousPolicy,
      newPolicy: pending.newPolicy,
      actor: { kind: 'STAFF_PRINCIPAL', subject: input.principal.principalId },
      recordedAt: decision.evaluatedAt,
      reason: pending.reason,
      requestId,
      decisionId: decision.decisionId,
      proposal: {
        recordId: pending.recordId,
        recordDigest: pending.recordDigest,
        requestId: pending.requestId,
      },
    }),
  );
}
