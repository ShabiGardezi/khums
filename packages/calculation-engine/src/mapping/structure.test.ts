import { describe, expect, it } from 'vitest';

import type { FactMapping, RulePack } from '@khums/shared-types';

import { createApprovedTestPack, createMockRulePack } from '../__fixtures__/mock-rule-pack';
import {
  createApprovedMappingTestPack,
  createMockMappingPack,
} from '../__fixtures__/mock-mapping-pack';
import { calculate } from '../calculate';
import { checkActivationEligibility, checkProductionReadiness } from '../rule-pack/readiness';
import { validateRulePackStructure } from '../rule-pack/structure';
import { validateFactMappingStructure } from './structure';

const codes = (pack: RulePack) => validateFactMappingStructure(pack).map((i) => i.code);
const withMapping = (patch: (m: FactMapping) => FactMapping): RulePack => {
  const pack = createMockMappingPack();
  if (pack.factMapping === undefined) throw new Error('fixture has a mapping');
  return { ...pack, factMapping: patch(pack.factMapping) };
};

describe('fact mapping structure', () => {
  it('accepts the MOCK mapping pack and leaves version 1 packs unaffected', () => {
    expect(validateRulePackStructure(createMockMappingPack()).issues).toEqual([]);
    expect(validateRulePackStructure(createMockRulePack()).issues).toEqual([]);
    expect(codes(createMockRulePack())).toEqual([]);
  });

  it('requires schemaVersion 2 for a mapping, and a mapping for schemaVersion 2', () => {
    const v1WithMapping = {
      ...createMockMappingPack(),
      metadata: { ...createMockRulePack().metadata },
    };
    expect(codes(v1WithMapping)).toEqual(['MAPPING_SCHEMA_VERSION']);
    const { factMapping: _omit, ...v2Without } = createMockMappingPack();
    expect(codes(v2Without)).toEqual(['MAPPING_SCHEMA_VERSION']);
  });

  it('rejects unknown references, duplicate rules, missing dates and bad answer values', () => {
    const first = (m: FactMapping) => m.rules[0]!;
    const bad = withMapping((m) => ({
      ...m,
      ruleIds: ['no-such-rule'],
      unmatched: { handling: 'consult', consultationId: 'no-such-consultation' },
      rules: [
        {
          ...first(m),
          then: { ...(first(m).then as object), categoryId: 'no-such-category' } as never,
        },
        { ...first(m) },
        {
          ...first(m),
          id: 'date-missing',
          then: {
            action: 'category',
            categoryId: 'mock-category-a',
            amount: {
              estimated: { handling: 'clarify' },
              range: { handling: 'clarify' },
              unknown: { handling: 'clarify' },
              notProvided: { handling: 'clarify' },
            },
            date: {
              field: null,
              approximate: { handling: 'clarify' },
              unknown: { handling: 'clarify' },
              notProvided: { handling: 'clarify' },
            },
          },
        },
        {
          ...first(m),
          id: 'date-wrong-kind',
          then: {
            action: 'category',
            categoryId: 'mock-category-a',
            amount: {
              estimated: { handling: 'clarify' },
              range: { handling: 'clarify' },
              unknown: { handling: 'clarify' },
              notProvided: { handling: 'clarify' },
            },
            date: {
              field: 'paidOn',
              approximate: { handling: 'clarify' },
              unknown: { handling: 'clarify' },
              notProvided: { handling: 'clarify' },
            },
          },
        },
        {
          ...first(m),
          id: 'ask-bad',
          then: {
            action: 'ask',
            questionId: 'mock-choice',
            cases: [
              {
                equals: 'not-a-choice',
                then: { action: 'exclude', ruleIds: ['mock-rule-exclusion'] },
              },
            ],
            otherwise: { handling: 'consult', consultationId: 'mock-fact-consultation' },
          },
        },
        {
          ...first(m),
          id: 'ask-unknown',
          then: {
            action: 'ask',
            questionId: 'no-q',
            cases: [{ equals: true, then: { action: 'consult', consultationId: 'nope' } }],
            otherwise: { handling: 'consult', consultationId: 'mock-fact-consultation' },
          },
        },
      ],
    }));
    expect(codes(bad)).toEqual(
      expect.arrayContaining([
        'PACK_UNKNOWN_RULE',
        'MAPPING_UNKNOWN_CONSULTATION',
        'MAPPING_UNKNOWN_CATEGORY',
        'MAPPING_DUPLICATE_RULE',
        'MAPPING_DATE_REQUIRED',
        'MAPPING_DATE_FIELD_NOT_IN_KIND',
        'MAPPING_INVALID_ANSWER_VALUE',
        'MAPPING_UNKNOWN_QUESTION',
      ]),
    );
  });

  it('rejects mapping rules for workflows the pack does not define', () => {
    const pack = createMockMappingPack();
    const noFirstTime = { ...pack, workflows: { ...pack.workflows, firstTime: null } };
    expect(codes(noFirstTime)).toContain('MAPPING_UNKNOWN_WORKFLOW');
  });
});

describe('production readiness with fact mappings', () => {
  const request = { workflow: 'annual' as const, activation: null, dateRanges: [] };
  const activation = (pack: RulePack) => ({
    packId: pack.metadata.packId,
    version: pack.metadata.version,
    integrity: pack.metadata.integrity!,
    activatedAt: '2026-01-03',
    activatedBy: 'test-activator',
    approvalReferences: ['TEST'],
    publicationReference: 'TEST-PUBLICATION',
  });

  it('passes for an approved, sourced mapping (test fixture only)', () => {
    const pack = createApprovedMappingTestPack();
    expect(
      checkProductionReadiness(pack, {
        ...request,
        activation: activation(pack),
        requireFactMapping: true,
      }),
    ).toEqual([]);
    expect(checkActivationEligibility(pack)).toEqual([]);
  });

  it('refuses unapproved or unsourced mapping rules, unjustified mappings and missing mappings', () => {
    const pack = createApprovedMappingTestPack();
    const ready = { ...request, activation: activation(pack) };
    const draftRule = {
      ...pack,
      rules: pack.rules.map((r) =>
        r.id === 'mock-rule-mapping' ? { ...r, status: 'DRAFT' as const } : r,
      ),
    };
    expect(checkProductionReadiness(draftRule, ready).map((i) => i.code)).toContain(
      'READINESS_RULE_NOT_APPROVED',
    );
    const unsourced = {
      ...pack,
      rules: pack.rules.map((r) => (r.id === 'mock-rule-mapping' ? { ...r, sourceRefs: [] } : r)),
    };
    expect(checkProductionReadiness(unsourced, ready).map((i) => i.code)).toContain(
      'READINESS_RULE_WITHOUT_SOURCE',
    );
    const mapping = pack.factMapping!;
    const unjustified = {
      ...pack,
      factMapping: {
        ...mapping,
        ruleIds: [],
        rules: mapping.rules.map((r) => ({ ...r, ruleIds: [] })),
      },
    };
    expect(checkProductionReadiness(unjustified, ready).map((i) => i.code)).toContain(
      'READINESS_ELEMENT_WITHOUT_RULE',
    );
    expect(
      checkProductionReadiness(createApprovedTestPack(), {
        ...request,
        activation: activation(createApprovedTestPack()),
        requireFactMapping: true,
      }).map((i) => i.code),
    ).toEqual(['READINESS_MAPPING_MISSING']);
  });

  it('keeps every existing gate: a MOCK mapping pack is never production-ready', () => {
    const codesFound = checkProductionReadiness(createMockMappingPack(), request).map(
      (i) => i.code,
    );
    expect(codesFound).toEqual(
      expect.arrayContaining([
        'READINESS_MOCK_RULE_PACK',
        'READINESS_NOT_PUBLISHED',
        'READINESS_MISSING_SCHOLAR_APPROVAL',
        'READINESS_MISSING_APPROVER',
        'READINESS_MISSING_CONTENT_HASH',
        'READINESS_NOT_ACTIVATED',
        'READINESS_RULE_NOT_APPROVED',
      ]),
    );
    const refused = calculate(
      {
        workflow: 'annual',
        currency: 'USD',
        period: { start: '2025-07-01', end: '2026-06-30' },
        entries: [],
        answers: {},
      },
      createMockMappingPack(),
      { mode: 'production', activation: activation(createMockMappingPack()) },
    );
    expect(refused.ok).toBe(false);
  });
});
