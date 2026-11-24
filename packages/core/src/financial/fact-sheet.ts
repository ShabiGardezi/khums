import type { DateValue, FinancialFact, FinancialFactSheet, IsoDate } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import { financialFactSheetSchema } from '@khums/validation';

/**
 * Application-facing entry point for user-provided financial facts.
 *
 * Facts are neutral: this module never classifies them, never maps them to rule-pack categories
 * and never calculates. Issues carry only a path and a stable code, never submitted values, so
 * they are safe to show in the UI and cannot leak amounts or notes into logs.
 */

export interface FactSheetIssue {
  /** Dotted path, e.g. `facts.2.value.amount`. Indexes and field names only. */
  readonly path: string;
  /** Stable code (e.g. `AMOUNT_TOO_PRECISE`, or a structural code such as `invalid_type`). */
  readonly code: string;
}

/** Validates an untrusted fact sheet. Never throws; never echoes values. */
export function parseFinancialFactSheet(
  raw: unknown,
): Result<FinancialFactSheet, readonly FactSheetIssue[]> {
  const parsed = financialFactSheetSchema.safeParse(raw);
  if (parsed.success) return ok(parsed.data);
  return err(
    parsed.error.issues.map((issue) => {
      const params = (issue as { params?: { code?: unknown } }).params;
      return {
        path: issue.path.map(String).join('.'),
        code: typeof params?.code === 'string' ? params.code : issue.code,
      };
    }),
  );
}

/** Completeness counts: how many values the user knows, estimated, does not know or has not given. */
export interface FactSheetCompleteness {
  readonly facts: number;
  readonly amounts: {
    readonly known: number;
    readonly estimated: number;
    readonly range: number;
    readonly unknown: number;
    readonly notProvided: number;
  };
}

/**
 * Describes how complete the user's facts are. Purely descriptive: it does not say whether any
 * missing value matters, which only an approved rule pack can decide.
 */
export function describeFactCompleteness(sheet: FinancialFactSheet): FactSheetCompleteness {
  const amounts = { known: 0, estimated: 0, range: 0, unknown: 0, notProvided: 0 };
  for (const fact of sheet.facts) {
    switch (fact.value.status) {
      case 'KNOWN':
        amounts.known += 1;
        break;
      case 'ESTIMATED':
        amounts.estimated += 1;
        break;
      case 'RANGE':
        amounts.range += 1;
        break;
      case 'UNKNOWN':
        amounts.unknown += 1;
        break;
      case 'NOT_PROVIDED':
        amounts.notProvided += 1;
        break;
    }
  }
  return { facts: sheet.facts.length, amounts };
}

/** Facts of one kind, typed. Grouping only; no meaning is attached to the kind. */
export function factsOfKind<K extends FinancialFact['kind']>(
  sheet: FinancialFactSheet,
  kind: K,
): Extract<FinancialFact, { kind: K }>[] {
  return sheet.facts.filter(
    (fact): fact is Extract<FinancialFact, { kind: K }> => fact.kind === kind,
  );
}

/**
 * Result of asking for an exact date. Anything other than a `KNOWN` date is reported, never
 * guessed: an approximate date is not turned into an exact one.
 */
export type ExactDateResult =
  | { readonly kind: 'exact'; readonly date: IsoDate }
  | {
      readonly kind: 'needs-clarification';
      /** Why no exact date is available; the approximate date, if any, is kept for display. */
      readonly reason: 'APPROXIMATE' | 'UNKNOWN' | 'NOT_PROVIDED';
      readonly approximateDate: IsoDate | null;
    };

/**
 * For future rules that need an exact date: returns the date only if the user stated it exactly.
 * Otherwise the caller must ask the user or stop (e.g. a rule-pack consultation), never assume.
 */
export function requireExactDate(value: DateValue): ExactDateResult {
  switch (value.status) {
    case 'KNOWN':
      return { kind: 'exact', date: value.date };
    case 'APPROXIMATE':
      return { kind: 'needs-clarification', reason: 'APPROXIMATE', approximateDate: value.date };
    case 'UNKNOWN':
      return { kind: 'needs-clarification', reason: 'UNKNOWN', approximateDate: null };
    case 'NOT_PROVIDED':
      return { kind: 'needs-clarification', reason: 'NOT_PROVIDED', approximateDate: null };
  }
}
