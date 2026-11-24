import type { AmountPolicy, DatePolicy, Program, RulePack } from '@khums/shared-types';

/**
 * DEVELOPMENT-ONLY MOCK RULE PACK (CLAUDE.md exception, owner decision 2026-11-21).
 *
 * MOCK / NOT FOR PRODUCTION / NOT RELIGIOUS GUIDANCE. Every category, question, consultation,
 * value and assignment here is an arbitrary engineering sample chosen to exercise the results
 * dashboard (completed results, missing answers, consultation stops, clarifications, per-fact
 * questions). Nothing states how any Marja treats any fact, and no real Marja is named. The
 * "sample rate" is an arbitrary test number.
 *
 * Loaded only through `developmentCalculationPack()` when the server-side operational state is
 * `DEVELOPMENT` (never on a hosted deployment). Never import this from a Client Component.
 */

const MOCK = 'MOCK / NOT FOR PRODUCTION';

const clarify = { handling: 'clarify' } as const;
const consult = (consultationId: string) => ({ handling: 'consult', consultationId }) as const;
const lenientAmounts: AmountPolicy = {
  estimated: { handling: 'use' },
  range: { handling: 'use-max' },
  unknown: clarify,
  notProvided: clarify,
};
/** Approximate dates are accepted; missing or unknown dates ask the user (sample behaviour). */
const dateOn = (field: DatePolicy['field']): DatePolicy => ({
  field,
  approximate: { handling: 'use' },
  unknown: clarify,
  notProvided: clarify,
});
const ALL_WORKFLOWS = ['annual', 'first-time', 'missed-year'] as const;

const shareStep = (fromStepId: string) => ({
  id: 'mock-share',
  label: `${MOCK}: sample rate applied (or a sample consultation when the sample flag is set)`,
  ruleIds: ['mock-rule-rate'],
  expression: {
    op: 'when' as const,
    condition: { kind: 'answer' as const, questionId: 'mock-flag', equals: true },
    then: { op: 'consult' as const, consultationId: 'mock-consultation' },
    otherwise: {
      op: 'percentage' as const,
      of: { op: 'step' as const, stepId: fromStepId },
      rate: { op: 'parameter' as const, parameterId: 'mock-rate' },
    },
  },
  rounding: { scale: 'currency' as const, mode: 'HALF_EVEN' as const },
});

const periodProgram: Program = {
  steps: [
    {
      id: 'mock-gross',
      label: `${MOCK}: sample bucket A plus sample bucket B`,
      ruleIds: ['mock-rule-buckets'],
      expression: { op: 'sumCategories', categoryIds: ['mock-bucket-a', 'mock-bucket-b'] },
      rounding: null,
    },
    {
      id: 'mock-net',
      label: `${MOCK}: minus sample bucket C, not below zero`,
      ruleIds: ['mock-rule-buckets'],
      expression: {
        op: 'max',
        operands: [
          {
            op: 'subtract',
            minuend: { op: 'step', stepId: 'mock-gross' },
            subtrahends: [{ op: 'sumCategories', categoryIds: ['mock-bucket-c'] }],
          },
          { op: 'zero' },
        ],
      },
      rounding: null,
    },
    shareStep('mock-net'),
  ],
  outputs: [
    { id: 'mock-net-output', label: `${MOCK}: sample net`, stepId: 'mock-net' },
    { id: 'mock-share-output', label: `${MOCK}: sample share`, stepId: 'mock-share' },
  ],
};

const firstTimeProgram: Program = {
  steps: [
    {
      id: 'mock-holdings',
      label: `${MOCK}: sample buckets A and B minus C, not below zero`,
      ruleIds: ['mock-rule-buckets'],
      expression: {
        op: 'max',
        operands: [
          {
            op: 'subtract',
            minuend: { op: 'sumCategories', categoryIds: ['mock-bucket-a', 'mock-bucket-b'] },
            subtrahends: [{ op: 'sumCategories', categoryIds: ['mock-bucket-c'] }],
          },
          { op: 'zero' },
        ],
      },
      rounding: null,
    },
    {
      id: 'mock-choice-step',
      label: `${MOCK}: sample choice (option 1 keeps the holdings, option 2 uses zero)`,
      ruleIds: ['mock-rule-choice'],
      expression: {
        op: 'when',
        condition: { kind: 'answer', questionId: 'mock-choice', equals: 'mock-option-1' },
        then: { op: 'step', stepId: 'mock-holdings' },
        otherwise: { op: 'zero' },
      },
      rounding: null,
    },
    shareStep('mock-choice-step'),
  ],
  outputs: [{ id: 'mock-share-output', label: `${MOCK}: sample share`, stepId: 'mock-share' }],
};

/** A fresh copy each call (callers cannot share mutable state). */
export function createDevelopmentMockPack(): RulePack {
  return {
    metadata: {
      packId: 'development-mock-pack',
      marjaId: 'mock-development',
      version: '0.1.0',
      schemaVersion: 2,
      title: `${MOCK} — development sample pack — NOT RELIGIOUS GUIDANCE`,
      status: 'DRAFT',
      isMock: true,
      effectiveFrom: '2000-01-01',
      effectiveTo: null,
      contentHash: null,
      researchBaseline: null,
      approvals: [],
      supersedes: null,
    },
    sources: [
      {
        id: 'mock-source-1',
        title: `${MOCK}: engineering sample source 1`,
        url: null,
        locator: 'sample §1',
      },
      {
        id: 'mock-source-2',
        title: `${MOCK}: engineering sample source 2`,
        url: null,
        locator: 'sample §2',
      },
    ],
    rules: [
      {
        id: 'mock-rule-buckets',
        status: 'DRAFT',
        summary: `${MOCK}: sample buckets are added and subtracted (engineering sample)`,
        sourceRefs: ['mock-source-1'],
        rulingRefs: [],
      },
      {
        id: 'mock-rule-rate',
        status: 'DRAFT',
        summary: `${MOCK}: arbitrary sample rate (engineering sample)`,
        sourceRefs: ['mock-source-2'],
        rulingRefs: [],
      },
      {
        id: 'mock-rule-choice',
        status: 'DRAFT',
        summary: `${MOCK}: sample choice (engineering sample)`,
        sourceRefs: ['mock-source-2'],
        rulingRefs: [],
      },
      {
        id: 'mock-rule-mapping',
        status: 'DRAFT',
        summary: `${MOCK}: arbitrary assignment of facts to sample buckets`,
        sourceRefs: ['mock-source-1'],
        rulingRefs: [],
      },
      {
        id: 'mock-rule-exclusion',
        status: 'DRAFT',
        summary: `${MOCK}: sample exclusion`,
        sourceRefs: ['mock-source-1'],
        rulingRefs: [],
      },
    ],
    inputCategories: [
      { id: 'mock-bucket-a', label: `${MOCK}: sample bucket A`, ruleIds: ['mock-rule-buckets'] },
      { id: 'mock-bucket-b', label: `${MOCK}: sample bucket B`, ruleIds: ['mock-rule-buckets'] },
      { id: 'mock-bucket-c', label: `${MOCK}: sample bucket C`, ruleIds: ['mock-rule-buckets'] },
    ],
    questions: [
      {
        id: 'mock-flag',
        label: `${MOCK}: sample flag (yes stops with a sample consultation)`,
        kind: 'boolean',
        choices: [],
        required: false,
        ruleIds: ['mock-rule-rate'],
      },
      {
        id: 'mock-choice',
        label: `${MOCK}: sample choice`,
        kind: 'choice',
        choices: ['mock-option-1', 'mock-option-2'],
        required: true,
        ruleIds: ['mock-rule-choice'],
      },
      {
        id: 'mock-count-item',
        label: `${MOCK}: count this item in sample bucket C?`,
        kind: 'boolean',
        choices: [],
        required: false,
        ruleIds: ['mock-rule-mapping'],
      },
    ],
    parameters: [
      {
        id: 'mock-rate',
        label: `${MOCK}: arbitrary sample rate`,
        value: '12.5',
        ruleIds: ['mock-rule-rate'],
      },
    ],
    consultations: [
      {
        id: 'mock-consultation',
        label: `${MOCK}: sample consultation`,
        ruleIds: ['mock-rule-rate'],
      },
      {
        id: 'mock-fact-consultation',
        label: `${MOCK}: sample consultation for one item`,
        ruleIds: ['mock-rule-mapping'],
      },
      {
        id: 'mock-unmatched-consultation',
        label: `${MOCK}: sample consultation for an unlisted item`,
        ruleIds: ['mock-rule-mapping'],
      },
    ],
    workflows: {
      annual: periodProgram,
      firstTime: firstTimeProgram,
      missedYear: {
        perYear: periodProgram,
        aggregateOutputIds: ['mock-share-output'],
        aggregateRuleIds: ['mock-rule-rate'],
      },
    },
    factMapping: {
      mappingVersion: 1,
      factSheetSchemaVersions: [1],
      ruleIds: ['mock-rule-mapping'],
      unmatched: consult('mock-unmatched-consultation'),
      rules: [
        {
          id: 'mock-map-other',
          ruleIds: ['mock-rule-mapping'],
          match: {
            workflows: [...ALL_WORKFLOWS],
            kinds: ['ASSET', 'BALANCE', 'INCOME', 'EXPENSE', 'LIABILITY'],
            subtypes: ['OTHER'],
          },
          then: { action: 'consult', consultationId: 'mock-fact-consultation' },
        },
        {
          id: 'mock-map-balance',
          ruleIds: ['mock-rule-mapping'],
          match: {
            workflows: [...ALL_WORKFLOWS],
            kinds: ['BALANCE'],
            subtypes: ['CASH', 'BANK_ACCOUNT', 'DIGITAL_WALLET'],
          },
          then: {
            action: 'category',
            categoryId: 'mock-bucket-a',
            amount: lenientAmounts,
            date: dateOn('valuedOn'),
          },
        },
        {
          id: 'mock-map-income',
          ruleIds: ['mock-rule-mapping'],
          match: {
            workflows: [...ALL_WORKFLOWS],
            kinds: ['INCOME'],
            subtypes: [
              'EMPLOYMENT',
              'BUSINESS',
              'INVESTMENT_RETURN',
              'RENTAL',
              'SALE',
              'GIFT',
              'INHERITANCE',
            ],
          },
          then: {
            action: 'category',
            categoryId: 'mock-bucket-a',
            amount: lenientAmounts,
            date: dateOn('receivedOn'),
          },
        },
        {
          id: 'mock-map-asset',
          ruleIds: ['mock-rule-mapping'],
          match: {
            workflows: [...ALL_WORKFLOWS],
            kinds: ['ASSET'],
            subtypes: [
              'PRECIOUS_METAL',
              'REAL_ESTATE',
              'VEHICLE',
              'INVESTMENT',
              'BUSINESS_STOCK',
              'HOUSEHOLD_ITEM',
              'RECEIVABLE',
            ],
          },
          then: {
            action: 'category',
            categoryId: 'mock-bucket-b',
            amount: { ...lenientAmounts, unknown: consult('mock-fact-consultation') },
            date: dateOn('valuedOn'),
          },
        },
        {
          id: 'mock-map-expense',
          ruleIds: ['mock-rule-mapping'],
          match: {
            workflows: [...ALL_WORKFLOWS],
            kinds: ['EXPENSE'],
            subtypes: [
              'HOUSEHOLD',
              'HOUSING',
              'EDUCATION',
              'HEALTH',
              'TRAVEL',
              'BUSINESS',
              'DONATION',
            ],
          },
          then: {
            action: 'ask',
            questionId: 'mock-count-item',
            cases: [
              {
                equals: true,
                then: {
                  action: 'category',
                  categoryId: 'mock-bucket-c',
                  amount: lenientAmounts,
                  date: dateOn('paidOn'),
                },
              },
              { equals: false, then: { action: 'exclude', ruleIds: ['mock-rule-exclusion'] } },
            ],
            otherwise: consult('mock-fact-consultation'),
          },
        },
        {
          id: 'mock-map-liability',
          ruleIds: ['mock-rule-mapping'],
          match: {
            workflows: [...ALL_WORKFLOWS],
            kinds: ['LIABILITY'],
            subtypes: ['LOAN', 'MORTGAGE', 'CREDIT_CARD', 'UNPAID_BILL'],
          },
          then: {
            action: 'category',
            categoryId: 'mock-bucket-c',
            amount: lenientAmounts,
            date: dateOn('valuedOn'),
          },
        },
      ],
    },
  };
}
