import { describe, expect, it } from 'vitest';

import type { FactSheetContext, FinancialFact, FinancialFactSheet } from '@khums/shared-types';

import {
  currencyMinorUnits,
  FACT_CURRENCIES,
  FACT_DATE_FIELDS,
  FACT_KINDS,
  factIssuesById,
  FINANCIAL_FACT_SUBTYPES,
  amountExceedsCurrencyPrecision,
  formatFactAmount,
  isNonNegativeDecimal,
  validateFactInFrame,
  validateFactSheetFrame,
} from '../index';

// Structural test data only; values are arbitrary and carry no religious meaning.
const context: FactSheetContext = {
  workflow: 'annual',
  period: { start: '2025-07-01', end: '2026-06-30' },
};
const frame = { currency: 'USD', context };
const income: FinancialFact = {
  id: 'f1',
  kind: 'INCOME',
  subtype: 'EMPLOYMENT',
  label: null,
  note: null,
  currency: 'USD',
  value: { status: 'KNOWN', amount: '100.25' },
  periodId: null,
  receivedOn: { status: 'KNOWN', date: '2026-01-15' },
};

describe('fact-entry vocabulary', () => {
  it('exposes exactly the shared kinds, subtypes and date fields', () => {
    expect(FACT_KINDS).toEqual(['ASSET', 'BALANCE', 'INCOME', 'EXPENSE', 'LIABILITY']);
    for (const kind of FACT_KINDS) {
      expect(FINANCIAL_FACT_SUBTYPES[kind]).toContain('OTHER');
      expect(FACT_DATE_FIELDS[kind].length).toBeGreaterThan(0);
    }
    expect(FACT_DATE_FIELDS.LIABILITY).toEqual(['valuedOn', 'incurredOn', 'dueOn']);
  });

  it('lists supported currencies with their minor units', () => {
    expect(FACT_CURRENCIES).toContain('PKR');
    expect(currencyMinorUnits('KWD')).toBe(3);
    expect(currencyMinorUnits('JPY')).toBe(0);
    expect(currencyMinorUnits('XYZ')).toBeNull();
  });
});

describe('validateFactSheetFrame', () => {
  it('accepts valid dates and reports invalid ones', () => {
    expect(validateFactSheetFrame(frame)).toEqual([]);
    expect(
      validateFactSheetFrame({
        currency: 'USD',
        context: { workflow: 'annual', period: { start: '2026-01-01', end: '2025-01-01' } },
      }),
    ).toEqual([{ path: 'context.period', code: 'PERIOD_END_BEFORE_START' }]);
    expect(validateFactSheetFrame({ ...frame, currency: 'XYZ' }).map((i) => i.path)).toEqual([
      'currency',
    ]);
  });
});

describe('validateFactInFrame', () => {
  it('returns no issues for a valid fact', () => {
    expect(validateFactInFrame(frame, income)).toEqual([]);
  });

  it('returns issues relative to the fact, without values', () => {
    const issues = validateFactInFrame(frame, {
      ...income,
      value: { status: 'KNOWN', amount: '100.255' },
    });
    expect(issues).toEqual([{ path: 'value.amount', code: 'AMOUNT_TOO_PRECISE' }]);
    expect(JSON.stringify(issues)).not.toContain('100.255');
    expect(
      validateFactInFrame(frame, {
        ...income,
        receivedOn: { status: 'KNOWN', date: '2024-01-01' },
      }),
    ).toEqual([{ path: 'receivedOn', code: 'DATE_OUTSIDE_PERIOD' }]);
  });

  it('never throws on malformed input', () => {
    for (const raw of [null, {}, 'x', { ...income, kind: 'TAX' }]) {
      expect(() => validateFactInFrame(frame, raw)).not.toThrow();
      expect(validateFactInFrame(frame, raw).length).toBeGreaterThan(0);
    }
  });
});

describe('factIssuesById', () => {
  it('flags facts that no longer fit after the dates change', () => {
    const sheet: FinancialFactSheet = {
      schemaVersion: 1,
      ...frame,
      context: { workflow: 'annual', period: { start: '2026-02-01', end: '2026-06-30' } },
      facts: [income, { ...income, id: 'f2', receivedOn: { status: 'KNOWN', date: '2026-03-01' } }],
    };
    const issues = factIssuesById(sheet);
    expect(issues.get('f1')).toEqual([{ path: 'receivedOn', code: 'DATE_OUTSIDE_PERIOD' }]);
    expect(issues.has('f2')).toBe(false);
  });
});

describe('formatFactAmount', () => {
  it('formats in the fact’s own currency without rounding or converting', () => {
    expect(formatFactAmount('1234.5', 'USD', 'en')).toBe('$1,234.50');
    expect(formatFactAmount('30.125', 'KWD', 'en')).toContain('30.125');
    expect(formatFactAmount('100', 'JPY', 'en')).toContain('100');
    expect(formatFactAmount('1.255', 'USD', 'en')).toBeNull();
    expect(formatFactAmount('abc', 'USD', 'en')).toBeNull();
  });
});

describe('amountExceedsCurrencyPrecision (audit BLD-05: exact, never rounded)', () => {
  it('is true only when the amount has more fractional digits than the currency minor units', () => {
    expect(amountExceedsCurrencyPrecision('66.666', 'USD')).toBe(true);
    expect(amountExceedsCurrencyPrecision('100.00625', 'USD')).toBe(true);
    expect(amountExceedsCurrencyPrecision('10.00', 'USD')).toBe(false);
    expect(amountExceedsCurrencyPrecision('10.500', 'USD')).toBe(false);
    expect(amountExceedsCurrencyPrecision('25', 'USD')).toBe(false);
    expect(amountExceedsCurrencyPrecision('1.125', 'KWD')).toBe(false);
    expect(amountExceedsCurrencyPrecision('1.5', 'JPY')).toBe(true);
    expect(amountExceedsCurrencyPrecision('not-a-number', 'USD')).toBe(false);
    expect(amountExceedsCurrencyPrecision('1.234', 'XXX')).toBe(false);
  });
});

describe('isNonNegativeDecimal (audit L-3)', () => {
  it('is true only for valid decimal strings that are zero or greater', () => {
    expect(isNonNegativeDecimal('12.5')).toBe(true);
    expect(isNonNegativeDecimal('0')).toBe(true);
    expect(isNonNegativeDecimal('-0.0001')).toBe(false);
    expect(isNonNegativeDecimal('abc')).toBe(false);
    expect(isNonNegativeDecimal('')).toBe(false);
  });
});
