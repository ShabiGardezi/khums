import { describe, expect, it } from 'vitest';

import { INITIAL_ONBOARDING_STATE, listMarjaCatalogue, NOT_LISTED_SELECTION } from '@khums/core';

import { submitOnboardingStep } from './actions';
import { sortedCatalogue } from './selection';

const submit = (fields: Record<string, string | Blob>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return submitOnboardingStep(INITIAL_ONBOARDING_STATE, data);
};

describe('submitOnboardingStep (server action)', () => {
  it('accepts catalogue ids and "not listed"', async () => {
    await expect(submit({ intent: 'select-marja', marja: 'sistani' })).resolves.toEqual({
      step: 'review',
      marja: 'sistani',
    });
    await expect(
      submit({ intent: 'select-marja', marja: NOT_LISTED_SELECTION }),
    ).resolves.toMatchObject({ step: 'review', marja: NOT_LISTED_SELECTION });
  });

  it('reports a missing selection', async () => {
    await expect(submit({ intent: 'select-marja' })).resolves.toMatchObject({ error: 'required' });
  });

  it.each(['unknown-marja', 'SISTANI', 'sistani;drop', '<script>', 'x'.repeat(101)])(
    'rejects %j as invalid without substituting another Marja',
    async (value) => {
      await expect(submit({ intent: 'select-marja', marja: value })).resolves.toMatchObject({
        step: 'marja',
        error: 'invalid',
      });
    },
  );

  it('rejects a file upload in place of an id', async () => {
    await expect(
      submit({ intent: 'select-marja', marja: new Blob(['sistani']) }),
    ).resolves.toMatchObject({ error: 'invalid' });
  });

  it('carries the Marja forward and re-validates it at the assessment step', async () => {
    await expect(
      submit({ intent: 'select-assessment', marja: 'sistani', assessment: 'annual' }),
    ).resolves.toEqual({ step: 'summary', marja: 'sistani', workflow: 'annual' });
    await expect(
      submit({ intent: 'select-assessment', marja: 'forged', assessment: 'annual' }),
    ).resolves.toEqual({ step: 'marja', selected: null, error: 'lost' });
  });

  it('ignores the previous state entirely', async () => {
    const data = new FormData();
    data.set('intent', 'select-assessment');
    data.set('assessment', 'annual');
    await expect(
      submitOnboardingStep(
        { step: 'assessment', marja: 'sistani', selected: null, error: null },
        data,
      ),
    ).resolves.toMatchObject({ error: 'lost' });
  });
});

describe('sortedCatalogue', () => {
  it('orders alphabetically per locale and includes every entry exactly once', () => {
    for (const [locale, tag] of [
      ['en', 'en'],
      ['ur', 'ur'],
    ] as const) {
      const sorted = sortedCatalogue(locale, tag);
      expect(sorted).toHaveLength(listMarjaCatalogue().length);
      const keys = sorted.map((e) => e.sortName[locale]);
      expect(keys).toEqual([...keys].sort(new Intl.Collator(tag).compare));
    }
  });

  it('does not reuse the source order (no implied ranking)', () => {
    expect(sortedCatalogue('en', 'en')[0]?.id).toBe('fadlallah');
  });
});
