import { z } from 'zod';

import { identifierSchema } from '../calculation/common';
import { GOVERNANCE_POLICY_IDS, REGISTRY_ASSIGNABLE_POLICY_IDS } from '../governance/records';

/**
 * Governance API contracts (M4.6.4a; docs/AUTH_ARCHITECTURE.md §5, ARCHITECTURE decisions D1–D3).
 *
 * Requests are strict: they never carry an actor, a time, a Marja for a command, a resource or a
 * policy. The server takes the actor from the authenticated session, the time from its clock, the
 * Marja and digest from the pack content it stored, and the policy from its registry. Only the
 * SUBMIT request carries pack content; every later command names the pack version and the ledger
 * length the caller saw (`expectedSequence`), and the server loads the content the ledger bound.
 */

const semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be MAJOR.MINOR.PATCH');
const digest = z.string();
/** The number of ledger records the caller saw (optimistic concurrency: a stale view is a 409). */
const expectedSequence = z.int().min(0).max(10_000);
const evidence = z.strictObject({
  /** Pointer to review evidence (e.g. `docs/research/reviews/<marja>/<pack>.REVIEW.md#...`). */
  reference: z
    .string()
    .min(1)
    .max(500)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/#@+-]*$/, 'Must be a plain path or reference'),
});

export const GOVERNANCE_STATES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'PUBLISHED',
  'SUPERSEDED',
  'WITHDRAWN',
] as const;

export const WITHDRAWAL_REASONS = [
  'ERROR_FOUND',
  'SOURCE_INVALIDATED',
  'REVIEW_ABANDONED',
  'OTHER',
] as const;

// ---- Path and query parameters ----

export const governancePackVersionParamsSchema = z
  .strictObject({ packId: identifierSchema, version: semver })
  .meta({ id: 'GovernancePackVersionParams', title: 'GovernancePackVersionParams' });

export const governancePackListQuerySchema = z
  .strictObject({ marjaId: identifierSchema.optional() })
  .meta({ id: 'GovernancePackListQuery', title: 'GovernancePackListQuery' });

export const auditEventListQuerySchema = z
  .strictObject({
    /** Return events with a sequence greater than this (cursor); omit for the first page. */
    afterSequence: z.coerce.number().int().min(-1).max(Number.MAX_SAFE_INTEGER).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .meta({ id: 'AuditEventListQuery', title: 'AuditEventListQuery' });

// ---- Command requests ----

/**
 * Submits sealed pack content for review (the only request that carries content). `pack` is a JSON
 * object here because the rule-pack schema is recursive; the server validates it with the strict
 * `rulePackSchema` (malformed content is a 422) and `@khums/core` re-validates it.
 */
export const submitGovernancePackRequestSchema = z
  .strictObject({ expectedSequence, pack: z.record(z.string(), z.unknown()) })
  .meta({ id: 'SubmitGovernancePackRequest', title: 'SubmitGovernancePackRequest' });

/** Start review, publish, activate: the server loads the content the ledger bound. */
export const governanceCommandRequestSchema = z
  .strictObject({ expectedSequence })
  .meta({ id: 'GovernanceCommandRequest', title: 'GovernanceCommandRequest' });

/** Request changes, complete review, approve: with a pointer to the review evidence. */
export const governanceEvidenceCommandRequestSchema = z
  .strictObject({ expectedSequence, evidence })
  .meta({ id: 'GovernanceEvidenceCommandRequest', title: 'GovernanceEvidenceCommandRequest' });

export const withdrawGovernancePackRequestSchema = z
  .strictObject({ expectedSequence, reason: z.enum(WITHDRAWAL_REASONS) })
  .meta({ id: 'WithdrawGovernancePackRequest', title: 'WithdrawGovernancePackRequest' });

const policyReason = z.string().trim().min(3).max(500);

/**
 * M5.2.1: administrative emergency withdrawal of a PUBLISHED version. `note` is the required
 * reason (3–500 characters, recorded in the audit log; no personal data).
 */
export const emergencyWithdrawGovernancePackRequestSchema = z
  .strictObject({ expectedSequence, reason: z.enum(WITHDRAWAL_REASONS), note: policyReason })
  .meta({
    id: 'EmergencyWithdrawGovernancePackRequest',
    title: 'EmergencyWithdrawGovernancePackRequest',
  });

/**
 * M5.2.1: binds a legacy version (no recorded policy) to its Marja's CURRENT registry policy. The
 * policy is never sent: the server reads it from the dual-controlled registry. `reason` is
 * recorded in the audit log.
 */
export const bindGovernancePolicyRequestSchema = z
  .strictObject({ expectedSequence, reason: policyReason })
  .meta({ id: 'BindGovernancePolicyRequest', title: 'BindGovernancePolicyRequest' });

/** Supersedes this published version by a newer published version of the same pack. */
export const supersedeGovernancePackRequestSchema = z
  .strictObject({ expectedSequence, successorVersion: semver })
  .meta({ id: 'SupersedeGovernancePackRequest', title: 'SupersedeGovernancePackRequest' });

export const proposeGovernancePolicyRequestSchema = z
  .strictObject({
    marjaId: identifierSchema,
    newPolicy: z.enum(REGISTRY_ASSIGNABLE_POLICY_IDS),
    reason: policyReason,
  })
  .meta({ id: 'ProposeGovernancePolicyRequest', title: 'ProposeGovernancePolicyRequest' });

/** Confirms exactly the pending proposal the second administrator was shown. */
export const confirmGovernancePolicyRequestSchema = z
  .strictObject({
    proposalRecordId: z.string().min(1).max(250),
    marjaId: identifierSchema,
    previousPolicy: z.enum(REGISTRY_ASSIGNABLE_POLICY_IDS).nullable(),
    newPolicy: z.enum(REGISTRY_ASSIGNABLE_POLICY_IDS),
    reason: policyReason,
    proposalRequestId: z.string().min(1).max(200),
  })
  .meta({ id: 'ConfirmGovernancePolicyRequest', title: 'ConfirmGovernancePolicyRequest' });

// ---- Responses (additive) ----

const actorSchema = z.object({
  kind: z.enum(['STAFF_PRINCIPAL', 'UNVERIFIED_REFERENCE']),
  subject: z.string(),
});

export const governanceRecordSummarySchema = z
  .object({
    sequence: z.int(),
    recordId: z.string(),
    type: z.string(),
    recordedAt: z.iso.datetime(),
    actor: actorSchema,
    recordDigest: digest,
    previousRecordDigest: digest.nullable(),
    /** The content digest this record binds (null for withdrawal and supersession). */
    contentDigest: digest.nullable(),
    evidenceReference: z.string().nullable(),
    withdrawalReason: z.enum(WITHDRAWAL_REASONS).nullable(),
    /** M5.2.1: the policy a `POLICY_BOUND` record binds (null for every other record). */
    boundPolicy: z.enum(GOVERNANCE_POLICY_IDS).nullable(),
  })
  .meta({ id: 'GovernanceRecordSummary', title: 'GovernanceRecordSummary' });

const packVersionFields = {
  packId: z.string(),
  version: z.string(),
  marjaId: z.string(),
  state: z.enum(GOVERNANCE_STATES),
  policy: z.enum(GOVERNANCE_POLICY_IDS).nullable(),
  /**
   * M5.2.1: `RECORDED` at submission, `BOUND` by an explicit binding, or `LEGACY_UNRECORDED` (no
   * new record is accepted except a binding or a withdrawal). Null before any submission.
   */
  policySource: z.enum(['RECORDED', 'LEGACY_UNRECORDED', 'BOUND']).nullable(),
  activated: z.boolean(),
  /** The content digest currently bound by the ledger. */
  contentDigest: digest.nullable(),
  /** Number of records: send it back as `expectedSequence` with the next command. */
  expectedSequence: z.int(),
  lastRecordedAt: z.iso.datetime().nullable(),
};

export const governancePackVersionSummarySchema = z
  .object(packVersionFields)
  .meta({ id: 'GovernancePackVersionSummary', title: 'GovernancePackVersionSummary' });

export const governancePackVersionSchema = z
  .object({ ...packVersionFields, records: z.array(governanceRecordSummarySchema) })
  .meta({ id: 'GovernancePackVersion', title: 'GovernancePackVersion' });

export const governancePackListResponseSchema = z
  .object({ packs: z.array(governancePackVersionSummarySchema) })
  .meta({ id: 'GovernancePackListResponse', title: 'GovernancePackListResponse' });

export const governancePolicyRegistryResponseSchema = z
  .object({
    /** Active policy per Marja (only Marjas the caller may administer). */
    policies: z.array(z.object({ marjaId: z.string(), policy: z.enum(GOVERNANCE_POLICY_IDS) })),
    /** The proposal awaiting a second administrator, when it is for a Marja in scope. */
    pending: z
      .object({
        proposalRecordId: z.string(),
        marjaId: z.string(),
        previousPolicy: z.enum(GOVERNANCE_POLICY_IDS).nullable(),
        newPolicy: z.enum(GOVERNANCE_POLICY_IDS),
        reason: z.string(),
        proposalRequestId: z.string(),
        proposedBy: z.string(),
      })
      .nullable(),
  })
  .meta({ id: 'GovernancePolicyRegistryResponse', title: 'GovernancePolicyRegistryResponse' });

export const governancePolicyChangeResponseSchema = z
  .object({
    recordId: z.string(),
    kind: z.enum(['CHANGE_PROPOSED', 'CHANGE_CONFIRMED']),
    marjaId: z.string(),
    previousPolicy: z.enum(GOVERNANCE_POLICY_IDS).nullable(),
    newPolicy: z.enum(GOVERNANCE_POLICY_IDS),
    requestId: z.string(),
    recordedAt: z.iso.datetime(),
  })
  .meta({ id: 'GovernancePolicyChangeResponse', title: 'GovernancePolicyChangeResponse' });

export const auditEventResponseSchema = z
  .object({
    sequence: z.int(),
    eventId: z.string(),
    type: z.string(),
    actor: z.string().nullable(),
    /** Decision 79: the actor's username (null for the system or an unknown account). */
    actorName: z.string().nullable(),
    targets: z.array(z.object({ kind: z.string(), id: z.string() })),
    marjaIds: z.array(z.string()),
    details: z.record(
      z.string(),
      z.union([z.string(), z.boolean(), z.null(), z.array(z.string())]),
    ),
    requestId: z.string().nullable(),
    occurredAt: z.iso.datetime(),
    previousDigest: z.string().nullable(),
    digest: z.string(),
  })
  .meta({ id: 'AuditEventResponse', title: 'AuditEventResponse' });

export const auditEventListResponseSchema = z
  .object({
    events: z.array(auditEventResponseSchema),
    /** Whether the whole audit chain verified (digests, links, sequence) when it was read. */
    chainVerified: z.boolean(),
    /** Pass as `afterSequence` for the next page; null when there are no more events. */
    nextAfterSequence: z.int().nullable(),
  })
  .meta({ id: 'AuditEventListResponse', title: 'AuditEventListResponse' });

export type GovernancePackVersionParams = z.infer<typeof governancePackVersionParamsSchema>;
export type SubmitGovernancePackRequest = z.infer<typeof submitGovernancePackRequestSchema>;
export type GovernanceCommandRequestBody = z.infer<typeof governanceCommandRequestSchema>;
export type GovernanceEvidenceCommandRequest = z.infer<
  typeof governanceEvidenceCommandRequestSchema
>;
export type WithdrawGovernancePackRequest = z.infer<typeof withdrawGovernancePackRequestSchema>;
export type EmergencyWithdrawGovernancePackRequest = z.infer<
  typeof emergencyWithdrawGovernancePackRequestSchema
>;
export type BindGovernancePolicyRequest = z.infer<typeof bindGovernancePolicyRequestSchema>;
export type SupersedeGovernancePackRequest = z.infer<typeof supersedeGovernancePackRequestSchema>;
export type ProposeGovernancePolicyRequest = z.infer<typeof proposeGovernancePolicyRequestSchema>;
export type ConfirmGovernancePolicyRequest = z.infer<typeof confirmGovernancePolicyRequestSchema>;
export type GovernanceRecordSummary = z.infer<typeof governanceRecordSummarySchema>;
export type GovernancePackVersionSummary = z.infer<typeof governancePackVersionSummarySchema>;
export type GovernancePackVersion = z.infer<typeof governancePackVersionSchema>;
export type GovernancePackListResponse = z.infer<typeof governancePackListResponseSchema>;
export type GovernancePolicyRegistryResponse = z.infer<
  typeof governancePolicyRegistryResponseSchema
>;
export type GovernancePolicyChangeResponse = z.infer<typeof governancePolicyChangeResponseSchema>;
export type AuditEventResponse = z.infer<typeof auditEventResponseSchema>;
export type AuditEventListResponse = z.infer<typeof auditEventListResponseSchema>;
