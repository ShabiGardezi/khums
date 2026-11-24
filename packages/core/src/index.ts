/**
 * @khums/core — public API.
 *
 * Application use cases composed from validation, marja-rules and calculation-engine. Web,
 * mobile and api call *this* package rather than wiring the lower layers themselves.
 * Persistence, auth and logging are injected via interfaces (ports); core never performs I/O.
 */
export type { MarjaSelection } from './marja/catalogue';
export {
  findMarjaCatalogueEntry,
  isMarjaCalculationAvailable,
  listMarjaCatalogue,
  NOT_LISTED_SELECTION,
  resolveMarjaSelection,
} from './marja/catalogue';
export type {
  AssessmentSelection,
  AssessmentWorkflowsAreExhaustive,
} from './onboarding/assessment';
export { ASSESSMENT_WORKFLOWS, resolveAssessmentSelection } from './onboarding/assessment';
export type {
  MarjaChoice,
  OnboardingIntent,
  OnboardingPolicy,
  OnboardingState,
  OnboardingSubmission,
} from './onboarding/flow';
export { advanceOnboarding, INITIAL_ONBOARDING_STATE, ONBOARDING_INTENTS } from './onboarding/flow';
export type {
  ExactDateResult,
  FactSheetCompleteness,
  FactSheetIssue,
} from './financial/fact-sheet';
export {
  describeFactCompleteness,
  factsOfKind,
  parseFinancialFactSheet,
  requireExactDate,
} from './financial/fact-sheet';
export type { FactDateField, FactKindsAreExhaustive, FactSheetFrame } from './financial/fact-entry';
export {
  AMOUNT_INPUT_POLICY,
  currencyMinorUnits,
  FACT_CURRENCIES,
  FACT_DATE_FIELDS,
  FACT_KINDS,
  FACT_TEXT_LIMITS,
  factIssuesById,
  FINANCIAL_FACT_SUBTYPES,
  amountExceedsCurrencyPrecision,
  formatFactAmount,
  isNonNegativeDecimal,
  MAX_FACT_PERIODS,
  MAX_FACTS_PER_SHEET,
  validateFactInFrame,
  validateFactSheetFrame,
} from './financial/fact-entry';
export {
  buildFactSheetExport,
  factSheetExportFileName,
  parseFactSheetExport,
  serializeFactSheetExport,
} from './financial/export';
export { prepareAssessmentInput } from './financial/prepare-input';
export type {
  EntryCoverage,
  EntryCoverageError,
  EntryCoverageMap,
  EntryCoverageStatus,
} from './financial/entry-coverage';
export {
  describeEntryCoverage,
  describeVerifiedEntryCoverage,
  entryCoverageFor,
  verifiedBundleWorkflows,
} from './financial/entry-coverage';
export type { AssessmentRun, VerifiedAssessmentRun } from './financial/run-assessment';
export { runDevelopmentAssessment, runVerifiedAssessment } from './financial/run-assessment';
/**
 * Rule-pack content integrity (FR-1). Pure and synchronous: the same implementation serves the
 * API, web and mobile. The digest is always recomputed; declared values are only compared.
 */
export {
  checkApprovalEligibility,
  checkPublicationEligibility,
  computeRulePackIntegrity,
  RULE_PACK_CANONICALIZATION,
  RULE_PACK_INTEGRITY_SCOPE,
  sealRulePack,
} from '@khums/calculation-engine';
/**
 * Rule-pack governance (M4.4.3): append-only, hash-chained ledger; lifecycle derived by replay;
 * reviewer/approver separation; integrity-bound publication and activation. Since M4.6.1 every
 * state change goes through `executeGovernanceCommand`, which authorizes first. No persistence
 * (FR-3 storage); no authentication provider yet (FR-2 partly open).
 */
export * from './governance';
/**
 * Centralized authorization (M4.6.1): permission catalogue, role matrix and the pure evaluator.
 * Principals are established only through `@khums/core/trusted-principal` (API only).
 */
export * from './authorization';
/**
 * Persistence foundation (M4.6.3a): append-only audit chain (derived head, idempotent bounded
 * retries) and signed integrity checkpoints. Pure: storage and cryptography are ports.
 */
export * from './persistence';
/**
 * Staff credentials and administration rules (M4.6.2b): username normalization, password policy,
 * role grants with Marja scopes (only SUPER_ADMIN and SCHOLAR are grantable, decision 64), no
 * self-administration, no last-SUPER_ADMIN lockout, administrative-control setting.
 */
export * from './staff';
/** Provisional scholar-review track (M4.5a): never religious guidance. */
export * from './research';
/**
 * Scholar rule builder (Phase 2 steps 3–4): validation, developer-requirement check against the
 * engine capability table, compilation into pack data, staff-only provisional test runs.
 */
export * from './rule-builder';
/** Decision 83: inflation from an official monthly price index (data supplied by the caller). */
export {
  cpiInflation,
  CPI_PERCENT_SCALE,
  type CpiInflation,
  type CpiInflationError,
  type CpiSeries,
} from './inflation/cpi';
/** Browser-only calculation history (decisions 65, 71): pure helpers; storage lives in the app. */
export type {
  SavedCalculationDetails,
  SavedHistoryRead,
  SavedPackRef,
} from './history/saved-calculations';
export {
  addSavedCalculation,
  answersForRecalculation,
  emptySavedHistory,
  isEditableSavedCalculation,
  isSameSavedPack,
  noSavedAnswers,
  parseSavedHistory,
  removeSavedCalculation,
  renameSavedCalculation,
  savedAnswersToReuse,
  savedCalculationFromReport,
  serializeSavedHistory,
} from './history/saved-calculations';
export type {
  LegacySavedCalculation,
  SavedCalculation,
  SavedCalculationHistory,
  SavedFigure,
  SavedHistoryEntry,
  SavedResultSection,
} from '@khums/validation';
export { MAX_SAVED_CALCULATIONS, MAX_SAVED_LABEL_LENGTH } from '@khums/validation';
