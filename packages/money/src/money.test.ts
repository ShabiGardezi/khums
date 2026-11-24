import { describe, expect, it } from 'vitest';

import {
  CurrencyMismatchError,
  Decimal,
  formatMoney,
  getCurrency,
  Money,
  type CurrencyInfo,
} from './index';

const currency = (code: string): CurrencyInfo => {
  const result = getCurrency(code);
  if (!result.ok) throw new Error(`unknown currency ${code}`);
  return result.value;
};

const usd = (amount: string) => Money.of(Decimal.of(amount), currency('USD'));

describe('currencies', () => {
  it('exposes ISO 4217 minor units', () => {
    expect(currency('USD').minorUnits).toBe(2);
    expect(currency('KWD').minorUnits).toBe(3);
    expect(currency('JPY').minorUnits).toBe(0);
  });

  it('rejects unknown or non-canonical codes', () => {
    expect(getCurrency('XYZ')).toEqual({ ok: false, error: { code: 'UNSUPPORTED_CURRENCY' } });
    expect(getCurrency('usd').ok).toBe(false);
    expect(getCurrency('toString').ok).toBe(false);
  });
});

describe('Money', () => {
  it('parses untrusted input', () => {
    expect(Money.parse('10.50', 'USD').ok).toBe(true);
    expect(Money.parse(10.5, 'USD')).toEqual({ ok: false, error: { code: 'NOT_A_STRING' } });
    expect(Money.parse('10.50', 'ABC')).toEqual({
      ok: false,
      error: { code: 'UNSUPPORTED_CURRENCY' },
    });
  });

  it('adds, subtracts, multiplies and takes percentages exactly', () => {
    expect(usd('0.10').add(usd('0.20')).amount.toString()).toBe('0.3');
    expect(usd('10').subtract(usd('12.5')).amount.toString()).toBe('-2.5');
    expect(usd('19.99').multiply(Decimal.of('3')).amount.toString()).toBe('59.97');
    expect(usd('1234.56').percentage(Decimal.of('20')).amount.toString()).toBe('246.912');
  });

  it('refuses to combine different currencies', () => {
    const eur = Money.of(Decimal.of('1'), currency('EUR'));
    expect(() => usd('1').add(eur)).toThrow(CurrencyMismatchError);
    expect(() => usd('1').subtract(eur)).toThrow(CurrencyMismatchError);
  });

  it('rounds to currency precision only when asked, with an explicit mode', () => {
    const value = usd('1234.56').percentage(Decimal.of('20')); // 246.912
    expect(value.isRoundedToCurrency()).toBe(false);
    expect(value.toCurrencyString().ok).toBe(false);

    const rounded = value.roundToCurrency('HALF_UP');
    expect(rounded.isRoundedToCurrency()).toBe(true);
    expect(rounded.toCurrencyString()).toEqual({ ok: true, value: '246.91' });

    const kwd = Money.of(Decimal.of('1.23456'), currency('KWD')).roundToCurrency('HALF_EVEN');
    expect(kwd.toCurrencyString()).toEqual({ ok: true, value: '1.235' });
  });

  it('serializes as decimal strings', () => {
    expect(JSON.stringify(usd('12.30'))).toBe('{"amount":"12.3","currency":"USD"}');
  });

  it('compares by currency and value', () => {
    expect(usd('1.0').equals(usd('1'))).toBe(true);
    expect(usd('1').equals(Money.of(Decimal.of('1'), currency('EUR')))).toBe(false);
  });
});

describe('formatMoney — presentation separate from arithmetic', () => {
  it('formats amounts already rounded to currency precision', () => {
    expect(formatMoney(usd('1234.5'), 'en-US')).toEqual({ ok: true, value: '$1,234.50' });
  });

  it('formats large values without float conversion', () => {
    const big = usd('12345678901234567890.12');
    expect(formatMoney(big, 'en-US')).toEqual({
      ok: true,
      value: '$12,345,678,901,234,567,890.12',
    });
  });

  it('refuses to round implicitly', () => {
    expect(formatMoney(usd('1.005'), 'en-US')).toEqual({
      ok: false,
      error: { code: 'ROUNDING_REQUIRED' },
    });
  });
});
