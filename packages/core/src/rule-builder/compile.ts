import {
  PROVISIONAL_LABEL,
  sealRulePack,
  validateRulePackStructure,
} from '@khums/calculation-engine';
import type {
  AmountAdjustment,
  AmountPolicy,
  CalculationIssue,
  ConsultationDefinition,
  DatePolicy,
  Expression,
  FactDateFieldName,
  FactMappingAction,
  FactMappingRule,
  FinancialFactKind,
  InputCategoryDefinition,
  ParameterDefinition,
  ProgramOutput,
  ProgramStep,
  QuestionDefinition,
  ReleaseChannel,
  RuleDefinition,
  RulePack,
  SourceReference,
} from '@khums/shared-types';
import { err, invariant, ok, type Result } from '@khums/utils';
import type {
  BuilderCondition,
  BuilderDeduction,
  BuilderEntryRef,
  ScholarRuleRevision,
} from '@khums/validation';

import { deepFreeze } from '../governance/ledger';
import { BUILDER_CAPABILITIES, type CategoryTemplate } from './capabilities';
import { OPENING_VALUE_DEDUCTIONS, validateBuilderRule } from './validate';

/**
 * Compilation of a Marja's builder rules into rule-pack DATA (Phase 2 step 3). Each complete rule
 * fills one fixed program template made only of existing engine operations; nothing is inferred,
 * defaulted or approximated:
 *
 *   gross      = sumCategories(<rule>:included)
 *   deductions = sumCategories(<rule>:deduction:<type> …)            (only with deductions)
 *   net        = max(gross − deductions, 0)                           (only with deductions)
 *   due        = percentage(net or gross, parameter <rule>:rate)
 *                minus KHUMS_ALREADY_PAID, not below zero (only with that deduction), wrapped by every
 *                once-per-calculation confirmation: EXCLUDE → when(yes, 0, …),
 *                INCLUDE → when(yes, …, 0), STOP_FOR_REVIEW → when(yes, consult, …) (outermost)
 *
 * Fact mapping (annual only): every included entry type → its category (per-entry confirmations
 * as nested `ask` actions: EXCLUDE → yes excludes, INCLUDE → no excludes, STOP_FOR_REVIEW → yes
 * consults); every deduction entry type → its deduction category; every exception → `exclude`;
 * anything else → the pack's unmatched consultation. Amounts and dates are used only when the
 * user states them exactly; estimates, ranges, unknown and approximate values ask the user
 * (clarify), never assumed.
 *
 * A rule that needs a developer implementation compiles to a consultation stop (its entries are
 * still claimed, so they never count anywhere else). Rule status is always `UNVERIFIED` here;
 * source verification (step 5) decides what may become `APPROVED` in a PRODUCTION version. No
 * total across categories is produced: each rule has its own output.
 */

export interface BuilderSourceInfo {
  readonly title: string;
  readonly url: string | null;
  readonly locator: string | null;
}

export interface CompileBuilderPackInput {
  readonly marjaId: string;
  readonly version: string;
  readonly releaseChannel: ReleaseChannel;
  readonly effectiveFrom: string;
  /** The latest revision of each rule of the Marja. */
  readonly revisions: readonly ScholarRuleRevision[];
  /** Resolved research sources/passages, by the ids rules cite (from the research store). */
  readonly sources: Readonly<Record<string, BuilderSourceInfo>>;
  /**
   * Status of every compiled rule: `UNVERIFIED` (default; test packs) or `APPROVED` — only for a
   * PRODUCTION pack whose `revisions` are exactly the source-verified ones (decision 67).
   */
  readonly ruleStatus?: 'UNVERIFIED' | 'APPROVED';
  /**
   * Entry types of rules that are NOT included (unverified, incomplete or needing a developer):
   * each one not claimed by an included rule maps to a review stop, so no unverified rule can
   * produce a figure (decision 67).
   */
  readonly withheldEntries?: readonly BuilderEntryRef[];
  /** The source verification id of each included rule (production packs; cited in the summary). */
  readonly verificationIds?: Readonly<Record<string, string>>;
}

export interface CompiledBuilderRule {
  readonly ruleId: string;
  readonly revision: number;
  readonly packRuleId: string;
  readonly category: ScholarRuleRevision['content']['category'];
  readonly developerRequired: boolean;
}

export interface SkippedBuilderRule {
  readonly ruleId: string;
  readonly revision: number;
  /**
   * INCOMPLETE: a draft (missing fields); INVALID: inconsistent content; REJECTED: a scholar
   * rejected the rule (Phase 4), so it never counts or claims an entry.
   */
  readonly reason: 'INCOMPLETE' | 'INVALID' | 'REJECTED';
}

export interface BuilderQuestion {
  readonly questionId: string;
  readonly label: string;
  readonly scope: 'ENTRY' | 'CALCULATION';
  readonly ruleId: string;
  /** Phase 4: `decimal` = a number answered per entry; otherwise yes/no. */
  readonly kind: 'boolean' | 'decimal';
  /** Decision 82, decimal questions: a percentage (default) or a money amount. */
  readonly unit?: 'PERCENT' | 'AMOUNT';
  /** Decision 83: an inflation figure (the staff panel pre-fills it from official data). */
  readonly inflation?: true;
}

export interface CompiledBuilderPack {
  readonly pack: RulePack;
  readonly compiled: readonly CompiledBuilderRule[];
  readonly skipped: readonly SkippedBuilderRule[];
  readonly questions: readonly BuilderQuestion[];
}

export type CompileBuilderErrorCode =
  /** No complete rule to compile. */
  | 'NO_COMPILABLE_RULES'
  /** A revision of another Marja, or two revisions of one rule. */
  | 'REVISIONS_INVALID'
  /** One entry type is counted, deducted or excepted by more than one rule. */
  | 'ENTRY_CLAIMED_BY_SEVERAL_RULES'
  /** A cited source or passage was not resolved by the caller. */
  | 'SOURCE_UNRESOLVED'
  /** The compiled pack fails structure validation or sealing (a defect; never expected). */
  | 'PACK_INVALID';

export interface CompileBuilderError {
  readonly code: CompileBuilderErrorCode;
  /** Rule ids involved, and for ENTRY_CLAIMED_BY_SEVERAL_RULES the entry type. */
  readonly ruleIds: readonly string[];
  readonly entry: string | null;
  readonly issues: readonly CalculationIssue[];
}

/** The pack id of a Marja's builder packs. */
export const builderPackId = (marjaId: string) => `${marjaId}-builder`;

/** The pack rule id of a builder rule. */
export const builderPackRuleId = (ruleId: string) => `builder:${ruleId}`;

const UNMATCHED = 'builder:unmatched';
/** Phase 4 (decision 78): an entry dated outside the khums year (and outside any allowed days). */
const OUT_OF_PERIOD = 'builder:out-of-period';
/** Phase 4: the longest calendar year (a solar or Gregorian leap year); technical, not a ruling. */
export const LONGEST_YEAR_DAYS = 366;
/** Decision 79: deduction names in pack labels, in words (never code names). */
const DEDUCTION_WORDS: Readonly<Record<string, string>> = {
  LIVING_EXPENSES: 'living expenses',
  COSTS_OF_EARNING: 'costs of earning',
  DEDUCTIBLE_DEBTS: 'deductible debts',
  HOLDINGS_PURCHASES: 'price paid for things still held',
  COST_OF_ITEMS_SOLD: 'cost of the property sold',
  KHUMS_ALREADY_PAID: 'khums already paid',
  PREVIOUSLY_TAXED_VALUE: 'value already taxed at the start of the year',
  TAXED_PRINCIPAL: 'inflation on the taxed principal',
  EXEMPT_SAVINGS: 'exempt savings',
};
const words = (type: string) => DEDUCTION_WORDS[type] ?? type.toLowerCase().replaceAll('_', ' ');
const NOT_VERIFIED = 'builder:not-verified';
/**
 * Decision 82: a direct share of khums is rounded to the currency's minor unit, half up (owner
 * decision 2026-11-24). A platform rounding choice, not a ruling.
 */
const SHARE_ROUNDING = { scale: 'currency', mode: 'HALF_UP' } as const;
const INFLATION_LABEL =
  'Inflation (%) from when this was bought or last taxed to your khums date (official figure pre-filled where available; you may change it)';

const DATE_FIELD: Readonly<Record<FinancialFactKind, FactDateFieldName>> = {
  ASSET: 'valuedOn',
  BALANCE: 'valuedOn',
  INCOME: 'receivedOn',
  EXPENSE: 'paidOn',
  LIABILITY: 'valuedOn',
};

const clarify = { handling: 'clarify' } as const;
const EXACT_AMOUNTS: AmountPolicy = {
  estimated: clarify,
  range: clarify,
  unknown: clarify,
  notProvided: clarify,
};
const exactDate = (kind: FinancialFactKind): DatePolicy => ({
  field: DATE_FIELD[kind],
  approximate: clarify,
  unknown: clarify,
  notProvided: clarify,
});

const entryKey = (ref: BuilderEntryRef) => `${ref.kind}:${ref.subtype}`;

const failure = (
  code: CompileBuilderErrorCode,
  ruleIds: readonly string[] = [],
  entry: string | null = null,
  issues: readonly CalculationIssue[] = [],
): Result<never, CompileBuilderError> => err(deepFreeze({ code, ruleIds, entry, issues }));

interface Parts {
  readonly rules: RuleDefinition[];
  readonly categories: InputCategoryDefinition[];
  readonly questions: QuestionDefinition[];
  readonly parameters: ParameterDefinition[];
  readonly consultations: ConsultationDefinition[];
  readonly steps: ProgramStep[];
  readonly outputs: ProgramOutput[];
  readonly mapping: FactMappingRule[];
  readonly asked: BuilderQuestion[];
  readonly status: 'UNVERIFIED' | 'APPROVED';
  readonly verificationIds: Readonly<Record<string, string>>;
}

/**
 * The public description of a source-verified rule (audit SEC-01): derived ONLY from its
 * structured fields and its citation. Free-text notes (the scholar's builder notes) are internal
 * working text that source verification does not cover, so they never enter public pack content.
 */
function verifiedSummary(
  revision: ScholarRuleRevision,
  label: string,
  rulingRef: string,
  verificationId: string | undefined,
): string {
  const { content } = revision;
  const counted = content.includedEntries.map((e) => `${e.kind}:${e.subtype}`).join(', ');
  const parts = [
    `Rule builder rule ${revision.ruleId}, revision ${String(revision.revision)}: ${label}.`,
    `Counts: ${counted}.`,
  ];
  if (content.deductions.length > 0) {
    const deduction = (d: (typeof content.deductions)[number]) =>
      d.against === undefined
        ? d.type
        : `${d.type} (only against ${d.against.map((e) => `${e.kind}:${e.subtype}`).join(', ')})`;
    parts.push(`Deductions: ${content.deductions.map(deduction).join(', ')}.`);
  }
  if (content.exceptions.length > 0) {
    parts.push(
      `Exceptions: ${content.exceptions.map((e) => `${e.kind}:${e.subtype}`).join(', ')}.`,
    );
  }
  if (content.rate !== null) parts.push(`Rate: ${content.rate} percent.`);
  if (content.conditions.length > 0) {
    parts.push(`Confirmations asked: ${String(content.conditions.length)}.`);
  }
  parts.push(`Cites research ruling ${rulingRef}.`);
  if (verificationId !== undefined) parts.push(`Source verification ${verificationId}.`);
  return parts.join(' ');
}

function compileRule(revision: ScholarRuleRevision, developerRequired: boolean, parts: Parts) {
  const { content } = revision;
  const id = builderPackRuleId(revision.ruleId);
  const template: CategoryTemplate = BUILDER_CAPABILITIES.categories[content.category];
  const label = template.label;
  const rule = [id];
  const rulingRef = `${content.rulingId ?? ''}@${String(revision.rulingVersion ?? '')}`;
  const verificationId = parts.verificationIds[revision.ruleId];
  parts.rules.push({
    id,
    status: parts.status,
    summary:
      parts.status === 'APPROVED'
        ? verifiedSummary(revision, label, rulingRef, verificationId)
        : `Rule builder rule ${revision.ruleId}, revision ${String(revision.revision)}: ${label}. ` +
          `Fields entered by a scholar in the rule builder; cites research ruling ${rulingRef}.` +
          (verificationId === undefined ? '' : ` Source verification ${verificationId}.`) +
          (content.notes === null ? '' : ` Scholar notes: ${content.notes}`),
    sourceRefs: [...content.sourceRefs],
    rulingRefs: [rulingRef],
  });

  const included = `${id}:included`;
  parts.categories.push({ id: included, label: `${label}: included entries`, ruleIds: rule });
  // Phase 4: entries a deduction may reduce exclusively get their own category.
  const restrictedCategory = new Map<string, string>();
  for (const d of content.deductions) {
    if (d.against === undefined) continue;
    const categoryId = `${id}:income:${d.type}`;
    parts.categories.push({
      id: categoryId,
      label: `${label}: entries reduced only by ${words(d.type)}`,
      ruleIds: rule,
    });
    for (const ref of d.against) restrictedCategory.set(entryKey(ref), categoryId);
  }
  const gross = `${id}:gross`;
  parts.steps.push({
    id: gross,
    label: `${label}: total of the included entries`,
    ruleIds: rule,
    expression: { op: 'sumCategories', categoryIds: [included] },
    rounding: null,
  });

  // Khums already paid is subtracted from the amount due, not from the counted amount.
  const paid = content.deductions.find((d) => d.type === 'KHUMS_ALREADY_PAID');
  const paidCategory = `${id}:deduction:KHUMS_ALREADY_PAID`;
  if (paid !== undefined) {
    parts.categories.push({
      id: paidCategory,
      label: `${label}: ${words('KHUMS_ALREADY_PAID')}`,
      ruleIds: rule,
    });
  }
  const deductionCategories = content.deductions
    .filter((d) => d !== paid)
    .map((d) => {
      const categoryId = `${id}:deduction:${d.type}`;
      parts.categories.push({ id: categoryId, label: `${label}: ${words(d.type)}`, ruleIds: rule });
      return { categoryId, deduction: d };
    });

  interface CompiledCondition {
    readonly condition: BuilderCondition;
    readonly questionId: string;
    readonly stop: string;
    /** Decision 82 (COUNT_AS): the per-entry adjustments and the khums-share category, if any. */
    readonly adjustments: readonly AmountAdjustment[];
    readonly shareCategory: string | null;
  }
  const entryConditions: CompiledCondition[] = [];
  const calculationConditions: CompiledCondition[] = [];
  /** Decision 82: steps holding direct shares of khums, added to the amount due. */
  const shareSteps: string[] = [];
  const decimalQuestion = (
    questionId: string,
    label: string,
    unit: 'PERCENT' | 'AMOUNT',
    inflation = false,
  ) => {
    parts.questions.push({
      id: questionId,
      label,
      kind: 'decimal',
      ...(unit === 'AMOUNT' ? { unit } : {}),
      choices: [],
      required: false,
      ruleIds: rule,
    });
    parts.asked.push({
      questionId,
      label,
      scope: 'ENTRY',
      ruleId: revision.ruleId,
      kind: 'decimal',
      unit,
      ...(inflation ? { inflation: true as const } : {}),
    });
  };
  content.conditions.forEach((condition, index) => {
    const entry = condition.scope === 'ENTRY';
    const questionId = `${id}:${entry ? 'entry-confirm' : 'confirm'}:${String(index)}`;
    const stop = `${id}:stop:${String(index)}`;
    parts.questions.push({
      id: questionId,
      label: condition.label,
      kind: 'boolean',
      choices: [],
      // Once-per-calculation confirmations must be answered; per-entry ones are asked by the
      // mapping (an unanswered one asks the user, never assumed).
      required: !entry,
      ruleIds: rule,
    });
    parts.asked.push({
      questionId,
      label: condition.label,
      scope: condition.scope,
      ruleId: revision.ruleId,
      kind: 'boolean',
    });
    if (condition.effect === 'STOP_FOR_REVIEW') {
      parts.consultations.push({ id: stop, label: condition.label, ruleIds: rule });
    }
    const adjustments: AmountAdjustment[] = [];
    let shareCategory: string | null = null;
    const treatment = condition.treatment;
    if (condition.effect === 'COUNT_AS' && treatment !== undefined && !developerRequired) {
      const at = `${id}:entry`;
      if (treatment.askedLabel !== undefined) {
        const amountId = `${at}-amount:${String(index)}`;
        decimalQuestion(amountId, treatment.askedLabel, 'AMOUNT');
        adjustments.push({ questionId: amountId, mode: 'AMOUNT' });
      }
      if (treatment.inflation === 'ADDED') {
        const inflationId = `${at}-inflation:${String(index)}`;
        decimalQuestion(inflationId, INFLATION_LABEL, 'PERCENT', true);
        adjustments.push({ questionId: inflationId, mode: 'ADD_PERCENT' });
      }
      if (treatment.portion !== undefined) {
        if ('fixedPercent' in treatment.portion) {
          adjustments.push({ mode: 'FIXED_PERCENT', percent: treatment.portion.fixedPercent });
        } else {
          const portionId = `${at}-portion:${String(index)}`;
          decimalQuestion(portionId, treatment.portion.askedLabel, 'PERCENT');
          adjustments.push({ questionId: portionId, mode: 'PERCENT' });
        }
      }
      if (treatment.khumsShare !== undefined) {
        shareCategory = `${id}:share:${String(index)}`;
        parts.categories.push({
          id: shareCategory,
          label: `${label}: entries whose khums is ${String(treatment.khumsShare.numerator)}/${String(treatment.khumsShare.denominator)} of the amount`,
          ruleIds: rule,
        });
        const numerator = `${shareCategory}:numerator`;
        const denominator = `${shareCategory}:denominator`;
        parts.parameters.push(
          {
            id: numerator,
            label: `${label}: share of khums (numerator)`,
            value: String(treatment.khumsShare.numerator),
            ruleIds: rule,
          },
          {
            id: denominator,
            label: `${label}: share of khums (denominator)`,
            value: String(treatment.khumsShare.denominator),
            ruleIds: rule,
          },
        );
        const shareStep = `${shareCategory}:khums`;
        parts.steps.push({
          id: shareStep,
          label: `${label}: khums as a stated share of these entries (rounded half up)`,
          ruleIds: rule,
          expression: {
            op: 'divide',
            dividend: {
              op: 'multiply',
              value: { op: 'sumCategories', categoryIds: [shareCategory] },
              factor: { op: 'parameter', parameterId: numerator },
            },
            divisor: { op: 'parameter', parameterId: denominator },
            rounding: SHARE_ROUNDING,
          },
          rounding: null,
        });
        shareSteps.push(shareStep);
      }
    }
    (entry ? entryConditions : calculationConditions).push({
      condition,
      questionId,
      stop,
      adjustments,
      shareCategory,
    });
  });

  const due = `${id}:due`;
  if (developerRequired) {
    const consultationId = `${id}:developer`;
    parts.consultations.push({
      id: consultationId,
      label: `${label}: needs a developer implementation before it can be calculated`,
      ruleIds: rule,
    });
    parts.steps.push({
      id: due,
      label: `${label}: review stop (developer implementation required)`,
      ruleIds: rule,
      expression: { op: 'consult', consultationId },
      rounding: null,
    });
  } else {
    let counted: Expression = { op: 'step', stepId: gross };
    const restricted = deductionCategories.filter((d) => d.deduction.against !== undefined);
    const general = deductionCategories.filter((d) => d.deduction.against === undefined);
    if (deductionCategories.length > 0 && restricted.length === 0) {
      const deductions = `${id}:deductions`;
      const net = `${id}:net`;
      parts.steps.push({
        id: deductions,
        label: `${label}: total of the deductions`,
        ruleIds: rule,
        expression: {
          op: 'sumCategories',
          categoryIds: deductionCategories.map((d) => d.categoryId),
        },
        rounding: null,
      });
      parts.steps.push({
        id: net,
        label: `${label}: included entries minus deductions, not below zero`,
        ruleIds: rule,
        expression: {
          op: 'max',
          operands: [
            {
              op: 'subtract',
              minuend: { op: 'step', stepId: gross },
              subtrahends: [{ op: 'step', stepId: deductions }],
            },
            { op: 'zero' },
          ],
        },
        rounding: null,
      });
      counted = { op: 'step', stepId: net };
    } else if (restricted.length > 0) {
      // Each restricted deduction reduces only its own entries, never below zero.
      const limited = restricted.map(({ categoryId, deduction }) => {
        const stepId = `${id}:limited:${deduction.type}`;
        parts.steps.push({
          id: stepId,
          label: `${label}: entries reduced only by ${words(deduction.type)}, minus it, not below zero`,
          ruleIds: rule,
          expression: {
            op: 'max',
            operands: [
              {
                op: 'subtract',
                minuend: {
                  op: 'sumCategories',
                  categoryIds: [`${id}:income:${deduction.type}`],
                },
                subtrahends: [{ op: 'sumCategories', categoryIds: [categoryId] }],
              },
              { op: 'zero' },
            ],
          },
          rounding: null,
        });
        return { op: 'step', stepId } as const;
      });
      const net = `${id}:net`;
      parts.steps.push({
        id: net,
        label: `${label}: counted amount after every deduction, not below zero`,
        ruleIds: rule,
        expression: {
          op: 'max',
          operands: [
            {
              op: 'subtract',
              minuend: { op: 'add', operands: [{ op: 'step', stepId: gross }, ...limited] },
              subtrahends:
                general.length === 0
                  ? [{ op: 'zero' }]
                  : [{ op: 'sumCategories', categoryIds: general.map((d) => d.categoryId) }],
            },
            { op: 'zero' },
          ],
        },
        rounding: null,
      });
      counted = { op: 'step', stepId: net };
    }
    let expression: Expression = counted;
    if (template.takesRate) {
      // A complete rule of a rate-taking template always carries the scholar's rate (validated);
      // a rate is never defaulted.
      invariant(content.rate !== null, 'A complete rule carries its rate');
      const rateId = `${id}:rate`;
      parts.parameters.push({
        id: rateId,
        label: `${label}: rate (percent)`,
        value: content.rate,
        ruleIds: rule,
      });
      expression = {
        op: 'percentage',
        of: counted,
        rate: { op: 'parameter', parameterId: rateId },
      };
      if (shareSteps.length > 0) {
        // Decision 82: direct shares of khums are added to the rate applied to the rest.
        expression = {
          op: 'add',
          operands: [expression, ...shareSteps.map((stepId) => ({ op: 'step', stepId }) as const)],
        };
      }
      if (paid !== undefined) {
        const rated = `${id}:rated`;
        parts.steps.push({
          id: rated,
          label: `${label}: rate applied to the counted amount`,
          ruleIds: rule,
          expression,
          rounding: null,
        });
        expression = {
          op: 'max',
          operands: [
            {
              op: 'subtract',
              minuend: { op: 'step', stepId: rated },
              subtrahends: [{ op: 'sumCategories', categoryIds: [paidCategory] }],
            },
            { op: 'zero' },
          ],
        };
      }
    }
    const answer = (questionId: string) => ({ kind: 'answer', questionId, equals: true }) as const;
    for (const c of [...calculationConditions].reverse()) {
      if (c.condition.effect === 'EXCLUDE') {
        expression = {
          op: 'when',
          condition: answer(c.questionId),
          then: { op: 'zero' },
          otherwise: expression,
        };
      } else if (c.condition.effect === 'INCLUDE') {
        expression = {
          op: 'when',
          condition: answer(c.questionId),
          then: expression,
          otherwise: { op: 'zero' },
        };
      }
    }
    for (const c of [...calculationConditions].reverse()) {
      if (c.condition.effect !== 'STOP_FOR_REVIEW') continue;
      expression = {
        op: 'when',
        condition: answer(c.questionId),
        then: { op: 'consult', consultationId: c.stop },
        otherwise: expression,
      };
    }
    // Phase 4 (decision 78): a period longer than any calendar year stops this rule.
    if (content.periodLongerThanAYear === 'STOP_FOR_REVIEW') {
      const periodStop = `${id}:stop:period`;
      parts.consultations.push({
        id: periodStop,
        label: `${label}: the assessment period is longer than one khums year`,
        ruleIds: rule,
      });
      expression = {
        op: 'when',
        condition: { kind: 'periodDays', operator: 'gt', days: LONGEST_YEAR_DAYS },
        then: { op: 'consult', consultationId: periodStop },
        otherwise: expression,
      };
    }
    parts.steps.push({
      id: due,
      label: !template.takesRate
        ? `${label}: counted amount`
        : paid === undefined
          ? `${label}: rate applied to the counted amount`
          : `${label}: amount due minus khums already paid this year, not below zero`,
      ruleIds: rule,
      expression,
      rounding: null,
    });
  }
  parts.outputs.push({ id: `${id}:result`, label: `${label}: result`, stepId: due });

  // ── Fact mapping ──
  const unanswered = `${id}:unanswered`;
  if (!developerRequired && entryConditions.length > 0) {
    parts.consultations.push({
      id: unanswered,
      label: `${label}: a per-entry confirmation has no usable answer`,
      ruleIds: rule,
    });
  }
  // Phase 4 (decision 78): entries count only when dated in the khums year (or in an allowed
  // window); anything else stops as out of period, never counted silently.
  const match = (
    ref: BuilderEntryRef,
    dated: FactMappingRule['match']['dated'] = { window: 'IN_PERIOD' },
  ) => ({
    workflows: ['annual' as const],
    kinds: [ref.kind],
    subtypes: [ref.subtype],
    dated,
  });
  // Phase 4: the person's own inflation figure per entry, for deductions that take one.
  const inflationQuestion = (type: string) => `${id}:inflation:${type}`;
  for (const d of content.deductions) {
    if (d.inflation === undefined || developerRequired) continue;
    const questionLabel =
      d.inflation === 'ONLY'
        ? 'Inflation (%) of this amount over the period its profit covers, as you determine it'
        : 'Inflation (%) from when this amount was paid or last taxed to the date it is compared, as you determine it';
    parts.questions.push({
      id: inflationQuestion(d.type),
      label: questionLabel,
      kind: 'decimal',
      choices: [],
      required: false,
      ruleIds: rule,
    });
    parts.asked.push({
      questionId: inflationQuestion(d.type),
      label: questionLabel,
      scope: 'ENTRY',
      ruleId: revision.ruleId,
      kind: 'decimal',
      unit: 'PERCENT',
      inflation: true,
    });
  }
  const adjustFor = (d: BuilderDeduction) =>
    d.inflation === undefined || developerRequired
      ? {}
      : {
          adjust: {
            questionId: inflationQuestion(d.type),
            mode: d.inflation === 'ADDED' ? ('ADD_PERCENT' as const) : ('PERCENT' as const),
          },
        };
  /** The confirmations asked for one entry type, wrapped around its terminal action. */
  const confirmations = (
    applicable: readonly (typeof entryConditions)[number][],
    terminal: FactMappingAction,
  ): FactMappingAction => {
    const build = (index: number): FactMappingAction => {
      const c = applicable[index];
      if (c === undefined) return terminal;
      const next = build(index + 1);
      const exclude: FactMappingAction = { action: 'exclude', ruleIds: rule };
      const countAs = (): FactMappingAction => {
        invariant(terminal.action === 'category', 'COUNT_AS applies to counted entries only');
        const { adjust: _single, adjustments: _list, ...base } = terminal;
        return {
          ...base,
          categoryId: c.shareCategory ?? terminal.categoryId,
          ...(c.adjustments.length === 0 ? {} : { adjustments: c.adjustments }),
        };
      };
      const [yes, no]: [FactMappingAction, FactMappingAction] =
        c.condition.effect === 'EXCLUDE'
          ? [exclude, next]
          : c.condition.effect === 'INCLUDE'
            ? [next, exclude]
            : c.condition.effect === 'COUNT_AS'
              ? [countAs(), next]
              : [{ action: 'consult', consultationId: c.stop }, next];
      return {
        action: 'ask',
        questionId: c.questionId,
        cases: [
          { equals: true, then: yes },
          { equals: false, then: no },
        ],
        otherwise: { handling: 'consult', consultationId: unanswered },
      };
    };
    return build(0);
  };
  const named = (ref: BuilderEntryRef) => (c: (typeof entryConditions)[number]) =>
    c.condition.openingValues !== true &&
    c.condition.entries.some((e) => entryKey(e) === entryKey(ref));
  const namedOpening = (ref: BuilderEntryRef) => (c: (typeof entryConditions)[number]) =>
    c.condition.openingValues === true &&
    c.condition.entries.some((e) => entryKey(e) === entryKey(ref));
  for (const ref of content.includedEntries) {
    const category: FactMappingAction = {
      action: 'category',
      categoryId: restrictedCategory.get(entryKey(ref)) ?? included,
      amount: EXACT_AMOUNTS,
      date: exactDate(ref.kind),
    };
    const applicable = developerRequired
      ? []
      : entryConditions.filter(
          (c) =>
            (c.condition.entries.length === 0 && c.condition.openingValues !== true) ||
            named(ref)(c),
        );
    parts.mapping.push({
      id: `${id}:map:${entryKey(ref)}`,
      ruleIds: rule,
      match: match(ref),
      then: confirmations(applicable, category),
    });
  }
  const mappedDeductions = [
    ...deductionCategories,
    ...(paid === undefined ? [] : [{ categoryId: paidCategory, deduction: paid }]),
  ];
  for (const { categoryId, deduction } of mappedDeductions) {
    const opening = OPENING_VALUE_DEDUCTIONS.has(deduction.type);
    for (const ref of deduction.entries) {
      const category: FactMappingAction = {
        action: 'category',
        categoryId,
        amount: EXACT_AMOUNTS,
        date: exactDate(ref.kind),
        ...adjustFor(deduction),
      };
      if (opening) {
        // Phase 4: the item's value at the start of the year (dated on or before the start).
        const applicable = developerRequired ? [] : entryConditions.filter(namedOpening(ref));
        parts.mapping.push({
          id: `${id}:map:${entryKey(ref)}:opening`,
          ruleIds: rule,
          match: match(ref, { window: 'BEFORE_START' }),
          then: confirmations(applicable, category),
        });
        continue;
      }
      // Phase 4: confirmations that name this deduction entry are asked for it.
      const applicable = developerRequired ? [] : entryConditions.filter(named(ref));
      parts.mapping.push({
        id: `${id}:map:${entryKey(ref)}`,
        ruleIds: rule,
        match: match(ref),
        then: confirmations(applicable, category),
      });
      if (deduction.afterYearEndDays !== undefined) {
        // Phase 4: also counted when paid within the stated days after the year end.
        parts.mapping.push({
          id: `${id}:map:${entryKey(ref)}:after`,
          ruleIds: rule,
          match: match(ref, { window: 'AFTER_END', days: deduction.afterYearEndDays }),
          then: confirmations(applicable, category),
        });
      }
    }
  }
  for (const ref of content.exceptions) {
    parts.mapping.push({
      id: `${id}:map:${entryKey(ref)}`,
      ruleIds: rule,
      // An exception is never counted, whatever its date.
      match: { workflows: ['annual' as const], kinds: [ref.kind], subtypes: [ref.subtype] },
      then: { action: 'exclude', ruleIds: rule },
    });
  }
}

/**
 * Compiles the given latest revisions of ONE Marja into a sealed schemaVersion 3 pack on the
 * caller's channel and version. Incomplete or invalid rules are skipped (and listed); the result
 * passes `validateRulePackStructure` or the compilation fails.
 */
export function compileBuilderPack(
  input: CompileBuilderPackInput,
): Result<CompiledBuilderPack, CompileBuilderError> {
  const seen = new Set<string>();
  for (const r of input.revisions) {
    if (r.marjaId !== input.marjaId || seen.has(r.ruleId)) {
      return failure('REVISIONS_INVALID', [r.ruleId]);
    }
    seen.add(r.ruleId);
  }
  const ordered = [...input.revisions].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  const parts: Parts = {
    rules: [],
    categories: [],
    questions: [],
    parameters: [],
    consultations: [],
    steps: [],
    outputs: [],
    mapping: [],
    asked: [],
    status: input.ruleStatus ?? 'UNVERIFIED',
    verificationIds: input.verificationIds ?? {},
  };
  const compiled: CompiledBuilderRule[] = [];
  const skipped: SkippedBuilderRule[] = [];
  const claims = new Map<string, string>();
  const sources = new Map<string, SourceReference>();

  for (const revision of ordered) {
    if (revision.rejected === true) {
      skipped.push({ ruleId: revision.ruleId, revision: revision.revision, reason: 'REJECTED' });
      continue;
    }
    const check = validateBuilderRule(revision.content);
    if (check.errors.length > 0 || check.missing.length > 0 || revision.rulingVersion === null) {
      skipped.push({
        ruleId: revision.ruleId,
        revision: revision.revision,
        reason: check.errors.length > 0 ? 'INVALID' : 'INCOMPLETE',
      });
      continue;
    }
    const { content } = revision;
    const claimed = [
      ...content.includedEntries,
      ...content.deductions.flatMap((d) => d.entries),
      ...content.exceptions,
    ];
    for (const ref of claimed) {
      const other = claims.get(entryKey(ref));
      // Phase 4: one rule may name a type twice (its year-end entry and its opening value).
      if (other !== undefined && other !== revision.ruleId) {
        return failure('ENTRY_CLAIMED_BY_SEVERAL_RULES', [other, revision.ruleId], entryKey(ref));
      }
      claims.set(entryKey(ref), revision.ruleId);
    }
    for (const sourceId of content.sourceRefs) {
      const info = input.sources[sourceId];
      if (info === undefined) return failure('SOURCE_UNRESOLVED', [revision.ruleId], sourceId);
      sources.set(sourceId, {
        id: sourceId,
        title: info.title,
        url: info.url,
        locator: info.locator,
      });
    }
    const developerRequired = check.requirement.status !== 'SUPPORTED';
    compileRule(revision, developerRequired, parts);
    compiled.push({
      ruleId: revision.ruleId,
      revision: revision.revision,
      packRuleId: builderPackRuleId(revision.ruleId),
      category: content.category,
      developerRequired,
    });
  }
  if (compiled.length === 0) return failure('NO_COMPILABLE_RULES');

  const allRules = compiled.map((c) => c.packRuleId);
  parts.consultations.push({
    id: UNMATCHED,
    label: 'An entry type that no builder rule covers needs individual review',
    ruleIds: allRules,
  });
  parts.consultations.push({
    id: OUT_OF_PERIOD,
    label: 'An entry dated outside this khums year (and outside any days a rule allows after it)',
    ruleIds: allRules,
  });
  // Entry types of rules left out (not source-verified, incomplete or developer-required) stop for
  // review instead of counting anywhere: an included rule's own entries are never withheld.
  const withheld = new Map<string, BuilderEntryRef>();
  for (const ref of input.withheldEntries ?? []) {
    if (!claims.has(entryKey(ref))) withheld.set(entryKey(ref), ref);
  }
  if (withheld.size > 0) {
    parts.consultations.push({
      id: NOT_VERIFIED,
      label:
        'An entry of this type is covered by a builder rule whose current revision is not ' +
        'source-verified; it needs individual review',
      ruleIds: allRules,
    });
    for (const key of [...withheld.keys()].sort()) {
      const ref = withheld.get(key);
      if (ref === undefined) continue;
      parts.mapping.push({
        id: `${NOT_VERIFIED}:map:${key}`,
        ruleIds: allRules,
        match: { workflows: ['annual'], kinds: [ref.kind], subtypes: [ref.subtype] },
        then: { action: 'consult', consultationId: NOT_VERIFIED },
      });
    }
  }
  const provisional = input.releaseChannel === 'SCHOLAR_REVIEW';
  const pack: RulePack = {
    metadata: {
      packId: builderPackId(input.marjaId),
      marjaId: input.marjaId,
      version: input.version,
      schemaVersion: 3,
      releaseChannel: input.releaseChannel,
      title: `Scholar rule builder — ${input.marjaId}${provisional ? ` — ${PROVISIONAL_LABEL}` : ' — source-verified rules'}`,
      status: provisional ? 'IN_REVIEW' : 'DRAFT',
      isMock: false,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: null,
      contentHash: null,
      researchBaseline: null,
      approvals: [],
      supersedes: null,
    },
    sources: [...sources.values()].sort((a, b) => a.id.localeCompare(b.id)),
    rules: parts.rules,
    inputCategories: parts.categories,
    questions: parts.questions,
    parameters: parts.parameters,
    consultations: parts.consultations,
    workflows: {
      annual: { steps: parts.steps, outputs: parts.outputs },
      firstTime: null,
      missedYear: null,
    },
    factMapping: {
      mappingVersion: 1,
      factSheetSchemaVersions: [1],
      rules: parts.mapping,
      unmatched: { handling: 'consult', consultationId: UNMATCHED },
      outOfPeriod: { handling: 'consult', consultationId: OUT_OF_PERIOD },
      ruleIds: allRules,
    },
  };
  const structure = validateRulePackStructure(pack);
  const errors = structure.issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) return failure('PACK_INVALID', allRules, null, errors);
  const sealed = sealRulePack(pack);
  if (!sealed.ok) return failure('PACK_INVALID', allRules);
  return ok(deepFreeze({ pack: sealed.value, compiled, skipped, questions: parts.asked }));
}
