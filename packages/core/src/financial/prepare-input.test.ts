import { describe, expect, it } from 'vitest';

import type { FinancialFactSheet, RulePack } from '@khums/shared-types';

import { prepareAssessmentInput } from '../index';

// MOCK / NOT FOR PRODUCTION: a minimal schemaVersion 2 pack. Names and values are deliberately
// non-religious; nothing here states how any Marja treats any fact.
const clarify = { handling: 'clarify' } as const;
const pack: RulePack = {
  metadata: {
    packId: 'mock-core-pack',
    marjaId: 'mock-marja',
    version: '0.1.0',
    schemaVersion: 2,
    title: 'MOCK / NOT FOR PRODUCTION core mapping pack',
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
  questions: [],
  parameters: [],
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
      ],
      outputs: [{ id: 'mock-out', label: 'MOCK', stepId: 'mock-sum' }],
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

const sheet: FinancialFactSheet = {
  schemaVersion: 1,
  currency: 'GBP',
  context: { workflow: 'first-time', assessmentDate: '2026-06-30' },
  facts: [
    {
      id: 'fact-1',
      kind: 'BALANCE',
      subtype: 'CASH',
      label: null,
      note: null,
      currency: 'GBP',
      value: { status: 'KNOWN', amount: '10.50' },
      periodId: null,
      valuedOn: { status: 'APPROXIMATE', date: '2026-01-01' },
    },
  ],
};

describe('prepareAssessmentInput', () => {
  it('validates the facts and applies the pack’s own mapping', () => {
    const result = prepareAssessmentInput(sheet, pack);
    expect(result.status).toBe('MAPPED');
    expect(result.input).toEqual({
      workflow: 'first-time',
      currency: 'GBP',
      assessmentDate: '2026-06-30',
      entries: [
        {
          id: 'fact-1',
          categoryId: 'mock-category-a',
          amount: '10.50',
          date: null,
          description: null,
        },
      ],
      answers: {},
    });
  });

  it('refuses an invalid fact sheet without echoing values', () => {
    const bad = {
      ...sheet,
      facts: [{ ...sheet.facts[0], value: { status: 'KNOWN', amount: '10.505' } }],
    };
    const result = prepareAssessmentInput(bad, pack);
    expect(result.unsupported).toEqual([{ factId: null, code: 'INVALID_FACT_SHEET' }]);
    expect(JSON.stringify(result)).not.toContain('10.505');
  });

  it('refuses a structurally invalid pack', () => {
    const broken: RulePack = {
      ...pack,
      factMapping: {
        ...pack.factMapping!,
        unmatched: { handling: 'consult', consultationId: 'missing' },
      },
    };
    expect(prepareAssessmentInput(sheet, broken).unsupported).toEqual([
      { factId: null, code: 'INVALID_RULE_PACK' },
    ]);
  });

  it('stops for consultation when the pack does not map a fact (no generic default)', () => {
    const other = {
      ...sheet,
      facts: [{ ...sheet.facts[0]!, subtype: 'BANK_ACCOUNT' as const }],
    } as FinancialFactSheet;
    expect(prepareAssessmentInput(other, pack).status).toBe('CONSULTATION_REQUIRED');
  });
});
