import { describe, expect, it } from 'vitest';

import type { ResearchListItem } from '@khums/api-client';

import {
  findingPayloadFrom,
  passagePayloadFrom,
  referencesFrom,
  referenceValue,
  rulingPayloadFrom,
  sourcePayloadFrom,
  translationPayloadFrom,
} from './payloads';

/** Research workspace form helpers (M5.3.7). SYNTHETIC placeholder values only. */

const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(name, v);
  }
  return data;
};

describe('research payloads from forms', () => {
  it('builds a source payload; empty optional fields are null and lists split by line', () => {
    expect(
      sourcePayloadFrom(
        form({
          titleOriginal: ' TEST title ',
          titleTranslation: '',
          originalLanguage: 'ar',
          sourceClass: 'OFFICE_OWN',
          sourceTier: '1',
          publisher: '',
          edition: 'TEST edition',
          publicationOriginal: '',
          publicationGregorian: '2020-01-02',
          url: '',
          statedAuthor: '',
          establishedBy: '',
          authorshipStatus: 'UNVERIFIED',
          authenticityStatus: 'UNVERIFIED',
          compareWith: 'TEST a\n\n TEST b ',
          accessStatus: 'READABLE',
          copyright: 'EXCERPTS_ONLY',
          canonical: 'UNDECIDED',
          notes: '',
        }),
      ),
    ).toEqual({
      title: { original: 'TEST title', translation: null },
      originalLanguage: 'ar',
      sourceClass: 'OFFICE_OWN',
      sourceTier: 1,
      publisher: null,
      edition: 'TEST edition',
      publicationDate: { original: null, gregorian: '2020-01-02' },
      url: null,
      authorship: { statedAuthor: null, establishedBy: null, status: 'UNVERIFIED' },
      authenticity: { status: 'UNVERIFIED', compareWith: ['TEST a', 'TEST b'] },
      accessStatus: 'READABLE',
      copyright: 'EXCERPTS_ONLY',
      canonicalForMarja: 'UNDECIDED',
      notes: null,
    });
  });

  it('builds passage, translation, finding and ruling payloads', () => {
    expect(
      passagePayloadFrom(
        form({ volume: '2', page: '14', paragraph: '3', originalLanguage: 'fa', text: 'TEST' }),
      ),
    ).toEqual({
      locator: {
        volume: 2,
        page: '14',
        masalah: null,
        istiftaId: null,
        section: null,
        paragraph: '3',
        url: null,
      },
      originalLanguage: 'fa',
      text: 'TEST',
      precautionWording: null,
      notes: null,
    });
    // No paragraph: the field is absent (earlier passages never had one).
    expect(passagePayloadFrom(form({ page: '1' })).locator).not.toHaveProperty('paragraph');
    expect(
      translationPayloadFrom(form({ language: 'ur', translationText: 'TEST', translator: 'TEST' })),
    ).toEqual({ language: 'ur', text: 'TEST', translator: 'TEST', notes: null });
    expect(
      findingPayloadFrom(
        form({
          writtenIn: 'en',
          conclusion: 'TEST',
          explanation: 'TEST',
          precaution: 'UNDETERMINED',
          conditions: 'TEST one\nTEST two',
          unresolvedIssues: 'TEST?',
        }),
      ),
    ).toMatchObject({
      scenario: null,
      conditions: ['TEST one', 'TEST two'],
      exceptions: [],
      unresolvedIssues: ['TEST?'],
    });
    expect(
      rulingPayloadFrom(
        form({ writtenIn: 'en', conclusion: 'TEST', explanation: 'TEST', precaution: 'FATWA' }),
      ),
    ).toEqual({
      language: 'en',
      conclusion: 'TEST',
      explanation: 'TEST',
      precaution: 'FATWA',
      conditions: [],
      exceptions: [],
      notes: null,
    });
  });

  it('pins references to the latest revision of the chosen records', () => {
    const item = {
      entityType: 'PASSAGE',
      entityId: '01936b2e-7c4a-7d3e-9f10-1a2b3c4d5e6f',
      revisions: 2,
      marjaId: 'sistani',
    } as ResearchListItem;
    const value = referenceValue(item);
    expect(value).toBe('PASSAGE|01936b2e-7c4a-7d3e-9f10-1a2b3c4d5e6f|1|sistani');
    expect(referencesFrom(form({ passages: [value, ''], other: value }), 'passages')).toEqual([
      {
        entityType: 'PASSAGE',
        entityId: '01936b2e-7c4a-7d3e-9f10-1a2b3c4d5e6f',
        revision: 1,
        rulingVersion: null,
        marjaId: 'sistani',
      },
    ]);
    expect(referencesFrom(form({ passages: 'broken' }), 'passages')).toEqual([]);
  });
});
