import { describe, expect, it } from 'vitest';

import type { FinancialFactSheet, RulePack } from '@khums/shared-types';

import { runDevelopmentAssessment } from '../index';

// MOCK / NOT FOR PRODUCTION: deliberately non-religious names and values. Nothing here states how
// any Marja treats any fact.
const clarify = { handling: 'clarify' } as const;
const pack: RulePack = {
  metadata: {
    packId: 'mock-run-pack',
    marjaId: 'mock-marja',
    version: '0.1.0',
    schemaVersion: 2,
    title: 'MOCK / NOT FOR PRODUCTION run-assessment pack',
    status: 'DRAFT',
    isMock: true,
    effectiveFrom: '2000-01-01',
    effectiveTo: null,
    contentHash: null,
    researchBaseline: null,
    approvals: [],
    supersedes: null,
  },
  sources: [{ id: 'mock-source', title: 'MOCK', url: null, locator: null }],
  rules: [
    {
      id: 'mock-rule',
      status: 'DRAFT',
      summary: 'MOCK',
      sourceRefs: ['mock-source'],
      rulingRefs: [],
    },
  ],
  inputCategories: [{ id: 'mock-category-a', label: 'MOCK A', ruleIds: ['mock-rule'] }],
  questions: [
    {
      id: 'mock-flag',
      label: 'MOCK flag',
      kind: 'boolean',
      choices: [],
      required: false,
      ruleIds: ['mock-rule'],
    },
  ],
  parameters: [{ id: 'mock-rate', label: 'MOCK rate', value: '12.5', ruleIds: ['mock-rule'] }],
  consultations: [{ id: 'mock-consultation', label: 'MOCK', ruleIds: ['mock-rule'] }],
  workflows: {
    annual: null,
    firstTime: {
      steps: [
        {
          id: 'mock-sum',
          label: 'MOCK sum',
          ruleIds: ['mock-rule'],
          expression: { op: 'sumCategories', categoryIds: ['mock-category-a'] },
          rounding: null,
        },
        {
          id: 'mock-share',
          label: 'MOCK share',
          ruleIds: ['mock-rule'],
          expression: {
            op: 'when',
            condition: { kind: 'answer', questionId: 'mock-flag', equals: true },
            then: { op: 'consult', consultationId: 'mock-consultation' },
            otherwise: {
              op: 'percentage',
              of: { op: 'step', stepId: 'mock-sum' },
              rate: { op: 'parameter', parameterId: 'mock-rate' },
            },
          },
          rounding: { scale: 'currency', mode: 'HALF_EVEN' },
        },
      ],
      outputs: [{ id: 'mock-out', label: 'MOCK share', stepId: 'mock-share' }],
    },
    missedYear: null,
  },
  factMapping: {
    mappingVersion: 1,
    factSheetSchemaVersions: [1],
    ruleIds: ['mock-rule'],
    unmatched: { handling: 'consult', consultationId: 'mock-consultation' },
    rules: [
      {
        id: 'mock-map',
        ruleIds: ['mock-rule'],
        match: { workflows: ['first-time'], kinds: ['BALANCE'], subtypes: ['CASH'] },
        then: {
          action: 'category',
          categoryId: 'mock-category-a',
          amount: { estimated: clarify, range: clarify, unknown: clarify, notProvided: clarify },
          date: { field: null, approximate: clarify, unknown: clarify, notProvided: clarify },
        },
      },
    ],
  },
};

const fact = (id: string, amount: string, subtype: 'CASH' | 'BANK_ACCOUNT' = 'CASH') => ({
  id,
  kind: 'BALANCE' as const,
  subtype,
  label: null,
  note: null,
  currency: 'GBP',
  value: { status: 'KNOWN' as const, amount },
  periodId: null,
  valuedOn: { status: 'NOT_PROVIDED' as const },
});
const sheet = (...facts: ReturnType<typeof fact>[]): FinancialFactSheet => ({
  schemaVersion: 1,
  currency: 'GBP',
  context: { workflow: 'first-time', assessmentDate: '2026-06-30' },
  facts,
});

describe('runDevelopmentAssessment', () => {
  it('maps and calculates in development mode, labelled not religious guidance', () => {
    const run = runDevelopmentAssessment(sheet(fact('f1', '100.00'), fact('f2', '20.00')), pack, {
      'mock-flag': false,
    });
    expect(run.kind).toBe('CALCULATED');
    if (run.kind !== 'CALCULATED' || run.report.workflow === 'missed-year') return;
    expect(run.report.meta.mode).toBe('development');
    expect(run.report.meta.guidance).toBe('NOT_RELIGIOUS_GUIDANCE');
    expect(run.report.meta.disclaimer).toContain('MOCK');
    expect(run.report.result.outputs).toEqual([
      { id: 'mock-out', label: 'MOCK share', value: { amount: '15', currency: 'GBP' } },
    ]);
    expect(run.report.result.breakdown.map((s) => [s.stepId, s.value])).toEqual([
      ['mock-sum', '120'],
      ['mock-share', '15'],
    ]);
  });

  it('returns unresolved consultation cases from the engine', () => {
    const run = runDevelopmentAssessment(sheet(fact('f1', '100.00')), pack, { 'mock-flag': true });
    expect(run.kind).toBe('CALCULATED');
    if (run.kind !== 'CALCULATED' || run.report.workflow === 'missed-year') return;
    expect(run.report.result.status).toBe('UNRESOLVED');
    expect(run.report.result.unresolved.map((u) => u.kind)).toEqual(['CONSULTATION_REQUIRED']);
    expect(run.report.result.outputs[0]?.value).toBeNull();
  });

  it('stops before calculating when the mapping needs input or a consultation', () => {
    const consult = runDevelopmentAssessment(sheet(fact('f1', '1.00', 'BANK_ACCOUNT')), pack);
    expect(consult).toMatchObject({
      kind: 'NEEDS_INPUT',
      mapping: { status: 'CONSULTATION_REQUIRED' },
    });
    const estimated = {
      ...fact('f1', '1.00'),
      value: { status: 'ESTIMATED' as const, amount: '1.00' },
    };
    const estimatedSheet = { ...sheet(), facts: [estimated] };
    expect(runDevelopmentAssessment(estimatedSheet, pack)).toMatchObject({
      kind: 'NEEDS_INPUT',
      mapping: { status: 'NEEDS_CLARIFICATION' },
    });
  });

  it('refuses packs that are not mock packs (provisional and approved packs never run here)', () => {
    const notMock: RulePack = { ...pack, metadata: { ...pack.metadata, isMock: false } };
    expect(runDevelopmentAssessment(sheet(fact('f1', '1.00')), notMock)).toEqual({
      kind: 'NOT_A_DEVELOPMENT_PACK',
    });
  });

  it('reports engine refusals (invalid input) without calculating', () => {
    const run = runDevelopmentAssessment(sheet(fact('f1', '1.00')), pack, { 'mock-flag': 'yes' });
    expect(run.kind).toBe('REFUSED');
  });
});
