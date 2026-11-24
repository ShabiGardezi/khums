import { z } from 'zod';

import { isoDateSchema } from '../calculation/common';
import { decimalStringSchema } from '../decimal';
import { currencyCodeSchema, FINANCIAL_FACT_SUBTYPES } from '../financial/facts';
import { OPERATIONAL_STATES } from '../provisional';
import { researchMarjaIdSchema, uuidV7Schema } from '../research/common';
import {
  BUILDER_AI_STAGES,
  BUILDER_CATEGORIES,
  builderAiPreparationSchema,
  builderReasonSchema,
  builderRuleContentSchema,
  RULE_REQUEST_KINDS,
  ruleRequestMessageSchema,
  ruleRequestNoteSchema,
  ruleVerificationAttestationsSchema,
  ruleVerificationNotesSchema,
} from '../rule-builder';
import { PROVISIONAL_RESULT_LABEL } from './provisional';

/**
 * Scholar rule builder API contracts (Phase 2 steps 3–4). Staff only. Requests are strict and
 * never carry an actor, time, ruling version or status: the server derives them. A builder rule is
 * only what the scholar entered; test calculations are always PROVISIONAL — FOR SCHOLAR REVIEW
 * ONLY and never public.
 */

const isoDate = z.iso.date();
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);

// ---- Requests (strict) ----

export const scholarRuleListQuerySchema = z
  .strictObject({ marjaId: researchMarjaIdSchema })
  .meta({ id: 'ScholarRuleListQuery', title: 'ScholarRuleListQuery' });

/**
 * Decision 83: the official monthly-CPI inflation between two dates for a currency (a suggestion
 * the staff panel pre-fills; the person may change it).
 */
export const ruleInflationQuerySchema = z
  .strictObject({ currency: currencyCodeSchema, from: isoDateSchema, to: isoDateSchema })
  .meta({ id: 'RuleInflationQuery', title: 'RuleInflationQuery' });

export const ruleInflationResponseSchema = z
  .object({
    /** False when the index is not published for these months (the person enters a figure). */
    available: z.boolean(),
    /** Percentage, rounded half up to 2 places; may be negative (prices fell). */
    percent: z.string().nullable(),
    fromMonth: z.string().nullable(),
    /** The month used: the end date's month, or the latest earlier published month. */
    toMonth: z.string().nullable(),
    latestPublished: z.boolean(),
    /** The economy whose index is used (ISO 3166 alpha-3; G163 = euro area), and its source. */
    economy: z.string().nullable(),
    source: z.string(),
  })
  .meta({ id: 'RuleInflationResponse', title: 'RuleInflationResponse' });

export type RuleInflationQuery = z.infer<typeof ruleInflationQuerySchema>;
export type RuleInflationResponse = z.infer<typeof ruleInflationResponseSchema>;

export const scholarRuleParamsSchema = z
  .strictObject({ ruleId: uuidV7Schema })
  .meta({ id: 'ScholarRuleParams', title: 'ScholarRuleParams' });

export const createScholarRuleRequestSchema = z
  .strictObject({
    marjaId: researchMarjaIdSchema,
    content: builderRuleContentSchema,
    reason: builderReasonSchema,
    /** Declared when AI prepared this revision (Phase 4, decision 76). */
    aiPreparation: builderAiPreparationSchema.optional(),
  })
  .meta({ id: 'CreateScholarRuleRequest', title: 'CreateScholarRuleRequest' });

export const reviseScholarRuleRequestSchema = z
  .strictObject({
    /** The number of revisions the caller read (the next revision's number). */
    expectedRevision: z.int().min(1).max(10_000),
    content: builderRuleContentSchema,
    reason: builderReasonSchema,
    /** Declared when AI prepared this revision (Phase 4, decision 76). */
    aiPreparation: builderAiPreparationSchema.optional(),
    /** `true` rejects the rule: it is left out of every compiled pack until revised again. */
    rejected: z.literal(true).optional(),
  })
  .meta({ id: 'ReviseScholarRuleRequest', title: 'ReviseScholarRuleRequest' });

/** Checks unsaved content (nothing is stored). */
export const checkScholarRuleRequestSchema = z
  .strictObject({ marjaId: researchMarjaIdSchema, content: builderRuleContentSchema })
  .meta({ id: 'CheckScholarRuleRequest', title: 'CheckScholarRuleRequest' });

const FACT_KINDS = Object.keys(FINANCIAL_FACT_SUBTYPES) as [
  keyof typeof FINANCIAL_FACT_SUBTYPES,
  ...(keyof typeof FINANCIAL_FACT_SUBTYPES)[],
];

/** One test entry: a known amount on a known date (test values only; never stored). */
const builderTestEntrySchema = z
  .strictObject({
    id: identifier,
    kind: z.enum(FACT_KINDS),
    subtype: z.string().min(1).max(40),
    amount: decimalStringSchema,
    date: isoDate,
  })
  .refine((e) => (FINANCIAL_FACT_SUBTYPES[e.kind] as readonly string[]).includes(e.subtype), {
    message: 'Unknown subtype for this kind',
    path: ['subtype'],
  });

/**
 * Compiles the Marja's latest rule revisions into a SCHOLAR_REVIEW test pack and runs one test
 * calculation (annual workflow). Nothing is stored except an audit event without figures.
 */
export const testScholarRulesRequestSchema = z
  .strictObject({
    marjaId: researchMarjaIdSchema,
    currency: currencyCodeSchema,
    period: z.strictObject({ start: isoDate, end: isoDate }),
    entries: z.array(builderTestEntrySchema).max(100),
    /** Answers to once-per-calculation confirmations, by question id. */
    answers: z.record(identifier, z.boolean()),
    /** Answers to per-entry confirmations: entry id → question id → answer. */
    // Phase 4: a per-entry inflation question takes a percentage as a decimal string.
    entryAnswers: z.record(
      identifier,
      z.record(identifier, z.union([z.boolean(), decimalStringSchema])),
    ),
  })
  .meta({ id: 'TestScholarRulesRequest', title: 'TestScholarRulesRequest' });

// ---- Responses (additive) ----

const issue = z.object({ code: z.string(), field: z.string() });

export const scholarRuleStatusSchema = z.enum([
  'DRAFT',
  'DEVELOPER_IMPLEMENTATION_REQUIRED',
  'READY_FOR_VERIFICATION',
]);

export const scholarRuleCheckResponseSchema = z
  .object({
    /** The derived status of this content. */
    status: scholarRuleStatusSchema,
    /** Content errors that prevent saving. */
    errors: z.array(issue),
    /** What a draft still lacks (it can be saved, but not tested or verified). */
    missing: z.array(issue),
    requirement: z.object({
      status: z.enum(['SUPPORTED', 'DEVELOPER_IMPLEMENTATION_REQUIRED']),
      /** Stable codes of the capabilities the engine does not have yet. */
      capabilities: z.array(issue),
    }),
  })
  .meta({ id: 'ScholarRuleCheckResponse', title: 'ScholarRuleCheckResponse' });

export const scholarRuleRevisionResponseSchema = z
  .object({
    revision: z.number(),
    content: z.record(z.string(), z.unknown()),
    rulingVersion: z.number().nullable(),
    actor: z.string(),
    /** Decision 79: the author's username (null when unknown, e.g. a removed account). */
    actorName: z.string().nullable(),
    at: z.string(),
    reason: z.string(),
    /** AI preparation of this revision, or null (decision 76: never religious approval). */
    aiPreparation: z
      .object({ stage: z.enum(BUILDER_AI_STAGES), tool: z.string(), tests: z.string().nullable() })
      .nullable(),
    rejected: z.boolean(),
  })
  .meta({ id: 'ScholarRuleRevisionResponse', title: 'ScholarRuleRevisionResponse' });

export const scholarRuleResponseSchema = z
  .object({
    ruleId: z.string(),
    marjaId: z.string(),
    /** The number of revisions (send as `expectedRevision` with the next revision). */
    revisions: z.number(),
    current: scholarRuleRevisionResponseSchema,
    check: scholarRuleCheckResponseSchema,
    /** Every revision, oldest first (append-only history). */
    history: z.array(scholarRuleRevisionResponseSchema),
    /** Informational: whether you may revise this rule (the server decides on every command). */
    canEdit: z.boolean(),
    /**
     * Decision 79: the current revision's sources by title and location (filled when a rule is
     * read; empty in command responses).
     */
    sources: z.array(
      z.object({
        refId: z.string(),
        title: z.string(),
        url: z.string().nullable(),
        locator: z.string().nullable(),
      }),
    ),
    /** Decision 79: the cited research ruling's summary (null when none or not read). */
    ruling: z.object({ summary: z.string() }).nullable(),
  })
  .meta({ id: 'ScholarRuleResponse', title: 'ScholarRuleResponse' });

export const scholarRuleSummarySchema = z
  .object({
    ruleId: z.string(),
    marjaId: z.string(),
    category: z.enum(BUILDER_CATEGORIES),
    revisions: z.number(),
    status: scholarRuleStatusSchema,
    updatedAt: z.string(),
    updatedBy: z.string(),
    /** AI stage of the current revision, or null when a person made it. */
    aiStage: z.enum(BUILDER_AI_STAGES).nullable(),
    rejected: z.boolean(),
  })
  .meta({ id: 'ScholarRuleSummary', title: 'ScholarRuleSummary' });

export const scholarRuleListResponseSchema = z
  .object({
    marjaId: z.string(),
    canEdit: z.boolean(),
    canTest: z.boolean(),
    rules: z.array(scholarRuleSummarySchema),
  })
  .meta({ id: 'ScholarRuleListResponse', title: 'ScholarRuleListResponse' });

export const scholarRuleTestResponseSchema = z
  .object({
    label: z.literal(PROVISIONAL_RESULT_LABEL),
    operationalState: z.enum(OPERATIONAL_STATES),
    guidance: z.literal('PROVISIONAL_SCHOLAR_REVIEW'),
    disclaimer: z.string(),
    pack: z.object({
      packId: z.string(),
      version: z.string(),
      marjaId: z.string(),
      contentDigest: z.string(),
    }),
    /** Rules compiled (latest revision of each), and rules left out with the reason. */
    compiled: z.array(
      z.object({
        ruleId: z.string(),
        revision: z.number(),
        category: z.enum(BUILDER_CATEGORIES),
        /** The rule's result output in the report. */
        outputId: z.string(),
        developerRequired: z.boolean(),
        /** AI stage of the compiled revision, or null when a person made it. */
        aiStage: z.enum(BUILDER_AI_STAGES).nullable(),
        /** The research ruling the rule cites, or null. */
        rulingId: z.string().nullable(),
        /** The research sources and passages the rule cites, as compiled into the pack. */
        sources: z.array(
          z.object({
            refId: z.string(),
            title: z.string(),
            url: z.string().nullable(),
            locator: z.string().nullable(),
          }),
        ),
      }),
    ),
    skipped: z.array(z.object({ ruleId: z.string(), revision: z.number(), reason: z.string() })),
    /** Questions the test pack asks: once per calculation, or per matching entry. */
    questions: z.array(
      z.object({
        questionId: z.string(),
        label: z.string(),
        scope: z.enum(['ENTRY', 'CALCULATION']),
        ruleId: z.string(),
        /** Phase 4: a number answered per entry; otherwise yes/no. */
        kind: z.enum(['boolean', 'decimal']),
        /** Decision 82, decimal questions: a percentage or a money amount. */
        unit: z.enum(['PERCENT', 'AMOUNT']).optional(),
        /** Decision 83: an inflation figure (the panel can pre-fill it from official data). */
        inflation: z.literal(true).optional(),
      }),
    ),
    /**
     * - CALCULATED: the engine ran (the report may still contain review stops);
     * - NEEDS_REVIEW: the entries stop before calculation (answers missing, review stops);
     * - REFUSED: the engine or the compilation refused (issues attached).
     */
    outcome: z.enum(['CALCULATED', 'NEEDS_REVIEW', 'REFUSED']),
    mapping: z
      .object({
        status: z.string(),
        clarifications: z.array(
          z.object({ factId: z.string(), reason: z.string(), questionId: z.string().nullable() }),
        ),
        consultations: z.array(
          z.object({
            factId: z.string().nullable(),
            consultationId: z.string(),
            /** Decision 79: why it stops, in words (the rule's own label). */
            label: z.string(),
          }),
        ),
        unsupported: z.array(z.object({ factId: z.string().nullable(), code: z.string() })),
      })
      .nullable(),
    report: z.record(z.string(), z.unknown()).nullable(),
    refusal: z
      .object({
        reason: z.string(),
        issues: z.array(
          z.object({ code: z.string(), message: z.string(), path: z.string().nullable() }),
        ),
      })
      .nullable(),
  })
  .meta({ id: 'ScholarRuleTestResponse', title: 'ScholarRuleTestResponse' });

export type ScholarRuleListQuery = z.infer<typeof scholarRuleListQuerySchema>;
export type ScholarRuleParams = z.infer<typeof scholarRuleParamsSchema>;
export type CreateScholarRuleRequest = z.infer<typeof createScholarRuleRequestSchema>;
export type ReviseScholarRuleRequest = z.infer<typeof reviseScholarRuleRequestSchema>;
export type CheckScholarRuleRequest = z.infer<typeof checkScholarRuleRequestSchema>;
export type TestScholarRulesRequest = z.infer<typeof testScholarRulesRequestSchema>;
export type ScholarRuleStatus = z.infer<typeof scholarRuleStatusSchema>;
export type ScholarRuleCheckResponse = z.infer<typeof scholarRuleCheckResponseSchema>;
export type ScholarRuleRevisionResponse = z.infer<typeof scholarRuleRevisionResponseSchema>;
export type ScholarRuleResponse = z.infer<typeof scholarRuleResponseSchema>;
export type ScholarRuleSummary = z.infer<typeof scholarRuleSummarySchema>;
export type ScholarRuleListResponse = z.infer<typeof scholarRuleListResponseSchema>;
export type ScholarRuleTestResponse = z.infer<typeof scholarRuleTestResponseSchema>;

// ---- Source verification (Phase 2 step 5, decisions 63 and 67) ----

/**
 * Records the source verification of the rule's CURRENT revision: the four attestations must each
 * be `true` (anything else is refused before the server looks further). Recording it approves
 * that revision automatically and publishes a new builder pack version.
 */
export const verifyScholarRuleRequestSchema = z
  .strictObject({
    /** The revision number the verifier read (must still be the current one). */
    revision: z.int().min(0).max(10_000),
    attestations: ruleVerificationAttestationsSchema,
    notes: ruleVerificationNotesSchema,
    reason: builderReasonSchema,
  })
  .meta({ id: 'VerifyScholarRuleRequest', title: 'VerifyScholarRuleRequest' });

export const ruleVerificationSchema = z
  .object({
    verificationId: z.string(),
    revision: z.number(),
    contentHash: z.string(),
    rulingRef: z.string(),
    attestations: z.object({
      sourcesAuthentic: z.boolean(),
      originalTextMatches: z.boolean(),
      translationAccurate: z.boolean(),
      attributionCorrect: z.boolean(),
    }),
    notes: z.string().nullable(),
    /** The verifier (staff principal id; staff-only response). */
    actor: z.string(),
    at: z.string(),
    reason: z.string(),
    /** The builder pack version this verification produced. */
    publication: z.object({ packId: z.string(), version: z.string(), contentDigest: z.string() }),
  })
  .meta({ id: 'RuleVerification', title: 'RuleVerification' });

export const verificationBlockerSchema = z
  .object({
    /** Stable blocker code (e.g. PASSAGE_NOT_VERIFIED, DEVELOPER_IMPLEMENTATION_REQUIRED). */
    code: z.string(),
    entityType: z.enum(['SOURCE', 'PASSAGE', 'TRANSLATION', 'FINDING', 'RULING']).nullable(),
    entityId: z.string().nullable(),
    state: z.string().nullable(),
  })
  .meta({ id: 'VerificationBlocker', title: 'VerificationBlocker' });

/** A rule of a live builder version whose research no longer holds (ids and codes only). */
export const suspendedBuilderRuleSchema = z
  .object({
    /** Builder rule id (without the pack's `builder:` prefix). */
    ruleId: z.string(),
    /** Stable codes (e.g. PASSAGE_NOT_VERIFIED, RULING_NOT_CURRENT, FINDING_NOT_CURRENT). */
    codes: z.array(z.string()),
  })
  .meta({ id: 'SuspendedBuilderRule', title: 'SuspendedBuilderRule' });

/** Where a rule stands with the public calculator. */
export const rulePublicStatusSchema = z
  .object({
    /**
     * LIVE: the active builder pack version includes this rule (source-verified).
     * SUSPENDED: it does, but research a rule of that version rests on changed (disputed,
     * withdrawn, deleted, superseded or revised), so the public calculator does not serve the
     * version until it is corrected and verified again (audit BLD-01; decision 69).
     */
    status: z.enum(['LIVE', 'SUSPENDED', 'NOT_PUBLIC']),
    packId: z.string().nullable(),
    version: z.string().nullable(),
    activatedAt: z.string().nullable(),
    /** The rule revision the live version contains (null when not public). */
    liveRevision: z.number().nullable(),
    /** SUSPENDED only: every rule of the version whose research no longer holds. */
    suspendedRules: z.array(suspendedBuilderRuleSchema),
  })
  .meta({ id: 'RulePublicStatus', title: 'RulePublicStatus' });

/**
 * What the next builder version would contain if this rule's current revision were verified now
 * (audit BLD-03): nothing is silently dropped from public use.
 */
export const builderPublicationPreviewSchema = z
  .object({
    nextVersion: z.string(),
    included: z.array(z.object({ ruleId: z.string(), revision: z.number() })),
    withheld: z.array(
      z.object({
        ruleId: z.string(),
        revision: z.number(),
        /** NOT_VERIFIED, NOT_READY, EVIDENCE_CHANGED or VERIFIER_NOT_AUTHORIZED. */
        reason: z.string(),
      }),
    ),
    /** Rules the active version contains that the next version would leave out. */
    removedFromPublic: z.array(z.string()),
  })
  .meta({ id: 'BuilderPublicationPreview', title: 'BuilderPublicationPreview' });

export const ruleVerificationStatusResponseSchema = z
  .object({
    ruleId: z.string(),
    marjaId: z.string(),
    currentRevision: z.number(),
    /** Whether the CURRENT revision is source-verified (and its ruling content unchanged). */
    currentVerified: z.boolean(),
    /** Informational: whether you may verify (the server decides again on the command). */
    canVerify: z.boolean(),
    /** Everything that blocks verifying the current revision now (empty: it may be verified). */
    blockers: z.array(verificationBlockerSchema),
    /** Every verification of this rule, oldest first. */
    history: z.array(ruleVerificationSchema),
    publicStatus: rulePublicStatusSchema,
    /** Preview of the next version (null while verification is blocked or not needed). */
    preview: builderPublicationPreviewSchema.nullable(),
  })
  .meta({ id: 'RuleVerificationStatusResponse', title: 'RuleVerificationStatusResponse' });

export const builderPublicationSchema = z
  .object({
    marjaId: z.string(),
    /** The active (public) builder pack version, or null. */
    active: z
      .object({
        packId: z.string(),
        version: z.string(),
        contentDigest: z.string(),
        activatedAt: z.string(),
        /** Builder rule ids the version includes (all source-verified). */
        ruleIds: z.array(z.string()),
        /** True while research a rule of the version rests on no longer holds (not served). */
        suspended: z.boolean(),
        suspendedRules: z.array(suspendedBuilderRuleSchema),
      })
      .nullable(),
    /** Every builder pack version of the Marja with its governance state. */
    versions: z.array(z.object({ version: z.string(), state: z.string(), activated: z.boolean() })),
  })
  .meta({ id: 'BuilderPublication', title: 'BuilderPublication' });

export const builderPublicationListResponseSchema = z
  .object({ marjas: z.array(builderPublicationSchema) })
  .meta({ id: 'BuilderPublicationListResponse', title: 'BuilderPublicationListResponse' });

export const ruleVerificationResponseSchema = z
  .object({
    verification: ruleVerificationSchema,
    status: ruleVerificationStatusResponseSchema,
  })
  .meta({ id: 'RuleVerificationResponse', title: 'RuleVerificationResponse' });

export type VerifyScholarRuleRequest = z.infer<typeof verifyScholarRuleRequestSchema>;
export type RuleVerificationView = z.infer<typeof ruleVerificationSchema>;
export type VerificationBlockerView = z.infer<typeof verificationBlockerSchema>;
export type RulePublicStatus = z.infer<typeof rulePublicStatusSchema>;
export type SuspendedBuilderRule = z.infer<typeof suspendedBuilderRuleSchema>;
export type BuilderPublicationPreview = z.infer<typeof builderPublicationPreviewSchema>;
export type RuleVerificationStatusResponse = z.infer<typeof ruleVerificationStatusResponseSchema>;
export type BuilderPublication = z.infer<typeof builderPublicationSchema>;
export type BuilderPublicationListResponse = z.infer<typeof builderPublicationListResponseSchema>;
export type RuleVerificationResponse = z.infer<typeof ruleVerificationResponseSchema>;

// ---- Scholar requests (Phase 4): missing rules and calculation changes ----

export const ruleRequestParamsSchema = z
  .strictObject({ requestId: uuidV7Schema })
  .meta({ id: 'RuleRequestParams', title: 'RuleRequestParams' });

export const createRuleRequestRequestSchema = z
  .strictObject({
    marjaId: researchMarjaIdSchema,
    kind: z.enum(RULE_REQUEST_KINDS),
    ruleId: uuidV7Schema.nullable(),
    message: ruleRequestMessageSchema,
  })
  .meta({ id: 'CreateRuleRequestRequest', title: 'CreateRuleRequestRequest' });

export const resolveRuleRequestRequestSchema = z
  .strictObject({ note: ruleRequestNoteSchema })
  .meta({ id: 'ResolveRuleRequestRequest', title: 'ResolveRuleRequestRequest' });

export const ruleRequestResponseSchema = z
  .object({
    requestId: z.string(),
    marjaId: z.string(),
    kind: z.enum(RULE_REQUEST_KINDS),
    ruleId: z.string().nullable(),
    message: z.string(),
    actor: z.string(),
    at: z.string(),
    resolution: z.object({ note: z.string(), actor: z.string(), at: z.string() }).nullable(),
  })
  .meta({ id: 'RuleRequestResponse', title: 'RuleRequestResponse' });

export const ruleRequestListResponseSchema = z
  .object({
    marjaId: z.string(),
    /** Informational: whether you may add a request or resolve one (the server decides). */
    canCreate: z.boolean(),
    canResolve: z.boolean(),
    /** Newest first. */
    requests: z.array(ruleRequestResponseSchema),
  })
  .meta({ id: 'RuleRequestListResponse', title: 'RuleRequestListResponse' });

export type RuleRequestParams = z.infer<typeof ruleRequestParamsSchema>;
export type CreateRuleRequestRequest = z.infer<typeof createRuleRequestRequestSchema>;
export type ResolveRuleRequestRequest = z.infer<typeof resolveRuleRequestRequestSchema>;
export type RuleRequestResponse = z.infer<typeof ruleRequestResponseSchema>;
export type RuleRequestListResponse = z.infer<typeof ruleRequestListResponseSchema>;
