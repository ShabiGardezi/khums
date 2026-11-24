import { describe, expect, it } from 'vitest';

import type {
  AnnualAssessmentInput,
  CalculationReport,
  FirstTimeAssessmentInput,
  MissedYearAssessmentInput,
  RulePack,
} from '@khums/shared-types';

import {
  activationFor,
  createApprovedTestPack,
  createMockRulePack,
  sealApproved,
} from './__fixtures__/mock-rule-pack';
import { calculate, DEVELOPMENT_DISCLAIMER, ENGINE_VERSION } from './index';

// ███ All packs below are MOCK / NOT FOR PRODUCTION. Figures are interpreter checks, not rulings. ███

const entry = (
  id: string,
  categoryId: string,
  amount: string,
  date: string | null = '2026-03-01',
) => ({
  id,
  categoryId,
  amount,
  date,
  description: null,
});

const annualInput = (overrides: Partial<AnnualAssessmentInput> = {}): AnnualAssessmentInput => ({
  workflow: 'annual',
  currency: 'USD',
  period: { start: '2026-01-01', end: '2026-12-31' },
  entries: [
    entry('a1', 'mock-category-a', '1000.01'),
    entry('b1', 'mock-category-b', '234.56'),
    entry('c1', 'mock-category-c', '100'),
  ],
  answers: { 'mock-flag': false },
  ...overrides,
});

const dev = { mode: 'development' } as const;

function expectSingle(report: CalculationReport) {
  if (report.workflow === 'missed-year') throw new Error('expected single-period report');
  return report;
}

describe('calculate — annual workflow (development mode, MOCK pack)', () => {
  it('evaluates the pack program exactly, with a traceable breakdown', () => {
    const result = calculate(annualInput(), createMockRulePack(), dev);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = expectSingle(result.value);
    expect(report.result.status).toBe('COMPLETED');
    expect(report.result.outputs).toEqual([
      {
        id: 'mock-net-output',
        label: expect.any(String),
        value: { amount: '1134.57', currency: 'USD' },
      },
      // 1134.57 × 12.5% = 141.82125 → rounded by the pack's own rule (2 places, HALF_EVEN)
      {
        id: 'mock-share-output',
        label: expect.any(String),
        value: { amount: '141.82', currency: 'USD' },
      },
    ]);
    expect(report.result.breakdown.map((s) => [s.stepId, s.value])).toEqual([
      ['mock-gross', '1234.57'],
      ['mock-net', '1134.57'],
      ['mock-share', '141.82'],
    ]);
    const share = report.result.breakdown[2]!;
    expect(share.ruleIds).toEqual(['mock-rule-c']);
    expect(share.sourceRefs).toEqual(['mock-source']);
    expect(share.rounding).toEqual({ scale: 2, mode: 'HALF_EVEN' });
  });

  it('labels development results as not religious guidance and surfaces readiness gaps', () => {
    const result = calculate(annualInput(), createMockRulePack(), dev);
    if (!result.ok) throw new Error('expected ok');
    const { meta } = result.value;
    expect(meta.guidance).toBe('NOT_RELIGIOUS_GUIDANCE');
    expect(meta.disclaimer).toBe(DEVELOPMENT_DISCLAIMER);
    expect(meta.disclaimer).toContain('MOCK / NOT FOR PRODUCTION');
    expect(meta.engineVersion).toBe(ENGINE_VERSION);
    expect(meta.rulePack).toMatchObject({ packId: 'mock-pack', isMock: true, status: 'DRAFT' });
    expect(meta.warnings.every((w) => w.severity === 'warning')).toBe(true);
    expect(meta.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining([
        'READINESS_MOCK_RULE_PACK',
        'READINESS_RULE_NOT_APPROVED',
        'READINESS_NOT_ACTIVATED',
      ]),
    );
  });

  it('keeps decimal precision (no floating point)', () => {
    const result = calculate(
      annualInput({
        entries: [entry('a', 'mock-category-a', '0.1'), entry('b', 'mock-category-b', '0.2')],
      }),
      createMockRulePack(),
      dev,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(expectSingle(result.value).result.breakdown[0]!.value).toBe('0.3');

    const big = calculate(
      annualInput({ entries: [entry('a', 'mock-category-a', '9007199254740993.01')] }),
      createMockRulePack(),
      dev,
    );
    if (!big.ok) throw new Error('expected ok');
    expect(expectSingle(big.value).result.breakdown[0]!.value).toBe('9007199254740993.01');
  });

  it('handles empty input and floors (per the mock program) at zero', () => {
    const empty = calculate(annualInput({ entries: [] }), createMockRulePack(), dev);
    if (!empty.ok) throw new Error('expected ok');
    expect(expectSingle(empty.value).result.outputs.map((o) => o.value?.amount)).toEqual([
      '0',
      '0',
    ]);

    const negativeNet = calculate(
      annualInput({
        entries: [entry('a', 'mock-category-a', '10'), entry('c', 'mock-category-c', '50')],
      }),
      createMockRulePack(),
      dev,
    );
    if (!negativeNet.ok) throw new Error('expected ok');
    expect(expectSingle(negativeNet.value).result.breakdown[1]!.value).toBe('0');
  });

  it('stops with a consultation case instead of producing a figure', () => {
    const result = calculate(
      annualInput({ answers: { 'mock-flag': true } }),
      createMockRulePack(),
      dev,
    );
    if (!result.ok) throw new Error('expected ok');
    const report = expectSingle(result.value).result;
    expect(report.status).toBe('UNRESOLVED');
    expect(report.outputs.find((o) => o.id === 'mock-share-output')?.value).toBeNull();
    expect(report.outputs.find((o) => o.id === 'mock-net-output')?.value?.amount).toBe('1134.57');
    expect(report.unresolved).toEqual([
      {
        id: 'mock-consultation',
        kind: 'CONSULTATION_REQUIRED',
        label: expect.any(String),
        ruleIds: ['mock-rule-c'],
        questionId: null,
        stepIds: ['mock-share'],
      },
    ]);
    expect(report.breakdown[2]).toMatchObject({
      value: null,
      unresolvedCaseIds: ['mock-consultation'],
    });
  });

  it('reports an unanswered optional question as a missing answer', () => {
    const result = calculate(annualInput({ answers: {} }), createMockRulePack(), dev);
    if (!result.ok) throw new Error('expected ok');
    const report = expectSingle(result.value).result;
    expect(report.status).toBe('UNRESOLVED');
    expect(report.unresolved[0]).toMatchObject({
      id: 'missing-answer:mock-flag',
      kind: 'MISSING_ANSWER',
      questionId: 'mock-flag',
    });
  });

  it('is deterministic and independent of entry order', () => {
    const pack = createMockRulePack();
    const a = calculate(annualInput(), pack, dev);
    const b = calculate(annualInput({ entries: [...annualInput().entries].reverse() }), pack, dev);
    expect(a).toEqual(b);
  });

  it('carries input warnings (e.g. unused categories) into the result', () => {
    const result = calculate(
      annualInput({ entries: [...annualInput().entries, entry('u', 'mock-category-unused', '5')] }),
      createMockRulePack(),
      dev,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.meta.warnings.map((w) => w.code)).toContain('INPUT_UNUSED_CATEGORY');
  });
});

describe('calculate — refusals', () => {
  it('refuses production calculations with a MOCK pack', () => {
    // Even sealed and activated, a MOCK pack is refused.
    const pack = sealApproved(createMockRulePack());
    const result = calculate(annualInput(), pack, {
      mode: 'production',
      activation: activationFor(pack),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('RULE_PACK_NOT_READY');
    expect(result.error.issues.map((i) => i.code)).toContain('READINESS_MOCK_RULE_PACK');
  });

  it('refuses production when a required rule is unverified, even if the pack is published', () => {
    const pack = createApprovedTestPack();
    const unverified: RulePack = {
      ...pack,
      rules: pack.rules.map((r) => (r.id === 'mock-rule-b' ? { ...r, status: 'UNVERIFIED' } : r)),
    };
    const result = calculate(annualInput(), unverified, {
      mode: 'production',
      activation: activationFor(pack),
    });
    expect(!result.ok && result.error.issues.map((i) => i.code)).toContain(
      'READINESS_RULE_NOT_APPROVED',
    );
  });

  it("refuses production outside the pack's effective dates", () => {
    const pack = createApprovedTestPack();
    const expired: RulePack = {
      ...pack,
      metadata: { ...pack.metadata, effectiveTo: '2025-12-31' },
    };
    const result = calculate(annualInput(), expired, {
      mode: 'production',
      activation: activationFor(expired),
    });
    expect(!result.ok && result.error.issues.map((i) => i.code)).toContain(
      'READINESS_NOT_EFFECTIVE',
    );
  });

  it('refuses malformed packs, unsupported workflows and invalid input in every mode', () => {
    const pack = createMockRulePack();
    const malformed: RulePack = { ...pack, parameters: [{ ...pack.parameters[0]!, value: 'abc' }] };
    expect(calculate(annualInput(), malformed, dev)).toMatchObject({
      ok: false,
      error: { reason: 'INVALID_RULE_PACK' },
    });

    const noAnnual: RulePack = { ...pack, workflows: { ...pack.workflows, annual: null } };
    expect(calculate(annualInput(), noAnnual, dev)).toMatchObject({
      ok: false,
      error: { reason: 'WORKFLOW_NOT_SUPPORTED' },
    });

    const bad = calculate(
      annualInput({ entries: [entry('x', 'mock-category-a', '-1')] }),
      pack,
      dev,
    );
    expect(bad).toMatchObject({
      ok: false,
      error: { reason: 'INVALID_INPUT', workflow: 'annual', mode: 'development' },
    });
  });
});

describe('calculate — production with an approved, activated (test) pack', () => {
  it('calculates and marks the result as based on an approved rule pack', () => {
    const pack = createApprovedTestPack();
    const result = calculate(annualInput(), pack, {
      mode: 'production',
      activation: activationFor(pack),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.meta).toMatchObject({
      mode: 'production',
      guidance: 'APPROVED_RULE_PACK',
      disclaimer: null,
      warnings: [],
    });
  });
});

describe('calculate — first-time workflow', () => {
  const input = (choice: string): FirstTimeAssessmentInput => ({
    workflow: 'first-time',
    currency: 'KWD',
    assessmentDate: '2026-06-01',
    entries: [
      entry('h1', 'mock-category-a', '1234.567', null),
      entry('h2', 'mock-category-a', '0.433', '2026-05-01'),
    ],
    answers: { 'mock-choice': choice },
  });

  it("follows the pack's first-time program (own rounding: 2 places, DOWN)", () => {
    const result = calculate(input('mock-option-1'), createMockRulePack(), dev);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const report = expectSingle(result.value).result;
    // 1235.000 × 12.5% = 154.375 → DOWN at 2 places = 154.37
    expect(report.outputs[0]!.value).toEqual({ amount: '154.37', currency: 'KWD' });
  });

  it('takes the other branch for a different choice', () => {
    const result = calculate(input('mock-option-2'), createMockRulePack(), dev);
    if (!result.ok) throw new Error('expected ok');
    expect(expectSingle(result.value).result.outputs[0]!.value?.amount).toBe('0');
  });
});

describe('calculate — missed-year workflow', () => {
  const year = (y: string, a: string, flag = false) => ({
    period: { start: `${y}-01-01`, end: `${y}-12-31` },
    entries: [entry(`a-${y}`, 'mock-category-a', a, `${y}-06-01`)],
    answers: { 'mock-flag': flag },
  });
  const input = (years: MissedYearAssessmentInput['years']): MissedYearAssessmentInput => ({
    workflow: 'missed-year',
    currency: 'USD',
    assessmentDate: '2026-06-01',
    years,
  });

  it('evaluates each past year separately and aggregates only the outputs the pack allows', () => {
    const result = calculate(
      input([year('2024', '100'), year('2025', '200.04')]),
      createMockRulePack(),
      dev,
    );
    if (!result.ok) throw new Error('expected ok');
    const report = result.value;
    if (report.workflow !== 'missed-year') throw new Error('expected missed-year');
    expect(
      report.years.map(
        (y) => y.result.outputs.find((o) => o.id === 'mock-share-output')?.value?.amount,
      ),
    ).toEqual(['12.5', '25']);
    expect(report.aggregate).toEqual({
      status: 'COMPLETED',
      completeness: 'COMPLETE',
      openYearIndexes: [],
      ruleIds: ['mock-rule-c'],
      outputs: [
        {
          id: 'mock-share-output',
          label: expect.any(String),
          value: { amount: '37.5', currency: 'USD' },
        },
      ],
    });
  });

  it('withholds the aggregate when any year is unresolved', () => {
    const result = calculate(
      input([year('2024', '100'), year('2025', '200', true)]),
      createMockRulePack(),
      dev,
    );
    if (!result.ok) throw new Error('expected ok');
    if (result.value.workflow !== 'missed-year') throw new Error('expected missed-year');
    expect(result.value.years[1]!.result.status).toBe('UNRESOLVED');
    expect(result.value.aggregate).toMatchObject({
      status: 'UNRESOLVED',
      completeness: 'UNRESOLVED',
      openYearIndexes: [1],
      outputs: [{ value: null }],
    });
  });

  it('marks the aggregate PARTIAL, never COMPLETED, when a year has an open item but the totals resolve', () => {
    // Regression (audit 2026-11-23 C5/T2): a year with an open review must not let the summed
    // total look complete.
    const pack = createMockRulePack();
    const netAggregate: RulePack = {
      ...pack,
      workflows: {
        ...pack.workflows,
        missedYear: { ...pack.workflows.missedYear!, aggregateOutputIds: ['mock-net-output'] },
      },
    };
    const result = calculate(
      input([year('2024', '100'), year('2025', '200', true)]),
      netAggregate,
      dev,
    );
    if (!result.ok) throw new Error('expected ok');
    if (result.value.workflow !== 'missed-year') throw new Error('expected missed-year');
    expect(result.value.aggregate).toMatchObject({
      status: 'UNRESOLVED',
      completeness: 'PARTIAL',
      openYearIndexes: [1],
      outputs: [{ id: 'mock-net-output', value: { amount: '300' } }],
    });
  });

  it('produces no aggregate when the pack does not define one', () => {
    const pack = createMockRulePack();
    const noAggregate: RulePack = {
      ...pack,
      workflows: {
        ...pack.workflows,
        missedYear: { ...pack.workflows.missedYear!, aggregateOutputIds: [], aggregateRuleIds: [] },
      },
    };
    const result = calculate(input([year('2024', '100')]), noAggregate, dev);
    if (!result.ok) throw new Error('expected ok');
    if (result.value.workflow !== 'missed-year') throw new Error('expected missed-year');
    expect(result.value.aggregate).toBeNull();
  });

  it('checks effective dates per year in production', () => {
    const pack = createApprovedTestPack();
    const later: RulePack = {
      ...pack,
      metadata: { ...pack.metadata, effectiveFrom: '2025-01-01' },
    };
    const result = calculate(input([year('2024', '100'), year('2025', '200')]), later, {
      mode: 'production',
      activation: activationFor(later),
    });
    expect(
      !result.ok && result.error.issues.filter((i) => i.code === 'READINESS_NOT_EFFECTIVE'),
    ).toHaveLength(1);
  });
});

describe('calculate — further edge cases', () => {
  it('refuses missed-year input when the pack defines no missed-year workflow', () => {
    const pack = createMockRulePack();
    const none: RulePack = { ...pack, workflows: { ...pack.workflows, missedYear: null } };
    const result = calculate(
      { workflow: 'missed-year', currency: 'USD', assessmentDate: '2026-06-01', years: [] },
      none,
      dev,
    );
    expect(result).toMatchObject({ ok: false, error: { reason: 'WORKFLOW_NOT_SUPPORTED' } });
  });

  it('reports a pure consultation step as unresolved money in the breakdown', () => {
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
              rounding: { scale: 2, mode: 'UP' },
            },
          ],
          outputs: [{ id: 'o', label: 'MOCK', stepId: 'stop' }],
        },
      },
    };
    const result = calculate(annualInput(), consultOnly, dev);
    if (!result.ok) throw new Error('expected ok');
    const report = expectSingle(result.value).result;
    expect(report.breakdown[0]).toMatchObject({ kind: 'money', value: null, rounding: null });
    expect(report.status).toBe('UNRESOLVED');
  });

  it('propagates unresolved operands through comparisons', () => {
    const pack = createMockRulePack();
    const comparing: RulePack = {
      ...pack,
      workflows: {
        ...pack.workflows,
        annual: {
          steps: [
            {
              id: 'cmp',
              label: 'MOCK',
              ruleIds: ['mock-rule-c'],
              rounding: null,
              expression: {
                op: 'when',
                condition: {
                  kind: 'compare',
                  left: { op: 'consult', consultationId: 'mock-consultation' },
                  operator: 'gt',
                  right: { op: 'zero' },
                },
                then: { op: 'zero' },
                otherwise: { op: 'zero' },
              },
            },
          ],
          outputs: [{ id: 'o', label: 'MOCK', stepId: 'cmp' }],
        },
      },
    };
    const result = calculate(annualInput(), comparing, dev);
    if (!result.ok) throw new Error('expected ok');
    expect(expectSingle(result.value).result.unresolved.map((u) => u.id)).toEqual([
      'mock-consultation',
    ]);
  });
});
