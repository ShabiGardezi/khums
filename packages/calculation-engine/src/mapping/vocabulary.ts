import type {
  FactDateFieldName,
  FinancialFactKind,
  FinancialFactSubtypes,
} from '@khums/shared-types';

/**
 * Date fields of each fact kind, exactly as in `@khums/shared-types` financial facts. The single
 * runtime copy; `@khums/core` re-exports it.
 */
export const FACT_DATE_FIELDS: Readonly<Record<FinancialFactKind, readonly FactDateFieldName[]>> = {
  ASSET: ['valuedOn', 'acquiredOn'],
  BALANCE: ['valuedOn'],
  INCOME: ['receivedOn'],
  EXPENSE: ['paidOn'],
  LIABILITY: ['valuedOn', 'incurredOn', 'dueOn'],
};

/**
 * Phase 4 (decision 78): the date a date window reads for each kind (the value's own date for
 * holdings, balances and debts; when it was received or paid otherwise).
 */
export const WINDOW_DATE_FIELD: Readonly<Record<FinancialFactKind, FactDateFieldName>> = {
  ASSET: 'valuedOn',
  BALANCE: 'valuedOn',
  INCOME: 'receivedOn',
  EXPENSE: 'paidOn',
  LIABILITY: 'valuedOn',
};

/** Mapping-language versions this engine can execute. */
export const SUPPORTED_MAPPING_VERSIONS: readonly number[] = [1];

/** Workflows whose engine entries must carry a date (see input validation). */
export const WORKFLOWS_REQUIRING_ENTRY_DATES = new Set(['annual', 'missed-year']);

/**
 * Subtypes of each fact kind, exactly as in `@khums/shared-types` (`FinancialFactSubtypes`).
 * The engine needs them to check mapping rules and detect overlaps; a compile-time guard keeps
 * this list identical to the shared type.
 */
export const FACT_SUBTYPES = {
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

type MissingSubtypes = {
  [K in keyof FinancialFactSubtypes]: Exclude<
    FinancialFactSubtypes[K],
    (typeof FACT_SUBTYPES)[K][number]
  >;
}[keyof FinancialFactSubtypes];
type AssertNever<T extends never> = T;
export type EngineSubtypesAreExhaustive = AssertNever<MissingSubtypes>;
