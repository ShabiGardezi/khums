import type {
  ClarificationReason,
  MappingOutcome,
  MappingUnsupportedCode,
} from '@khums/shared-types';

/** Results dashboard texts (M4.5.1). Labels coming from a rule pack are shown as the pack states them. */
export interface ResultsContent {
  readonly title: string;
  readonly description: string;
  readonly mockLabel: string;
  readonly mockExplanation: string;
  readonly noticeAriaLabel: string;
  /** PROVISIONAL — FOR SCHOLAR REVIEW ONLY (M4.5a): shown with every provisional result. */
  readonly provisionalLabel: string;
  readonly provisionalExplanation: string;
  readonly provisionalNoticeAriaLabel: string;
  readonly calculate: {
    readonly title: string;
    readonly description: string;
    readonly button: string;
    readonly notReady: string;
  };
  readonly back: string;
  readonly editFact: string;
  readonly status: {
    readonly completed: string;
    readonly unresolved: string;
    readonly needsInput: string;
    readonly refused: string;
    /** Provisional flow: the input is complete; the scholar runs the calculation on the API. */
    readonly ready: string;
    /** Provisional result whose figures all resolved: still provisional, never "approved". */
    readonly provisionalCompleted: string;
  };
  readonly outputs: {
    readonly heading: string;
    readonly notCalculated: string;
    /** Audit T2: some figures resolved but open items remain; they are not the amount due. */
    readonly partial: string;
    /** Audit BLD-04: several per-category figures are separate, never a combined total. */
    readonly separate: string;
    /** Audit BLD-05: shown next to a figure kept at full precision (no rounding). */
    readonly exact: string;
  };
  /**
   * Short summary above the breakdown (Phase 3 step 4, decision 73): built only from what the
   * engine returned; never a combined total, never a new figure.
   */
  readonly summary: {
    readonly heading: string;
    readonly description: string;
    readonly figuresHeading: string;
    /** `{reasons}`: the open items that stopped this figure, as the pack names them. */
    readonly notCalculatedBecause: string;
    readonly notCalculatedSeeBelow: string;
    /** Nothing was calculated (more information, a review stop, or a refusal). */
    readonly noFigures: string;
    /**
     * Above the entry lists (audit L-2): the lists say how the rules used each entry, not that it
     * raised a figure (a figure can still be 0 or not calculated because of an answer or a stop).
     */
    readonly entriesNote: string;
    readonly counted: { readonly heading: string; readonly empty: string };
    readonly deducted: { readonly heading: string; readonly empty: string };
    readonly excluded: { readonly heading: string; readonly empty: string };
    readonly stops: {
      readonly heading: string;
      readonly empty: string;
      readonly review: string;
      readonly answer: string;
      readonly detail: string;
      readonly unsupported: string;
    };
    /** `{packId}`, `{version}`, `{digest}`. */
    readonly trace: string;
    readonly noDigest: string;
  };
  /** Print view (Phase 3 step 4): the browser's print dialog, where "Save as PDF" is offered. */
  readonly print: { readonly button: string; readonly hint: string };
  /** The engine's own disclaimer (`meta.disclaimer`), shown verbatim under this heading. */
  readonly disclaimerHeading: string;
  readonly breakdown: {
    readonly heading: string;
    readonly description: string;
    readonly value: string;
    readonly rules: string;
    readonly sources: string;
    readonly rounding: string;
    readonly unresolvedMarker: string;
    /** M5.3.6/M5.4: the ruling version behind a rule, as frozen in this pack version. */
    readonly ruling: string;
    readonly rulingFindings: string;
    readonly rulingPassages: string;
    readonly rulingNoSnapshot: string;
  };
  readonly unresolved: {
    readonly heading: string;
    readonly consultation: string;
    readonly missingAnswer: string;
    readonly consultationHelp: string;
  };
  readonly questions: {
    readonly heading: string;
    readonly description: string;
    readonly yes: string;
    readonly no: string;
    readonly notAnswered: string;
    readonly factQuestion: string;
    readonly factHeading: string;
    /** Missed years (decision 62): one question block per year. `{start}`, `{end}`. */
    readonly yearHeading: string;
    readonly yearDescription: string;
  };
  readonly mapping: {
    readonly heading: string;
    readonly description: string;
    readonly fact: string;
    readonly outcome: string;
    readonly bucket: string;
    readonly outcomes: Readonly<Record<MappingOutcome, string>>;
  };
  readonly clarifications: {
    readonly heading: string;
    readonly reasons: Readonly<Record<ClarificationReason, string>>;
  };
  readonly consultations: { readonly heading: string; readonly help: string };
  readonly unsupported: {
    readonly heading: string;
    readonly codes: Readonly<Record<MappingUnsupportedCode, string>>;
  };
  readonly refused: { readonly heading: string; readonly body: string };
  readonly years: {
    readonly heading: string;
    readonly period: string;
    readonly aggregate: string;
    /** Audit C5/T2: how complete the added total is. */
    readonly completeness: {
      readonly COMPLETE: string;
      readonly PARTIAL: string;
      readonly UNRESOLVED: string;
    };
  };
  readonly details: {
    readonly heading: string;
    readonly pack: string;
    readonly version: string;
    readonly digest: string;
    readonly engine: string;
    readonly warnings: string;
  };
  readonly unavailable: string;
  /**
   * Decision 65: the public calculator with a verified pack (governed, published, activated).
   * Never used for mock or provisional results.
   */
  readonly verified: {
    readonly calculate: {
      readonly title: string;
      readonly description: string;
      readonly button: string;
      readonly notReady: string;
    };
    readonly noticeTitle: string;
    readonly noticeBody: string;
    /** Shown when the verified pack has no disclaimer of its own (`meta.disclaimer` is null). */
    readonly disclaimer: string;
    readonly traceHeading: string;
    readonly traceDescription: string;
    readonly activatedAt: string;
    /** No verified pack for the selected Marja: no figures at all. */
    readonly noRules: { readonly title: string; readonly body: string };
    /** The verified packs could not be loaded: no figures at all. */
    readonly loadFailed: { readonly title: string; readonly body: string };
    /** The pack did not pass the check in this browser: no figures at all. */
    readonly notVerified: { readonly title: string; readonly body: string };
    /**
     * Browser-only history (owner decisions 2026-11-23 and 2026-11-24, decision 71): saved only
     * when the person taps Save, on this device only, with the entries and answers.
     */
    readonly save: {
      readonly heading: string;
      readonly description: string;
      /** Shared-device warning. */
      readonly privacy: string;
      readonly name: {
        readonly label: string;
        readonly description: string;
        readonly required: string;
      };
      /** Default names from the assessment dates ({start}, {end}; {date}). */
      readonly defaultAnnual: string;
      readonly defaultDated: string;
      readonly button: string;
      readonly saved: string;
      /** After editing a reopened calculation: saving never replaces it. */
      readonly editNote: string;
      readonly failed: string;
      /** The browser's storage quota is used up. */
      readonly full: string;
      /** The result is not one that can be saved (not a verified result for these entries). */
      readonly notSavable: string;
      /** Before Save: unreadable stored data will be removed by saving (audit M-3). */
      readonly unreadableWarning: string;
      /** Before Save at the limit: the oldest is removed ({max}, {date}) (audit L-5). */
      readonly capWarning: string;
      readonly viewHistory: string;
    };
    /** Recalculating a saved calculation: which pack version is used (decision 71). */
    readonly reopened: {
      readonly sameTitle: string;
      readonly same: string;
      readonly changedTitle: string;
      readonly changed: string;
      /** With a changed pack: saved answers are not reused, the questions are asked again. */
      readonly answersCleared: string;
    };
  };
}
