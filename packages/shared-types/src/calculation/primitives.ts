/** Exact decimal number encoded as a string (e.g. "1234.56"). Never a JS number. */
export type DecimalString = string;

/** Calendar date `YYYY-MM-DD` (no time, no timezone). */
export type IsoDate = string;

/** ISO 4217 currency code, e.g. "USD". Validated against `@khums/money` at runtime. */
export type CurrencyCodeString = string;

/**
 * Rounding modes (canonical list and semantics in `@khums/money`). There is no default:
 * rounding always names its mode, normally taken from an approved rule pack.
 */
export type RoundingMode =
  'UP' | 'DOWN' | 'CEILING' | 'FLOOR' | 'HALF_UP' | 'HALF_DOWN' | 'HALF_EVEN';

/** An exact amount in a currency, as serialized for transport/storage. */
export interface MoneyAmount {
  readonly amount: DecimalString;
  readonly currency: CurrencyCodeString;
}
