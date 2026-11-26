'use client';

import { CircleAlert, CircleCheck, Info, MessageSquareWarning } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';

import {
  amountExceedsCurrencyPrecision,
  formatFactAmount,
  isReservedBuilderPackId,
  runDevelopmentAssessment,
  type AssessmentRun,
} from '@khums/core';
import type {
  Answers,
  AssessmentResult,
  BreakdownStep,
  CalculationReport,
  FactAnswers,
  FinancialFact,
  FinancialFactSheet,
  MappingResult,
  MissedYearAggregate,
  QuestionDefinition,
  RulePack,
  YearAnswers,
} from '@khums/shared-types';
import { Alert, AlertDescription, AlertTitle } from '@khums/ui/components/alert';
import { buttonVariants } from '@khums/ui/components/button';
import { MockCalculationNotice } from '@khums/ui/components/mock-calculation-notice';
import { ProvisionalCalculationNotice } from '@khums/ui/components/provisional-calculation-notice';

import type { FactsContent } from '@/content/facts/types';
import type { ResultsContent } from '@/content/results/types';
import { formatMessage } from '@/i18n/format';
import {
  assessmentQuestions,
  citedRules,
  citedSources,
  labelOf,
  resultLabel,
  summarizeResult,
} from '@/results/view-model';

import { RESULTS_PRINT_ATTRIBUTE } from './print-results';
import { PackText, ResultSummaryView } from './result-summary';
import { RuleStatusFor } from './rule-status-context';

/** A pack answer (`Answers` values). */
type AnswerValue = boolean | string;

export interface ResultsViewProps {
  /** The pack chosen by the SERVER for this operational state (development: mock only). */
  readonly pack: RulePack;
  readonly sheet: FinancialFactSheet;
  readonly content: ResultsContent;
  readonly facts: FactsContent;
  readonly localeTag: string;
  readonly onBack: () => void;
  readonly onEditFact: (factId: string) => void;
}

/**
 * Results dashboard (M4.5.1), development flow: calculates in the browser from the in-memory
 * entries with the server-provided MOCK pack only; nothing is sent or stored.
 */
export function ResultsView(props: ResultsViewProps) {
  const { pack, sheet, content } = props;
  const [answers, setAnswers] = useState<Answers>({});
  const [yearAnswers, setYearAnswers] = useState<YearAnswers>({});
  const [factAnswers, setFactAnswers] = useState<FactAnswers>({});
  // Decision 62: missed years use only each year's own answers; other workflows only shared ones.
  const missed = sheet.context.workflow === 'missed-year';
  const run: AssessmentRun = useMemo(
    () =>
      runDevelopmentAssessment(
        sheet,
        pack,
        missed ? {} : answers,
        factAnswers,
        missed ? yearAnswers : {},
      ),
    [sheet, pack, missed, answers, factAnswers, yearAnswers],
  );
  if (run.kind === 'NOT_A_DEVELOPMENT_PACK') {
    return <p className="text-sm">{content.unavailable}</p>;
  }
  return (
    <ResultsPanel
      {...props}
      run={run}
      context="MOCK"
      answers={answers}
      onAnswersChange={setAnswers}
      yearAnswers={yearAnswers}
      onYearAnswersChange={setYearAnswers}
      factAnswers={factAnswers}
      onFactAnswersChange={setFactAnswers}
    />
  );
}

/**
 * What the panel shows: an engine run, or (provisional flow) a mapped input waiting for the
 * scholar to run the calculation on the API.
 */
export type PanelRun =
  | Exclude<AssessmentRun, { readonly kind: 'NOT_A_DEVELOPMENT_PACK' }>
  | { readonly kind: 'READY'; readonly mapping: MappingResult };

export interface ResultsPanelProps extends ResultsViewProps {
  readonly run: PanelRun;
  /**
   * Which track this panel belongs to. `PROVISIONAL` always shows the PROVISIONAL — FOR SCHOLAR
   * REVIEW ONLY notice (provisional results are never shown as approved or mock); `MOCK` shows the
   * notice the result itself calls for (MOCK unless an approved production result); `VERIFIED`
   * (decision 65, public calculator) is used only with a run of `runVerifiedAssessment`, whose
   * results are always approved production results: no mock or provisional notice, the verified
   * notice and trace come in `header`, and the verified disclaimer is always shown.
   */
  readonly context: 'MOCK' | 'PROVISIONAL' | 'VERIFIED';
  /** Shown after the notice and disclaimer (decision 65: the verified notice and pack trace). */
  readonly header?: ReactNode;
  /** The standing disclaimer shown with every verified result (`VERIFIED` context only). */
  readonly verifiedDisclaimer?: string;
  readonly answers: Answers;
  readonly onAnswersChange: (update: (current: Answers) => Answers) => void;
  /** Missed years (decision 62): each year's own answers, keyed by period id. */
  readonly yearAnswers: YearAnswers;
  readonly onYearAnswersChange: (update: (current: YearAnswers) => YearAnswers) => void;
  readonly factAnswers: FactAnswers;
  readonly onFactAnswersChange: (update: (current: FactAnswers) => FactAnswers) => void;
  /** Shown under the status line (e.g. the provisional calculate button, loading and errors). */
  readonly actions?: ReactNode;
  /** Shown after the results (e.g. feedback and the review report). */
  readonly footer?: ReactNode;
}

/**
 * The results body shared by the development and the provisional flows: the notice first, then
 * the status, the figures, the step-by-step breakdown with the rules and sources each step cites,
 * the questions, the mapping trace and the technical details. Figures, steps, rules and sources
 * come only from the engine result and the pack it used.
 */
export function ResultsPanel(props: ResultsPanelProps) {
  const { pack, sheet, content, facts, localeTag, run } = props;
  const baseId = useId();
  const answers = props.answers;
  const factAnswers = props.factAnswers;
  const setAnswers = props.onAnswersChange;
  const setFactAnswers = props.onFactAnswersChange;
  const factName = (id: string | null) => {
    const fact = sheet.facts.find((f) => f.id === id);
    return fact === undefined ? (id ?? '') : displayName(fact, facts);
  };
  const money = (amount: string, currency: string) =>
    formatFactAmount(amount, currency, localeTag) ?? `${amount} ${currency}`;

  const questions = assessmentQuestions(pack);
  const sheetContext = sheet.context;
  // Decision 62: a missed-year sheet asks every question once per year, and each year's answers
  // are kept and sent separately; nothing is copied from one year to another.
  const questionBlock =
    sheetContext.workflow === 'missed-year' ? (
      <>
        {sheetContext.periods.map((period) => (
          <QuestionsSection
            key={period.id}
            content={content}
            questions={questions}
            heading={formatMessage(content.questions.yearHeading, {
              start: period.start,
              end: period.end,
            })}
            description={content.questions.yearDescription}
            answers={
              Object.hasOwn(props.yearAnswers, period.id)
                ? (props.yearAnswers[period.id] ?? {})
                : {}
            }
            onAnswer={(id, value) => {
              props.onYearAnswersChange((current) => ({
                ...current,
                [period.id]: withAnswer(
                  Object.hasOwn(current, period.id) ? (current[period.id] ?? {}) : {},
                  id,
                  value,
                ),
              }));
            }}
          />
        ))}
      </>
    ) : (
      <QuestionsSection
        content={content}
        questions={questions}
        answers={answers}
        onAnswer={(id, value) => {
          setAnswers((current) => withAnswer(current, id, value));
        }}
      />
    );
  const factQuestionBlock = (
    <FactQuestions
      mapping={run.mapping}
      pack={pack}
      content={content}
      sheet={sheet}
      factName={factName}
      factAnswers={factAnswers}
      onFactAnswer={(fact, questionId, value) => {
        setFactAnswers((current) => ({
          ...current,
          [fact.id]: {
            workflow: sheet.context.workflow,
            kind: fact.kind,
            subtype: fact.subtype,
            answers: withAnswer(current[fact.id]?.answers ?? {}, questionId, value),
          },
        }));
      }}
    />
  );

  // Provisional panels always carry the provisional notice; otherwise the result decides (MOCK
  // unless an approved production result), and anything not calculated keeps the MOCK notice.
  const notice =
    props.context === 'PROVISIONAL'
      ? 'PROVISIONAL'
      : run.kind === 'CALCULATED'
        ? resultLabel(run.report)
        : props.context === 'VERIFIED'
          ? 'APPROVED'
          : 'MOCK';

  // Phase 3 step 4: the short summary, only from what the mapping and the engine returned.
  const report = run.kind === 'CALCULATED' ? run.report : null;
  const summary =
    run.kind === 'READY'
      ? null
      : summarizeResult(pack, run.mapping, report, run.kind === 'REFUSED' ? run.refusal : null);
  const summaryOutputs =
    report === null
      ? 0
      : report.workflow === 'missed-year'
        ? (report.aggregate?.outputs.length ?? 0)
        : report.result.outputs.length;

  return (
    <div className="flex flex-col gap-6" {...{ [RESULTS_PRINT_ATTRIBUTE]: '' }}>
      {/* Shown first and whatever the outcome: no figure may appear without it. */}
      {notice === 'APPROVED' ? null : notice === 'PROVISIONAL' ? (
        <ProvisionalCalculationNotice
          label={content.provisionalLabel}
          ariaLabel={content.provisionalNoticeAriaLabel}
        >
          {content.provisionalExplanation}
        </ProvisionalCalculationNotice>
      ) : (
        <MockCalculationNotice label={content.mockLabel} ariaLabel={content.noticeAriaLabel}>
          {content.mockExplanation}
        </MockCalculationNotice>
      )}

      {run.kind === 'CALCULATED' &&
        (run.report.meta.disclaimer !== null || props.context === 'VERIFIED') && (
          // CLAUDE.md: always show `meta.disclaimer` with a development or provisional result,
          // verbatim (audit T6); a verified result (decision 65) shows its own disclaimer too.
          <section aria-labelledby={`${baseId}-disclaimer`} className="text-sm">
            <h2 id={`${baseId}-disclaimer`} className="font-semibold">
              {content.disclaimerHeading}
            </h2>
            {run.report.meta.disclaimer !== null && (
              <p data-testid="result-disclaimer">
                <PackText>{run.report.meta.disclaimer}</PackText>
              </p>
            )}
            {props.context === 'VERIFIED' && props.verifiedDisclaimer !== undefined && (
              <p data-testid="verified-disclaimer">{props.verifiedDisclaimer}</p>
            )}
          </section>
        )}
      {props.context !== 'PROVISIONAL' && (
        // Printed only: the person takes the printout to their Marja's representative themselves.
        <p data-testid="print-review-note" className="hidden text-sm print:block">
          {content.print.reviewNote}
        </p>
      )}
      {props.header}
      <StatusLine run={run} content={content} provisional={props.context === 'PROVISIONAL'} />
      {props.actions}
      {summary !== null && (
        <ResultSummaryView
          summary={summary}
          content={content}
          notice={notice}
          separate={isReservedBuilderPackId(pack.metadata.packId) && summaryOutputs > 1}
          factName={factName}
          money={money}
          currency={sheet.currency}
          // Provisional reports keep their own report (print) button.
          printable={props.context !== 'PROVISIONAL'}
        />
      )}

      {run.kind === 'CALCULATED' ? (
        <>
          {run.report.workflow === 'missed-year' ? (
            <section aria-labelledby={`${baseId}-years`} className="flex flex-col gap-4">
              <h2 id={`${baseId}-years`} className="text-lg font-semibold">
                {content.years.heading}
              </h2>
              {run.report.aggregate !== null && (
                <Outputs
                  level={3}
                  heading={content.years.aggregate}
                  outputs={run.report.aggregate.outputs}
                  content={content}
                  money={money}
                  caution={aggregateCaution(run.report.aggregate, content)}
                />
              )}
              {run.report.years.map((year) => (
                <section
                  key={year.period.start}
                  className="flex flex-col gap-3 rounded-lg border p-4"
                >
                  <h3 className="font-semibold">
                    {formatMessage(content.years.period, {
                      start: year.period.start,
                      end: year.period.end,
                    })}
                  </h3>
                  <ResultBody
                    level={4}
                    result={year.result}
                    report={run.report}
                    pack={pack}
                    content={content}
                    money={money}
                  />
                </section>
              ))}
            </section>
          ) : (
            <ResultBody
              level={2}
              result={run.report.result}
              report={run.report}
              pack={pack}
              content={content}
              money={money}
            />
          )}
          {factQuestionBlock}
          {questionBlock}
          <MappingTrace mapping={run.mapping} pack={pack} content={content} factName={factName} />
          <TechnicalDetails report={run.report} content={content} />
        </>
      ) : (
        <>
          <NeedsInput
            mapping={run.mapping}
            pack={pack}
            content={content}
            sheet={sheet}
            factName={factName}
            onEditFact={props.onEditFact}
          />
          {run.kind === 'REFUSED' && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>{content.refused.heading}</AlertTitle>
              <AlertDescription>
                <p>{content.refused.body}</p>
              </AlertDescription>
            </Alert>
          )}
          {factQuestionBlock}
          {questionBlock}
          <MappingTrace mapping={run.mapping} pack={pack} content={content} factName={factName} />
        </>
      )}

      {props.footer}

      <div className="print:hidden">
        <button
          type="button"
          onClick={props.onBack}
          className={buttonVariants({ variant: 'outline' })}
        >
          {content.back}
        </button>
      </div>
    </div>
  );
}

function withAnswer(current: Answers, id: string, value: AnswerValue | null): Answers {
  const { [id]: _removed, ...rest } = current;
  return value === null ? rest : { ...rest, [id]: value };
}

function displayName(fact: FinancialFact, facts: FactsContent): string {
  if (fact.label !== null && fact.label.trim() !== '') return fact.label;
  const subtype = (facts.subtypes[fact.kind] as Readonly<Record<string, string>>)[fact.subtype];
  return `${facts.kinds[fact.kind].label} · ${subtype ?? fact.subtype}`;
}

function StatusLine({
  run,
  content,
  provisional,
}: {
  readonly run: PanelRun;
  readonly content: ResultsContent;
  readonly provisional: boolean;
}) {
  const resolved = run.kind === 'CALCULATED' && isCompleted(run.report);
  // A provisional result is never styled as a success (audit T6): neutral, with its own wording.
  const completed = resolved && !provisional;
  const text =
    run.kind === 'CALCULATED'
      ? resolved
        ? provisional
          ? content.status.provisionalCompleted
          : content.status.completed
        : content.status.unresolved
      : run.kind === 'REFUSED'
        ? content.status.refused
        : run.kind === 'READY'
          ? content.status.ready
          : content.status.needsInput;
  return (
    <p
      role="status"
      className={
        completed
          ? 'text-success-strong flex items-start gap-2 font-medium'
          : resolved
            ? 'text-foreground flex items-start gap-2 font-medium'
            : 'text-warning-strong flex items-start gap-2 font-medium'
      }
    >
      {completed ? (
        <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      ) : resolved ? (
        <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      ) : (
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      )}
      {text}
    </p>
  );
}

/** The completeness sentence of a missed-year total (engine 0.2.0; audit C5/T2). */
const aggregateCaution = (aggregate: MissedYearAggregate, content: ResultsContent): string =>
  formatMessage(content.years.completeness[aggregate.completeness], {
    count: aggregate.openYearIndexes.length,
  });

/** Audit T2: figures shown next to open items are partial, never the complete amount due. */
const partialCaution = (result: AssessmentResult, content: ResultsContent): string | null =>
  result.status !== 'COMPLETED' && result.outputs.some((o) => o.value !== null)
    ? content.outputs.partial
    : null;

const isCompleted = (report: CalculationReport) =>
  report.workflow === 'missed-year'
    ? report.aggregate?.status === 'COMPLETED' &&
      report.years.every((y) => y.result.status === 'COMPLETED')
    : report.result.status === 'COMPLETED';

type HeadingLevel = 2 | 3 | 4;

function Heading(props: { readonly level: HeadingLevel; readonly children: ReactNode }) {
  const Tag = `h${props.level}` as const;
  return (
    <Tag className={props.level === 2 ? 'text-lg font-semibold' : 'font-semibold'}>
      {props.children}
    </Tag>
  );
}

function Outputs(props: {
  readonly level: HeadingLevel;
  readonly heading: string;
  readonly outputs: AssessmentResult['outputs'];
  readonly content: ResultsContent;
  readonly money: (amount: string, currency: string) => string;
  /** Audit T2: a sentence shown before the figures when they are not the complete amount due. */
  readonly caution?: string | null;
  /** Audit BLD-04: the figures are per category and never added together. */
  readonly separate?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <Heading level={props.level}>{props.heading}</Heading>
      {props.caution !== undefined && props.caution !== null && (
        <p
          data-testid="partial-caution"
          className="text-warning-strong flex items-start gap-2 text-sm font-medium"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {props.caution}
        </p>
      )}
      {props.separate === true && (
        <p
          data-testid="separate-figures"
          className="text-muted-foreground flex items-start gap-2 text-sm"
        >
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {props.content.outputs.separate}
        </p>
      )}
      <dl className="grid gap-3 sm:grid-cols-2">
        {props.outputs.map((output) => (
          <div key={output.id} className="bg-card rounded-lg border p-4 print:break-inside-avoid">
            <dt className="text-muted-foreground text-sm">
              <PackText>{output.label}</PackText>
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {output.value === null ? (
                <span className="text-warning-strong text-base">
                  {props.content.outputs.notCalculated}
                </span>
              ) : (
                <>
                  {props.money(output.value.amount, output.value.currency)}
                  {amountExceedsCurrencyPrecision(output.value.amount, output.value.currency) && (
                    // Audit BLD-05: shown exactly as calculated; never rounded silently.
                    <span
                      data-testid="exact-amount"
                      className="text-muted-foreground block text-xs font-normal"
                    >
                      {props.content.outputs.exact}
                    </span>
                  )}
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ResultBody(props: {
  readonly level: HeadingLevel;
  readonly result: AssessmentResult;
  readonly report: CalculationReport;
  readonly pack: RulePack;
  readonly content: ResultsContent;
  readonly money: (amount: string, currency: string) => string;
}) {
  const { result, report, pack, content } = props;
  return (
    <div className="flex flex-col gap-6">
      <Outputs
        level={props.level}
        heading={content.outputs.heading}
        outputs={result.outputs}
        content={content}
        money={props.money}
        caution={partialCaution(result, content)}
        // Builder packs: one figure per Khums category, no combined total (BLD-04).
        separate={isReservedBuilderPackId(pack.metadata.packId) && result.outputs.length > 1}
      />
      <section className="flex flex-col gap-3">
        <Heading level={props.level}>{content.breakdown.heading}</Heading>
        <p className="text-muted-foreground text-sm">{content.breakdown.description}</p>
        <ol className="flex flex-col gap-3">
          {result.breakdown.map((step, index) => (
            <StepItem
              key={step.stepId}
              index={index + 1}
              step={step}
              currency={report.meta.currency}
              pack={pack}
              content={content}
              money={props.money}
            />
          ))}
        </ol>
      </section>
      {result.unresolved.length > 0 && (
        <section className="flex flex-col gap-3">
          <Heading level={props.level}>{content.unresolved.heading}</Heading>
          <ul className="flex flex-col gap-2">
            {result.unresolved.map((item) => (
              <li
                key={item.id}
                className="border-warning/60 bg-warning-soft rounded-md border p-3 text-sm"
              >
                <p className="font-semibold">
                  {item.kind === 'CONSULTATION_REQUIRED'
                    ? content.unresolved.consultation
                    : content.unresolved.missingAnswer}
                  {': '}
                  <PackText>{item.label}</PackText>
                </p>
                {item.kind === 'CONSULTATION_REQUIRED' && (
                  <p>{content.unresolved.consultationHelp}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StepItem(props: {
  readonly index: number;
  readonly step: BreakdownStep;
  readonly currency: string;
  readonly pack: RulePack;
  readonly content: ResultsContent;
  readonly money: (amount: string, currency: string) => string;
}) {
  const { step, content, pack } = props;
  const rules = citedRules(pack, step.ruleIds);
  const sources = citedSources(pack, step.sourceRefs);
  return (
    <li className="bg-card flex flex-col gap-2 rounded-lg border p-4 print:break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          <span className="text-muted-foreground me-2 tabular-nums">{props.index}.</span>
          <PackText>{step.label}</PackText>
        </p>
        <p className="font-semibold tabular-nums">
          <span className="sr-only">{content.breakdown.value}: </span>
          {step.value === null ? (
            <span className="text-warning-strong">{content.breakdown.unresolvedMarker}</span>
          ) : step.kind === 'money' ? (
            props.money(step.value, props.currency)
          ) : (
            <span dir="ltr">{step.value}</span>
          )}
        </p>
      </div>
      {step.rounding !== null && (
        <p className="text-muted-foreground text-xs">
          {formatMessage(content.breakdown.rounding, {
            scale: step.rounding.scale,
            mode: step.rounding.mode,
          })}
        </p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">
          {content.breakdown.rules} ({rules.length}) · {content.breakdown.sources} ({sources.length}
          )
        </summary>
        <div className="mt-2 flex flex-col gap-2 ps-4">
          <ul className="list-disc ps-4">
            {rules.map((rule) => (
              <li key={rule.id}>
                <PackText>
                  <code>{rule.id}</code> — {rule.summary} ({rule.status})
                </PackText>{' '}
                <RuleStatusFor ruleId={rule.id} />
                {rule.rulings.length > 0 && (
                  <ul className="text-muted-foreground mt-1 flex flex-col gap-1 ps-4 text-xs">
                    {rule.rulings.map((ruling) => (
                      <li key={ruling.ref}>
                        {ruling.snapshot === null ? (
                          formatMessage(content.breakdown.rulingNoSnapshot, { ruling: ruling.ref })
                        ) : (
                          <>
                            <span dir="auto">
                              {formatMessage(content.breakdown.ruling, {
                                ruling: ruling.snapshot.displayRef,
                                version: String(ruling.snapshot.version),
                                state: ruling.snapshot.state,
                              })}
                            </span>
                            <br />
                            <span dir="auto">
                              {formatMessage(content.breakdown.rulingFindings, {
                                findings: ruling.snapshot.findings.join('; '),
                              })}
                            </span>
                            <br />
                            <span dir="auto">
                              {formatMessage(content.breakdown.rulingPassages, {
                                passages: ruling.snapshot.passages.join('; '),
                              })}
                            </span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <ul className="list-disc ps-4">
            {sources.map((source) => (
              <li key={source.id}>
                <PackText>
                  {source.title}
                  {source.locator === null ? '' : `, ${source.locator}`}
                </PackText>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </li>
  );
}

function QuestionsSection(props: {
  readonly content: ResultsContent;
  readonly questions: readonly QuestionDefinition[];
  /** Defaults to the general questions heading (missed years: one heading per year). */
  readonly heading?: string;
  readonly description?: string;
  readonly answers: Answers;
  readonly onAnswer: (id: string, value: AnswerValue | null) => void;
}) {
  const { content } = props;
  const headingId = useId();
  if (props.questions.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-lg font-semibold">
        {props.heading ?? content.questions.heading}
      </h2>
      <p className="text-muted-foreground text-sm">
        {props.description ?? content.questions.description}
      </p>
      {props.questions.map((question) => (
        <QuestionField
          key={question.id}
          question={question}
          legend={<PackText>{question.label}</PackText>}
          value={props.answers[question.id] ?? null}
          content={content}
          onChange={(value) => {
            props.onAnswer(question.id, value);
          }}
        />
      ))}
    </section>
  );
}

function QuestionField(props: {
  readonly question: QuestionDefinition;
  readonly legend: ReactNode;
  readonly value: AnswerValue | null;
  readonly content: ResultsContent;
  readonly onChange: (value: AnswerValue | null) => void;
}) {
  const name = useId();
  const { question, content } = props;
  const options: readonly { readonly value: AnswerValue | null; readonly label: ReactNode }[] =
    question.kind === 'boolean'
      ? [
          { value: null, label: content.questions.notAnswered },
          { value: true, label: content.questions.yes },
          { value: false, label: content.questions.no },
        ]
      : [
          { value: null, label: content.questions.notAnswered },
          ...question.choices.map((choice) => ({
            value: choice,
            label: <PackText>{choice}</PackText>,
          })),
        ];
  return (
    <fieldset className="bg-card flex flex-col gap-2 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">{props.legend}</legend>
      <div className="flex flex-wrap gap-4">
        {options.map((option) => (
          <label key={String(option.value)} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={name}
              checked={props.value === option.value}
              onChange={() => {
                props.onChange(option.value);
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Per-entry questions. Unanswered ones come from clarifications, answered ones from the trace,
 * so an answered question stays visible and can be changed.
 */
function FactQuestions(props: {
  readonly mapping: MappingResult;
  readonly pack: RulePack;
  readonly content: ResultsContent;
  readonly sheet: FinancialFactSheet;
  readonly factName: (id: string | null) => string;
  readonly factAnswers: FactAnswers;
  readonly onFactAnswer: (
    fact: FinancialFact,
    questionId: string,
    value: AnswerValue | null,
  ) => void;
}) {
  const { mapping, content, pack } = props;
  const pairs = [
    ...mapping.clarifications.flatMap((c) =>
      c.questionId === null ? [] : [{ factId: c.factId, questionId: c.questionId }],
    ),
    ...mapping.trace.flatMap((line) =>
      line.answeredQuestionIds.map((questionId) => ({ factId: line.factId, questionId })),
    ),
    ...Object.entries(props.factAnswers).flatMap(([factId, entry]) =>
      Object.keys(entry.answers).map((questionId) => ({ factId, questionId })),
    ),
  ].filter(
    (p, i, all) =>
      all.findIndex((q) => q.factId === p.factId && q.questionId === p.questionId) === i,
  );
  if (pairs.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{content.questions.factHeading}</h2>
      {pairs.map(({ factId, questionId }) => {
        const fact = props.sheet.facts.find((f) => f.id === factId);
        const question = pack.questions.find((q) => q.id === questionId);
        if (fact === undefined || question === undefined) return null;
        return (
          <QuestionField
            key={`${factId}-${questionId}`}
            question={question}
            legend={
              <>
                {formatMessage(content.questions.factQuestion, { fact: props.factName(fact.id) })}
                {': '}
                <PackText>{question.label}</PackText>
              </>
            }
            value={props.factAnswers[fact.id]?.answers[question.id] ?? null}
            content={content}
            onChange={(value) => {
              props.onFactAnswer(fact, question.id, value);
            }}
          />
        );
      })}
    </section>
  );
}

function NeedsInput(props: {
  readonly mapping: MappingResult;
  readonly pack: RulePack;
  readonly content: ResultsContent;
  readonly sheet: FinancialFactSheet;
  readonly factName: (id: string | null) => string;
  readonly onEditFact: (factId: string) => void;
}) {
  const { mapping, content, pack } = props;
  const otherClarifications = mapping.clarifications.filter((c) => c.questionId === null);
  return (
    <div className="flex flex-col gap-6">
      {otherClarifications.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{content.clarifications.heading}</h2>
          <ul className="flex flex-col gap-2">
            {otherClarifications.map((c) => (
              <li
                key={`${c.factId}-${c.reason}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <span>
                  <span className="font-semibold">{props.factName(c.factId)}</span>
                  {': '}
                  {content.clarifications.reasons[c.reason]}
                </span>
                <button
                  type="button"
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  onClick={() => {
                    props.onEditFact(c.factId);
                  }}
                >
                  {content.editFact}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {mapping.consultations.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{content.consultations.heading}</h2>
          <p className="text-sm">{content.consultations.help}</p>
          <ul className="flex flex-col gap-2">
            {mapping.consultations.map((c) => (
              <li
                key={`${String(c.factId)}-${c.consultationId}`}
                className="border-warning/60 bg-warning-soft flex items-start gap-2 rounded-md border p-3 text-sm"
              >
                <MessageSquareWarning aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  {c.factId !== null && (
                    <span className="font-semibold">{props.factName(c.factId)}: </span>
                  )}
                  <PackText>
                    {labelOf(pack.consultations, c.consultationId) ?? c.consultationId}
                  </PackText>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {mapping.unsupported.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{content.unsupported.heading}</h2>
          <ul className="list-disc ps-6 text-sm">
            {mapping.unsupported.map((u) => (
              <li key={`${String(u.factId)}-${u.code}`}>
                {u.factId !== null && (
                  <span className="font-semibold">{props.factName(u.factId)}: </span>
                )}
                {content.unsupported.codes[u.code]}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MappingTrace(props: {
  readonly mapping: MappingResult;
  readonly pack: RulePack;
  readonly content: ResultsContent;
  readonly factName: (id: string | null) => string;
}) {
  const { content, mapping, pack } = props;
  if (mapping.trace.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{content.mapping.heading}</h2>
      <p className="text-muted-foreground text-sm">{content.mapping.description}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b">
              <th scope="col" className="py-2 pe-4 text-start font-medium">
                {content.mapping.fact}
              </th>
              <th scope="col" className="py-2 pe-4 text-start font-medium">
                {content.mapping.outcome}
              </th>
              <th scope="col" className="py-2 text-start font-medium">
                {content.mapping.bucket}
              </th>
            </tr>
          </thead>
          <tbody>
            {mapping.trace.map((line) => (
              <tr key={line.factId} className="border-b last:border-0">
                <td className="py-2 pe-4">{props.factName(line.factId)}</td>
                <td className="py-2 pe-4">{content.mapping.outcomes[line.outcome]}</td>
                <td className="py-2">
                  {line.categoryId === null ? (
                    '—'
                  ) : (
                    <PackText>
                      {labelOf(pack.inputCategories, line.categoryId) ?? line.categoryId}
                    </PackText>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TechnicalDetails({
  report,
  content,
}: {
  readonly report: CalculationReport;
  readonly content: ResultsContent;
}) {
  const { meta } = report;
  return (
    <details className="rounded-lg border p-4 text-sm">
      <summary className="cursor-pointer font-medium">{content.details.heading}</summary>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">{content.details.pack}</dt>
        <dd dir="ltr" className="text-start font-mono">
          {meta.rulePack.packId}
        </dd>
        <dt className="text-muted-foreground">{content.details.version}</dt>
        <dd dir="ltr" className="text-start font-mono">
          {meta.rulePack.version}
        </dd>
        <dt className="text-muted-foreground">{content.details.digest}</dt>
        <dd dir="ltr" className="text-start font-mono break-all">
          {meta.rulePack.contentDigest ?? '—'}
        </dd>
        <dt className="text-muted-foreground">{content.details.engine}</dt>
        <dd dir="ltr" className="text-start font-mono">
          {meta.engineVersion}
        </dd>
      </dl>
      {meta.warnings.length > 0 && (
        <p className="text-muted-foreground mt-3">
          {formatMessage(content.details.warnings, { count: meta.warnings.length })}
        </p>
      )}
    </details>
  );
}
