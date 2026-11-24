import { z } from 'zod';

import type { FinancialFactKind } from '@khums/shared-types';

import { decimalStringSchema } from '../decimal';
import { currencyCodeSchema, FINANCIAL_FACT_SUBTYPES } from '../financial/facts';
import { researchMarjaIdSchema, uuidV7Schema } from '../research/common';

/**
 * Scholar rule builder (Phase 2 steps 3–4; docs/PHASE2_PLAN.md "Rule builder design").
 *
 * A builder rule is a set of PREDEFINED fields a scholar fills in: no code, scripts, expressions
 * or rule language. The values are exactly what the scholar entered; nothing here states, defaults
 * or suggests any ruling, rate, threshold or exemption. `@khums/core` checks a rule against the
 * engine's capability table and compiles complete rules into a fixed program template.
 */

/** Khums categories a builder rule can describe (one category per rule). */
export const BUILDER_CATEGORIES = [
  /** Annual surplus of income. */
  'ANNUAL_SURPLUS',
  'MINED_PRODUCT',
  'TREASURE',
  'DIVING_GEMS',
  /** Lawful wealth mixed with unlawful wealth. */
  'MIXED_FUNDS',
] as const;
export type BuilderCategory = (typeof BUILDER_CATEGORIES)[number];

/** Predefined deduction types; the scholar chooses which entry subtypes each one covers. */
export const BUILDER_DEDUCTION_TYPES = [
  'LIVING_EXPENSES',
  'COSTS_OF_EARNING',
  'DEDUCTIBLE_DEBTS',
  /** Phase 4: the price paid for things still held at year end (counted at their own value). */
  'HOLDINGS_PURCHASES',
  /** Phase 4: the purchase cost of property sold (normally limited to the sale proceeds). */
  'COST_OF_ITEMS_SOLD',
  /**
   * Khums already paid on this khums year's income during the year: subtracted from the amount
   * due (after the rate), never below zero. Never limited to named entries.
   */
  'KHUMS_ALREADY_PAID',
  /**
   * Phase 4 (decision 78): a value already taxed (or not liable) at the start of the khums year,
   * entered as the same item's value dated on or before the year's start; always limited to the
   * counted entries it measures (e.g. a rise in trading stock is the year-end value minus it).
   */
  'PREVIOUSLY_TAXED_VALUE',
  /**
   * Phase 4 (decision 78): a principal already taxed at the start of the year whose inflation
   * alone (inflation ONLY) reduces the counted entries it is limited to (e.g. a deposit's profit).
   */
  'TAXED_PRINCIPAL',
  /** Phase 4 (decision 78): money held at the year end that a confirmation exempts. */
  'EXEMPT_SAVINGS',
] as const;
export type BuilderDeductionType = (typeof BUILDER_DEDUCTION_TYPES)[number];

export const BUILDER_CONDITION_SCOPES = [
  /** Asked once for every matching entry. */
  'ENTRY',
  /** Asked once for the whole calculation. */
  'CALCULATION',
] as const;
export type BuilderConditionScope = (typeof BUILDER_CONDITION_SCOPES)[number];

/**
 * What a "yes" answer does. Decision 82: `COUNT_AS` (per entry only) counts the entry the way
 * its `treatment` states (an asked amount, an inflation figure, a portion, or a direct share of
 * khums) instead of at its entered value.
 */
export const BUILDER_CONDITION_EFFECTS = [
  'INCLUDE',
  'EXCLUDE',
  'STOP_FOR_REVIEW',
  'COUNT_AS',
] as const;
export type BuilderConditionEffect = (typeof BUILDER_CONDITION_EFFECTS)[number];

export const BUILDER_THRESHOLD_EFFECTS = ['NOT_COUNTED', 'STOP_FOR_REVIEW'] as const;
export type BuilderThresholdEffect = (typeof BUILDER_THRESHOLD_EFFECTS)[number];

/** Which amount the minimum is compared with. */
export const BUILDER_THRESHOLD_BASES = ['BEFORE_DEDUCTIONS', 'AFTER_DEDUCTIONS'] as const;
export type BuilderThresholdBasis = (typeof BUILDER_THRESHOLD_BASES)[number];

/**
 * Needs the scholar can declare although the engine may not support them yet (checkboxes). Any
 * flag set makes the rule DEVELOPER_IMPLEMENTATION_REQUIRED.
 */
export const BUILDER_REQUIREMENT_FLAGS = [
  'DATES_OR_TIMING',
  'MARKET_VALUE_OR_INFLATION',
  'LINKED_ENTRIES',
  'PROPORTIONAL_SPLIT',
  'CARRY_OVER',
  'CURRENCY_CONVERSION',
  'FIRST_TIME_OR_MISSED_YEAR',
  'OTHER',
] as const;
export type BuilderRequirementFlag = (typeof BUILDER_REQUIREMENT_FLAGS)[number];

export const BUILDER_TEXT_LIMITS = {
  conditionLabel: 300,
  otherRequirement: 1000,
  notes: 2000,
  reason: 500,
} as const;

const FACT_KINDS = Object.keys(FINANCIAL_FACT_SUBTYPES) as FinancialFactKind[];

/** One entry type: a financial fact kind and one of its predefined subtypes. */
export const builderEntryRefSchema = z
  .strictObject({
    kind: z.enum(FACT_KINDS as [FinancialFactKind, ...FinancialFactKind[]]),
    subtype: z.string().min(1).max(40),
  })
  .refine((ref) => (FINANCIAL_FACT_SUBTYPES[ref.kind] as readonly string[]).includes(ref.subtype), {
    message: 'Unknown subtype for this kind',
    path: ['subtype'],
  });
export type BuilderEntryRef = z.infer<typeof builderEntryRefSchema>;

const entryList = (max: number) => z.array(builderEntryRefSchema).max(max);

export const builderDeductionSchema = z.strictObject({
  type: z.enum(BUILDER_DEDUCTION_TYPES),
  entries: entryList(40).min(1),
  /**
   * Phase 4: when present, the deduction may only reduce these counted entries (never below
   * zero): e.g. business costs reduce business income only, so a business loss never offsets
   * salary. Absent: it reduces the rule's whole counted amount (earlier revisions keep their hash).
   */
  against: entryList(40).min(1).exactOptional(),
  /**
   * Phase 4 (decision 78): each entry also takes the person's own inflation figure (a percentage,
   * never fetched). ADDED: the deducted amount is the entry plus its inflation; ONLY: only the
   * inflation on the entry is deducted (e.g. a principal whose inflation reduces its profit).
   */
  inflation: z.enum(['ADDED', 'ONLY']).exactOptional(),
  /**
   * Phase 4 (decision 78): entries dated up to this many days after the khums year end also count
   * (with the same confirmations); otherwise entries must be dated within the khums year.
   */
  afterYearEndDays: z.int().min(1).max(31).exactOptional(),
});
export type BuilderDeduction = z.infer<typeof builderDeductionSchema>;

const askedLabel = z.string().trim().min(3).max(BUILDER_TEXT_LIMITS.conditionLabel);

/**
 * Decision 82: how a `COUNT_AS` entry is counted. Every number is the scholar's: nothing here
 * states or defaults any amount, percentage or share.
 */
export const builderTreatmentSchema = z
  .strictObject({
    /** ENTRY: the entered value; ASKED: a per-entry amount question in the scholar's wording. */
    amount: z.enum(['ENTRY', 'ASKED']),
    askedLabel: askedLabel.exactOptional(),
    /** The amount plus the person's inflation figure (pre-filled from official data). */
    inflation: z.literal('ADDED').exactOptional(),
    /** Only a portion of the amount: a fixed percentage, or one the person states. */
    portion: z
      .union([
        z.strictObject({
          fixedPercent: decimalStringSchema.refine((v) => !v.startsWith('-'), 'Not negative'),
        }),
        z.strictObject({ askedLabel }),
      ])
      .exactOptional(),
    /**
     * The entry's khums is this fraction of the amount, added to the khums due directly
     * (rounded to the currency's minor unit, half up: owner decision 2026-11-24) instead of the
     * amount being counted.
     */
    khumsShare: z
      .strictObject({
        numerator: z.int().min(1).max(1_000),
        denominator: z.int().min(1).max(1_000_000),
      })
      .exactOptional(),
  })
  .refine((t) => (t.amount === 'ASKED') === (t.askedLabel !== undefined), {
    message: 'An asked amount needs its question wording (and only then)',
    path: ['askedLabel'],
  });
export type BuilderTreatment = z.infer<typeof builderTreatmentSchema>;

export const builderConditionSchema = z.strictObject({
  scope: z.enum(BUILDER_CONDITION_SCOPES),
  /** The scholar's own wording of the yes/no confirmation. */
  label: z.string().trim().min(3).max(BUILDER_TEXT_LIMITS.conditionLabel),
  effect: z.enum(BUILDER_CONDITION_EFFECTS),
  /**
   * ENTRY scope: the entry types it is asked for (empty = every included entry). Phase 4: may also
   * name deduction entries (e.g. a confirmation about spending or a debt).
   */
  entries: entryList(60),
  /**
   * Phase 4 (decision 78): asked for the entries' values at the start of the year (a
   * PREVIOUSLY_TAXED_VALUE deduction) instead of their year-end entries.
   */
  openingValues: z.literal(true).exactOptional(),
  /** Decision 82: required with (and only with) the COUNT_AS effect. */
  treatment: builderTreatmentSchema.exactOptional(),
});
export type BuilderCondition = z.infer<typeof builderConditionSchema>;

export const builderThresholdSchema = z.strictObject({
  amount: decimalStringSchema,
  currency: currencyCodeSchema,
  basis: z.enum(BUILDER_THRESHOLD_BASES),
  effect: z.enum(BUILDER_THRESHOLD_EFFECTS),
});
export type BuilderThreshold = z.infer<typeof builderThresholdSchema>;

/**
 * The scholar-entered content of one builder rule. Incomplete content (no ruling, sources, rate
 * or entries yet) may be saved as a draft; `@khums/core` reports what is missing.
 */
export const builderRuleContentSchema = z.strictObject({
  category: z.enum(BUILDER_CATEGORIES),
  /** An existing research RULING (entity id) of the same Marja; null while a draft. */
  rulingId: uuidV7Schema.nullable(),
  /** Percentage as a decimal string, only for categories whose template takes a rate. */
  rate: decimalStringSchema.nullable(),
  includedEntries: entryList(100),
  deductions: z.array(builderDeductionSchema).max(BUILDER_DEDUCTION_TYPES.length),
  conditions: z.array(builderConditionSchema).max(150),
  exceptions: entryList(60),
  threshold: builderThresholdSchema.nullable(),
  /** Research SOURCE or PASSAGE entity ids of the same Marja. */
  sourceRefs: z.array(uuidV7Schema).max(200),
  requirementFlags: z
    .array(z.enum(BUILDER_REQUIREMENT_FLAGS))
    .max(BUILDER_REQUIREMENT_FLAGS.length),
  /** Required with the OTHER flag: the scholar's description of the need. */
  otherRequirement: z.string().trim().min(3).max(BUILDER_TEXT_LIMITS.otherRequirement).nullable(),
  notes: z.string().trim().min(1).max(BUILDER_TEXT_LIMITS.notes).nullable(),
  /**
   * Phase 4 (decision 78): an assessment period longer than any calendar year (more than 366
   * days) stops this rule for review.
   */
  periodLongerThanAYear: z.literal('STOP_FOR_REVIEW').exactOptional(),
});
export type BuilderRuleContent = z.infer<typeof builderRuleContentSchema>;

/** Why a revision was saved (every save is a new audited revision). */
export const builderReasonSchema = z.string().trim().min(3).max(BUILDER_TEXT_LIMITS.reason);

/**
 * AI preparation of a revision (Phase 4, decision 76). `APPROVED_FOR_SCHOLAR_TESTING` is an AI
 * technical status: the rule was researched, implemented and technically tested by AI and may be
 * used in the staff scholar-testing calculator. It is never religious approval or verification:
 * the rule stays UNVERIFIED and staff-only until an authorised scholar verifies it.
 */
export const BUILDER_AI_STAGES = ['DRAFT', 'APPROVED_FOR_SCHOLAR_TESTING'] as const;
export type BuilderAiStage = (typeof BUILDER_AI_STAGES)[number];

/** The fixed wording shown with every AI-approved rule (never shortened to "approved"). */
export const AI_APPROVED_FOR_SCHOLAR_TESTING_LABEL =
  'Approved for scholar testing by AI — not verified by a scholar';

export const builderAiPreparationSchema = z.strictObject({
  stage: z.enum(BUILDER_AI_STAGES),
  /** The AI tool or model that prepared the revision. */
  tool: z.string().trim().min(1).max(100),
  /** What was technically tested (scenario ids or a short description). */
  tests: z.string().trim().min(1).max(BUILDER_TEXT_LIMITS.notes).nullable(),
});
export type BuilderAiPreparation = z.infer<typeof builderAiPreparationSchema>;

/**
 * One stored revision (`scholarRuleRevisions`, append-only). `rulingVersion` is resolved by the
 * server from the research store when the revision is saved (never sent by the client).
 */
export const scholarRuleRevisionSchema = z.strictObject({
  ruleId: uuidV7Schema,
  revision: z.int().min(0).max(10_000),
  marjaId: researchMarjaIdSchema,
  content: builderRuleContentSchema,
  rulingVersion: z.int().min(1).max(99_999).nullable(),
  actor: z.string().min(1).max(200),
  at: z.iso.datetime({ offset: false }),
  reason: builderReasonSchema,
  /** Present when AI prepared this revision (Phase 4; absent in earlier revisions). */
  aiPreparation: builderAiPreparationSchema.exactOptional(),
  /** Present when a scholar rejected the rule with this revision (Phase 4). */
  rejected: z.literal(true).exactOptional(),
});
export type ScholarRuleRevision = z.infer<typeof scholarRuleRevisionSchema>;

// ---- Source verification (Phase 2 step 5, decisions 63 and 67) ----

/**
 * The four explicit attestations of a source verification. Each must be `true`: the authorized
 * scholar (or a SUPER_ADMIN) confirms it personally for the exact rule revision. Never set by AI
 * or by automated checks (REVIEW_PROCESS §17.4).
 */
export const RULE_VERIFICATION_ATTESTATIONS = [
  /** The cited sources are authentic (edition and authority) and correctly cited. */
  'sourcesAuthentic',
  /** The original-language text matches the cited sources exactly. */
  'originalTextMatches',
  /** Every translation used is accurate. */
  'translationAccurate',
  /** The attribution of the ruling to this Marja is correct. */
  'attributionCorrect',
] as const;
export type RuleVerificationAttestation = (typeof RULE_VERIFICATION_ATTESTATIONS)[number];

export const ruleVerificationAttestationsSchema = z.strictObject({
  sourcesAuthentic: z.literal(true),
  originalTextMatches: z.literal(true),
  translationAccurate: z.literal(true),
  attributionCorrect: z.literal(true),
});
export type RuleVerificationAttestations = z.infer<typeof ruleVerificationAttestationsSchema>;

/** Optional notes of the verifier (no personal data, no financial values). */
export const ruleVerificationNotesSchema = z.string().trim().min(1).max(2000).nullable();

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * One stored source verification (`ruleVerificationRecords`, append-only). It binds exactly one
 * builder rule revision (rule id + revision + content hash) and the ruling content it was made
 * against; a later revision, or a changed ruling, is unverified until verified again.
 * `publication` names the builder pack version the verification produced (same unit of work).
 */
export const ruleVerificationRecordSchema = z.strictObject({
  verificationId: uuidV7Schema,
  ruleId: uuidV7Schema,
  revision: z.int().min(0).max(10_000),
  marjaId: researchMarjaIdSchema,
  /** SHA-256 (khums-jcs-1) of the verified revision (`ruleRevisionContentHash`). */
  contentHash: sha256Hex,
  /** `<ruling id>@<version>` the revision cites. */
  rulingRef: z.string().min(1).max(200),
  /** Record digest of the ruling's content record at verification time. */
  rulingContentDigest: sha256Hex,
  attestations: ruleVerificationAttestationsSchema,
  notes: ruleVerificationNotesSchema,
  /** The verifier: a server-established staff principal id (never a system actor). */
  actor: z.string().min(1).max(200),
  at: z.iso.datetime({ offset: false }),
  reason: builderReasonSchema,
  decisionId: z.string().min(1).max(200),
  publication: z.strictObject({
    packId: z.string().min(1).max(100),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    contentDigest: sha256Hex,
  }),
});
export type RuleVerificationRecord = z.infer<typeof ruleVerificationRecordSchema>;

// ---- Scholar requests (Phase 4): missing rules and calculation changes ----

/** What a scholar asks for: a rule that does not exist yet, or a change to how one calculates. */
export const RULE_REQUEST_KINDS = ['MISSING_RULE', 'CALCULATION_CHANGE'] as const;
export type RuleRequestKind = (typeof RULE_REQUEST_KINDS)[number];

/** Request text: plain, bounded; never logged or audited (like feedback). */
export const ruleRequestMessageSchema = z.string().trim().min(3).max(5000);
export const ruleRequestNoteSchema = z.string().trim().min(3).max(2000);

/**
 * One stored record (`scholarRuleRequests`, append-only): a request, or the single resolution of
 * a request. Nothing is overwritten; a request is resolved by a second record.
 */
export const ruleRequestRecordSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('REQUEST'),
    requestId: uuidV7Schema,
    marjaId: researchMarjaIdSchema,
    kind: z.enum(RULE_REQUEST_KINDS),
    /** The builder rule a calculation change concerns, or null. */
    ruleId: uuidV7Schema.nullable(),
    message: ruleRequestMessageSchema,
    actor: z.string().min(1).max(200),
    at: z.iso.datetime({ offset: false }),
  }),
  z.strictObject({
    type: z.literal('RESOLUTION'),
    requestId: uuidV7Schema,
    marjaId: researchMarjaIdSchema,
    note: ruleRequestNoteSchema,
    actor: z.string().min(1).max(200),
    at: z.iso.datetime({ offset: false }),
  }),
]);
export type RuleRequestRecord = z.infer<typeof ruleRequestRecordSchema>;
