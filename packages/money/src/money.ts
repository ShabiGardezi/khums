import { InvariantError, ok, type Result } from '@khums/utils';

import { getCurrency, type CurrencyCode, type CurrencyError, type CurrencyInfo } from './currency';
import {
  Decimal,
  rejectImplicitConversion,
  type DecimalParseError,
  type ScaleError,
} from './decimal';
import type { RoundingMode } from './rounding';

export class CurrencyMismatchError extends InvariantError {
  override readonly name = 'CurrencyMismatchError';
}

export type MoneyParseError = DecimalParseError | CurrencyError;

/** Serialized form used in storage and transport. */
export interface MoneyJson {
  readonly amount: string;
  readonly currency: string;
}

/**
 * An exact amount in a single currency. Arithmetic between different currencies is a
 * programming error (conversion must be explicit and sourced), so it throws.
 */
export class Money {
  readonly amount: Decimal;
  readonly currency: CurrencyInfo;

  private constructor(amount: Decimal, currency: CurrencyInfo) {
    this.amount = amount;
    this.currency = currency;
  }

  static of(amount: Decimal, currency: CurrencyInfo): Money {
    return new Money(amount, currency);
  }

  static zero(currency: CurrencyInfo): Money {
    return new Money(Decimal.ZERO, currency);
  }

  /** Parse untrusted `{ amount, currency }` input. */
  static parse(amount: unknown, currencyCode: string): Result<Money, MoneyParseError> {
    const currency = getCurrency(currencyCode);
    if (!currency.ok) return currency;
    const decimal = Decimal.parse(amount);
    if (!decimal.ok) return decimal;
    return ok(new Money(decimal.value, currency.value));
  }

  get currencyCode(): CurrencyCode {
    return this.currency.code;
  }

  add(other: Money): Money {
    this.#assertSameCurrency(other);
    return new Money(this.amount.add(other.amount), this.currency);
  }

  subtract(other: Money): Money {
    this.#assertSameCurrency(other);
    return new Money(this.amount.subtract(other.amount), this.currency);
  }

  multiply(factor: Decimal): Money {
    return new Money(this.amount.multiply(factor), this.currency);
  }

  percentage(rate: Decimal): Money {
    return new Money(this.amount.percentage(rate), this.currency);
  }

  negate(): Money {
    return new Money(this.amount.negate(), this.currency);
  }

  /** Explicitly round to the currency's ISO minor units. */
  roundToCurrency(mode: RoundingMode): Money {
    return new Money(this.amount.round(this.currency.minorUnits, mode), this.currency);
  }

  /** True when the amount has no more decimal places than the currency's minor units. */
  isRoundedToCurrency(): boolean {
    return this.amount.decimalPlaces() <= this.currency.minorUnits;
  }

  /** Amount padded to currency precision (e.g. `"12.50"`); errors instead of rounding. */
  toCurrencyString(): Result<string, ScaleError> {
    return this.amount.toFixedScale(this.currency.minorUnits);
  }

  equals(other: Money): boolean {
    return this.currency.code === other.currency.code && this.amount.equals(other.amount);
  }

  /** Exact, unformatted representation, e.g. `"12.345 USD"` (use `formatMoney` for display). */
  toString(): string {
    return `${this.amount.toString()} ${this.currency.code}`;
  }

  [Symbol.toPrimitive](hint: string): string {
    return rejectImplicitConversion(hint, () => this.toString(), 'Money');
  }

  toJSON(): MoneyJson {
    return { amount: this.amount.toString(), currency: this.currency.code };
  }

  #assertSameCurrency(other: Money): void {
    if (this.currency.code !== other.currency.code) {
      throw new CurrencyMismatchError(
        `Cannot combine ${this.currency.code} with ${other.currency.code}; convert explicitly first`,
      );
    }
  }
}
