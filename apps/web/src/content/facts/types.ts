import type { FactDateField } from '@khums/core';
import type {
  AmountValue,
  DateValue,
  FinancialFactKind,
  FinancialFactSubtypes,
} from '@khums/shared-types';

import type { FactErrorCode, FrameErrorCode } from '@/financial/drafts';

/**
 * Financial details step (M4.3.2). Wording records what the user reports and never states or
 * implies a religious treatment (liable, deductible, exempt, eligible).
 */
export interface ConfirmText {
  readonly title: string;
  readonly body: string;
  readonly confirm: string;
  readonly cancel: string;
}

export interface FactsContent {
  readonly title: string;
  readonly description: string;
  readonly selection: { readonly marja: string; readonly assessment: string };
  readonly temporary: { readonly title: string; readonly body: string };
  readonly neutral: { readonly title: string; readonly body: string };
  readonly jsRequired: { readonly title: string; readonly body: string };
  readonly frame: {
    readonly title: string;
    readonly description: string;
    readonly currency: {
      readonly label: string;
      readonly description: string;
      readonly placeholder: string;
    };
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly periodDescription: string;
    readonly assessmentDate: { readonly label: string; readonly description: string };
    readonly periods: {
      readonly title: string;
      readonly description: string;
      readonly name: string;
      readonly start: string;
      readonly end: string;
      readonly add: string;
      readonly remove: string;
      readonly empty: string;
    };
    readonly incomplete: string;
  };
  readonly overview: {
    readonly title: string;
    readonly empty: { readonly title: string; readonly body: string };
    /** Keyed by Intl.PluralRules category; `other` is required. */
    readonly counts: { readonly one: string; readonly other: string };
    readonly completeness: {
      readonly known: string;
      readonly estimated: string;
      readonly range: string;
      readonly unknown: string;
      readonly notProvided: string;
    };
    readonly noTotals: string;
    readonly needsAttention: string;
  };
  readonly kinds: Readonly<
    Record<FinancialFactKind, { readonly label: string; readonly description: string }>
  >;
  readonly subtypes: {
    readonly [K in FinancialFactKind]: Readonly<Record<FinancialFactSubtypes[K], string>>;
  };
  readonly form: {
    readonly addTitle: string;
    readonly editTitle: string;
    readonly kindLegend: string;
    readonly subtype: { readonly label: string; readonly placeholder: string };
    readonly currency: { readonly label: string; readonly description: string };
    readonly amount: {
      readonly legend: string;
      readonly status: Readonly<Record<AmountValue['status'], string>>;
      readonly label: string;
      readonly estimateLabel: string;
      readonly hint: string;
      readonly min: string;
      readonly max: string;
    };
    readonly dates: {
      readonly labels: Readonly<Record<FactDateField, string>>;
      readonly status: Readonly<Record<DateValue['status'], string>>;
      readonly statusLabel: string;
      readonly dateLabel: string;
      readonly approximateHint: string;
    };
    readonly period: { readonly label: string; readonly placeholder: string };
    readonly label: { readonly label: string; readonly hint: string };
    readonly note: { readonly label: string; readonly hint: string };
    readonly optional: string;
    readonly save: string;
    readonly saveChanges: string;
    readonly cancel: string;
    readonly errorSummary: string;
    /**
     * Public verified mode only (Phase 3 step 2): how the selected Marja's verified rules use each
     * entry type, read from the pack's own fact mapping. Describes the rules; never a ruling.
     */
    readonly coverage: {
      /** Description of the type list when it is grouped. */
      readonly intro: string;
      readonly coveredGroup: string;
      readonly uncoveredGroup: string;
      readonly status: {
        readonly CALCULATED: string;
        readonly EXCLUDED: string;
        readonly ASKS_QUESTION: string;
      };
      /** Shown as soon as an uncovered type is chosen, before saving. */
      readonly uncovered: { readonly title: string; readonly body: string };
      /**
       * Shown when the entry's currency differs from the preferred (sheet) currency: the mapping
       * never converts and stops on it ({currency}) (audit L-4).
       */
      readonly currency: { readonly title: string; readonly body: string };
    };
  };
  readonly errors: Readonly<Record<FactErrorCode | FrameErrorCode, string>>;
  readonly item: {
    readonly edit: string;
    readonly remove: string;
    readonly confirmRemove: string;
    readonly confirm: string;
    readonly cancel: string;
    readonly estimated: string;
    readonly range: string;
    readonly unknown: string;
    readonly notProvided: string;
    readonly approximate: string;
    readonly dateUnknown: string;
    readonly dateNotProvided: string;
    readonly period: string;
  };
  /** Confirmations before unsaved financial information would be lost. */
  readonly unsaved: {
    readonly discardEntry: ConfirmText;
    readonly discardChanges: ConfirmText;
    readonly backWithDraft: ConfirmText;
    readonly changeType: ConfirmText;
    readonly leave: ConfirmText;
    readonly removeFact: ConfirmText;
  };
  /** Read-only review of the whole sheet (M4.3.3). */
  readonly review: {
    readonly open: string;
    readonly title: string;
    readonly description: string;
    readonly back: string;
    readonly notResult: { readonly title: string; readonly body: string };
    readonly summaryTitle: string;
    readonly fields: {
      readonly workflow: string;
      readonly currency: string;
      readonly period: string;
      readonly assessmentDate: string;
      readonly periods: string;
      readonly amount: string;
      readonly certainty: string;
      readonly factCurrency: string;
      readonly label: string;
      readonly note: string;
    };
    readonly periodRange: string;
    readonly status: {
      readonly ready: string;
      readonly issues: string;
      readonly empty: string;
      readonly incompleteFrame: string;
    };
    readonly uncertainty: {
      readonly title: string;
      readonly body: string;
      readonly none: string;
      readonly approximateDates: string;
      readonly unknownDates: string;
      readonly missingDates: string;
    };
    readonly entriesTitle: string;
  };
  readonly export: {
    readonly title: string;
    readonly description: string;
    readonly button: string;
    readonly success: string;
    readonly invalid: string;
    readonly error: string;
  };
  readonly announcements: {
    readonly added: string;
    readonly updated: string;
    readonly removed: string;
  };
  readonly actions: { readonly add: string; readonly back: string; readonly limit: string };
  /** A calculation saved on this device, opened to edit or to copy for a new year (decision 71). */
  readonly reopened: {
    readonly opening: string;
    /** {label}, {date} */
    readonly editTitle: string;
    readonly editBody: string;
    readonly copyTitle: string;
    readonly copyBody: string;
    /** The Marja has no verified rules now: no new figures, the saved ones stay. */
    readonly noRules: string;
    readonly viewSaved: string;
  };
}
