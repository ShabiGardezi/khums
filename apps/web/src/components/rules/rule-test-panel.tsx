'use client';

import { useState } from 'react';

import type { ScholarRuleTestResponse } from '@khums/api-client';
import { Alert, AlertDescription } from '@khums/ui/components/alert';
import { Button } from '@khums/ui/components/button';
import { Field } from '@khums/ui/components/field';
import { Input } from '@khums/ui/components/input';
import { NativeSelect } from '@khums/ui/components/native-select';
import { ProvisionalCalculationNotice } from '@khums/ui/components/provisional-calculation-notice';

import { staffBrowserApi } from '@/components/admin/staff-browser-api';
import { problemMessage } from '@/components/console/problem-message';
import type { ConsoleContent } from '@/content/console/types';
import type { FactsContent } from '@/content/facts/types';
import type { ResultsContent } from '@/content/results/types';
import type { RulesContent } from '@/content/rules/types';
import { formatMessage } from '@/i18n/format';
import { useHydrated } from '@/lib/use-hydrated';

import { PreparationBadges } from './preparation-status';
import {
  checkTestDates,
  ENTRY_TYPES,
  entryValue,
  parseEntryValue,
  ruleRefusalCodes,
  testRequestFrom,
  type TestEntryRow,
} from './rule-content';

/** '' (unanswered), 'yes' / 'no', or a percentage typed for an inflation question. */
type Answer = string;

interface Row extends TestEntryRow {
  readonly key: number;
}

interface OutputValue {
  readonly id: string;
  readonly label: string;
  readonly value: { readonly amount: string; readonly currency: string } | null;
}
interface BreakdownStep {
  readonly stepId: string;
  readonly label: string;
  readonly value: string | null;
}
interface UnresolvedCase {
  readonly id: string;
  readonly label?: string;
}

/** The engine report's annual result, read defensively (the API returns it as a record). */
function annualResult(report: Readonly<Record<string, unknown>> | null) {
  const result = report?.result as
    | {
        outputs?: readonly OutputValue[];
        breakdown?: readonly BreakdownStep[];
        unresolved?: readonly UnresolvedCase[];
      }
    | undefined;
  return {
    outputs: result?.outputs ?? [],
    breakdown: result?.breakdown ?? [],
    unresolved: result?.unresolved ?? [],
  };
}

/**
 * Test panel of the rule builder (Phase 2 step 3): the scholar enters TEST entries and answers;
 * the server compiles the Marja's latest rules into a SCHOLAR_REVIEW test pack and calculates.
 * Always labelled PROVISIONAL — FOR SCHOLAR REVIEW ONLY; nothing is saved and nothing is public.
 */
export function RuleTestPanel(props: {
  readonly marjaId: string;
  readonly rules: RulesContent;
  readonly facts: Pick<FactsContent, 'kinds' | 'subtypes'>;
  readonly results: Pick<
    ResultsContent,
    'provisionalLabel' | 'provisionalNoticeAriaLabel' | 'provisionalExplanation'
  >;
  readonly common: ConsoleContent['common'];
  /** Localized path of a research ruling record, with `{id}` for its id. */
}) {
  const t = props.rules.test;
  const hydrated = useHydrated();
  const [currency, setCurrency] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [rows, setRows] = useState<Row[]>([
    { key: 1, id: 'e1', entryType: '', amount: '', date: '' },
  ]);
  const [nextKey, setNextKey] = useState(2);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  // Date problems that need a value (missing dates) are shown once a run was attempted.
  const [attempted, setAttempted] = useState(false);
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'done'; value: ScholarRuleTestResponse }
    | { kind: 'error'; message: string; codes: readonly string[] }
  >({ kind: 'idle' });
  const subtypeLabel = (value: string) => {
    const ref = ENTRY_TYPES.find((e) => entryValue(e) === value);
    if (ref === undefined) return value;
    const sub = (props.facts.subtypes[ref.kind] as Readonly<Record<string, string>>)[ref.subtype];
    return `${props.facts.kinds[ref.kind].label}: ${sub ?? ref.subtype}`;
  };
  const update = (key: number, patch: Partial<TestEntryRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const last = state.kind === 'done' ? state.value : null;
  const calcQuestions = last?.questions.filter((q) => q.scope === 'CALCULATION') ?? [];
  const entryQuestions =
    last?.mapping?.clarifications.filter(
      (c) =>
        (c.reason === 'QUESTION_UNANSWERED' || c.reason === 'QUESTION_ANSWER_INVALID') &&
        c.questionId !== null,
    ) ?? [];
  const answered = (key: string): Answer => answers[key] ?? '';
  // Per-entry answers already given stay listed so they can be changed.
  const entryKeys = [
    ...new Set([
      ...entryQuestions.map((c) => `${c.factId}|${c.questionId ?? ''}`),
      ...Object.keys(answers).filter((k) => k.includes('|')),
    ]),
  ];
  const questionLabel = (id: string) =>
    last?.questions.find((q) => q.questionId === id)?.label ?? id;
  // Decision 79: entries are named by their number in the form, never by their id.
  const entryName = (factId: string) => {
    const index = rows.findIndex((r) => r.id === factId);
    return formatMessage(t.entryName, { entry: index === -1 ? '—' : String(index + 1) });
  };
  // Dates are checked before anything is sent (the server checks them again).
  const dateIssues = checkTestDates({ start, end, rows }).filter(
    (i) => attempted || (i.code !== 'PERIOD_REQUIRED' && i.code !== 'ENTRY_DATE_REQUIRED'),
  );
  const dateErrors = dateIssues.filter((i) => i.severity === 'error');
  const issueText = (i: (typeof dateIssues)[number]) =>
    formatMessage(t.dateIssues[i.code] ?? t.fixDatesFirst, {
      days: i.days === null ? '' : String(i.days),
    });
  const periodError = dateErrors.find((i) => i.rowId === null);
  const rowIssueText = (rowId: string, severity: 'error' | 'warning'): string | null => {
    const found = dateIssues.find((i) => i.rowId === rowId && i.severity === severity);
    return found === undefined ? null : issueText(found);
  };
  const questionOf = (id: string) => last?.questions.find((q) => q.questionId === id);
  const isDecimal = (id: string) => questionOf(id)?.kind === 'decimal';
  // Decision 83: notes shown under inflation figures filled in from official data.
  const [inflationNotes, setInflationNotes] = useState<Record<string, string>>({});
  const fillInflation = (key: string, factId: string) => {
    const row = rows.find((r) => r.id === factId);
    const note = (text: string) => {
      setInflationNotes((current) => ({ ...current, [key]: text }));
    };
    if (row === undefined || row.date === '' || end === '' || currency.length !== 3) {
      note(t.inflationNeedsDates);
      return;
    }
    void staffBrowserApi()
      .rules.inflation({ currency, from: row.date, to: end })
      .then((result) => {
        if (!result.ok) {
          note(problemMessage(result.error, props.common.errors).message);
          return;
        }
        const r = result.value;
        if (!r.available || r.percent === null) {
          note(t.inflationUnavailable);
          return;
        }
        const vars = {
          percent: r.percent.replace('-', ''),
          from: r.fromMonth ?? '',
          to: r.toMonth ?? '',
          source: r.source,
        };
        if (r.percent.startsWith('-')) {
          // A fall in prices is shown, never entered for the person.
          note(formatMessage(t.inflationFell, vars));
          return;
        }
        setAnswers((current) => ({ ...current, [key]: r.percent ?? '' }));
        note(
          `${formatMessage(t.inflationFilled, vars)}${r.latestPublished ? ` ${t.inflationLatest}` : ''}`,
        );
      });
  };

  const run = () => {
    setAttempted(true);
    if (checkTestDates({ start, end, rows }).some((i) => i.severity === 'error')) return;
    const toBool = (a: Answer) => (a === 'yes' ? true : a === 'no' ? false : undefined);
    const calc: Record<string, boolean> = {};
    const perEntry: Record<string, Record<string, boolean | string>> = {};
    for (const [key, value] of Object.entries(answers)) {
      if (key.includes('|')) {
        const [factId = '', questionId = ''] = key.split('|');
        // A percentage is sent as typed; the server validates it (never guessed here).
        const answer = isDecimal(questionId) ? value.trim() || undefined : toBool(value);
        if (answer === undefined) continue;
        perEntry[factId] = { ...(perEntry[factId] ?? {}), [questionId]: answer };
        continue;
      }
      const b = toBool(value);
      if (b !== undefined) calc[key] = b;
    }
    setState({ kind: 'busy' });
    void staffBrowserApi()
      .rules.test(
        testRequestFrom({
          marjaId: props.marjaId,
          currency,
          start,
          end,
          rows,
          answers: calc,
          entryAnswers: perEntry,
        }),
      )
      .then((result) => {
        setState(
          result.ok
            ? { kind: 'done', value: result.value }
            : {
                kind: 'error',
                message: problemMessage(result.error, props.common.errors).message,
                codes: ruleRefusalCodes(result.error),
              },
        );
      });
  };

  const numberInput = (key: string, label: string, questionId: string, factId: string) => {
    const question = questionOf(questionId);
    const note = inflationNotes[key];
    return (
      <div key={key} className="flex flex-col gap-1">
        <Field
          label={label}
          description={question?.unit === 'AMOUNT' ? t.amountHint : t.percentHint}
        >
          <Input
            inputMode="decimal"
            value={answered(key)}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setAnswers((current) => ({ ...current, [key]: value }));
            }}
          />
        </Field>
        {question?.inflation === true && (
          <div className="flex flex-col items-start gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                fillInflation(key, factId);
              }}
            >
              {t.inflationFill}
            </Button>
            {note !== undefined && (
              <p className="text-muted-foreground text-xs" role="status">
                {note}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };
  // Answers the calculation still needs: highlighted until given.
  const neededKeys = new Set(
    [...calcQuestions.map((q) => q.questionId), ...entryKeys].filter((k) => answered(k) === ''),
  );
  const highlighted = (key: string, node: React.ReactNode) =>
    neededKeys.has(key) ? (
      <div
        key={key}
        data-needed="true"
        className="border-warning bg-warning-soft flex flex-col gap-1 rounded-md border-2 p-2"
      >
        <span className="text-warning-strong text-xs font-semibold">{t.neededBadge}</span>
        {node}
      </div>
    ) : (
      node
    );
  const answerSelect = (key: string, label: string) => (
    <Field key={key} label={label}>
      <NativeSelect
        value={answered(key)}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setAnswers((current) => ({ ...current, [key]: value }));
        }}
      >
        <option value="">{t.unanswered}</option>
        <option value="yes">{props.common.yes}</option>
        <option value="no">{props.common.no}</option>
      </NativeSelect>
    </Field>
  );

  const result = annualResult(last?.report ?? null);
  return (
    <section
      aria-labelledby="rule-test-heading"
      className="flex flex-col gap-4 rounded-lg border p-4"
    >
      <h2 id="rule-test-heading" className="text-lg font-semibold">
        {t.heading}
      </h2>
      <ProvisionalCalculationNotice
        label={props.results.provisionalLabel}
        ariaLabel={props.results.provisionalNoticeAriaLabel}
      >
        {props.results.provisionalExplanation}
      </ProvisionalCalculationNotice>
      <p className="text-muted-foreground text-sm">{t.description}</p>
      <form
        method="post"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t.currency} required>
            <Input
              required
              dir="ltr"
              maxLength={3}
              pattern="^[A-Za-z]{3}$"
              value={currency}
              onChange={(event) => {
                setCurrency(event.currentTarget.value);
              }}
            />
          </Field>
          <Field label={t.periodStart} required>
            <Input
              type="date"
              required
              value={start}
              onChange={(event) => {
                setStart(event.currentTarget.value);
              }}
            />
          </Field>
          <Field
            label={t.periodEnd}
            required
            {...(periodError === undefined ? {} : { error: issueText(periodError) })}
          >
            <Input
              type="date"
              required
              value={end}
              onChange={(event) => {
                setEnd(event.currentTarget.value);
              }}
            />
          </Field>
        </div>
        <fieldset className="flex flex-col gap-3 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">{t.entries}</legend>
          {rows.map((row, index) => {
            const number = String(index + 1);
            return (
              <fieldset key={row.key} className="grid gap-3 rounded-md border p-3 sm:grid-cols-4">
                <legend className="px-1 text-sm font-medium">
                  {formatMessage(t.entry, { number })}
                </legend>
                <Field label={t.entryType} required>
                  <NativeSelect
                    required
                    value={row.entryType}
                    onChange={(event) => {
                      update(row.key, { entryType: event.currentTarget.value });
                    }}
                  >
                    <option value="" disabled>
                      —
                    </option>
                    {ENTRY_TYPES.map((ref) => (
                      <option key={entryValue(ref)} value={entryValue(ref)}>
                        {subtypeLabel(entryValue(ref))}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label={t.amount} required>
                  <Input
                    required
                    inputMode="decimal"
                    dir="ltr"
                    pattern="^(0|[1-9][0-9]*)(\.[0-9]+)?$"
                    value={row.amount}
                    onChange={(event) => {
                      update(row.key, { amount: event.currentTarget.value });
                    }}
                  />
                </Field>
                <Field
                  label={t.date}
                  required
                  description={[
                    t.dateMeaning[parseEntryValue(row.entryType)?.kind ?? 'NONE'],
                    rowIssueText(row.id, 'warning'),
                  ]
                    .filter((part) => part !== null)
                    .join(' ')}
                  {...(rowIssueText(row.id, 'error') === null
                    ? {}
                    : { error: rowIssueText(row.id, 'error') })}
                >
                  <Input
                    type="date"
                    required
                    value={row.date}
                    onChange={(event) => {
                      update(row.key, { date: event.currentTarget.value });
                    }}
                  />
                </Field>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={rows.length <= 1}
                    onClick={() => {
                      setRows((current) => current.filter((r) => r.key !== row.key));
                    }}
                  >
                    {formatMessage(t.removeEntry, { number })}
                  </Button>
                </div>
              </fieldset>
            );
          })}
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={rows.length >= 100}
              onClick={() => {
                setRows((current) => [
                  ...current,
                  { key: nextKey, id: `e${String(nextKey)}`, entryType: '', amount: '', date: '' },
                ]);
                setNextKey((k) => k + 1);
              }}
            >
              {t.addEntry}
            </Button>
          </div>
        </fieldset>
        {(calcQuestions.length > 0 || entryKeys.length > 0) && (
          <fieldset className="flex flex-col gap-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{t.answers}</legend>
            {neededKeys.size > 0 && (
              <Alert variant="warning">
                <AlertDescription>
                  {formatMessage(t.neededAnswers, { count: String(neededKeys.size) })}
                </AlertDescription>
              </Alert>
            )}
            {calcQuestions.map((q) =>
              highlighted(q.questionId, answerSelect(q.questionId, q.label)),
            )}
            {entryKeys.map((key) => {
              const [factId = '', questionId = ''] = key.split('|');
              const index = rows.findIndex((r) => r.id === factId);
              const label = formatMessage(t.answerFor, {
                question: questionLabel(questionId),
                entry: index === -1 ? factId : String(index + 1),
              });
              return highlighted(
                key,
                isDecimal(questionId)
                  ? numberInput(key, label, questionId, factId)
                  : answerSelect(key, label),
              );
            })}
          </fieldset>
        )}
        {attempted && dateErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>{t.fixDatesFirst}</AlertDescription>
          </Alert>
        )}
        <div>
          <Button type="submit" disabled={!hydrated || state.kind === 'busy'}>
            {state.kind === 'busy' ? t.running : t.run}
          </Button>
        </div>
      </form>

      <div aria-live="polite" className="flex flex-col gap-4">
        {state.kind === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>
              {state.message}
              {state.codes.map((code) => (
                <span key={code} className="block">
                  {(props.rules.refusals as Readonly<Record<string, string>>)[code] ??
                    t.refusalText}
                </span>
              ))}
            </AlertDescription>
          </Alert>
        )}
        {last !== null && (
          <section aria-label={t.outcome[last.outcome]} className="flex flex-col gap-3">
            <ProvisionalCalculationNotice
              variant="inline"
              label={props.results.provisionalLabel}
              ariaLabel={props.results.provisionalNoticeAriaLabel}
            />
            <p className="font-semibold">{t.outcome[last.outcome]}</p>
            {neededKeys.size > 0 && (
              <p className="text-warning-strong text-sm font-medium">{t.runAgainAfterAnswers}</p>
            )}
            <p className="text-muted-foreground text-xs">{last.disclaimer}</p>
            <dl className="grid gap-1 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="font-medium">{t.compiled}</dt>
              <dd>
                <ul className="flex flex-col gap-2">
                  {last.compiled.map((c) => (
                    <li key={c.ruleId} className="flex flex-col gap-1 text-xs">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{props.rules.categories[c.category]}</span>
                        <span className="text-muted-foreground">
                          {formatMessage(props.rules.detail.revision, {
                            number: String(c.revision),
                          })}
                        </span>
                        <PreparationBadges
                          aiStage={c.aiStage}
                          rejected={false}
                          rules={props.rules}
                        />
                        {c.developerRequired && <span>{t.developerStop}</span>}
                      </span>
                      <span>{t.sources}:</span>
                      {c.sources.length === 0 ? (
                        <span>{t.noSources}</span>
                      ) : (
                        <ul className="list-disc ps-5">
                          {c.sources.map((src) => (
                            <li key={src.refId}>
                              <span dir="auto">{src.title}</span>
                              {src.locator !== null && (
                                <>
                                  {' '}
                                  · <span dir="auto">{src.locator}</span>
                                </>
                              )}
                              {src.url !== null && (
                                <>
                                  {' '}
                                  ·{' '}
                                  <a
                                    className="text-primary underline-offset-4 hover:underline"
                                    href={src.url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    dir="ltr"
                                  >
                                    {src.url}
                                  </a>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </dd>
              {last.skipped.length > 0 && (
                <>
                  <dt className="font-medium">{t.skipped}</dt>
                  <dd>
                    <ul>
                      {last.skipped.map((c) => (
                        <li key={c.ruleId} className="text-xs">
                          {(t.skippedReasons as Readonly<Record<string, string>>)[c.reason] ??
                            c.reason}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </>
              )}
            </dl>
            {result.outputs.length > 0 && (
              <section aria-label={t.outputs} className="flex flex-col gap-1">
                <h3 className="font-semibold">{t.outputs}</h3>
                <ul className="flex flex-col gap-1">
                  {result.outputs.map((o) => {
                    const rule = last.compiled.find((c) => c.outputId === o.id);
                    return (
                      <li key={o.id} className="flex flex-wrap justify-between gap-2 text-sm">
                        <span>
                          {rule === undefined ? '—' : props.rules.categories[rule.category]}
                        </span>
                        <span dir="ltr" className="font-mono">
                          {o.value === null
                            ? t.notCalculated
                            : `${o.value.amount} ${o.value.currency}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {result.breakdown.length > 0 && (
              <details>
                <summary className="cursor-pointer font-medium">{t.breakdown}</summary>
                <ol className="mt-2 flex flex-col gap-1 ps-5 text-sm">
                  {result.breakdown.map((step) => (
                    <li key={step.stepId} className="list-decimal">
                      <span dir="ltr">{step.label}</span>:{' '}
                      <span dir="ltr" className="font-mono">
                        {step.value ?? t.notCalculated}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {(result.unresolved.length > 0 || (last.mapping?.consultations.length ?? 0) > 0) && (
              <div className="text-sm">
                <p className="font-medium">{t.reviewStops}</p>
                <ul className="list-disc ps-5">
                  {result.unresolved.map((u) => (
                    <li key={u.id} dir="auto">
                      {u.label ?? t.reviewStopGeneric}
                    </li>
                  ))}
                  {last.mapping?.consultations.map((c) => (
                    <li key={`${c.factId ?? ''}-${c.consultationId}`} dir="auto">
                      {c.factId !== null && <>{entryName(c.factId)}: </>}
                      {c.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(last.mapping?.clarifications.length ?? 0) > 0 && (
              <div className="text-sm">
                <p className="font-medium">{t.clarifications}</p>
                <ul className="list-disc ps-5">
                  {last.mapping?.clarifications.map((c) => (
                    <li key={`${c.factId}-${c.reason}-${c.questionId ?? ''}`} dir="auto">
                      {entryName(c.factId)}:{' '}
                      {formatMessage(
                        (t.clarificationReasons as Readonly<Record<string, string>>)[c.reason] ??
                          t.clarificationReasons.OTHER,
                        { question: c.questionId === null ? '' : questionLabel(c.questionId) },
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {last.refusal !== null && (
              <div className="text-sm">
                <p className="font-medium">{t.refusal}</p>
                <p>{t.refusalText}</p>
              </div>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
