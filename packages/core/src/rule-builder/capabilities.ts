import type { FinancialFactKind } from '@khums/shared-types';
import type {
  BuilderCategory,
  BuilderConditionEffect,
  BuilderConditionScope,
  BuilderDeductionType,
  BuilderRequirementFlag,
  BuilderRuleContent,
} from '@khums/validation';

import { deepFreeze } from '../governance/ledger';

/**
 * The capability table of the scholar rule builder (Phase 2 step 4): what the EXISTING engine
 * template can calculate (engine 0.2.0 operations: sum of categories, subtract, max with zero,
 * percentage of a parameter, `when` on answers, consult; fact mapping category / exclude / ask /
 * consult). Technical facts about the software only: nothing here is a ruling, and nothing here
 * says which categories, deductions or conditions any Marja accepts. Anything outside the table
 * is reported as DEVELOPER_IMPLEMENTATION_REQUIRED and compiled as a review stop, never
 * approximated. A developer extends the table only together with engine support and tests.
 */

export interface CategoryTemplate {
  /** Neutral name used in pack labels. */
  readonly label: string;
  /** The template multiplies the counted amount by a rate (percentage parameter). */
  readonly takesRate: boolean;
  /** Deduction types the template subtracts before applying the rate. */
  readonly deductions: readonly BuilderDeductionType[];
}

export const BUILDER_CAPABILITIES = deepFreeze({
  /** Only the annual workflow has a template. */
  workflows: ['annual'] as const,
  categories: {
    ANNUAL_SURPLUS: {
      label: 'Annual surplus of income',
      takesRate: true,
      deductions: [
        'LIVING_EXPENSES',
        'COSTS_OF_EARNING',
        'DEDUCTIBLE_DEBTS',
        'HOLDINGS_PURCHASES',
        'COST_OF_ITEMS_SOLD',
        'KHUMS_ALREADY_PAID',
        'PREVIOUSLY_TAXED_VALUE',
        'TAXED_PRINCIPAL',
        'EXEMPT_SAVINGS',
      ],
    },
    MINED_PRODUCT: { label: 'Mined products', takesRate: true, deductions: ['COSTS_OF_EARNING'] },
    TREASURE: { label: 'Treasure', takesRate: true, deductions: ['COSTS_OF_EARNING'] },
    DIVING_GEMS: { label: 'Gems from diving', takesRate: true, deductions: ['COSTS_OF_EARNING'] },
    MIXED_FUNDS: { label: 'Mixed lawful and unlawful wealth', takesRate: true, deductions: [] },
  } satisfies Record<BuilderCategory, CategoryTemplate>,
  /** Entry kinds each deduction type reads (technical: outflows vs amounts owed). */
  deductionEntryKinds: {
    LIVING_EXPENSES: ['EXPENSE'],
    // Phase 4: a debt for business costs is a cost of earning (it may reduce only its income).
    COSTS_OF_EARNING: ['EXPENSE', 'LIABILITY'],
    DEDUCTIBLE_DEBTS: ['LIABILITY'],
    HOLDINGS_PURCHASES: ['EXPENSE'],
    COST_OF_ITEMS_SOLD: ['EXPENSE'],
    // Subtracted from the amount due after the rate (compile.ts), not from the counted amount.
    KHUMS_ALREADY_PAID: ['EXPENSE'],
    // Phase 4 (decision 78): values at the start of the year, and money held at the year end.
    PREVIOUSLY_TAXED_VALUE: ['ASSET', 'BALANCE'],
    TAXED_PRINCIPAL: ['ASSET', 'BALANCE'],
    // Decision 82: also a loan given (an amount owed back to you), held like money.
    EXEMPT_SAVINGS: ['BALANCE', 'ASSET'],
  } satisfies Record<BuilderDeductionType, readonly FinancialFactKind[]>,
  /** Condition scopes and the effects the template can apply for each. */
  conditions: {
    // Decision 82: COUNT_AS counts one entry as its treatment states (per entry only).
    ENTRY: ['INCLUDE', 'EXCLUDE', 'STOP_FOR_REVIEW', 'COUNT_AS'],
    CALCULATION: ['INCLUDE', 'EXCLUDE', 'STOP_FOR_REVIEW'],
  } satisfies Record<BuilderConditionScope, readonly BuilderConditionEffect[]>,
  /**
   * A minimum amount cannot be compared yet: the engine has no money constant (parameters are
   * plain numbers and a comparison needs two amounts), and a fixed amount in one currency would
   * also need conversion for assessments in another.
   */
  threshold: false,
  /** Requirement flags the template supports: none (each one names a missing capability). */
  requirementFlags: [] as readonly BuilderRequirementFlag[],
});

export type CapabilityCode =
  | `FLAG_${BuilderRequirementFlag}`
  /** A deduction type the category's template does not subtract. */
  | 'DEDUCTION_NOT_IN_TEMPLATE'
  /** A rate on a category whose template takes none. */
  | 'RATE_NOT_IN_TEMPLATE'
  /** A condition scope/effect pair the template cannot apply. */
  | 'CONDITION_NOT_IN_TEMPLATE'
  /** A minimum amount (threshold): no money constant in the engine yet. */
  | 'THRESHOLD_COMPARISON';

export interface CapabilityGap {
  readonly code: CapabilityCode;
  /** The field the gap comes from, e.g. `deductions.1` or `requirementFlags`. */
  readonly field: string;
}

export interface RequirementCheck {
  readonly status: 'SUPPORTED' | 'DEVELOPER_IMPLEMENTATION_REQUIRED';
  readonly capabilities: readonly CapabilityGap[];
}

/**
 * The automatic developer-requirement check: every field value against the capability table.
 * Pure and deterministic; the gaps are stable codes (the web shows localized explanations).
 */
export function checkDeveloperRequirements(content: BuilderRuleContent): RequirementCheck {
  const gaps: CapabilityGap[] = [];
  const template: CategoryTemplate = BUILDER_CAPABILITIES.categories[content.category];
  for (const flag of new Set(content.requirementFlags)) {
    if (!BUILDER_CAPABILITIES.requirementFlags.includes(flag)) {
      gaps.push({ code: `FLAG_${flag}`, field: 'requirementFlags' });
    }
  }
  if (content.rate !== null && !template.takesRate) {
    gaps.push({ code: 'RATE_NOT_IN_TEMPLATE', field: 'rate' });
  }
  content.deductions.forEach((deduction, index) => {
    if (!template.deductions.includes(deduction.type)) {
      gaps.push({ code: 'DEDUCTION_NOT_IN_TEMPLATE', field: `deductions.${String(index)}` });
    }
  });
  content.conditions.forEach((condition, index) => {
    const effects: readonly BuilderConditionEffect[] =
      BUILDER_CAPABILITIES.conditions[condition.scope];
    if (!effects.includes(condition.effect)) {
      gaps.push({ code: 'CONDITION_NOT_IN_TEMPLATE', field: `conditions.${String(index)}` });
    }
  });
  if (content.threshold !== null && !BUILDER_CAPABILITIES.threshold) {
    gaps.push({ code: 'THRESHOLD_COMPARISON', field: 'threshold' });
  }
  return deepFreeze({
    status: gaps.length === 0 ? 'SUPPORTED' : 'DEVELOPER_IMPLEMENTATION_REQUIRED',
    capabilities: gaps,
  });
}
