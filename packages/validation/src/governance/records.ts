import { z } from 'zod';

import type {
  GovernanceLedger,
  GovernancePolicyRegistry,
  GovernanceRecord,
} from '@khums/shared-types';

import { identifierSchema } from '../calculation/common';
import { contentIntegritySchema } from '../calculation/rule-pack';

/**
 * Strict schemas for governance records (M4.4.3; RULE_PACK_STRUCTURE §5.9), for loading ledgers
 * from untrusted storage later. Shape only: `@khums/core` replays the ledger and verifies the hash
 * chain, record digests, sequence and every transition rule.
 */

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const timestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'ISO 8601 UTC with milliseconds');
const semver = z.string().regex(/^\d+\.\d+\.\d+$/);
/** Both actor kinds (D3): staff principals since M4.6.4a; legacy references stay readable. */
const actor = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('STAFF_PRINCIPAL'), subject: identifierSchema }),
  z.strictObject({ kind: z.literal('UNVERIFIED_REFERENCE'), subject: identifierSchema }),
]);
const evidence = z.strictObject({ reference: z.string().min(1).max(500) });
const recordId = z.string().min(1).max(250);

const base = {
  sequence: z.number().int().min(0),
  recordId,
  packId: identifierSchema,
  version: semver,
  recordedAt: timestamp,
  actor,
  previousRecordDigest: digest.nullable(),
  recordDigest: digest,
};

/** Versioned governance policies (shape only; rules live in `@khums/core`). */
export const GOVERNANCE_POLICY_IDS = [
  'INDEPENDENT_REVIEW_V1',
  'SINGLE_SCHOLAR_V1',
  'SOURCE_VERIFIED_AUTO_V1',
] as const;

/**
 * Policies the per-Marja registry can assign (proposals and confirmations). The rule-builder
 * policy `SOURCE_VERIFIED_AUTO_V1` is bound only by the automatic builder publication
 * (decision 67), never through the registry.
 */
export const REGISTRY_ASSIGNABLE_POLICY_IDS = [
  'INDEPENDENT_REVIEW_V1',
  'SINGLE_SCHOLAR_V1',
] as const;

export const governanceRecordSchema: z.ZodType<GovernanceRecord> = z.discriminatedUnion('type', [
  z.strictObject({
    ...base,
    type: z.literal('SUBMITTED'),
    integrity: contentIntegritySchema,
    // Optional: records written before policies existed have none (read as INDEPENDENT_REVIEW_V1).
    governancePolicy: z.enum(GOVERNANCE_POLICY_IDS).exactOptional(),
  }),
  z.strictObject({ ...base, type: z.literal('REVIEW_STARTED'), integrity: contentIntegritySchema }),
  z.strictObject({
    ...base,
    type: z.literal('CHANGES_REQUESTED'),
    integrity: contentIntegritySchema,
    evidence,
  }),
  z.strictObject({
    ...base,
    type: z.literal('REVIEW_COMPLETED'),
    integrity: contentIntegritySchema,
    evidence,
  }),
  z.strictObject({
    ...base,
    type: z.literal('APPROVED'),
    integrity: contentIntegritySchema,
    reviewRecordId: recordId,
    evidence,
  }),
  z.strictObject({
    ...base,
    type: z.literal('PUBLISHED'),
    integrity: contentIntegritySchema,
    approvalRecordId: recordId,
  }),
  z.strictObject({
    ...base,
    type: z.literal('WITHDRAWN'),
    reason: z.enum(['ERROR_FOUND', 'SOURCE_INVALIDATED', 'REVIEW_ABANDONED', 'OTHER']),
  }),
  z.strictObject({
    ...base,
    type: z.literal('SUPERSEDED'),
    successor: z.strictObject({ packId: identifierSchema, version: semver }),
    successorPublicationRecordId: recordId,
  }),
  z.strictObject({
    ...base,
    type: z.literal('ACTIVATED'),
    integrity: contentIntegritySchema,
    publicationRecordId: recordId,
    approvalRecordId: recordId,
  }),
  // M5.2.1: explicit policy binding of a legacy ledger (appended; history never rewritten).
  z.strictObject({
    ...base,
    type: z.literal('POLICY_BOUND'),
    governancePolicy: z.enum(GOVERNANCE_POLICY_IDS),
  }),
]);

export const governanceLedgerSchema: z.ZodType<GovernanceLedger> = z.strictObject({
  packId: identifierSchema,
  version: semver,
  records: z.array(governanceRecordSchema).max(10_000),
});

/** The per-Marja governance policy registry (shape only; `@khums/core` replays and verifies). */
export const governancePolicyRegistrySchema: z.ZodType<GovernancePolicyRegistry> = z.strictObject({
  records: z
    .array(
      z.strictObject({
        kind: z.enum(['INITIAL_CONFIGURATION', 'CHANGE_PROPOSED', 'CHANGE_CONFIRMED']),
        sequence: z.number().int().min(0),
        recordId,
        marjaId: identifierSchema,
        // Never the rule-builder policy (decision 67): the registry assigns only these.
        previousPolicy: z.enum(REGISTRY_ASSIGNABLE_POLICY_IDS).nullable(),
        newPolicy: z.enum(REGISTRY_ASSIGNABLE_POLICY_IDS),
        actor,
        recordedAt: timestamp,
        reason: z.string().trim().min(1).max(500),
        requestId: z.string().min(1).max(200),
        decisionId: z.string().min(1).max(200).nullable(),
        proposal: z
          .strictObject({ recordId, recordDigest: digest, requestId: z.string().min(1).max(200) })
          .nullable(),
        previousRecordDigest: digest.nullable(),
        recordDigest: digest,
      }),
    )
    .max(100_000),
});
