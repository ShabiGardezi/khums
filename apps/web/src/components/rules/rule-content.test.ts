import { describe, expect, it } from 'vitest';

import type { ApiError } from '@khums/api-client';
import { FINANCIAL_FACT_SUBTYPES, parseBuilderRuleContent } from '@khums/core';

import { CONTENT } from '@/content';
import { visibleSections } from '@/components/console/console-nav';
import { problemMessage } from '@/components/console/problem-message';

import {
  builderContentFrom,
  ENTRY_TYPES,
  entryValue,
  parseEntryValue,
  RULE_FIELDS,
  ruleRefusalCodes,
  testRequestFrom,
} from './rule-content';

/** TEST values only (arbitrary rate 12.5): nothing here is a ruling. */

const form = (entries: [string, string][]) => {
  const data = new FormData();
  for (const [k, v] of entries) data.append(k, v);
  return data;
};

describe('rule builder form content', () => {
  it('lists every predefined entry type once', () => {
    const total = Object.values(FINANCIAL_FACT_SUBTYPES).reduce((n, list) => n + list.length, 0);
    expect(ENTRY_TYPES).toHaveLength(total);
    expect(new Set(ENTRY_TYPES.map(entryValue)).size).toBe(total);
    expect(parseEntryValue('INCOME:EMPLOYMENT')).toEqual({ kind: 'INCOME', subtype: 'EMPLOYMENT' });
    expect(parseEntryValue('INCOME:NOPE')).toBeNull();
    expect(parseEntryValue('NOPE:EMPLOYMENT')).toBeNull();
    expect(parseEntryValue('INCOME:EMPLOYMENT:X')).toBeNull();
  });

  it('copies exactly what was entered: an empty rate stays empty (never defaulted)', () => {
    const content = builderContentFrom(form([[RULE_FIELDS.category, 'MINED_PRODUCT']]));
    expect(content).toEqual({
      category: 'MINED_PRODUCT',
      rulingId: null,
      rate: null,
      includedEntries: [],
      deductions: [],
      conditions: [],
      exceptions: [],
      threshold: null,
      sourceRefs: [],
      requirementFlags: [],
      otherRequirement: null,
      notes: null,
    });
    expect(parseBuilderRuleContent(content)).not.toBeNull();
  });

  it("Phase 4: reads a deduction limited to counted entries and a confirmation's entries", () => {
    const content = builderContentFrom(
      form([
        [RULE_FIELDS.category, 'ANNUAL_SURPLUS'],
        [RULE_FIELDS.included, 'INCOME:BUSINESS'],
        [RULE_FIELDS.deduction('COSTS_OF_EARNING'), 'EXPENSE:BUSINESS'],
        [RULE_FIELDS.deduction('COSTS_OF_EARNING'), 'LIABILITY:BUSINESS_DEBT'],
        [RULE_FIELDS.deductionAgainst('COSTS_OF_EARNING'), 'INCOME:BUSINESS'],
        [RULE_FIELDS.deduction('LIVING_EXPENSES'), 'EXPENSE:HOUSEHOLD'],
        [RULE_FIELDS.conditionIndex, '0'],
        [RULE_FIELDS.condition('0', 'scope'), 'ENTRY'],
        [RULE_FIELDS.condition('0', 'label'), 'TEST question?'],
        [RULE_FIELDS.condition('0', 'effect'), 'STOP_FOR_REVIEW'],
        [RULE_FIELDS.conditionEntries('0'), 'EXPENSE:HOUSEHOLD'],
        [RULE_FIELDS.conditionIndex, '1'],
        [RULE_FIELDS.condition('1', 'scope'), 'CALCULATION'],
        [RULE_FIELDS.condition('1', 'label'), 'TEST other?'],
        [RULE_FIELDS.condition('1', 'effect'), 'EXCLUDE'],
        [RULE_FIELDS.conditionEntries('1'), 'EXPENSE:HOUSEHOLD'],
      ]),
    );
    expect(content.deductions).toEqual([
      {
        type: 'LIVING_EXPENSES',
        entries: [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }],
      },
      {
        type: 'COSTS_OF_EARNING',
        entries: [
          { kind: 'EXPENSE', subtype: 'BUSINESS' },
          { kind: 'LIABILITY', subtype: 'BUSINESS_DEBT' },
        ],
        against: [{ kind: 'INCOME', subtype: 'BUSINESS' }],
      },
    ]);
    expect(content.conditions.map((c) => c.entries)).toEqual([
      [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }],
      [],
    ]);
  });

  it('reads every field of a complete rule', () => {
    const ruling = '01890000-0000-7000-8000-0000000000a1';
    const content = builderContentFrom(
      form([
        [RULE_FIELDS.category, 'ANNUAL_SURPLUS'],
        [RULE_FIELDS.ruling, ruling],
        [RULE_FIELDS.rate, ' 12.5 '],
        [RULE_FIELDS.included, 'INCOME:EMPLOYMENT'],
        [RULE_FIELDS.included, 'INCOME:BOGUS'],
        [RULE_FIELDS.deduction('LIVING_EXPENSES'), 'EXPENSE:HOUSEHOLD'],
        [RULE_FIELDS.exceptions, 'INCOME:GIFT'],
        [RULE_FIELDS.conditionIndex, '3'],
        [RULE_FIELDS.condition('3', 'scope'), 'ENTRY'],
        [RULE_FIELDS.condition('3', 'label'), 'TEST question?'],
        [RULE_FIELDS.condition('3', 'effect'), 'EXCLUDE'],
        [RULE_FIELDS.thresholdUse, 'on'],
        [RULE_FIELDS.thresholdAmount, '10.00'],
        [RULE_FIELDS.thresholdCurrency, 'usd'],
        [RULE_FIELDS.thresholdBasis, 'AFTER_DEDUCTIONS'],
        [RULE_FIELDS.thresholdEffect, 'STOP_FOR_REVIEW'],
        [RULE_FIELDS.sources, ruling],
        [RULE_FIELDS.flags, 'OTHER'],
        [RULE_FIELDS.flags, 'NOT_A_FLAG'],
        [RULE_FIELDS.otherRequirement, 'TEST need'],
        [RULE_FIELDS.notes, 'TEST notes'],
      ]),
    );
    expect(content).toMatchObject({
      rulingId: ruling,
      rate: '12.5',
      includedEntries: [{ kind: 'INCOME', subtype: 'EMPLOYMENT' }],
      deductions: [
        { type: 'LIVING_EXPENSES', entries: [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }] },
      ],
      exceptions: [{ kind: 'INCOME', subtype: 'GIFT' }],
      conditions: [{ scope: 'ENTRY', label: 'TEST question?', effect: 'EXCLUDE', entries: [] }],
      threshold: {
        amount: '10.00',
        currency: 'USD',
        basis: 'AFTER_DEDUCTIONS',
        effect: 'STOP_FOR_REVIEW',
      },
      sourceRefs: [ruling],
      requirementFlags: ['OTHER'],
      otherRequirement: 'TEST need',
      notes: 'TEST notes',
    });
    expect(parseBuilderRuleContent(content)).not.toBeNull();
  });

  it('builds the test request from the panel rows', () => {
    expect(
      testRequestFrom({
        marjaId: 'sistani',
        currency: ' usd',
        start: '2025-01-01',
        end: '2025-12-31',
        rows: [
          { id: 'e1', entryType: 'INCOME:EMPLOYMENT', amount: ' 1.00 ', date: '2025-02-01' },
          { id: 'e2', entryType: '', amount: '2', date: '2025-02-01' },
        ],
        answers: { q: true },
        entryAnswers: { e1: { p: false }, gone: { p: true } },
      }),
    ).toEqual({
      marjaId: 'sistani',
      currency: 'USD',
      period: { start: '2025-01-01', end: '2025-12-31' },
      entries: [
        { id: 'e1', kind: 'INCOME', subtype: 'EMPLOYMENT', amount: '1.00', date: '2025-02-01' },
      ],
      answers: { q: true },
      entryAnswers: { e1: { p: false } },
    });
  });

  it('reads refusal codes from RULE_REFUSED problems only', () => {
    const problem = (code: string, detail: string): ApiError => ({
      kind: 'http',
      status: 422,
      problem: { type: 'about:blank', title: 'x', status: 422, code, detail },
    });
    expect(
      ruleRefusalCodes(
        problem('RULE_REFUSED', 'The rule was refused (RATE_INVALID, SOURCE_NOT_FOUND).'),
      ),
    ).toEqual(['RATE_INVALID', 'SOURCE_NOT_FOUND']);
    expect(ruleRefusalCodes(problem('ACCESS_DENIED', 'Access denied (X).'))).toEqual([]);
    expect(
      problemMessage(problem('RULE_CONFLICT', ''), CONTENT.console.en.common.errors).message,
    ).toBe(CONTENT.console.en.common.errors.conflict);
  });
});

describe('rule builder in the console', () => {
  it('is shown to holders of builder.rule.read only', () => {
    expect(visibleSections(['builder.rule.read']).map((s) => s.key)).toEqual(['rules']);
    expect(visibleSections(['research.read']).map((s) => s.key)).not.toContain('rules');
  });

  it('explains every capability, missing field and error code in both locales', () => {
    for (const locale of ['en', 'ur'] as const) {
      const r = CONTENT.rules[locale];
      expect(r.statuses.DEVELOPER_IMPLEMENTATION_REQUIRED.length).toBeGreaterThan(0);
      expect(Object.keys(r.check.capabilities)).toHaveLength(12);
      expect(Object.keys(r.check.missing)).toHaveLength(4);
      expect(Object.keys(r.check.errors)).toHaveLength(23);
    }
    expect(CONTENT.rules.en.statuses.DEVELOPER_IMPLEMENTATION_REQUIRED).toBe(
      'Developer Implementation Required',
    );
  });
});
