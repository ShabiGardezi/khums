import { z } from 'zod';

import type {
  AuditDetailValue,
  AuditEvent,
  AuditEventDraft,
  IntegrityCheckpoint,
} from '@khums/shared-types';

import { identifierSchema } from '../calculation/common';

/**
 * Strict schemas for audit events and integrity checkpoints (M4.6.3a), used to validate drafts
 * from server code and every document read back from storage. Shape only: `@khums/core` verifies
 * sequences, links, digests and signatures.
 */

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const timestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'ISO 8601 UTC with milliseconds');
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const opaqueId = z.string().min(1).max(200);
const detailText = z.string().max(500);

const detailValue: z.ZodType<AuditDetailValue> = z.union([
  detailText,
  z.boolean(),
  z.null(),
  z.array(detailText).max(50),
]);

const draftShape = {
  eventId: uuid,
  type: z.string().regex(/^[a-z][a-zA-Z]*(\.[a-z][a-zA-Z]*){1,4}$/),
  actor: opaqueId.nullable(),
  targets: z
    .array(z.strictObject({ kind: z.string().regex(/^[a-z][a-zA-Z]{0,39}$/), id: opaqueId }))
    .max(20),
  marjaIds: z.array(identifierSchema).max(50),
  details: z
    .record(z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/), detailValue)
    .refine((value) => Object.keys(value).length <= 30, 'at most 30 detail fields'),
  requestId: opaqueId.nullable(),
  occurredAt: timestamp,
};

export const auditEventDraftSchema: z.ZodType<AuditEventDraft> = z.strictObject(draftShape);

export const auditEventSchema: z.ZodType<AuditEvent> = z.strictObject({
  ...draftShape,
  sequence: z.number().int().min(0),
  previousDigest: digest.nullable(),
  digest,
});

export const integrityChainIdSchema = z
  .string()
  .regex(
    /^(audit|governance-policy-registry|(?:governance-ledger|provisional):[A-Za-z0-9][A-Za-z0-9._:-]{0,99}@\d+\.\d+\.\d+|research:(?:source|passage|translation|finding|ruling):[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/,
  );

export const integrityCheckpointSchema: z.ZodType<IntegrityCheckpoint> = z.strictObject({
  checkpointId: uuid,
  chainId: integrityChainIdSchema,
  sequence: z.number().int().min(0),
  digest,
  recordCount: z.number().int().min(1),
  createdAt: timestamp,
  keyId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/, 'Ed25519 signature, base64url'),
});
