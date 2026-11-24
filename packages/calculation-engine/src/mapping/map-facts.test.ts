import { describe, expect, it } from 'vitest';

import type { BalanceFact, FinancialFact, FinancialFactSheet, RulePack } from '@khums/shared-types';

import { createMockRulePack } from '../__fixtures__/mock-rule-pack';
import { createMockMappingPack } from '../__fixtures__/mock-mapping-pack';
import { calculate } from '../calculate';
import mapFactsSource from './map-facts.ts?raw';
import structureSource from './structure.ts?raw';
import { mapFactsToInput } from './map-facts';

// MOCK / NOT FOR PRODUCTION: structural test data only; no value carries religious meaning.
const base = { label: null, note: null, currency: 'USD', periodId: null } as const;
const balance = (id: string, value: FinancialFact['value'], date = '2026-06-30'): BalanceFact => ({
  ...base,
  id,
  kind: 'BALANCE',
  subtype: 'CASH',
  value,
  valuedOn: { status: 'KNOWN', date },
});
const sheet = (
  facts: FinancialFact[],
  context?: FinancialFactSheet['context'],
): FinancialFactSheet => ({
  schemaVersion: 1,
  currency: 'USD',
  context: context ?? { workflow: 'annual', period: { start: '2025-07-01', end: '2026-06-30' } },
  facts,
});
const loanAnswers = (answers: Record<string, boolean | string>) => ({
  workflow: 'annual' as const,
  kind: 'LIABILITY' as const,
  subtype: 'LOAN',
  answers,
});
const map = (s: FinancialFactSheet, pack: RulePack = createMockMappingPack(), factAnswers = {}) =>
  mapFactsToInput(s, pack, { answers: { 'mock-choice': 'mock-option-1' }, factAnswers });

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('mapFactsToInput', () => {
  it('maps facts to pack categories, copying decimal strings unchanged, with a full trace', () => {
    const result = map(
      sheet([
        balance('fact-1', { status: 'KNOWN', amount: '1200.50' }),
        balance('fact-2', { status: 'ESTIMATED', amount: '0.10' }),
        {
          ...base,
          id: 'fact-3',
          kind: 'EXPENSE',
          subtype: 'HOUSEHOLD',
          value: { status: 'KNOWN', amount: '50' },
          paidOn: { status: 'KNOWN', date: '2026-01-01' },
        },
      ]),
    );
    expect(result.status).toBe('MAPPED');
    expect(result.input).toEqual({
      workflow: 'annual',
      currency: 'USD',
      period: { start: '2025-07-01', end: '2026-06-30' },
      entries: [
        {
          id: 'fact-1',
          categoryId: 'mock-category-a',
          amount: '1200.50',
          date: '2026-06-30',
          description: null,
        },
        {
          id: 'fact-2',
          categoryId: 'mock-category-a',
          amount: '0.10',
          date: '2026-06-30',
          description: null,
        },
      ],
      answers: { 'mock-choice': 'mock-option-1' },
    });
    expect(result.trace.map((t) => [t.factId, t.mappingRuleId, t.outcome, t.amount])).toEqual([
      ['fact-1', 'mock-map-balance', 'ENTRY', '1200.50'],
      ['fact-2', 'mock-map-balance', 'ENTRY', '0.10'],
      ['fact-3', 'mock-map-household', 'EXCLUDED', null],
    ]);
    expect(result.trace[0]?.ruleIds).toEqual(['mock-rule-mapping']);
    expect(result.pack).toEqual({
      packId: 'mock-mapping-pack',
      version: '0.1.0',
      contentDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      mappingVersion: 1,
    });
  });

  it('never modifies the source facts and is deterministic', () => {
    const facts = deepFreeze(
      sheet([
        balance('fact-1', { status: 'KNOWN', amount: '1.005' }),
        balance('fact-2', { status: 'RANGE', min: '1', max: '2' }),
      ]),
    );
    const before = JSON.stringify(facts);
    const first = map(facts);
    const second = map(facts);
    expect(JSON.stringify(facts)).toBe(before);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('keeps full decimal precision (no rounding to currency or float conversion)', () => {
    const result = map(
      sheet([balance('fact-1', { status: 'KNOWN', amount: '123456789012345.99' })]),
    );
    expect(result.input?.workflow === 'annual' && result.input.entries[0]?.amount).toBe(
      '123456789012345.99',
    );
  });

  it('asks for clarification for unknown or missing amounts and for uncertain dates', () => {
    const result = map(
      sheet([
        balance('fact-1', { status: 'UNKNOWN' }),
        balance('fact-2', { status: 'NOT_PROVIDED' }),
        balance('fact-3', { status: 'RANGE', min: '1', max: '2' }),
        {
          ...balance('fact-4', { status: 'KNOWN', amount: '5' }),
          valuedOn: { status: 'APPROXIMATE', date: '2026-01-01' },
        },
      ]),
    );
    expect(result.status).toBe('NEEDS_CLARIFICATION');
    expect(result.input).toBeNull();
    expect(result.clarifications).toEqual([
      { factId: 'fact-1', reason: 'AMOUNT_UNKNOWN', dateField: null, questionId: null },
      { factId: 'fact-2', reason: 'AMOUNT_NOT_PROVIDED', dateField: null, questionId: null },
      { factId: 'fact-3', reason: 'AMOUNT_RANGE', dateField: null, questionId: null },
      { factId: 'fact-4', reason: 'DATE_APPROXIMATE', dateField: 'valuedOn', questionId: null },
    ]);
  });

  it('uses uncertain values only where the pack explicitly says so', () => {
    const asset = (
      value: FinancialFact['value'],
      acquiredOn: FinancialFact extends never ? never : object,
    ) => ({
      ...base,
      id: 'fact-1',
      kind: 'ASSET' as const,
      subtype: 'PRECIOUS_METAL',
      value,
      valuedOn: { status: 'KNOWN' as const, date: '2026-06-30' },
      acquiredOn,
    });
    const ranged = map(
      sheet([
        asset(
          { status: 'RANGE', min: '10.25', max: '20.75' },
          { status: 'APPROXIMATE', date: '2020-01-01' },
        ) as FinancialFact,
      ]),
    );
    expect(ranged.status).toBe('MAPPED');
    expect(ranged.input?.workflow === 'annual' && ranged.input.entries[0]).toMatchObject({
      amount: '20.75',
      date: '2020-01-01',
    });
    const estimated = map(
      sheet([
        asset(
          { status: 'ESTIMATED', amount: '5' },
          { status: 'KNOWN', date: '2020-01-01' },
        ) as FinancialFact,
      ]),
    );
    expect(estimated.status).toBe('CONSULTATION_REQUIRED');
    expect(estimated.consultations).toEqual([
      { factId: 'fact-1', consultationId: 'mock-fact-consultation' },
    ]);
  });

  it('stops for consultation for unmatched (unsupported) fact types — never ignored or defaulted', () => {
    const vehicle: FinancialFact = {
      ...base,
      id: 'fact-9',
      kind: 'ASSET',
      subtype: 'VEHICLE',
      value: { status: 'KNOWN', amount: '100' },
      valuedOn: { status: 'KNOWN', date: '2026-06-30' },
      acquiredOn: { status: 'KNOWN', date: '2020-01-01' },
    };
    const result = map(sheet([vehicle]));
    expect(result.status).toBe('CONSULTATION_REQUIRED');
    expect(result.consultations).toEqual([
      { factId: 'fact-9', consultationId: 'mock-unmatched-consultation' },
    ]);
    expect(result.trace[0]).toMatchObject({ mappingRuleId: null, outcome: 'CONSULTATION' });
  });

  it('asks per-fact questions, follows the answer, and stops on an unexpected answer', () => {
    const loan: FinancialFact = {
      ...base,
      id: 'fact-5',
      kind: 'LIABILITY',
      subtype: 'LOAN',
      value: { status: 'KNOWN', amount: '300' },
      valuedOn: { status: 'KNOWN', date: '2026-06-30' },
      incurredOn: { status: 'UNKNOWN' },
      dueOn: { status: 'NOT_PROVIDED' },
    };
    expect(map(sheet([loan])).clarifications).toEqual([
      {
        factId: 'fact-5',
        reason: 'QUESTION_UNANSWERED',
        dateField: null,
        questionId: 'mock-fact-question',
      },
    ]);
    const yes = map(sheet([loan]), undefined, {
      'fact-5': loanAnswers({ 'mock-fact-question': true }),
    });
    expect(yes.status).toBe('MAPPED');
    expect(yes.trace[0]).toMatchObject({
      outcome: 'ENTRY',
      categoryId: 'mock-category-c',
      answeredQuestionIds: ['mock-fact-question'],
    });
    const no = map(sheet([loan]), undefined, {
      'fact-5': loanAnswers({ 'mock-fact-question': false }),
    });
    expect(no.trace[0]?.outcome).toBe('EXCLUDED');
    const odd = map(sheet([loan]), undefined, {
      'fact-5': loanAnswers({ 'mock-fact-question': 'maybe' }),
    });
    // Not a valid value for a yes/no question: asked again, never guessed.
    expect(odd.status).toBe('NEEDS_CLARIFICATION');
    expect(odd.clarifications).toEqual([
      {
        factId: 'fact-5',
        reason: 'QUESTION_ANSWER_INVALID',
        dateField: null,
        questionId: 'mock-fact-question',
      },
    ]);
  });

  it('never converts currencies: a fact in another currency is unsupported', () => {
    const result = map(
      sheet([{ ...balance('fact-1', { status: 'KNOWN', amount: '5' }), currency: 'PKR' }]),
    );
    expect(result.status).toBe('UNSUPPORTED');
    expect(result.unsupported).toEqual([
      { factId: 'fact-1', code: 'CURRENCY_CONVERSION_UNSUPPORTED' },
    ]);
    expect(result.input).toBeNull();
  });

  it('refuses packs without a mapping, unsupported versions and unknown workflows', () => {
    expect(map(sheet([]), createMockRulePack()).unsupported).toEqual([
      { factId: null, code: 'MAPPING_NOT_DEFINED' },
    ]);
    const pack = createMockMappingPack();
    const v2 = {
      ...pack,
      factMapping: { ...pack.factMapping!, mappingVersion: 2 as unknown as 1 },
    };
    expect(map(sheet([]), v2).unsupported[0]?.code).toBe('MAPPING_VERSION_UNSUPPORTED');
    const newerFacts = { ...sheet([]), schemaVersion: 2 as unknown as 1 };
    expect(map(newerFacts).unsupported[0]?.code).toBe('FACT_SHEET_VERSION_UNSUPPORTED');
    const noAnnual = { ...pack, workflows: { ...pack.workflows, annual: null } };
    expect(map(sheet([]), noAnnual).unsupported[0]?.code).toBe('WORKFLOW_NOT_SUPPORTED');
  });

  const missedSheet = sheet(
    [{ ...balance('fact-1', { status: 'KNOWN', amount: '7' }, '2024-06-30'), periodId: 'p1' }],
    {
      workflow: 'missed-year',
      assessmentDate: '2026-06-30',
      periods: [
        { id: 'p1', start: '2024-01-01', end: '2024-12-31' },
        { id: 'p2', start: '2025-01-01', end: '2025-12-31' },
      ],
    },
  );

  it('builds missed-year and first-time inputs from the fact context', () => {
    const missed = mapFactsToInput(missedSheet, createMockMappingPack(), {
      answers: {},
      factAnswers: {},
      yearAnswers: {
        p1: { 'mock-choice': 'mock-option-1' },
        p2: { 'mock-choice': 'mock-option-2' },
      },
    });
    expect(
      missed.input?.workflow === 'missed-year' && missed.input.years.map((y) => y.entries.length),
    ).toEqual([1, 0]);
    // Decision 62: each year gets exactly its own answers.
    expect(
      missed.input?.workflow === 'missed-year' && missed.input.years.map((y) => y.answers),
    ).toEqual([{ 'mock-choice': 'mock-option-1' }, { 'mock-choice': 'mock-option-2' }]);
    const first = map(
      sheet([balance('fact-1', { status: 'KNOWN', amount: '7' })], {
        workflow: 'first-time',
        assessmentDate: '2026-06-30',
      }),
    );
    expect(first.input).toMatchObject({ workflow: 'first-time', assessmentDate: '2026-06-30' });
  });

  it('decision 62: a year without answers gets none, never another year’s', () => {
    const result = mapFactsToInput(missedSheet, createMockMappingPack(), {
      answers: {},
      factAnswers: {},
      yearAnswers: { p1: { 'mock-choice': 'mock-option-1' } },
    });
    expect(
      result.input?.workflow === 'missed-year' && result.input.years.map((y) => y.answers),
    ).toEqual([{ 'mock-choice': 'mock-option-1' }, {}]);
  });

  it('decision 62: an inherited property is never taken as a year’s answers', () => {
    const inherited = sheet(
      [
        {
          ...balance('fact-1', { status: 'KNOWN', amount: '7' }, '2024-06-30'),
          periodId: 'constructor',
        },
      ],
      {
        workflow: 'missed-year',
        assessmentDate: '2026-06-30',
        periods: [{ id: 'constructor', start: '2024-01-01', end: '2024-12-31' }],
      },
    );
    const result = mapFactsToInput(inherited, createMockMappingPack(), {
      answers: {},
      factAnswers: {},
      yearAnswers: {},
    });
    expect(result.input?.workflow === 'missed-year' && result.input.years[0]?.answers).toEqual({});
  });

  it('decision 62: answers in the wrong scope are refused', () => {
    const pack = createMockMappingPack();
    const code = (r: ReturnType<typeof mapFactsToInput>) => r.unsupported.map((u) => u.code);
    // Shared answers for a missed-year sheet would apply to every year.
    expect(
      code(
        mapFactsToInput(missedSheet, pack, { answers: { 'mock-choice': 'x' }, factAnswers: {} }),
      ),
    ).toEqual(['ANSWERS_SCOPE_MISMATCH']);
    // A period that is not in the sheet.
    expect(
      code(
        mapFactsToInput(missedSheet, pack, {
          answers: {},
          factAnswers: {},
          yearAnswers: { p9: {} },
        }),
      ),
    ).toEqual(['ANSWERS_SCOPE_MISMATCH']);
    // Per-year answers for an annual sheet.
    const annual = mapFactsToInput(sheet([]), pack, {
      answers: {},
      factAnswers: {},
      yearAnswers: { p1: {} },
    });
    expect(code(annual)).toEqual(['ANSWERS_SCOPE_MISMATCH']);
    expect(annual.input).toBeNull();
  });

  it('produces input the engine accepts (MOCK development calculation only)', () => {
    const result = map(sheet([balance('fact-1', { status: 'KNOWN', amount: '100' })]));
    if (result.input === null) throw new Error('expected input');
    const report = calculate(result.input, createMockMappingPack(), { mode: 'development' });
    expect(report.ok).toBe(true);
    if (report.ok) expect(report.value.meta.guidance).toBe('NOT_RELIGIOUS_GUIDANCE');
  });

  it('contains no rates, formulas or religious terms in the mapping code', () => {
    for (const raw of [mapFactsSource, structureSource]) {
      const source = raw.replaceAll('@khums/', '@pkg/'); // package scope, not a religious term
      expect(source).not.toMatch(/\d+(\.\d+)?\s*%|khums|zakat|liable|deductible|exempt|nisab/i);
    }
    // The interpreter copies amounts; it never does arithmetic (the program aggregates).
    expect(mapFactsSource).not.toMatch(
      /\.(add|subtract|multiply|percentage|round|roundToCurrency)\(/,
    );
  });
});
