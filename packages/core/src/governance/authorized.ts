import { computeRulePackIntegrity } from '@khums/calculation-engine';
import type {
  AuthorizationDecision,
  GovernanceActorRef,
  GovernanceLedger,
  GovernancePermission,
  GovernancePolicyId,
  GovernanceRecord,
  ReviewEvidenceRef,
  RulePack,
  RulePackActivation,
  WithdrawalReason,
} from '@khums/shared-types';
import {
  governanceLedgerSchema,
  rulePackSchema,
  ruleVerificationRecordSchema,
} from '@khums/validation';

import { authorize } from '../authorization/evaluate';
import { isTrustedPrincipal } from '../authorization/principal';
import {
  activate,
  approve,
  bindLegacyPolicy,
  completeReview,
  emergencyWithdraw,
  publish,
  requestChanges,
  startReview,
  submit,
  supersede,
  withdraw,
} from './commands';
import { replayDetached, type GovernanceIssue } from './ledger';
import { BUILDER_GOVERNANCE_POLICIES } from './policy';
import { activeGovernancePolicy } from './policy-registry';

/**
 * The ONLY public entry point for governance state changes (M4.6.1).
 *
 * The raw domain commands are no longer exported from `@khums/core`; future NestJS controllers
 * and guards call this function, which:
 *  1. detaches the pack and ledger (validated copies; caller objects are not used afterwards);
 *  2. derives the resource (pack id, version, Marja, recomputed digest) from that content, never
 *     from a caller-supplied resource;
 *  3. runs the centralized evaluator for the command's permission;
 *  4. only if allowed, runs the domain command with the actor taken from the principal and the
 *     time taken from the server context.
 *
 * The domain then applies its own lifecycle, separation and integrity rules (authoritative).
 */

export type GovernanceCommandRequest =
  | { readonly type: 'SUBMIT'; readonly pack: RulePack }
  | { readonly type: 'START_REVIEW'; readonly pack: RulePack }
  | {
      readonly type: 'REQUEST_CHANGES';
      readonly pack: RulePack;
      readonly evidence: ReviewEvidenceRef;
    }
  | {
      readonly type: 'COMPLETE_REVIEW';
      readonly pack: RulePack;
      readonly evidence: ReviewEvidenceRef;
    }
  | { readonly type: 'APPROVE'; readonly pack: RulePack; readonly evidence: ReviewEvidenceRef }
  | { readonly type: 'PUBLISH'; readonly pack: RulePack }
  | { readonly type: 'ACTIVATE'; readonly pack: RulePack }
  /** `pack` must be the latest submitted content (it proves the Marja for the scope check). */
  | { readonly type: 'WITHDRAW'; readonly pack: RulePack; readonly reason: WithdrawalReason }
  /** `pack` must be this version's published content. */
  | { readonly type: 'SUPERSEDE'; readonly pack: RulePack; readonly successor: GovernanceLedger }
  /**
   * M5.2.1: administrative emergency withdrawal of a PUBLISHED version. `pack` must be the
   * published content; `note` is the required reason (3–500 characters, no personal data).
   */
  | {
      readonly type: 'EMERGENCY_WITHDRAW';
      readonly pack: RulePack;
      readonly reason: WithdrawalReason;
      readonly note: string;
    }
  /**
   * M5.2.1: bind a legacy version (no recorded policy) to its Marja's current registry policy.
   * `pack` must be the latest submitted content. The policy is never taken from the caller.
   */
  | { readonly type: 'BIND_POLICY'; readonly pack: RulePack };

export type GovernanceCommandType = GovernanceCommandRequest['type'];

/** Each command's permission (exhaustive by type). */
export const GOVERNANCE_COMMAND_PERMISSIONS: Readonly<
  Record<GovernanceCommandType, GovernancePermission>
> = Object.freeze({
  SUBMIT: 'governance.submit',
  START_REVIEW: 'governance.review.start',
  REQUEST_CHANGES: 'governance.review.requestChanges',
  COMPLETE_REVIEW: 'governance.review.complete',
  APPROVE: 'governance.approve',
  PUBLISH: 'governance.publish',
  ACTIVATE: 'governance.activate',
  WITHDRAW: 'governance.withdraw',
  SUPERSEDE: 'governance.supersede',
  EMERGENCY_WITHDRAW: 'governance.withdraw.emergency',
  BIND_POLICY: 'governance.policy.bindLegacy',
});

/** M5.2.1: an emergency withdrawal's reason text: required, trimmed, 3–500 characters. */
export const isEmergencyNote = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length >= 3 &&
  value.length <= 500 &&
  value === value.trim();

export interface AuthorizedGovernanceInput {
  /** A principal returned by `establishPrincipal`. */
  readonly principal: unknown;
  readonly ledger: unknown;
  readonly command: unknown;
  /** Server-side facts: decision id, server time, session record. The ledger is added here. */
  readonly context: {
    readonly decisionId: unknown;
    readonly evaluatedAt: unknown;
    readonly session: unknown;
    /**
     * The server's per-Marja governance policy registry (from its own store; never from the
     * client). Read only for the FIRST submission of a pack version, where the policy of the
     * pack's Marja is bound to it; versions that already have a policy keep it.
     */
    readonly policyRegistry: unknown;
    /**
     * Decision 67, SUBMIT of a rule-builder pack only: the stored source verification (by this
     * principal, of a rule the pack approves) that triggers the automatic publication. Set only by
     * the server's verification use case; a builder pack submitted without one is refused.
     */
    readonly sourceVerification?: unknown;
  };
}

/** Pack ids ending in `-builder` are reserved for rule-builder packs (decision 67). */
export const isReservedBuilderPackId = (packId: string): boolean => packId.endsWith('-builder');

/**
 * Decision 67: a rule-builder pack is submitted only with a source verification recorded by the
 * submitting principal for that Marja, of a rule the pack approves, and gets the builder policy.
 */
function builderSubmissionPolicy(
  pack: RulePack,
  principalId: string,
  rawVerification: unknown,
): GovernancePolicyId | 'BUILDER_VERIFICATION_REQUIRED' | 'POLICY_NOT_CONFIGURED' {
  const { packId, marjaId } = pack.metadata;
  const verification = ruleVerificationRecordSchema.safeParse(rawVerification);
  if (
    packId !== `${marjaId}-builder` ||
    pack.metadata.releaseChannel !== 'PRODUCTION' ||
    !verification.success ||
    verification.data.marjaId !== marjaId ||
    verification.data.actor !== principalId ||
    !pack.rules.some(
      (r) => r.id === `builder:${verification.data.ruleId}` && r.status === 'APPROVED',
    )
  ) {
    return 'BUILDER_VERIFICATION_REQUIRED';
  }
  const policy = Object.hasOwn(BUILDER_GOVERNANCE_POLICIES, marjaId)
    ? BUILDER_GOVERNANCE_POLICIES[marjaId]
    : undefined;
  return policy ?? 'POLICY_NOT_CONFIGURED';
}

export type AuthorizedGovernanceOutcome =
  /** Authorization refused; nothing was attempted. */
  | { readonly status: 'DENIED'; readonly decision: AuthorizationDecision }
  /** Authorized, but the governance domain refused the transition. */
  | {
      readonly status: 'REFUSED';
      readonly decision: AuthorizationDecision;
      readonly issues: readonly GovernanceIssue[];
    }
  /** Authorized and applied: a new ledger with one new record. */
  | {
      readonly status: 'APPLIED';
      readonly decision: AuthorizationDecision;
      readonly ledger: GovernanceLedger;
      readonly record: GovernanceRecord;
      /** PUBLISH only: the published pack. */
      readonly pack: RulePack | null;
      /** ACTIVATE only: the activation record. */
      readonly activation: RulePackActivation | null;
    };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const invalid = (permission: GovernancePermission | null): AuthorizedGovernanceOutcome =>
  Object.freeze({
    status: 'DENIED',
    decision: Object.freeze({
      allowed: false,
      decisionId: null,
      permission,
      reason: 'INVALID_REQUEST',
      evaluatedAt: null,
    }),
  });

function run(input: AuthorizedGovernanceInput): AuthorizedGovernanceOutcome {
  const command = input.command;
  if (!isRecord(command) || typeof command.type !== 'string') return invalid(null);
  const type = command.type;
  if (!Object.hasOwn(GOVERNANCE_COMMAND_PERMISSIONS, type)) return invalid(null);
  const permission = GOVERNANCE_COMMAND_PERMISSIONS[type as GovernanceCommandType];

  // Validated, detached copies: each caller value is read once, here.
  const parsedPack = rulePackSchema.safeParse(command.pack);
  const parsedLedger = governanceLedgerSchema.safeParse(input.ledger);
  if (!parsedPack.success || !parsedLedger.success) return invalid(permission);
  const pack = parsedPack.data;
  const ledger = parsedLedger.data;
  const integrity = computeRulePackIntegrity(pack);
  if (!integrity.ok) return invalid(permission);

  // Commands without a content check in the domain (withdraw, supersede) must present the content
  // the ledger already bound, so the Marja used for the scope check is the real one.
  if (
    type === 'WITHDRAW' ||
    type === 'SUPERSEDE' ||
    type === 'EMERGENCY_WITHDRAW' ||
    type === 'BIND_POLICY'
  ) {
    const replayed = replayDetached(ledger);
    if (!replayed.ok) return invalid(permission);
    const { view } = replayed.value;
    const bound =
      type === 'WITHDRAW' || type === 'BIND_POLICY'
        ? view.submission?.integrity
        : type === 'EMERGENCY_WITHDRAW'
          ? // Before publication the submitted content proves the Marja; the domain then refuses
            // the withdrawal (only PUBLISHED versions may be withdrawn in an emergency).
            (view.publication ?? view.submission)?.integrity
          : view.publication?.integrity;
    if (
      pack.metadata.packId !== ledger.packId ||
      pack.metadata.version !== ledger.version ||
      bound?.digest !== integrity.value.digest
    ) {
      return invalid(permission);
    }
  }

  const decision = authorize({
    principal: input.principal,
    permission,
    resource: {
      type: 'RULE_PACK_VERSION',
      packId: ledger.packId,
      version: ledger.version,
      marjaId: pack.metadata.marjaId,
      contentDigest: integrity.value.digest,
    },
    context: {
      decisionId: input.context.decisionId,
      evaluatedAt: input.context.evaluatedAt,
      session: input.context.session,
      governance: { ledger },
    },
  });
  if (!decision.allowed || !isTrustedPrincipal(input.principal)) {
    return Object.freeze({ status: 'DENIED', decision });
  }

  if (type === 'EMERGENCY_WITHDRAW' && !isEmergencyNote(command.note)) return invalid(permission);

  // BIND_POLICY: the Marja's CURRENT policy from the verified, dual-controlled registry (never a
  // caller value); missing or invalid configuration refuses the binding (fail closed).
  let policyToBind: GovernancePolicyId | null = null;
  if (type === 'BIND_POLICY') {
    const resolved = activeGovernancePolicy(input.context.policyRegistry, pack.metadata.marjaId);
    if (!resolved.ok) {
      return Object.freeze({
        status: 'REFUSED',
        decision,
        issues: Object.freeze([{ code: resolved.error, recordId: null }]),
      });
    }
    policyToBind = resolved.value;
  }

  // SUBMIT: the bound policy for a resubmission, else the registry's policy for the pack's Marja
  // (resolved here from the verified registry, so a caller cannot pair a policy with the wrong
  // Marja). Missing or invalid configuration refuses the submission (fail closed).
  let policyForNewVersion: GovernancePolicyId = 'INDEPENDENT_REVIEW_V1';
  if (type === 'SUBMIT') {
    const replayed = replayDetached(ledger);
    if (!replayed.ok) return invalid(permission);
    const bound = replayed.value.view.policy;
    if (isReservedBuilderPackId(pack.metadata.packId)) {
      // Rule-builder packs never take a registry policy and are never submitted by hand.
      const builder = builderSubmissionPolicy(
        pack,
        input.principal.principalId,
        input.context.sourceVerification,
      );
      if (builder === 'BUILDER_VERIFICATION_REQUIRED' || builder === 'POLICY_NOT_CONFIGURED') {
        return Object.freeze({
          status: 'REFUSED',
          decision,
          issues: Object.freeze([{ code: builder, recordId: null }]),
        });
      }
      policyForNewVersion = bound ?? builder;
    } else if (bound !== null) {
      policyForNewVersion = bound;
    } else {
      const resolved = activeGovernancePolicy(input.context.policyRegistry, pack.metadata.marjaId);
      if (!resolved.ok) {
        return Object.freeze({
          status: 'REFUSED',
          decision,
          issues: Object.freeze([{ code: resolved.error, recordId: null }]),
        });
      }
      policyForNewVersion = resolved.value;
    }
  }

  // The actor is the server-established staff principal (D3: never a client value); the time is
  // the server's decision time.
  const ctx = {
    ledger,
    actor: Object.freeze({
      kind: 'STAFF_PRINCIPAL',
      subject: input.principal.principalId,
    }) satisfies GovernanceActorRef,
    at: decision.evaluatedAt,
  };
  const needsEvidence =
    type === 'REQUEST_CHANGES' || type === 'COMPLETE_REVIEW' || type === 'APPROVE';
  const rawEvidence = needsEvidence ? command.evidence : null;
  const reference = isRecord(rawEvidence) ? rawEvidence.reference : null;
  if (needsEvidence && typeof reference !== 'string') return invalid(permission);
  // Only used by the three review commands, where `reference` was just checked to be a string.
  const evidence: ReviewEvidenceRef = Object.freeze({
    reference: typeof reference === 'string' ? reference : '',
  });

  const result = (() => {
    switch (type as GovernanceCommandType) {
      case 'SUBMIT':
        return submit({ ...ctx, pack, policyForNewVersion: policyForNewVersion });
      case 'START_REVIEW':
        return startReview({ ...ctx, pack });
      case 'REQUEST_CHANGES':
        return requestChanges({ ...ctx, pack, evidence });
      case 'COMPLETE_REVIEW':
        return completeReview({ ...ctx, pack, evidence });
      case 'APPROVE':
        return approve({ ...ctx, pack, evidence });
      case 'PUBLISH':
        return publish({ ...ctx, pack });
      case 'ACTIVATE':
        return activate({ ...ctx, pack });
      case 'WITHDRAW':
        return withdraw({ ...ctx, reason: command.reason as WithdrawalReason });
      case 'SUPERSEDE':
        return supersede({ ...ctx, successor: command.successor as GovernanceLedger });
      case 'EMERGENCY_WITHDRAW':
        return emergencyWithdraw({ ...ctx, reason: command.reason as WithdrawalReason });
      case 'BIND_POLICY':
        return bindLegacyPolicy({ ...ctx, policy: policyToBind ?? ('' as GovernancePolicyId) });
    }
  })();

  if (!result.ok) return Object.freeze({ status: 'REFUSED', decision, issues: result.error });
  const value = result.value as typeof result.value & {
    readonly pack?: RulePack;
    readonly activation?: RulePackActivation;
  };
  return Object.freeze({
    status: 'APPLIED',
    decision,
    ledger: value.ledger,
    record: value.record,
    pack: value.pack ?? null,
    activation: value.activation ?? null,
  });
}

/**
 * Authorizes and, if allowed, executes one governance command. Never throws; fails closed.
 * Every outcome carries the authorization decision for the audit entry.
 */
export function executeGovernanceCommand(
  input: AuthorizedGovernanceInput,
): AuthorizedGovernanceOutcome {
  try {
    return run(input);
  } catch {
    return invalid(null);
  }
}
