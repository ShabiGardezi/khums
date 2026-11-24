import type { GovernancePolicyId, GovernanceRole } from '@khums/shared-types';

/**
 * Versioned governance policies (owner decision 2026-11-21; docs/AUTH_ARCHITECTURE.md §5.7).
 *
 * A policy is chosen by the server per Marja and bound to a pack version at its first
 * submission (the SUBMITTED record names it). Every later record of that pack version, the
 * authorization separation rules and the approvals required for publication follow that bound
 * policy. Changing a Marja's policy affects only pack versions submitted afterwards.
 *
 * Policies are security and process configuration, not religious rulings. Both keep: immutable
 * published versions, content-digest binding, review evidence, source and eligibility gates, the
 * append-only hash-chained ledger, and every non-approval production readiness requirement.
 */

export interface GovernancePolicy {
  readonly id: GovernancePolicyId;
  /**
   * The only roles the relaxed rules below apply to (empty: no relaxation). Anyone else acting on
   * a pack version under this policy is held to the strict `INDEPENDENT_REVIEW_V1` rules, and the
   * role's own scope must cover that pack's Marja (enforced by the authorization evaluator).
   * Policies are bound to ledgers by id only, so this list is not hashed anywhere; decision 64
   * added `SCHOLAR` next to the legacy `GOVERNING_SCHOLAR` without changing any ledger.
   */
  readonly relaxedForRoles: readonly GovernanceRole[];
  /** The reviewer may not be an author of the submission (domain `SELF_REVIEW`). */
  readonly reviewerMustDifferFromAuthor: boolean;
  /** The approver may be neither the reviewer nor the author (domain `SELF_APPROVAL`). */
  readonly approverMustBeIndependent: boolean;
  /** Every submitter of a pack version counts as an author of it (authorization policy 1). */
  readonly historicalAuthorship: boolean;
  /** The activator differs from authors, reviewer and approver (authorization policy 2). */
  readonly independentActivation: boolean;
}

const policy = (value: GovernancePolicy): GovernancePolicy => Object.freeze(value);

export const GOVERNANCE_POLICIES: Readonly<Record<GovernancePolicyId, GovernancePolicy>> =
  Object.freeze({
    INDEPENDENT_REVIEW_V1: policy({
      id: 'INDEPENDENT_REVIEW_V1',
      relaxedForRoles: Object.freeze([]),
      reviewerMustDifferFromAuthor: true,
      approverMustBeIndependent: true,
      historicalAuthorship: true,
      independentActivation: true,
    }),
    SINGLE_SCHOLAR_V1: policy({
      id: 'SINGLE_SCHOLAR_V1',
      relaxedForRoles: Object.freeze(['SCHOLAR', 'GOVERNING_SCHOLAR'] as const),
      reviewerMustDifferFromAuthor: false,
      approverMustBeIndependent: false,
      historicalAuthorship: false,
      independentActivation: false,
    }),
    /**
     * Rule-builder packs only (decision 67). The ledger is run automatically, in one unit of work,
     * when the authorized scholar of the Marja (or a SUPER_ADMIN) records a source verification
     * (decision 63: source verification is the approval; no separate approval step). The verifier
     * is the actor of every record. Bound only through `executeGovernanceCommand` with a source
     * verification of the submitted pack (`BUILDER_GOVERNANCE_POLICIES`), never assignable in the
     * registry. Every technical check stays: integrity, digest binding, rule status, sources,
     * readiness, publication and activation.
     */
    SOURCE_VERIFIED_AUTO_V1: policy({
      id: 'SOURCE_VERIFIED_AUTO_V1',
      relaxedForRoles: Object.freeze(['SCHOLAR', 'GOVERNING_SCHOLAR', 'SUPER_ADMIN'] as const),
      reviewerMustDifferFromAuthor: false,
      approverMustBeIndependent: false,
      historicalAuthorship: false,
      independentActivation: false,
    }),
  });

/**
 * Version-controlled governance policy of each Marja's rule-builder pack (`<marja>-builder`,
 * decision 67). Separate from the dual-controlled per-Marja registry, which governs hand-submitted
 * packs and is never changed by this: each builder ledger binds its policy in its own SUBMITTED
 * record, so history is fixed per version. A Marja missing here cannot publish builder packs
 * (fail closed). Changing it is a code change with review.
 */
export const BUILDER_GOVERNANCE_POLICIES: Readonly<Record<string, GovernancePolicyId>> =
  Object.freeze({
    sistani: 'SOURCE_VERIFIED_AUTO_V1',
    khamenei: 'SOURCE_VERIFIED_AUTO_V1',
  });

/** Policies the per-Marja registry may assign (never the rule-builder policy). */
export const isRegistryAssignablePolicy = (value: unknown): value is GovernancePolicyId =>
  isGovernancePolicyId(value) && value !== 'SOURCE_VERIFIED_AUTO_V1';

/**
 * The policy of ledgers written before policies existed (their SUBMITTED records name none).
 * They keep exactly the rules they were created under; they are never migrated or rewritten.
 */
export const LEGACY_GOVERNANCE_POLICY: GovernancePolicyId = 'INDEPENDENT_REVIEW_V1';

/** The strict rules: what everyone is held to unless a policy relaxes them for their role. */
export const STRICT_GOVERNANCE_POLICY: GovernancePolicyId = 'INDEPENDENT_REVIEW_V1';

export const isGovernancePolicyId = (value: unknown): value is GovernancePolicyId =>
  typeof value === 'string' && Object.hasOwn(GOVERNANCE_POLICIES, value);
