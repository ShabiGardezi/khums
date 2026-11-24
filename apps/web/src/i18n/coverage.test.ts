import { describe, expect, it } from 'vitest';

import { CONTENT, type ContentArea } from '@/content';

import { LOCALES } from './config';
import { checkTranslationCoverage } from './coverage';

describe('translation coverage', () => {
  const areas = Object.keys(CONTENT) as ContentArea[];
  for (const area of areas) {
    for (const locale of LOCALES.filter((l) => l !== 'en')) {
      it(`${area}: ${locale} is complete, translated and structurally identical to English`, () => {
        expect(checkTranslationCoverage(CONTENT[area].en, CONTENT[area][locale], locale)).toEqual(
          [],
        );
      });
    }
  }
});

describe('checkTranslationCoverage detects problems', () => {
  const en = {
    title: 'Hello',
    id: 'faq',
    steps: ['One', 'Two'],
    nested: { body: 'Step {number}' },
  };

  it('flags missing keys, extra keys and length mismatches', () => {
    const issues = checkTranslationCoverage(
      en,
      { title: 'سلام', id: 'faq', steps: ['ایک'], extra: 'x' },
      'ur',
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        { path: '$.nested', problem: 'missing-key' },
        { path: '$.extra', problem: 'extra-key' },
        { path: '$.steps', problem: 'length-mismatch' },
      ]),
    );
  });

  it('flags untranslated, empty and placeholder problems', () => {
    const issues = checkTranslationCoverage(
      en,
      { title: 'Hello', id: 'faq', steps: ['', 'دو'], nested: { body: 'مرحلہ' } },
      'ur',
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        { path: '$.title', problem: 'untranslated' },
        { path: '$.steps[0]', problem: 'empty' },
        { path: '$.nested.body', problem: 'placeholder-mismatch' },
      ]),
    );
  });

  it('requires identifiers (ids, icon keys) to stay unchanged', () => {
    const issues = checkTranslationCoverage(
      en,
      {
        ...en,
        title: 'سلام',
        id: 'سوالات',
        steps: ['ایک', 'دو'],
        nested: { body: 'مرحلہ {number}' },
      },
      'ur',
    );
    expect(issues).toEqual([{ path: '$.id', problem: 'changed-identifier' }]);
  });
});
