import { describe, expect, it } from 'vitest';

import type { RulePack } from '@khums/shared-types';

import {
  assessmentInputSchema,
  factMappingSchema,
  rulePackActivationSchema,
  rulePackSchema,
  yearAnswersSchema,
} from './index';

// MOCK / NOT FOR PRODUCTION — structural test data only; not a ruling.
const mockPack: RulePack = {
  metadata: {
    packId: 'mock-pack',
    marjaId: 'mock-marja',
    version: '0.1.0',
    schemaVersion: 1,
    title: 'MOCK RULE PACK — NOT FOR PRODUCTION',
    status: 'DRAFT',
    isMock: true,
    effectiveFrom: '2000-01-01',
    effectiveTo: null,
    contentHash: null,
    researchBaseline: null,
    approvals: [],
    supersedes: null,
  },
  sources: [{ id: 'mock-source', title: 'MOCK source', url: null, locator: null }],
  rules: [
    {
      id: 'mock-rule',
      status: 'DRAFT',
      summary: 'MOCK',
      sourceRefs: ['mock-source'],
      rulingRefs: [],
    },
  ],
  inputCategories: [{ id: 'mock-a', label: 'MOCK category A', ruleIds: ['mock-rule'] }],
  questions: [
    {
      id: 'mock-q',
      label: 'MOCK question',
      kind: 'boolean',
      choices: [],
      required: false,
      ruleIds: [],
    },
  ],
  parameters: [{ id: 'mock-rate', label: 'MOCK rate', value: '12.5', ruleIds: ['mock-rule'] }],
  consultations: [{ id: 'mock-consult', label: 'MOCK consultation', ruleIds: [] }],
  workflows: {
    annual: {
      steps: [
        {
          id: 'total',
          label: 'MOCK total',
          ruleIds: ['mock-rule'],
          expression: {
            op: 'when',
            condition: { kind: 'answer', questionId: 'mock-q', equals: true },
            then: { op: 'consult', consultationId: 'mock-consult' },
            otherwise: {
              op: 'percentage',
              of: { op: 'sumCategories', categoryIds: ['mock-a'] },
              rate: { op: 'parameter', parameterId: 'mock-rate' },
            },
          },
          rounding: { scale: 'currency', mode: 'HALF_EVEN' },
        },
      ],
      outputs: [{ id: 'out', label: 'MOCK output', stepId: 'total' }],
    },
    firstTime: null,
    missedYear: null,
  },
};

describe('rulePackSchema', () => {
  it('accepts a structurally valid pack (recursive expressions included)', () => {
    expect(rulePackSchema.parse(mockPack)).toEqual(mockPack);
  });

  it('rejects unknown fields, bad versions, float parameter values and unknown operators', () => {
    expect(rulePackSchema.safeParse({ ...mockPack, extra: 1 }).success).toBe(false);
    expect(
      rulePackSchema.safeParse({ ...mockPack, metadata: { ...mockPack.metadata, version: '1.0' } })
        .success,
    ).toBe(false);
    expect(
      rulePackSchema.safeParse({
        ...mockPack,
        parameters: [{ id: 'p', label: 'p', value: 12.5, ruleIds: [] }],
      }).success,
    ).toBe(false);
    const badOp = JSON.parse(JSON.stringify(mockPack)) as {
      workflows: { annual: { steps: { expression: unknown }[] } };
    };
    badOp.workflows.annual.steps[0]!.expression = { op: 'divide' };
    expect(rulePackSchema.safeParse(badOp).success).toBe(false);
  });
});

describe('assessmentInputSchema', () => {
  it('accepts each workflow shape', () => {
    const entry = {
      id: 'e1',
      categoryId: 'mock-a',
      amount: '10.00',
      date: '2026-01-05',
      description: null,
    };
    expect(
      assessmentInputSchema.safeParse({
        workflow: 'annual',
        currency: 'USD',
        period: { start: '2026-01-01', end: '2026-12-31' },
        entries: [entry],
        answers: { 'mock-q': false },
      }).success,
    ).toBe(true);
    expect(
      assessmentInputSchema.safeParse({
        workflow: 'first-time',
        currency: 'USD',
        assessmentDate: '2026-06-01',
        entries: [{ ...entry, date: null }],
        answers: {},
      }).success,
    ).toBe(true);
    expect(
      assessmentInputSchema.safeParse({
        workflow: 'missed-year',
        currency: 'USD',
        assessmentDate: '2026-06-01',
        years: [{ period: { start: '2024-01-01', end: '2024-12-31' }, entries: [], answers: {} }],
      }).success,
    ).toBe(true);
  });

  it('rejects numeric amounts, bad dates and unknown workflows', () => {
    const base = {
      workflow: 'annual',
      currency: 'USD',
      period: { start: '2026-01-01', end: '2026-12-31' },
      answers: {},
    };
    expect(
      assessmentInputSchema.safeParse({
        ...base,
        entries: [{ id: 'e', categoryId: 'c', amount: 10, date: null, description: null }],
      }).success,
    ).toBe(false);
    expect(
      assessmentInputSchema.safeParse({
        ...base,
        period: { start: '2026-02-30', end: '2026-12-31' },
        entries: [],
      }).success,
    ).toBe(false);
    expect(
      assessmentInputSchema.safeParse({ ...base, workflow: 'monthly', entries: [] }).success,
    ).toBe(false);
  });
});

describe('rulePackActivationSchema', () => {
  const integrity = {
    algorithm: 'SHA-256',
    canonicalization: 'khums-jcs-1',
    scope: 'rule-pack-content-1',
    digest: 'a'.repeat(64),
  };
  const activation = {
    packId: 'p',
    version: '1.0.0',
    integrity,
    activatedAt: '2027-01-01',
    activatedBy: 'approver-1',
    approvalReferences: ['reviews/p/1.0.0.REVIEW.md'],
    publicationReference: 'p@1.0.0#5',
  };

  it('requires a content integrity record and approval references', () => {
    expect(rulePackActivationSchema.safeParse(activation).success).toBe(true);
    expect(
      rulePackActivationSchema.safeParse({ ...activation, approvalReferences: [] }).success,
    ).toBe(false);
  });

  it('rejects the legacy unversioned hash and malformed or unsupported integrity', () => {
    const { integrity: _omit, ...withoutIntegrity } = activation;
    expect(
      rulePackActivationSchema.safeParse({
        ...withoutIntegrity,
        contentHash: `sha256:${'a'.repeat(64)}`,
      }).success,
    ).toBe(false);
    for (const bad of [
      { ...integrity, digest: 'A'.repeat(64) },
      { ...integrity, digest: 'a'.repeat(63) },
      { ...integrity, algorithm: 'SHA-1' },
      { ...integrity, canonicalization: 'khums-jcs-2' },
      { ...integrity, scope: 'other' },
      { ...integrity, extra: true },
    ]) {
      expect(rulePackActivationSchema.safeParse({ ...activation, integrity: bad }).success).toBe(
        false,
      );
    }
  });
});

describe('fact mapping schema (pack schemaVersion 2)', () => {
  // MOCK / NOT FOR PRODUCTION: structural data only.
  const clarify = { handling: 'clarify' } as const;
  const mapping = {
    mappingVersion: 1,
    factSheetSchemaVersions: [1],
    ruleIds: ['mock-rule'],
    unmatched: { handling: 'consult', consultationId: 'mock-consultation' },
    rules: [
      {
        id: 'mock-map',
        ruleIds: ['mock-rule'],
        match: { workflows: ['annual'], kinds: ['BALANCE'], subtypes: ['CASH'] },
        then: {
          action: 'category',
          categoryId: 'mock-category-a',
          amount: {
            estimated: clarify,
            range: { handling: 'use-max' },
            unknown: clarify,
            notProvided: clarify,
          },
          date: { field: 'valuedOn', approximate: clarify, unknown: clarify, notProvided: clarify },
        },
      },
    ],
  };
  const v2 = {
    ...mockPack,
    metadata: { ...mockPack.metadata, schemaVersion: 2 },
    factMapping: mapping,
  };

  it('accepts a version 2 pack with a mapping and keeps version 1 packs valid', () => {
    expect(rulePackSchema.safeParse(v2).success).toBe(true);
    expect(rulePackSchema.safeParse(mockPack).success).toBe(true);
  });

  it('enforces schema-version consistency', () => {
    expect(rulePackSchema.safeParse({ ...mockPack, factMapping: mapping }).success).toBe(false);
    expect(rulePackSchema.safeParse({ ...v2, factMapping: undefined }).success).toBe(false);
    expect(
      rulePackSchema.safeParse({
        ...mockPack,
        metadata: { ...mockPack.metadata, schemaVersion: 3 },
      }).success,
    ).toBe(false);
  });

  it('has no defaults: every handling is required and wildcards do not exist', () => {
    const rule = mapping.rules[0]!;
    const withThen = (then: unknown) => ({ ...mapping, rules: [{ ...rule, then }] });
    const { notProvided: _omit, ...missingHandling } = rule.then.amount;
    expect(
      factMappingSchema.safeParse(withThen({ ...rule.then, amount: missingHandling })).success,
    ).toBe(false);
    expect(
      factMappingSchema.safeParse({
        ...mapping,
        rules: [{ ...rule, match: { ...rule.match, subtypes: ['*'] } }],
      }).success,
    ).toBe(false);
    expect(
      factMappingSchema.safeParse({
        ...mapping,
        rules: [{ ...rule, match: { ...rule.match, subtypes: [] } }],
      }).success,
    ).toBe(false);
  });

  it('rejects subtypes of other kinds, unknown operations and unsupported versions', () => {
    const rule = mapping.rules[0]!;
    const result = factMappingSchema.safeParse({
      ...mapping,
      rules: [{ ...rule, match: { ...rule.match, subtypes: ['LOAN'] } }],
    });
    expect(JSON.stringify(result.error?.issues)).toContain('MAPPING_UNKNOWN_SUBTYPE');
    expect(JSON.stringify(result.error?.issues)).toContain('MAPPING_KIND_WITHOUT_SUBTYPE');
    for (const then of [
      { action: 'percentage', rate: '12.5' },
      { action: 'convert', to: 'USD' },
      { ...rule.then, amount: { ...rule.then.amount, unknown: { handling: 'use' } } },
      { ...rule.then, amount: { ...rule.then.amount, range: { handling: 'use-average' } } },
    ]) {
      expect(factMappingSchema.safeParse({ ...mapping, rules: [{ ...rule, then }] }).success).toBe(
        false,
      );
    }
    expect(factMappingSchema.safeParse({ ...mapping, mappingVersion: 2 }).success).toBe(false);
    expect(factMappingSchema.safeParse({ ...mapping, factSheetSchemaVersions: [2] }).success).toBe(
      false,
    );
  });

  it('validates nested per-fact questions', () => {
    const rule = mapping.rules[0]!;
    const ask = {
      action: 'ask',
      questionId: 'mock-flag',
      cases: [{ equals: true, then: { action: 'exclude', ruleIds: ['mock-rule'] } }],
      otherwise: { handling: 'consult', consultationId: 'mock-consultation' },
    };
    expect(
      factMappingSchema.safeParse({ ...mapping, rules: [{ ...rule, then: ask }] }).success,
    ).toBe(true);
    expect(
      factMappingSchema.safeParse({ ...mapping, rules: [{ ...rule, then: { ...ask, cases: [] } }] })
        .success,
    ).toBe(false);
    // Every exclusion, including nested ones, cites its own rule(s).
    const bareExclusion = { ...ask, cases: [{ equals: true, then: { action: 'exclude' } }] };
    expect(
      factMappingSchema.safeParse({ ...mapping, rules: [{ ...rule, then: bareExclusion }] })
        .success,
    ).toBe(false);
    expect(
      factMappingSchema.safeParse({
        ...mapping,
        rules: [{ ...rule, then: { action: 'exclude', ruleIds: [] } }],
      }).success,
    ).toBe(false);
  });
});

describe('rulePackSchema schemaVersion 3 (M4.5a)', () => {
  const v3 = (channel: unknown) => ({
    ...mockPack,
    metadata: { ...mockPack.metadata, schemaVersion: 3, releaseChannel: channel },
  });
  it('requires a release channel in version 3 and forbids it before', () => {
    expect(rulePackSchema.safeParse(v3('SCHOLAR_REVIEW')).success).toBe(true);
    expect(rulePackSchema.safeParse(v3('PRODUCTION')).success).toBe(true);
    expect(rulePackSchema.safeParse(v3('PUBLIC')).success).toBe(false);
    const { releaseChannel: _omitted, ...withoutChannel } = v3('SCHOLAR_REVIEW').metadata;
    expect(rulePackSchema.safeParse({ ...mockPack, metadata: withoutChannel }).success).toBe(false);
    expect(
      rulePackSchema.safeParse({
        ...mockPack,
        metadata: { ...mockPack.metadata, releaseChannel: 'PRODUCTION' },
      }).success,
    ).toBe(false);
  });

  it('never adds a release channel to a version 1 pack', () => {
    expect('releaseChannel' in rulePackSchema.parse(mockPack).metadata).toBe(false);
  });
});

describe('yearAnswersSchema (decision 62)', () => {
  it('accepts each year’s own answers keyed by period id', () => {
    expect(
      yearAnswersSchema.safeParse({ y2023: { a: true }, y2024: { a: false, b: 'choice' } }).success,
    ).toBe(true);
    expect(yearAnswersSchema.safeParse({}).success).toBe(true);
  });

  it('refuses malformed answers or period ids', () => {
    expect(yearAnswersSchema.safeParse({ y2023: { a: 3 } }).success).toBe(false);
    expect(yearAnswersSchema.safeParse({ '': { a: true } }).success).toBe(false);
    expect(yearAnswersSchema.safeParse({ y2023: 'yes' }).success).toBe(false);
  });
});
