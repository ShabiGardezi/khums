import { z } from 'zod';

import type {
  AiDeclarationRef,
  AiInvolvement,
  ResearchChain,
  ResearchReference,
  ResearchRevisionRecord,
} from '@khums/shared-types';

import { identifierSchema } from '../calculation/common';
import { researchMarjaIdSchema, uuidV7Schema } from './common';

export { researchMarjaIdSchema, uuidV7Schema } from './common';
export * from './evidence';

/**
 * Strict schemas for scholar research records (M5.3.2; docs/SCHOLAR_RESEARCH_ARCHITECTURE.md §4).
 * Shape only: `@khums/core` replays each chain and verifies digests, the hash chain, the immutable
 * bindings, every lifecycle transition and the reference rules. Entity-specific payload schemas
 * arrive with their milestones (M5.3.3+).
 */

export const RESEARCH_ENTITY_TYPES = [
  'SOURCE',
  'PASSAGE',
  'TRANSLATION',
  'FINDING',
  'RULING',
] as const;
export const RESEARCH_REVISION_KINDS = [
  'CREATED',
  'REVISED',
  'VERIFIED',
  'REVIEWED',
  'APPROVED',
  'DISPUTED',
  'SUPERSEDED',
  'WITHDRAWN',
  'DRAFT_DELETED',
] as const;
export const AI_ASSISTANCE_TYPES = [
  'SOURCE_LOCATING',
  'OCR_TEXT_EXTRACTION',
  'TRANSLATION_DRAFT',
  'DUPLICATE_DETECTION',
  'CONSISTENCY_CHECK',
  'TEXT_TRANSCRIPTION',
  'FINDING_DRAFT',
] as const;

/** A required catalogue question id, e.g. `INC-01` or `CTQ-08`. */
export const researchQuestionIdSchema = z.string().regex(/^[A-Z]{3}-\d{2}$/);

/** Crockford base32 code derived from the UUID's random bits. */
const CODE = '[0-9A-HJKMNP-TV-Z]{8}';
/**
 * Readable reference: `S|P|T|R-{marjaId}-{code}`, or `F-{marjaId}-{questionId}-{code}` for findings.
 */
export const researchDisplayRefSchema = z
  .string()
  .max(120)
  .regex(
    new RegExp(
      `^(?:[SPTR]-[a-z][a-z0-9-]{0,62}-${CODE}|F-[a-z][a-z0-9-]{0,62}-[A-Z]{3}-\\d{2}-${CODE})$`,
    ),
    'research reference',
  );

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const timestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'ISO 8601 UTC with milliseconds');
/**
 * Research records are written only by an authenticated staff principal (never an unverified
 * reference; unlike legacy governance ledgers, there are no legacy research records).
 */
const actor = z.strictObject({ kind: z.literal('STAFF_PRINCIPAL'), subject: identifierSchema });
/** A stored reason: trimmed, 3–500 characters (no transformation of stored records). */
export const researchReasonSchema = z
  .string()
  .min(3)
  .max(500)
  .refine((value) => value === value.trim(), 'must be trimmed');
const reason = researchReasonSchema;
const MAX_PAYLOAD_JSON = 60_000;

export const researchReferenceSchema: z.ZodType<ResearchReference> = z.strictObject({
  entityType: z.enum(RESEARCH_ENTITY_TYPES),
  entityId: uuidV7Schema,
  revision: z.number().int().min(0),
  rulingVersion: z.number().int().min(1).nullable(),
  marjaId: researchMarjaIdSchema,
});

const aiIdentity = {
  assistance: z.enum(AI_ASSISTANCE_TYPES),
  field: z.string().min(1).max(200),
  generation: z.enum(['AI_GENERATED', 'MACHINE_ASSISTED']),
  tool: z.string().min(1).max(100),
  occurredAt: timestamp,
};

/** The identity of one AI declaration (what a correction links to). */
export const aiDeclarationRefSchema: z.ZodType<AiDeclarationRef> = z.strictObject(aiIdentity);

/**
 * Shape only. Whether `correctionOf` and `correctionReason` come together, and whether the link is
 * valid, is checked by `@khums/core` against the chain (typed refusals, also on replay).
 */
export const aiInvolvementSchema: z.ZodType<AiInvolvement> = z.strictObject({
  ...aiIdentity,
  scholarReview: z.enum(['NOT_REVIEWED', 'REVIEWED_UNCHANGED', 'REVIEWED_CORRECTED']),
  correctionOf: z.strictObject(aiIdentity).exactOptional(),
  correctionReason: reason.exactOptional(),
});

/** A content snapshot: a JSON object of bounded size (shape per entity type later). */
export const researchPayloadSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= MAX_PAYLOAD_JSON, 'payload too large');

export const researchRevisionRecordSchema: z.ZodType<ResearchRevisionRecord> = z.strictObject({
  entityType: z.enum(RESEARCH_ENTITY_TYPES),
  entityId: uuidV7Schema,
  displayRef: researchDisplayRefSchema,
  marjaId: researchMarjaIdSchema,
  rulingVersion: z.number().int().min(1).nullable(),
  rulingSeriesId: uuidV7Schema.exactOptional(),
  question: z
    .strictObject({ id: researchQuestionIdSchema, catalogueRevision: z.string().min(1).max(100) })
    .nullable(),
  revision: z.number().int().min(0),
  recordId: z.string().min(1).max(100),
  kind: z.enum(RESEARCH_REVISION_KINDS),
  payload: researchPayloadSchema.nullable(),
  payloadDigest: digest.nullable(),
  references: z.array(researchReferenceSchema).max(200),
  aiInvolvement: z.array(aiInvolvementSchema).max(50),
  actor,
  recordedAt: timestamp,
  reason: reason.nullable(),
  decisionId: z.string().min(1).max(200),
  requestId: z.string().min(1).max(200),
  previousRecordDigest: digest.nullable(),
  recordDigest: digest,
});

export const researchChainSchema: z.ZodType<ResearchChain> = z.strictObject({
  entityType: z.enum(RESEARCH_ENTITY_TYPES),
  entityId: uuidV7Schema,
  records: z.array(researchRevisionRecordSchema).max(10_000),
});

const commandContent = {
  payload: researchPayloadSchema,
  references: z.array(researchReferenceSchema).max(200),
  aiInvolvement: z.array(aiInvolvementSchema).max(50),
};

/**
 * The number of records the caller last saw (`ResearchView.length`): a stale-command precondition,
 * never stored. Core refuses a mismatch with `REVISION_CONFLICT`; the API must additionally persist
 * atomically (unique `{entityId, revision}` index inside a transaction, M5.3.3).
 */
const expectedRevision = z.number().int().min(1).max(10_000);

/**
 * Research commands as `@khums/core` accepts them (M5.3.2): strict; no actor, time, revision,
 * digest or display reference from the caller (the server derives them). REVISE and TRANSITION
 * carry `expectedRevision`; CREATE does not. The HTTP contracts of M5.3.3 build on these shapes.
 */
export const researchCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('CREATE'),
    entityType: z.enum(RESEARCH_ENTITY_TYPES),
    entityId: uuidV7Schema,
    marjaId: researchMarjaIdSchema,
    rulingVersion: z.number().int().min(1).nullable(),
    questionId: researchQuestionIdSchema.nullable(),
    ...commandContent,
  }),
  z.strictObject({ type: z.literal('REVISE'), expectedRevision, ...commandContent }),
  z.strictObject({
    type: z.literal('TRANSITION'),
    expectedRevision,
    kind: z.enum([
      'VERIFIED',
      'REVIEWED',
      'APPROVED',
      'DISPUTED',
      'SUPERSEDED',
      'WITHDRAWN',
      'DRAFT_DELETED',
    ]),
    reason: reason.nullable(),
  }),
]);
