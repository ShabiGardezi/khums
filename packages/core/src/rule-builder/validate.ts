import { Decimal } from '@khums/money';
import type { BuilderEntryRef, BuilderRuleContent } from '@khums/validation';

import { deepFreeze } from '../governance/ledger';
import {
  BUILDER_CAPABILITIES,
  checkDeveloperRequirements,
  type CategoryTemplate,
  type RequirementCheck,
} from './capabilities';

/**
 * Validation of a builder rule's content (Phase 2 step 3). Two kinds of findings:
 * - `errors`: inconsistent content that is never saved (e.g. an entry both counted and excepted);
 * - `missing`: what a draft still lacks before it can be tested or verified (ruling, sources,
 *   rate, entries). A draft with only `missing` findings may be saved.
 * It checks consistency and completeness only; it never judges whether a value is religiously
 * correct, and it never fills anything in.
 */

export type BuilderErrorCode =
  | 'RATE_INVALID'
  | 'THRESHOLD_AMOUNT_INVALID'
  | 'ENTRY_DUPLICATE'
  | 'EXCEPTION_DUPLICATE'
  | 'EXCEPTION_ALSO_INCLUDED'
  | 'DEDUCTION_TYPE_DUPLICATE'
  | 'DEDUCTION_ENTRY_KIND'
  | 'DEDUCTION_ENTRY_DUPLICATE'
  | 'DEDUCTION_ENTRY_ALSO_COUNTED'
  | 'DEDUCTION_AGAINST_NOT_INCLUDED'
  | 'DEDUCTION_AGAINST_DUPLICATE'
  /** A deduction applied to the amount due (KHUMS_ALREADY_PAID) cannot be limited to entries. */
  | 'DEDUCTION_AGAINST_NOT_ALLOWED'
  /** PREVIOUSLY_TAXED_VALUE must name the counted entries it measures (`against`). */
  | 'DEDUCTION_AGAINST_REQUIRED'
  /** An inflation figure or post-year days on a deduction type that cannot take them. */
  | 'DEDUCTION_OPTION_NOT_ALLOWED'
  /** A condition for opening values names entries without a value at the start of the year. */
  | 'CONDITION_OPENING_VALUES_INVALID'
  /**
   * Decision 82: a COUNT_AS confirmation without a treatment (or a treatment on another effect),
   * not per entry, naming no entry or an entry that is not counted, or a share of khums on a
   * category that takes no rate.
   */
  | 'CONDITION_TREATMENT_INVALID'
  | 'CONDITION_ENTRY_NOT_INCLUDED'
  | 'CONDITION_ENTRIES_NOT_ALLOWED'
  | 'CONDITION_ENTRY_DUPLICATE'
  | 'SOURCE_DUPLICATE'
  | 'FLAG_DUPLICATE'
  | 'OTHER_REQUIREMENT_REQUIRED'
  | 'OTHER_REQUIREMENT_WITHOUT_FLAG';

export type BuilderMissingCode =
  'RULING_REQUIRED' | 'SOURCES_REQUIRED' | 'RATE_REQUIRED' | 'ENTRIES_REQUIRED';

export interface BuilderIssue<C extends string> {
  readonly code: C;
  readonly field: string;
}

export type BuilderRuleStatus =
  'DRAFT' | 'DEVELOPER_IMPLEMENTATION_REQUIRED' | 'READY_FOR_VERIFICATION';

export interface BuilderRuleCheck {
  readonly status: BuilderRuleStatus;
  readonly errors: readonly BuilderIssue<BuilderErrorCode>[];
  readonly missing: readonly BuilderIssue<BuilderMissingCode>[];
  readonly requirement: RequirementCheck;
}

const key = (ref: BuilderEntryRef) => `${ref.kind}:${ref.subtype}`;

/** Phase 4 (decision 78): deductions read from values dated at the start of the khums year. */
export const OPENING_VALUE_DEDUCTIONS: ReadonlySet<string> = new Set([
  'PREVIOUSLY_TAXED_VALUE',
  'TAXED_PRINCIPAL',
]);
const HUNDRED = Decimal.of('100');

export function validateBuilderRule(content: BuilderRuleContent): BuilderRuleCheck {
  const errors: BuilderIssue<BuilderErrorCode>[] = [];
  const missing: BuilderIssue<BuilderMissingCode>[] = [];
  const error = (code: BuilderErrorCode, field: string) => errors.push({ code, field });

  const template: CategoryTemplate = BUILDER_CAPABILITIES.categories[content.category];
  if (content.rate !== null) {
    const rate = Decimal.parse(content.rate);
    if (!rate.ok || !rate.value.isPositive() || rate.value.greaterThan(HUNDRED)) {
      error('RATE_INVALID', 'rate');
    }
  } else if (template.takesRate) {
    missing.push({ code: 'RATE_REQUIRED', field: 'rate' });
  }
  if (content.threshold !== null) {
    const amount = Decimal.parse(content.threshold.amount);
    if (!amount.ok || amount.value.isNegative()) error('THRESHOLD_AMOUNT_INVALID', 'threshold');
  }

  const included = new Set<string>();
  content.includedEntries.forEach((ref, i) => {
    if (included.has(key(ref))) error('ENTRY_DUPLICATE', `includedEntries.${String(i)}`);
    included.add(key(ref));
  });
  if (content.includedEntries.length === 0) {
    missing.push({ code: 'ENTRIES_REQUIRED', field: 'includedEntries' });
  }
  const excepted = new Set<string>();
  content.exceptions.forEach((ref, i) => {
    const field = `exceptions.${String(i)}`;
    if (excepted.has(key(ref))) error('EXCEPTION_DUPLICATE', field);
    if (included.has(key(ref))) error('EXCEPTION_ALSO_INCLUDED', field);
    excepted.add(key(ref));
  });

  const deductionTypes = new Set<string>();
  const deducted = new Set<string>();
  // Phase 4: values at the start of the year may share a type with counted year-end entries
  // (their dates tell them apart), but never with another deduction.
  const opening = new Set<string>();
  content.deductions.forEach((deduction, d) => {
    const path = `deductions.${String(d)}`;
    if (deductionTypes.has(deduction.type)) error('DEDUCTION_TYPE_DUPLICATE', path);
    deductionTypes.add(deduction.type);
    const isOpening = OPENING_VALUE_DEDUCTIONS.has(deduction.type);
    const noOptions =
      deduction.type === 'KHUMS_ALREADY_PAID' || deduction.type === 'EXEMPT_SAVINGS';
    if (
      (deduction.inflation !== undefined && noOptions) ||
      (deduction.afterYearEndDays !== undefined && (isOpening || noOptions)) ||
      (deduction.type === 'TAXED_PRINCIPAL' && deduction.inflation !== 'ONLY')
    ) {
      error('DEDUCTION_OPTION_NOT_ALLOWED', path);
    }
    if (isOpening && deduction.against === undefined) error('DEDUCTION_AGAINST_REQUIRED', path);
    const kinds: readonly string[] = BUILDER_CAPABILITIES.deductionEntryKinds[deduction.type];
    deduction.entries.forEach((ref, i) => {
      const field = `${path}.entries.${String(i)}`;
      if (!kinds.includes(ref.kind)) error('DEDUCTION_ENTRY_KIND', field);
      if (isOpening) {
        if (opening.has(key(ref))) error('DEDUCTION_ENTRY_DUPLICATE', field);
        opening.add(key(ref));
        return;
      }
      if (deducted.has(key(ref))) error('DEDUCTION_ENTRY_DUPLICATE', field);
      if (included.has(key(ref)) || excepted.has(key(ref))) {
        error('DEDUCTION_ENTRY_ALSO_COUNTED', field);
      }
      deducted.add(key(ref));
    });
  });
  const restricted = new Set<string>();
  content.deductions.forEach((deduction, d) => {
    if (deduction.type === 'KHUMS_ALREADY_PAID' && deduction.against !== undefined) {
      error('DEDUCTION_AGAINST_NOT_ALLOWED', `deductions.${String(d)}.against`);
    }
    (deduction.against ?? []).forEach((ref, i) => {
      const field = `deductions.${String(d)}.against.${String(i)}`;
      if (!included.has(key(ref))) error('DEDUCTION_AGAINST_NOT_INCLUDED', field);
      if (restricted.has(key(ref))) error('DEDUCTION_AGAINST_DUPLICATE', field);
      restricted.add(key(ref));
    });
  });

  content.conditions.forEach((condition, c) => {
    const seen = new Set<string>();
    if (condition.scope === 'CALCULATION' && condition.entries.length > 0) {
      error('CONDITION_ENTRIES_NOT_ALLOWED', `conditions.${String(c)}.entries`);
    }
    if (
      condition.openingValues === true &&
      (condition.scope !== 'ENTRY' || condition.entries.length === 0)
    ) {
      error('CONDITION_OPENING_VALUES_INVALID', `conditions.${String(c)}`);
    }
    const counting = condition.effect === 'COUNT_AS';
    if (
      counting !== (condition.treatment !== undefined) ||
      (counting &&
        (condition.scope !== 'ENTRY' ||
          condition.openingValues === true ||
          condition.entries.length === 0 ||
          condition.entries.some((ref) => !included.has(key(ref))) ||
          (condition.treatment?.khumsShare !== undefined && !template.takesRate)))
    ) {
      error('CONDITION_TREATMENT_INVALID', `conditions.${String(c)}`);
    }
    condition.entries.forEach((ref, i) => {
      const field = `conditions.${String(c)}.entries.${String(i)}`;
      if (condition.openingValues === true) {
        if (!opening.has(key(ref))) error('CONDITION_OPENING_VALUES_INVALID', field);
      } else if (
        condition.scope === 'ENTRY' &&
        !included.has(key(ref)) &&
        !deducted.has(key(ref))
      ) {
        error('CONDITION_ENTRY_NOT_INCLUDED', field);
      }
      if (seen.has(key(ref))) error('CONDITION_ENTRY_DUPLICATE', field);
      seen.add(key(ref));
    });
  });

  if (new Set(content.sourceRefs).size !== content.sourceRefs.length) {
    error('SOURCE_DUPLICATE', 'sourceRefs');
  }
  if (new Set(content.requirementFlags).size !== content.requirementFlags.length) {
    error('FLAG_DUPLICATE', 'requirementFlags');
  }
  const other = content.requirementFlags.includes('OTHER');
  if (other && content.otherRequirement === null) {
    error('OTHER_REQUIREMENT_REQUIRED', 'otherRequirement');
  }
  if (!other && content.otherRequirement !== null) {
    error('OTHER_REQUIREMENT_WITHOUT_FLAG', 'otherRequirement');
  }

  if (content.rulingId === null) missing.push({ code: 'RULING_REQUIRED', field: 'rulingId' });
  if (content.sourceRefs.length === 0) {
    missing.push({ code: 'SOURCES_REQUIRED', field: 'sourceRefs' });
  }

  const requirement = checkDeveloperRequirements(content);
  // A need the engine lacks is shown even on an incomplete draft: no amount of completing the
  // fields makes it calculable before a developer adds the capability.
  const status: BuilderRuleStatus =
    errors.length > 0
      ? 'DRAFT'
      : requirement.status === 'DEVELOPER_IMPLEMENTATION_REQUIRED'
        ? 'DEVELOPER_IMPLEMENTATION_REQUIRED'
        : missing.length > 0
          ? 'DRAFT'
          : 'READY_FOR_VERIFICATION';
  return deepFreeze({ status, errors, missing, requirement });
}
