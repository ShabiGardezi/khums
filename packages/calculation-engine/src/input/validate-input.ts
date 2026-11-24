import type {
  Answers,
  AssessmentInput,
  AssessmentPeriod,
  CalculationIssue,
  FinancialEntry,
  Program,
  RulePack,
} from '@khums/shared-types';
import { Decimal, getCurrency } from '@khums/money';
import { assertNever, compareIsoDates, isIsoDate } from '@khums/utils';

import { issue } from '../issues';
import { collectReferences, type ProgramReferences } from '../rule-pack/references';

interface EntryRules {
  readonly period: AssessmentPeriod | null;
  readonly assessmentDate: string | null;
  readonly requireDate: boolean;
}

function validPeriod(period: AssessmentPeriod, path: string, issues: CalculationIssue[]): boolean {
  if (!isIsoDate(period.start) || !isIsoDate(period.end)) {
    issues.push(issue('INPUT_INVALID_DATE', 'Period dates must be YYYY-MM-DD', path));
    return false;
  }
  if (compareIsoDates(period.end, period.start) < 0) {
    issues.push(issue('INPUT_INVALID_PERIOD', 'Period end is before its start', path));
    return false;
  }
  return true;
}

function validateEntries(
  entries: readonly FinancialEntry[],
  pack: RulePack,
  refs: ProgramReferences,
  rules: EntryRules,
  path: string,
  issues: CalculationIssue[],
): void {
  const categoryIds = new Set(pack.inputCategories.map((c) => c.id));
  const seenIds = new Set<string>();
  const warnedCategories = new Set<string>();

  entries.forEach((entry, index) => {
    const entryPath = `${path}.${index}`;
    if (seenIds.has(entry.id)) {
      issues.push(issue('INPUT_DUPLICATE_ENTRY_ID', `Duplicate entry id "${entry.id}"`, entryPath));
    }
    seenIds.add(entry.id);

    if (!categoryIds.has(entry.categoryId)) {
      issues.push(
        issue(
          'INPUT_UNKNOWN_CATEGORY',
          `Unknown category "${entry.categoryId}"`,
          `${entryPath}.categoryId`,
        ),
      );
    } else if (!refs.categoryIds.has(entry.categoryId) && !warnedCategories.has(entry.categoryId)) {
      warnedCategories.add(entry.categoryId);
      issues.push(
        issue(
          'INPUT_UNUSED_CATEGORY',
          `Category "${entry.categoryId}" is not used by this workflow; its amounts do not affect the result`,
          `${entryPath}.categoryId`,
          'warning',
        ),
      );
    }

    const amount = Decimal.parse(entry.amount);
    if (!amount.ok) {
      issues.push(
        issue(
          'INPUT_INVALID_AMOUNT',
          `Amount is not a decimal string (${amount.error.code})`,
          `${entryPath}.amount`,
        ),
      );
    } else if (amount.value.isNegative()) {
      issues.push(
        issue('INPUT_NEGATIVE_AMOUNT', 'Amounts must not be negative', `${entryPath}.amount`),
      );
    }
    // Phase 4: a mapping adjustment must be a known mode with a non-negative percentage.
    if (entry.adjustment !== undefined) {
      const percent = Decimal.parse(entry.adjustment.percent);
      if (
        !['ADD_PERCENT', 'PERCENT'].includes(entry.adjustment.mode) ||
        !percent.ok ||
        percent.value.isNegative()
      ) {
        issues.push(
          issue('INPUT_INVALID_AMOUNT', 'Invalid amount adjustment', `${entryPath}.adjustment`),
        );
      }
    }

    if (entry.date === null) {
      if (rules.requireDate) {
        issues.push(
          issue(
            'INPUT_ENTRY_MISSING_DATE',
            'A date is required for this workflow',
            `${entryPath}.date`,
          ),
        );
      }
      return;
    }
    if (!isIsoDate(entry.date)) {
      issues.push(
        issue('INPUT_INVALID_DATE', 'Entry date must be YYYY-MM-DD', `${entryPath}.date`),
      );
      return;
    }
    if (
      rules.period !== null &&
      (compareIsoDates(entry.date, rules.period.start) < 0 ||
        compareIsoDates(entry.date, rules.period.end) > 0)
    ) {
      issues.push(
        issue(
          'INPUT_ENTRY_OUTSIDE_PERIOD',
          'Entry date is outside the assessment period',
          `${entryPath}.date`,
        ),
      );
    }
    if (rules.assessmentDate !== null && compareIsoDates(entry.date, rules.assessmentDate) > 0) {
      issues.push(
        issue(
          'INPUT_ENTRY_AFTER_ASSESSMENT_DATE',
          'Entry date is after the assessment date',
          `${entryPath}.date`,
        ),
      );
    }
  });
}

function validateAnswers(
  answers: Answers,
  pack: RulePack,
  refs: ProgramReferences,
  path: string,
  issues: CalculationIssue[],
): void {
  const questions = new Map(pack.questions.map((q) => [q.id, q]));
  for (const [questionId, answer] of Object.entries(answers)) {
    const question = questions.get(questionId);
    if (!question) {
      issues.push(
        issue(
          'INPUT_UNKNOWN_QUESTION',
          `Unknown question "${questionId}"`,
          `${path}.${questionId}`,
        ),
      );
      continue;
    }
    const valid =
      question.kind === 'boolean'
        ? typeof answer === 'boolean'
        : typeof answer === 'string' && question.choices.includes(answer);
    if (!valid) {
      issues.push(
        issue(
          'INPUT_INVALID_ANSWER',
          `Invalid answer for "${questionId}"`,
          `${path}.${questionId}`,
        ),
      );
    }
  }
  for (const question of pack.questions) {
    if (question.required && refs.questionIds.has(question.id) && !(question.id in answers)) {
      issues.push(
        issue(
          'INPUT_MISSING_REQUIRED_ANSWER',
          `Required question "${question.id}" is unanswered`,
          `${path}.${question.id}`,
        ),
      );
    }
  }
}

/** Validates an assessment input against the pack and the workflow program. */
export function validateInput(
  input: AssessmentInput,
  pack: RulePack,
  program: Program,
): CalculationIssue[] {
  const issues: CalculationIssue[] = [];
  const refs = collectReferences(program);

  if (!getCurrency(input.currency).ok) {
    issues.push(
      issue('INPUT_UNSUPPORTED_CURRENCY', `Unsupported currency "${input.currency}"`, 'currency'),
    );
  }

  switch (input.workflow) {
    case 'annual': {
      const periodOk = validPeriod(input.period, 'period', issues);
      validateEntries(
        input.entries,
        pack,
        refs,
        { period: periodOk ? input.period : null, assessmentDate: null, requireDate: true },
        'entries',
        issues,
      );
      validateAnswers(input.answers, pack, refs, 'answers', issues);
      break;
    }
    case 'first-time': {
      const dateOk = isIsoDate(input.assessmentDate);
      if (!dateOk)
        issues.push(
          issue('INPUT_INVALID_DATE', 'assessmentDate must be YYYY-MM-DD', 'assessmentDate'),
        );
      validateEntries(
        input.entries,
        pack,
        refs,
        { period: null, assessmentDate: dateOk ? input.assessmentDate : null, requireDate: false },
        'entries',
        issues,
      );
      validateAnswers(input.answers, pack, refs, 'answers', issues);
      break;
    }
    case 'missed-year': {
      const dateOk = isIsoDate(input.assessmentDate);
      if (!dateOk)
        issues.push(
          issue('INPUT_INVALID_DATE', 'assessmentDate must be YYYY-MM-DD', 'assessmentDate'),
        );
      if (input.years.length === 0) {
        issues.push(issue('INPUT_NO_YEARS', 'At least one past period is required', 'years'));
      }
      let previousEnd: string | null = null;
      input.years.forEach((year, index) => {
        const path = `years.${index}`;
        const periodOk = validPeriod(year.period, `${path}.period`, issues);
        if (periodOk) {
          if (previousEnd !== null && compareIsoDates(year.period.start, previousEnd) <= 0) {
            issues.push(
              issue(
                'INPUT_YEARS_NOT_ORDERED',
                'Past periods must be in ascending order and must not overlap',
                `${path}.period`,
              ),
            );
          }
          if (dateOk && compareIsoDates(year.period.end, input.assessmentDate) > 0) {
            issues.push(
              issue(
                'INPUT_YEAR_AFTER_ASSESSMENT_DATE',
                'Past period ends after the assessment date',
                `${path}.period`,
              ),
            );
          }
          previousEnd = year.period.end;
        }
        validateEntries(
          year.entries,
          pack,
          refs,
          { period: periodOk ? year.period : null, assessmentDate: null, requireDate: true },
          `${path}.entries`,
          issues,
        );
        validateAnswers(year.answers, pack, refs, `${path}.answers`, issues);
      });
      break;
    }
    /* v8 ignore next 2 -- exhaustive switch guard, unreachable by type */
    default:
      assertNever(input);
  }
  return issues;
}
