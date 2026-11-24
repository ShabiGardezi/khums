'use client';

import { CircleAlert, Info, ShieldCheck } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode, type SubmitEvent } from 'react';

import {
  currencyMinorUnits,
  entryCoverageFor,
  FACT_DATE_FIELDS,
  FACT_KINDS,
  FACT_TEXT_LIMITS,
  FINANCIAL_FACT_SUBTYPES,
  type EntryCoverageMap,
  type FactDateField,
  type FactSheetFrame,
} from '@khums/core';
import type { AmountValue, DateValue, FinancialFact, FinancialFactKind } from '@khums/shared-types';
import { Alert, AlertDescription, AlertTitle } from '@khums/ui/components/alert';
import { buttonVariants } from '@khums/ui/components/button';
import { Field } from '@khums/ui/components/field';
import { Input } from '@khums/ui/components/input';
import { NativeSelect } from '@khums/ui/components/native-select';
import { Textarea } from '@khums/ui/components/textarea';

import type { FactsContent } from '@/content/facts/types';
import {
  dateDraft,
  draftFromFact,
  emptyDraft,
  factFromDraft,
  sameDraft,
  withKind,
  type FactDraft,
  type FactErrorCode,
  type FactField,
  type FieldErrors,
} from '@/financial/drafts';
import { formatMessage } from '@/i18n/format';

const AMOUNT_STATUSES: readonly AmountValue['status'][] = [
  'KNOWN',
  'ESTIMATED',
  'RANGE',
  'UNKNOWN',
  'NOT_PROVIDED',
];
const DATE_STATUSES: readonly DateValue['status'][] = [
  'KNOWN',
  'APPROXIMATE',
  'UNKNOWN',
  'NOT_PROVIDED',
];

/** Order in which invalid fields receive focus. */
const FIELD_ORDER: readonly FactField[] = [
  'kind',
  'subtype',
  'currency',
  'amount',
  'min',
  'max',
  'valuedOn',
  'acquiredOn',
  'receivedOn',
  'paidOn',
  'incurredOn',
  'dueOn',
  'periodId',
  'label',
  'note',
  'form',
];

export interface FactFormProps {
  readonly content: FactsContent;
  readonly frame: FactSheetFrame;
  /** `null` to add a new fact. */
  readonly editing: FinancialFact | null;
  /** Id for a new fact, or the edited fact's id. */
  readonly factId: string;
  readonly currencyOptions: readonly { readonly code: string; readonly name: string }[];
  readonly periodOptions: readonly { readonly id: string; readonly name: string }[];
  readonly onSave: (fact: FinancialFact) => void;
  readonly onCancel: () => void;
  /** Reports whether the draft differs from what the form opened with (unsaved changes). */
  readonly onDirtyChange: (dirty: boolean) => void;
  /**
   * Public verified mode only (Phase 3 step 2): how the selected Marja's verified pack uses each
   * entry type. Types are grouped (none hidden), and choosing an uncovered one warns before saving
   * that it will stop the calculation for scholar review. Null: the plain list, as before.
   */
  readonly coverage: EntryCoverageMap | null;
}

/**
 * Add/edit form for one financial fact. All values stay in this component's state; it is never a
 * native form submission (no field `name`s, submit is always prevented), so nothing reaches a
 * URL or a server. Validation is delegated to `factFromDraft` (pure) and @khums/core.
 */
export function FactForm(props: FactFormProps) {
  const { content, frame, editing } = props;
  const { form } = content;
  const baseId = useId();
  const fieldId = (field: FactField) => `${baseId}-${field}`;
  const heading = useRef<HTMLHeadingElement>(null);
  const [initialDraft] = useState<FactDraft>(() =>
    editing === null ? emptyDraft(frame.currency) : draftFromFact(editing),
  );
  const [draft, setDraft] = useState<FactDraft>(initialDraft);
  const dirty = !sameDraft(draft, initialDraft);
  const { onDirtyChange } = props;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  // After a failed save, move focus to the first invalid field.
  useEffect(() => {
    if (attempt === 0) return;
    const first = FIELD_ORDER.find((field) => errors[field] !== undefined);
    if (first === undefined) return;
    const target =
      document.getElementById(fieldId(first)) ??
      document.querySelector<HTMLElement>(`[data-field="${fieldId(first)}"]`);
    target?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per save attempt
  }, [attempt]);

  const update = (patch: Partial<FactDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const message = (field: FactField): ReactNode => {
    const code: FactErrorCode | undefined = errors[field];
    if (code === undefined) return undefined;
    if (code === 'AMOUNT_TOO_PRECISE') {
      const places = currencyMinorUnits(draft.currency) ?? 0;
      return formatMessage(content.errors.AMOUNT_TOO_PRECISE, { places });
    }
    return content.errors[code];
  };

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = factFromDraft(draft, props.factId, frame);
    if (result.ok) {
      props.onSave(result.fact);
      return;
    }
    setErrors(result.errors);
    setAttempt((n) => n + 1);
  };

  const hasErrors = Object.keys(errors).length > 0;
  const kind = draft.kind;

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={onSubmit}
      aria-labelledby={`${baseId}-heading`}
      className="bg-card flex flex-col gap-6 rounded-lg border p-4 sm:p-6"
    >
      <h3
        id={`${baseId}-heading`}
        ref={heading}
        tabIndex={-1}
        className="text-lg font-semibold focus-visible:outline-none"
      >
        {editing === null ? form.addTitle : form.editTitle}
      </h3>

      {hasErrors && (
        <p
          role="alert"
          className="text-destructive-strong bg-destructive-soft flex items-start gap-2 rounded-md p-3 text-sm font-medium"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {form.errorSummary}
        </p>
      )}

      <fieldset
        aria-describedby={errors.kind === undefined ? undefined : `${fieldId('kind')}-error`}
        className="flex flex-col gap-3"
      >
        <legend className="mb-1 font-medium">{form.kindLegend}</legend>
        {errors.kind !== undefined && (
          <p
            id={`${fieldId('kind')}-error`}
            className="text-destructive-strong text-sm font-medium"
          >
            {message('kind')}
          </p>
        )}
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FACT_KINDS.map((k, index) => (
            <li
              key={k}
              className="has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:outline-ring relative flex gap-3 rounded-md border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
            >
              <input
                type="radio"
                name={`${baseId}-kind`}
                id={`${baseId}-kind-${k}`}
                data-field={index === 0 ? fieldId('kind') : undefined}
                checked={kind === k}
                aria-describedby={`${baseId}-kind-${k}-description`}
                onChange={() => {
                  setDraft((current) => withKind(current, k));
                }}
                className="accent-primary relative z-10 mt-1 size-4 shrink-0"
              />
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${baseId}-kind-${k}`}
                  className="font-medium after:absolute after:inset-0 after:content-['']"
                >
                  {content.kinds[k].label}
                </label>
                <span
                  id={`${baseId}-kind-${k}-description`}
                  className="text-muted-foreground text-sm"
                >
                  {content.kinds[k].description}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </fieldset>

      {kind !== null && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={fieldId('subtype')}
              label={form.subtype.label}
              description={props.coverage === null ? undefined : form.coverage.intro}
              error={message('subtype')}
              required
            >
              <NativeSelect
                value={draft.subtype}
                onChange={(event) => {
                  update({ subtype: event.target.value });
                }}
              >
                <option value="">{form.subtype.placeholder}</option>
                <SubtypeOptions content={content} kind={kind} coverage={props.coverage} />
              </NativeSelect>
            </Field>

            <Field
              id={fieldId('currency')}
              label={form.currency.label}
              description={form.currency.description}
              error={message('currency')}
              required
            >
              <NativeSelect
                value={draft.currency}
                onChange={(event) => {
                  update({ currency: event.target.value });
                }}
              >
                {props.currencyOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          {props.coverage !== null && (
            <CoverageNote
              content={content}
              coverage={props.coverage}
              kind={kind}
              subtype={draft.subtype}
            />
          )}
          {props.coverage !== null && (
            <CurrencyNote content={content} currency={draft.currency} preferred={frame.currency} />
          )}

          <AmountFields
            baseId={baseId}
            content={content}
            draft={draft}
            onChange={(value) => {
              update({ value });
            }}
            fieldId={fieldId}
            message={message}
          />

          {FACT_DATE_FIELDS[kind].map((field) => (
            <DateFields
              key={field}
              field={field}
              baseId={baseId}
              content={content}
              value={dateDraft(draft, field)}
              onChange={(value) => {
                setDraft((current) => ({
                  ...current,
                  dates: { ...current.dates, [field]: value },
                }));
              }}
              fieldId={fieldId}
              error={message(field)}
            />
          ))}

          {frame.context.workflow === 'missed-year' && (
            <Field
              id={fieldId('periodId')}
              label={form.period.label}
              error={message('periodId')}
              required
            >
              <NativeSelect
                value={draft.periodId}
                onChange={(event) => {
                  update({ periodId: event.target.value });
                }}
              >
                <option value="">{form.period.placeholder}</option>
                {props.periodOptions.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={fieldId('label')}
              label={`${form.label.label} (${form.optional})`}
              description={form.label.hint}
              error={message('label')}
            >
              <Input
                value={draft.label}
                maxLength={FACT_TEXT_LIMITS.label}
                onChange={(event) => {
                  update({ label: event.target.value });
                }}
              />
            </Field>
            <Field
              id={fieldId('note')}
              label={`${form.note.label} (${form.optional})`}
              description={form.note.hint}
              error={message('note')}
            >
              <Textarea
                value={draft.note}
                rows={2}
                maxLength={FACT_TEXT_LIMITS.note}
                onChange={(event) => {
                  update({ note: event.target.value });
                }}
              />
            </Field>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={buttonVariants({ size: 'lg' })}>
          {editing === null ? form.save : form.saveChanges}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className={buttonVariants({ size: 'lg', variant: 'outline' })}
        >
          {form.cancel}
        </button>
      </div>
    </form>
  );
}

const subtypeLabel = (content: FactsContent, kind: FinancialFactKind, subtype: string) =>
  (content.subtypes[kind] as Readonly<Record<string, string>>)[subtype];

/**
 * The subtype options: one plain list, or (public verified mode) two groups — types this Marja's
 * verified rules use (calculated, excluded or asking a question) and types not yet covered.
 * Option labels and values are unchanged, and no type is hidden.
 */
function SubtypeOptions(props: {
  readonly content: FactsContent;
  readonly kind: FinancialFactKind;
  readonly coverage: EntryCoverageMap | null;
}) {
  const { content, kind, coverage } = props;
  const option = (subtype: string) => (
    <option key={subtype} value={subtype}>
      {subtypeLabel(content, kind, subtype)}
    </option>
  );
  const subtypes = FINANCIAL_FACT_SUBTYPES[kind] as readonly string[];
  if (coverage === null) return <>{subtypes.map(option)}</>;
  const uncovered = (subtype: string) =>
    (entryCoverageFor(coverage, kind, subtype)?.status ?? 'REVIEW') === 'REVIEW';
  const covered = subtypes.filter((s) => !uncovered(s));
  const notCovered = subtypes.filter(uncovered);
  return (
    <>
      {covered.length > 0 && (
        <optgroup label={content.form.coverage.coveredGroup}>{covered.map(option)}</optgroup>
      )}
      {notCovered.length > 0 && (
        <optgroup label={content.form.coverage.uncoveredGroup}>{notCovered.map(option)}</optgroup>
      )}
    </>
  );
}

/**
 * What the verified rules do with the chosen type. An uncovered type gets a warning as soon as it
 * is chosen, before saving: saving it stops the whole calculation for scholar review.
 */
function CoverageNote(props: {
  readonly content: FactsContent;
  readonly coverage: EntryCoverageMap;
  readonly kind: FinancialFactKind;
  readonly subtype: string;
}) {
  const { coverage: text } = props.content.form;
  const coverage =
    props.subtype === '' ? null : entryCoverageFor(props.coverage, props.kind, props.subtype);
  let note: ReactNode = null;
  if (coverage !== null) {
    note =
      coverage.status === 'REVIEW' ? (
        <Alert variant="warning" data-testid="uncovered-entry-warning">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{text.uncovered.title}</AlertTitle>
          <AlertDescription>
            <p>{text.uncovered.body}</p>
          </AlertDescription>
        </Alert>
      ) : (
        <p
          className="text-muted-foreground flex items-start gap-2 text-sm"
          data-testid="covered-entry-note"
        >
          {coverage.status === 'CALCULATED' ? (
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          ) : (
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          )}
          {text.status[coverage.status]}
        </p>
      );
  }
  // A polite live region, so the note is announced when the chosen type changes.
  return <div aria-live="polite">{note}</div>;
}

/**
 * Audit L-4: an entry in another currency than the preferred (sheet) currency stops the whole
 * calculation (the fact mapping never converts: `CURRENCY_CONVERSION_UNSUPPORTED`), so the
 * person is told as soon as such a currency is chosen, before saving. Saving is still allowed.
 */
function CurrencyNote(props: {
  readonly content: FactsContent;
  readonly currency: string;
  readonly preferred: string;
}) {
  const text = props.content.form.coverage.currency;
  const differs =
    props.currency !== '' && props.preferred !== '' && props.currency !== props.preferred;
  return (
    <div aria-live="polite">
      {differs && (
        <Alert variant="warning" data-testid="currency-entry-warning">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{text.title}</AlertTitle>
          <AlertDescription>
            <p>{formatMessage(text.body, { currency: props.preferred })}</p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function AmountFields(props: {
  readonly baseId: string;
  readonly content: FactsContent;
  readonly draft: FactDraft;
  readonly onChange: (value: FactDraft['value']) => void;
  readonly fieldId: (field: FactField) => string;
  readonly message: (field: FactField) => ReactNode;
}) {
  const { amount } = props.content.form;
  const value = props.draft.value;
  const set = (patch: Partial<FactDraft['value']>) => {
    props.onChange({ ...value, ...patch });
  };
  const amountInput = (field: 'amount' | 'min' | 'max', label: string) => (
    <Field
      id={props.fieldId(field)}
      label={label}
      description={amount.hint}
      error={props.message(field)}
      required
    >
      <Input
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
        value={value[field]}
        onChange={(event) => {
          set({ [field]: event.target.value });
        }}
        className="text-start"
      />
    </Field>
  );

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 font-medium">{amount.legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {AMOUNT_STATUSES.map((status) => (
          <label key={status} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${props.baseId}-amount-status`}
              checked={value.status === status}
              onChange={() => {
                set({ status });
              }}
              className="accent-primary size-4"
            />
            {amount.status[status]}
          </label>
        ))}
      </div>
      {(value.status === 'KNOWN' || value.status === 'ESTIMATED') &&
        amountInput('amount', value.status === 'KNOWN' ? amount.label : amount.estimateLabel)}
      {value.status === 'RANGE' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {amountInput('min', amount.min)}
          {amountInput('max', amount.max)}
        </div>
      )}
    </fieldset>
  );
}

function DateFields(props: {
  readonly field: FactDateField;
  readonly baseId: string;
  readonly content: FactsContent;
  readonly value: { readonly status: DateValue['status']; readonly date: string };
  readonly onChange: (value: { status: DateValue['status']; date: string }) => void;
  readonly fieldId: (field: FactField) => string;
  readonly error: ReactNode;
}) {
  const { dates } = props.content.form;
  const { value } = props;
  const needsDate = value.status === 'KNOWN' || value.status === 'APPROXIMATE';
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 font-medium">{dates.labels[props.field]}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${props.baseId}-${props.field}-status`} label={dates.statusLabel}>
          <NativeSelect
            value={value.status}
            onChange={(event) => {
              props.onChange({ ...value, status: event.target.value as DateValue['status'] });
            }}
          >
            {DATE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {dates.status[status]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {needsDate && (
          <Field
            id={props.fieldId(props.field)}
            label={dates.dateLabel}
            description={value.status === 'APPROXIMATE' ? dates.approximateHint : undefined}
            error={props.error}
            required
          >
            <Input
              type="date"
              value={value.date}
              onChange={(event) => {
                props.onChange({ ...value, date: event.target.value });
              }}
            />
          </Field>
        )}
      </div>
      {!needsDate && props.error !== undefined && (
        <p className="text-destructive-strong text-sm font-medium">{props.error}</p>
      )}
    </fieldset>
  );
}
