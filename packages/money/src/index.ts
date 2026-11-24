/**
 * @khums/money — public API.
 *
 * Exact decimal and money arithmetic for every financial computation in the platform.
 * decimal.js is an implementation detail: no other package may import it.
 *
 * Guarantees:
 * - Inputs are decimal strings only; JS numbers are never accepted.
 * - add / subtract / multiply / percentage are exact (or throw `PrecisionExceededError`).
 * - Rounding only happens via `round(scale, mode)` / `roundToCurrency(mode)` with an explicit mode.
 * - Serialization produces decimal strings, never JSON numbers.
 * - Formatting is separate (`formatMoney`) and refuses to round.
 */
export type { CurrencyCode, CurrencyError, CurrencyInfo } from './currency';
export { getCurrency, SUPPORTED_CURRENCY_CODES } from './currency';
export type { DecimalParseError, ScaleError } from './decimal';
export {
  Decimal,
  DECIMAL_STRING_PATTERN,
  MAX_DECIMAL_INPUT_LENGTH,
  ImplicitConversionError,
  PrecisionExceededError,
} from './decimal';
export type { FormatError } from './format';
export { formatMoney } from './format';
export type { MoneyJson, MoneyParseError } from './money';
export { CurrencyMismatchError, Money } from './money';
export type { RoundingMode } from './rounding';
export { MAX_SCALE, ROUNDING_MODES } from './rounding';
