import { describe, expect, it } from 'vitest';

import type {
  FactMapping,
  FactMappingRule,
  FinancialFact,
  FinancialFactSheet,
  RulePack,
} from '@khums/shared-types';

import {
  createApprovedMappingTestPack,
  createMockMappingPack,
} from '../__fixtures__/mock-mapping-pack';
import { checkActivationEligibility, checkProductionReadiness } from '../rule-pack/readiness';
import { mapFactsToInput } from './map-facts';
import { validateFactMappingStructure } from './structure';

/**
 * Adversarial verification of the fact mapping (M4.4.1 review). MOCK / NOT FOR PRODUCTION data
 * only; nothing here states how any Marja treats any fact.
 */

const mappingOf = (pack: RulePack): FactMapping => {
  if (pack.factMapping === undefined) throw new Error('fixture has a mapping');
  return pack.factMapping;
};
const withMapping = (
  patch: (m: FactMapping) => FactMapping,
  base = createMockMappingPack(),
): RulePack => ({
  ...base,
  factMapping: patch(mappingOf(base)),
});
const ruleById = (m: FactMapping, id: string): FactMappingRule => {
  const rule = m.rules.find((r) => r.id === id);
  if (rule === undefined) throw new Error(`no rule ${id}`);
  return rule;
};
const codes = (pack: RulePack) => validateFactMappingStructure(pack).map((i) => i.code);

const base = { label: null, note: null, currency: 'USD', periodId: null } as const;
const cash = (id: string, amount = '5'): FinancialFact => ({
  ...base,
  id,
  kind: 'BALANCE',
  subtype: 'CASH',
  value: { status: 'KNOWN', amount },
  valuedOn: { status: 'KNOWN', date: '2026-06-30' },
});
const loan = (id: string): FinancialFact => ({
  ...base,
  id,
  kind: 'LIABILITY',
  subtype: 'LOAN',
  value: { status: 'KNOWN', amount: '300' },
  valuedOn: { status: 'KNOWN', date: '2026-06-30' },
  incurredOn: { status: 'UNKNOWN' },
  dueOn: { status: 'NOT_PROVIDED' },
});
const household = (id: string): FinancialFact => ({
  ...base,
  id,
  kind: 'EXPENSE',
  subtype: 'HOUSEHOLD',
  value: { status: 'KNOWN', amount: '50' },
  paidOn: { status: 'KNOWN', date: '2026-01-01' },
});
const sheet = (facts: FinancialFact[]): FinancialFactSheet => ({
  schemaVersion: 1,
  currency: 'USD',
  context: { workflow: 'annual', period: { start: '2025-07-01', end: '2026-06-30' } },
  facts,
});
const run = (s: FinancialFactSheet, pack: RulePack = createMockMappingPack(), factAnswers = {}) =>
  mapFactsToInput(s, pack, { answers: { 'mock-choice': 'mock-option-1' }, factAnswers });
const loanAnswers = (answers: Record<string, boolean | string>, overrides = {}) => ({
  workflow: 'annual' as const,
  kind: 'LIABILITY' as const,
  subtype: 'LOAN',
  answers,
  ...overrides,
});

describe('1. ambiguity and precedence', () => {
  // A second rule claiming BALANCE/CASH with a different interpretation.
  const competing = (m: FactMapping): FactMappingRule => ({
    ...ruleById(m, 'mock-map-balance'),
    id: 'mock-map-competing',
    match: { workflows: ['annual'], kinds: ['BALANCE'], subtypes: ['CASH'] },
    then: { action: 'exclude', ruleIds: ['mock-rule-exclusion'] },
  });

  it('rejects two rules matching the same workflow, kind and subtype', () => {
    const overlapping = withMapping((m) => ({ ...m, rules: [...m.rules, competing(m)] }));
    expect(codes(overlapping)).toContain('MAPPING_OVERLAPPING_RULES');
  });

  it('rejects the overlap in either order, so order can never change an interpretation', () => {
    const first = withMapping((m) => ({ ...m, rules: [...m.rules, competing(m)] }));
    const reversed = withMapping((m) => ({ ...m, rules: [competing(m), ...m.rules] }));
    for (const pack of [first, reversed]) {
      expect(codes(pack)).toContain('MAPPING_OVERLAPPING_RULES');
      expect(run(sheet([cash('fact-1')]), pack)).toMatchObject({
        status: 'UNSUPPORTED',
        input: null,
        unsupported: [{ factId: null, code: 'INVALID_RULE_PACK' }],
      });
    }
  });

  it('detects overlap through shared subtypes such as OTHER, but not across workflows', () => {
    const otherAsset = (m: FactMapping): FactMappingRule => ({
      ...ruleById(m, 'mock-map-household'),
      id: 'mock-map-other-a',
      match: { workflows: ['annual'], kinds: ['ASSET', 'EXPENSE'], subtypes: ['OTHER'] },
    });
    const otherExpense = (m: FactMapping): FactMappingRule => ({
      ...ruleById(m, 'mock-map-household'),
      id: 'mock-map-other-b',
      match: { workflows: ['annual'], kinds: ['EXPENSE'], subtypes: ['OTHER'] },
    });
    expect(
      codes(withMapping((m) => ({ ...m, rules: [...m.rules, otherAsset(m), otherExpense(m)] }))),
    ).toContain('MAPPING_OVERLAPPING_RULES');
    const separateWorkflows = (m: FactMapping): FactMappingRule => ({
      ...otherExpense(m),
      match: { ...otherExpense(m).match, workflows: ['first-time'] },
    });
    expect(
      codes(
        withMapping((m) => ({ ...m, rules: [...m.rules, otherAsset(m), separateWorkflows(m)] })),
      ),
    ).not.toContain('MAPPING_OVERLAPPING_RULES');
  });

  it('gives the same result when non-overlapping rules are reordered', () => {
    const facts = sheet([cash('fact-1'), household('fact-2'), loan('fact-3')]);
    const answers = { 'fact-3': loanAnswers({ 'mock-fact-question': true }) };
    const reordered = withMapping((m) => ({ ...m, rules: [...m.rules].reverse() }));
    const reorderedResult = run(facts, reordered, answers);
    const originalResult = run(facts, createMockMappingPack(), answers);
    // Same interpretation; the pack digest differs because array order is part of the content.
    expect({ ...reorderedResult, pack: null }).toEqual({ ...originalResult, pack: null });
    expect(reorderedResult.pack.contentDigest).not.toBe(originalResult.pack.contentDigest);
  });
});

describe('2. exclusion safety', () => {
  it('requires every exclusion, including nested ones, to cite its own rule', () => {
    const bare = withMapping((m) => ({
      ...m,
      rules: m.rules.map((r) =>
        r.id === 'mock-map-household' ? { ...r, then: { action: 'exclude', ruleIds: [] } } : r,
      ),
    }));
    expect(codes(bare)).toContain('MAPPING_EXCLUDE_WITHOUT_RULE');
    const unknown = withMapping((m) => ({
      ...m,
      rules: m.rules.map((r) =>
        r.id === 'mock-map-household'
          ? { ...r, then: { action: 'exclude', ruleIds: ['nope'] } }
          : r,
      ),
    }));
    expect(codes(unknown)).toContain('PACK_UNKNOWN_RULE');
  });

  it('keeps excluded facts visible in the trace with the rule and its own justification', () => {
    const result = run(sheet([household('fact-1')]));
    expect(result.trace).toEqual([
      {
        factId: 'fact-1',
        mappingRuleId: 'mock-map-household',
        outcome: 'EXCLUDED',
        categoryId: null,
        amount: null,
        ruleIds: ['mock-rule-mapping', 'mock-rule-exclusion'],
        answeredQuestionIds: [],
      },
    ]);
  });

  it('never drops a fact through a category the workflow program does not use', () => {
    const unused = withMapping((m) => ({
      ...m,
      rules: m.rules.map((r) =>
        r.id === 'mock-map-balance' && r.then.action === 'category'
          ? { ...r, then: { ...r.then, categoryId: 'mock-category-unused' } }
          : r,
      ),
    }));
    expect(codes(unused)).toContain('MAPPING_CATEGORY_NOT_IN_PROGRAM');
    expect(run(sheet([cash('fact-1')]), unused).status).toBe('UNSUPPORTED');
  });

  it('fails closed on unknown operations and handlings in untyped pack data', () => {
    const unknownAction = withMapping((m) => ({
      ...m,
      rules: m.rules.map((r) =>
        r.id === 'mock-map-household' ? { ...r, then: { action: 'ignore' } as never } : r,
      ),
    }));
    const unknownHandling = withMapping((m) => ({
      ...m,
      rules: m.rules.map((r) =>
        r.id === 'mock-map-balance' && r.then.action === 'category'
          ? {
              ...r,
              then: {
                ...r.then,
                amount: { ...r.then.amount, range: { handling: 'use-average' } as never },
              },
            }
          : r,
      ),
    }));
    for (const pack of [unknownAction, unknownHandling]) {
      expect(codes(pack)).toContain('MAPPING_UNSUPPORTED_OPERATION');
      const result = run(sheet([cash('fact-1'), household('fact-2')]), pack);
      expect(result.status).toBe('UNSUPPORTED');
      expect(result.input).toBeNull();
    }
  });
});

describe('3. per-fact question integrity', () => {
  it('binds answers to the exact fact: another fact needs its own answer', () => {
    const answers = { 'fact-1': loanAnswers({ 'mock-fact-question': true }) };
    const result = run(sheet([loan('fact-1'), loan('fact-2')]), undefined, answers);
    expect(result.trace.map((t) => [t.factId, t.outcome])).toEqual([
      ['fact-1', 'ENTRY'],
      ['fact-2', 'CLARIFICATION'],
    ]);
    expect(result.clarifications).toEqual([
      {
        factId: 'fact-2',
        reason: 'QUESTION_UNANSWERED',
        dateField: null,
        questionId: 'mock-fact-question',
      },
    ]);
  });

  it('refuses answers given for a different kind, subtype or workflow (no reuse)', () => {
    for (const overrides of [
      { kind: 'BALANCE' },
      { subtype: 'MORTGAGE' },
      { workflow: 'first-time' },
    ]) {
      const result = run(sheet([loan('fact-1')]), undefined, {
        'fact-1': loanAnswers({ 'mock-fact-question': true }, overrides),
      });
      expect(result.status).toBe('UNSUPPORTED');
      expect(result.unsupported).toContainEqual({
        factId: 'fact-1',
        code: 'FACT_ANSWERS_MISMATCH',
      });
      expect(result.input).toBeNull();
    }
  });

  it('refuses stale answers for facts that are not in the sheet', () => {
    const result = run(sheet([cash('fact-1')]), undefined, {
      'fact-9': loanAnswers({ 'mock-fact-question': true }),
    });
    expect(result.unsupported).toEqual([{ factId: 'fact-9', code: 'FACT_ANSWERS_UNKNOWN_FACT' }]);
    expect(result.input).toBeNull();
  });

  it('validates answers against the declared options; valid but uncovered answers consult', () => {
    for (const invalid of ['yes', 1, null]) {
      const result = run(sheet([loan('fact-1')]), undefined, {
        'fact-1': loanAnswers({ 'mock-fact-question': invalid as never }),
      });
      expect(result.clarifications[0]?.reason).toBe('QUESTION_ANSWER_INVALID');
    }
    // A choice question with a declared option that has no case: stop for consultation.
    const choice = withMapping((m) => ({
      ...m,
      rules: m.rules.map((r) =>
        r.id === 'mock-map-liability'
          ? {
              ...r,
              then: {
                action: 'ask',
                questionId: 'mock-choice',
                cases: [
                  {
                    equals: 'mock-option-1',
                    then: { action: 'exclude', ruleIds: ['mock-rule-exclusion'] },
                  },
                ],
                otherwise: { handling: 'consult', consultationId: 'mock-fact-consultation' },
              },
            }
          : r,
      ),
    }));
    const uncovered = run(sheet([loan('fact-1')]), choice, {
      'fact-1': loanAnswers({ 'mock-choice': 'mock-option-2' }),
    });
    expect(uncovered.consultations).toEqual([
      { factId: 'fact-1', consultationId: 'mock-fact-consultation' },
    ]);
    // Assessment-level answers are never used as per-fact answers.
    expect(run(sheet([loan('fact-1')]), choice).clarifications[0]?.reason).toBe(
      'QUESTION_UNANSWERED',
    );
  });
});

describe('4. production readiness of every reachable branch', () => {
  const pack = createApprovedMappingTestPack();
  const activation = {
    packId: pack.metadata.packId,
    version: pack.metadata.version,
    integrity: pack.metadata.integrity!,
    activatedAt: '2026-01-03',
    activatedBy: 'test-activator',
    approvalReferences: ['TEST'],
    publicationReference: 'TEST-PUBLICATION',
  };
  const ready = {
    workflow: 'annual' as const,
    activation,
    dateRanges: [],
    requireFactMapping: true,
  };
  const withRule = (id: string, patch: object): RulePack => ({
    ...pack,
    rules: pack.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  });

  it('checks the exclusion justification itself (not only the mapping rule)', () => {
    expect(checkProductionReadiness(pack, ready)).toEqual([]);
    const draftExclusion = withRule('mock-rule-exclusion', { status: 'DRAFT' });
    expect(checkProductionReadiness(draftExclusion, ready)).toContainEqual(
      expect.objectContaining({
        code: 'READINESS_RULE_NOT_APPROVED',
        path: 'rules.mock-rule-exclusion',
      }),
    );
    const unsourced = withRule('mock-rule-exclusion', { sourceRefs: [] });
    expect(checkProductionReadiness(unsourced, ready).map((i) => i.code)).toContain(
      'READINESS_RULE_WITHOUT_SOURCE',
    );
  });

  it('checks questions and consultations reached through asks and the unmatched fallback', () => {
    const unjustifiedQuestion = {
      ...pack,
      questions: pack.questions.map((q) =>
        q.id === 'mock-fact-question' ? { ...q, ruleIds: [] } : q,
      ),
    };
    expect(checkProductionReadiness(unjustifiedQuestion, ready)).toContainEqual(
      expect.objectContaining({
        code: 'READINESS_ELEMENT_WITHOUT_RULE',
        path: expect.stringMatching(/^questions\./),
      }),
    );
    const unjustifiedFallback = {
      ...pack,
      consultations: pack.consultations.map((c) =>
        c.id === 'mock-unmatched-consultation' ? { ...c, ruleIds: [] } : c,
      ),
    };
    expect(checkProductionReadiness(unjustifiedFallback, ready)).toContainEqual(
      expect.objectContaining({
        code: 'READINESS_ELEMENT_WITHOUT_RULE',
        path: expect.stringMatching(/^consultations\./),
      }),
    );
  });

  it('is not satisfied by approved rules that the mapping does not cite', () => {
    // An extra approved rule does not justify a mapping rule that cites nothing.
    const extra = {
      ...pack,
      rules: [...pack.rules, { ...pack.rules[0]!, id: 'unrelated-approved-rule' }],
      factMapping: {
        ...mappingOf(pack),
        rules: mappingOf(pack).rules.map((r) =>
          r.id === 'mock-map-gift' ? { ...r, ruleIds: [] } : r,
        ),
      },
    };
    expect(checkProductionReadiness(extra, ready)).toContainEqual(
      expect.objectContaining({
        code: 'READINESS_ELEMENT_WITHOUT_RULE',
        path: 'factMapping.rules.4',
      }),
    );
  });

  it('rejects inconsistent mapping structures at the gate and at activation', () => {
    const overlapping = {
      ...pack,
      factMapping: {
        ...mappingOf(pack),
        rules: [
          ...mappingOf(pack).rules,
          { ...ruleById(mappingOf(pack), 'mock-map-gift'), id: 'dup-gift' },
        ],
      },
    };
    expect(checkProductionReadiness(overlapping, ready).map((i) => i.code)).toContain(
      'MAPPING_OVERLAPPING_RULES',
    );
    expect(checkActivationEligibility(overlapping).map((i) => i.code)).toContain(
      'MAPPING_OVERLAPPING_RULES',
    );
  });
});

describe('5. preservation and traceability', () => {
  it('gives every input fact exactly one trace line, in order, whatever its outcome', () => {
    const facts = [
      cash('fact-1', '10.10'),
      household('fact-2'),
      loan('fact-3'),
      { ...cash('fact-4'), currency: 'PKR' },
      { ...cash('fact-5'), subtype: 'DIGITAL_WALLET' } as FinancialFact,
    ];
    const result = run(sheet(facts));
    expect(result.trace.map((t) => [t.factId, t.outcome])).toEqual([
      ['fact-1', 'ENTRY'],
      ['fact-2', 'EXCLUDED'],
      ['fact-3', 'CLARIFICATION'],
      ['fact-4', 'UNSUPPORTED'],
      ['fact-5', 'CONSULTATION'],
    ]);
    expect(new Set(result.trace.map((t) => t.factId)).size).toBe(facts.length);
    expect(result.trace[0]?.amount).toBe('10.10');
  });

  it('refuses duplicate fact ids instead of merging or double-counting them', () => {
    const result = run(sheet([cash('fact-1', '1'), cash('fact-1', '2')]));
    expect(result).toMatchObject({ status: 'UNSUPPORTED', input: null, trace: [] });
    expect(result.unsupported).toEqual([{ factId: null, code: 'INVALID_FACT_SHEET' }]);
  });

  it('produces one entry per mapped fact, never more', () => {
    const answers = { 'fact-3': loanAnswers({ 'mock-fact-question': true }) };
    const result = run(
      sheet([cash('fact-1'), household('fact-2'), loan('fact-3')]),
      undefined,
      answers,
    );
    const entries = result.input?.workflow === 'annual' ? result.input.entries : [];
    expect(entries.map((e) => e.id)).toEqual(['fact-1', 'fact-3']);
    expect(result.input?.currency).toBe('USD');
  });
});

describe('6. versioning', () => {
  it('fails closed for unsupported mapping or fact-sheet versions in pack data', () => {
    const badSheetVersions = withMapping((m) => ({
      ...m,
      factSheetSchemaVersions: [2 as unknown as 1],
    }));
    expect(codes(badSheetVersions)).toContain('MAPPING_UNSUPPORTED_VERSION');
    expect(run(sheet([cash('fact-1')]), badSheetVersions).status).toBe('UNSUPPORTED');
  });
});
