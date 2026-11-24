import type {
  AmountAdjustment,
  Answers,
  AssessmentInput,
  ClarificationRequest,
  DateValue,
  FactAnswers,
  FactDateFieldName,
  FactMapping,
  FactMappingAction,
  FactMappingRule,
  FinancialEntry,
  FinancialFact,
  FinancialFactSheet,
  IsoDate,
  MappingConsultation,
  MappingOutcome,
  MappingResult,
  MappingStatus,
  MappingTraceEntry,
  MappingUnsupported,
  QuestionDefinition,
  RulePack,
  YearAnswers,
} from '@khums/shared-types';
import { Decimal, getCurrency } from '@khums/money';
import { addDaysToIsoDate, compareIsoDates } from '@khums/utils';

import { recomputedDigest } from '../integrity/rule-pack-integrity';
import { validateFactMappingStructure } from './structure';
import { SUPPORTED_MAPPING_VERSIONS, WINDOW_DATE_FIELD } from './vocabulary';

/**
 * Executes a pack's fact mapping (RULE_PACK_STRUCTURE §5.7). Pure and deterministic:
 * - identical facts, answers and pack version give an identical result;
 * - the facts are never modified, and amounts are copied as their original decimal strings
 *   (nothing is rounded, converted, totalled or invented);
 * - every fact gets one trace line, in sheet order;
 * - an engine input is produced only when every fact was mapped or excluded. Otherwise the
 *   result lists the clarifications to ask, the consultation stops, or why it is unsupported.
 *
 * The sheet is expected to be validated (by @khums/core) and the pack to be structurally valid
 * (`validateRulePackStructure`). Defensive checks still refuse anything malformed.
 */
export interface MapFactsOptions {
  /**
   * Answers to the pack's assessment-level questions (passed to the engine) for the annual and
   * first-time workflows. Must be empty for a missed-year sheet (decision 62).
   */
  readonly answers: Answers;
  /**
   * Missed-year sheets only: each year's own answers, keyed by the sheet's period id (decision
   * 62). One year's answers are never applied to another year.
   */
  readonly yearAnswers?: YearAnswers;
  /** Answers to per-fact questions (`ask` actions), keyed by fact id. */
  readonly factAnswers: FactAnswers;
}

interface FactOutcome {
  readonly outcome: MappingOutcome;
  readonly entry: FinancialEntry | null;
  readonly categoryId: string | null;
  readonly amount: string | null;
  readonly clarifications: ClarificationRequest[];
  readonly consultations: MappingConsultation[];
  readonly ruleIds: readonly string[];
  readonly answeredQuestionIds: readonly string[];
}

/** Phase 4: the largest percentage a per-fact answer may give (a sanity bound, not a rule). */
const MAX_PERCENT = Decimal.of('1000000');
/** Decision 82: an answered amount follows the fact amount input policy (15 integer digits). */
const MAX_AMOUNT_INTEGER_DIGITS = 15;

function amountFits(value: Decimal, currency: string): boolean {
  const info = getCurrency(currency);
  if (!info.ok || value.decimalPlaces() > info.value.minorUnits) return false;
  const integer = value.toString().split('.')[0] ?? '';
  return integer.length <= MAX_AMOUNT_INTEGER_DIGITS;
}

const WORKFLOW_KEY = {
  annual: 'annual',
  'first-time': 'firstTime',
  'missed-year': 'missedYear',
} as const;

export function mapFactsToInput(
  sheet: FinancialFactSheet,
  pack: RulePack,
  options: MapFactsOptions,
): MappingResult {
  const mapping = pack.factMapping;
  const packRef = {
    packId: pack.metadata.packId,
    version: pack.metadata.version,
    contentDigest: recomputedDigest(pack),
    mappingVersion: mapping?.mappingVersion ?? null,
  };
  const refuse = (code: MappingUnsupported['code']): MappingResult => ({
    status: 'UNSUPPORTED',
    input: null,
    clarifications: [],
    consultations: [],
    unsupported: [{ factId: null, code }],
    trace: [],
    pack: packRef,
  });

  if (mapping === undefined) return refuse('MAPPING_NOT_DEFINED');
  if (!SUPPORTED_MAPPING_VERSIONS.includes(mapping.mappingVersion)) {
    return refuse('MAPPING_VERSION_UNSUPPORTED');
  }
  if (!(mapping.factSheetSchemaVersions as readonly number[]).includes(sheet.schemaVersion)) {
    return refuse('FACT_SHEET_VERSION_UNSUPPORTED');
  }
  const workflow = sheet.context.workflow;
  if (pack.workflows[WORKFLOW_KEY[workflow]] === null) return refuse('WORKFLOW_NOT_SUPPORTED');
  // Fail closed on any structural problem (unknown operation, overlap, unused category, …), even
  // if a caller skipped `validateRulePackStructure`.
  if (validateFactMappingStructure(pack).length > 0) return refuse('INVALID_RULE_PACK');
  // Every fact must be distinct: duplicate ids could share answers or entries.
  const ids = new Set(sheet.facts.map((f) => f.id));
  if (ids.size !== sheet.facts.length) return refuse('INVALID_FACT_SHEET');
  // Decision 62: answers must be given in the scope they apply to. A missed-year sheet takes
  // each year's own answers (keyed by its period ids) and no shared answers; the other
  // workflows take shared answers only. Nothing is copied from one year to another.
  const yearAnswers = options.yearAnswers ?? {};
  const yearKeys = Object.keys(yearAnswers);
  if (sheet.context.workflow === 'missed-year') {
    const periods = new Set(sheet.context.periods.map((p) => p.id));
    if (Object.keys(options.answers).length > 0 || yearKeys.some((k) => !periods.has(k))) {
      return refuse('ANSWERS_SCOPE_MISMATCH');
    }
  } else if (yearKeys.length > 0) {
    return refuse('ANSWERS_SCOPE_MISMATCH');
  }

  const trace: MappingTraceEntry[] = [];
  const clarifications: ClarificationRequest[] = [];
  const consultations: MappingConsultation[] = [];
  const unsupported: MappingUnsupported[] = [];
  const entries: { readonly entry: FinancialEntry; readonly periodId: string | null }[] = [];
  const questions = new Map(pack.questions.map((q) => [q.id, q]));

  // Per-fact answers must belong to a fact in this sheet, with the same workflow, kind and
  // subtype they were given for; otherwise they are never used (fail closed).
  const boundAnswers = new Map<string, Answers>();
  for (const factId of Object.keys(options.factAnswers)) {
    const set = options.factAnswers[factId];
    const fact = sheet.facts.find((f) => f.id === factId);
    if (fact === undefined || set === undefined) {
      unsupported.push({ factId, code: 'FACT_ANSWERS_UNKNOWN_FACT' });
    } else if (
      set.workflow !== workflow ||
      set.kind !== fact.kind ||
      set.subtype !== fact.subtype
    ) {
      unsupported.push({ factId, code: 'FACT_ANSWERS_MISMATCH' });
    } else {
      boundAnswers.set(factId, set.answers);
    }
  }

  for (const fact of sheet.facts) {
    const result = mapFact(
      fact,
      sheet,
      mapping,
      boundAnswers.get(fact.id) ?? {},
      questions,
      unsupported,
    );
    trace.push({
      factId: fact.id,
      mappingRuleId: result.ruleId,
      outcome: result.outcome.outcome,
      categoryId: result.outcome.categoryId,
      amount: result.outcome.amount,
      ruleIds: result.outcome.ruleIds,
      answeredQuestionIds: result.outcome.answeredQuestionIds,
    });
    clarifications.push(...result.outcome.clarifications);
    consultations.push(...result.outcome.consultations);
    if (result.outcome.entry !== null) {
      entries.push({ entry: result.outcome.entry, periodId: fact.periodId });
    }
  }

  const status: MappingStatus =
    unsupported.length > 0
      ? 'UNSUPPORTED'
      : consultations.length > 0
        ? 'CONSULTATION_REQUIRED'
        : clarifications.length > 0
          ? 'NEEDS_CLARIFICATION'
          : 'MAPPED';

  let input: AssessmentInput | null = null;
  if (status === 'MAPPED') {
    input = buildInput(sheet, entries, options.answers, yearAnswers, unsupported);
  }
  return {
    status: unsupported.length > 0 ? 'UNSUPPORTED' : status,
    input: unsupported.length > 0 ? null : input,
    clarifications,
    consultations,
    unsupported,
    trace,
    pack: packRef,
  };
}

const matches = (rule: FactMappingRule, fact: FinancialFact, workflow: string) =>
  (rule.match.workflows as readonly string[]).includes(workflow) &&
  (rule.match.kinds as readonly string[]).includes(fact.kind) &&
  rule.match.subtypes.includes(fact.subtype);

/** Phase 4: whether a date lies in a rule's window of the annual period. */
const inWindow = (
  window: NonNullable<FactMappingRule['match']['dated']>,
  date: IsoDate,
  period: { readonly start: IsoDate; readonly end: IsoDate },
): boolean => {
  switch (window.window) {
    case 'IN_PERIOD':
      return compareIsoDates(date, period.start) >= 0 && compareIsoDates(date, period.end) <= 0;
    case 'BEFORE_START':
      return compareIsoDates(date, period.start) < 0;
    case 'AFTER_END':
      return (
        compareIsoDates(date, period.end) > 0 &&
        compareIsoDates(date, addDaysToIsoDate(period.end, window.days)) <= 0
      );
  }
};

function mapFact(
  fact: FinancialFact,
  sheet: FinancialFactSheet,
  mapping: FactMapping,
  answers: Answers,
  questions: ReadonlyMap<string, QuestionDefinition>,
  unsupported: MappingUnsupported[],
): { readonly ruleId: string | null; readonly outcome: FactOutcome } {
  const empty = { entry: null, categoryId: null, amount: null, answeredQuestionIds: [] };
  if (fact.currency !== sheet.currency) {
    unsupported.push({ factId: fact.id, code: 'CURRENCY_CONVERSION_UNSUPPORTED' });
    return {
      ruleId: null,
      outcome: {
        ...empty,
        outcome: 'UNSUPPORTED',
        clarifications: [],
        consultations: [],
        ruleIds: [],
      },
    };
  }
  // Structure validation guarantees at most one rule can match (no overlaps): rules sharing a
  // type have different date windows (Phase 4), chosen by the fact's own exact date.
  const candidates = mapping.rules.filter((r) => matches(r, fact, sheet.context.workflow));
  let rule = candidates.find((r) => r.match.dated === undefined);
  let dateOverride: IsoDate | null = null;
  if (rule === undefined && candidates.length > 0 && sheet.context.workflow === 'annual') {
    const period = sheet.context.period;
    const field = WINDOW_DATE_FIELD[fact.kind];
    const raw = (fact as unknown as Readonly<Partial<Record<FactDateFieldName, DateValue>>>)[field];
    if (raw?.status !== 'KNOWN') {
      // An approximate or missing date never decides which year a fact belongs to.
      const reason =
        raw?.status === 'APPROXIMATE'
          ? 'DATE_APPROXIMATE'
          : raw?.status === 'UNKNOWN'
            ? 'DATE_UNKNOWN'
            : 'DATE_NOT_PROVIDED';
      return {
        ruleId: null,
        outcome: {
          ...empty,
          outcome: 'CLARIFICATION',
          clarifications: [{ factId: fact.id, reason, dateField: field, questionId: null }],
          consultations: [],
          ruleIds: mapping.ruleIds,
        },
      };
    }
    rule = candidates.find(
      (r) => r.match.dated !== undefined && inWindow(r.match.dated, raw.date, period),
    );
    if (rule === undefined) {
      return {
        ruleId: null,
        outcome: {
          ...empty,
          outcome: 'CONSULTATION',
          clarifications: [],
          consultations: [
            {
              factId: fact.id,
              consultationId: (mapping.outOfPeriod ?? mapping.unmatched).consultationId,
            },
          ],
          ruleIds: mapping.ruleIds,
        },
      };
    }
    // A value at the start of the year counts at the start; a payment within the days after the
    // end counts at the end (the engine's entries stay inside the assessment period).
    if (rule.match.dated?.window === 'BEFORE_START') dateOverride = period.start;
    if (rule.match.dated?.window === 'AFTER_END') dateOverride = period.end;
  }
  if (rule === undefined) {
    return {
      ruleId: null,
      outcome: {
        ...empty,
        outcome: 'CONSULTATION',
        clarifications: [],
        consultations: [{ factId: fact.id, consultationId: mapping.unmatched.consultationId }],
        ruleIds: mapping.ruleIds,
      },
    };
  }
  return {
    ruleId: rule.id,
    outcome: runAction(rule.then, fact, rule.ruleIds, answers, questions, [], unsupported, {
      dateOverride,
    }),
  };
}

function runAction(
  action: FactMappingAction,
  fact: FinancialFact,
  ruleIds: readonly string[],
  answers: Answers,
  questions: ReadonlyMap<string, QuestionDefinition>,
  answered: readonly string[],
  unsupported: MappingUnsupported[],
  extra: { readonly dateOverride: IsoDate | null },
): FactOutcome {
  const base = {
    entry: null,
    categoryId: null,
    amount: null,
    ruleIds,
    answeredQuestionIds: answered,
  };
  switch (action.action) {
    case 'exclude':
      // Visible in the trace with the mapping rule and the exclusion's own justification.
      return {
        ...base,
        ruleIds: [...ruleIds, ...action.ruleIds.filter((id) => !ruleIds.includes(id))],
        outcome: 'EXCLUDED',
        clarifications: [],
        consultations: [],
      };
    case 'consult':
      return {
        ...base,
        outcome: 'CONSULTATION',
        clarifications: [],
        consultations: [{ factId: fact.id, consultationId: action.consultationId }],
      };
    case 'ask': {
      const answer = Object.prototype.hasOwnProperty.call(answers, action.questionId)
        ? answers[action.questionId]
        : undefined;
      if (answer === undefined) {
        return {
          ...base,
          outcome: 'CLARIFICATION',
          clarifications: [
            {
              factId: fact.id,
              reason: 'QUESTION_UNANSWERED',
              dateField: null,
              questionId: action.questionId,
            },
          ],
          consultations: [],
        };
      }
      const question = questions.get(action.questionId);
      const validAnswer =
        question !== undefined &&
        (question.kind === 'boolean'
          ? typeof answer === 'boolean'
          : typeof answer === 'string' && question.choices.includes(answer));
      if (!validAnswer) {
        return {
          ...base,
          outcome: 'CLARIFICATION',
          clarifications: [
            {
              factId: fact.id,
              reason: 'QUESTION_ANSWER_INVALID',
              dateField: null,
              questionId: action.questionId,
            },
          ],
          consultations: [],
        };
      }
      const next = [...answered, action.questionId];
      const chosen = action.cases.find((c) => c.equals === answer);
      if (chosen === undefined) {
        return {
          ...base,
          answeredQuestionIds: next,
          outcome: 'CONSULTATION',
          clarifications: [],
          consultations: [{ factId: fact.id, consultationId: action.otherwise.consultationId }],
        };
      }
      return runAction(chosen.then, fact, ruleIds, answers, questions, next, unsupported, extra);
    }
    case 'category':
      return categoryOutcome(action, fact, base, unsupported, answers, questions, extra);
  }
}

function categoryOutcome(
  action: Extract<FactMappingAction, { action: 'category' }>,
  fact: FinancialFact,
  base: Pick<FactOutcome, 'ruleIds' | 'answeredQuestionIds'>,
  unsupported: MappingUnsupported[],
  answers: Answers,
  questions: ReadonlyMap<string, QuestionDefinition>,
  extra: { readonly dateOverride: IsoDate | null },
): FactOutcome {
  const clarifications: ClarificationRequest[] = [];
  const consultations: MappingConsultation[] = [];
  const stop = (
    handling: { readonly handling: string; readonly consultationId?: string },
    reason: ClarificationRequest['reason'],
    dateField: FactDateFieldName | null,
  ) => {
    if (handling.handling === 'consult' && handling.consultationId !== undefined) {
      consultations.push({ factId: fact.id, consultationId: handling.consultationId });
    } else {
      clarifications.push({ factId: fact.id, reason, dateField, questionId: null });
    }
  };

  // Amount: copied unchanged, or a stop. KNOWN amounts are always used.
  let amount: string | null = null;
  const { value } = fact;
  const policy = action.amount;
  switch (value.status) {
    case 'KNOWN':
      amount = value.amount;
      break;
    case 'ESTIMATED':
      if (policy.estimated.handling === 'use') amount = value.amount;
      else stop(policy.estimated, 'AMOUNT_ESTIMATED', null);
      break;
    case 'RANGE':
      if (policy.range.handling === 'use-min') amount = value.min;
      else if (policy.range.handling === 'use-max') amount = value.max;
      else stop(policy.range, 'AMOUNT_RANGE', null);
      break;
    case 'UNKNOWN':
      stop(policy.unknown, 'AMOUNT_UNKNOWN', null);
      break;
    case 'NOT_PROVIDED':
      stop(policy.notProvided, 'AMOUNT_NOT_PROVIDED', null);
      break;
  }
  // Defensive: only non-negative decimal strings ever reach the engine.
  if (amount !== null) {
    const parsed = Decimal.parse(amount);
    if (!parsed.ok || parsed.value.isNegative()) {
      unsupported.push({ factId: fact.id, code: 'INVALID_FACT_SHEET' });
      amount = null;
    }
  }

  // Phase 4 / decision 82: this fact's own answers (and fixed percentages), attached to the entry
  // in order; the engine applies the percentages when it totals the category. An AMOUNT answer
  // replaces the entered amount (a user input, not arithmetic).
  const adjustmentsOut: { readonly mode: 'ADD_PERCENT' | 'PERCENT'; readonly percent: string }[] =
    [];
  const answeredAdjustments: string[] = [];
  const requested: readonly AmountAdjustment[] =
    action.adjustments ?? (action.adjust === undefined ? [] : [action.adjust]);
  if (amount !== null) {
    for (const adjust of requested) {
      if (adjust.mode === 'FIXED_PERCENT') {
        adjustmentsOut.push({ mode: 'PERCENT', percent: adjust.percent });
        continue;
      }
      const { questionId } = adjust;
      const answer = Object.prototype.hasOwnProperty.call(answers, questionId)
        ? answers[questionId]
        : undefined;
      const parsed = typeof answer === 'string' ? Decimal.parse(answer) : null;
      const question = questions.get(questionId);
      const value = parsed?.ok === true && !parsed.value.isNegative() ? parsed.value : null;
      const valid =
        question?.kind === 'decimal' &&
        value !== null &&
        (adjust.mode === 'AMOUNT'
          ? question.unit === 'AMOUNT' && amountFits(value, fact.currency)
          : question.unit !== 'AMOUNT' && !value.greaterThan(MAX_PERCENT));
      if (answer === undefined) {
        clarifications.push({
          factId: fact.id,
          reason: 'QUESTION_UNANSWERED',
          dateField: null,
          questionId,
        });
      } else if (value === null || !valid) {
        clarifications.push({
          factId: fact.id,
          reason: 'QUESTION_ANSWER_INVALID',
          dateField: null,
          questionId,
        });
      } else {
        answeredAdjustments.push(questionId);
        if (adjust.mode === 'AMOUNT') amount = value.toString();
        else adjustmentsOut.push({ mode: adjust.mode, percent: value.toString() });
      }
    }
  }
  const adjustmentFields =
    adjustmentsOut.length === 0
      ? {}
      : action.adjustments === undefined && adjustmentsOut.length === 1 && adjustmentsOut[0]
        ? { adjustment: adjustmentsOut[0] }
        : { adjustments: adjustmentsOut };

  // Date: the pack-chosen field, or a stop. Approximate dates are never treated as exact unless
  // the pack's approved rule says to use them.
  let date: IsoDate | null = null;
  const field = action.date.field;
  if (field !== null) {
    const raw = (fact as unknown as Readonly<Partial<Record<FactDateFieldName, DateValue>>>)[field];
    if (raw === undefined) {
      unsupported.push({ factId: fact.id, code: 'INVALID_FACT_SHEET' });
    } else {
      switch (raw.status) {
        case 'KNOWN':
          date = raw.date;
          break;
        case 'APPROXIMATE':
          if (action.date.approximate.handling === 'use') date = raw.date;
          else stop(action.date.approximate, 'DATE_APPROXIMATE', field);
          break;
        case 'UNKNOWN':
          stop(action.date.unknown, 'DATE_UNKNOWN', field);
          break;
        case 'NOT_PROVIDED':
          stop(action.date.notProvided, 'DATE_NOT_PROVIDED', field);
          break;
      }
    }
  }

  if (date !== null && extra.dateOverride !== null) date = extra.dateOverride;
  const blocked = consultations.length > 0 || clarifications.length > 0 || amount === null;
  return {
    ...base,
    answeredQuestionIds: [...base.answeredQuestionIds, ...answeredAdjustments],
    outcome:
      consultations.length > 0
        ? 'CONSULTATION'
        : clarifications.length > 0
          ? 'CLARIFICATION'
          : amount === null
            ? 'UNSUPPORTED'
            : 'ENTRY',
    categoryId: action.categoryId,
    amount: blocked ? null : amount,
    entry:
      blocked || amount === null
        ? null
        : {
            id: fact.id,
            categoryId: action.categoryId,
            amount,
            date,
            description: null,
            ...adjustmentFields,
          },
    clarifications,
    consultations,
  };
}

function buildInput(
  sheet: FinancialFactSheet,
  entries: readonly { readonly entry: FinancialEntry; readonly periodId: string | null }[],
  answers: Answers,
  yearAnswers: YearAnswers,
  unsupported: MappingUnsupported[],
): AssessmentInput | null {
  const context = sheet.context;
  const all = entries.map((e) => e.entry);
  switch (context.workflow) {
    case 'annual':
      return {
        workflow: 'annual',
        currency: sheet.currency,
        period: { start: context.period.start, end: context.period.end },
        entries: all,
        answers,
      };
    case 'first-time':
      return {
        workflow: 'first-time',
        currency: sheet.currency,
        assessmentDate: context.assessmentDate,
        entries: all,
        answers,
      };
    case 'missed-year': {
      const known = new Set(context.periods.map((p) => p.id));
      const stray = entries.find((e) => e.periodId === null || !known.has(e.periodId));
      if (stray !== undefined) {
        unsupported.push({ factId: stray.entry.id, code: 'INVALID_FACT_SHEET' });
        return null;
      }
      return {
        workflow: 'missed-year',
        currency: sheet.currency,
        assessmentDate: context.assessmentDate,
        years: context.periods.map((period) => ({
          period: { start: period.start, end: period.end },
          entries: entries.filter((e) => e.periodId === period.id).map((e) => e.entry),
          // Decision 62: this year's own answers only (none given → none; never another year's).
          // Own properties only: an inherited key (e.g. a period id `constructor`) is never an answer.
          answers: Object.hasOwn(yearAnswers, period.id) ? (yearAnswers[period.id] ?? {}) : {},
        })),
      };
    }
  }
}
