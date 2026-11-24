import {
  FACT_DATE_FIELDS,
  validateFactInFrame,
  validateFactSheetFrame,
  type FactDateField,
  type FactSheetFrame,
  type FactSheetIssue,
} from '@khums/core';
import type {
  AmountValue,
  DateValue,
  FactSheetContext,
  FinancialFact,
  FinancialFactKind,
  Workflow,
} from '@khums/shared-types';

/**
 * Form drafts for financial facts (M4.3.2). Pure TypeScript, no React.
 *
 * Drafts hold exactly what the user typed (strings). Converting a draft builds a candidate fact
 * and validates it with @khums/core; nothing is trimmed, rounded, converted or classified.
 * Error results carry field keys and codes only, never the values.
 */

export interface AmountDraft {
  readonly status: AmountValue['status'];
  readonly amount: string;
  readonly min: string;
  readonly max: string;
}

export interface DateDraft {
  readonly status: DateValue['status'];
  readonly date: string;
}

export interface FactDraft {
  readonly kind: FinancialFactKind | null;
  readonly subtype: string;
  readonly currency: string;
  readonly value: AmountDraft;
  readonly dates: Readonly<Partial<Record<FactDateField, DateDraft>>>;
  readonly periodId: string;
  readonly label: string;
  readonly note: string;
}

export type FactField =
  | 'kind'
  | 'subtype'
  | 'currency'
  | 'amount'
  | 'min'
  | 'max'
  | FactDateField
  | 'periodId'
  | 'label'
  | 'note'
  | 'form';

/** UI error codes: domain issue codes plus form-level ones. */
export type FactErrorCode =
  | 'REQUIRED'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_NEGATIVE'
  | 'AMOUNT_TOO_LARGE'
  | 'AMOUNT_TOO_PRECISE'
  | 'RANGE_MIN_GREATER_THAN_MAX'
  | 'UNSUPPORTED_CURRENCY'
  | 'INVALID_DATE'
  | 'DATE_AFTER_REFERENCE_DATE'
  | 'DATE_OUTSIDE_PERIOD'
  | 'VALUED_BEFORE_ACQUIRED'
  | 'VALUED_BEFORE_INCURRED'
  | 'DUE_BEFORE_INCURRED'
  | 'UNKNOWN_PERIOD'
  | 'TOO_LONG'
  | 'INVALID';

export type FieldErrors = Readonly<Partial<Record<FactField, FactErrorCode>>>;

/** Default state for a new date: not provided (the user opts in to giving a date). */
const emptyDate: DateDraft = { status: 'NOT_PROVIDED', date: '' };

/** A blank draft. The amount defaults to "known" (an amount field to fill in); dates to "not provided". */
export function emptyDraft(currency: string): FactDraft {
  return {
    kind: null,
    subtype: '',
    currency,
    value: { status: 'KNOWN', amount: '', min: '', max: '' },
    dates: {},
    periodId: '',
    label: '',
    note: '',
  };
}

/** Changes the kind, keeping shared fields and resetting kind-specific ones. */
export function withKind(draft: FactDraft, kind: FinancialFactKind): FactDraft {
  if (draft.kind === kind) return draft;
  const dates: Partial<Record<FactDateField, DateDraft>> = {};
  for (const field of FACT_DATE_FIELDS[kind]) dates[field] = draft.dates[field] ?? emptyDate;
  return { ...draft, kind, subtype: '', dates };
}

export function dateDraft(draft: FactDraft, field: FactDateField): DateDraft {
  return draft.dates[field] ?? emptyDate;
}

const toDateDraft = (value: DateValue): DateDraft =>
  value.status === 'KNOWN' || value.status === 'APPROXIMATE'
    ? { status: value.status, date: value.date }
    : { status: value.status, date: '' };

/** Draft for editing an existing fact (round-trips exactly). */
export function draftFromFact(fact: FinancialFact): FactDraft {
  const value = fact.value;
  const dates: Partial<Record<FactDateField, DateDraft>> = {};
  for (const field of FACT_DATE_FIELDS[fact.kind]) {
    const date = (fact as unknown as Record<FactDateField, DateValue>)[field];
    dates[field] = toDateDraft(date);
  }
  return {
    kind: fact.kind,
    subtype: fact.subtype,
    currency: fact.currency,
    value: {
      status: value.status,
      amount: value.status === 'KNOWN' || value.status === 'ESTIMATED' ? value.amount : '',
      min: value.status === 'RANGE' ? value.min : '',
      max: value.status === 'RANGE' ? value.max : '',
    },
    dates,
    periodId: fact.periodId ?? '',
    label: fact.label ?? '',
    note: fact.note ?? '',
  };
}

function amountValue(draft: AmountDraft): AmountValue {
  switch (draft.status) {
    case 'KNOWN':
    case 'ESTIMATED':
      return { status: draft.status, amount: draft.amount };
    case 'RANGE':
      return { status: 'RANGE', min: draft.min, max: draft.max };
    case 'UNKNOWN':
    case 'NOT_PROVIDED':
      return { status: draft.status };
  }
}

function dateValue(draft: DateDraft): DateValue {
  return draft.status === 'KNOWN' || draft.status === 'APPROXIMATE'
    ? { status: draft.status, date: draft.date }
    : { status: draft.status };
}

/** Empty optional text becomes `null`; any other text is kept exactly as typed. */
const optionalText = (text: string) => (text.trim() === '' ? null : text);

/** Errors that do not need the domain model: required fields that are empty. */
function requiredErrors(
  draft: FactDraft,
  workflow: Workflow,
): Partial<Record<FactField, FactErrorCode>> {
  const errors: Partial<Record<FactField, FactErrorCode>> = {};
  if (draft.kind === null) {
    errors.kind = 'REQUIRED';
    return errors;
  }
  if (draft.subtype === '') errors.subtype = 'REQUIRED';
  if (draft.currency === '') errors.currency = 'REQUIRED';
  const { value } = draft;
  if ((value.status === 'KNOWN' || value.status === 'ESTIMATED') && value.amount === '') {
    errors.amount = 'REQUIRED';
  }
  if (value.status === 'RANGE') {
    if (value.min === '') errors.min = 'REQUIRED';
    if (value.max === '') errors.max = 'REQUIRED';
  }
  for (const field of FACT_DATE_FIELDS[draft.kind]) {
    const date = dateDraft(draft, field);
    if ((date.status === 'KNOWN' || date.status === 'APPROXIMATE') && date.date === '') {
      errors[field] = 'REQUIRED';
    }
  }
  if (workflow === 'missed-year' && draft.periodId === '') errors.periodId = 'REQUIRED';
  return errors;
}

const DOMAIN_CODES = new Set<string>([
  'AMOUNT_NEGATIVE',
  'AMOUNT_TOO_LARGE',
  'AMOUNT_TOO_PRECISE',
  'RANGE_MIN_GREATER_THAN_MAX',
  'UNSUPPORTED_CURRENCY',
  'DATE_AFTER_REFERENCE_DATE',
  'DATE_OUTSIDE_PERIOD',
  'VALUED_BEFORE_ACQUIRED',
  'VALUED_BEFORE_INCURRED',
  'DUE_BEFORE_INCURRED',
  'UNKNOWN_PERIOD',
]);

const DATE_FIELDS = new Set<string>(Object.values(FACT_DATE_FIELDS).flat());

/** Maps a core issue (path relative to the fact) to a form field and UI code. */
export function fieldErrorFor(issue: FactSheetIssue): [FactField, FactErrorCode] {
  const [head = '', second] = issue.path.split('.');
  let field: FactField = 'form';
  if (head === 'value') field = second === 'min' ? 'min' : second === 'max' ? 'max' : 'amount';
  else if (DATE_FIELDS.has(head)) field = head as FactDateField;
  else if (['kind', 'subtype', 'currency', 'periodId', 'label', 'note'].includes(head)) {
    field = head as FactField;
  }

  if (DOMAIN_CODES.has(issue.code)) return [field, issue.code as FactErrorCode];
  if (field === 'amount' || field === 'min' || field === 'max') return [field, 'INVALID_AMOUNT'];
  if (DATE_FIELDS.has(field)) return [field, 'INVALID_DATE'];
  if ((field === 'label' || field === 'note') && issue.code === 'too_big')
    return [field, 'TOO_LONG'];
  return [field, 'INVALID'];
}

export type DraftResult =
  | { readonly ok: true; readonly fact: FinancialFact }
  | { readonly ok: false; readonly errors: FieldErrors };

/**
 * Builds and validates a fact from a draft. The id is assigned by the caller. The fact is checked
 * against the sheet's dates on its own, by @khums/core.
 */
export function factFromDraft(draft: FactDraft, id: string, frame: FactSheetFrame): DraftResult {
  const required = requiredErrors(draft, frame.context.workflow);
  if (draft.kind === null || Object.keys(required).length > 0) {
    return { ok: false, errors: required };
  }
  const dates: Record<string, DateValue> = {};
  for (const field of FACT_DATE_FIELDS[draft.kind]) {
    dates[field] = dateValue(dateDraft(draft, field));
  }
  const candidate = {
    id,
    kind: draft.kind,
    subtype: draft.subtype,
    label: optionalText(draft.label),
    note: optionalText(draft.note),
    currency: draft.currency,
    value: amountValue(draft.value),
    periodId: frame.context.workflow === 'missed-year' ? draft.periodId : null,
    ...dates,
  };
  const issues = validateFactInFrame(frame, candidate);
  if (issues.length === 0) return { ok: true, fact: candidate as FinancialFact };
  const errors: Partial<Record<FactField, FactErrorCode>> = {};
  for (const issue of issues) {
    const [field, code] = fieldErrorFor(issue);
    errors[field] ??= code;
  }
  return { ok: false, errors };
}

// ── Assessment dates (the sheet's frame) ───────────────────────────────────────────────

export interface PeriodDraft {
  readonly id: string;
  readonly start: string;
  readonly end: string;
}

export interface FrameDraft {
  readonly currency: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly assessmentDate: string;
  readonly periods: readonly PeriodDraft[];
}

export type FrameField =
  | 'currency'
  | 'periodStart'
  | 'periodEnd'
  | 'assessmentDate'
  | `periods.${number}.start`
  | `periods.${number}.end`
  | 'periods';

export type FrameErrorCode =
  | 'REQUIRED'
  | 'INVALID_DATE'
  | 'UNSUPPORTED_CURRENCY'
  | 'PERIOD_END_BEFORE_START'
  | 'PERIODS_NOT_ORDERED'
  | 'PERIOD_AFTER_ASSESSMENT_DATE'
  | 'INVALID';

export type FrameErrors = Readonly<Partial<Record<FrameField, FrameErrorCode>>>;

export function emptyFrameDraft(currency: string): FrameDraft {
  return { currency, periodStart: '', periodEnd: '', assessmentDate: '', periods: [] };
}

export function contextFromDraft(draft: FrameDraft, workflow: Workflow): FactSheetContext {
  switch (workflow) {
    case 'annual':
      return { workflow, period: { start: draft.periodStart, end: draft.periodEnd } };
    case 'first-time':
      return { workflow, assessmentDate: draft.assessmentDate };
    case 'missed-year':
      return { workflow, assessmentDate: draft.assessmentDate, periods: draft.periods };
  }
}

const FRAME_CODES = new Set<string>([
  'UNSUPPORTED_CURRENCY',
  'PERIOD_END_BEFORE_START',
  'PERIODS_NOT_ORDERED',
  'PERIOD_AFTER_ASSESSMENT_DATE',
]);

/** Validates the assessment dates; returns the frame when valid. */
export function frameFromDraft(
  draft: FrameDraft,
  workflow: Workflow,
):
  | { readonly ok: true; readonly frame: FactSheetFrame }
  | { readonly ok: false; readonly errors: FrameErrors } {
  const errors: Partial<Record<FrameField, FrameErrorCode>> = {};
  if (draft.currency === '') errors.currency = 'REQUIRED';
  if (workflow === 'annual') {
    if (draft.periodStart === '') errors.periodStart = 'REQUIRED';
    if (draft.periodEnd === '') errors.periodEnd = 'REQUIRED';
  } else {
    if (draft.assessmentDate === '') errors.assessmentDate = 'REQUIRED';
  }
  if (workflow === 'missed-year') {
    if (draft.periods.length === 0) errors.periods = 'REQUIRED';
    draft.periods.forEach((period, index) => {
      if (period.start === '') errors[`periods.${index}.start`] = 'REQUIRED';
      if (period.end === '') errors[`periods.${index}.end`] = 'REQUIRED';
    });
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const frame: FactSheetFrame = {
    currency: draft.currency,
    context: contextFromDraft(draft, workflow),
  };
  const issues = validateFactSheetFrame(frame);
  if (issues.length === 0) return { ok: true, frame };
  for (const issue of issues) {
    const [field, code] = frameErrorFor(issue);
    errors[field] ??= code;
  }
  return { ok: false, errors };
}

function frameErrorFor(issue: FactSheetIssue): [FrameField, FrameErrorCode] {
  const parts = issue.path.split('.');
  const code: FrameErrorCode = FRAME_CODES.has(issue.code)
    ? (issue.code as FrameErrorCode)
    : 'INVALID_DATE';
  if (parts[0] === 'currency') return ['currency', code === 'INVALID_DATE' ? 'INVALID' : code];
  if (parts[1] === 'assessmentDate') return ['assessmentDate', code];
  // Without a start/end in the path, an ordering issue belongs on the start date and an
  // end-date issue on the end date.
  const onStart = (part: string | undefined) =>
    part === 'start' || (part === undefined && code === 'PERIODS_NOT_ORDERED');
  if (parts[1] === 'period') return [onStart(parts[2]) ? 'periodStart' : 'periodEnd', code];
  if (parts[1] === 'periods' && parts[2] !== undefined) {
    const index = Number(parts[2]);
    return [onStart(parts[3]) ? `periods.${index}.start` : `periods.${index}.end`, code];
  }
  return ['periods', code];
}

/** Structural equality of two drafts (key order does not matter). Used to detect unsaved edits. */
export function sameDraft(a: FactDraft, b: FactDraft): boolean {
  return deepEqual(a, b);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keysA = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const keysB = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}
