import type { FactDateFieldName, FinancialFactKind } from '../financial/facts';
import type { Answers, AssessmentInput, Workflow } from './input';
import type { DecimalString } from './primitives';

/**
 * Fact mapping (M4.4.1): how ONE rule pack reads neutral financial facts into its own input
 * categories. docs/research/RULE_PACK_STRUCTURE.md §5.7.
 *
 * - The mapping is part of the pack (rule-pack data, scholar-approved like every other rule). It
 *   is never shared between Maraje and has no defaults: every fact kind a pack accepts is named
 *   explicitly, and anything unmatched stops for consultation.
 * - It never changes the facts. Amounts are copied as the original decimal strings; nothing is
 *   rounded, converted or added up here (aggregation is the program's job).
 * - Missing, unknown, estimated and ranged amounts, and approximate or unknown dates, each have an
 *   explicit pack-defined handling: use (only where an approved rule allows it), ask the user
 *   (clarification) or stop (consultation). There is no implicit default.
 * - The vocabulary is provisional and non-authoritative (RULE_PACK_STRUCTURE §5.6). A ruling that
 *   cannot be expressed exactly is encoded as a consultation stop, never approximated.
 */

/** Version of the mapping language. Packs declare it; unsupported versions are refused. */
export type FactMappingVersion = 1;

/** Stops for consultation with a pack-defined consultation entry. */
export interface ConsultHandling {
  readonly handling: 'consult';
  readonly consultationId: string;
}

/** Asks the user to provide or correct the information (no value is assumed meanwhile). */
export interface ClarifyHandling {
  readonly handling: 'clarify';
}

/** Uses the stated value as entered (only where an approved rule allows it). */
export interface UseHandling {
  readonly handling: 'use';
}

/** How a pack treats each amount state. `KNOWN` amounts are always used as entered. */
export interface AmountPolicy {
  readonly estimated: UseHandling | ClarifyHandling | ConsultHandling;
  /** `use-min` / `use-max` copy one bound unchanged; they need an approved rule like any choice. */
  readonly range:
    | { readonly handling: 'use-min' }
    | { readonly handling: 'use-max' }
    | ClarifyHandling
    | ConsultHandling;
  readonly unknown: ClarifyHandling | ConsultHandling;
  readonly notProvided: ClarifyHandling | ConsultHandling;
}

/**
 * Which date of the fact becomes the engine entry's date, and how its states are treated.
 * `field: null` means no date is passed (only valid for workflows whose entries need no date).
 */
export interface DatePolicy {
  readonly field: FactDateFieldName | null;
  readonly approximate: UseHandling | ClarifyHandling | ConsultHandling;
  readonly unknown: ClarifyHandling | ConsultHandling;
  readonly notProvided: ClarifyHandling | ConsultHandling;
}

/** What a matched fact becomes. */
export type FactMappingAction =
  /** Contributes one entry to a pack input category. */
  | {
      readonly action: 'category';
      readonly categoryId: string;
      readonly amount: AmountPolicy;
      readonly date: DatePolicy;
      /**
       * Phase 4 (decision 78): the amount entered into the category is adjusted by this fact's
       * own answer to a `decimal` question (a percentage): `ADD_PERCENT` → amount × (100 + p) ÷ 100,
       * `PERCENT` → amount × p ÷ 100. Exact; an unanswered or invalid answer asks the user.
       */
      readonly adjust?: AmountAdjustment;
      /**
       * Decision 82: an ordered list of adjustments (never together with `adjust`). An `AMOUNT`
       * adjustment (first only) takes the fact's own answer as the entry amount; the others are
       * percentages applied in order by the engine when it totals the category.
       */
      readonly adjustments?: readonly AmountAdjustment[];
    }
  /**
   * The pack states that this fact feeds no category. Every exclusion carries its own
   * justification (≥ 1 rule; production: approved and sourced), separate from the mapping rule's.
   */
  | { readonly action: 'exclude'; readonly ruleIds: readonly string[] }
  /** Stop: this fact needs individual consultation. */
  | { readonly action: 'consult'; readonly consultationId: string }
  /**
   * Ask a pack question about this specific fact, then continue with the matching case.
   * An unanswered question produces a clarification request; an answer with no case stops for
   * the given consultation.
   */
  | {
      readonly action: 'ask';
      readonly questionId: string;
      readonly cases: readonly {
        readonly equals: boolean | string;
        readonly then: FactMappingAction;
      }[];
      readonly otherwise: ConsultHandling;
    };

export type AmountAdjustment =
  | { readonly questionId: string; readonly mode: 'ADD_PERCENT' | 'PERCENT' }
  /** Decision 82: the fact's own answer (a money amount) replaces the entered amount. */
  | { readonly questionId: string; readonly mode: 'AMOUNT' }
  /** Decision 82: a fixed percentage stated by the pack (no question). */
  | { readonly mode: 'FIXED_PERCENT'; readonly percent: DecimalString };

/**
 * Phase 4 (decision 78), annual workflow only: the fact's date (the kind's own date field, which
 * must be exact) relative to the assessment period. `IN_PERIOD`: start ≤ date ≤ end.
 * `BEFORE_START`: date < start (a value at the end of the previous khums year; the entry is
 * dated at the start). `AFTER_END`: end < date ≤ end + days (the entry is dated at the end).
 */
export type DateWindow =
  | { readonly window: 'IN_PERIOD' }
  | { readonly window: 'BEFORE_START' }
  | { readonly window: 'AFTER_END'; readonly days: number };

export interface FactMappingRule {
  readonly id: string;
  /** Rules that justify this mapping. Production requires ≥ 1 approved, sourced rule. */
  readonly ruleIds: readonly string[];
  readonly match: {
    readonly workflows: readonly Workflow[];
    readonly kinds: readonly FinancialFactKind[];
    /** Explicit subtypes of those kinds. There is no wildcard: every subtype must be named. */
    readonly subtypes: readonly string[];
    /** Phase 4: only facts dated in this window (annual only); windows never overlap. */
    readonly dated?: DateWindow;
  };
  readonly then: FactMappingAction;
}

export interface FactMapping {
  readonly mappingVersion: FactMappingVersion;
  /** Fact-sheet schema versions this mapping was written for. Others are refused. */
  readonly factSheetSchemaVersions: readonly 1[];
  /**
   * Mapping rules. At most one rule may match any (workflow, kind, subtype): overlaps are
   * rejected by structure validation, so rule order can never change an interpretation.
   */
  readonly rules: readonly FactMappingRule[];
  /** A fact no rule matches always stops for this consultation (never ignored, never guessed). */
  readonly unmatched: ConsultHandling;
  /**
   * Phase 4: a fact whose kind and subtype a dated rule names but whose date is in none of that
   * kind's windows stops here (otherwise the unmatched consultation applies).
   */
  readonly outOfPeriod?: ConsultHandling;
  /** Rules that justify the unmatched fallback and the mapping as a whole. */
  readonly ruleIds: readonly string[];
}

// ── Mapping execution results ──────────────────────────────────────────────────────────

export type MappingStatus =
  'MAPPED' | 'NEEDS_CLARIFICATION' | 'CONSULTATION_REQUIRED' | 'UNSUPPORTED';

export type ClarificationReason =
  | 'AMOUNT_ESTIMATED'
  | 'AMOUNT_RANGE'
  | 'AMOUNT_UNKNOWN'
  | 'AMOUNT_NOT_PROVIDED'
  | 'DATE_APPROXIMATE'
  | 'DATE_UNKNOWN'
  | 'DATE_NOT_PROVIDED'
  | 'QUESTION_UNANSWERED'
  /** The answer is not a valid value for the question (wrong type or not a declared choice). */
  | 'QUESTION_ANSWER_INVALID';

export interface ClarificationRequest {
  readonly factId: string;
  readonly reason: ClarificationReason;
  /** Set for `DATE_*` reasons. */
  readonly dateField: FactDateFieldName | null;
  /** Set for `QUESTION_*` reasons. */
  readonly questionId: string | null;
}

export interface MappingConsultation {
  /** `null` when the stop is not about one fact (e.g. an unsupported fact-sheet version). */
  readonly factId: string | null;
  readonly consultationId: string;
}

export type MappingUnsupportedCode =
  /** A fact is not in the sheet's currency; conversion is not supported (no exchange rates). */
  | 'CURRENCY_CONVERSION_UNSUPPORTED'
  | 'FACT_SHEET_VERSION_UNSUPPORTED'
  | 'MAPPING_VERSION_UNSUPPORTED'
  | 'MAPPING_NOT_DEFINED'
  | 'WORKFLOW_NOT_SUPPORTED'
  | 'INVALID_FACT_SHEET'
  | 'INVALID_RULE_PACK'
  /** Per-fact answers were given for a different fact, kind, subtype or workflow. */
  | 'FACT_ANSWERS_MISMATCH'
  /** Per-fact answers refer to a fact that is not in the sheet (e.g. stale answers). */
  | 'FACT_ANSWERS_UNKNOWN_FACT'
  /**
   * Assessment answers in the wrong scope (decision 62): shared answers for a missed-year sheet
   * (each year needs its own), per-year answers for another workflow, or per-year answers for a
   * period that is not in the sheet.
   */
  | 'ANSWERS_SCOPE_MISMATCH';

export interface MappingUnsupported {
  readonly factId: string | null;
  readonly code: MappingUnsupportedCode;
}

export type MappingOutcome =
  'ENTRY' | 'EXCLUDED' | 'CLARIFICATION' | 'CONSULTATION' | 'UNSUPPORTED';

/** One line per fact, in sheet order: what happened and why (inspectable, deterministic). */
export interface MappingTraceEntry {
  readonly factId: string;
  /** The mapping rule that matched (at most one can), or null when unmatched. */
  readonly mappingRuleId: string | null;
  readonly outcome: MappingOutcome;
  readonly categoryId: string | null;
  /** The amount passed to the engine, copied unchanged from the fact. */
  readonly amount: DecimalString | null;
  /** Rules cited: the mapping rule's, plus an exclusion's own justification when excluded. */
  readonly ruleIds: readonly string[];
  /** Questions answered on the way (per-fact `ask` actions). */
  readonly answeredQuestionIds: readonly string[];
}

export interface MappingResult {
  readonly status: MappingStatus;
  /** Engine input, only when every fact was mapped or excluded. */
  readonly input: AssessmentInput | null;
  readonly clarifications: readonly ClarificationRequest[];
  readonly consultations: readonly MappingConsultation[];
  readonly unsupported: readonly MappingUnsupported[];
  readonly trace: readonly MappingTraceEntry[];
  readonly pack: {
    readonly packId: string;
    readonly version: string;
    /** Digest recomputed from the pack content used (null if it could not be canonicalized). */
    readonly contentDigest: string | null;
    readonly mappingVersion: number | null;
  };
}

/**
 * Answers to pack questions about ONE fact. They are bound to the fact they were given for: the
 * workflow, kind and subtype must match the fact at mapping time, or mapping fails closed. This
 * stops answers being reused for another fact that happens to get the same id.
 */
export interface FactAnswerSet {
  readonly workflow: Workflow;
  readonly kind: FinancialFactKind;
  readonly subtype: string;
  readonly answers: Answers;
}

/** Per-fact answers, keyed by fact id. */
export type FactAnswers = Readonly<Record<string, FactAnswerSet>>;
