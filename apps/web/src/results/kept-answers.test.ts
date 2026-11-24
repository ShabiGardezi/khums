import { describe, expect, it } from 'vitest';

import type { SavedCalculation } from '@khums/core';
import type { FinancialFactSheet, QuestionDefinition } from '@khums/shared-types';

import type { ReopenRequest } from '@/lib/reopen-request';

import { answersInEffect, answersKey, changeKeptAnswers, type KeptAnswers } from './kept-answers';

/** Answers kept in the calculator's memory (audit H-1, M-1, M-2). TEST values only. */

const flag: QuestionDefinition = {
  id: 'test-flag',
  label: 'TEST flag',
  kind: 'boolean',
  choices: [],
  required: false,
  ruleIds: [],
};
const PACK = { questions: [flag] };
const REF = { packId: 'test-pack', version: '1.0.0', contentDigest: 'a'.repeat(64) };
const CHANGED = { ...REF, version: '1.1.0', contentDigest: 'b'.repeat(64) };
const SHEET: FinancialFactSheet = {
  schemaVersion: 1,
  currency: 'USD',
  context: { workflow: 'annual', period: { start: '2025-07-01', end: '2026-06-30' } },
  facts: [
    {
      id: 'fact-1',
      kind: 'BALANCE',
      subtype: 'CASH',
      label: null,
      note: null,
      currency: 'USD',
      value: { status: 'KNOWN', amount: '200' },
      periodId: null,
      valuedOn: { status: 'KNOWN', date: '2026-01-15' },
    },
  ],
};
const saved = {
  rulePack: REF,
  answers: { 'test-flag': true },
  yearAnswers: {},
  factAnswers: {},
} as unknown as SavedCalculation;
const reopen = (mode: ReopenRequest['mode']): ReopenRequest => ({ saved, mode });
const key = answersKey('test-marja', 'annual', REF);
const none = { answers: {}, yearAnswers: {}, factAnswers: {} };

describe('answersInEffect', () => {
  it('starts with no answers for a new calculation', () => {
    expect(answersInEffect({}, key, null, { ref: REF, pack: PACK }, SHEET)).toEqual(none);
  });

  it('offers saved answers only when editing with exactly the same pack (H-1)', () => {
    expect(answersInEffect({}, key, reopen('edit'), { ref: REF, pack: PACK }, SHEET)).toEqual({
      ...none,
      answers: { 'test-flag': true },
    });
    const changedKey = answersKey('test-marja', 'annual', CHANGED);
    expect(
      answersInEffect({}, changedKey, reopen('edit'), { ref: CHANGED, pack: PACK }, SHEET),
    ).toEqual(none);
  });

  it('never carries answers into a copy for a new year (M-1)', () => {
    expect(answersInEffect({}, key, reopen('copy'), { ref: REF, pack: PACK }, SHEET)).toEqual(none);
  });

  it('keeps a changed answer instead of reverting to the saved one (M-2)', () => {
    const current = { ref: REF, pack: PACK };
    const seeded = answersInEffect({}, key, reopen('edit'), current, SHEET);
    let kept: KeptAnswers = {};
    kept = changeKeptAnswers(kept, key, seeded, (set) => ({
      ...set,
      answers: { ...set.answers, 'test-flag': false },
    }));
    // The results view is shown again (after "Back" or "Edit entry"): the change stays.
    expect(answersInEffect(kept, key, reopen('edit'), current, SHEET).answers).toEqual({
      'test-flag': false,
    });
    // Answers kept for one pack are never used with another.
    const changedKey = answersKey('test-marja', 'annual', CHANGED);
    expect(
      answersInEffect(kept, changedKey, reopen('edit'), { ref: CHANGED, pack: PACK }, SHEET),
    ).toEqual(none);
  });

  it('drops kept answers for entries that were removed or changed type', () => {
    const kept: KeptAnswers = {
      [key]: {
        answers: { 'test-flag': true, gone: true },
        yearAnswers: {},
        factAnswers: {
          'fact-1': { workflow: 'annual', kind: 'BALANCE', subtype: 'CASH', answers: {} },
          'fact-9': { workflow: 'annual', kind: 'BALANCE', subtype: 'CASH', answers: {} },
        },
      },
    };
    expect(answersInEffect(kept, key, null, { ref: REF, pack: PACK }, SHEET)).toEqual({
      answers: { 'test-flag': true },
      yearAnswers: {},
      factAnswers: {
        'fact-1': { workflow: 'annual', kind: 'BALANCE', subtype: 'CASH', answers: {} },
      },
    });
  });
});

describe('answersKey', () => {
  it('differs by Marja, assessment type, pack id, version and digest', () => {
    const keys = new Set([
      key,
      answersKey('other', 'annual', REF),
      answersKey('test-marja', 'first-time', REF),
      answersKey('test-marja', 'annual', { ...REF, packId: 'x' }),
      answersKey('test-marja', 'annual', { ...REF, version: '2' }),
      answersKey('test-marja', 'annual', { ...REF, contentDigest: 'c'.repeat(64) }),
    ]);
    expect(keys.size).toBe(6);
  });
});
