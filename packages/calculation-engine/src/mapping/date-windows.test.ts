import { describe, expect, it } from 'vitest';

import type {
  BalanceFact,
  FactMappingRule,
  FinancialFact,
  FinancialFactSheet,
  RulePack,
} from '@khums/shared-types';

import { createMockMappingPack } from '../__fixtures__/mock-mapping-pack';
import { calculate } from '../calculate';
import { evaluate } from '../evaluate/evaluator';
import { validateRulePackStructure } from '../rule-pack/structure';
import { mapFactsToInput } from './map-facts';

// MOCK / NOT FOR PRODUCTION: structural test data only; no value carries religious meaning.
// Phase 4 (decision 78): date windows, out-of-period stops, per-fact percentage adjustments and
// period-length conditions.

const PERIOD = { start: '2025-01-01', end: '2025-12-31' } as const;
const base = { label: null, note: null, currency: 'USD', periodId: null } as const;
const balance = (
  id: string,
  date: string,
  status: 'KNOWN' | 'APPROXIMATE' = 'KNOWN',
): BalanceFact => ({
  ...base,
  id,
  kind: 'BALANCE',
  subtype: 'CASH',
  value: { status: 'KNOWN', amount: '100' },
  valuedOn: { status, date },
});
const sheet = (facts: FinancialFact[]): FinancialFactSheet => ({
  schemaVersion: 1,
  currency: 'USD',
  context: { workflow: 'annual', period: PERIOD },
  facts,
});

const strict = {
  amount: {
    estimated: { handling: 'clarify' },
    range: { handling: 'clarify' },
    unknown: { handling: 'clarify' },
    notProvided: { handling: 'clarify' },
  },
  date: {
    field: 'valuedOn',
    approximate: { handling: 'clarify' },
    unknown: { handling: 'clarify' },
    notProvided: { handling: 'clarify' },
  },
} as const;

/** The mock pack with BALANCE:CASH split into three dated rules. */
function windowedPack(
  changes: (rules: FactMappingRule[]) => FactMappingRule[] = (r) => r,
): RulePack {
  const pack = createMockMappingPack();
  const mapping = pack.factMapping;
  if (mapping === undefined) throw new Error('mock pack has a mapping');
  const dated = (
    id: string,
    window: NonNullable<FactMappingRule['match']['dated']>,
    categoryId: string,
    adjust?: boolean,
  ): FactMappingRule => ({
    id,
    ruleIds: ['mock-rule-mapping'],
    match: { workflows: ['annual'], kinds: ['BALANCE'], subtypes: ['CASH'], dated: window },
    then: {
      action: 'category',
      categoryId,
      ...strict,
      ...(adjust === true
        ? { adjust: { questionId: 'mock-percent', mode: 'ADD_PERCENT' as const } }
        : {}),
    },
  });
  const others = mapping.rules.filter((r) => r.id !== 'mock-map-balance');
  return {
    ...pack,
    questions: [
      ...pack.questions,
      {
        id: 'mock-percent',
        label: 'MOCK / NOT FOR PRODUCTION: a percentage',
        kind: 'decimal',
        choices: [],
        required: false,
        ruleIds: ['mock-rule-mapping'],
      },
    ],
    factMapping: {
      ...mapping,
      outOfPeriod: { handling: 'consult', consultationId: 'mock-fact-consultation' },
      rules: changes([
        dated('mock-in', { window: 'IN_PERIOD' }, 'mock-category-a'),
        dated('mock-start', { window: 'BEFORE_START' }, 'mock-category-b', true),
        dated('mock-after', { window: 'AFTER_END', days: 5 }, 'mock-category-a'),
        ...others,
      ]),
    },
  };
}

const map = (facts: FinancialFact[], answers: Record<string, string> = {}, pack = windowedPack()) =>
  mapFactsToInput(sheet(facts), pack, {
    answers: { 'mock-choice': 'mock-option-1' },
    factAnswers: Object.fromEntries(
      facts.map((f) => [
        f.id,
        { workflow: 'annual' as const, kind: f.kind, subtype: f.subtype, answers },
      ]),
    ),
  });

describe('date windows (Phase 4)', () => {
  it('is structurally valid', () => {
    expect(
      validateRulePackStructure(windowedPack()).issues.filter((i) => i.severity === 'error'),
    ).toEqual([]);
  });

  it('chooses the rule by the fact’s own date and dates the entry inside the period', () => {
    const result = map(
      [balance('in', '2025-06-30'), balance('start', '2024-12-31'), balance('after', '2026-01-05')],
      { 'mock-percent': '10' },
    );
    expect(result.status).toBe('MAPPED');
    const input = result.input;
    if (input?.workflow !== 'annual') throw new Error('annual input');
    expect(input.entries).toEqual([
      {
        id: 'in',
        categoryId: 'mock-category-a',
        amount: '100',
        date: '2025-06-30',
        description: null,
      },
      {
        id: 'start',
        categoryId: 'mock-category-b',
        amount: '100',
        date: '2025-01-01',
        description: null,
        adjustment: { mode: 'ADD_PERCENT', percent: '10' },
      },
      {
        id: 'after',
        categoryId: 'mock-category-a',
        amount: '100',
        date: '2025-12-31',
        description: null,
      },
    ]);
    expect(result.trace.map((t) => t.mappingRuleId)).toEqual([
      'mock-in',
      'mock-start',
      'mock-after',
    ]);
  });

  it('stops a fact dated outside every window, and asks for an exact date', () => {
    const outside = map([balance('late', '2026-01-06')]);
    expect(outside.status).toBe('CONSULTATION_REQUIRED');
    expect(outside.consultations).toEqual([
      { factId: 'late', consultationId: 'mock-fact-consultation' },
    ]);
    const approximate = map([balance('approx', '2025-06-30', 'APPROXIMATE')]);
    expect(approximate.status).toBe('NEEDS_CLARIFICATION');
    expect(approximate.clarifications[0]).toMatchObject({
      reason: 'DATE_APPROXIMATE',
      dateField: 'valuedOn',
    });
  });

  it('asks for a missing or invalid percentage, never assumes one', () => {
    expect(map([balance('s', '2024-12-31')]).clarifications[0]).toMatchObject({
      reason: 'QUESTION_UNANSWERED',
      questionId: 'mock-percent',
    });
    for (const bad of ['-1', 'ten', '1000001']) {
      expect(
        map([balance('s', '2024-12-31')], { 'mock-percent': bad }).clarifications[0],
      ).toMatchObject({ reason: 'QUESTION_ANSWER_INVALID' });
    }
  });

  it('applies the adjustment exactly when the engine totals the category', () => {
    const pack = windowedPack();
    const input = map([balance('start', '2024-12-31')], { 'mock-percent': '12.5' }).input;
    if (input?.workflow !== 'annual') throw new Error('mapped');
    const plain = {
      ...input,
      entries: input.entries.map((e) => ({ ...e, amount: '112.5', adjustment: undefined })),
    };
    const withAdjustment = calculate(input, pack, { mode: 'development' });
    const withoutAdjustment = calculate(
      { ...plain, entries: plain.entries.map(({ adjustment: _a, ...e }) => e) },
      pack,
      { mode: 'development' },
    );
    expect(withAdjustment.ok && withoutAdjustment.ok).toBe(true);
    if (!withAdjustment.ok || !withoutAdjustment.ok) return;
    if (
      withAdjustment.value.workflow !== 'annual' ||
      withoutAdjustment.value.workflow !== 'annual'
    ) {
      throw new Error('annual report');
    }
    // 100 + 12.5% = 112.5: identical to entering 112.5 directly.
    expect(withAdjustment.value.result.outputs).toEqual(withoutAdjustment.value.result.outputs);
  });

  it('refuses overlapping windows, windows outside the annual workflow and bad adjustments', () => {
    const codes = (pack: RulePack) => validateRulePackStructure(pack).issues.map((i) => i.code);
    expect(
      codes(
        windowedPack((rules) =>
          rules.map((r) =>
            r.id === 'mock-after'
              ? { ...r, match: { ...r.match, dated: { window: 'IN_PERIOD' as const } } }
              : r,
          ),
        ),
      ),
    ).toContain('MAPPING_OVERLAPPING_RULES');
    expect(
      codes(
        windowedPack((rules) =>
          rules.map((r) =>
            r.id === 'mock-in'
              ? { ...r, match: { ...r.match, workflows: ['annual', 'first-time'] as const } }
              : r,
          ),
        ),
      ),
    ).toContain('MAPPING_INVALID_DATE_WINDOW');
    expect(
      codes(
        windowedPack((rules) =>
          rules.map((r) =>
            r.id === 'mock-after'
              ? { ...r, match: { ...r.match, dated: { window: 'AFTER_END' as const, days: 40 } } }
              : r,
          ),
        ),
      ),
    ).toContain('MAPPING_INVALID_DATE_WINDOW');
    expect(
      codes(
        windowedPack((rules) =>
          rules.map((r) =>
            r.id === 'mock-start' && r.then.action === 'category'
              ? {
                  ...r,
                  then: {
                    ...r.then,
                    adjust: { questionId: 'mock-choice', mode: 'PERCENT' as const },
                  },
                }
              : r,
          ),
        ),
      ),
    ).toContain('MAPPING_INVALID_ADJUSTMENT');
  });
});

describe('period-length conditions and decimal questions (Phase 4)', () => {
  const pack = createMockMappingPack();
  const ctx = (periodDays: number) => ({
    pack,
    answers: {},
    categorySums: new Map(),
    stepValues: new Map(),
    periodDays,
  });
  const when = (days: number) =>
    evaluate(
      {
        op: 'when',
        condition: { kind: 'periodDays', operator: 'gt', days: 366 },
        then: { op: 'consult', consultationId: 'mock-fact-consultation' },
        otherwise: { op: 'zero' },
      },
      ctx(days),
    );

  it('compares the period length in days', () => {
    expect(when(365)).toMatchObject({ resolved: true });
    expect(when(367)).toMatchObject({ resolved: false });
  });

  it('allows period conditions in the annual program only, and decimal questions per fact only', () => {
    const codes = (p: RulePack) => validateRulePackStructure(p).issues.map((i) => i.code);
    const annual = pack.workflows.annual;
    if (annual === null) throw new Error('annual');
    const periodStep = {
      ...annual.steps[0]!,
      id: 'mock-period-step',
      expression: {
        op: 'when' as const,
        condition: { kind: 'periodDays' as const, operator: 'gt' as const, days: 366 },
        then: { op: 'zero' as const },
        otherwise: { op: 'zero' as const },
      },
    };
    expect(
      codes({
        ...pack,
        workflows: {
          ...pack.workflows,
          annual: { ...annual, steps: [...annual.steps, periodStep] },
        },
      }),
    ).not.toContain('PROGRAM_INVALID_CONDITION');
    const firstTime = pack.workflows.firstTime;
    if (firstTime !== null) {
      expect(
        codes({
          ...pack,
          workflows: {
            ...pack.workflows,
            firstTime: { ...firstTime, steps: [...firstTime.steps, periodStep] },
          },
        }),
      ).toContain('PROGRAM_INVALID_CONDITION');
    }
    const decimal = {
      id: 'mock-percent',
      label: 'MOCK',
      kind: 'decimal' as const,
      choices: [],
      required: true,
      ruleIds: ['mock-rule-mapping'],
    };
    expect(codes({ ...pack, questions: [...pack.questions, decimal] })).toContain(
      'PACK_INVALID_QUESTION',
    );
    const asCondition = {
      ...annual.steps[0]!,
      id: 'mock-decimal-step',
      expression: {
        op: 'when' as const,
        condition: { kind: 'answer' as const, questionId: 'mock-percent', equals: '10' },
        then: { op: 'zero' as const },
        otherwise: { op: 'zero' as const },
      },
    };
    expect(
      codes({
        ...pack,
        questions: [...pack.questions, { ...decimal, required: false }],
        workflows: {
          ...pack.workflows,
          annual: { ...annual, steps: [...annual.steps, asCondition] },
        },
      }),
    ).toContain('PROGRAM_INVALID_CONDITION');
  });
});
