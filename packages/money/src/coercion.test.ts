import { describe, expect, it } from 'vitest';

import { Decimal, getCurrency, ImplicitConversionError, Money } from './index';

const usd = getCurrency('USD');
if (!usd.ok) throw new Error('USD missing');

const ten = Decimal.of('10');
const nine = Decimal.of('9');
const money = Money.of(Decimal.of('12.345'), usd.value);

// These expressions all type-check in TypeScript; the guard is what makes them safe.
const asNumber = (value: unknown) => value as number;

describe('implicit conversion guard (no silent float or string coercion)', () => {
  it.each([
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion -- exercises the runtime guard
    ['unary plus', () => +asNumber(ten)],
    ['Number()', () => Number(ten)],
    ['arithmetic', () => asNumber(ten) * 2],
    ['relational comparison', () => asNumber(ten) > asNumber(nine)],
    ['loose equality with a number', () => asNumber(ten) == 10], // eslint-disable-line eqeqeq
    ['string concatenation (default hint)', () => asNumber(ten) + ''], // eslint-disable-line @typescript-eslint/restrict-plus-operands
    ['Math functions', () => Math.max(asNumber(ten), 1)],
  ])('Decimal rejects %s', (_label, run) => {
    expect(run).toThrow(ImplicitConversionError);
  });

  it.each([
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion -- exercises the runtime guard
    ['unary plus', () => +asNumber(money)],
    ['Number()', () => Number(money)],
    ['relational comparison', () => asNumber(money) > 1],
  ])('Money rejects %s', (_label, run) => {
    expect(run).toThrow(ImplicitConversionError);
  });

  it('still allows explicit string conversion and JSON', () => {
    expect(String(ten)).toBe('10');
    expect(`n=${nine as unknown as string}`).toBe('n=9'); // template literals use the "string" hint
    expect(String(money)).toBe('12.345 USD');
    expect(JSON.stringify({ ten, money })).toBe(
      '{"ten":"10","money":{"amount":"12.345","currency":"USD"}}',
    );
  });

  it('offers correct explicit comparisons instead', () => {
    expect(ten.greaterThan(nine)).toBe(true);
    expect(Decimal.of('100').greaterThan(Decimal.of('99.999'))).toBe(true);
  });
});
