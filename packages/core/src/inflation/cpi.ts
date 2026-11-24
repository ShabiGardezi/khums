import { Decimal } from '@khums/money';
import { err, ok, type Result } from '@khums/utils';

/**
 * Decision 83: inflation between two dates from an official monthly consumer price index. Pure:
 * the caller supplies the series (the API holds the IMF data). A figure is a suggestion the
 * person sees and may change; it is never a ruling and never assumed when data is missing.
 */

/** One economy's monthly all-items index (values exactly as published; "-" = not published). */
export interface CpiSeries {
  /** ISO 3166 alpha-3 economy code (G163 = euro area). */
  readonly economy: string;
  readonly index: 'CPI' | 'HICP';
  /** First month, `YYYY-MM`. */
  readonly start: string;
  /** Space-separated decimal strings, one per month from `start`; "-" for a missing month. */
  readonly values: string;
}

export interface CpiInflation {
  /** (index at `toMonth` ÷ index at `fromMonth` − 1) × 100, rounded half up to 2 places. */
  readonly percent: string;
  readonly fromMonth: string;
  /** The `to` date's month, or the latest earlier month with a published index. */
  readonly toMonth: string;
  /** True when `toMonth` is earlier than the `to` date's month (latest published used). */
  readonly latestPublished: boolean;
}

export type CpiInflationError =
  /** `from` is after `to`, or a date is malformed. */
  | { readonly code: 'DATES_INVALID' }
  /** No index for the `from` month, or none at or before the `to` month. */
  | { readonly code: 'NOT_AVAILABLE' };

/** Decimal places of a suggested percentage (rounded half up; a presentation choice). */
export const CPI_PERCENT_SCALE = 2;

const MONTH = /^(\d{4})-(\d{2})/;

function monthNumber(date: string): number | null {
  const m = MONTH.exec(date);
  if (m === null) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return Number(m[1]) * 12 + (month - 1);
}

const monthText = (n: number) =>
  `${String(Math.floor(n / 12))}-${String((n % 12) + 1).padStart(2, '0')}`;

export function cpiInflation(
  series: CpiSeries,
  from: string,
  to: string,
): Result<CpiInflation, CpiInflationError> {
  const start = monthNumber(series.start);
  const fromMonth = monthNumber(from);
  const toMonth = monthNumber(to);
  if (start === null || fromMonth === null || toMonth === null || fromMonth > toMonth) {
    return err({ code: 'DATES_INVALID' });
  }
  const values = series.values.split(' ');
  const at = (month: number): Decimal | null => {
    const raw = values[month - start];
    if (raw === undefined || raw === '-') return null;
    const parsed = Decimal.parse(raw);
    return parsed.ok && parsed.value.isPositive() ? parsed.value : null;
  };
  const base = at(fromMonth);
  if (base === null) return err({ code: 'NOT_AVAILABLE' });
  let used = toMonth;
  while (used >= fromMonth && at(used) === null) used -= 1;
  const latest = used >= fromMonth ? at(used) : null;
  if (latest === null) return err({ code: 'NOT_AVAILABLE' });
  const percent = latest
    .multiply(Decimal.of('100'))
    .divide(base, CPI_PERCENT_SCALE, 'HALF_UP')
    .subtract(Decimal.of('100'));
  return ok({
    percent: percent.toString(),
    fromMonth: monthText(fromMonth),
    toMonth: monthText(used),
    latestPublished: used < toMonth,
  });
}
