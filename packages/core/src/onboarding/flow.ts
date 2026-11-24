import type { Workflow } from '@khums/shared-types';

import { resolveMarjaSelection } from '../marja/catalogue';
import { resolveAssessmentSelection } from './assessment';

/**
 * Transient onboarding flow (Marja → review → assessment type → summary → details), independent of any UI
 * framework.
 *
 * Every step is computed only from the values submitted with that step. The previous state is
 * never trusted, so a tampered or missing hidden value is re-validated against the catalogue.
 * Nothing is stored: the caller holds the returned state only for the current page.
 */

/** A catalogue Marja id or `not-listed` (validated). */
export type MarjaChoice = string;

export type OnboardingState =
  | {
      readonly step: 'marja';
      /** The user's own earlier choice, re-validated, when returning to change it. */
      readonly selected: MarjaChoice | null;
      /** `lost`: a later step arrived without a valid Marja; the user must choose again. */
      readonly error: 'required' | 'invalid' | 'lost' | null;
    }
  | { readonly step: 'review'; readonly marja: MarjaChoice }
  | {
      readonly step: 'assessment';
      readonly marja: MarjaChoice;
      readonly selected: Workflow | null;
      /**
       * `unsupported`: a known workflow that the selected Marja's calculation does not offer
       * (public state: not in its verified pack; see `OnboardingPolicy`).
       */
      readonly error: 'required' | 'invalid' | 'unsupported' | null;
    }
  | { readonly step: 'summary'; readonly marja: MarjaChoice; readonly workflow: Workflow }
  /** Financial details (M4.3.2). Facts are entered and kept on the client only, never here. */
  | { readonly step: 'details'; readonly marja: MarjaChoice; readonly workflow: Workflow };

export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  step: 'marja',
  selected: null,
  error: null,
};

export const ONBOARDING_INTENTS = [
  'select-marja',
  'change-marja',
  'continue-to-assessment',
  'select-assessment',
  'back-to-review',
  'change-assessment',
  'continue-to-details',
  'back-to-summary',
] as const;
export type OnboardingIntent = (typeof ONBOARDING_INTENTS)[number];

/** Untrusted values from one form submission. */
export interface OnboardingSubmission {
  readonly intent: unknown;
  readonly marja: unknown;
  readonly assessment: unknown;
}

/**
 * Server-side limits on the flow, supplied by the caller (never by the submission).
 *
 * `workflowsFor` returns the workflows the selected Marja's calculation offers, or null when the
 * caller does not restrict them (development mock mode, scholar-review contexts, a Marja without
 * verified rules or packs that could not be loaded: no figures are offered there anyway). In the
 * public state it lists the workflows of the Marja's verified pack (Phase 3 step 1), so a submitted
 * workflow outside it is refused even without JavaScript.
 */
export interface OnboardingPolicy {
  readonly workflowsFor: (marja: MarjaChoice) => readonly Workflow[] | null;
}

const UNRESTRICTED: OnboardingPolicy = { workflowsFor: () => null };

const isIntent = (value: unknown): value is OnboardingIntent =>
  typeof value === 'string' && (ONBOARDING_INTENTS as readonly string[]).includes(value);

/** Validated Marja choice, or null. Never substitutes another Marja. */
function marjaChoice(raw: unknown): MarjaChoice | null {
  const selection = resolveMarjaSelection(raw);
  switch (selection.kind) {
    case 'marja':
      return selection.entry.id;
    case 'not-listed':
      return 'not-listed';
    case 'missing':
    case 'invalid':
      return null;
  }
}

const lost: OnboardingState = { step: 'marja', selected: null, error: 'lost' };

/** Computes the next state from one submission. Pure and deterministic. */
export function advanceOnboarding(
  submission: OnboardingSubmission,
  policy: OnboardingPolicy = UNRESTRICTED,
): OnboardingState {
  if (!isIntent(submission.intent)) return INITIAL_ONBOARDING_STATE;
  const intent = submission.intent;

  if (intent === 'select-marja') {
    const selection = resolveMarjaSelection(submission.marja);
    switch (selection.kind) {
      case 'missing':
        return { step: 'marja', selected: null, error: 'required' };
      case 'invalid':
        return { step: 'marja', selected: null, error: 'invalid' };
      case 'not-listed':
        return { step: 'review', marja: 'not-listed' };
      case 'marja':
        return { step: 'review', marja: selection.entry.id };
    }
  }

  // Every later step carries the Marja in the submission; re-validate it each time.
  const marja = marjaChoice(submission.marja);
  if (intent === 'change-marja') return { step: 'marja', selected: marja, error: null };
  if (marja === null) return lost;
  const allowed = policy.workflowsFor(marja);
  const offered = (workflow: Workflow) => allowed === null || allowed.includes(workflow);

  switch (intent) {
    case 'continue-to-assessment':
      return { step: 'assessment', marja, selected: null, error: null };
    case 'back-to-review':
      return { step: 'review', marja };
    case 'change-assessment': {
      const previous = resolveAssessmentSelection(submission.assessment);
      return {
        step: 'assessment',
        marja,
        selected:
          previous.kind === 'workflow' && offered(previous.workflow) ? previous.workflow : null,
        error: null,
      };
    }
    case 'continue-to-details':
    case 'back-to-summary': {
      const assessment = resolveAssessmentSelection(submission.assessment);
      if (assessment.kind !== 'workflow') {
        return { step: 'assessment', marja, selected: null, error: 'invalid' };
      }
      if (!offered(assessment.workflow)) {
        return { step: 'assessment', marja, selected: null, error: 'unsupported' };
      }
      return {
        step: intent === 'continue-to-details' ? 'details' : 'summary',
        marja,
        workflow: assessment.workflow,
      };
    }
    case 'select-assessment': {
      const assessment = resolveAssessmentSelection(submission.assessment);
      switch (assessment.kind) {
        case 'missing':
          return { step: 'assessment', marja, selected: null, error: 'required' };
        case 'invalid':
          return { step: 'assessment', marja, selected: null, error: 'invalid' };
        case 'workflow':
          return offered(assessment.workflow)
            ? { step: 'summary', marja, workflow: assessment.workflow }
            : { step: 'assessment', marja, selected: null, error: 'unsupported' };
      }
    }
  }
}
