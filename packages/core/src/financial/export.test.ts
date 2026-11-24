import { describe, expect, it } from 'vitest';

import type { FinancialFact, FinancialFactSheet } from '@khums/shared-types';

import {
  buildFactSheetExport,
  factSheetExportFileName,
  parseFactSheetExport,
  serializeFactSheetExport,
} from '../index';

// Structural test data only; values are arbitrary and carry no religious meaning.
const base = { label: null, note: null, periodId: null } as const;
const facts: FinancialFact[] = [
  {
    ...base,
    id: 'fact-1',
    kind: 'ASSET',
    subtype: 'PRECIOUS_METAL',
    note: 'kept at home',
    currency: 'USD',
    value: { status: 'KNOWN', amount: '1200.50' },
    valuedOn: { status: 'KNOWN', date: '2026-06-30' },
    acquiredOn: { status: 'APPROXIMATE', date: '2019-01-01' },
  },
  {
    ...base,
    id: 'fact-2',
    kind: 'BALANCE',
    subtype: 'BANK_ACCOUNT',
    label: 'Savings',
    currency: 'KWD',
    value: { status: 'RANGE', min: '30.125', max: '30.500' },
    valuedOn: { status: 'NOT_PROVIDED' },
  },
  {
    ...base,
    id: 'fact-3',
    kind: 'INCOME',
    subtype: 'GIFT',
    currency: 'JPY',
    value: { status: 'ESTIMATED', amount: '100000' },
    receivedOn: { status: 'UNKNOWN' },
  },
  {
    ...base,
    id: 'fact-4',
    kind: 'EXPENSE',
    subtype: 'HEALTH',
    currency: 'PKR',
    value: { status: 'UNKNOWN' },
    paidOn: { status: 'KNOWN', date: '2026-01-15' },
  },
  {
    ...base,
    id: 'fact-5',
    kind: 'LIABILITY',
    subtype: 'LOAN',
    currency: 'GBP',
    value: { status: 'NOT_PROVIDED' },
    valuedOn: { status: 'KNOWN', date: '2026-06-30' },
    incurredOn: { status: 'APPROXIMATE', date: '2024-01-01' },
    dueOn: { status: 'KNOWN', date: '2030-01-01' },
  },
];
const sheet: FinancialFactSheet = {
  schemaVersion: 1,
  currency: 'USD',
  context: { workflow: 'first-time', assessmentDate: '2026-06-30' },
  facts,
};
const at = '2026-07-01T09:30:00.000Z';

describe('buildFactSheetExport', () => {
  it('copies every fact exactly, without ids, in a versioned envelope', () => {
    const result = buildFactSheetExport(sheet, at);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      format: 'khums-platform.financial-facts',
      exportVersion: 1,
      exportedAt: at,
      contents: 'FINANCIAL_FACTS_ONLY',
      sheet: { schemaVersion: 1, currency: 'USD', context: sheet.context },
    });
    expect(result.value.sheet.facts).toEqual(facts.map(({ id: _id, ...rest }) => rest));
  });

  it('preserves decimal strings, currencies and uncertainty in the JSON text', () => {
    const result = buildFactSheetExport(sheet, at);
    if (!result.ok) throw new Error('expected ok');
    const json = serializeFactSheetExport(result.value);
    for (const text of ['"1200.50"', '"30.125"', '"30.500"', '"100000"', '"KWD"', '"JPY"']) {
      expect(json).toContain(text);
    }
    expect(json).toContain('"APPROXIMATE"');
    expect(json).not.toMatch(/"amount": \d/); // never a JSON number
    expect(json).not.toMatch(/"id":|fact-1|total|marja|liable|deductible/i);
    expect(JSON.parse(json)).toEqual(result.value);
  });

  it('refuses to export an invalid sheet and reports issues without values', () => {
    const bad = {
      ...sheet,
      facts: [{ ...facts[0], value: { status: 'KNOWN', amount: '1200.505' } }] as FinancialFact[],
    };
    const result = buildFactSheetExport(bad, at);
    expect(result).toEqual({
      ok: false,
      error: [{ path: 'facts.0.value.amount', code: 'AMOUNT_TOO_PRECISE' }],
    });
    expect(JSON.stringify(result)).not.toContain('1200.505');
  });

  it('rejects a malformed timestamp', () => {
    expect(buildFactSheetExport(sheet, 'yesterday').ok).toBe(false);
  });
});

describe('parseFactSheetExport', () => {
  const valid = () => {
    const result = buildFactSheetExport(sheet, at);
    if (!result.ok) throw new Error('expected ok');
    return JSON.parse(serializeFactSheetExport(result.value)) as Record<string, unknown>;
  };

  it('accepts its own exports and rejects tampered or unknown shapes', () => {
    expect(parseFactSheetExport(valid()).ok).toBe(true);
    for (const patch of [
      { exportVersion: 2 },
      { format: 'other' },
      { contents: 'RESULT' },
      { extra: true },
    ]) {
      expect(parseFactSheetExport({ ...valid(), ...patch }).ok).toBe(false);
    }
    const withId = valid();
    (withId.sheet as { facts: Record<string, unknown>[] }).facts[0]!.id = 'fact-1';
    expect(parseFactSheetExport(withId).ok).toBe(false);
    const rounded = valid();
    (rounded.sheet as { facts: { value: Record<string, unknown> }[] }).facts[0]!.value.amount =
      1200.5;
    expect(parseFactSheetExport(rounded).ok).toBe(false);
  });

  it('never throws on garbage', () => {
    for (const raw of [null, 1, 'x', [], {}]) {
      expect(() => parseFactSheetExport(raw)).not.toThrow();
      expect(parseFactSheetExport(raw).ok).toBe(false);
    }
  });
});

describe('factSheetExportFileName', () => {
  it('contains only the date', () => {
    expect(factSheetExportFileName(at)).toBe('khums-financial-facts-2026-07-01.json');
  });
});
