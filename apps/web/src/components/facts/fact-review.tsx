'use client';

import { CircleAlert, CircleCheck, Download, Info, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import {
  buildFactSheetExport,
  describeFactCompleteness,
  FACT_DATE_FIELDS,
  FACT_KINDS,
  factSheetExportFileName,
  serializeFactSheetExport,
} from '@khums/core';
import type { DateValue, FinancialFact, FinancialFactSheet, Workflow } from '@khums/shared-types';
import { Alert, AlertDescription, AlertTitle } from '@khums/ui/components/alert';
import { buttonVariants } from '@khums/ui/components/button';

import type { ConfirmOptions } from '@/components/common/confirm-dialog';
import type { FactsContent } from '@/content/facts/types';
import type { ResultsContent } from '@/content/results/types';
import type { FactEntryState } from '@/financial/entry-state';
import { dateStateCounts, reviewSheet } from '@/financial/review';
import { formatMessage } from '@/i18n/format';

import { amountText, dateText, formatDate, periodName, useCurrencyOptions } from './fact-entry';

export interface FactReviewProps {
  readonly content: FactsContent;
  readonly workflowTitles: Readonly<Record<Workflow, string>>;
  readonly localeTag: string;
  readonly state: FactEntryState;
  readonly confirm: (options: ConfirmOptions) => Promise<boolean>;
  readonly onEdit: (factId: string) => void;
  readonly onRemove: (factId: string) => void;
  readonly onBack: () => void;
  /**
   * Sample calculation (M4.5.1). Present only when the server provided a calculation pack for this
   * operational state (development: the non-religious mock pack); absent otherwise.
   */
  readonly calculate?: {
    readonly content: ResultsContent['calculate'];
    readonly onCalculate: (sheet: FinancialFactSheet) => void;
  };
}

type Feedback =
  | { readonly kind: 'success'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'info'; readonly message: string };

/**
 * Read-only review of the in-memory fact sheet with a user-initiated local JSON export
 * (M4.3.3). The export is created in the browser (Blob + download link) and never sent anywhere.
 * Nothing is classified, calculated, totalled, rounded, converted or filled in.
 */
export function FactReview(props: FactReviewProps) {
  const { content, state, localeTag } = props;
  const { review } = content;
  const baseId = useId();
  const entriesHeadingId = `${baseId}-entries`;
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ readonly id: string } | null>(null);
  const status = reviewSheet(state);
  const currencies = useCurrencyOptions(localeTag);
  const currencyName = (code: string) => currencies.find((c) => c.code === code)?.name ?? code;
  const number = new Intl.NumberFormat(localeTag);

  useEffect(() => {
    if (focusRequest !== null) document.getElementById(focusRequest.id)?.focus();
  }, [focusRequest]);

  const onExport = () => {
    if (status.kind !== 'ready') {
      setFeedback({ kind: 'error', message: content.export.invalid });
      return;
    }
    const exportedAt = new Date().toISOString();
    const built = buildFactSheetExport(status.sheet, exportedAt);
    if (!built.ok) {
      setFeedback({ kind: 'error', message: content.export.invalid });
      return;
    }
    try {
      const fileName = factSheetExportFileName(exportedAt);
      const blob = new Blob([serializeFactSheetExport(built.value)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 0);
      setFeedback({
        kind: 'success',
        message: formatMessage(content.export.success, { file: fileName }),
      });
    } catch {
      setFeedback({ kind: 'error', message: content.export.error });
    }
  };

  const onRemove = async (fact: FinancialFact) => {
    const text = content.unsaved.removeFact;
    const remove = await props.confirm({
      title: text.title,
      body: text.body,
      confirmLabel: text.confirm,
      cancelLabel: text.cancel,
    });
    if (!remove) return;
    props.onRemove(fact.id);
    setFeedback({ kind: 'info', message: content.announcements.removed });
    setFocusRequest({ id: entriesHeadingId });
  };

  if (status.kind === 'incomplete-frame') {
    return (
      <div className="flex flex-col gap-6">
        <Alert variant="warning">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>
            <p>{review.status.incompleteFrame}</p>
          </AlertDescription>
        </Alert>
        <BackButton label={review.back} onClick={props.onBack} />
      </div>
    );
  }

  const { sheet } = status;
  const context = sheet.context;
  const completeness = describeFactCompleteness(sheet).amounts;
  const dates = dateStateCounts(sheet.facts);
  const uncertain = [
    [content.overview.completeness.estimated, completeness.estimated],
    [content.overview.completeness.range, completeness.range],
    [content.overview.completeness.unknown, completeness.unknown],
    [content.overview.completeness.notProvided, completeness.notProvided],
    [review.uncertainty.approximateDates, dates.approximate],
    [review.uncertainty.unknownDates, dates.unknown],
    [review.uncertainty.missingDates, dates.notProvided],
  ] as const;
  const anyUncertain = uncertain.some(([, count]) => count > 0);
  const issueIds = status.kind === 'issues' ? status.factIds : new Set<string>();
  const statusMessage =
    status.kind === 'ready'
      ? review.status.ready
      : status.kind === 'empty'
        ? review.status.empty
        : review.status.issues;
  const statusId = `${baseId}-status`;
  const periodNames = new Map(
    (context.workflow === 'missed-year' ? context.periods : []).map((period, index) => [
      period.id,
      periodName(content, period, index, localeTag),
    ]),
  );

  return (
    <div className="flex flex-col gap-8">
      <Alert variant="warning">
        <Info aria-hidden="true" />
        <AlertTitle>{review.notResult.title}</AlertTitle>
        <AlertDescription>
          <p>{review.notResult.body}</p>
        </AlertDescription>
      </Alert>

      <section aria-labelledby={`${baseId}-summary`} className="flex flex-col gap-3">
        <h2 id={`${baseId}-summary`} className="text-lg font-semibold">
          {review.summaryTitle}
        </h2>
        <dl className="bg-card grid gap-x-6 gap-y-2 rounded-lg border p-4 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">{review.fields.workflow}</dt>
          <dd className="font-medium">{props.workflowTitles[context.workflow]}</dd>
          <dt className="text-muted-foreground">{review.fields.currency}</dt>
          <dd className="font-medium">{currencyName(sheet.currency)}</dd>
          {context.workflow === 'annual' ? (
            <>
              <dt className="text-muted-foreground">{review.fields.period}</dt>
              <dd className="font-medium">
                {formatMessage(review.periodRange, {
                  start: formatDate(context.period.start, localeTag),
                  end: formatDate(context.period.end, localeTag),
                })}
              </dd>
            </>
          ) : (
            <>
              <dt className="text-muted-foreground">{review.fields.assessmentDate}</dt>
              <dd className="font-medium">{formatDate(context.assessmentDate, localeTag)}</dd>
            </>
          )}
          {context.workflow === 'missed-year' && (
            <>
              <dt className="text-muted-foreground">{review.fields.periods}</dt>
              <dd>
                <ol className="flex flex-col gap-1 font-medium">
                  {context.periods.map((period) => (
                    <li key={period.id}>{periodNames.get(period.id)}</li>
                  ))}
                </ol>
              </dd>
            </>
          )}
        </dl>
      </section>

      <section aria-labelledby={`${baseId}-uncertainty`} className="flex flex-col gap-2">
        <h2 id={`${baseId}-uncertainty`} className="text-lg font-semibold">
          {review.uncertainty.title}
        </h2>
        <p className="text-muted-foreground text-sm">{review.uncertainty.body}</p>
        {anyUncertain ? (
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {uncertain
              .filter(([, count]) => count > 0)
              .map(([template, count]) => (
                <li key={template}>{formatMessage(template, { count: number.format(count) })}</li>
              ))}
          </ul>
        ) : (
          <p className="text-sm">{review.uncertainty.none}</p>
        )}
      </section>

      <section aria-labelledby={entriesHeadingId} className="flex flex-col gap-4">
        <h2
          id={entriesHeadingId}
          tabIndex={-1}
          className="text-lg font-semibold focus-visible:outline-none"
        >
          {review.entriesTitle}
        </h2>
        <p className="text-muted-foreground text-sm">{content.overview.noTotals}</p>
        {FACT_KINDS.map((kind) => {
          const facts = sheet.facts.filter((fact) => fact.kind === kind);
          if (facts.length === 0) return null;
          return (
            <section
              key={kind}
              aria-labelledby={`${baseId}-kind-${kind}`}
              className="flex flex-col gap-3"
            >
              <h3 id={`${baseId}-kind-${kind}`} className="font-semibold">
                {content.kinds[kind].label}{' '}
                <span className="text-muted-foreground font-normal">
                  ({number.format(facts.length)})
                </span>
              </h3>
              <ul className="flex flex-col gap-3">
                {facts.map((fact) => (
                  <ReviewCard
                    key={fact.id}
                    baseId={baseId}
                    content={content}
                    localeTag={localeTag}
                    fact={fact}
                    currencyName={currencyName(fact.currency)}
                    periodName={
                      fact.periodId === null ? null : (periodNames.get(fact.periodId) ?? null)
                    }
                    needsAttention={issueIds.has(fact.id)}
                    onEdit={() => {
                      props.onEdit(fact.id);
                    }}
                    onRemove={() => {
                      void onRemove(fact);
                    }}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </section>

      <section
        aria-labelledby={`${baseId}-export`}
        className="bg-card flex flex-col gap-3 rounded-lg border p-4 sm:p-6"
      >
        <h2 id={`${baseId}-export`} className="text-lg font-semibold">
          {content.export.title}
        </h2>
        <p className="text-muted-foreground text-sm">{content.export.description}</p>
        <p
          id={statusId}
          className={
            status.kind === 'ready'
              ? 'text-success-strong flex items-start gap-2 text-sm font-medium'
              : 'text-warning-strong flex items-start gap-2 text-sm font-medium'
          }
        >
          {status.kind === 'ready' ? (
            <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          )}
          {statusMessage}
        </p>
        <div>
          <button
            type="button"
            onClick={onExport}
            aria-describedby={statusId}
            className={buttonVariants({ size: 'lg' })}
          >
            <Download aria-hidden="true" />
            {content.export.button}
          </button>
        </div>
        <p
          role={feedback?.kind === 'error' ? 'alert' : 'status'}
          aria-live={feedback?.kind === 'error' ? 'assertive' : 'polite'}
          className={
            feedback?.kind === 'error'
              ? 'text-destructive-strong text-sm font-medium'
              : 'text-sm font-medium'
          }
        >
          {feedback?.message}
        </p>
      </section>

      {props.calculate !== undefined && (
        <section
          aria-labelledby={`${baseId}-calculate`}
          className="bg-card flex flex-col gap-3 rounded-lg border p-4 sm:p-6"
        >
          <h2 id={`${baseId}-calculate`} className="text-lg font-semibold">
            {props.calculate.content.title}
          </h2>
          <p className="text-muted-foreground text-sm">{props.calculate.content.description}</p>
          {status.kind === 'ready' ? (
            <div>
              <button
                type="button"
                className={buttonVariants({ size: 'lg' })}
                onClick={() => {
                  props.calculate?.onCalculate(status.sheet);
                }}
              >
                {props.calculate.content.button}
              </button>
            </div>
          ) : (
            <p className="text-warning-strong text-sm font-medium">
              {props.calculate.content.notReady}
            </p>
          )}
        </section>
      )}

      <BackButton label={review.back} onClick={props.onBack} />
    </div>
  );
}

function BackButton({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        className={buttonVariants({ size: 'lg', variant: 'outline' })}
      >
        {label}
      </button>
    </div>
  );
}

function ReviewCard(props: {
  readonly baseId: string;
  readonly content: FactsContent;
  readonly localeTag: string;
  readonly fact: FinancialFact;
  readonly currencyName: string;
  readonly periodName: string | null;
  readonly needsAttention: boolean;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
}) {
  const { fact, content, baseId } = props;
  const { review } = content;
  const subtype = (content.subtypes[fact.kind] as Readonly<Record<string, string>>)[fact.subtype];
  const headingId = `${baseId}-review-${fact.id}`;
  return (
    <li className="bg-card flex flex-col gap-3 rounded-lg border p-4">
      <h4 id={headingId} className="font-semibold">
        {fact.label ?? subtype}
      </h4>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {fact.label !== null && (
          <>
            <dt className="text-muted-foreground">{content.form.subtype.label}</dt>
            <dd>{subtype}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{review.fields.amount}</dt>
        <dd>
          <bdi>{amountText(fact, content, props.localeTag)}</bdi>
        </dd>
        <dt className="text-muted-foreground">{review.fields.certainty}</dt>
        <dd>{content.form.amount.status[fact.value.status]}</dd>
        <dt className="text-muted-foreground">{review.fields.factCurrency}</dt>
        <dd>{props.currencyName}</dd>
        {FACT_DATE_FIELDS[fact.kind].map((field) => (
          <div key={field} className="contents">
            <dt className="text-muted-foreground">{content.form.dates.labels[field]}</dt>
            <dd>
              {dateText(
                (fact as unknown as Readonly<Record<string, DateValue>>)[field] ?? {
                  status: 'NOT_PROVIDED',
                },
                content,
                props.localeTag,
              )}
            </dd>
          </div>
        ))}
        {props.periodName !== null && (
          <>
            <dt className="text-muted-foreground">{content.form.period.label}</dt>
            <dd>{props.periodName}</dd>
          </>
        )}
        {fact.note !== null && (
          <>
            <dt className="text-muted-foreground">{review.fields.note}</dt>
            <dd className="whitespace-pre-wrap">
              <bdi>{fact.note}</bdi>
            </dd>
          </>
        )}
      </dl>
      {props.needsAttention && (
        <p className="text-warning-strong bg-warning-soft flex items-start gap-2 rounded-md p-2 text-sm">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {content.overview.needsAttention}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={props.onEdit}
          aria-describedby={headingId}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <Pencil aria-hidden="true" />
          {content.item.edit}
        </button>
        <button
          type="button"
          onClick={props.onRemove}
          aria-describedby={headingId}
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          <Trash2 aria-hidden="true" />
          {content.item.remove}
        </button>
      </div>
    </li>
  );
}
