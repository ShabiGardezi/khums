import type { AssessmentPeriod, Workflow } from './input';
import type { DecimalString, MoneyAmount, RoundingMode } from './primitives';
import type { ReleaseChannel, RulePackStatus } from './rule-pack';

/**
 * - `production`: governed, activated production packs only (authoritative results).
 * - `scholar-review`: scholar-review channel packs only; results are PROVISIONAL (M4.5a).
 * - `development`: mock fixtures for engineering only; results are MOCK.
 */
export type CalculationMode = 'production' | 'scholar-review' | 'development';

export type IssueSeverity = 'error' | 'warning';

/** Stable, machine-readable issue codes. Apps map codes to localized messages. */
export type CalculationIssueCode =
  // Rule-pack structure (always errors)
  | 'PACK_INVALID_METADATA'
  | 'PACK_DUPLICATE_ID'
  | 'PACK_UNKNOWN_SOURCE'
  | 'PACK_UNKNOWN_RULE'
  | 'PACK_INVALID_PARAMETER_VALUE'
  | 'PACK_INVALID_QUESTION'
  | 'PACK_MOCK_CANNOT_BE_APPROVED'
  | 'PROGRAM_DUPLICATE_STEP'
  | 'PROGRAM_UNKNOWN_STEP'
  | 'PROGRAM_FORWARD_REFERENCE'
  | 'PROGRAM_UNKNOWN_CATEGORY'
  | 'PROGRAM_UNKNOWN_PARAMETER'
  | 'PROGRAM_UNKNOWN_QUESTION'
  | 'PROGRAM_UNKNOWN_CONSULTATION'
  | 'PROGRAM_INVALID_ANSWER_VALUE'
  | 'PROGRAM_EMPTY_OPERANDS'
  | 'PROGRAM_KIND_MISMATCH'
  | 'PROGRAM_INVALID_ROUNDING'
  /** Decision 82: a divisor that is not a non-zero pack parameter. */
  | 'PROGRAM_INVALID_DIVISOR'
  | 'PROGRAM_UNKNOWN_OUTPUT_STEP'
  | 'PROGRAM_DUPLICATE_OUTPUT'
  | 'PROGRAM_OUTPUT_NOT_MONEY'
  | 'PROGRAM_NO_OUTPUTS'
  | 'PROGRAM_UNKNOWN_AGGREGATE_OUTPUT'
  /** Phase 4: a decimal question used in a condition, or a period condition outside annual. */
  | 'PROGRAM_INVALID_CONDITION'
  // Fact mapping structure (schemaVersion 2; always errors)
  | 'MAPPING_SCHEMA_VERSION'
  | 'MAPPING_DUPLICATE_RULE'
  | 'MAPPING_UNKNOWN_CATEGORY'
  | 'MAPPING_UNKNOWN_QUESTION'
  | 'MAPPING_UNKNOWN_CONSULTATION'
  | 'MAPPING_INVALID_ANSWER_VALUE'
  | 'MAPPING_UNKNOWN_WORKFLOW'
  | 'MAPPING_DATE_FIELD_NOT_IN_KIND'
  | 'MAPPING_DATE_REQUIRED'
  | 'MAPPING_OVERLAPPING_RULES'
  | 'MAPPING_UNKNOWN_SUBTYPE'
  | 'MAPPING_KIND_WITHOUT_SUBTYPE'
  | 'MAPPING_CATEGORY_NOT_IN_PROGRAM'
  | 'MAPPING_EXCLUDE_WITHOUT_RULE'
  | 'MAPPING_UNSUPPORTED_OPERATION'
  | 'MAPPING_UNSUPPORTED_VERSION'
  /** Phase 4: a date window outside the annual workflow, or an invalid window. */
  | 'MAPPING_INVALID_DATE_WINDOW'
  /** Phase 4: an amount adjustment whose question is not a per-fact decimal question. */
  | 'MAPPING_INVALID_ADJUSTMENT'
  // Production readiness (errors in production, warnings in development)
  | 'READINESS_MOCK_RULE_PACK'
  | 'READINESS_NOT_PUBLISHED'
  | 'READINESS_MISSING_SCHOLAR_APPROVAL'
  | 'READINESS_MISSING_APPROVER'
  | 'READINESS_APPROVAL_SEPARATION'
  | 'READINESS_MISSING_CONTENT_HASH'
  | 'READINESS_NOT_ACTIVATED'
  | 'READINESS_ACTIVATION_MISMATCH'
  | 'READINESS_ELEMENT_WITHOUT_RULE'
  | 'READINESS_RULE_NOT_APPROVED'
  | 'READINESS_RULE_WITHOUT_SOURCE'
  | 'READINESS_NOT_EFFECTIVE'
  // Content integrity (M4.4.2)
  | 'PACK_NOT_CANONICALIZABLE'
  | 'PACK_INTEGRITY_MALFORMED'
  | 'READINESS_INTEGRITY_UNSUPPORTED'
  | 'READINESS_INTEGRITY_MISMATCH'
  | 'READINESS_LEGACY_CONTENT_HASH'
  | 'READINESS_APPROVAL_NOT_BOUND'
  | 'READINESS_APPROVAL_STALE'
  | 'READINESS_ACTIVATION_STALE'
  | 'READINESS_NOT_APPROVED_STATUS'
  | 'READINESS_MAPPING_MISSING'
  /** A scholar-review channel pack can never be used, published or activated in production. */
  | 'READINESS_SCHOLAR_REVIEW_PACK'
  /** The pack's release channel does not match the calculation mode (strict separation). */
  | 'CHANNEL_MISMATCH'
  /** Scholar-review packs may contain only UNVERIFIED or APPROVED rules (never DRAFT). */
  | 'PROVISIONAL_RULE_STATUS'
  /** A MOCK pack can never be a scholar-review pack. */
  | 'STRUCTURE_MOCK_SCHOLAR_REVIEW'
  // Workflow
  | 'WORKFLOW_NOT_SUPPORTED'
  // Input validation
  | 'INPUT_UNSUPPORTED_CURRENCY'
  | 'INPUT_INVALID_DATE'
  | 'INPUT_INVALID_PERIOD'
  | 'INPUT_DUPLICATE_ENTRY_ID'
  | 'INPUT_UNKNOWN_CATEGORY'
  | 'INPUT_INVALID_AMOUNT'
  | 'INPUT_NEGATIVE_AMOUNT'
  | 'INPUT_ENTRY_MISSING_DATE'
  | 'INPUT_ENTRY_OUTSIDE_PERIOD'
  | 'INPUT_ENTRY_AFTER_ASSESSMENT_DATE'
  | 'INPUT_UNKNOWN_QUESTION'
  | 'INPUT_INVALID_ANSWER'
  | 'INPUT_MISSING_REQUIRED_ANSWER'
  | 'INPUT_NO_YEARS'
  | 'INPUT_YEARS_NOT_ORDERED'
  | 'INPUT_YEAR_AFTER_ASSESSMENT_DATE'
  | 'INPUT_UNUSED_CATEGORY';

export interface CalculationIssue {
  readonly code: CalculationIssueCode;
  readonly severity: IssueSeverity;
  /** Developer-facing English message (never shown as-is to end users). */
  readonly message: string;
  /** Location in the pack or input, e.g. `workflows.annual.steps.2.expression`. */
  readonly path: string | null;
}

export type ValueKind = 'money' | 'scalar';

export interface BreakdownStep {
  readonly stepId: string;
  readonly label: string;
  readonly ruleIds: readonly string[];
  /** Union of the cited rules' source references (traceability). */
  readonly sourceRefs: readonly string[];
  readonly kind: ValueKind;
  /** Exact value, or null when unresolved. */
  readonly value: DecimalString | null;
  readonly rounding: { readonly scale: number; readonly mode: RoundingMode } | null;
  /** Unresolved cases that prevented a value. */
  readonly unresolvedCaseIds: readonly string[];
}

export type UnresolvedKind = 'CONSULTATION_REQUIRED' | 'MISSING_ANSWER';

export interface UnresolvedCase {
  readonly id: string;
  readonly kind: UnresolvedKind;
  readonly label: string;
  readonly ruleIds: readonly string[];
  readonly questionId: string | null;
  readonly stepIds: readonly string[];
}

export interface CalculationOutputValue {
  readonly id: string;
  readonly label: string;
  /** Null when the output could not be calculated (see `unresolved`). */
  readonly value: MoneyAmount | null;
}

export type AssessmentStatus = 'COMPLETED' | 'UNRESOLVED';

export interface AssessmentResult {
  readonly status: AssessmentStatus;
  readonly outputs: readonly CalculationOutputValue[];
  readonly breakdown: readonly BreakdownStep[];
  readonly unresolved: readonly UnresolvedCase[];
}

export interface MissedYearResult {
  readonly period: AssessmentPeriod;
  readonly result: AssessmentResult;
}

/**
 * How complete a missed-year total is (engine 0.2.0; audit 2026-11-23 C5/T2):
 * - `COMPLETE`: every year resolved with no open item; the outputs are the full total.
 * - `PARTIAL`: every aggregated output resolved, but at least one year has an open item (a review,
 *   a settlement, a payment to reconcile, a missing answer). The outputs are the sum of what is
 *   known so far and are NEVER the amount due.
 * - `UNRESOLVED`: an aggregated output is missing in some year; no total is given.
 */
export type AggregateCompleteness = 'COMPLETE' | 'PARTIAL' | 'UNRESOLVED';

export interface MissedYearAggregate {
  /** `COMPLETED` only when `completeness` is `COMPLETE`. */
  readonly status: AssessmentStatus;
  readonly completeness: AggregateCompleteness;
  readonly outputs: readonly CalculationOutputValue[];
  readonly ruleIds: readonly string[];
  /** Zero-based indexes of the years whose result is not `COMPLETED`, in input order. */
  readonly openYearIndexes: readonly number[];
}

/**
 * - `APPROVED_RULE_PACK`: production mode with an activated, approved pack.
 * - `PROVISIONAL_SCHOLAR_REVIEW`: scholar-review mode; PROVISIONAL — FOR SCHOLAR REVIEW ONLY.
 * - `NOT_RELIGIOUS_GUIDANCE`: development (mock) calculations.
 * Only the first is guidance; the other two never are.
 */
export type GuidanceStatus =
  'APPROVED_RULE_PACK' | 'PROVISIONAL_SCHOLAR_REVIEW' | 'NOT_RELIGIOUS_GUIDANCE';

export interface CalculationMeta {
  readonly engineVersion: string;
  readonly mode: CalculationMode;
  /** Production + activated, approved pack → APPROVED_RULE_PACK; everything else is not guidance. */
  readonly guidance: GuidanceStatus;
  readonly disclaimer: string | null;
  readonly rulePack: {
    readonly packId: string;
    readonly marjaId: string;
    readonly version: string;
    readonly status: RulePackStatus;
    readonly isMock: boolean;
    /** The pack's release channel (schemaVersion 3), or null for schemaVersion 1–2 packs. */
    readonly releaseChannel: ReleaseChannel | null;
    readonly contentHash: string | null;
    /**
     * Digest recomputed from the pack content used for this calculation (`null` if the pack could
     * not be canonicalized). Traceability: identifies the exact content, whatever was declared.
     */
    readonly contentDigest: string | null;
  };
  readonly currency: string;
  /** Readiness and input warnings (development mode surfaces readiness gaps here). */
  readonly warnings: readonly CalculationIssue[];
}

export type CalculationReport =
  | {
      readonly workflow: 'annual' | 'first-time';
      readonly meta: CalculationMeta;
      readonly result: AssessmentResult;
    }
  | {
      readonly workflow: 'missed-year';
      readonly meta: CalculationMeta;
      readonly years: readonly MissedYearResult[];
      readonly aggregate: MissedYearAggregate | null;
    };

export type RefusalReason =
  'INVALID_RULE_PACK' | 'RULE_PACK_NOT_READY' | 'WORKFLOW_NOT_SUPPORTED' | 'INVALID_INPUT';

/** Returned instead of a report when the engine must not calculate. */
export interface CalculationRefusal {
  readonly reason: RefusalReason;
  readonly workflow: Workflow;
  readonly mode: CalculationMode;
  readonly issues: readonly CalculationIssue[];
}
