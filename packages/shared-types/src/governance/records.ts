import type { ContentIntegrity } from '../calculation/integrity';

/**
 * Rule-pack governance (M4.4.3). docs/research/RULE_PACK_STRUCTURE.md §5.9.
 *
 * Governance is an append-only, hash-chained ledger of records per pack version
 * (`packId@version`). The lifecycle state is DERIVED by replaying the ledger; it is never a
 * mutable field. Records bind to the exact content digest they concern.
 */

/**
 * A person as named in a governance record. Two kinds (ARCHITECTURE decision D3, M4.6.4a):
 *
 * - `STAFF_PRINCIPAL`: written by the governance API since M4.6.4a. `subject` is the staff
 *   principal id of the authenticated session that made the request, taken by the server from the
 *   session (never from a request). Records with this actor are the current record version.
 * - `UNVERIFIED_REFERENCE`: records written before M4.6.4a (domain tests, the initial policy
 *   configuration). A domain reference only; it proves nothing about who acted. Such records stay
 *   readable and are never rewritten or re-hashed.
 *
 * Both kinds identify the person by `subject`, so separation-of-duties rules compare subjects
 * across kinds (a legacy reference and a staff principal with the same id are the same person).
 */
export type GovernanceActorRef =
  | {
      readonly kind: 'STAFF_PRINCIPAL';
      /** The staff principal id (from the authenticated session). */
      readonly subject: string;
    }
  | {
      readonly kind: 'UNVERIFIED_REFERENCE';
      /** Stable identifier (letters, digits, `.`, `_`, `:` or `-`; 1–100 characters). */
      readonly subject: string;
    };

export type GovernanceActorKind = GovernanceActorRef['kind'];

/** Pointer to review evidence (e.g. `docs/research/reviews/<marja>/<pack>.REVIEW.md#...`). */
export interface ReviewEvidenceRef {
  readonly reference: string;
}

/** Lifecycle states of one pack version. */
export type GovernanceState =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'SUPERSEDED'
  | 'WITHDRAWN';

export type WithdrawalReason = 'ERROR_FOUND' | 'SOURCE_INVALIDATED' | 'REVIEW_ABANDONED' | 'OTHER';

interface RecordBase<T extends string> {
  readonly type: T;
  /** Position in the ledger, starting at 0, contiguous. */
  readonly sequence: number;
  /** `${packId}@${version}#${sequence}`; stable reference for other records and activations. */
  readonly recordId: string;
  readonly packId: string;
  /** The pack version this record concerns (every record carries it). */
  readonly version: string;
  /** ISO 8601 UTC timestamp with milliseconds (`YYYY-MM-DDTHH:mm:ss.sssZ`), non-decreasing. */
  readonly recordedAt: string;
  readonly actor: GovernanceActorRef;
  /** `recordDigest` of the previous record, or null for the first (hash chain). */
  readonly previousRecordDigest: string | null;
  /** SHA-256 of this record's canonical form without `recordDigest` (64 lowercase hex). */
  readonly recordDigest: string;
}

/**
 * Versioned governance policy that a pack version's whole lifecycle runs under. It is chosen by
 * the server (per Marja) at the first submission, written into that SUBMITTED record and never
 * changes for that pack version. Rules per policy: `@khums/core` `GOVERNANCE_POLICIES`.
 * - `INDEPENDENT_REVIEW_V1`: separate scholar reviewer and independent approver.
 * - `SINGLE_SCHOLAR_V1`: one governing scholar may author, review, approve and publish.
 * - `SOURCE_VERIFIED_AUTO_V1` (decision 67): rule-builder packs only. The ledger is run
 *   automatically when the authorized scholar (or a SUPER_ADMIN) records a source verification;
 *   that verification is the review and the approval (decision 63). Never assignable to a Marja
 *   in the policy registry and never bound to hand-submitted packs.
 */
export type GovernancePolicyId =
  'INDEPENDENT_REVIEW_V1' | 'SINGLE_SCHOLAR_V1' | 'SOURCE_VERIFIED_AUTO_V1';

/** Content submitted for review (the author's submission). */
export interface SubmissionRecord extends RecordBase<'SUBMITTED'> {
  readonly integrity: ContentIntegrity;
  /**
   * The governance policy for this pack version. Absent only in records written before policies
   * existed (M4.4.3–M4.6.2). Those records are never rewritten: replay verifies them under
   * `INDEPENDENT_REVIEW_V1`, the rules they were written under, but since M5.2.1 such a ledger
   * accepts no new record except a withdrawal or a `POLICY_BOUND` record (fail closed).
   */
  readonly governancePolicy?: GovernancePolicyId;
}

/** A reviewer takes the submitted content into review. */
export interface ReviewStartedRecord extends RecordBase<'REVIEW_STARTED'> {
  readonly integrity: ContentIntegrity;
}

/** The reviewer returns the content to the author. A new submission needs changed content. */
export interface ChangesRequestedRecord extends RecordBase<'CHANGES_REQUESTED'> {
  readonly integrity: ContentIntegrity;
  readonly evidence: ReviewEvidenceRef;
}

/** The reviewer completes the review of this exact content and recommends approval. */
export interface ReviewCompletedRecord extends RecordBase<'REVIEW_COMPLETED'> {
  readonly integrity: ContentIntegrity;
  readonly evidence: ReviewEvidenceRef;
}

/** A separate approver approves exactly the reviewed content. */
export interface ApprovalRecordEntry extends RecordBase<'APPROVED'> {
  readonly integrity: ContentIntegrity;
  /** The REVIEW_COMPLETED record this approval relies on. */
  readonly reviewRecordId: string;
  readonly evidence: ReviewEvidenceRef;
}

/** The approved content is published (no content change; `status` only). */
export interface PublicationRecord extends RecordBase<'PUBLISHED'> {
  readonly integrity: ContentIntegrity;
  readonly approvalRecordId: string;
}

/** The pack version is withdrawn (terminal). */
export interface WithdrawalRecord extends RecordBase<'WITHDRAWN'> {
  readonly reason: WithdrawalReason;
}

/** A newer published version replaces this one (terminal). */
export interface SupersessionRecord extends RecordBase<'SUPERSEDED'> {
  readonly successor: { readonly packId: string; readonly version: string };
  /** The successor's publication record. */
  readonly successorPublicationRecordId: string;
}

/**
 * M5.2.1: explicitly binds a LEGACY pack version (whose SUBMITTED records name no policy) to a
 * governance policy, appended to the ledger (history is never rewritten). The policy is the
 * Marja's current policy from the dual-controlled registry, resolved by the server. Allowed once,
 * only on a legacy ledger that is not terminal.
 */
export interface PolicyBindingRecord extends RecordBase<'POLICY_BOUND'> {
  readonly governancePolicy: GovernancePolicyId;
}

/** The published content is activated for production (never automatic). */
export interface ActivationRecordEntry extends RecordBase<'ACTIVATED'> {
  readonly integrity: ContentIntegrity;
  readonly publicationRecordId: string;
  readonly approvalRecordId: string;
}

export type GovernanceRecord =
  | SubmissionRecord
  | ReviewStartedRecord
  | ChangesRequestedRecord
  | ReviewCompletedRecord
  | ApprovalRecordEntry
  | PublicationRecord
  | WithdrawalRecord
  | SupersessionRecord
  | ActivationRecordEntry
  | PolicyBindingRecord;

export type GovernanceRecordType = GovernanceRecord['type'];

/** Append-only ledger of one pack version. Records are immutable once created. */
export interface GovernanceLedger {
  readonly packId: string;
  readonly version: string;
  readonly records: readonly GovernanceRecord[];
}

/**
 * Kind of a policy registry record:
 * - `INITIAL_CONFIGURATION`: a first assignment from version-controlled configuration;
 * - `CHANGE_PROPOSED`: one administrator proposes a change (does not change the policy);
 * - `CHANGE_CONFIRMED`: a DIFFERENT administrator confirms the proposal immediately preceding it,
 *   binding its exact Marja, previous and new policy, reason and request; this applies the change.
 */
export type GovernancePolicyRecordKind =
  'INITIAL_CONFIGURATION' | 'CHANGE_PROPOSED' | 'CHANGE_CONFIRMED';

/**
 * One entry of the per-Marja governance policy registry (single-scholar stage 4). The registry
 * is append-only and hash-chained like a pack ledger: every assignment, proposal and confirmation
 * is a new record; nothing is updated or deleted. A change affects only pack versions submitted
 * afterwards: a pack version keeps the policy written into its first SUBMITTED record.
 */
export interface GovernancePolicyAssignmentRecord {
  readonly kind: GovernancePolicyRecordKind;
  /** Position in the registry, starting at 0, contiguous. */
  readonly sequence: number;
  /** `policy#${sequence}`. */
  readonly recordId: string;
  readonly marjaId: string;
  /** The Marja's policy before this record (null for its first assignment). */
  readonly previousPolicy: GovernancePolicyId | null;
  readonly newPolicy: GovernancePolicyId;
  /** The administrator (server-verified principal id) or the initial-configuration actor. */
  readonly actor: GovernanceActorRef;
  /** Server time, ISO 8601 UTC with milliseconds; non-decreasing. */
  readonly recordedAt: string;
  /** Why the policy was set or changed (required, free text, no personal data). */
  readonly reason: string;
  /** Request correlation id (`x-request-id`). */
  readonly requestId: string;
  /** Authorization decision id; null only for the initial configuration. */
  readonly decisionId: string | null;
  /** CHANGE_CONFIRMED only: the exact proposal record confirmed (null otherwise). */
  readonly proposal: {
    readonly recordId: string;
    readonly recordDigest: string;
    readonly requestId: string;
  } | null;
  readonly previousRecordDigest: string | null;
  readonly recordDigest: string;
}

/** The single source of each Marja's active governance policy (per-Marja, append-only). */
export interface GovernancePolicyRegistry {
  readonly records: readonly GovernancePolicyAssignmentRecord[];
}
