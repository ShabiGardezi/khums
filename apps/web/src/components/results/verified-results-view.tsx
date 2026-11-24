'use client';

import { CircleAlert, History, ShieldCheck } from 'lucide-react';
import { useId, useMemo } from 'react';

import {
  checkPublicPackBundle,
  isSameSavedPack,
  noSavedAnswers,
  runVerifiedAssessment,
  type SavedPackRef,
  type VerifiedAssessmentRun,
} from '@khums/core';
import type { Answers, FactAnswers, FinancialFactSheet, YearAnswers } from '@khums/shared-types';
import { Alert, AlertDescription, AlertTitle } from '@khums/ui/components/alert';
import { buttonVariants } from '@khums/ui/components/button';

import type { FactsContent } from '@/content/facts/types';
import type { ResultsContent } from '@/content/results/types';
import { formatMessage } from '@/i18n/format';
import type { ReopenRequest } from '@/lib/reopen-request';
import type { VerifiedPackSource } from '@/results/calculation-source';
import {
  answersInEffect,
  answersKey,
  changeKeptAnswers,
  type AnswerSet,
  type KeptAnswers,
} from '@/results/kept-answers';

import { ResultsPanel } from './results-view';
import { defaultSavedLabel, SaveCalculation } from './save-calculation';

export interface VerifiedResultsViewProps {
  readonly marjaId: string;
  /** The verified pack as served by the API (checked again here before anything is shown). */
  readonly bundle: VerifiedPackSource;
  readonly sheet: FinancialFactSheet;
  readonly content: ResultsContent;
  readonly facts: FactsContent;
  readonly localeTag: string;
  readonly historyHref: string;
  /**
   * A calculation saved on this device that the person opened to edit or copy (decision 71). Its
   * answers are offered again only when it is reopened to edit and the current verified pack is
   * exactly the saved pack (id, version, digest); a copy for a new year never carries answers
   * (audit H-1, M-1). The pack version used now is compared with the saved one. Null for a new
   * calculation.
   */
  readonly reopened: ReopenRequest | null;
  /**
   * The person's answers, kept by the calculator so they survive leaving and returning to this
   * view (audit M-2). Keyed by Marja, assessment type and exact pack version.
   */
  readonly keptAnswers: KeptAnswers;
  readonly onKeptAnswersChange: (update: (kept: KeptAnswers) => KeptAnswers) => void;
  readonly onBack: () => void;
  readonly onEditFact: (factId: string) => void;
}

/**
 * Public results (decision 65): calculated in the browser from the in-memory entries with the
 * Marja's VERIFIED pack only (governed, published, activated, ready — the API checked the ledger),
 * re-checked here with `checkPublicPackBundle` (digest, engine readiness; no ledger is sent) and
 * calculated by `runVerifiedAssessment` in the engine's production
 * mode. Nothing is sent; the user may save the figures on this device (browser-only history).
 * If anything fails verification, no figure is shown at all.
 */
export function VerifiedResultsView(props: VerifiedResultsViewProps) {
  const { content, sheet, bundle } = props;
  const missed = sheet.context.workflow === 'missed-year';
  const verified = useMemo(
    () => checkPublicPackBundle(bundle.pack, bundle.summary),
    [bundle.pack, bundle.summary],
  );
  const reopened = props.reopened?.saved.marjaId === props.marjaId ? props.reopened : null;
  // The exact pack version these answers belong to (null when the bundle failed the re-check).
  const current = useMemo(
    () =>
      verified.ok
        ? {
            ref: {
              packId: verified.value.pack.metadata.packId,
              version: verified.value.pack.metadata.version,
              contentDigest: verified.value.activation.integrity.digest,
            } satisfies SavedPackRef,
            pack: verified.value.pack,
          }
        : null,
    [verified],
  );
  const key =
    current === null ? null : answersKey(props.marjaId, sheet.context.workflow, current.ref);
  const { keptAnswers, onKeptAnswersChange } = props;
  // The person's answers for this exact pack, else reusable saved answers, else none; always
  // only for questions the pack asks and entries and years now in the sheet.
  const inEffect: AnswerSet = useMemo(
    () =>
      current === null || key === null
        ? noSavedAnswers()
        : answersInEffect(keptAnswers, key, reopened, current, sheet),
    [current, key, keptAnswers, reopened, sheet],
  );
  const { answers, yearAnswers, factAnswers } = inEffect;
  const change = (update: (set: AnswerSet) => AnswerSet) => {
    if (key === null) return;
    onKeptAnswersChange((kept) => changeKeptAnswers(kept, key, inEffect, update));
  };
  const setAnswers = (update: (value: Answers) => Answers) => {
    change((set) => ({ ...set, answers: update(set.answers) }));
  };
  const setYearAnswers = (update: (value: YearAnswers) => YearAnswers) => {
    change((set) => ({ ...set, yearAnswers: update(set.yearAnswers) }));
  };
  const setFactAnswers = (update: (value: FactAnswers) => FactAnswers) => {
    change((set) => ({ ...set, factAnswers: update(set.factAnswers) }));
  };
  const run: VerifiedAssessmentRun = useMemo(
    () =>
      runVerifiedAssessment(
        sheet,
        bundle,
        missed ? {} : answers,
        factAnswers,
        missed ? yearAnswers : {},
      ),
    [sheet, bundle, missed, answers, factAnswers, yearAnswers],
  );

  if (
    !verified.ok ||
    verified.value.pack.metadata.marjaId !== props.marjaId ||
    run.kind === 'NOT_VERIFIED'
  ) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="warning">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{content.verified.notVerified.title}</AlertTitle>
          <AlertDescription>
            <p>{content.verified.notVerified.body}</p>
          </AlertDescription>
        </Alert>
        <BackButton label={content.back} onBack={props.onBack} />
      </div>
    );
  }
  const { pack, activation } = verified.value;

  return (
    <ResultsPanel
      pack={pack}
      sheet={sheet}
      content={content}
      facts={props.facts}
      localeTag={props.localeTag}
      onBack={props.onBack}
      onEditFact={props.onEditFact}
      run={run}
      context="VERIFIED"
      verifiedDisclaimer={content.verified.disclaimer}
      header={
        <>
          <VerifiedTrace
            content={content}
            packId={pack.metadata.packId}
            version={pack.metadata.version}
            digest={activation.integrity.digest}
            activatedAt={activation.activatedAt}
          />
          {reopened !== null && (
            <PackVersionNotice
              content={content.verified.reopened}
              saved={reopened.saved.rulePack}
              current={{
                packId: pack.metadata.packId,
                version: pack.metadata.version,
                contentDigest: activation.integrity.digest,
              }}
            />
          )}
        </>
      }
      answers={answers}
      onAnswersChange={setAnswers}
      yearAnswers={yearAnswers}
      onYearAnswersChange={setYearAnswers}
      factAnswers={factAnswers}
      onFactAnswersChange={setFactAnswers}
      footer={
        run.kind === 'CALCULATED' ? (
          <SaveCalculation
            // A new result (other answers) can be saved again.
            key={JSON.stringify([answers, factAnswers, yearAnswers])}
            report={run.report}
            marjaId={props.marjaId}
            sheet={sheet}
            answers={missed ? {} : answers}
            yearAnswers={missed ? yearAnswers : {}}
            factAnswers={factAnswers}
            defaultLabel={
              reopened?.mode === 'edit'
                ? reopened.saved.label
                : defaultSavedLabel(sheet, content.verified.save)
            }
            editing={reopened?.mode === 'edit'}
            content={content.verified.save}
            historyHref={props.historyHref}
            localeTag={props.localeTag}
          />
        ) : undefined
      }
    />
  );
}

function BackButton({ label, onBack }: { readonly label: string; readonly onBack: () => void }) {
  return (
    <div>
      <button type="button" onClick={onBack} className={buttonVariants({ variant: 'outline' })}>
        {label}
      </button>
    </div>
  );
}

/** The verified notice and the exact pack behind the figures (pack id, version, digest). */
function VerifiedTrace(props: {
  readonly content: ResultsContent;
  readonly packId: string;
  readonly version: string;
  readonly digest: string;
  readonly activatedAt: string;
}) {
  const { content } = props;
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <Alert variant="success">
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>{content.verified.noticeTitle}</AlertTitle>
        <AlertDescription>
          <p>{content.verified.noticeBody}</p>
        </AlertDescription>
      </Alert>
      <div className="rounded-lg border p-4 text-sm">
        <h2 id={headingId} className="font-semibold">
          {content.verified.traceHeading}
        </h2>
        <p className="text-muted-foreground">{content.verified.traceDescription}</p>
        <dl
          className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1"
          data-testid="verified-pack-trace"
        >
          <dt className="text-muted-foreground">{content.details.pack}</dt>
          <dd dir="ltr" className="text-start font-mono">
            {props.packId}
          </dd>
          <dt className="text-muted-foreground">{content.details.version}</dt>
          <dd dir="ltr" className="text-start font-mono">
            {props.version}
          </dd>
          <dt className="text-muted-foreground">{content.details.digest}</dt>
          <dd dir="ltr" className="text-start font-mono break-all">
            {props.digest}
          </dd>
          <dt className="text-muted-foreground">{content.verified.activatedAt}</dt>
          <dd dir="ltr" className="text-start font-mono">
            {props.activatedAt}
          </dd>
        </dl>
      </div>
    </section>
  );
}

/**
 * Decision 71: when a saved calculation is recalculated, which pack version the new figures use,
 * and a clear warning when it is not the one the saved figures used.
 */
function PackVersionNotice(props: {
  readonly content: ResultsContent['verified']['reopened'];
  readonly saved: {
    readonly packId: string;
    readonly version: string;
    readonly contentDigest: string;
  };
  readonly current: {
    readonly packId: string;
    readonly version: string;
    readonly contentDigest: string;
  };
}) {
  const { content, saved, current } = props;
  const same = isSameSavedPack(saved, current);
  return (
    <Alert
      variant={same ? 'info' : 'warning'}
      data-testid="pack-version-notice"
      data-changed={!same}
    >
      <History aria-hidden="true" />
      <AlertTitle>{same ? content.sameTitle : content.changedTitle}</AlertTitle>
      <AlertDescription>
        <p>
          {same
            ? formatMessage(content.same, { packId: current.packId, version: current.version })
            : formatMessage(content.changed, {
                packId: current.packId,
                version: current.version,
                savedPackId: saved.packId,
                savedVersion: saved.version,
              })}
        </p>
        {/* Audit H-1: saved answers are never reused with another pack version. */}
        {!same && <p className="font-medium">{content.answersCleared}</p>}
      </AlertDescription>
    </Alert>
  );
}
