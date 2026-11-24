import type { Brand } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';

/** ISO 4217 alphabetic currency code that is known to this package. */
export type CurrencyCode = Brand<string, 'CurrencyCode'>;

export interface CurrencyInfo {
  readonly code: CurrencyCode;
  /**
   * ISO 4217 minor-unit exponent: the number of decimal places of the currency's smallest
   * official unit (USD 2 → cents, KWD 3 → fils, JPY 0).
   *
   * Used only when a value is explicitly rounded *to currency precision* (settlement/display).
   * Calculations keep full precision; the rule set decides when and how to round. Note that
   * everyday practice can differ from ISO (e.g. IRR is quoted without decimals) — such
   * conventions belong in rule-set / UI policy, not here.
   */
  readonly minorUnits: number;
}

/**
 * Initial currency list (ISO 4217 minor units), focused on regions with large Shia communities
 * plus major reserve currencies. Extend deliberately; values must come from ISO 4217.
 */
const MINOR_UNITS = {
  AED: 2,
  AFN: 2,
  AUD: 2,
  AZN: 2,
  BDT: 2,
  BHD: 3,
  CAD: 2,
  CHF: 2,
  EUR: 2,
  GBP: 2,
  INR: 2,
  IQD: 3,
  IRR: 2,
  JOD: 3,
  JPY: 0,
  KES: 2,
  KWD: 3,
  LBP: 2,
  NOK: 2,
  NZD: 2,
  OMR: 3,
  PKR: 2,
  QAR: 2,
  SAR: 2,
  SEK: 2,
  SYP: 2,
  TRY: 2,
  TZS: 2,
  USD: 2,
  YER: 2,
  ZAR: 2,
} as const satisfies Record<string, number>;

export interface CurrencyError {
  readonly code: 'UNSUPPORTED_CURRENCY';
}

export const SUPPORTED_CURRENCY_CODES: readonly CurrencyCode[] = Object.keys(MINOR_UNITS).map(
  (code) => code as CurrencyCode,
);

const isKnown = (code: string): code is keyof typeof MINOR_UNITS =>
  Object.prototype.hasOwnProperty.call(MINOR_UNITS, code);

/** Look up a currency by its ISO 4217 code (case-sensitive, upper case). */
export function getCurrency(code: string): Result<CurrencyInfo, CurrencyError> {
  if (!isKnown(code)) return err({ code: 'UNSUPPORTED_CURRENCY' });
  return ok({ code: code as CurrencyCode, minorUnits: MINOR_UNITS[code] });
}
