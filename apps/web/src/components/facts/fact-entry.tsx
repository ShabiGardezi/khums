'use client';

import { CircleAlert, ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';

import {
  describeFactCompleteness,
  FACT_CURRENCIES,
  FACT_DATE_FIELDS,
  formatFactAmount,
  type EntryCoverageMap,
  type FactDateField,
} from '@khums/core';
import type { DateValue, FinancialFact } from '@khums/shared-types';
import { Alert, AlertDescription, AlertTitle } from '@khums/ui/components/alert';
import { buttonVariants } from '@khums/ui/components/button';
import { Field } from '@khums/ui/components/field';
import { Input } from '@khums/ui/components/input';
import { NativeSelect } from '@khums/ui/components/native-select';

import type { ConfirmOptions } from '@/components/common/confirm-dialog';
import type { FactsContent } from '@/content/facts/types';
import {
  contextFromDraft,
  frameFromDraft,
  type FrameDraft,
  type FrameErrorCode,
  type FrameField,
  type PeriodDraft,
} from '@/financial/drafts';
import {
  addPeriod,
  canAddFact,
  canAddPeriod,
  newFactId,
  removeFact,
  removePeriod,
  saveFact,
  savedFactIssues,
  type FactEntryState,
} from '@/financial/entry-state';
import { formatMessage } from '@/i18n/format';
import { useHydrated } from '@/lib/use-hydrated';

import { FactForm } from './fact-form';

export interface FactEntryProps {
  readonly content: FactsContent;
  /** BCP 47 tag for number, date and currency-name formatting. */
  readonly localeTag: string;
  readonly state: FactEntryState;
  readonly onChange: (update: (state: FactEntryState) => FactEntryState) => void;
  /** Whether the open form has unsaved changes (owned by the onboarding flow). */
  readonly formDirty: boolean;
  readonly onFormDirtyChange: (dirty: boolean) => void;
  readonly confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Open the editor for this saved fact on arrival (e.g. "Edit" from the review). */
  readonly editRequest: string | null;
  readonly onOpenReview: () => void;
  /**
   * Public verified mode only (Phase 3 step 2): how the selected Marja's verified pack uses each
   * entry type, so the form can group them. Null or omitted elsewhere (the form is unchanged).
   */
  readonly coverage?: EntryCoverageMap | null;
}

type Editor =
  | { readonly mode: 'closed' }
  | { readonly mode: 'add'; readonly id: string }
  | { readonly mode: 'edit'; readonly fact: FinancialFact };

/**
 * Financial fact entry (M4.3.2). Client-only by design: facts live in React state owned by the
 * onboarding flow and are never sent to a server, written to storage or put in a URL. Without
 * JavaScript the step explains why it cannot run, instead of falling back to a server round trip.
 */
export function FactEntry(props: FactEntryProps) {
  const hydrated = useHydrated();
  const { content } = props;
  if (!hydrated) {
    return (
      <Alert variant="warning">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>{content.jsRequired.title}</AlertTitle>
        <AlertDescription>
          <p>{content.jsRequired.body}</p>
        </AlertDescription>
      </Alert>
    );
  }
  return <FactEntryClient {...props} />;
}

function FactEntryClient({
  content,
  localeTag,
  state,
  onChange,
  formDirty,
  onFormDirtyChange,
  confirm,
  editRequest,
  onOpenReview,
  coverage = null,
}: FactEntryProps) {
  const baseId = useId();
  const [editor, setEditor] = useState<Editor>(() => {
    const fact = state.facts.find((f) => f.id === editRequest);
    return fact === undefined ? { mode: 'closed' } : { mode: 'edit', fact };
  });
  const [showFrameErrors, setShowFrameErrors] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // Element to focus after the next render (object identity re-triggers the effect).
  const [focusRequest, setFocusRequest] = useState<{ readonly id: string } | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const addButtonId = `${baseId}-add`;
  const overviewHeadingId = `${baseId}-overview`;
  const frameNoticeId = `${baseId}-frame-incomplete`;

  useEffect(() => {
    if (focusRequest !== null) document.getElementById(focusRequest.id)?.focus();
  }, [focusRequest]);

  // Leaving the page is guarded by the onboarding flow (it outlives this step).
  const hasFacts = state.facts.length > 0;

  const frameResult = frameFromDraft(state.frame, state.workflow);
  const issues = useMemo(() => savedFactIssues(state), [state]);
  const currencyOptions = useCurrencyOptions(localeTag);
  const periodOptions = state.frame.periods.map((period, index) => ({
    id: period.id,
    name: periodName(content, period, index, localeTag),
  }));

  const setFrame = (patch: Partial<FrameDraft>) => {
    onChange((current) => ({ ...current, frame: { ...current.frame, ...patch } }));
  };

  const openAdd = () => {
    if (!frameResult.ok) {
      setShowFrameErrors(true);
      setFocusRequest({ id: frameNoticeId });
      return;
    }
    const [id] = newFactId(state);
    setEditor({ mode: 'add', id });
  };

  const onSave = (fact: FinancialFact) => {
    const adding = editor.mode === 'add';
    onChange((current) => {
      const next = adding ? newFactId(current)[1] : current;
      return saveFact(next, fact);
    });
    setEditor({ mode: 'closed' });
    onFormDirtyChange(false);
    setAnnouncement(adding ? content.announcements.added : content.announcements.updated);
    setFocusRequest({ id: `${baseId}-fact-${fact.id}` });
  };

  const onCancel = async () => {
    if (formDirty) {
      const text =
        editor.mode === 'edit' ? content.unsaved.discardChanges : content.unsaved.discardEntry;
      const discard = await confirm({
        title: text.title,
        body: text.body,
        confirmLabel: text.confirm,
        cancelLabel: text.cancel,
      });
      if (!discard) return;
    }
    const returnTo = editor.mode === 'edit' ? `${baseId}-edit-${editor.fact.id}` : addButtonId;
    setEditor({ mode: 'closed' });
    onFormDirtyChange(false);
    setFocusRequest({ id: returnTo });
  };

  const onRemove = (id: string) => {
    onChange((current) => removeFact(current, id));
    setConfirmingRemove(null);
    setAnnouncement(content.announcements.removed);
    setFocusRequest({ id: overviewHeadingId });
  };

  const frameError = (field: FrameField): string | undefined => {
    if (frameResult.ok) return undefined;
    const code: FrameErrorCode | undefined = frameResult.errors[field];
    if (code === undefined || (code === 'REQUIRED' && !showFrameErrors)) return undefined;
    return content.errors[code];
  };

  const completeness = describeFactCompleteness({
    schemaVersion: 1,
    currency: state.frame.currency,
    context: contextFromDraft(state.frame, state.workflow),
    facts: state.facts,
  });

  return (
    <div className="flex flex-col gap-8">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <section aria-labelledby={`${baseId}-frame`} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={`${baseId}-frame`} className="text-lg font-semibold">
            {content.frame.title}
          </h2>
          <p className="text-muted-foreground text-sm">{content.frame.description}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={content.frame.currency.label}
            description={content.frame.currency.description}
            error={frameError('currency')}
            required
          >
            <NativeSelect
              value={state.frame.currency}
              onChange={(event) => {
                setFrame({ currency: event.target.value });
              }}
            >
              <option value="">{content.frame.currency.placeholder}</option>
              {currencyOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {state.workflow === 'annual' ? (
            <>
              <DateInput
                label={content.frame.periodStart}
                description={content.frame.periodDescription}
                value={state.frame.periodStart}
                error={frameError('periodStart')}
                onChange={(periodStart) => {
                  setFrame({ periodStart });
                }}
              />
              <DateInput
                label={content.frame.periodEnd}
                value={state.frame.periodEnd}
                error={frameError('periodEnd')}
                onChange={(periodEnd) => {
                  setFrame({ periodEnd });
                }}
              />
            </>
          ) : (
            <DateInput
              label={content.frame.assessmentDate.label}
              description={content.frame.assessmentDate.description}
              value={state.frame.assessmentDate}
              error={frameError('assessmentDate')}
              onChange={(assessmentDate) => {
                setFrame({ assessmentDate });
              }}
            />
          )}
        </div>

        {state.workflow === 'missed-year' && (
          <PeriodsEditor
            content={content}
            localeTag={localeTag}
            periods={state.frame.periods}
            canAdd={canAddPeriod(state)}
            error={frameError}
            onAdd={() => {
              onChange(addPeriod);
            }}
            onRemove={(id) => {
              onChange((current) => removePeriod(current, id));
            }}
            onChangePeriod={(index, patch) => {
              onChange((current) => ({
                ...current,
                frame: {
                  ...current.frame,
                  periods: current.frame.periods.map((p, i) =>
                    i === index ? { ...p, ...patch } : p,
                  ),
                },
              }));
            }}
          />
        )}

        {!frameResult.ok && (
          <p
            id={frameNoticeId}
            tabIndex={-1}
            className="text-muted-foreground text-sm focus-visible:outline-none"
          >
            {content.frame.incomplete}
          </p>
        )}
      </section>

      <section aria-labelledby={overviewHeadingId} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id={overviewHeadingId}
            tabIndex={-1}
            className="text-lg font-semibold focus-visible:outline-none"
          >
            {content.overview.title}
          </h2>
          {hasFacts && (
            <p className="text-muted-foreground text-sm">
              {formatMessage(
                new Intl.PluralRules(localeTag).select(state.facts.length) === 'one'
                  ? content.overview.counts.one
                  : content.overview.counts.other,
                { count: new Intl.NumberFormat(localeTag).format(state.facts.length) },
              )}
            </p>
          )}
        </div>

        {hasFacts ? (
          <>
            <Completeness content={content} localeTag={localeTag} counts={completeness.amounts} />
            <p className="text-muted-foreground text-sm">{content.overview.noTotals}</p>
            <ul className="flex flex-col gap-3">
              {state.facts.map((fact) => (
                <FactItem
                  key={fact.id}
                  baseId={baseId}
                  content={content}
                  localeTag={localeTag}
                  fact={fact}
                  periodName={periodOptions.find((p) => p.id === fact.periodId)?.name ?? null}
                  needsAttention={issues.has(fact.id)}
                  confirming={confirmingRemove === fact.id}
                  disabled={editor.mode !== 'closed'}
                  onEdit={() => {
                    setEditor({ mode: 'edit', fact });
                  }}
                  onAskRemove={() => {
                    setConfirmingRemove(fact.id);
                    setFocusRequest({ id: `${baseId}-confirm-${fact.id}` });
                  }}
                  onCancelRemove={() => {
                    setConfirmingRemove(null);
                    setFocusRequest({ id: `${baseId}-remove-${fact.id}` });
                  }}
                  onRemove={() => {
                    onRemove(fact.id);
                  }}
                />
              ))}
            </ul>
          </>
        ) : (
          editor.mode === 'closed' && (
            <div className="bg-muted flex flex-col gap-1 rounded-lg p-4">
              <p className="font-medium">{content.overview.empty.title}</p>
              <p className="text-muted-foreground text-sm">{content.overview.empty.body}</p>
            </div>
          )
        )}

        {editor.mode !== 'closed' && frameResult.ok ? (
          <FactForm
            key={editor.mode === 'edit' ? editor.fact.id : editor.id}
            content={content}
            frame={frameResult.frame}
            editing={editor.mode === 'edit' ? editor.fact : null}
            factId={editor.mode === 'edit' ? editor.fact.id : editor.id}
            currencyOptions={currencyOptions}
            periodOptions={periodOptions}
            onSave={onSave}
            onCancel={() => {
              void onCancel();
            }}
            onDirtyChange={onFormDirtyChange}
            coverage={coverage}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-3">
              <button
                id={addButtonId}
                type="button"
                onClick={openAdd}
                disabled={!canAddFact(state)}
                aria-describedby={frameResult.ok ? undefined : frameNoticeId}
                className={buttonVariants({ size: 'lg' })}
              >
                <Plus aria-hidden="true" />
                {content.actions.add}
              </button>
              {hasFacts && frameResult.ok && (
                <button
                  type="button"
                  onClick={onOpenReview}
                  className={buttonVariants({ size: 'lg', variant: 'outline' })}
                >
                  <ClipboardList aria-hidden="true" />
                  {content.review.open}
                </button>
              )}
            </div>
            {!canAddFact(state) && (
              <p className="text-muted-foreground text-sm">{content.actions.limit}</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export function useCurrencyOptions(localeTag: string) {
  return useMemo(() => {
    const names = new Intl.DisplayNames([localeTag], { type: 'currency' });
    const collator = new Intl.Collator(localeTag);
    return FACT_CURRENCIES.map((code) => ({
      code,
      name: `${names.of(code) ?? code} (${code})`,
    })).sort((a, b) => collator.compare(a.name, b.name));
  }, [localeTag]);
}

/** Formats a calendar date (YYYY-MM-DD) without time-zone shifts. */
export function formatDate(iso: string, localeTag: string): string {
  return new Intl.DateTimeFormat(localeTag, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

export function periodName(
  content: FactsContent,
  period: PeriodDraft,
  index: number,
  localeTag: string,
) {
  const name = formatMessage(content.frame.periods.name, {
    number: new Intl.NumberFormat(localeTag).format(index + 1),
  });
  return period.start !== '' && period.end !== ''
    ? `${name} (${formatDate(period.start, localeTag)} – ${formatDate(period.end, localeTag)})`
    : name;
}

function DateInput(props: {
  readonly label: string;
  readonly description?: string;
  readonly value: string;
  readonly error: string | undefined;
  readonly onChange: (value: string) => void;
}) {
  return (
    <Field label={props.label} description={props.description} error={props.error} required>
      <Input
        type="date"
        value={props.value}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
    </Field>
  );
}

function PeriodsEditor(props: {
  readonly content: FactsContent;
  readonly localeTag: string;
  readonly periods: readonly PeriodDraft[];
  readonly canAdd: boolean;
  readonly error: (field: FrameField) => string | undefined;
  readonly onAdd: () => void;
  readonly onRemove: (id: string) => void;
  readonly onChangePeriod: (index: number, patch: Partial<PeriodDraft>) => void;
}) {
  const { periods: text } = props.content.frame;
  const number = new Intl.NumberFormat(props.localeTag);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 font-medium">{text.title}</legend>
      <p className="text-muted-foreground text-sm">{text.description}</p>
      {props.periods.length === 0 && <p className="text-muted-foreground text-sm">{text.empty}</p>}
      {props.error('periods') !== undefined && (
        <p className="text-destructive-strong text-sm font-medium">{props.error('periods')}</p>
      )}
      <ol className="flex flex-col gap-3">
        {props.periods.map((period, index) => {
          const name = formatMessage(text.name, { number: number.format(index + 1) });
          return (
            <li key={period.id} className="rounded-md border p-3">
              <fieldset className="flex flex-col gap-3">
                <legend className="text-sm font-medium">{name}</legend>
                <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <DateInput
                    label={text.start}
                    value={period.start}
                    error={props.error(`periods.${index}.start`)}
                    onChange={(start) => {
                      props.onChangePeriod(index, { start });
                    }}
                  />
                  <DateInput
                    label={text.end}
                    value={period.end}
                    error={props.error(`periods.${index}.end`)}
                    onChange={(end) => {
                      props.onChangePeriod(index, { end });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      props.onRemove(period.id);
                    }}
                    className={buttonVariants({ variant: 'ghost' })}
                  >
                    <Trash2 aria-hidden="true" />
                    {formatMessage(text.remove, { number: number.format(index + 1) })}
                  </button>
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      <div>
        <button
          type="button"
          onClick={props.onAdd}
          disabled={!props.canAdd}
          className={buttonVariants({ variant: 'outline' })}
        >
          <Plus aria-hidden="true" />
          {text.add}
        </button>
      </div>
    </fieldset>
  );
}

function Completeness(props: {
  readonly content: FactsContent;
  readonly localeTag: string;
  readonly counts: ReturnType<typeof describeFactCompleteness>['amounts'];
}) {
  const number = new Intl.NumberFormat(props.localeTag);
  const text = props.content.overview.completeness;
  const rows = [
    [text.known, props.counts.known],
    [text.estimated, props.counts.estimated],
    [text.range, props.counts.range],
    [text.unknown, props.counts.unknown],
    [text.notProvided, props.counts.notProvided],
  ] as const;
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {rows
        .filter(([, count]) => count > 0)
        .map(([template, count]) => (
          <li key={template}>{formatMessage(template, { count: number.format(count) })}</li>
        ))}
    </ul>
  );
}

export function amountText(fact: FinancialFact, content: FactsContent, localeTag: string): string {
  const format = (amount: string) => formatFactAmount(amount, fact.currency, localeTag) ?? amount;
  switch (fact.value.status) {
    case 'KNOWN':
      return format(fact.value.amount);
    case 'ESTIMATED':
      return formatMessage(content.item.estimated, { amount: format(fact.value.amount) });
    case 'RANGE':
      return formatMessage(content.item.range, {
        min: format(fact.value.min),
        max: format(fact.value.max),
      });
    case 'UNKNOWN':
      return content.item.unknown;
    case 'NOT_PROVIDED':
      return content.item.notProvided;
  }
}

export function dateText(value: DateValue, content: FactsContent, localeTag: string): string {
  switch (value.status) {
    case 'KNOWN':
      return formatDate(value.date, localeTag);
    case 'APPROXIMATE':
      return formatMessage(content.item.approximate, { date: formatDate(value.date, localeTag) });
    case 'UNKNOWN':
      return content.item.dateUnknown;
    case 'NOT_PROVIDED':
      return content.item.dateNotProvided;
  }
}

function FactItem(props: {
  readonly baseId: string;
  readonly content: FactsContent;
  readonly localeTag: string;
  readonly fact: FinancialFact;
  readonly periodName: string | null;
  readonly needsAttention: boolean;
  readonly confirming: boolean;
  readonly disabled: boolean;
  readonly onEdit: () => void;
  readonly onAskRemove: () => void;
  readonly onCancelRemove: () => void;
  readonly onRemove: () => void;
}) {
  const { fact, content, baseId } = props;
  const subtype = (content.subtypes[fact.kind] as Readonly<Record<string, string>>)[fact.subtype];
  const dates = FACT_DATE_FIELDS[fact.kind];
  return (
    <li className="bg-card flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs font-medium">
          {content.kinds[fact.kind].label}
          {fact.label !== null && ` · ${subtype}`}
        </p>
        <h3
          id={`${baseId}-fact-${fact.id}`}
          tabIndex={-1}
          className="font-semibold focus-visible:outline-none"
        >
          {fact.label ?? subtype}
        </h3>
        <p className="text-base">
          <bdi>{amountText(fact, content, props.localeTag)}</bdi>
        </p>
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {dates.map((field: FactDateField) => (
          <div key={field} className="contents">
            <dt className="text-muted-foreground">{content.form.dates.labels[field]}</dt>
            <dd>
              {dateText(
                (fact as unknown as Readonly<Record<FactDateField, DateValue>>)[field],
                content,
                props.localeTag,
              )}
            </dd>
          </div>
        ))}
      </dl>
      {props.periodName !== null && (
        <p className="text-sm">{formatMessage(content.item.period, { name: props.periodName })}</p>
      )}
      {fact.note !== null && (
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">
          <bdi>{fact.note}</bdi>
        </p>
      )}
      {props.needsAttention && (
        <p className="text-warning-strong bg-warning-soft flex items-start gap-2 rounded-md p-2 text-sm">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {content.overview.needsAttention}
        </p>
      )}
      {props.confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <p
            id={`${baseId}-confirm-${fact.id}`}
            tabIndex={-1}
            className="text-sm font-medium focus-visible:outline-none"
          >
            {content.item.confirmRemove}
          </p>
          <button
            type="button"
            onClick={props.onRemove}
            className={buttonVariants({ variant: 'destructive', size: 'sm' })}
          >
            {content.item.confirm}
          </button>
          <button
            type="button"
            onClick={props.onCancelRemove}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {content.item.cancel}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            id={`${baseId}-edit-${fact.id}`}
            type="button"
            onClick={props.onEdit}
            disabled={props.disabled}
            aria-describedby={`${baseId}-fact-${fact.id}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Pencil aria-hidden="true" />
            {content.item.edit}
          </button>
          <button
            id={`${baseId}-remove-${fact.id}`}
            type="button"
            onClick={props.onAskRemove}
            disabled={props.disabled}
            aria-describedby={`${baseId}-fact-${fact.id}`}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            <Trash2 aria-hidden="true" />
            {content.item.remove}
          </button>
        </div>
      )}
    </li>
  );
}
