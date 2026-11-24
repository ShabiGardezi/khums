const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * True for a real Gregorian calendar date in `YYYY-MM-DD` form. Pure string/arithmetic check:
 * no `Date`, no timezones, identical on every platform.
 */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const maxDay = month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);
  return day <= maxDay;
}

/** Compares two valid ISO dates (lexicographic order equals chronological order). */
export function compareIsoDates(a: string, b: string): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Days since 0000-03-01 for a valid ISO date (proleptic Gregorian; pure integer arithmetic). */
function dayNumber(value: string): number {
  const match = ISO_DATE.exec(value);
  if (!match || !isIsoDate(value)) throw new RangeError('Not a valid ISO date');
  let year = Number(match[1]);
  let month = Number(match[2]);
  const day = Number(match[3]);
  // Count from March so that the leap day is the last day of the counted year.
  month = month > 2 ? month - 3 : month + 9;
  if (month >= 10) year -= 1;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const dayOfYear = Math.floor((153 * month + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra;
}

/** The ISO date for a day number produced by `dayNumber`. */
function fromDayNumber(n: number): string {
  const era = Math.floor(n / 146097);
  const dayOfEra = n - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  const pad = (v: number, width: number) => String(v).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Number of days from `from` to `to` (negative if `to` is earlier). Both must be valid dates. */
export function daysBetweenIsoDates(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** The valid ISO date `days` days after (or before, if negative) `date`. */
export function addDaysToIsoDate(date: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError('Days must be a whole number');
  return fromDayNumber(dayNumber(date) + days);
}
