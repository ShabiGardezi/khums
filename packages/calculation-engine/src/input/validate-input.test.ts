import { describe, expect, it } from 'vitest';

import type {
  AnnualAssessmentInput,
  AssessmentInput,
  MissedYearAssessmentInput,
} from '@khums/shared-types';

import { createMockRulePack } from '../__fixtures__/mock-rule-pack';
import { validateInput } from './validate-input';

const pack = createMockRulePack();
const annualProgram = pack.workflows.annual!;

const annual = (overrides: Partial<AnnualAssessmentInput> = {}): AnnualAssessmentInput => ({
  workflow: 'annual',
  currency: 'USD',
  period: { start: '2026-01-01', end: '2026-12-31' },
  entries: [
    {
      id: 'e1',
      categoryId: 'mock-category-a',
      amount: '100.00',
      date: '2026-03-01',
      description: null,
    },
  ],
  answers: { 'mock-flag': false },
  ...overrides,
});

const codes = (input: AssessmentInput, program = annualProgram) =>
  validateInput(input, pack, program).map((i) => `${i.severity}:${i.code}`);

describe('validateInput — annual', () => {
  it('accepts a valid input', () => {
    expect(codes(annual())).toEqual([]);
  });

  it.each<[string, Partial<AnnualAssessmentInput>, string]>([
    ['unsupported currency', { currency: 'XYZ' }, 'error:INPUT_UNSUPPORTED_CURRENCY'],
    [
      'invalid period date',
      { period: { start: '2026-02-30', end: '2026-12-31' } },
      'error:INPUT_INVALID_DATE',
    ],
    [
      'reversed period',
      { period: { start: '2026-12-31', end: '2026-01-01' } },
      'error:INPUT_INVALID_PERIOD',
    ],
    [
      'duplicate entry ids',
      {
        entries: [
          {
            id: 'e',
            categoryId: 'mock-category-a',
            amount: '1',
            date: '2026-01-02',
            description: null,
          },
          {
            id: 'e',
            categoryId: 'mock-category-a',
            amount: '1',
            date: '2026-01-02',
            description: null,
          },
        ],
      },
      'error:INPUT_DUPLICATE_ENTRY_ID',
    ],
    [
      'unknown category',
      {
        entries: [
          { id: 'e', categoryId: 'nope', amount: '1', date: '2026-01-02', description: null },
        ],
      },
      'error:INPUT_UNKNOWN_CATEGORY',
    ],
    [
      'float-like amount',
      {
        entries: [
          {
            id: 'e',
            categoryId: 'mock-category-a',
            amount: '1e3',
            date: '2026-01-02',
            description: null,
          },
        ],
      },
      'error:INPUT_INVALID_AMOUNT',
    ],
    [
      'negative amount',
      {
        entries: [
          {
            id: 'e',
            categoryId: 'mock-category-a',
            amount: '-5',
            date: '2026-01-02',
            description: null,
          },
        ],
      },
      'error:INPUT_NEGATIVE_AMOUNT',
    ],
    [
      'missing date',
      {
        entries: [
          { id: 'e', categoryId: 'mock-category-a', amount: '1', date: null, description: null },
        ],
      },
      'error:INPUT_ENTRY_MISSING_DATE',
    ],
    [
      'entry outside period',
      {
        entries: [
          {
            id: 'e',
            categoryId: 'mock-category-a',
            amount: '1',
            date: '2027-01-01',
            description: null,
          },
        ],
      },
      'error:INPUT_ENTRY_OUTSIDE_PERIOD',
    ],
    ['unknown question', { answers: { nope: true } }, 'error:INPUT_UNKNOWN_QUESTION'],
    [
      'malformed entry date',
      {
        entries: [
          {
            id: 'e',
            categoryId: 'mock-category-a',
            amount: '1',
            date: '03/01/2026',
            description: null,
          },
        ],
      },
      'error:INPUT_INVALID_DATE',
    ],
    ['wrong answer type', { answers: { 'mock-flag': 'yes' } }, 'error:INPUT_INVALID_ANSWER'],
    [
      'unused category (warning only)',
      {
        entries: [
          {
            id: 'e',
            categoryId: 'mock-category-unused',
            amount: '1',
            date: '2026-01-02',
            description: null,
          },
        ],
      },
      'warning:INPUT_UNUSED_CATEGORY',
    ],
  ])('reports %s', (_label, overrides, expected) => {
    expect(codes(annual(overrides))).toContain(expected);
  });
});

describe('validateInput — first-time', () => {
  const program = pack.workflows.firstTime!;
  const base = {
    workflow: 'first-time' as const,
    currency: 'USD',
    assessmentDate: '2026-06-01',
    entries: [
      { id: 'h1', categoryId: 'mock-category-a', amount: '50', date: null, description: null },
    ],
    answers: { 'mock-choice': 'mock-option-1' },
  };

  it('accepts holdings without dates', () => {
    expect(codes(base, program)).toEqual([]);
  });

  it('requires answers to required questions used by the workflow', () => {
    expect(codes({ ...base, answers: {} }, program)).toContain(
      'error:INPUT_MISSING_REQUIRED_ANSWER',
    );
  });

  it('rejects choices outside the allowed list and entries after the assessment date', () => {
    expect(codes({ ...base, answers: { 'mock-choice': 'other' } }, program)).toContain(
      'error:INPUT_INVALID_ANSWER',
    );
    expect(
      codes({ ...base, entries: [{ ...base.entries[0]!, date: '2026-07-01' }] }, program),
    ).toContain('error:INPUT_ENTRY_AFTER_ASSESSMENT_DATE');
    expect(codes({ ...base, assessmentDate: '2026/06/01' }, program)).toContain(
      'error:INPUT_INVALID_DATE',
    );
  });
});

describe('validateInput — missed-year', () => {
  const program = pack.workflows.missedYear!.perYear;
  const year = (start: string, end: string) => ({
    period: { start, end },
    entries: [],
    answers: {},
  });
  const input = (years: MissedYearAssessmentInput['years']): MissedYearAssessmentInput => ({
    workflow: 'missed-year',
    currency: 'USD',
    assessmentDate: '2026-06-01',
    years,
  });

  it('accepts ordered, non-overlapping past periods', () => {
    expect(
      codes(input([year('2024-01-01', '2024-12-31'), year('2025-01-01', '2025-12-31')]), program),
    ).toEqual([]);
  });

  it('rejects empty, unordered, overlapping or future periods', () => {
    expect(codes(input([]), program)).toContain('error:INPUT_NO_YEARS');
    expect(
      codes(input([year('2025-01-01', '2025-12-31'), year('2024-01-01', '2024-12-31')]), program),
    ).toContain('error:INPUT_YEARS_NOT_ORDERED');
    expect(
      codes(input([year('2024-01-01', '2024-12-31'), year('2024-12-31', '2025-06-30')]), program),
    ).toContain('error:INPUT_YEARS_NOT_ORDERED');
    expect(codes(input([year('2026-01-01', '2026-12-31')]), program)).toContain(
      'error:INPUT_YEAR_AFTER_ASSESSMENT_DATE',
    );
  });

  it('rejects an invalid assessment date or period inside the list', () => {
    expect(
      codes({ ...input([year('2024-01-01', '2024-12-31')]), assessmentDate: 'x' }, program),
    ).toContain('error:INPUT_INVALID_DATE');
    expect(codes(input([year('2024-12-31', '2024-01-01')]), program)).toContain(
      'error:INPUT_INVALID_PERIOD',
    );
  });

  it("validates entries per year with that year's period", () => {
    const result = codes(
      input([
        {
          ...year('2024-01-01', '2024-12-31'),
          entries: [
            {
              id: 'x',
              categoryId: 'mock-category-a',
              amount: '1',
              date: '2025-02-01',
              description: null,
            },
          ],
        },
      ]),
      program,
    );
    expect(result).toContain('error:INPUT_ENTRY_OUTSIDE_PERIOD');
  });
});
