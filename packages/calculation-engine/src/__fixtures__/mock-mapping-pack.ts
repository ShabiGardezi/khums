import type { AmountPolicy, DatePolicy, RulePack } from '@khums/shared-types';

import {
  createApprovedTestPack,
  createMockRulePack,
  MOCK_LABEL,
  sealApproved,
} from './mock-rule-pack';

/**
 * MOCK / NOT FOR PRODUCTION: a schemaVersion 2 pack with a fact mapping, used only to exercise
 * the mapping interpreter. Category, question and consultation names are deliberately
 * non-religious. Nothing here states how any Marja treats any fact. Never export from the package.
 */

const clarify = { handling: 'clarify' } as const;
const consult = (consultationId: string) => ({ handling: 'consult', consultationId }) as const;

const strictAmounts: AmountPolicy = {
  estimated: clarify,
  range: clarify,
  unknown: clarify,
  notProvided: clarify,
};

const strictDates = (field: DatePolicy['field']): DatePolicy => ({
  field,
  approximate: clarify,
  unknown: clarify,
  notProvided: clarify,
});

export function createMockMappingPack(): RulePack {
  const base = createMockRulePack();
  return {
    ...base,
    metadata: {
      ...base.metadata,
      packId: 'mock-mapping-pack',
      schemaVersion: 2,
      title: `${MOCK_LABEL}: mapping fixture`,
    },
    rules: [
      ...base.rules,
      {
        id: 'mock-rule-exclusion',
        status: 'DRAFT',
        summary: `${MOCK_LABEL}: exclusion justification placeholder`,
        sourceRefs: ['mock-source'],
        rulingRefs: [],
      },
      {
        id: 'mock-rule-mapping',
        status: 'DRAFT',
        summary: `${MOCK_LABEL}: mapping justification placeholder`,
        sourceRefs: ['mock-source'],
        rulingRefs: [],
      },
    ],
    questions: [
      ...base.questions,
      {
        id: 'mock-fact-question',
        label: `${MOCK_LABEL}: per-fact question`,
        kind: 'boolean',
        choices: [],
        required: false,
        ruleIds: ['mock-rule-mapping'],
      },
    ],
    consultations: [
      ...base.consultations,
      {
        id: 'mock-fact-consultation',
        label: `${MOCK_LABEL}: fact consultation`,
        ruleIds: ['mock-rule-mapping'],
      },
      {
        id: 'mock-unmatched-consultation',
        label: `${MOCK_LABEL}: unmatched fact`,
        ruleIds: ['mock-rule-mapping'],
      },
    ],
    factMapping: {
      mappingVersion: 1,
      factSheetSchemaVersions: [1],
      ruleIds: ['mock-rule-mapping'],
      unmatched: consult('mock-unmatched-consultation'),
      rules: [
        {
          id: 'mock-map-balance',
          ruleIds: ['mock-rule-mapping'],
          match: {
            workflows: ['annual', 'first-time', 'missed-year'],
            kinds: ['BALANCE'],
            subtypes: ['CASH', 'BANK_ACCOUNT'],
          },
          then: {
            action: 'category',
            categoryId: 'mock-category-a',
            amount: { ...strictAmounts, estimated: { handling: 'use' } },
            date: strictDates('valuedOn'),
          },
        },
        {
          id: 'mock-map-asset',
          ruleIds: ['mock-rule-mapping'],
          match: {
            workflows: ['annual', 'missed-year'],
            kinds: ['ASSET'],
            subtypes: ['PRECIOUS_METAL'],
          },
          then: {
            action: 'category',
            categoryId: 'mock-category-b',
            amount: {
              estimated: consult('mock-fact-consultation'),
              range: { handling: 'use-max' },
              unknown: consult('mock-fact-consultation'),
              notProvided: clarify,
            },
            date: {
              field: 'acquiredOn',
              approximate: { handling: 'use' },
              unknown: consult('mock-fact-consultation'),
              notProvided: clarify,
            },
          },
        },
        {
          id: 'mock-map-liability',
          ruleIds: ['mock-rule-mapping'],
          match: {
            workflows: ['annual', 'missed-year'],
            kinds: ['LIABILITY'],
            subtypes: ['LOAN'],
          },
          then: {
            action: 'ask',
            questionId: 'mock-fact-question',
            cases: [
              {
                equals: true,
                then: {
                  action: 'category',
                  categoryId: 'mock-category-c',
                  amount: strictAmounts,
                  date: strictDates('valuedOn'),
                },
              },
              { equals: false, then: { action: 'exclude', ruleIds: ['mock-rule-exclusion'] } },
            ],
            otherwise: consult('mock-fact-consultation'),
          },
        },
        {
          id: 'mock-map-household',
          ruleIds: ['mock-rule-mapping'],
          match: {
            workflows: ['annual', 'first-time', 'missed-year'],
            kinds: ['EXPENSE'],
            subtypes: ['HOUSEHOLD'],
          },
          then: { action: 'exclude', ruleIds: ['mock-rule-exclusion'] },
        },
        {
          id: 'mock-map-gift',
          ruleIds: ['mock-rule-mapping'],
          match: {
            workflows: ['annual', 'first-time', 'missed-year'],
            kinds: ['INCOME'],
            subtypes: ['GIFT'],
          },
          then: { action: 'consult', consultationId: 'mock-fact-consultation' },
        },
      ],
    },
  };
}

/** The mapping fixture made structurally production-ready, for readiness-gate tests only. */
export function createApprovedMappingTestPack(): RulePack {
  const approved = createApprovedTestPack();
  const mapping = createMockMappingPack();
  return sealApproved({
    ...mapping,
    metadata: { ...approved.metadata, schemaVersion: 2 },
    rules: mapping.rules.map((r) => ({ ...r, status: 'APPROVED' })),
  });
}
