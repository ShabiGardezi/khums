'use server';

import { advanceOnboarding, type OnboardingIntent, type OnboardingState } from '@khums/core';

import { offeredWorkflows } from '@/results/calculation-source';
import { loadVerifiedCalculationSource } from '@/server/public-calculator';

/** Intents that carry an assessment type, which the server checks against the Marja's rules. */
const WITH_WORKFLOW: readonly unknown[] = [
  'select-assessment',
  'change-assessment',
  'continue-to-details',
  'back-to-summary',
] satisfies readonly OnboardingIntent[];

/**
 * One onboarding step, submitted by POST (a Server Function), so no choice ever appears in a URL.
 *
 * - Stateless: the next state is computed only from the submitted values, which `@khums/core`
 *   re-validates (including the Marja carried in a hidden field). The previous state is ignored,
 *   so it cannot be used to smuggle in an unvalidated value.
 * - Phase 3 step 1: an assessment type is accepted only if the selected Marja's verified pack
 *   defines it (public state; other states are not restricted here). The packs are loaded for EVERY Marja, exactly as when the page is
 *   rendered, so the Marja choice is never sent anywhere (decision 23).
 * - Nothing is stored, logged or sent anywhere. Server Function logging is disabled in
 *   next.config.ts, so the submitted values are not printed.
 */
export async function submitOnboardingStep(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const intent = formData.get('intent');
  const source = WITH_WORKFLOW.includes(intent) ? await loadVerifiedCalculationSource() : null;
  return advanceOnboarding(
    {
      intent,
      marja: formData.get('marja'),
      assessment: formData.get('assessment'),
    },
    { workflowsFor: (marja) => offeredWorkflows(source, marja) },
  );
}
