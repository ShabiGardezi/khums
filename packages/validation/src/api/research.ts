import { z } from 'zod';

import { identifierSchema } from '../calculation/common';
import { researchMarjaIdSchema, uuidV7Schema } from '../research/common';
import {
  COPYRIGHT_STATUSES,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MEDIA_TYPES,
  findingPayloadSchema,
  passagePayloadSchema,
  rulingPayloadSchema,
  sourcePayloadSchema,
  translationPayloadSchema,
} from '../research/evidence';
import {
  aiDeclarationRefSchema,
  aiInvolvementSchema,
  RESEARCH_ENTITY_TYPES,
  RESEARCH_REVISION_KINDS,
  researchQuestionIdSchema,
  researchReasonSchema,
  researchReferenceSchema,
} from '../research/index';

/**
 * Scholar research API contracts (M5.3.3: sources, evidence, passages, translations;
 * docs/SCHOLAR_RESEARCH_ARCHITECTURE.md §8). Requests are strict and never carry an actor, time,
 * digest, display reference or record revision: the server derives them. `expectedRevision` is a
 * precondition (the chain length the caller saw), never stored. Payloads are validated per entity
 * type by `@khums/core` (`SourcePayload`, `PassagePayload`, `TranslationPayload`).
 */

/** Path segment of each research collection (M5.3.3 evidence layer; M5.3.4 findings, rulings). */
export const RESEARCH_RECORD_TYPES = [
  'sources',
  'passages',
  'translations',
  'findings',
  'rulings',
] as const;
export type ResearchRecordType = (typeof RESEARCH_RECORD_TYPES)[number];

/** Transition actions as path segments (REVISE has its own route). */
export const RESEARCH_TRANSITION_ACTIONS = [
  'verify',
  'review',
  'dispute',
  'supersede',
  'delete-draft',
  'approve',
  'withdraw',
] as const;

const expectedRevision = z.int().min(1).max(10_000);
const states = [
  'DRAFT',
  'VERIFIED',
  'REVIEWED',
  'APPROVED',
  'DISPUTED',
  'SUPERSEDED',
  'WITHDRAWN',
  'DELETED',
] as const;
const timestamp = z.string();
const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'lowercase SHA-256 hex');
const paging = {
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,400}$/)
    .optional(),
};
const content = {
  payload: z.record(z.string(), z.unknown()),
  references: z.array(researchReferenceSchema).max(200),
  aiInvolvement: z.array(aiInvolvementSchema).max(50),
};

// ---- Payload components (documentation; validated per type by @khums/core) ----

export const sourcePayloadContract = sourcePayloadSchema.meta({
  id: 'SourcePayload',
  title: 'SourcePayload',
});
export const passagePayloadContract = passagePayloadSchema.meta({
  id: 'PassagePayload',
  title: 'PassagePayload',
});
export const translationPayloadContract = translationPayloadSchema.meta({
  id: 'TranslationPayload',
  title: 'TranslationPayload',
});
export const findingPayloadContract = findingPayloadSchema.meta({
  id: 'FindingPayload',
  title: 'FindingPayload',
});
export const rulingPayloadContract = rulingPayloadSchema.meta({
  id: 'RulingPayload',
  title: 'RulingPayload',
});

// ---- Params and queries ----

export const researchTypeParamsSchema = z
  .strictObject({ type: z.enum(RESEARCH_RECORD_TYPES) })
  .meta({ id: 'ResearchTypeParams', title: 'ResearchTypeParams' });

export const researchEntityParamsSchema = z
  .strictObject({ type: z.enum(RESEARCH_RECORD_TYPES), id: uuidV7Schema })
  .meta({ id: 'ResearchEntityParams', title: 'ResearchEntityParams' });

export const researchRevisionParamsSchema = z
  .strictObject({
    type: z.enum(RESEARCH_RECORD_TYPES),
    id: uuidV7Schema,
    revision: z.coerce.number().int().min(0).max(10_000),
  })
  .meta({ id: 'ResearchRevisionParams', title: 'ResearchRevisionParams' });

export const researchTransitionParamsSchema = z
  .strictObject({
    type: z.enum(RESEARCH_RECORD_TYPES),
    id: uuidV7Schema,
    action: z.enum(RESEARCH_TRANSITION_ACTIONS),
  })
  .meta({ id: 'ResearchTransitionParams', title: 'ResearchTransitionParams' });

/** A ruling version, addressed by its own entity id (M5.3.5). */
export const rulingParamsSchema = z
  .strictObject({ id: uuidV7Schema })
  .meta({ id: 'RulingParams', title: 'RulingParams' });

export const researchListQuerySchema = z
  .strictObject({
    marjaId: researchMarjaIdSchema.optional(),
    state: z.enum(states).optional(),
    /** Findings only: one catalogue question. */
    questionId: researchQuestionIdSchema.optional(),
    ...paging,
  })
  .meta({ id: 'ResearchListQuery', title: 'ResearchListQuery' });

export const evidenceParamsSchema = z
  .strictObject({ artefactId: uuidV7Schema })
  .meta({ id: 'EvidenceParams', title: 'EvidenceParams' });

/** `GET /admin/research/evidence?sourceId=`: the evidence of one source. */
export const evidenceListQuerySchema = z
  .strictObject({ sourceId: uuidV7Schema })
  .meta({ id: 'EvidenceListQuery', title: 'EvidenceListQuery' });

// ---- Requests ----

export const createResearchRecordRequestSchema = z
  .strictObject({
    marjaId: researchMarjaIdSchema,
    /** Findings only (required for them): a required catalogue question (D7). */
    questionId: researchQuestionIdSchema.optional(),
    ...content,
  })
  .meta({ id: 'CreateResearchRecordRequest', title: 'CreateResearchRecordRequest' });

export const reviseResearchRecordRequestSchema = z
  .strictObject({ expectedRevision, ...content })
  .meta({ id: 'ReviseResearchRecordRequest', title: 'ReviseResearchRecordRequest' });

/**
 * A correction of the CURRENT (APPROVED) ruling version addressed by the path (M5.3.5): a new DRAFT
 * version n+1 of the same series. `expectedRevision` is the current version's chain length.
 */
export const createRulingVersionRequestSchema = z
  .strictObject({ expectedRevision, ...content })
  .meta({ id: 'CreateRulingVersionRequest', title: 'CreateRulingVersionRequest' });

/** `reason` is required for dispute and delete-draft (the server refuses otherwise). */
export const researchTransitionRequestSchema = z
  .strictObject({ expectedRevision, reason: researchReasonSchema.nullable() })
  .meta({ id: 'ResearchTransitionRequest', title: 'ResearchTransitionRequest' });

/** Base64 of at most EVIDENCE_MAX_BYTES bytes. */
const base64 = z
  .string()
  .min(4)
  .max(Math.ceil(EVIDENCE_MAX_BYTES / 3) * 4)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'base64');

/**
 * Attaches one evidence file to a source (bytes as base64, at most 2 MiB). `sha256` is the
 * client's digest of the bytes; the server recomputes it and refuses a mismatch. The Marja is the
 * source's. Complete documents only with copyright PERMITTED (D10).
 */
export const uploadEvidenceRequestSchema = z
  .strictObject({
    sourceId: uuidV7Schema,
    mediaType: z.enum(EVIDENCE_MEDIA_TYPES),
    sha256,
    copyright: z.enum(COPYRIGHT_STATUSES),
    extent: z.enum(['EXCERPT', 'COMPLETE']),
    description: z.string().trim().min(3).max(500),
    contentBase64: base64,
  })
  .meta({ id: 'UploadEvidenceRequest', title: 'UploadEvidenceRequest' });

// ---- Responses (additive) ----

const actor = z.object({ kind: z.string(), subject: z.string() });

export const researchRecordSummarySchema = z
  .object({
    revision: z.number(),
    recordId: z.string(),
    kind: z.enum(RESEARCH_REVISION_KINDS),
    actor,
    recordedAt: timestamp,
    reason: z.string().nullable(),
    payloadDigest: z.string().nullable(),
    recordDigest: z.string(),
  })
  .meta({ id: 'ResearchRecordSummary', title: 'ResearchRecordSummary' });

const provenanceEvent = z.object({
  revision: z.number(),
  recordId: z.string(),
  actor,
  recordedAt: timestamp,
});

export const researchAiProvenanceEntrySchema = z
  .object({
    declaration: aiInvolvementSchema,
    declaredIn: provenanceEvent,
    reviewedIn: provenanceEvent.nullable(),
    correctedBy: aiDeclarationRefSchema.nullable(),
    correctedIn: provenanceEvent.nullable(),
    effective: z.boolean(),
  })
  .meta({ id: 'ResearchAiProvenanceEntry', title: 'ResearchAiProvenanceEntry' });

const researchContent = z.object({
  revision: z.number(),
  payload: z.record(z.string(), z.unknown()),
  payloadDigest: z.string(),
  references: z.array(researchReferenceSchema),
  aiInvolvement: z.array(aiInvolvementSchema),
});

export const researchRecordResponseSchema = z
  .object({
    entityType: z.enum(RESEARCH_ENTITY_TYPES),
    entityId: z.string(),
    displayRef: z.string(),
    marjaId: z.string(),
    state: z.enum(states),
    /** Findings: the catalogue question; null otherwise. */
    questionId: z.string().nullable(),
    /** Rulings: the ruling version; null otherwise. */
    rulingVersion: z.number().nullable(),
    /** Rulings: the series shared by every version (version 1's entity id); null otherwise. */
    rulingSeriesId: z.string().nullable(),
    /** Send as `expectedRevision` with the next command. */
    expectedRevision: z.number(),
    /** The latest content revision (CREATED or REVISED). */
    content: researchContent,
    records: z.array(researchRecordSummarySchema),
    aiProvenance: z.array(researchAiProvenanceEntrySchema),
  })
  .meta({ id: 'ResearchRecordResponse', title: 'ResearchRecordResponse' });

/** One exact revision: its record, the state after it and the content a pin to it refers to. */
export const researchRevisionResponseSchema = z
  .object({
    entityType: z.enum(RESEARCH_ENTITY_TYPES),
    entityId: z.string(),
    displayRef: z.string(),
    marjaId: z.string(),
    record: researchRecordSummarySchema,
    stateAtRevision: z.enum(states),
    content: researchContent,
  })
  .meta({ id: 'ResearchRevisionResponse', title: 'ResearchRevisionResponse' });

export const researchListItemSchema = z
  .object({
    entityType: z.enum(RESEARCH_ENTITY_TYPES),
    entityId: z.string(),
    displayRef: z.string(),
    marjaId: z.string(),
    state: z.enum(states),
    questionId: z.string().nullable(),
    rulingVersion: z.number().nullable(),
    rulingSeriesId: z.string().nullable(),
    revisions: z.number(),
    createdAt: timestamp,
    updatedAt: timestamp,
    /** Source title, passage locator, translation language, or display reference (never text). */
    label: z.string(),
  })
  .meta({ id: 'ResearchListItem', title: 'ResearchListItem' });

export const researchListResponseSchema = z
  .object({ items: z.array(researchListItemSchema), nextCursor: z.string().nullable() })
  .meta({ id: 'ResearchListResponse', title: 'ResearchListResponse' });

/**
 * Every version of one ruling series (M5.3.5). `current` is the single APPROVED version — the one
 * that applies — or null; superseded and withdrawn versions are never current.
 */
const rulingVersionItem = z.object({
  entityId: z.string(),
  displayRef: z.string(),
  rulingVersion: z.number(),
  state: z.enum(states),
  current: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const rulingVersionsResponseSchema = z
  .object({
    rulingSeriesId: z.string(),
    marjaId: z.string(),
    current: rulingVersionItem.nullable(),
    versions: z.array(rulingVersionItem),
  })
  .meta({ id: 'RulingVersionsResponse', title: 'RulingVersionsResponse' });

/** Auditor view (D6): ids, states, actors, times and digests; no content and no reasons. */
export const researchMetadataItemSchema = z
  .object({
    entityType: z.enum(RESEARCH_ENTITY_TYPES),
    entityId: z.string(),
    displayRef: z.string(),
    marjaId: z.string(),
    state: z.enum(states),
    records: z.array(
      z.object({
        revision: z.number(),
        kind: z.enum(RESEARCH_REVISION_KINDS),
        actor,
        recordedAt: timestamp,
        hasReason: z.boolean(),
        recordDigest: z.string(),
      }),
    ),
  })
  .meta({ id: 'ResearchMetadataItem', title: 'ResearchMetadataItem' });

export const researchMetadataListResponseSchema = z
  .object({ items: z.array(researchMetadataItemSchema), nextCursor: z.string().nullable() })
  .meta({ id: 'ResearchMetadataListResponse', title: 'ResearchMetadataListResponse' });

export const researchMarjasResponseSchema = z
  .object({
    marjas: z.array(z.object({ marjaId: z.string(), permissions: z.array(z.string()) })),
  })
  .meta({ id: 'ResearchMarjasResponse', title: 'ResearchMarjasResponse' });

export const evidenceArtefactResponseSchema = z
  .object({
    artefactId: z.string(),
    marjaId: z.string(),
    sourceId: z.string(),
    sourceRevision: z.number(),
    digest: z.string(),
    size: z.number(),
    mediaType: z.enum(EVIDENCE_MEDIA_TYPES),
    copyright: z.enum(COPYRIGHT_STATUSES),
    extent: z.enum(['EXCERPT', 'COMPLETE']),
    description: z.string(),
    recordedBy: identifierSchema,
    recordedAt: timestamp,
  })
  .meta({ id: 'EvidenceArtefactResponse', title: 'EvidenceArtefactResponse' });

export const evidenceListResponseSchema = z
  .object({ items: z.array(evidenceArtefactResponseSchema) })
  .meta({ id: 'EvidenceListResponse', title: 'EvidenceListResponse' });

/** The verified bytes (SHA-256 re-checked on this retrieval) and their metadata. */
export const evidenceContentResponseSchema = z
  .object({ artefact: evidenceArtefactResponseSchema, contentBase64: z.string() })
  .meta({ id: 'EvidenceContentResponse', title: 'EvidenceContentResponse' });

export type CreateResearchRecordRequest = z.infer<typeof createResearchRecordRequestSchema>;
export type CreateRulingVersionRequest = z.infer<typeof createRulingVersionRequestSchema>;
export type ReviseResearchRecordRequest = z.infer<typeof reviseResearchRecordRequestSchema>;
export type ResearchTransitionRequest = z.infer<typeof researchTransitionRequestSchema>;
export type UploadEvidenceRequest = z.infer<typeof uploadEvidenceRequestSchema>;
export type ResearchRecordResponse = z.infer<typeof researchRecordResponseSchema>;
export type ResearchRevisionResponse = z.infer<typeof researchRevisionResponseSchema>;
export type ResearchListItem = z.infer<typeof researchListItemSchema>;
export type ResearchListResponse = z.infer<typeof researchListResponseSchema>;
export type RulingVersionsResponse = z.infer<typeof rulingVersionsResponseSchema>;
export type ResearchMetadataItem = z.infer<typeof researchMetadataItemSchema>;
export type ResearchMetadataListResponse = z.infer<typeof researchMetadataListResponseSchema>;
export type ResearchMarjasResponse = z.infer<typeof researchMarjasResponseSchema>;
export type EvidenceArtefactResponse = z.infer<typeof evidenceArtefactResponseSchema>;
export type EvidenceListResponse = z.infer<typeof evidenceListResponseSchema>;
export type EvidenceContentResponse = z.infer<typeof evidenceContentResponseSchema>;
export type ResearchAiProvenanceEntry = z.infer<typeof researchAiProvenanceEntrySchema>;
export type ResearchRecordSummary = z.infer<typeof researchRecordSummarySchema>;
