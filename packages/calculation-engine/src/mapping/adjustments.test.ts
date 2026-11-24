import { describe, expect, it } from 'vitest';

import type {
  AmountAdjustment,
  AssetFact,
  FactMappingRule,
  FinancialFactSheet,
  ProgramStep,
  QuestionDefinition,
  RulePack,
} from '@khums/shared-types';

import { createMockMappingPack } from '../__fixtures__/mock-mapping-pack';
import { calculate } from '../calculate';
import { validateRulePackStructure } from '../rule-pack/structure';
import { mapFactsToInput } from './map-facts';

// MOCK / NOT FOR PRODUCTION: structural test data only; no value carries religious meaning.
// Decision 82: ordered per-fact adjustments (asked amount, percentages, fixed percentages) and
// the `divide` operation with its stated rounding.

const PERIOD = { start: '2025-01-01', end: '2025-12-31' } as const;
const asset = (id: string, amount = '1000'): AssetFact => ({
  id,
  label: null,
  note: null,
  currency: 'USD',
  periodId: null,
  kind: 'ASSET',
  subtype: 'OTHER',
  value: { status: 'KNOWN', amount },
  valuedOn: { status: 'KNOWN', date: '2025-06-30' },
  acquiredOn: { status: 'KNOWN', date: '2025-03-01' },
});
const sheet = (facts: AssetFact[]): FinancialFactSheet => ({
  schemaVersion: 1,
  currency: 'USD',
  context: { workflow: 'annual', period: PERIOD },
  facts,
});
const decimalQuestion = (id: string, unit?: 'PERCENT' | 'AMOUNT'): QuestionDefinition => ({
  id,
  label: `MOCK / NOT FOR PRODUCTION: ${id}`,
  kind: 'decimal',
  ...(unit === undefined ? {} : { unit }),
  choices: [],
  required: false,
  ruleIds: ['mock-rule-mapping'],
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

function pack(adjustments: readonly AmountAdjustment[], extraSteps: ProgramStep[] = []): RulePack {
  const base = createMockMappingPack();
  const mapping = base.factMapping;
  const annual = base.workflows.annual;
  if (mapping === undefined || annual === null) throw new Error('fixture');
  const rule: FactMappingRule = {
    id: 'mock-map-asset-other',
    ruleIds: ['mock-rule-mapping'],
    match: { workflows: ['annual'], kinds: ['ASSET'], subtypes: ['OTHER'] },
    then: { action: 'category', categoryId: 'mock-category-a', ...strict, adjustments },
  };
  return {
    ...base,
    questions: [
      ...base.questions,
      decimalQuestion('mock-amount', 'AMOUNT'),
      decimalQuestion('mock-percent'),
      decimalQuestion('mock-portion', 'PERCENT'),
    ],
    parameters: [
      ...base.parameters,
      { id: 'mock-divisor', label: 'MOCK divisor', value: '120', ruleIds: ['mock-rule-c'] },
      { id: 'mock-zero', label: 'MOCK zero', value: '0', ruleIds: ['mock-rule-c'] },
    ],
    workflows: {
      ...base.workflows,
      annual: {
        ...annual,
        steps: [...annual.steps, ...extraSteps],
        outputs: [
          ...annual.outputs,
          ...extraSteps.map((s) => ({ id: `${s.id}-output`, label: s.label, stepId: s.id })),
        ],
      },
    },
    factMapping: {
      ...mapping,
      rules: [rule, ...mapping.rules.filter((r) => !r.match.kinds.includes('ASSET'))],
    },
  };
}

const map = (p: RulePack, answers: Record<string, string>, amount = '1000') =>
  mapFactsToInput(sheet([asset('a', amount)]), p, {
    answers: { 'mock-choice': 'mock-option-1' },
    factAnswers: { a: { workflow: 'annual', kind: 'ASSET', subtype: 'OTHER', answers } },
  });

describe('ordered adjustments (decision 82)', () => {
  const full = pack([
    { questionId: 'mock-amount', mode: 'AMOUNT' },
    { questionId: 'mock-percent', mode: 'ADD_PERCENT' },
    { mode: 'FIXED_PERCENT', percent: '50' },
  ]);

  it('is structurally valid', () => {
    expect(validateRulePackStructure(full).issues.filter((i) => i.severity === 'error')).toEqual(
      [],
    );
  });

  it('takes the asked amount as the entry amount and attaches the percentages in order', () => {
    const result = map(full, { 'mock-amount': '800', 'mock-percent': '10' });
    expect(result.status).toBe('MAPPED');
    const input = result.input;
    if (input?.workflow !== 'annual') throw new Error('annual');
    expect(input.entries[0]).toMatchObject({
      id: 'a',
      amount: '800',
      adjustments: [
        { mode: 'ADD_PERCENT', percent: '10' },
        { mode: 'PERCENT', percent: '50' },
      ],
    });
  });

  it('applies the percentages exactly, in order, when totalling', () => {
    const input = map(full, { 'mock-amount': '800', 'mock-percent': '10' }).input;
    if (input?.workflow !== 'annual') throw new Error('annual');
    const direct = {
      ...input,
      entries: input.entries.map(({ adjustments: _a, ...e }) => ({ ...e, amount: '440' })),
    };
    const a = calculate(input, full, { mode: 'development' });
    const b = calculate(direct, full, { mode: 'development' });
    if (!a.ok || !b.ok || a.value.workflow !== 'annual' || b.value.workflow !== 'annual') {
      throw new Error('calculated');
    }
    // 800 + 10% = 880; 50% of that = 440.
    expect(a.value.result.outputs).toEqual(b.value.result.outputs);
  });

  it('asks for missing or invalid answers, never assumes them', () => {
    expect(map(full, {}).clarifications.map((c) => c.questionId)).toEqual([
      'mock-amount',
      'mock-percent',
    ]);
    for (const bad of ['-1', 'abc', '10.001', '1234567890123456']) {
      expect(
        map(full, { 'mock-amount': bad, 'mock-percent': '1' }).clarifications[0],
      ).toMatchObject({ reason: 'QUESTION_ANSWER_INVALID', questionId: 'mock-amount' });
    }
  });

  it('refuses an amount question in a percentage slot, an amount not first, or both forms', () => {
    const codes = (p: RulePack) => validateRulePackStructure(p).issues.map((i) => i.code);
    expect(codes(pack([{ questionId: 'mock-amount', mode: 'PERCENT' }]))).toContain(
      'MAPPING_INVALID_ADJUSTMENT',
    );
    expect(codes(pack([{ questionId: 'mock-percent', mode: 'AMOUNT' }]))).toContain(
      'MAPPING_INVALID_ADJUSTMENT',
    );
    expect(
      codes(
        pack([
          { mode: 'FIXED_PERCENT', percent: '50' },
          { questionId: 'mock-amount', mode: 'AMOUNT' },
        ]),
      ),
    ).toContain('MAPPING_INVALID_ADJUSTMENT');
    expect(codes(pack([{ mode: 'FIXED_PERCENT', percent: '-5' }]))).toContain(
      'MAPPING_INVALID_ADJUSTMENT',
    );
  });
});

describe('divide (decision 82)', () => {
  const step = (divisor: string, scale: number | 'currency' = 'currency'): ProgramStep => ({
    id: 'mock-divided',
    label: 'MOCK / NOT FOR PRODUCTION: divided',
    ruleIds: ['mock-rule-c'],
    expression: {
      op: 'divide',
      dividend: { op: 'sumCategories', categoryIds: ['mock-category-a'] },
      divisor: { op: 'parameter', parameterId: divisor },
      rounding: { scale, mode: 'HALF_UP' },
    },
    rounding: null,
  });

  it('divides and rounds as stated, at the currency minor units', () => {
    const p = pack([{ mode: 'FIXED_PERCENT', percent: '100' }], [step('mock-divisor')]);
    expect(validateRulePackStructure(p).issues.filter((i) => i.severity === 'error')).toEqual([]);
    const input = map(p, {}, '100').input;
    if (input === null) throw new Error('mapped');
    const result = calculate(input, p, { mode: 'development' });
    if (!result.ok || result.value.workflow !== 'annual') throw new Error('calculated');
    const output = result.value.result.outputs.find((o) => o.id === 'mock-divided-output');
    // 100 ÷ 120 = 0.8333… → 0.83 (HALF_UP, 2 places for USD).
    expect(output?.value).toMatchObject({ amount: '0.83' });
  });

  it('refuses a zero or non-parameter divisor and a bad scale', () => {
    const codes = (s: ProgramStep) =>
      validateRulePackStructure(pack([{ mode: 'FIXED_PERCENT', percent: '100' }], [s])).issues.map(
        (i) => i.code,
      );
    expect(codes(step('mock-zero'))).toContain('PROGRAM_INVALID_DIVISOR');
    const s = step('mock-divisor');
    expect(
      codes({
        ...s,
        expression: {
          op: 'divide',
          dividend: { op: 'zero' },
          divisor: { op: 'sumCategories', categoryIds: ['mock-category-a'] },
          rounding: { scale: 2, mode: 'HALF_UP' },
        },
      }),
    ).toEqual(expect.arrayContaining(['PROGRAM_KIND_MISMATCH']));
    expect(codes(step('mock-divisor', 31))).toContain('PROGRAM_INVALID_ROUNDING');
  });
});
