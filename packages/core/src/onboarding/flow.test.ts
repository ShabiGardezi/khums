import { describe, expect, it } from 'vitest';

import type { Workflow } from '@khums/shared-types';

import {
  advanceOnboarding,
  ASSESSMENT_WORKFLOWS,
  INITIAL_ONBOARDING_STATE,
  resolveAssessmentSelection,
  type OnboardingSubmission,
} from '../index';

const submit = (s: Partial<OnboardingSubmission>) =>
  advanceOnboarding({ intent: undefined, marja: undefined, assessment: undefined, ...s });

const TAMPERED = ['unknown-person', 'SISTANI', '', undefined, 42, ['sistani'], 'x'.repeat(200)];

describe('assessment workflows', () => {
  it('are exactly the shared Workflow values the engine runs', () => {
    const expected: Workflow[] = ['annual', 'first-time', 'missed-year'];
    expect([...ASSESSMENT_WORKFLOWS].sort()).toEqual(expected.sort());
  });

  it('resolves only exact workflow ids, never a default', () => {
    for (const workflow of ASSESSMENT_WORKFLOWS) {
      expect(resolveAssessmentSelection(workflow)).toEqual({ kind: 'workflow', workflow });
    }
    for (const raw of [undefined, null, '', '  ']) {
      expect(resolveAssessmentSelection(raw)).toEqual({ kind: 'missing' });
    }
    for (const raw of ['Annual', 'monthly', 'firstTime', 'annual;x', 1, ['annual']]) {
      expect(resolveAssessmentSelection(raw)).toEqual({ kind: 'invalid' });
    }
  });
});

describe('advanceOnboarding', () => {
  it('starts (and restarts on unknown intents) with nothing selected', () => {
    expect(INITIAL_ONBOARDING_STATE).toEqual({ step: 'marja', selected: null, error: null });
    expect(submit({ intent: 'hack', marja: 'sistani' })).toEqual(INITIAL_ONBOARDING_STATE);
    expect(submit({})).toEqual(INITIAL_ONBOARDING_STATE);
  });

  it('validates the Marja choice', () => {
    expect(submit({ intent: 'select-marja', marja: 'sistani' })).toEqual({
      step: 'review',
      marja: 'sistani',
    });
    expect(submit({ intent: 'select-marja', marja: 'not-listed' })).toEqual({
      step: 'review',
      marja: 'not-listed',
    });
    expect(submit({ intent: 'select-marja' })).toMatchObject({ step: 'marja', error: 'required' });
    expect(submit({ intent: 'select-marja', marja: 'unknown' })).toMatchObject({
      step: 'marja',
      error: 'invalid',
    });
  });

  it('carries the Marja to the assessment step, with no assessment pre-selected', () => {
    expect(submit({ intent: 'continue-to-assessment', marja: 'khamenei' })).toEqual({
      step: 'assessment',
      marja: 'khamenei',
      selected: null,
      error: null,
    });
  });

  it.each(ASSESSMENT_WORKFLOWS)('accepts the %s workflow', (workflow) => {
    expect(submit({ intent: 'select-assessment', marja: 'sistani', assessment: workflow })).toEqual(
      { step: 'summary', marja: 'sistani', workflow },
    );
  });

  it('reports missing and invalid assessment types and keeps the Marja', () => {
    expect(submit({ intent: 'select-assessment', marja: 'sistani' })).toEqual({
      step: 'assessment',
      marja: 'sistani',
      selected: null,
      error: 'required',
    });
    expect(
      submit({ intent: 'select-assessment', marja: 'sistani', assessment: 'monthly' }),
    ).toMatchObject({ step: 'assessment', error: 'invalid' });
  });

  it.each(['continue-to-assessment', 'select-assessment', 'back-to-review', 'change-assessment'])(
    'never trusts a tampered or missing Marja at "%s": the user must choose again',
    (intent) => {
      for (const marja of TAMPERED) {
        expect(submit({ intent, marja, assessment: 'annual' })).toEqual({
          step: 'marja',
          selected: null,
          error: 'lost',
        });
      }
    },
  );

  it('navigates back without losing validated choices', () => {
    expect(submit({ intent: 'back-to-review', marja: 'sistani' })).toEqual({
      step: 'review',
      marja: 'sistani',
    });
    expect(
      submit({ intent: 'change-assessment', marja: 'sistani', assessment: 'missed-year' }),
    ).toMatchObject({ step: 'assessment', selected: 'missed-year', error: null });
    expect(
      submit({ intent: 'change-assessment', marja: 'sistani', assessment: 'bogus' }),
    ).toMatchObject({ step: 'assessment', selected: null });
    expect(submit({ intent: 'change-marja', marja: 'sistani' })).toEqual({
      step: 'marja',
      selected: 'sistani',
      error: null,
    });
    expect(submit({ intent: 'change-marja', marja: 'bogus' })).toEqual(INITIAL_ONBOARDING_STATE);
  });
});

describe('details step (M4.3.2)', () => {
  it('continues to details only with a valid Marja and assessment type', () => {
    expect(
      submit({ intent: 'continue-to-details', marja: 'sistani', assessment: 'missed-year' }),
    ).toEqual({ step: 'details', marja: 'sistani', workflow: 'missed-year' });
    expect(submit({ intent: 'continue-to-details', marja: 'sistani', assessment: 'x' })).toEqual({
      step: 'assessment',
      marja: 'sistani',
      selected: null,
      error: 'invalid',
    });
    expect(
      submit({ intent: 'continue-to-details', marja: 'forged', assessment: 'annual' }),
    ).toEqual({ step: 'marja', selected: null, error: 'lost' });
  });

  it('returns to the summary from details', () => {
    expect(
      submit({ intent: 'back-to-summary', marja: 'not-listed', assessment: 'annual' }),
    ).toEqual({ step: 'summary', marja: 'not-listed', workflow: 'annual' });
  });
});

describe('workflows limited by the server policy (Phase 3 step 1)', () => {
  // The public state offers only the workflows of the Marja's verified pack (here: annual).
  const policy = {
    workflowsFor: (marja: string): readonly Workflow[] | null =>
      marja === 'sistani' ? ['annual'] : null,
  };
  const limited = (s: Partial<OnboardingSubmission>) =>
    advanceOnboarding({ intent: undefined, marja: undefined, assessment: undefined, ...s }, policy);

  it('accepts an offered workflow', () => {
    expect(
      limited({ intent: 'select-assessment', marja: 'sistani', assessment: 'annual' }),
    ).toEqual({ step: 'summary', marja: 'sistani', workflow: 'annual' });
    expect(
      limited({ intent: 'continue-to-details', marja: 'sistani', assessment: 'annual' }),
    ).toEqual({ step: 'details', marja: 'sistani', workflow: 'annual' });
  });

  it('refuses a known workflow the Marja does not offer, on every intent that carries one', () => {
    const refused = { step: 'assessment', marja: 'sistani', selected: null, error: 'unsupported' };
    for (const intent of ['select-assessment', 'continue-to-details', 'back-to-summary']) {
      for (const assessment of ['first-time', 'missed-year']) {
        expect(limited({ intent, marja: 'sistani', assessment })).toEqual(refused);
      }
    }
    // Returning to change the type never pre-selects an unsupported workflow.
    expect(
      limited({ intent: 'change-assessment', marja: 'sistani', assessment: 'missed-year' }),
    ).toEqual({ step: 'assessment', marja: 'sistani', selected: null, error: null });
    expect(
      limited({ intent: 'change-assessment', marja: 'sistani', assessment: 'annual' }),
    ).toEqual({ step: 'assessment', marja: 'sistani', selected: 'annual', error: null });
  });

  it('keeps the existing errors for missing and unknown values', () => {
    expect(limited({ intent: 'select-assessment', marja: 'sistani' })).toMatchObject({
      error: 'required',
    });
    expect(
      limited({ intent: 'select-assessment', marja: 'sistani', assessment: 'bogus' }),
    ).toMatchObject({ error: 'invalid' });
  });

  it('does not restrict a Marja the policy leaves open (null), or without a policy', () => {
    expect(
      limited({ intent: 'select-assessment', marja: 'khamenei', assessment: 'missed-year' }),
    ).toEqual({ step: 'summary', marja: 'khamenei', workflow: 'missed-year' });
    expect(
      submit({ intent: 'select-assessment', marja: 'sistani', assessment: 'first-time' }),
    ).toEqual({ step: 'summary', marja: 'sistani', workflow: 'first-time' });
  });

  it('never consults the policy without a valid Marja', () => {
    const asked: string[] = [];
    const spy = {
      workflowsFor: (marja: string) => {
        asked.push(marja);
        return [] as readonly Workflow[];
      },
    };
    expect(
      advanceOnboarding(
        { intent: 'select-assessment', marja: 'forged', assessment: 'annual' },
        spy,
      ),
    ).toEqual({ step: 'marja', selected: null, error: 'lost' });
    expect(asked).toEqual([]);
  });
});
