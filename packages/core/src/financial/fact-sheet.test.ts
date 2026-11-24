import { describe, expect, it } from 'vitest';

import type { FinancialFactSheet } from '@khums/shared-types';

import {
  describeFactCompleteness,
  factsOfKind,
  parseFinancialFactSheet,
  requireExactDate,
} from '../index';

// Structural test data only; values are arbitrary and carry no religious meaning.
const sheet: FinancialFactSheet = {
  schemaVersion: 1,
  currency: 'GBP',
  context: { workflow: 'first-time', assessmentDate: '2026-06-30' },
  facts: [
    {
      id: 'a1',
      kind: 'ASSET',
      subtype: 'PRECIOUS_METAL',
      label: null,
      note: null,
      currency: 'GBP',
      value: { status: 'ESTIMATED', amount: '1500' },
      periodId: null,
      valuedOn: { status: 'KNOWN', date: '2026-06-30' },
      acquiredOn: { status: 'UNKNOWN' },
    },
    {
      id: 'b1',
      kind: 'BALANCE',
      subtype: 'CASH',
      label: null,
      note: null,
      currency: 'GBP',
      value: { status: 'NOT_PROVIDED' },
      periodId: null,
      valuedOn: { status: 'NOT_PROVIDED' },
    },
    {
      id: 'l1',
      kind: 'LIABILITY',
      subtype: 'LOAN',
      label: null,
      note: null,
      currency: 'GBP',
      value: { status: 'RANGE', min: '100', max: '200' },
      periodId: null,
      valuedOn: { status: 'KNOWN', date: '2026-06-30' },
      incurredOn: { status: 'APPROXIMATE', date: '2024-01-01' },
      dueOn: { status: 'UNKNOWN' },
    },
  ],
};

describe('parseFinancialFactSheet', () => {
  it('returns the validated sheet', () => {
    const result = parseFinancialFactSheet(sheet);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(sheet);
  });

  it('returns path + code issues only, never values, and never throws', () => {
    const tampered = {
      ...sheet,
      facts: [{ ...sheet.facts[0], value: { status: 'KNOWN', amount: '1500.123' } }],
    };
    const result = parseFinancialFactSheet(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual([{ path: 'facts.0.value.amount', code: 'AMOUNT_TOO_PRECISE' }]);
      expect(JSON.stringify(result.error)).not.toContain('1500.123');
    }
    for (const raw of [undefined, null, 42, 'sheet', [], { schemaVersion: 2 }]) {
      expect(() => parseFinancialFactSheet(raw)).not.toThrow();
      expect(parseFinancialFactSheet(raw).ok).toBe(false);
    }
  });
});

describe('describeFactCompleteness', () => {
  it('counts known, estimated, ranged, unknown and missing amounts separately', () => {
    expect(describeFactCompleteness(sheet)).toEqual({
      facts: 3,
      amounts: { known: 0, estimated: 1, range: 1, unknown: 0, notProvided: 1 },
    });
  });
});

describe('factsOfKind', () => {
  it('groups facts by kind without attaching meaning', () => {
    expect(factsOfKind(sheet, 'LIABILITY').map((f) => f.id)).toEqual(['l1']);
    expect(factsOfKind(sheet, 'INCOME')).toEqual([]);
  });
});

describe('requireExactDate', () => {
  it('returns only dates the user stated exactly', () => {
    expect(requireExactDate({ status: 'KNOWN', date: '2026-01-31' })).toEqual({
      kind: 'exact',
      date: '2026-01-31',
    });
  });

  it('asks for clarification instead of guessing', () => {
    expect(requireExactDate({ status: 'APPROXIMATE', date: '2024-01-01' })).toEqual({
      kind: 'needs-clarification',
      reason: 'APPROXIMATE',
      approximateDate: '2024-01-01',
    });
    expect(requireExactDate({ status: 'UNKNOWN' })).toMatchObject({ reason: 'UNKNOWN' });
    expect(requireExactDate({ status: 'NOT_PROVIDED' })).toMatchObject({ reason: 'NOT_PROVIDED' });
  });
});

describe('no cross-currency aggregation', () => {
  it('completeness counts facts and never adds amounts', () => {
    const mixed: FinancialFactSheet = {
      ...sheet,
      facts: sheet.facts.map((fact, index) => ({
        ...fact,
        currency: ['GBP', 'USD', 'PKR'][index] ?? 'GBP',
      })),
    };
    const result = describeFactCompleteness(mixed);
    expect(JSON.stringify(result)).not.toMatch(/\d+\.\d+|total|sum|amount"\s*:\s*"/i);
    expect(Object.keys(result.amounts)).toEqual([
      'known',
      'estimated',
      'range',
      'unknown',
      'notProvided',
    ]);
  });
});
