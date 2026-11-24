import { describe, expect, it } from 'vitest';

import type { Answers, Condition, Expression } from '@khums/shared-types';
import { Decimal } from '@khums/money';

import { createMockRulePack } from '../__fixtures__/mock-rule-pack';
import { evaluate, type Evaluated, type EvaluationContext } from './evaluator';

// MOCK / NOT FOR PRODUCTION: exercises interpreter primitives only.
const pack = createMockRulePack();

const ctx = (answers: Answers = {}, sums: Record<string, string> = {}): EvaluationContext => ({
  pack,
  answers,
  categorySums: new Map(Object.entries(sums).map(([k, v]) => [k, Decimal.of(v)])),
  stepValues: new Map<string, Evaluated>([['prev', { resolved: true, value: Decimal.of('40') }]]),
  periodDays: 365,
});

const value = (e: Expression, c = ctx()) => {
  const r = evaluate(e, c);
  return r.resolved ? r.value.toString() : r.reasons.map((x) => x.id);
};

const lit = (v: string): Expression => ({ op: 'sumCategories', categoryIds: [`lit-${v}`] });
const litCtx = (answers: Answers = {}) =>
  ctx(answers, {
    'lit-10': '10',
    'lit-3': '3',
    'lit-0.1': '0.1',
    'lit-0.2': '0.2',
    'lit-7.5': '7.5',
  });

describe('evaluate — arithmetic primitives (exact decimals)', () => {
  it('sums categories, defaulting missing ones to zero', () => {
    expect(
      value({ op: 'sumCategories', categoryIds: ['lit-0.1', 'lit-0.2', 'absent'] }, litCtx()),
    ).toBe('0.3');
  });

  it('adds, subtracts, multiplies, applies percentages', () => {
    const c = litCtx();
    expect(value({ op: 'add', operands: [lit('10'), lit('0.1')] }, c)).toBe('10.1');
    expect(
      value({ op: 'subtract', minuend: lit('10'), subtrahends: [lit('3'), lit('0.2')] }, c),
    ).toBe('6.8');
    expect(
      value(
        {
          op: 'multiply',
          value: lit('7.5'),
          factor: { op: 'parameter', parameterId: 'mock-rate' },
        },
        c,
      ),
    ).toBe('93.75');
    expect(
      value(
        { op: 'percentage', of: lit('10'), rate: { op: 'parameter', parameterId: 'mock-rate' } },
        c,
      ),
    ).toBe('1.25');
  });

  it('computes min, max, zero and step references', () => {
    const c = litCtx();
    expect(value({ op: 'max', operands: [lit('3'), lit('10'), lit('7.5')] }, c)).toBe('10');
    expect(value({ op: 'min', operands: [lit('3'), lit('10'), { op: 'zero' }] }, c)).toBe('0');
    expect(value({ op: 'step', stepId: 'prev' }, c)).toBe('40');
  });
});

describe('evaluate — conditions and unresolved propagation', () => {
  const when = (condition: Condition): Expression => ({
    op: 'when',
    condition,
    then: lit('10'),
    otherwise: lit('3'),
  });

  it('branches on answers and comparisons', () => {
    expect(
      value(
        when({ kind: 'answer', questionId: 'mock-flag', equals: true }),
        litCtx({ 'mock-flag': true }),
      ),
    ).toBe('10');
    expect(
      value(
        when({ kind: 'answer', questionId: 'mock-flag', equals: true }),
        litCtx({ 'mock-flag': false }),
      ),
    ).toBe('3');
    expect(
      value(when({ kind: 'compare', left: lit('10'), operator: 'gt', right: lit('3') }), litCtx()),
    ).toBe('10');
    expect(
      value(when({ kind: 'compare', left: lit('3'), operator: 'gte', right: lit('10') }), litCtx()),
    ).toBe('3');
    expect(
      value(when({ kind: 'compare', left: lit('3'), operator: 'eq', right: lit('3') }), litCtx()),
    ).toBe('10');
    expect(
      value(when({ kind: 'compare', left: lit('3'), operator: 'lte', right: lit('3') }), litCtx()),
    ).toBe('10');
    expect(
      value(when({ kind: 'compare', left: lit('3'), operator: 'lt', right: lit('3') }), litCtx()),
    ).toBe('3');
  });

  it('reports a missing answer only when it decides the outcome (three-valued logic)', () => {
    const missing = { kind: 'answer', questionId: 'mock-flag', equals: true } as const;
    const falseCond = {
      kind: 'compare',
      left: lit('3'),
      operator: 'gt',
      right: lit('10'),
    } as const;
    const trueCond = { kind: 'compare', left: lit('10'), operator: 'gt', right: lit('3') } as const;
    expect(value(when({ kind: 'all', conditions: [missing, falseCond] }), litCtx())).toBe('3');
    expect(value(when({ kind: 'any', conditions: [missing, trueCond] }), litCtx())).toBe('10');
    expect(value(when({ kind: 'all', conditions: [missing, trueCond] }), litCtx())).toEqual([
      'missing-answer:mock-flag',
    ]);
    expect(value(when({ kind: 'not', condition: missing }), litCtx())).toEqual([
      'missing-answer:mock-flag',
    ]);
    expect(value(when({ kind: 'not', condition: falseCond }), litCtx())).toBe('10');
  });

  it('evaluates branches lazily: a consult in the unselected branch never fires', () => {
    const expr: Expression = {
      op: 'when',
      condition: { kind: 'answer', questionId: 'mock-flag', equals: true },
      then: { op: 'consult', consultationId: 'mock-consultation' },
      otherwise: lit('3'),
    };
    expect(value(expr, litCtx({ 'mock-flag': false }))).toBe('3');
    expect(value(expr, litCtx({ 'mock-flag': true }))).toEqual(['mock-consultation']);
  });

  it('propagates unresolved reasons through arithmetic, merging duplicates', () => {
    const consult: Expression = { op: 'consult', consultationId: 'mock-consultation' };
    expect(value({ op: 'add', operands: [lit('10'), consult, consult] }, litCtx())).toEqual([
      'mock-consultation',
    ]);
    expect(
      value(
        { op: 'percentage', of: consult, rate: { op: 'parameter', parameterId: 'mock-rate' } },
        litCtx(),
      ),
    ).toEqual(['mock-consultation']);
  });
});
