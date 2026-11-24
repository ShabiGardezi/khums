'use client';

import { HardDrive } from 'lucide-react';
import Link from 'next/link';
import { useId, useMemo, useRef, useState, useSyncExternalStore, type SubmitEvent } from 'react';

import {
  MAX_SAVED_CALCULATIONS,
  MAX_SAVED_LABEL_LENGTH,
  savedCalculationFromReport,
} from '@khums/core';
import type {
  Answers,
  CalculationReport,
  FactAnswers,
  FinancialFactSheet,
  YearAnswers,
} from '@khums/shared-types';
import { buttonVariants } from '@khums/ui/components/button';
import { Field } from '@khums/ui/components/field';
import { Input } from '@khums/ui/components/input';

import type { ResultsContent } from '@/content/results/types';
import { formatMessage } from '@/i18n/format';
import {
  browserStorage,
  historyFromSnapshot,
  historySnapshot,
  historyWarnings,
  saveCalculation,
  subscribeHistory,
} from '@/lib/history-storage';

type SaveContent = ResultsContent['verified']['save'];

const readSnapshot = () => historySnapshot();
/** On the server nothing is read: storage is browser-only. */
const serverSnapshot = () => null;

/** The suggested name, from the assessment dates (the person can change it). */
export function defaultSavedLabel(sheet: FinancialFactSheet, content: SaveContent): string {
  const { context } = sheet;
  return context.workflow === 'annual'
    ? formatMessage(content.defaultAnnual, { start: context.period.start, end: context.period.end })
    : formatMessage(content.defaultDated, { date: context.assessmentDate });
}

/**
 * Opt-in "save this calculation on this device" (owner decisions 2026-11-23 and 2026-11-24;
 * decisions 65 and 71). Nothing is saved until the person taps Save. Only verified results can be
 * saved (`savedCalculationFromReport` refuses anything else). The entry (name, entries, answers,
 * figures, pack trace) goes to this browser's storage only: never to a server, a log or a URL.
 * Saving always creates a new saved calculation, so a reopened one is never overwritten.
 * Before Save, the person is told when the save will remove unreadable stored data or, at the
 * limit, the oldest saved calculation (audit M-3, L-5).
 */
export function SaveCalculation(props: {
  readonly report: CalculationReport;
  readonly marjaId: string;
  readonly sheet: FinancialFactSheet;
  readonly answers: Answers;
  readonly yearAnswers: YearAnswers;
  readonly factAnswers: FactAnswers;
  readonly defaultLabel: string;
  /** A saved calculation was opened for editing (saving keeps it and adds a new one). */
  readonly editing: boolean;
  readonly content: SaveContent;
  readonly historyHref: string;
  readonly localeTag: string;
}) {
  const { content } = props;
  const [name, setName] = useState(props.defaultLabel);
  const [state, setState] = useState<'IDLE' | 'SAVED' | 'FAILED' | 'FULL' | 'NAME' | 'NOT_SAVABLE'>(
    'IDLE',
  );
  const snapshot = useSyncExternalStore(subscribeHistory, readSnapshot, serverSnapshot);
  const warnings = useMemo(
    () => (snapshot === null ? null : historyWarnings(historyFromSnapshot(snapshot))),
    [snapshot],
  );
  const headingId = useId();
  const input = useRef<HTMLInputElement>(null);
  const save = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const label = name.trim();
    if (label === '' || label.length > MAX_SAVED_LABEL_LENGTH) {
      setState('NAME');
      input.current?.focus();
      return;
    }
    const entry = savedCalculationFromReport(props.report, {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      marjaId: props.marjaId,
      label,
      sheet: props.sheet,
      answers: props.answers,
      yearAnswers: props.yearAnswers,
      factAnswers: props.factAnswers,
    });
    // Null: this result is not one that can be saved (not a verified result for these entries).
    setState(entry === null ? 'NOT_SAVABLE' : saveCalculation(browserStorage(), entry));
  };
  const message =
    state === 'SAVED'
      ? props.editing
        ? `${content.saved} ${content.editNote}`
        : content.saved
      : state === 'FAILED'
        ? content.failed
        : state === 'FULL'
          ? content.full
          : state === 'NOT_SAVABLE'
            ? content.notSavable
            : null;
  const oldest = warnings?.dropsOldest ?? null;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border p-4 text-sm print:hidden"
    >
      <h2 id={headingId} className="flex items-center gap-2 font-semibold">
        <HardDrive aria-hidden="true" className="size-4" />
        {content.heading}
      </h2>
      <p className="text-muted-foreground">{content.description}</p>
      <p className="text-warning-strong font-medium">{content.privacy}</p>
      {state !== 'SAVED' && warnings?.unreadable === true && (
        <p className="text-warning-strong font-medium" data-testid="save-unreadable-warning">
          {content.unreadableWarning}
        </p>
      )}
      {state !== 'SAVED' && oldest !== null && (
        <p className="text-warning-strong font-medium" data-testid="save-cap-warning">
          {formatMessage(content.capWarning, {
            max: new Intl.NumberFormat(props.localeTag).format(MAX_SAVED_CALCULATIONS),
            date: new Intl.DateTimeFormat(props.localeTag, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(oldest.savedAt)),
          })}
        </p>
      )}
      <form onSubmit={save} noValidate className="flex flex-col gap-3">
        <Field
          label={content.name.label}
          description={content.name.description}
          error={state === 'NAME' ? content.name.required : undefined}
          required
          className="max-w-md"
        >
          <Input
            ref={input}
            value={name}
            maxLength={MAX_SAVED_LABEL_LENGTH}
            disabled={state === 'SAVED'}
            onChange={(event) => {
              setName(event.target.value);
              if (state === 'NAME') setState('IDLE');
            }}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={state === 'SAVED'}
            className={buttonVariants({ variant: 'outline' })}
          >
            {content.button}
          </button>
          <p
            role="status"
            className={
              state === 'FAILED' || state === 'FULL' || state === 'NOT_SAVABLE'
                ? 'text-destructive-strong'
                : undefined
            }
          >
            {message}
          </p>
          {(state === 'SAVED' || state === 'FULL') && (
            <Link href={props.historyHref} className="underline underline-offset-4">
              {content.viewHistory}
            </Link>
          )}
        </div>
      </form>
    </section>
  );
}
