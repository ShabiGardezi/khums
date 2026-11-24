import { describe, expect, it } from 'vitest';

import type { Program } from '@khums/shared-types';

import { collectReferences } from './references';

describe('collectReferences', () => {
  it('collects every category, parameter, question and consultation a program depends on', () => {
    const program: Program = {
      steps: [
        {
          id: 's1',
          label: 'MOCK',
          ruleIds: [],
          rounding: null,
          expression: {
            op: 'when',
            condition: {
              kind: 'all',
              conditions: [
                { kind: 'answer', questionId: 'q1', equals: true },
                {
                  kind: 'any',
                  conditions: [
                    { kind: 'not', condition: { kind: 'answer', questionId: 'q2', equals: 'x' } },
                  ],
                },
                {
                  kind: 'compare',
                  left: { op: 'sumCategories', categoryIds: ['c1'] },
                  operator: 'gt',
                  right: { op: 'zero' },
                },
              ],
            },
            then: {
              op: 'subtract',
              minuend: {
                op: 'multiply',
                value: { op: 'sumCategories', categoryIds: ['c2'] },
                factor: { op: 'parameter', parameterId: 'p1' },
              },
              subtrahends: [
                {
                  op: 'min',
                  operands: [
                    { op: 'step', stepId: 'x' },
                    { op: 'sumCategories', categoryIds: ['c3'] },
                  ],
                },
              ],
            },
            otherwise: {
              op: 'max',
              operands: [
                {
                  op: 'percentage',
                  of: { op: 'zero' },
                  rate: { op: 'parameter', parameterId: 'p2' },
                },
                { op: 'add', operands: [{ op: 'consult', consultationId: 'k1' }] },
              ],
            },
          },
        },
      ],
      outputs: [],
    };
    const refs = collectReferences(program);
    expect([...refs.categoryIds].sort()).toEqual(['c1', 'c2', 'c3']);
    expect([...refs.parameterIds].sort()).toEqual(['p1', 'p2']);
    expect([...refs.questionIds].sort()).toEqual(['q1', 'q2']);
    expect([...refs.consultationIds]).toEqual(['k1']);
  });
});
