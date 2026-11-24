import type { ApiError, TestScholarRulesRequest } from '@khums/api-client';
import type { FinancialFactKind } from '@khums/shared-types';
import {
  BUILDER_CONDITION_EFFECTS,
  BUILDER_CONDITION_SCOPES,
  BUILDER_DEDUCTION_TYPES,
  BUILDER_REQUIREMENT_FLAGS,
  BUILDER_THRESHOLD_BASES,
  BUILDER_THRESHOLD_EFFECTS,
  FINANCIAL_FACT_SUBTYPES,
  type BuilderCategory,
  type BuilderEntryRef,
  type BuilderRuleContent,
} from '@khums/core';

/**
 * Pure helpers of the rule builder form (Phase 2 steps 3–4): form data ⇄ builder content. They
 * only copy what the scholar entered (never a default rate, value or effect); the API validates
 * everything again.
 */

export const FACT_KINDS = Object.keys(FINANCIAL_FACT_SUBTYPES) as FinancialFactKind[];

/** Every predefined entry type, in kind order. */
export const ENTRY_TYPES: readonly BuilderEntryRef[] = FACT_KINDS.flatMap((kind) =>
  (FINANCIAL_FACT_SUBTYPES[kind] as readonly string[]).map((subtype) => ({ kind, subtype })),
);

export const entryValue = (ref: BuilderEntryRef) => `${ref.kind}:${ref.subtype}`;

export function parseEntryValue(value: string): BuilderEntryRef | null {
  const [kind, subtype, extra] = value.split(':');
  if (kind === undefined || subtype === undefined || extra !== undefined) return null;
  if (!(FACT_KINDS as readonly string[]).includes(kind)) return null;
  const known = FINANCIAL_FACT_SUBTYPES[kind as FinancialFactKind] as readonly string[];
  return known.includes(subtype) ? { kind: kind as FinancialFactKind, subtype } : null;
}

const text = (data: FormData, name: string): string => {
  const value = data.get(name);
  return typeof value === 'string' ? value.trim() : '';
};
const optional = (data: FormData, name: string): string | null => {
  const value = text(data, name);
  return value === '' ? null : value;
};
const entries = (data: FormData, name: string): BuilderEntryRef[] =>
  data
    .getAll(name)
    .filter((v): v is string => typeof v === 'string')
    .map(parseEntryValue)
    .filter((ref): ref is BuilderEntryRef => ref !== null);
const oneOf = <T extends string>(value: string, allowed: readonly T[]): T | null =>
  (allowed as readonly string[]).includes(value) ? (value as T) : null;

/** Field names of the rule form. */
export const RULE_FIELDS = {
  category: 'category',
  ruling: 'rulingId',
  rate: 'rate',
  included: 'included',
  deduction: (type: string) => `deduction.${type}`,
  deductionAgainst: (type: string) => `deductionAgainst.${type}`,
  // Phase 4 (decision 78)
  deductionInflation: (type: string) => `deductionInflation.${type}`,
  deductionAfterDays: (type: string) => `deductionAfterDays.${type}`,
  conditionOpening: (index: string) => `condition.${index}.openingValues`,
  periodLongerThanAYear: 'periodLongerThanAYear',
  conditionEntries: (index: string) => `condition.${index}.entries`,
  exceptions: 'exceptions',
  conditionIndex: 'conditionIndex',
  condition: (index: string, part: 'scope' | 'label' | 'effect') => `condition.${index}.${part}`,
  thresholdUse: 'thresholdUse',
  thresholdAmount: 'thresholdAmount',
  thresholdCurrency: 'thresholdCurrency',
  thresholdBasis: 'thresholdBasis',
  thresholdEffect: 'thresholdEffect',
  sources: 'sourceRefs',
  flags: 'requirementFlags',
  otherRequirement: 'otherRequirement',
  notes: 'notes',
  reason: 'reason',
} as const;

/** The builder content of the rule form (untrusted shape; validated by the API). */
export function builderContentFrom(data: FormData): BuilderRuleContent {
  const conditions = data
    .getAll(RULE_FIELDS.conditionIndex)
    .filter((v): v is string => typeof v === 'string')
    .flatMap((index) => {
      const scope = oneOf(
        text(data, RULE_FIELDS.condition(index, 'scope')),
        BUILDER_CONDITION_SCOPES,
      );
      const effect = oneOf(
        text(data, RULE_FIELDS.condition(index, 'effect')),
        BUILDER_CONDITION_EFFECTS,
      );
      const label = text(data, RULE_FIELDS.condition(index, 'label'));
      // Phase 4: per-entry confirmations name the entries they are asked for (empty = all counted).
      const named = scope === 'ENTRY' ? entries(data, RULE_FIELDS.conditionEntries(index)) : [];
      // Phase 4: asked for the entries' values at the start of the year instead.
      const opening = data.get(RULE_FIELDS.conditionOpening(index)) === 'on';
      return scope === null || effect === null
        ? []
        : [
            opening
              ? { scope, label, effect, entries: named, openingValues: true as const }
              : { scope, label, effect, entries: named },
          ];
    });
  const thresholdBasis = oneOf(text(data, RULE_FIELDS.thresholdBasis), BUILDER_THRESHOLD_BASES);
  const thresholdEffect = oneOf(text(data, RULE_FIELDS.thresholdEffect), BUILDER_THRESHOLD_EFFECTS);
  return {
    category: text(data, RULE_FIELDS.category) as BuilderCategory,
    rulingId: optional(data, RULE_FIELDS.ruling),
    rate: optional(data, RULE_FIELDS.rate),
    includedEntries: entries(data, RULE_FIELDS.included),
    deductions: BUILDER_DEDUCTION_TYPES.flatMap((type) => {
      const covered = entries(data, RULE_FIELDS.deduction(type));
      const against = entries(data, RULE_FIELDS.deductionAgainst(type));
      if (covered.length === 0) return [];
      // Phase 4: optional fields appear only when set (earlier revisions keep their hash).
      const inflation = oneOf(text(data, RULE_FIELDS.deductionInflation(type)), [
        'ADDED',
        'ONLY',
      ] as const);
      const days = text(data, RULE_FIELDS.deductionAfterDays(type));
      return [
        {
          type,
          entries: covered,
          ...(against.length === 0 ? {} : { against }),
          ...(inflation === null ? {} : { inflation }),
          ...(/^[0-9]{1,2}$/.test(days) ? { afterYearEndDays: Number(days) } : {}),
        },
      ];
    }),
    conditions,
    exceptions: entries(data, RULE_FIELDS.exceptions),
    threshold:
      data.get(RULE_FIELDS.thresholdUse) === 'on' &&
      thresholdBasis !== null &&
      thresholdEffect !== null
        ? {
            amount: text(data, RULE_FIELDS.thresholdAmount),
            currency: text(data, RULE_FIELDS.thresholdCurrency).toUpperCase(),
            basis: thresholdBasis,
            effect: thresholdEffect,
          }
        : null,
    sourceRefs: data.getAll(RULE_FIELDS.sources).filter((v): v is string => typeof v === 'string'),
    requirementFlags: data
      .getAll(RULE_FIELDS.flags)
      .filter((v): v is string => typeof v === 'string')
      .map((v) => oneOf(v, BUILDER_REQUIREMENT_FLAGS))
      .filter((v): v is NonNullable<typeof v> => v !== null),
    otherRequirement: optional(data, RULE_FIELDS.otherRequirement),
    notes: optional(data, RULE_FIELDS.notes),
    ...(data.get(RULE_FIELDS.periodLongerThanAYear) === 'on'
      ? { periodLongerThanAYear: 'STOP_FOR_REVIEW' as const }
      : {}),
  };
}

/** The stable refusal codes of a RULE_REFUSED problem (fixed identifiers listed by the API). */
export function ruleRefusalCodes(error: ApiError): readonly string[] {
  if (error.kind !== 'http' || error.problem.code !== 'RULE_REFUSED') return [];
  const match = /\(([A-Z0-9_, ]+)\)/.exec(error.problem.detail ?? '');
  return (
    match?.[1]
      ?.split(',')
      .map((c) => c.trim())
      .filter((c) => c !== '') ?? []
  );
}

export interface TestEntryRow {
  readonly id: string;
  readonly entryType: string;
  readonly amount: string;
  readonly date: string;
}

/** The test request of the test panel; rows with an unknown entry type are left out. */
export function testRequestFrom(input: {
  readonly marjaId: string;
  readonly currency: string;
  readonly start: string;
  readonly end: string;
  readonly rows: readonly TestEntryRow[];
  readonly answers: Readonly<Record<string, boolean>>;
  /** Phase 4: an inflation question takes a percentage (decimal string). */
  readonly entryAnswers: Readonly<Record<string, Readonly<Record<string, boolean | string>>>>;
}): TestScholarRulesRequest {
  return {
    marjaId: input.marjaId,
    currency: input.currency.trim().toUpperCase(),
    period: { start: input.start, end: input.end },
    entries: input.rows.flatMap((row) => {
      const ref = parseEntryValue(row.entryType);
      return ref === null
        ? []
        : [
            {
              id: row.id,
              kind: ref.kind,
              subtype: ref.subtype,
              amount: row.amount.trim(),
              date: row.date,
            },
          ];
    }),
    answers: { ...input.answers },
    entryAnswers: Object.fromEntries(
      Object.entries(input.entryAnswers).filter(([id]) => input.rows.some((r) => r.id === id)),
    ),
  };
}
