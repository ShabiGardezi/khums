import type {
  CalculationAvailability,
  MarjaLifecycleStatus,
  MarjaResearchStatus,
  RulePackAvailability,
  Workflow,
} from '@khums/shared-types';

/** Onboarding text (start screen, Marja selection, selection review). Required for every locale. */
export interface OnboardingContent {
  readonly progress: {
    /** Accessible name of the progress list. */
    readonly label: string;
    /** e.g. "Step {current} of {total}". */
    readonly stepOf: string;
    readonly steps: {
      readonly marja: string;
      readonly assessment: string;
      readonly details: string;
    };
    readonly state: {
      readonly complete: string;
      readonly current: string;
      readonly upcoming: string;
    };
  };
  readonly start: {
    readonly metadataTitle: string;
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly stepsTitle: string;
    readonly steps: readonly { readonly title: string; readonly description: string }[];
    readonly preview: { readonly title: string; readonly body: string };
    readonly privacy: string;
    readonly continue: string;
  };
  readonly marja: {
    readonly metadataTitle: string;
    readonly title: string;
    readonly description: string;
    readonly legend: string;
    readonly listNote: { readonly title: string; readonly body: string };
    /**
     * Public state only (Phase 3 step 1): whether each Marja has verified rules, shown on its card.
     * Never a recommendation; the list order and selection are unchanged.
     */
    readonly verifiedRules: { readonly available: string; readonly none: string };
    readonly notListed: { readonly label: string; readonly description: string };
    readonly continue: string;
    readonly back: string;
    readonly errors: {
      readonly required: string;
      readonly invalid: string;
      /** A later step arrived without a valid Marja (e.g. a tampered or expired form). */
      readonly lost: string;
    };
    /** The choice is transient: not saved anywhere, made again on restart. */
    readonly temporary: string;
  };
  readonly status: {
    readonly fieldLabels: {
      readonly lifecycle: string;
      readonly research: string;
      readonly rulePack: string;
      readonly calculation: string;
    };
    readonly lifecycle: Readonly<Record<MarjaLifecycleStatus, string>>;
    readonly research: Readonly<Record<MarjaResearchStatus, string>>;
    readonly rulePack: Readonly<Record<RulePackAvailability, string>>;
    readonly calculation: Readonly<Record<CalculationAvailability, string>>;
  };
  readonly review: {
    readonly metadataTitle: string;
    readonly title: string;
    readonly description: string;
    readonly yourSelection: string;
    readonly selectedByYou: string;
    readonly statusHeading: string;
    readonly unavailable: {
      readonly title: string;
      readonly body: string;
      readonly consult: string;
    };
    readonly deceased: { readonly title: string; readonly body: string };
    readonly notListed: { readonly title: string; readonly body: string };
    readonly temporary: string;
    readonly continue: string;
    readonly change: string;
    readonly home: string;
  };
  /** Assessment type selection (M4.2.4). Workflow ids come from the shared `Workflow` type. */
  readonly assessment: {
    readonly title: string;
    readonly description: string;
    readonly selectedMarja: string;
    readonly unavailable: { readonly title: string; readonly body: string };
    readonly types: Readonly<
      Record<Workflow, { readonly title: string; readonly description: string }>
    >;
    /**
     * Public state only: a type the selected Marja's verified rules do not cover (shown disabled).
     * `{name}`: the Marja.
     */
    readonly notOffered: string;
    readonly errors: {
      readonly required: string;
      readonly invalid: string;
      /** A known type that the selected Marja's verified rules do not cover (server-checked). */
      readonly unsupported: string;
    };
    readonly temporary: string;
    readonly continue: string;
    readonly back: string;
  };
  readonly summary: {
    readonly title: string;
    readonly description: string;
    readonly marjaLabel: string;
    readonly assessmentLabel: string;
    readonly unavailable: {
      readonly title: string;
      readonly body: string;
      readonly consult: string;
    };
    readonly temporary: string;
    readonly nextSteps: string;
    readonly continue: string;
    readonly changeAssessment: string;
    readonly changeMarja: string;
    readonly home: string;
  };
}
