export type {
  Answers,
  AssessmentResult,
  BreakdownStep,
  FinancialEntry,
  Program,
  RulePack,
  UnresolvedCase,
} from '@khums/shared-types';

/** The parts of @khums/money's CurrencyInfo the engine needs. */
export interface CurrencyInfoLike {
  readonly code: string;
  readonly minorUnits: number;
}
