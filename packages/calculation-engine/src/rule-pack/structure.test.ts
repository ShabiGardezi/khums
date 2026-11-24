import { describe, expect, it } from 'vitest';

import type { Expression, RulePack } from '@khums/shared-types';

import { createMockRulePack } from '../__fixtures__/mock-rule-pack';
import { validateRulePackStructure } from './structure';

const codes = (pack: RulePack) => validateRulePackStructure(pack).issues.map((i) => i.code);

const withAnnualStep = (expression: Expression): RulePack => {
  const pack = createMockRulePack();
  const annual = pack.workflows.annual!;
  return {
    ...pack,
    workflows: {
      ...pack.workflows,
      annual: {
        ...annual,
        steps: [
          ...annual.steps,
          { id: 'extra', label: 'extra', ruleIds: ['mock-rule-a'], expression, rounding: null },
        ],
      },
    },
  };
};

describe('validateRulePackStructure', () => {
  it('accepts the MOCK fixture and infers step kinds', () => {
    const report = validateRulePackStructure(createMockRulePack());
    expect(report.issues).toEqual([]);
    expect(report.stepKinds.annual.get('mock-gross')).toBe('money');
    expect(report.stepKinds.annual.get('mock-share')).toBe('money');
  });

  it('never allows a mock pack to be approved or published', () => {
    const pack = createMockRulePack();
    expect(codes({ ...pack, metadata: { ...pack.metadata, status: 'PUBLISHED' } })).toContain(
      'PACK_MOCK_CANNOT_BE_APPROVED',
    );
  });

  it('validates metadata', () => {
    const pack = createMockRulePack();
    expect(codes({ ...pack, metadata: { ...pack.metadata, version: 'v1' } })).toContain(
      'PACK_INVALID_METADATA',
    );
    expect(
      codes({
        ...pack,
        metadata: { ...pack.metadata, effectiveFrom: '2026-01-01', effectiveTo: '2025-01-01' },
      }),
    ).toContain('PACK_INVALID_METADATA');
  });

  it('detects duplicate ids, unknown sources and unknown rules', () => {
    const pack = createMockRulePack();
    expect(codes({ ...pack, sources: [...pack.sources, pack.sources[0]!] })).toContain(
      'PACK_DUPLICATE_ID',
    );
    expect(
      codes({ ...pack, rules: [{ ...pack.rules[0]!, id: 'r-x', sourceRefs: ['missing-source'] }] }),
    ).toContain('PACK_UNKNOWN_SOURCE');
    expect(
      codes({ ...pack, parameters: [{ ...pack.parameters[0]!, ruleIds: ['no-such-rule'] }] }),
    ).toContain('PACK_UNKNOWN_RULE');
  });

  it('accepts packs that define only some workflows', () => {
    const pack = createMockRulePack();
    expect(
      codes({
        ...pack,
        workflows: { annual: pack.workflows.annual, firstTime: null, missedYear: null },
      }),
    ).toEqual([]);
  });

  it('rejects boolean questions with choices and duplicate choices', () => {
    const pack = createMockRulePack();
    expect(
      codes({
        ...pack,
        questions: [{ ...pack.questions[0]!, choices: ['x'] }, pack.questions[1]!],
      }),
    ).toContain('PACK_INVALID_QUESTION');
    expect(
      codes({
        ...pack,
        questions: [pack.questions[0]!, { ...pack.questions[1]!, choices: ['a', 'a'] }],
      }),
    ).toContain('PACK_INVALID_QUESTION');
  });

  it('rejects non-decimal parameter values and malformed questions', () => {
    const pack = createMockRulePack();
    expect(codes({ ...pack, parameters: [{ ...pack.parameters[0]!, value: '1e2' }] })).toContain(
      'PACK_INVALID_PARAMETER_VALUE',
    );
    expect(
      codes({
        ...pack,
        questions: [{ ...pack.questions[1]!, choices: ['only-one'] }, pack.questions[0]!],
      }),
    ).toContain('PACK_INVALID_QUESTION');
  });

  it.each<[string, Expression, string]>([
    [
      'unknown category',
      { op: 'sumCategories', categoryIds: ['nope'] },
      'PROGRAM_UNKNOWN_CATEGORY',
    ],
    ['unknown parameter', { op: 'parameter', parameterId: 'nope' }, 'PROGRAM_UNKNOWN_PARAMETER'],
    ['unknown step', { op: 'step', stepId: 'nope' }, 'PROGRAM_UNKNOWN_STEP'],
    [
      'unknown consultation',
      { op: 'consult', consultationId: 'nope' },
      'PROGRAM_UNKNOWN_CONSULTATION',
    ],
    [
      'money + scalar',
      { op: 'add', operands: [{ op: 'zero' }, { op: 'parameter', parameterId: 'mock-rate' }] },
      'PROGRAM_KIND_MISMATCH',
    ],
    [
      'money rate',
      { op: 'percentage', of: { op: 'zero' }, rate: { op: 'zero' } },
      'PROGRAM_KIND_MISMATCH',
    ],
    ['empty add', { op: 'add', operands: [] }, 'PROGRAM_EMPTY_OPERANDS'],
    [
      'invalid answer value',
      {
        op: 'when',
        condition: { kind: 'answer', questionId: 'mock-choice', equals: 'not-a-choice' },
        then: { op: 'zero' },
        otherwise: { op: 'zero' },
      },
      'PROGRAM_INVALID_ANSWER_VALUE',
    ],
    [
      'unknown question',
      {
        op: 'when',
        condition: { kind: 'not', condition: { kind: 'answer', questionId: 'nope', equals: true } },
        then: { op: 'zero' },
        otherwise: { op: 'zero' },
      },
      'PROGRAM_UNKNOWN_QUESTION',
    ],
  ])('detects %s', (_label, expression, code) => {
    expect(codes(withAnnualStep(expression))).toContain(code);
  });

  it('detects forward references, duplicate steps, bad rounding and output problems', () => {
    const pack = createMockRulePack();
    const annual = pack.workflows.annual!;
    const [first, second, third] = annual.steps;
    const reordered: RulePack = {
      ...pack,
      workflows: { ...pack.workflows, annual: { ...annual, steps: [second!, first!, third!] } },
    };
    expect(codes(reordered)).toContain('PROGRAM_FORWARD_REFERENCE');

    const duplicated: RulePack = {
      ...pack,
      workflows: { ...pack.workflows, annual: { ...annual, steps: [first!, first!] } },
    };
    expect(codes(duplicated)).toContain('PROGRAM_DUPLICATE_STEP');

    const badRounding: RulePack = {
      ...pack,
      workflows: {
        ...pack.workflows,
        annual: {
          ...annual,
          steps: [{ ...first!, rounding: { scale: 31, mode: 'UP' } }, second!, third!],
        },
      },
    };
    expect(codes(badRounding)).toContain('PROGRAM_INVALID_ROUNDING');

    const scalarOutput: RulePack = {
      ...pack,
      parameters: pack.parameters,
      workflows: {
        ...pack.workflows,
        annual: {
          steps: [
            {
              id: 's',
              label: 's',
              ruleIds: [],
              expression: { op: 'parameter', parameterId: 'mock-rate' },
              rounding: null,
            },
          ],
          outputs: [
            { id: 'o', label: 'o', stepId: 's' },
            { id: 'o', label: 'o', stepId: 'missing' },
          ],
        },
      },
    };
    const scalarCodes = codes(scalarOutput);
    expect(scalarCodes).toContain('PROGRAM_OUTPUT_NOT_MONEY');
    expect(scalarCodes).toContain('PROGRAM_DUPLICATE_OUTPUT');
    expect(scalarCodes).toContain('PROGRAM_UNKNOWN_OUTPUT_STEP');

    const noOutputs: RulePack = {
      ...pack,
      workflows: { ...pack.workflows, annual: { ...annual, outputs: [] } },
    };
    expect(codes(noOutputs)).toContain('PROGRAM_NO_OUTPUTS');
  });

  it('checks missed-year aggregate outputs', () => {
    const pack = createMockRulePack();
    const missedYear = pack.workflows.missedYear!;
    expect(
      codes({
        ...pack,
        workflows: {
          ...pack.workflows,
          missedYear: { ...missedYear, aggregateOutputIds: ['nope'] },
        },
      }),
    ).toContain('PROGRAM_UNKNOWN_AGGREGATE_OUTPUT');
  });

  it('rejects malformed effective dates', () => {
    const pack = createMockRulePack();
    expect(
      codes({ ...pack, metadata: { ...pack.metadata, effectiveFrom: '2026/01/01' } }),
    ).toContain('PACK_INVALID_METADATA');
    expect(codes({ ...pack, metadata: { ...pack.metadata, effectiveTo: 'soon' } })).toContain(
      'PACK_INVALID_METADATA',
    );
  });

  it.each<[string, Expression, string]>([
    [
      'subtract mixing kinds',
      {
        op: 'subtract',
        minuend: { op: 'zero' },
        subtrahends: [{ op: 'parameter', parameterId: 'mock-rate' }],
      },
      'PROGRAM_KIND_MISMATCH',
    ],
    [
      'money multiplication factor',
      { op: 'multiply', value: { op: 'zero' }, factor: { op: 'zero' } },
      'PROGRAM_KIND_MISMATCH',
    ],
    [
      'unknown reference inside multiply',
      {
        op: 'multiply',
        value: { op: 'step', stepId: 'nope' },
        factor: { op: 'parameter', parameterId: 'mock-rate' },
      },
      'PROGRAM_UNKNOWN_STEP',
    ],
    [
      'unknown reference inside percentage',
      { op: 'percentage', of: { op: 'zero' }, rate: { op: 'parameter', parameterId: 'nope' } },
      'PROGRAM_UNKNOWN_PARAMETER',
    ],
    [
      'comparison mixing kinds',
      {
        op: 'when',
        condition: {
          kind: 'all',
          conditions: [
            {
              kind: 'any',
              conditions: [
                {
                  kind: 'compare',
                  left: { op: 'zero' },
                  operator: 'gt',
                  right: { op: 'parameter', parameterId: 'mock-rate' },
                },
              ],
            },
          ],
        },
        then: { op: 'zero' },
        otherwise: { op: 'zero' },
      },
      'PROGRAM_KIND_MISMATCH',
    ],
    [
      'boolean question compared with a string',
      {
        op: 'when',
        condition: { kind: 'answer', questionId: 'mock-flag', equals: 'yes' },
        then: { op: 'zero' },
        otherwise: { op: 'zero' },
      },
      'PROGRAM_INVALID_ANSWER_VALUE',
    ],
    ['empty category list', { op: 'sumCategories', categoryIds: [] }, 'PROGRAM_EMPTY_OPERANDS'],
    [
      'empty subtrahends',
      { op: 'subtract', minuend: { op: 'zero' }, subtrahends: [] },
      'PROGRAM_EMPTY_OPERANDS',
    ],
  ])('detects %s', (_label, expression, code) => {
    expect(codes(withAnnualStep(expression))).toContain(code);
  });

  it('infers "any" for pure consultation steps and accepts them as outputs', () => {
    const pack = createMockRulePack();
    const consultOnly: RulePack = {
      ...pack,
      workflows: {
        ...pack.workflows,
        annual: {
          steps: [
            {
              id: 'stop',
              label: 'MOCK stop',
              ruleIds: ['mock-rule-c'],
              expression: { op: 'consult', consultationId: 'mock-consultation' },
              rounding: null,
            },
            {
              id: 'scaled',
              label: 'MOCK',
              ruleIds: ['mock-rule-c'],
              expression: {
                op: 'multiply',
                value: { op: 'step', stepId: 'stop' },
                factor: { op: 'parameter', parameterId: 'mock-rate' },
              },
              rounding: null,
            },
          ],
          outputs: [{ id: 'o', label: 'MOCK', stepId: 'scaled' }],
        },
      },
    };
    const report = validateRulePackStructure(consultOnly);
    expect(report.issues).toEqual([]);
    expect(report.stepKinds.annual.get('stop')).toBe('any');
  });
});
