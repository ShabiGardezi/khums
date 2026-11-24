import type { Workflow } from '../calculation/input';
import type { CurrencyCodeString, DecimalString, IsoDate } from '../calculation/primitives';

/**
 * Financial facts (M4.3.1): what the user says they own, received, spent or owe, **before** any
 * religious interpretation.
 *
 * Neutrality rules (docs/FINANCIAL_INPUT_MODEL.md):
 * - A fact describes a financial situation only. Nothing here says whether it is liable to
 *   Khums, deductible, exempt or relevant to any Marja or workflow.
 * - There are no rates, thresholds or formulas. How a fact is treated is decided later by an
 *   approved rule pack, through a pack-owned mapping (not yet implemented).
 * - Amounts are non-negative decimal strings with an explicit currency. Direction (owned vs
 *   owed, received vs paid) comes from the fact kind, never from a minus sign (FR-4).
 * - The fact vocabulary is provisional and non-authoritative: it may be extended, but a ruling
 *   is never simplified to fit it.
 */

/** What kind of financial fact this is (financial nature only). */
export type FinancialFactKind = 'ASSET' | 'BALANCE' | 'INCOME' | 'EXPENSE' | 'LIABILITY';

/**
 * Descriptive subtypes per kind. They help the user describe a fact and give future rule-pack
 * mappings something stable to refer to. They carry **no** religious meaning; `OTHER` plus a
 * user label covers anything not listed.
 */
export interface FinancialFactSubtypes {
  /** Things owned, other than cash and account balances. */
  readonly ASSET:
    | 'PRECIOUS_METAL'
    | 'REAL_ESTATE'
    | 'VEHICLE'
    | 'INVESTMENT'
    | 'BUSINESS_STOCK'
    | 'HOUSEHOLD_ITEM'
    | 'RECEIVABLE'
    | 'HOME'
    | 'LAND'
    | 'JEWELLERY'
    | 'PERSONAL_ITEM'
    | 'BUSINESS_EQUIPMENT'
    | 'DIGITAL_ASSET'
    | 'JOINT_OWNERSHIP'
    /** Decision 81 (Al-Bi'that Trust form): animals, crops and trees, raw materials, leftover
     * household stock, dowry items, loans given, committee (savings group) money, prize bonds,
     * things paid ahead, a partnership share, things rented out. */
    | 'LIVESTOCK'
    | 'CROPS_AND_TREES'
    | 'RAW_MATERIAL'
    | 'HOUSEHOLD_STOCK'
    | 'DOWRY_ITEMS'
    | 'LOAN_GIVEN'
    | 'COMMITTEE'
    | 'PRIZE_BOND'
    | 'PREPAID'
    | 'PARTNERSHIP_SHARE'
    | 'RENTAL_ASSET'
    | 'OTHER';
  /** Money held in cash or in an account, at a date. */
  readonly BALANCE:
    | 'CASH'
    | 'BANK_ACCOUNT'
    | 'DIGITAL_WALLET'
    | 'MIXED_FUNDS'
    /** Decision 81: money set aside for Hajj. */
    | 'HAJJ_SAVINGS'
    | 'OTHER';
  /** Money or value received. */
  readonly INCOME:
    | 'EMPLOYMENT'
    | 'BUSINESS'
    | 'INVESTMENT_RETURN'
    | 'RENTAL'
    | 'SALE'
    | 'GIFT'
    | 'INHERITANCE'
    | 'FREELANCE'
    | 'BONUS'
    | 'PENSION_OR_BENEFIT'
    | 'CHARITY_RECEIVED'
    | 'MINED_PRODUCT'
    | 'TREASURE'
    | 'DIVING_GEMS'
    /** Phase 4: mahr received; diyah (compensation for injury or death) received. */
    | 'MAHR'
    | 'DIYAH'
    /** Phase 4: money paid out by an insurer. */
    | 'INSURANCE_PAYOUT'
    /** Decision 81: scholarship, income support programme, an institution's payment to heirs,
     * dowry received, property received in khula, provident fund, gratuity, leave encashment. */
    | 'SCHOLARSHIP'
    | 'INCOME_SUPPORT'
    | 'DEATH_BENEFIT'
    | 'DOWRY_RECEIVED'
    | 'KHULA_RECEIVED'
    | 'PROVIDENT_FUND'
    | 'GRATUITY'
    | 'LEAVE_ENCASHMENT'
    | 'OTHER';
  /** Money paid out. */
  readonly EXPENSE:
    | 'HOUSEHOLD'
    | 'HOUSING'
    | 'EDUCATION'
    | 'HEALTH'
    | 'TRAVEL'
    | 'BUSINESS'
    | 'DONATION'
    | 'RELIGIOUS_DUTY'
    /** Tax paid (income tax and similar). */
    | 'TAX'
    /** Phase 4: insurance premiums paid. */
    | 'INSURANCE'
    | 'CAPITAL_LOSS'
    | 'SOLD_ITEM_COST'
    | 'ASSET_PURCHASE'
    | 'KHUMS_PAID'
    /** Decision 81: a fall in value of fixed business capital; fixed shop decoration. */
    | 'FIXED_CAPITAL_LOSS'
    | 'SHOP_FITOUT'
    | 'OTHER';
  /** Money owed by the user. */
  readonly LIABILITY:
    | 'LOAN'
    | 'MORTGAGE'
    | 'CREDIT_CARD'
    | 'UNPAID_BILL'
    | 'BUSINESS_DEBT'
    | 'UNPAID_KHUMS'
    /** Phase 4: mahr owed to one's wife and not yet paid. */
    | 'UNPAID_MAHR'
    | 'OTHER';
}

export type FinancialFactSubtype<K extends FinancialFactKind = FinancialFactKind> =
  FinancialFactSubtypes[K];

/**
 * An amount the user may or may not know.
 * - `NOT_PROVIDED`: not answered yet (missing). Distinct from:
 * - `UNKNOWN`: the user has said they do not know it.
 * - `ESTIMATED`: the user's best estimate (uncertain).
 * - `RANGE`: the user can only give lower and upper bounds (uncertain).
 * - `KNOWN`: the user states the exact amount.
 * Amounts are non-negative decimal strings in the fact's currency; zero is allowed.
 */
export type AmountValue =
  | { readonly status: 'KNOWN'; readonly amount: DecimalString }
  | { readonly status: 'ESTIMATED'; readonly amount: DecimalString }
  | { readonly status: 'RANGE'; readonly min: DecimalString; readonly max: DecimalString }
  | { readonly status: 'UNKNOWN' }
  | { readonly status: 'NOT_PROVIDED' };

/**
 * A date the user may or may not know (same missing/unknown/uncertain distinction).
 * An `APPROXIMATE` date stays approximate: it is never converted to an exact date, never used to
 * establish date order or period membership, and a rule needing an exact date must ask the user
 * or stop (see `requireExactDate` in @khums/core).
 */
export type DateValue =
  | { readonly status: 'KNOWN'; readonly date: IsoDate }
  | { readonly status: 'APPROXIMATE'; readonly date: IsoDate }
  | { readonly status: 'UNKNOWN' }
  | { readonly status: 'NOT_PROVIDED' };

interface FactBase<K extends FinancialFactKind> {
  /** Stable id within the sheet (not user data). */
  readonly id: string;
  readonly kind: K;
  readonly subtype: FinancialFactSubtype<K>;
  /** Optional short user label ("Savings account"). Avoid account numbers or names. */
  readonly label: string | null;
  /** Optional user note. Never parsed, classified or sent anywhere by the app. */
  readonly note: string | null;
  /**
   * The actual ISO 4217 currency of `value`, as the user holds or paid it. May differ from the
   * sheet's currency and from other facts. It is never converted, and no exchange rate is implied.
   */
  readonly currency: CurrencyCodeString;
  readonly value: AmountValue;
  /**
   * Missed-year workflow only: the id of the past period this fact belongs to. `null` in other
   * workflows.
   */
  readonly periodId: string | null;
}

/** Something owned (valued at a date), with its acquisition date if the user knows it. */
export interface AssetFact extends FactBase<'ASSET'> {
  readonly valuedOn: DateValue;
  readonly acquiredOn: DateValue;
}

/** Cash or an account balance at a date. */
export interface BalanceFact extends FactBase<'BALANCE'> {
  readonly valuedOn: DateValue;
}

export interface IncomeFact extends FactBase<'INCOME'> {
  readonly receivedOn: DateValue;
}

export interface ExpenseFact extends FactBase<'EXPENSE'> {
  readonly paidOn: DateValue;
}

/** An amount owed by the user (outstanding at `valuedOn`). */
export interface LiabilityFact extends FactBase<'LIABILITY'> {
  readonly valuedOn: DateValue;
  readonly incurredOn: DateValue;
  /** May legitimately be after the assessment's reference date. */
  readonly dueOn: DateValue;
}

/** Names of the date fields used by fact kinds. */
export type FactDateFieldName =
  'valuedOn' | 'acquiredOn' | 'receivedOn' | 'paidOn' | 'incurredOn' | 'dueOn';

export type FinancialFact = AssetFact | BalanceFact | IncomeFact | ExpenseFact | LiabilityFact;

export interface FactPeriod {
  readonly start: IsoDate;
  readonly end: IsoDate;
}

/** A past period in a missed-year assessment; facts refer to it by `id`. */
export interface IdentifiedFactPeriod extends FactPeriod {
  readonly id: string;
}

/**
 * Dates that frame the facts. Mirrors the engine's workflow inputs, so facts can later be
 * mapped into an `AssessmentInput` by an approved rule pack.
 */
export type FactSheetContext =
  | { readonly workflow: 'annual'; readonly period: FactPeriod }
  | { readonly workflow: 'first-time'; readonly assessmentDate: IsoDate }
  | {
      readonly workflow: 'missed-year';
      readonly assessmentDate: IsoDate;
      readonly periods: readonly IdentifiedFactPeriod[];
    };

/** Compile-time guard: every shared workflow has a fact-sheet context. */
type MissingContexts = Exclude<Workflow, FactSheetContext['workflow']>;
type AssertNever<T extends never> = T;
export type FactSheetContextsAreExhaustive = AssertNever<MissingContexts>;

/**
 * All facts the user provides for one assessment. User-owned, transient (no persistence yet),
 * and independent of the Marja: the same facts can be read by any approved rule pack.
 */
export interface FinancialFactSheet {
  readonly schemaVersion: 1;
  /**
   * The preferred (default) currency for this assessment, e.g. the one a form pre-fills. It does
   * not change any fact's currency. Facts in other currencies are kept as entered: there is no
   * automatic conversion, no cross-currency aggregation and no inferred exchange rate.
   */
  readonly currency: CurrencyCodeString;
  readonly context: FactSheetContext;
  readonly facts: readonly FinancialFact[];
}
