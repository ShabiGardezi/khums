import { err, ok, type Result } from '@khums/utils';

import type { Money } from './money';

/**
 * Presentation only — kept separate from arithmetic. Formatting never rounds: the amount must
 * already be rounded to currency precision (call `roundToCurrency(mode)` explicitly first).
 *
 * Uses `Intl.NumberFormat` with a *string* argument so large values are not converted to
 * floating point (supported by modern browsers and Node; verify Hermes when mobile starts).
 */
export interface FormatError {
  readonly code: 'ROUNDING_REQUIRED';
}

export function formatMoney(money: Money, locale: string): Result<string, FormatError> {
  const fixed = money.toCurrencyString();
  if (!fixed.ok) return err({ code: 'ROUNDING_REQUIRED' });
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency.code,
    minimumFractionDigits: money.currency.minorUnits,
    maximumFractionDigits: money.currency.minorUnits,
  });
  return ok(formatter.format(fixed.value as `${number}`));
}
