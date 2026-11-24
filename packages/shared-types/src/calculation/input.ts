import type { CurrencyCodeString, DecimalString, IsoDate } from './primitives';

/** One amount the user records under a rule-pack input category. */
export interface FinancialEntry {
  readonly id: string;
  readonly categoryId: string;
  /** Non-negative decimal string in the assessment currency. */
  readonly amount: DecimalString;
  /** Required for period-based workflows (annual, missed-year). */
  readonly date: IsoDate | null;
  readonly description: string | null;
  /**
   * Phase 4 (decision 78): set by a pack's fact mapping only. The engine counts the entry in its
   * category as `amount × (100 + percent) ÷ 100` (`ADD_PERCENT`) or `amount × percent ÷ 100`
   * (`PERCENT`), exactly; the entry's own amount is never changed.
   */
  readonly adjustment?: EntryAdjustment;
  /**
   * Decision 82: percentages applied in order (never together with `adjustment`), each exactly
   * as `adjustment` is.
   */
  readonly adjustments?: readonly EntryAdjustment[];
}

export interface EntryAdjustment {
  readonly mode: 'ADD_PERCENT' | 'PERCENT';
  /** Non-negative decimal string (a percentage). */
  readonly percent: DecimalString;
}

export interface AssessmentPeriod {
  readonly start: IsoDate;
  readonly end: IsoDate;
}

/** Answers to rule-pack questions, keyed by question id. */
export type Answers = Readonly<Record<string, boolean | string>>;

/**
 * Missed-year assessments: the answers of EACH year, keyed by the fact sheet's period id
 * (decision 62). A year's answers are never reused for another year; a year with no entry here
 * has no answers (questions it needs are reported as missing, never defaulted).
 */
export type YearAnswers = Readonly<Record<string, Answers>>;

export type Workflow = 'annual' | 'first-time' | 'missed-year';

/** Regular annual assessment for one Khums year (period defined by the user). */
export interface AnnualAssessmentInput {
  readonly workflow: 'annual';
  readonly currency: CurrencyCodeString;
  readonly period: AssessmentPeriod;
  readonly entries: readonly FinancialEntry[];
  readonly answers: Answers;
}

/** First-time assessment of holdings as of an assessment date. */
export interface FirstTimeAssessmentInput {
  readonly workflow: 'first-time';
  readonly currency: CurrencyCodeString;
  readonly assessmentDate: IsoDate;
  readonly entries: readonly FinancialEntry[];
  readonly answers: Answers;
}

export interface MissedYearInput {
  readonly period: AssessmentPeriod;
  readonly entries: readonly FinancialEntry[];
  readonly answers: Answers;
}

/** Historical / missed-year assessment: one or more past periods, in order. */
export interface MissedYearAssessmentInput {
  readonly workflow: 'missed-year';
  readonly currency: CurrencyCodeString;
  readonly assessmentDate: IsoDate;
  readonly years: readonly MissedYearInput[];
}

export type AssessmentInput =
  AnnualAssessmentInput | FirstTimeAssessmentInput | MissedYearAssessmentInput;
