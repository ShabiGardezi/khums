import DecimalJs from 'decimal.js';

import { err, invariant, InvariantError, ok, type Result } from '@khums/utils';

import { MAX_SCALE, type RoundingMode } from './rounding';

/**
 * Working precision in significant digits. Every operation is checked *before* it runs to
 * make sure its exact result fits; otherwise it throws instead of silently rounding.
 */
const WORKING_PRECISION = 1_000;

/** Isolated decimal.js instance so global configuration elsewhere can never affect us. */
const Engine = DecimalJs.clone({
  precision: WORKING_PRECISION,
  rounding: DecimalJs.ROUND_HALF_EVEN, // never relied on: operations are pre-checked to be exact
  toExpNeg: -9e15,
  toExpPos: 9e15,
  minE: -9e15,
  maxE: 9e15,
});

/** Maximum accepted length of an input string (defends against pathological input). */
export const MAX_DECIMAL_INPUT_LENGTH = 100;

/**
 * Accepted input syntax: optional leading `-`, an integer part without superfluous leading
 * zeros, and an optional fractional part. No exponent, whitespace, `+`, thousands separators,
 * `NaN` or `Infinity`. Formatting/locale parsing is a UI concern and happens before this.
 */
export const DECIMAL_STRING_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

const ROUNDING: Record<RoundingMode, DecimalJs.Rounding> = {
  UP: DecimalJs.ROUND_UP,
  DOWN: DecimalJs.ROUND_DOWN,
  CEILING: DecimalJs.ROUND_CEIL,
  FLOOR: DecimalJs.ROUND_FLOOR,
  HALF_UP: DecimalJs.ROUND_HALF_UP,
  HALF_DOWN: DecimalJs.ROUND_HALF_DOWN,
  HALF_EVEN: DecimalJs.ROUND_HALF_EVEN,
};

export type DecimalParseError =
  | { readonly code: 'NOT_A_STRING' }
  | { readonly code: 'INPUT_TOO_LONG'; readonly maxLength: number }
  | { readonly code: 'INVALID_DECIMAL_FORMAT' };

export interface ScaleError {
  readonly code: 'ROUNDING_REQUIRED';
  readonly decimalPlaces: number;
  readonly scale: number;
}

/** Thrown when an exact result would exceed the working precision. Never expected in practice. */
/** Thrown when a Decimal/Money is used where JavaScript would coerce it to a number. */
export class ImplicitConversionError extends InvariantError {
  override readonly name = 'ImplicitConversionError';
}

/**
 * Shared `Symbol.toPrimitive` guard. String conversion (`String(x)`, template literals) is
 * allowed; numeric/default conversion is not, because `+x`, `Number(x)`, `x * 2` would silently
 * fall back to IEEE-754 floats and `a > b` would compare *strings* ("10" > "9" is false).
 * TypeScript does not reject these expressions, so the guard must exist at runtime.
 */
export function rejectImplicitConversion(
  hint: string,
  asString: () => string,
  typeName: string,
): string {
  if (hint === 'string') return asString();
  throw new ImplicitConversionError(
    `${typeName} cannot be implicitly converted to a number or primitive; ` +
      'use compare()/lessThan()/greaterThan()/equals() or toString()',
  );
}

export class PrecisionExceededError extends InvariantError {
  override readonly name = 'PrecisionExceededError';
}

const assertScale = (scale: number): void => {
  invariant(
    Number.isInteger(scale) && scale >= 0 && scale <= MAX_SCALE,
    `scale must be an integer between 0 and ${MAX_SCALE}`,
  );
};

/** Position of the most significant digit (10^high) — only meaningful for non-zero values. */
const highDigit = (d: DecimalJs): number => d.e;
/** Position of the least significant non-zero digit (10^low). */
const lowDigit = (d: DecimalJs): number => d.e - d.sd() + 1;

/**
 * Immutable, exact decimal number. Construct with {@link Decimal.parse} (untrusted input) or
 * {@link Decimal.of} (trusted literals). There is intentionally no constructor from `number`.
 */
export class Decimal {
  static readonly ZERO = new Decimal(new Engine(0));

  readonly #value: DecimalJs;

  private constructor(value: DecimalJs) {
    this.#value = value;
  }

  /** Parse untrusted input. Rejects anything that is not a plain decimal string. */
  static parse(input: unknown): Result<Decimal, DecimalParseError> {
    if (typeof input !== 'string') return err({ code: 'NOT_A_STRING' });
    if (input.length > MAX_DECIMAL_INPUT_LENGTH) {
      return err({ code: 'INPUT_TOO_LONG', maxLength: MAX_DECIMAL_INPUT_LENGTH });
    }
    if (!DECIMAL_STRING_PATTERN.test(input)) return err({ code: 'INVALID_DECIMAL_FORMAT' });
    return ok(new Decimal(new Engine(input)));
  }

  /** Parse a trusted literal (e.g. a constant in code). Throws `InvariantError` if invalid. */
  static of(input: string): Decimal {
    const result = Decimal.parse(input);
    if (!result.ok) throw new InvariantError(`Invalid decimal literal (${result.error.code})`);
    return result.value;
  }

  /** True if `input` is a syntactically valid decimal string. */
  static isValid(input: unknown): input is string {
    return Decimal.parse(input).ok;
  }

  add(other: Decimal): Decimal {
    this.#assertAdditionFits(other);
    return new Decimal(this.#value.plus(other.#value));
  }

  subtract(other: Decimal): Decimal {
    this.#assertAdditionFits(other);
    return new Decimal(this.#value.minus(other.#value));
  }

  multiply(other: Decimal): Decimal {
    if (this.isZero() || other.isZero()) return Decimal.ZERO;
    if (this.#value.sd() + other.#value.sd() > WORKING_PRECISION) {
      throw new PrecisionExceededError('Multiplication result exceeds working precision');
    }
    return new Decimal(this.#value.times(other.#value));
  }

  /**
   * `this × rate ÷ 100`, exactly. `Decimal.of('1000').percentage(Decimal.of('20'))` is `200`.
   * Division by 100 only shifts the decimal point, so the result is always exact.
   */
  percentage(rate: Decimal): Decimal {
    const product = this.multiply(rate);
    return new Decimal(product.#value.dividedBy(100));
  }

  /**
   * `this ÷ divisor`, rounded to `scale` decimal places with an explicitly chosen mode (decision
   * 82). A quotient is generally not a finite decimal, so a division always names its rounding.
   * Computed exactly: the truncated quotient and its remainder decide the rounding, so no
   * intermediate rounding ever happens. Throws on division by zero (a programmer error).
   */
  divide(divisor: Decimal, scale: number, mode: RoundingMode): Decimal {
    assertScale(scale);
    if (divisor.isZero()) throw new InvariantError('Division by zero');
    const shifted = this.#value.times(new Engine(10).pow(scale));
    const d = divisor.#value;
    const q = shifted.dividedToIntegerBy(d); // truncated toward zero
    const r = shifted.minus(q.times(d));
    let result = q;
    if (!r.isZero()) {
      const negative = shifted.isNegative() !== d.isNegative();
      const twice = r.abs().times(2).comparedTo(d.abs()); // −1 below half, 0 half, 1 above
      const awayFromZero =
        mode === 'UP' ||
        (mode === 'CEILING' && !negative) ||
        (mode === 'FLOOR' && negative) ||
        (mode === 'HALF_UP' && twice >= 0) ||
        (mode === 'HALF_DOWN' && twice > 0) ||
        (mode === 'HALF_EVEN' && (twice > 0 || (twice === 0 && !q.mod(2).isZero())));
      if (awayFromZero) result = negative ? q.minus(1) : q.plus(1);
    }
    return new Decimal(result.dividedBy(new Engine(10).pow(scale)));
  }

  negate(): Decimal {
    return new Decimal(this.#value.negated());
  }

  abs(): Decimal {
    return new Decimal(this.#value.abs());
  }

  /** Round to `scale` decimal places with an explicitly chosen mode. */
  round(scale: number, mode: RoundingMode): Decimal {
    assertScale(scale);
    return new Decimal(this.#value.toDecimalPlaces(scale, ROUNDING[mode]));
  }

  /** Number of digits after the decimal point in the exact value (trailing zeros excluded). */
  decimalPlaces(): number {
    return this.#value.decimalPlaces();
  }

  compare(other: Decimal): -1 | 0 | 1 {
    const c = this.#value.comparedTo(other.#value);
    return c < 0 ? -1 : c > 0 ? 1 : 0;
  }

  equals(other: Decimal): boolean {
    return this.compare(other) === 0;
  }

  lessThan(other: Decimal): boolean {
    return this.compare(other) < 0;
  }

  greaterThan(other: Decimal): boolean {
    return this.compare(other) > 0;
  }

  isZero(): boolean {
    return this.#value.isZero();
  }

  isNegative(): boolean {
    return this.#value.isNegative() && !this.#value.isZero();
  }

  isPositive(): boolean {
    return this.#value.isPositive() && !this.#value.isZero();
  }

  /** Canonical exact string: no exponent, no trailing fractional zeros, `-0` normalized to `0`. */
  toString(): string {
    return this.isZero() ? '0' : this.#value.toFixed();
  }

  /**
   * Exact string with exactly `scale` decimal places, padding with zeros.
   * Returns an error instead of rounding when the value has more decimal places than `scale`.
   */
  toFixedScale(scale: number): Result<string, ScaleError> {
    assertScale(scale);
    const decimalPlaces = this.decimalPlaces();
    if (decimalPlaces > scale) return err({ code: 'ROUNDING_REQUIRED', decimalPlaces, scale });
    const value = this.isZero() ? new Engine(0) : this.#value;
    return ok(value.toFixed(scale));
  }

  /** Serialize as a decimal string, never as a JSON number. */
  [Symbol.toPrimitive](hint: string): string {
    return rejectImplicitConversion(hint, () => this.toString(), 'Decimal');
  }

  toJSON(): string {
    return this.toString();
  }

  #assertAdditionFits(other: Decimal): void {
    if (this.isZero() || other.isZero()) return;
    const a = this.#value;
    const b = other.#value;
    // +1 for a possible carry into a new leading digit.
    const digits = Math.max(highDigit(a), highDigit(b)) - Math.min(lowDigit(a), lowDigit(b)) + 2;
    if (digits > WORKING_PRECISION) {
      throw new PrecisionExceededError('Addition result exceeds working precision');
    }
  }
}
