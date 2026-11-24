'use client';

import { CircleAlert, Info } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { amountExceedsCurrencyPrecision } from '@khums/core';
import type { ResultsContent } from '@/content/results/types';
import { formatMessage } from '@/i18n/format';
import type { ResultSummary, SummaryEntry, SummaryStop } from '@/results/view-model';

import { PrintResultsButton } from './print-results';

/** Labels from the rule pack, shown exactly as the pack states them. */
export function PackText({ children }: { readonly children: ReactNode }) {
  return (
    <span lang="en" dir="ltr">
      {children}
    </span>
  );
}

/**
 * The short summary above the breakdown (Phase 3 step 4, decision 73). Everything shown comes
 * from `summarizeResult` (the mapping and the engine result): the figure per category, or why it
 * was not calculated; the entries counted, deducted and left out; what stopped for scholar review
 * or needs an answer; and the exact rule pack. Figures are never added together here. Mock and
 * provisional results repeat their label in the summary, so it can never read as approved.
 */
export function ResultSummaryView(props: {
  readonly summary: ResultSummary;
  readonly content: ResultsContent;
  /** `MOCK`/`PROVISIONAL`: their label is repeated here; `APPROVED`: verified results. */
  readonly notice: 'MOCK' | 'PROVISIONAL' | 'APPROVED';
  /** Several per-category figures that must be read as separate (BLD-04). */
  readonly separate: boolean;
  readonly factName: (id: string | null) => string;
  readonly money: (amount: string, currency: string) => string;
  /** The currency of the entry amounts (the sheet's currency). */
  readonly currency: string;
  /** Shows the print button (provisional reports have their own report button). */
  readonly printable: boolean;
}) {
  const { summary, content, factName } = props;
  const s = content.summary;
  const headingId = useId();
  const partial =
    summary.calculated && !summary.completed && summary.figures.some((f) => f.value !== null);
  const entryList = (entries: readonly SummaryEntry[], empty: string, testId: string) =>
    entries.length === 0 ? (
      <p className="text-muted-foreground text-sm" data-testid={testId}>
        {empty}
      </p>
    ) : (
      <ul className="list-disc ps-5 text-sm" data-testid={testId}>
        {entries.map((entry) => (
          <li key={entry.factId}>
            {factName(entry.factId)}
            {entry.amount !== null && (
              <span className="tabular-nums">
                {' — '}
                {props.money(entry.amount, props.currency)}
              </span>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <section
      aria-labelledby={headingId}
      data-testid="result-summary"
      className="bg-card flex flex-col gap-4 rounded-lg border p-4 print:break-inside-avoid"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-lg font-semibold">
            {s.heading}
          </h2>
          <p className="text-muted-foreground text-sm">{s.description}</p>
        </div>
        {props.printable && (
          <PrintResultsButton label={content.print.button} hint={content.print.hint} />
        )}
      </div>

      {props.notice !== 'APPROVED' && (
        <p
          data-testid="summary-label"
          className={
            props.notice === 'MOCK'
              ? 'bg-mock text-mock-foreground border-mock-border rounded-md border px-3 py-2 text-sm font-semibold'
              : 'bg-provisional text-provisional-foreground border-provisional-border rounded-md border px-3 py-2 text-sm font-semibold'
          }
        >
          {props.notice === 'MOCK' ? content.mockLabel : content.provisionalLabel}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">{s.figuresHeading}</h3>
        {!summary.calculated || summary.figures.length === 0 ? (
          <p className="text-warning-strong flex items-start gap-2 text-sm font-medium">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {s.noFigures}
          </p>
        ) : (
          <>
            {partial && (
              <p className="text-warning-strong flex items-start gap-2 text-sm font-medium">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {content.outputs.partial}
              </p>
            )}
            {props.separate && (
              <p className="text-muted-foreground flex items-start gap-2 text-sm">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {content.outputs.separate}
              </p>
            )}
            <dl className="flex flex-col gap-2 text-sm" data-testid="summary-figures">
              {summary.figures.map((figure) => (
                <div key={figure.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <dt>
                    <PackText>{figure.label}</PackText>
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {figure.value === null ? (
                      <span className="text-warning-strong font-medium">
                        {figure.reasons.length > 0
                          ? formatMessage(s.notCalculatedBecause, {
                              reasons: figure.reasons.join('; '),
                            })
                          : s.notCalculatedSeeBelow}
                      </span>
                    ) : (
                      <>
                        {props.money(figure.value.amount, figure.value.currency)}
                        {amountExceedsCurrencyPrecision(
                          figure.value.amount,
                          figure.value.currency,
                        ) && (
                          // Audit BLD-05: shown exactly as calculated; never rounded silently.
                          <span className="text-muted-foreground block text-xs font-normal">
                            {content.outputs.exact}
                          </span>
                        )}
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>

      {summary.calculated && (
        <p className="text-muted-foreground text-sm" data-testid="summary-entries-note">
          {s.entriesNote}
        </p>
      )}
      {summary.calculated && (
        <div className="grid gap-4 sm:grid-cols-3">
          <section className="flex flex-col gap-1">
            <h3 className="font-semibold">{s.counted.heading}</h3>
            {entryList(summary.counted, s.counted.empty, 'summary-counted')}
          </section>
          <section className="flex flex-col gap-1">
            <h3 className="font-semibold">{s.deducted.heading}</h3>
            {entryList(summary.deducted, s.deducted.empty, 'summary-deducted')}
          </section>
          <section className="flex flex-col gap-1">
            <h3 className="font-semibold">{s.excluded.heading}</h3>
            {entryList(summary.excluded, s.excluded.empty, 'summary-excluded')}
          </section>
        </div>
      )}

      <section className="flex flex-col gap-1">
        <h3 className="font-semibold">{s.stops.heading}</h3>
        {summary.stops.length === 0 ? (
          <p className="text-muted-foreground text-sm" data-testid="summary-stops">
            {s.stops.empty}
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm" data-testid="summary-stops">
            {summary.stops.map((stop, index) => (
              <li key={index} className="flex items-start gap-2">
                <CircleAlert
                  aria-hidden="true"
                  className="text-warning-strong mt-0.5 size-4 shrink-0"
                />
                <span>
                  <StopText stop={stop} content={content} factName={factName} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-muted-foreground text-xs break-all" data-testid="summary-trace">
        {formatMessage(s.trace, {
          packId: summary.pack.packId,
          version: summary.pack.version,
          digest: summary.pack.contentDigest ?? s.noDigest,
        })}
      </p>
    </section>
  );
}

function StopText(props: {
  readonly stop: SummaryStop;
  readonly content: ResultsContent;
  readonly factName: (id: string | null) => string;
}) {
  const { stop, content } = props;
  const s = content.summary.stops;
  const entry = (factId: string | null) =>
    factId === null ? null : <span className="font-semibold">{props.factName(factId)}: </span>;
  switch (stop.kind) {
    case 'CONSULTATION':
      return (
        <>
          <span className="font-medium">{s.review}</span>
          {' — '}
          {entry(stop.factId)}
          <PackText>{stop.label}</PackText>
        </>
      );
    case 'CLARIFICATION': {
      const question =
        stop.reason === 'QUESTION_UNANSWERED' || stop.reason === 'QUESTION_ANSWER_INVALID';
      return (
        <>
          <span className="font-medium">{question ? s.answer : s.detail}</span>
          {' — '}
          {entry(stop.factId)}
          {question && stop.questionLabel !== null ? (
            <PackText>{stop.questionLabel}</PackText>
          ) : (
            content.clarifications.reasons[stop.reason]
          )}
        </>
      );
    }
    case 'UNSUPPORTED':
      return (
        <>
          <span className="font-medium">{s.unsupported}</span>
          {' — '}
          {entry(stop.factId)}
          {content.unsupported.codes[stop.code]}
        </>
      );
    case 'REFUSED':
      return (
        <>
          <span className="font-medium">{content.refused.heading}</span>
          {' — '}
          {content.refused.body}
        </>
      );
    case 'UNRESOLVED':
      return (
        <>
          <span className="font-medium">
            {stop.unresolved === 'CONSULTATION_REQUIRED' ? s.review : s.answer}
          </span>
          {' — '}
          <PackText>{stop.label}</PackText>
        </>
      );
  }
}
