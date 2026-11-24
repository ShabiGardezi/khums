import { z } from 'zod';

import { addDaysToIsoDate } from '@khums/utils';

import { Decimal, getCurrency } from '@khums/money';
import type {
  AmountValue,
  DateValue,
  FinancialFact,
  FinancialFactSheet,
  FinancialFactSubtypes,
} from '@khums/shared-types';

import { identifierSchema, isoDateSchema } from '../calculation/common';
import { decimalStringSchema } from '../decimal';

/**
 * Schemas for neutral financial facts (docs/FINANCIAL_INPUT_MODEL.md).
 *
 * - Structural and consistency checks only. Nothing here decides how a fact is treated
 *   religiously.
 * - Error messages never contain submitted values (amounts, notes, labels or dates): only a
 *   stable `params.code` and the path.
 * - User input is never rounded. An amount with more decimal places than its currency allows is
 *   rejected, not silently rounded.
 */

/**
 * Input boundaries for user-entered amounts. **Approved policy** (M4.3.1 review, 2026-11-20);
 * changing any value needs maintainer approval and a docs update (FINANCIAL_INPUT_MODEL.md §3).
 *
 * Covers user-entered monetary amounts only. Valuation precision (e.g. unit prices) and
 * exchange-rate precision are separate, future decisions.
 */
export const AMOUNT_INPUT_POLICY = {
  status: 'APPROVED',
  /** Up to 999,999,999,999,999 (15 integer digits) in any currency. */
  maxIntegerDigits: 15,
  /** Direction comes from the fact kind (FR-4); a minus sign is never meaningful. */
  allowNegative: false,
  /** Zero is a valid fact (e.g. an empty account). */
  allowZero: true,
  /** Decimal places may not exceed the fact currency's ISO 4217 minor units; excess is rejected. */
  maxFractionDigits: 'CURRENCY_MINOR_UNITS',
  /** Input is validated, never rounded. Rounding is decided only by an approved rule pack. */
  rounding: 'NONE',
} as const;

export const FACT_TEXT_LIMITS = { label: 100, note: 500 } as const;
export const MAX_FACTS_PER_SHEET = 1000;
export const MAX_FACT_PERIODS = 100;

export type FactIssueCode =
  | 'AMOUNT_NEGATIVE'
  | 'AMOUNT_TOO_LARGE'
  | 'AMOUNT_TOO_PRECISE'
  | 'RANGE_MIN_GREATER_THAN_MAX'
  | 'UNSUPPORTED_CURRENCY'
  | 'DUPLICATE_ID'
  | 'PERIOD_END_BEFORE_START'
  | 'PERIODS_NOT_ORDERED'
  | 'PERIOD_AFTER_ASSESSMENT_DATE'
  | 'PERIOD_REQUIRED'
  | 'PERIOD_NOT_ALLOWED'
  | 'UNKNOWN_PERIOD'
  | 'DATE_AFTER_REFERENCE_DATE'
  | 'DATE_OUTSIDE_PERIOD'
  | 'VALUED_BEFORE_ACQUIRED'
  | 'VALUED_BEFORE_INCURRED'
  | 'DUE_BEFORE_INCURRED';

type Ctx = z.core.$RefinementCtx;

const report = (ctx: Ctx, code: FactIssueCode, path: (string | number)[], message: string) => {
  ctx.addIssue({ code: 'custom', message, path, params: { code } });
};

/**
 * Zod 4 runs refinements even when the value already has issues, so consistency checks could see
 * malformed data. They run only on otherwise valid input; structural errors are reported first.
 */
const hasIssues = (ctx: Ctx) => ctx.issues.length > 0;

const integerDigits = (amount: string) => (amount.split('.')[0] ?? '').replace('-', '').length;
const fractionDigits = (amount: string) => amount.split('.')[1]?.length ?? 0;

/** A non-negative decimal string within the input boundaries (currency checks are per fact). */
export const factAmountSchema = decimalStringSchema.superRefine((amount, ctx) => {
  if (hasIssues(ctx)) return;
  if (amount.startsWith('-')) {
    report(ctx, 'AMOUNT_NEGATIVE', [], 'Amounts must not be negative');
  }
  if (integerDigits(amount) > AMOUNT_INPUT_POLICY.maxIntegerDigits) {
    report(ctx, 'AMOUNT_TOO_LARGE', [], 'Amount exceeds the maximum allowed size');
  }
});

export const amountValueSchema: z.ZodType<AmountValue> = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('KNOWN'), amount: factAmountSchema }),
  z.strictObject({ status: z.literal('ESTIMATED'), amount: factAmountSchema }),
  z
    .strictObject({ status: z.literal('RANGE'), min: factAmountSchema, max: factAmountSchema })
    .superRefine((range, ctx) => {
      if (hasIssues(ctx)) return;
      if (Decimal.of(range.min).greaterThan(Decimal.of(range.max))) {
        report(
          ctx,
          'RANGE_MIN_GREATER_THAN_MAX',
          ['min'],
          'The lower bound exceeds the upper bound',
        );
      }
    }),
  z.strictObject({ status: z.literal('UNKNOWN') }),
  z.strictObject({ status: z.literal('NOT_PROVIDED') }),
]);

export const dateValueSchema: z.ZodType<DateValue> = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('KNOWN'), date: isoDateSchema }),
  z.strictObject({ status: z.literal('APPROXIMATE'), date: isoDateSchema }),
  z.strictObject({ status: z.literal('UNKNOWN') }),
  z.strictObject({ status: z.literal('NOT_PROVIDED') }),
]);

/** ISO 4217 code supported by @khums/money. */
export const currencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'ISO 4217 code, e.g. "USD"')
  .superRefine((code, ctx) => {
    if (hasIssues(ctx)) return;
    if (!getCurrency(code).ok) report(ctx, 'UNSUPPORTED_CURRENCY', [], 'Unsupported currency');
  });

const SUBTYPES = {
  ASSET: [
    'PRECIOUS_METAL',
    'REAL_ESTATE',
    'VEHICLE',
    'INVESTMENT',
    'BUSINESS_STOCK',
    'HOUSEHOLD_ITEM',
    'RECEIVABLE',
    'HOME',
    'LAND',
    'JEWELLERY',
    'PERSONAL_ITEM',
    'BUSINESS_EQUIPMENT',
    'DIGITAL_ASSET',
    'JOINT_OWNERSHIP',
    'LIVESTOCK',
    'CROPS_AND_TREES',
    'RAW_MATERIAL',
    'HOUSEHOLD_STOCK',
    'DOWRY_ITEMS',
    'LOAN_GIVEN',
    'COMMITTEE',
    'PRIZE_BOND',
    'PREPAID',
    'PARTNERSHIP_SHARE',
    'RENTAL_ASSET',
    'OTHER',
  ],
  BALANCE: ['CASH', 'BANK_ACCOUNT', 'DIGITAL_WALLET', 'MIXED_FUNDS', 'HAJJ_SAVINGS', 'OTHER'],
  INCOME: [
    'EMPLOYMENT',
    'BUSINESS',
    'INVESTMENT_RETURN',
    'RENTAL',
    'SALE',
    'GIFT',
    'INHERITANCE',
    'FREELANCE',
    'BONUS',
    'PENSION_OR_BENEFIT',
    'CHARITY_RECEIVED',
    'MINED_PRODUCT',
    'TREASURE',
    'DIVING_GEMS',
    'MAHR',
    'DIYAH',
    'INSURANCE_PAYOUT',
    'SCHOLARSHIP',
    'INCOME_SUPPORT',
    'DEATH_BENEFIT',
    'DOWRY_RECEIVED',
    'KHULA_RECEIVED',
    'PROVIDENT_FUND',
    'GRATUITY',
    'LEAVE_ENCASHMENT',
    'OTHER',
  ],
  EXPENSE: [
    'HOUSEHOLD',
    'HOUSING',
    'EDUCATION',
    'HEALTH',
    'TRAVEL',
    'BUSINESS',
    'DONATION',
    'RELIGIOUS_DUTY',
    'TAX',
    'INSURANCE',
    'CAPITAL_LOSS',
    'SOLD_ITEM_COST',
    'ASSET_PURCHASE',
    'KHUMS_PAID',
    'FIXED_CAPITAL_LOSS',
    'SHOP_FITOUT',
    'OTHER',
  ],
  LIABILITY: [
    'LOAN',
    'MORTGAGE',
    'CREDIT_CARD',
    'UNPAID_BILL',
    'BUSINESS_DEBT',
    'UNPAID_KHUMS',
    'UNPAID_MAHR',
    'OTHER',
  ],
} as const satisfies {
  readonly [K in keyof FinancialFactSubtypes]: readonly FinancialFactSubtypes[K][];
};

/** Compile-time guard: every shared subtype is listed (no drift from @khums/shared-types). */
type MissingSubtypes = {
  [K in keyof FinancialFactSubtypes]: Exclude<
    FinancialFactSubtypes[K],
    (typeof SUBTYPES)[K][number]
  >;
}[keyof FinancialFactSubtypes];
type AssertNever<T extends never> = T;
export type FactSubtypesAreExhaustive = AssertNever<MissingSubtypes>;

/** Subtypes per fact kind (descriptive only; no religious meaning). */
export const FINANCIAL_FACT_SUBTYPES: {
  readonly [K in keyof FinancialFactSubtypes]: readonly FinancialFactSubtypes[K][];
} = SUBTYPES;

const base = {
  id: identifierSchema,
  label: z.string().trim().min(1).max(FACT_TEXT_LIMITS.label).nullable(),
  note: z.string().trim().min(1).max(FACT_TEXT_LIMITS.note).nullable(),
  currency: currencyCodeSchema,
  value: amountValueSchema,
  periodId: identifierSchema.nullable(),
};

const knownDate = (value: DateValue): string | null =>
  value.status === 'KNOWN' ? value.date : null;

/** Per-fact consistency: currency precision and the order of the fact's own known dates. */
function checkFact(fact: FinancialFact, ctx: Ctx) {
  if (hasIssues(ctx)) return;
  const minor = getCurrency(fact.currency);
  if (minor.ok) {
    const amounts =
      fact.value.status === 'KNOWN' || fact.value.status === 'ESTIMATED'
        ? [['amount', fact.value.amount] as const]
        : fact.value.status === 'RANGE'
          ? ([
              ['min', fact.value.min],
              ['max', fact.value.max],
            ] as const)
          : [];
    for (const [key, amount] of amounts) {
      if (fractionDigits(amount) > minor.value.minorUnits) {
        report(
          ctx,
          'AMOUNT_TOO_PRECISE',
          ['value', key],
          'Amount has more decimal places than the currency allows',
        );
      }
    }
  }

  const before = (a: string | null, b: string | null) => a !== null && b !== null && a < b;
  switch (fact.kind) {
    case 'ASSET':
      if (before(knownDate(fact.valuedOn), knownDate(fact.acquiredOn))) {
        report(ctx, 'VALUED_BEFORE_ACQUIRED', ['valuedOn'], 'Valued before it was acquired');
      }
      break;
    case 'LIABILITY':
      if (before(knownDate(fact.valuedOn), knownDate(fact.incurredOn))) {
        report(ctx, 'VALUED_BEFORE_INCURRED', ['valuedOn'], 'Valued before it was incurred');
      }
      if (before(knownDate(fact.dueOn), knownDate(fact.incurredOn))) {
        report(ctx, 'DUE_BEFORE_INCURRED', ['dueOn'], 'Due before it was incurred');
      }
      break;
    case 'BALANCE':
    case 'INCOME':
    case 'EXPENSE':
      break;
  }
}

export const financialFactSchema: z.ZodType<FinancialFact> = z
  .discriminatedUnion('kind', [
    z.strictObject({
      ...base,
      kind: z.literal('ASSET'),
      subtype: z.enum(SUBTYPES.ASSET),
      valuedOn: dateValueSchema,
      acquiredOn: dateValueSchema,
    }),
    z.strictObject({
      ...base,
      kind: z.literal('BALANCE'),
      subtype: z.enum(SUBTYPES.BALANCE),
      valuedOn: dateValueSchema,
    }),
    z.strictObject({
      ...base,
      kind: z.literal('INCOME'),
      subtype: z.enum(SUBTYPES.INCOME),
      receivedOn: dateValueSchema,
    }),
    z.strictObject({
      ...base,
      kind: z.literal('EXPENSE'),
      subtype: z.enum(SUBTYPES.EXPENSE),
      paidOn: dateValueSchema,
    }),
    z.strictObject({
      ...base,
      kind: z.literal('LIABILITY'),
      subtype: z.enum(SUBTYPES.LIABILITY),
      valuedOn: dateValueSchema,
      incurredOn: dateValueSchema,
      dueOn: dateValueSchema,
    }),
  ])
  .superRefine(checkFact);

const periodSchema = z.strictObject({ start: isoDateSchema, end: isoDateSchema });
const identifiedPeriodSchema = z.strictObject({
  id: identifierSchema,
  start: isoDateSchema,
  end: isoDateSchema,
});

const contextSchema = z.discriminatedUnion('workflow', [
  z.strictObject({ workflow: z.literal('annual'), period: periodSchema }),
  z.strictObject({ workflow: z.literal('first-time'), assessmentDate: isoDateSchema }),
  z.strictObject({
    workflow: z.literal('missed-year'),
    assessmentDate: isoDateSchema,
    periods: z.array(identifiedPeriodSchema).min(1).max(MAX_FACT_PERIODS),
  }),
]);

/** Known dates a fact states about the past (everything except a liability's due date). */
function pastDates(fact: FinancialFact): [string, DateValue][] {
  switch (fact.kind) {
    case 'ASSET':
      return [
        ['valuedOn', fact.valuedOn],
        ['acquiredOn', fact.acquiredOn],
      ];
    case 'BALANCE':
      return [['valuedOn', fact.valuedOn]];
    case 'INCOME':
      return [['receivedOn', fact.receivedOn]];
    case 'EXPENSE':
      return [['paidOn', fact.paidOn]];
    case 'LIABILITY':
      return [
        ['valuedOn', fact.valuedOn],
        ['incurredOn', fact.incurredOn],
      ];
  }
}

/** Date of a receipt or payment, which must fall inside the period the fact belongs to. */
function transactionDate(fact: FinancialFact): [string, DateValue] | null {
  if (fact.kind === 'INCOME') return ['receivedOn', fact.receivedOn];
  if (fact.kind === 'EXPENSE') return ['paidOn', fact.paidOn];
  return null;
}

/**
 * Phase 4 (decision 78): the most days after the khums year end a pack's date window may allow
 * (`AFTER_END` windows are 1 to 31 days). Technical bound, not a ruling.
 */
export const MAX_DAYS_AFTER_YEAR_END = 31;

/** Sheet-level consistency between facts and the assessment's dates and periods. */
function checkSheet(sheet: FinancialFactSheet, ctx: Ctx) {
  if (hasIssues(ctx)) return;
  const { context } = sheet;
  const periods = new Map<string, { start: string; end: string }>();

  if (context.workflow === 'annual' && context.period.end < context.period.start) {
    report(ctx, 'PERIOD_END_BEFORE_START', ['context', 'period'], 'Period ends before it starts');
  }
  if (context.workflow === 'missed-year') {
    let previousEnd: string | null = null;
    context.periods.forEach((period, index) => {
      const path = ['context', 'periods', index];
      if (periods.has(period.id))
        report(ctx, 'DUPLICATE_ID', [...path, 'id'], 'Duplicate period id');
      periods.set(period.id, period);
      if (period.end < period.start) {
        report(ctx, 'PERIOD_END_BEFORE_START', path, 'Period ends before it starts');
      }
      if (previousEnd !== null && period.start <= previousEnd) {
        report(ctx, 'PERIODS_NOT_ORDERED', path, 'Periods must be in order and must not overlap');
      }
      if (period.end > context.assessmentDate) {
        report(ctx, 'PERIOD_AFTER_ASSESSMENT_DATE', path, 'Period ends after the assessment date');
      }
      previousEnd = period.end;
    });
  }

  const referenceDate = context.workflow === 'annual' ? context.period.end : context.assessmentDate;
  const ids = new Set<string>();

  sheet.facts.forEach((fact, index) => {
    const path = ['facts', index];
    if (ids.has(fact.id)) report(ctx, 'DUPLICATE_ID', [...path, 'id'], 'Duplicate fact id');
    ids.add(fact.id);

    let factPeriod: { start: string; end: string } | null = null;
    if (context.workflow === 'missed-year') {
      if (fact.periodId === null) {
        report(ctx, 'PERIOD_REQUIRED', [...path, 'periodId'], 'Each fact must name its period');
      } else {
        factPeriod = periods.get(fact.periodId) ?? null;
        if (factPeriod === null) {
          report(ctx, 'UNKNOWN_PERIOD', [...path, 'periodId'], 'Fact refers to an unknown period');
        }
      }
    } else {
      if (fact.periodId !== null) {
        report(
          ctx,
          'PERIOD_NOT_ALLOWED',
          [...path, 'periodId'],
          'Only missed-year facts name a period',
        );
      }
      if (context.workflow === 'annual') factPeriod = context.period;
    }

    // Phase 4 (decision 78): an annual sheet accepts dates up to the longest window a pack may
    // allow after the khums year end; the pack's mapping decides what they count as (an allowed
    // window or an out-of-period review stop). Anything later stays invalid input.
    const lateLimit =
      context.workflow === 'annual'
        ? addDaysToIsoDate(referenceDate, MAX_DAYS_AFTER_YEAR_END)
        : referenceDate;
    for (const [key, value] of pastDates(fact)) {
      const date = knownDate(value);
      if (date !== null && date > lateLimit) {
        report(
          ctx,
          'DATE_AFTER_REFERENCE_DATE',
          [...path, key],
          'Date is after the assessment date',
        );
      }
    }
    const transaction = transactionDate(fact);
    const date = transaction === null ? null : knownDate(transaction[1]);
    if (transaction !== null && date !== null && factPeriod !== null) {
      const end = context.workflow === 'annual' ? lateLimit : factPeriod.end;
      if (date < factPeriod.start || date > end) {
        report(ctx, 'DATE_OUTSIDE_PERIOD', [...path, transaction[0]], 'Date is outside the period');
      }
    }
  });
}

/** One assessment's financial facts (strict: unexpected fields are rejected). */
export const financialFactSheetSchema: z.ZodType<FinancialFactSheet> = z
  .strictObject({
    schemaVersion: z.literal(1),
    currency: currencyCodeSchema,
    context: contextSchema,
    facts: z.array(financialFactSchema).max(MAX_FACTS_PER_SHEET),
  })
  .superRefine(checkSheet);
