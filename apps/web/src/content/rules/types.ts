import type {
  BuilderCategory,
  BuilderConditionEffect,
  BuilderConditionScope,
  BuilderDeductionType,
  BuilderRequirementFlag,
  BuilderThresholdBasis,
  BuilderThresholdEffect,
  CapabilityCode,
  BuilderErrorCode,
  BuilderMissingCode,
  RuleVerificationAttestation,
  VerificationBlockerCode,
} from '@khums/core';
import type { ScholarRuleStatus } from '@khums/api-client';

/**
 * Scholar rule builder texts (Phase 2 steps 3–4). Placeholders in `{braces}`. Nothing here is a
 * ruling: the builder stores only what a scholar enters; the texts explain fields, statuses and
 * what the software can or cannot calculate yet.
 */
export type RuleRefusalKey =
  | 'RULING_NOT_FOUND'
  | 'RULING_NOT_CURRENT'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_NOT_CURRENT'
  | 'MARJA_NOT_SUPPORTED'
  | 'RECORD_INVALID'
  | 'NO_COMPILABLE_RULES'
  | 'ENTRY_CLAIMED_BY_SEVERAL_RULES'
  | 'SOURCE_UNRESOLVED'
  | 'REVISIONS_INVALID'
  | 'PACK_INVALID';

export interface RulesContent {
  readonly title: string;
  readonly description: string;
  /** Always shown: builder rules are proposals entered by scholars, not religious guidance. */
  readonly notice: string;
  readonly readOnly: string;
  /** AI preparation and rejection (Phase 4, decision 76). AI approval is never verification. */
  readonly preparation: {
    /** The fixed label of an AI-approved revision (`AI_APPROVED_FOR_SCHOLAR_TESTING_LABEL`). */
    readonly aiApproved: string;
    readonly aiDraft: string;
    readonly aiExplain: string;
    readonly tool: string;
    readonly tests: string;
    readonly rejected: string;
    readonly rejectedExplain: string;
    readonly rejectHeading: string;
    readonly rejectDescription: string;
    readonly rejectSubmit: string;
  };
  /** Scholar requests (Phase 4): missing rules and calculation changes. */
  readonly requests: {
    readonly heading: string;
    readonly description: string;
    readonly kind: string;
    readonly kinds: Readonly<Record<'MISSING_RULE' | 'CALCULATION_CHANGE', string>>;
    readonly rule: string;
    readonly ruleNone: string;
    readonly message: string;
    readonly submit: string;
    readonly empty: string;
    readonly open: string;
    readonly resolved: string;
    readonly resolution: string;
    readonly resolveNote: string;
    readonly resolveSubmit: string;
  };
  readonly marja: {
    readonly label: string;
    readonly names: { readonly sistani: string; readonly khamenei: string };
  };
  readonly statuses: Readonly<Record<ScholarRuleStatus, string>>;
  readonly list: {
    readonly heading: string;
    readonly empty: string;
    readonly category: string;
    readonly status: string;
    readonly revisions: string;
    readonly updated: string;
    readonly open: string;
  };
  readonly categories: Readonly<Record<BuilderCategory, string>>;
  readonly deductionTypes: Readonly<Record<BuilderDeductionType, string>>;
  readonly scopes: Readonly<Record<BuilderConditionScope, string>>;
  readonly effects: Readonly<Record<BuilderConditionEffect, string>>;
  readonly thresholdBases: Readonly<Record<BuilderThresholdBasis, string>>;
  readonly thresholdEffects: Readonly<Record<BuilderThresholdEffect, string>>;
  readonly flags: Readonly<Record<BuilderRequirementFlag, string>>;
  readonly form: {
    readonly createHeading: string;
    readonly reviseHeading: string;
    readonly create: string;
    readonly revise: string;
    readonly check: string;
    readonly checking: string;
    readonly category: string;
    readonly ruling: string;
    readonly rulingNone: string;
    readonly rulingHint: string;
    readonly rate: string;
    readonly rateHint: string;
    readonly included: string;
    readonly includedHint: string;
    readonly deductions: string;
    readonly deductionsHint: string;
    readonly deductionAgainst: string;
    readonly deductionAgainstHint: string;
    readonly deductionInflation: string;
    readonly deductionInflationNone: string;
    readonly deductionInflationAdded: string;
    readonly deductionInflationOnly: string;
    readonly deductionAfterDays: string;
    readonly deductionAfterDaysHint: string;
    readonly conditionOpening: string;
    /** Decision 82: how a "count it as" confirmation counts the entry (in words). */
    readonly treatmentEntered: string;
    readonly treatmentAsked: string;
    readonly treatmentInflation: string;
    readonly treatmentFixedPortion: string;
    readonly treatmentAskedPortion: string;
    readonly treatmentShare: string;
    readonly periodLongerThanAYear: string;
    readonly periodLongerThanAYearHint: string;
    readonly conditionEntries: string;
    readonly conditionEntriesHint: string;
    readonly exceptions: string;
    readonly exceptionsHint: string;
    readonly conditions: string;
    readonly conditionsHint: string;
    readonly condition: string;
    readonly conditionScope: string;
    readonly conditionLabel: string;
    readonly conditionEffect: string;
    readonly addCondition: string;
    readonly removeCondition: string;
    readonly threshold: string;
    readonly thresholdUse: string;
    readonly thresholdAmount: string;
    readonly thresholdCurrency: string;
    readonly thresholdBasis: string;
    readonly thresholdEffect: string;
    readonly sources: string;
    readonly sourcesHint: string;
    readonly noSources: string;
    readonly flags: string;
    readonly flagsHint: string;
    readonly otherRequirement: string;
    readonly notes: string;
    readonly optional: string;
  };
  readonly check: {
    readonly heading: string;
    readonly supported: string;
    readonly developerRequired: string;
    readonly developerRequiredBody: string;
    readonly missingHeading: string;
    readonly errorsHeading: string;
    readonly capabilities: Readonly<Record<CapabilityCode, string>>;
    readonly missing: Readonly<Record<BuilderMissingCode, string>>;
    readonly errors: Readonly<Record<BuilderErrorCode, string>>;
  };
  readonly detail: {
    readonly heading: string;
    readonly back: string;
    readonly ruleId: string;
    readonly current: string;
    readonly history: string;
    readonly revision: string;
    readonly by: string;
    readonly at: string;
    readonly reason: string;
    readonly rulingVersion: string;
    readonly content: string;
    readonly unknownPerson: string;
    readonly openSource: string;
  };
  readonly test: {
    readonly heading: string;
    readonly description: string;
    readonly currency: string;
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly entries: string;
    readonly entry: string;
    readonly entryType: string;
    readonly amount: string;
    readonly date: string;
    readonly addEntry: string;
    readonly removeEntry: string;
    readonly run: string;
    readonly running: string;
    readonly answers: string;
    readonly answerFor: string;
    readonly percentHint: string;
    /** Decision 82: an amount asked per entry. */
    readonly amountHint: string;
    /** Decision 83: pre-filling an inflation figure from official data. */
    readonly inflationFill: string;
    readonly inflationFilled: string;
    readonly inflationLatest: string;
    readonly inflationFell: string;
    readonly inflationUnavailable: string;
    readonly inflationNeedsDates: string;
    /** Date checks before a run (codes of `checkTestDates`). */
    readonly dateIssues: Readonly<Record<string, string>>;
    readonly fixDatesFirst: string;
    /** What an entry's date means, by its kind; `NONE` before a kind is chosen. */
    readonly dateMeaning: Readonly<
      Record<'NONE' | 'ASSET' | 'BALANCE' | 'INCOME' | 'EXPENSE' | 'LIABILITY', string>
    >;
    /** Answers the calculation still needs (highlighted). */
    readonly neededAnswers: string;
    readonly neededBadge: string;
    readonly runAgainAfterAnswers: string;
    readonly entryName: string;
    readonly reviewStopGeneric: string;
    readonly refusalText: string;
    readonly clarificationReasons: Readonly<Record<string, string>> & { readonly OTHER: string };
    readonly unanswered: string;
    readonly outcome: Readonly<Record<'CALCULATED' | 'NEEDS_REVIEW' | 'REFUSED', string>>;
    readonly pack: string;
    readonly compiled: string;
    readonly developerStop: string;
    readonly skipped: string;
    readonly skippedReasons: Readonly<Record<'INCOMPLETE' | 'INVALID' | 'REJECTED', string>>;
    /** Per compiled rule: its research ruling and cited sources (Phase 4). */
    readonly ruling: string;
    readonly sources: string;
    readonly noSources: string;
    readonly outputs: string;
    readonly breakdown: string;
    readonly notCalculated: string;
    readonly reviewStops: string;
    readonly clarifications: string;
    readonly refusal: string;
  };
  readonly refusals: Readonly<Record<RuleRefusalKey, string>>;
  /** Phase 2 step 5: the "Verify sources" panel of a rule (decisions 63, 67). */
  readonly verification: {
    readonly heading: string;
    readonly description: string;
    readonly publicStatus: string;
    /** `{version}`, `{revision}`, `{date}`. */
    readonly live: string;
    /** `{version}`, `{revision}`, `{date}` (BLD-01: research changed; not served). */
    readonly suspended: string;
    /** `{rule}`: one affected rule of a suspended version. */
    readonly suspendedRule: string;
    /** Reasons of suspension codes that are not verification blockers (snapshot checks). */
    readonly suspensionCodes: Readonly<Record<string, string>>;
    /** `{live}`, `{current}` (BLD-03). */
    readonly revisionPending: string;
    readonly notPublic: string;
    /** `{revision}`. */
    readonly currentVerified: string;
    readonly currentNotVerified: string;
    readonly preconditions: string;
    readonly ready: string;
    readonly blockers: Readonly<Record<VerificationBlockerCode, string>>;
    /** `{type}`, `{id}`, `{state}`. */
    readonly record: string;
    readonly entityTypes: Readonly<
      Record<'SOURCE' | 'PASSAGE' | 'TRANSLATION' | 'FINDING' | 'RULING', string>
    >;
    readonly formHeading: string;
    readonly attestationsLegend: string;
    readonly attestations: Readonly<Record<RuleVerificationAttestation, string>>;
    readonly notes: string;
    readonly notesHint: string;
    readonly submit: string;
    readonly automatic: string;
    readonly aiNote: string;
    readonly cannotVerify: string;
    readonly blockedNote: string;
    readonly history: string;
    readonly noHistory: string;
    /** `{revision}`. */
    readonly historyItem: string;
    readonly by: string;
    readonly at: string;
    readonly reason: string;
    readonly notesLabel: string;
    /** `{version}`. */
    readonly published: string;
    readonly loadError: string;
    /** BLD-03: what the next version would contain if this revision were verified now. */
    readonly preview: {
      readonly heading: string;
      /** `{version}`. */
      readonly description: string;
      readonly included: string;
      readonly withheld: string;
      readonly removed: string;
      readonly noneRemoved: string;
      /** `{rule}`, `{revision}`. */
      readonly item: string;
      readonly reasons: Readonly<
        Record<
          'NOT_VERIFIED' | 'NOT_READY' | 'EVIDENCE_CHANGED' | 'VERIFIER_NOT_AUTHORIZED',
          string
        >
      >;
    };
  };
  /** Phase 2 step 5: the staff dashboard's public builder versions. */
  readonly publications: {
    readonly heading: string;
    readonly description: string;
    readonly marja: string;
    readonly active: string;
    readonly none: string;
    /** `{version}`, `{date}`, `{count}`. */
    readonly activeVersion: string;
    readonly digest: string;
    /** `{rules}` (BLD-01). */
    readonly suspended: string;
    readonly loadError: string;
  };
}
