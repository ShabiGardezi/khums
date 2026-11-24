import { Decimal, getCurrency, Money, formatMoney, SUPPORTED_CURRENCY_CODES } from '@khums/money';
import type {
  FactDateFieldName,
  FactSheetContext,
  FinancialFactKind,
  FinancialFactSheet,
} from '@khums/shared-types';

import { parseFinancialFactSheet, type FactSheetIssue } from './fact-sheet';

/**
 * Framework-independent support for entering financial facts (M4.3.2).
 *
 * Everything here describes or validates what the user reports. Nothing classifies a fact,
 * converts a currency or adds amounts together.
 */

export {
  AMOUNT_INPUT_POLICY,
  FACT_TEXT_LIMITS,
  FINANCIAL_FACT_SUBTYPES,
  MAX_FACT_PERIODS,
  MAX_FACTS_PER_SHEET,
} from '@khums/validation';

/** The five fact kinds, in a neutral display order. */
export const FACT_KINDS = [
  'ASSET',
  'BALANCE',
  'INCOME',
  'EXPENSE',
  'LIABILITY',
] as const satisfies readonly FinancialFactKind[];

type MissingKinds = Exclude<FinancialFactKind, (typeof FACT_KINDS)[number]>;
type AssertNever<T extends never> = T;
export type FactKindsAreExhaustive = AssertNever<MissingKinds>;

/** Date field names (shared type). */
export type FactDateField = FactDateFieldName;

/** Date fields of each kind: the engine's single runtime copy of the shared fact types. */
export { FACT_DATE_FIELDS } from '@khums/calculation-engine';

/** ISO 4217 codes a fact may use (those supported by @khums/money). */
export const FACT_CURRENCIES: readonly string[] = SUPPORTED_CURRENCY_CODES;

/** Decimal places a currency allows (ISO 4217 minor units), or null if unsupported. */
export function currencyMinorUnits(code: string): number | null {
  const currency = getCurrency(code);
  return currency.ok ? currency.value.minorUnits : null;
}

export interface FactSheetFrame {
  readonly currency: string;
  readonly context: FactSheetContext;
}

/** Issues with the sheet's currency and dates alone (paths start with `currency`/`context`). */
export function validateFactSheetFrame(frame: FactSheetFrame): readonly FactSheetIssue[] {
  const result = parseFinancialFactSheet({ schemaVersion: 1, ...frame, facts: [] });
  return result.ok ? [] : result.error;
}

/**
 * Validates one candidate fact against the sheet's currency and dates, on its own (so other
 * facts cannot hide or cause its issues). Paths are relative to the fact, e.g. `value.amount`.
 * Never throws and never echoes values.
 */
export function validateFactInFrame(
  frame: FactSheetFrame,
  fact: unknown,
): readonly FactSheetIssue[] {
  const result = parseFinancialFactSheet({ schemaVersion: 1, ...frame, facts: [fact] });
  if (result.ok) return [];
  return result.error
    .filter((issue) => issue.path === 'facts' || issue.path.startsWith('facts.0'))
    .map((issue) => ({ ...issue, path: issue.path.replace(/^facts(\.0)?\.?/, '') }));
}

/**
 * Issues for every fact in a complete sheet, keyed by fact id (e.g. after the dates changed).
 * Sheet-level date issues are returned under the key `''`.
 */
export function factIssuesById(
  sheet: FinancialFactSheet,
): ReadonlyMap<string, readonly FactSheetIssue[]> {
  const issues = new Map<string, FactSheetIssue[]>();
  const result = parseFinancialFactSheet(sheet);
  if (result.ok) return issues;
  for (const issue of result.error) {
    const match = /^facts\.(\d+)(?:\.(.*))?$/.exec(issue.path);
    const fact = match === null ? undefined : sheet.facts[Number(match[1])];
    const key = fact?.id ?? '';
    const list = issues.get(key) ?? [];
    list.push({ ...issue, path: match?.[2] ?? issue.path });
    issues.set(key, list);
  }
  return issues;
}

/**
 * Formats a validated amount in its own currency for display. Never rounds and never converts:
 * returns null if the amount is not exactly representable at the currency's precision.
 */
export function formatFactAmount(amount: string, currency: string, locale: string): string | null {
  const money = Money.parse(amount, currency);
  if (!money.ok) return null;
  const formatted = formatMoney(money.value, locale);
  return formatted.ok ? formatted.value : null;
}

/**
 * True only for a valid decimal string that is zero or greater (exact, via `@khums/money`); false
 * for a negative or invalid value. Used to read a program's structure without assuming the sign
 * of a pack parameter (audit L-3).
 */
export function isNonNegativeDecimal(value: string): boolean {
  const parsed = Decimal.parse(value);
  return parsed.ok && !parsed.value.isNegative();
}

/**
 * True when a valid decimal amount has more fractional digits than its currency's minor units
 * (e.g. `66.666` USD). Such figures are shown exactly as calculated and labelled as exact, not
 * rounded (audit BLD-05; maintainer decision: no rounding). String inspection only: no rounding,
 * no conversion and no float arithmetic.
 */
export function amountExceedsCurrencyPrecision(amount: string, currency: string): boolean {
  const info = getCurrency(currency);
  const match = /^-?\d+(?:\.(\d+))?$/.exec(amount);
  if (!info.ok || match === null) return false;
  const fraction = (match[1] ?? '').replace(/0+$/, '');
  return fraction.length > info.value.minorUnits;
}
