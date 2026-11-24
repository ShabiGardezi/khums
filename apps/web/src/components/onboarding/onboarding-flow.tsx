'use client';

import {
  ArrowRight,
  CircleAlert,
  Clock,
  History,
  Info,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
  type SubmitEvent,
} from 'react';

import {
  describeVerifiedEntryCoverage,
  INITIAL_ONBOARDING_STATE,
  type MarjaChoice,
  type OnboardingIntent,
  type OnboardingState,
} from '@khums/core';
import type { FinancialFactSheet, Workflow } from '@khums/shared-types';
import { Alert, AlertDescription, AlertTitle } from '@khums/ui/components/alert';
import { Badge } from '@khums/ui/components/badge';
import { buttonVariants } from '@khums/ui/components/button';
import { Card, CardContent, CardHeader } from '@khums/ui/components/card';
import { Separator } from '@khums/ui/components/separator';
import { cn } from '@khums/ui/lib/utils';

import { FactEntry } from '@/components/facts/fact-entry';
import { FactReview } from '@/components/facts/fact-review';
import { ResultsView } from '@/components/results/results-view';
import { VerifiedResultsView } from '@/components/results/verified-results-view';
import { useConfirmDialog, type ConfirmOptions } from '@/components/common/confirm-dialog';
import type { ConfirmText, FactsContent } from '@/content/facts/types';
import type { ResultsContent } from '@/content/results/types';
import type { OnboardingContent } from '@/content/onboarding/types';
import {
  copyEntryStateForNewYear,
  entryStateFromSheet,
  initialEntryState,
  removeFact,
  type FactEntryState,
} from '@/financial/entry-state';
import { formatMessage } from '@/i18n/format';
import { clearReopenRequest, peekReopenRequest, type ReopenRequest } from '@/lib/reopen-request';
import {
  calculationFor,
  offeredWorkflows,
  type CalculationSource,
  type MarjaCalculation,
} from '@/results/calculation-source';
import type { KeptAnswers } from '@/results/kept-answers';
import { submitOnboardingStep } from '@/onboarding/actions';

import { MarjaStatusList, type StatusRow } from './marja-status-list';

export interface MarjaOption {
  readonly id: string;
  readonly name: string;
  readonly statuses: readonly StatusRow[];
  /** From the catalogue policy via @khums/core; false for every entry today. */
  readonly calculationAvailable: boolean;
  /** Only a human-verified `DECEASED` status; unverified reports are never shown as fact. */
  readonly verifiedDeceased: boolean;
}

export interface OnboardingFlowProps {
  readonly backHref: string;
  readonly homeHref: string;
  readonly options: readonly MarjaOption[];
  readonly notListedId: string;
  /** Assessment workflows in display order (from @khums/core). */
  readonly workflows: readonly Workflow[];
  readonly content: Pick<OnboardingContent, 'marja' | 'review' | 'assessment' | 'summary'>;
  /** Financial details content (M4.3.2). */
  readonly facts: FactsContent;
  /** Results dashboard content (M4.5.1). */
  readonly results: ResultsContent;
  /**
   * The calculation rules the server allows for this operational state, or null (no calculation
   * offered). Development: the non-religious mock pack only. Public state (decision 65): per
   * Marja, only its verified pack; a Marja without one gets a clear message and no figures.
   */
  readonly calculation: CalculationSource | null;
  /** The saved-results page (browser-only history). */
  readonly historyHref: string;
  /** BCP 47 tag for formatting numbers, dates and currency names. */
  readonly localeTag: string;
  /** Server-rendered slots (progress indicators per step, list note). */
  readonly slots: {
    readonly progress: Readonly<Record<OnboardingState['step'], ReactNode>>;
    readonly marjaIntro: ReactNode;
  };
}

const cardClass =
  'relative flex gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-input has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring';
const headingClass = 'text-2xl font-semibold focus-visible:outline-none sm:text-3xl';

/**
 * Transient onboarding on one URL: Marja → review → assessment type → summary.
 *
 * Every step is a form POSTed to a Server Function (`useActionState`), so the flow works without
 * JavaScript and no choice ever appears in a URL. Later steps carry the Marja in a hidden field,
 * which the server re-validates against the catalogue each time. The state lives only in React
 * (or in the single no-JS response): no cookies, browser storage, database or server record.
 */
export function OnboardingFlow(props: OnboardingFlowProps) {
  const [state, formAction, pending] = useActionState(
    submitOnboardingStep,
    INITIAL_ONBOARDING_STATE,
  );
  // A server error the user has since acted on (hidden until the next submission).
  const [dismissed, setDismissed] = useState<OnboardingState | null>(null);
  const live = dismissed !== state;
  const dismiss = () => {
    setDismissed(state);
  };
  // Move focus to each new step's heading, but not on first page load.
  const moveFocus = state !== INITIAL_ONBOARDING_STATE;
  const common = { ...props, formAction, pending, moveFocus };
  // Decision 71: a calculation saved on this device, handed over in memory by the history page
  // (edit, or copy for a new year). Only its Marja and assessment type are submitted, through the
  // same Server Function and checks as a typed choice; its entries stay in this page's memory.
  const [reopenRequest] = useState(peekReopenRequest);
  const [reopened, setReopened] = useState<ReopenRequest | null>(reopenRequest);
  const reopenSubmitted = useRef(false);
  useEffect(() => {
    if (reopenRequest === null || reopenSubmitted.current) return;
    reopenSubmitted.current = true;
    clearReopenRequest();
    const data = new FormData();
    data.set('intent', 'continue-to-details');
    data.set('marja', reopenRequest.saved.marjaId);
    data.set('assessment', reopenRequest.saved.workflow);
    startTransition(() => {
      formAction(data);
    });
  }, [reopenRequest, formAction]);
  // Financial facts live only here, in memory, so they survive "Back to your setup" and return.
  // They are never part of a form submission or URL (saved on this device only when the person
  // taps Save on a verified result, decision 71).
  const [entry, setEntry] = useState<FactEntryState | null>(() => {
    if (reopenRequest === null) return null;
    const loaded = entryStateFromSheet(reopenRequest.saved.sheet);
    return reopenRequest.mode === 'copy' ? copyEntryStateForNewYear(loaded) : loaded;
  });
  // Answers given on the verified results view, in memory only, so they survive leaving and
  // returning to the results (audit M-2); keyed by Marja, assessment type and exact pack version.
  const [keptAnswers, setKeptAnswers] = useState<KeptAnswers>({});
  // Whether the open fact form has unsaved changes (only meaningful on the details step).
  const [formDirty, setFormDirty] = useState(false);
  const { dialog, confirm } = useConfirmDialog();

  const factCount = entry?.facts.length ?? 0;
  const hasUnsaved = factCount > 0 || (state.step === 'details' && formDirty);
  useLeaveGuard(hasUnsaved, confirm, props.facts.unsaved.leave);

  let step: ReactNode;
  if (reopenRequest !== null && state === INITIAL_ONBOARDING_STATE) {
    return (
      <h1 role="status" className={headingClass}>
        {props.facts.reopened.opening}
      </h1>
    );
  }
  switch (state.step) {
    case 'marja':
      step = (
        <MarjaStep
          key="marja"
          {...common}
          selected={state.selected}
          serverError={live ? state.error : null}
          onInput={dismiss}
        />
      );
      break;
    case 'review':
      step = <ReviewStep key="review" {...common} marja={state.marja} />;
      break;
    case 'assessment':
      step = (
        <AssessmentStep
          key="assessment"
          {...common}
          marja={state.marja}
          selected={state.selected}
          serverError={live ? state.error : null}
          onInput={dismiss}
          savedEntries={
            entry !== null && factCount > 0 ? { workflow: entry.workflow, count: factCount } : null
          }
          confirm={confirm}
          onDiscardEntries={() => {
            setEntry(null);
            setReopened(null);
            setKeptAnswers({});
          }}
        />
      );
      break;
    case 'summary':
      step = (
        <SummaryStep key="summary" {...common} marja={state.marja} workflow={state.workflow} />
      );
      break;
    case 'details': {
      // A different assessment type needs different dates: start a fresh, empty sheet.
      const current =
        entry !== null && entry.workflow === state.workflow
          ? entry
          : initialEntryState(state.workflow);
      step = (
        <DetailsStep
          key="details"
          {...common}
          marja={state.marja}
          workflow={state.workflow}
          entry={current}
          reopened={
            reopened !== null &&
            current === entry &&
            reopened.saved.marjaId === state.marja &&
            reopened.saved.workflow === state.workflow
              ? reopened
              : null
          }
          onEntryChange={(update) => {
            setEntry((previous) =>
              update(
                previous !== null && previous.workflow === state.workflow
                  ? previous
                  : initialEntryState(state.workflow),
              ),
            );
          }}
          formDirty={formDirty}
          onFormDirtyChange={setFormDirty}
          keptAnswers={keptAnswers}
          onKeptAnswersChange={setKeptAnswers}
          confirm={confirm}
        />
      );
      break;
    }
  }
  return (
    <>
      {step}
      {dialog}
    </>
  );
}

const toConfirmOptions = (text: ConfirmText): ConfirmOptions => ({
  title: text.title,
  body: text.body,
  confirmLabel: text.confirm,
  cancelLabel: text.cancel,
});

/**
 * While unsaved financial information exists, asks before it is lost by leaving the page:
 * - in-app links (header, footer, language switcher, Home) navigate client-side and never fire
 *   `beforeunload`, so they are intercepted and confirmed with the accessible dialog, then
 *   followed with a full navigation;
 * - reload, close, typed URLs and Back out of the document use the browser's own prompt.
 * In-page anchors (e.g. the skip link) are not affected. Nothing is stored to "resume" later.
 */
function useLeaveGuard(
  active: boolean,
  confirm: (options: ConfirmOptions) => Promise<boolean>,
  text: ConfirmText,
) {
  const leaving = useRef(false);
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!leaving.current) event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target !== '' && anchor.target !== '_self') || anchor.hasAttribute('download')) {
        return;
      }
      const url = new URL(anchor.href, window.location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return; // e.g. a local blob: export
      if (url.origin !== window.location.origin) return; // full navigation: browser prompt
      const samePage =
        url.pathname === window.location.pathname && url.search === window.location.search;
      if (samePage && url.hash !== '') return; // in-page anchor
      event.preventDefault();
      event.stopPropagation();
      void confirm(toConfirmOptions(text)).then((leave) => {
        if (!leave) return;
        leaving.current = true;
        window.location.assign(url.href);
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [active, confirm, text]);
}

/**
 * Wraps a form submission: when `check` returns confirmation text, asks first and submits again
 * (with the same submit button) only if the user confirms.
 */
function useConfirmBeforeSubmit(
  confirm: (options: ConfirmOptions) => Promise<boolean>,
  check: (
    form: HTMLFormElement,
    submitter: HTMLElement | null,
  ) => { readonly text: ConfirmText; readonly onConfirm?: () => void } | null,
) {
  const bypass = useRef(false);
  return (event: SubmitEvent<HTMLFormElement>) => {
    if (bypass.current) {
      bypass.current = false;
      return;
    }
    const form = event.currentTarget;
    const submitter =
      event.nativeEvent.submitter instanceof HTMLElement ? event.nativeEvent.submitter : null;
    const pending = check(form, submitter);
    if (pending === null) return;
    event.preventDefault();
    void confirm(toConfirmOptions(pending.text)).then((confirmed) => {
      if (!confirmed) return;
      pending.onConfirm?.();
      bypass.current = true;
      form.requestSubmit(submitter);
    });
  };
}

interface StepProps extends OnboardingFlowProps {
  readonly formAction: (formData: FormData) => void;
  readonly pending: boolean;
  readonly moveFocus: boolean;
}

function useStepHeading(moveFocus: boolean): RefObject<HTMLHeadingElement | null> {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (moveFocus) heading.current?.focus();
  }, [moveFocus]);
  return heading;
}

/** Submit button carrying the step's intent (included in the POST by the browser and React). */
function IntentButton(props: {
  readonly intent: OnboardingIntent;
  readonly variant?: 'primary' | 'outline' | 'ghost';
  readonly pending: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="submit"
      name="intent"
      value={props.intent}
      aria-disabled={props.pending}
      className={buttonVariants({ size: 'lg', variant: props.variant ?? 'primary' })}
    >
      {props.children}
    </button>
  );
}

const Forward = () => <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />;

function TemporaryNote({ children }: { readonly children: ReactNode }) {
  return (
    <p className="text-muted-foreground flex items-start gap-2 text-sm">
      <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}

function ErrorMessage({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      className="text-destructive-strong bg-destructive-soft flex items-start gap-2 rounded-md p-3 text-sm font-medium"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}

/**
 * Public state (decision 65, Phase 3 step 1): the selected Marja has no verified rules, or the
 * verified rules could not be loaded. Shown before any data entry; no figures are offered.
 */
function VerifiedRulesAlert(props: {
  readonly calculation: MarjaCalculation;
  readonly content: ResultsContent['verified'];
}) {
  if (
    props.calculation.kind !== 'NO_VERIFIED_RULES' &&
    props.calculation.kind !== 'VERIFIED_UNAVAILABLE'
  ) {
    return null;
  }
  const text =
    props.calculation.kind === 'NO_VERIFIED_RULES'
      ? props.content.noRules
      : props.content.loadFailed;
  return (
    <Alert variant="warning" data-testid="verified-rules-status">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{text.title}</AlertTitle>
      <AlertDescription>
        <p>{text.body}</p>
      </AlertDescription>
    </Alert>
  );
}

/** Native radio card; the label's pseudo-element makes the whole card clickable. */
function RadioCard({
  ref,
  name,
  id,
  value,
  label,
  description,
  defaultChecked,
  onChange,
  disabled = false,
}: {
  readonly ref?: Ref<HTMLInputElement> | undefined;
  readonly name: 'marja' | 'assessment';
  readonly id: string;
  readonly value: string;
  readonly label: string;
  readonly description: ReactNode;
  readonly defaultChecked: boolean;
  readonly onChange: () => void;
  /** Not offered: shown (never hidden) with its reason in the description, but not selectable. */
  readonly disabled?: boolean;
}) {
  const descriptionId = `${id}-description`;
  return (
    <li className={cn(cardClass, disabled && 'bg-muted hover:border-border')}>
      <input
        ref={ref}
        type="radio"
        name={name}
        value={value}
        id={id}
        defaultChecked={defaultChecked && !disabled}
        disabled={disabled}
        aria-describedby={descriptionId}
        onChange={onChange}
        className="accent-primary relative z-10 mt-1 size-4 shrink-0"
      />
      <div className="flex min-w-0 flex-col gap-2">
        <label
          htmlFor={id}
          className={cn(
            "font-medium after:absolute after:inset-0 after:content-['']",
            disabled && 'text-muted-foreground',
          )}
        >
          {label}
        </label>
        <div id={descriptionId}>{description}</div>
      </div>
    </li>
  );
}

/**
 * Client-side check for instant feedback only (the server validates every submission). Applies
 * only when the submitter is the step's "continue" intent, so Back always works.
 */
function useRequiredChoice(field: 'marja' | 'assessment', continueIntent: OnboardingIntent) {
  const [clientError, setClientError] = useState<'required' | null>(null);
  const firstRadio = useRef<HTMLInputElement>(null);
  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    const submitter = event.nativeEvent.submitter;
    const intent = submitter instanceof HTMLButtonElement ? submitter.value : continueIntent;
    if (intent === continueIntent && new FormData(event.currentTarget).get(field) === null) {
      event.preventDefault();
      setClientError('required');
      firstRadio.current?.focus();
    }
  };
  return { clientError, setClientError, firstRadio, onSubmit };
}

function MarjaStep(
  props: StepProps & {
    readonly selected: MarjaChoice | null;
    readonly serverError: 'required' | 'invalid' | 'lost' | null;
    readonly onInput: () => void;
  },
) {
  const { options, content, slots } = props;
  const { marja } = content;
  const heading = useStepHeading(props.moveFocus);
  const { clientError, setClientError, firstRadio, onSubmit } = useRequiredChoice(
    'marja',
    'select-marja',
  );
  const error = clientError ?? props.serverError;
  const baseId = useId();
  const errorId = `${baseId}-error`;
  const onChange = () => {
    setClientError(null);
    if (props.serverError !== null) props.onInput();
  };
  // Public state only: mark each Marja with whether verified rules are available (never a
  // ranking; order and selection are unchanged). Other modes show the cards as before.
  const verified = props.calculation?.kind === 'VERIFIED' ? props.calculation : null;
  const marker = (id: string) => {
    if (verified?.status !== 'READY') return null;
    const available = calculationFor(verified, id).kind === 'VERIFIED';
    return (
      <Badge
        variant={available ? 'success' : 'neutral'}
        data-testid="verified-rules-marker"
        data-available={available}
      >
        {available ? <ShieldCheck aria-hidden="true" /> : <Info aria-hidden="true" />}
        {available ? marja.verifiedRules.available : marja.verifiedRules.none}
      </Badge>
    );
  };

  return (
    <>
      {slots.progress.marja}
      {slots.marjaIntro}
      {verified?.status === 'UNAVAILABLE' && (
        <VerifiedRulesAlert
          calculation={{ kind: 'VERIFIED_UNAVAILABLE' }}
          content={props.results.verified}
        />
      )}
      <form
        action={props.formAction}
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-8"
      >
        <fieldset
          aria-describedby={error === null ? undefined : errorId}
          className="flex flex-col gap-4"
        >
          <legend className="mb-2 flex flex-col gap-2">
            <h1 ref={heading} tabIndex={-1} className={headingClass}>
              {marja.title}
            </h1>
            <span className="text-muted-foreground text-base">{marja.description}</span>
          </legend>

          {error !== null && <ErrorMessage id={errorId}>{marja.errors[error]}</ErrorMessage>}

          <ul className="grid gap-3 md:grid-cols-2">
            {options.map((o, index) => (
              <RadioCard
                key={o.id}
                name="marja"
                id={`${baseId}-${o.id}`}
                value={o.id}
                label={o.name}
                description={
                  <div className="flex flex-col items-start gap-2">
                    {marker(o.id)}
                    <MarjaStatusList rows={o.statuses} />
                  </div>
                }
                defaultChecked={props.selected === o.id}
                ref={index === 0 ? firstRadio : undefined}
                onChange={onChange}
              />
            ))}
          </ul>
          <Separator />
          <ul>
            <RadioCard
              name="marja"
              id={`${baseId}-${props.notListedId}`}
              value={props.notListedId}
              label={marja.notListed.label}
              description={
                <p className="text-muted-foreground text-sm">{marja.notListed.description}</p>
              }
              defaultChecked={props.selected === props.notListedId}
              onChange={onChange}
            />
          </ul>
        </fieldset>

        <TemporaryNote>{marja.temporary}</TemporaryNote>

        <div className="flex flex-wrap gap-3">
          <IntentButton intent="select-marja" pending={props.pending}>
            {marja.continue}
            <Forward />
          </IntentButton>
          <Link
            href={props.backHref}
            className={buttonVariants({ size: 'lg', variant: 'outline' })}
          >
            {marja.back}
          </Link>
        </div>
      </form>
    </>
  );
}

/** Not-listed or unknown ids resolve to `undefined` (never to another Marja). */
const findOption = (options: readonly MarjaOption[], id: MarjaChoice) =>
  options.find((o) => o.id === id);

function ReviewStep(props: StepProps & { readonly marja: MarjaChoice }) {
  const { review } = props.content;
  const heading = useStepHeading(props.moveFocus);
  const selected = findOption(props.options, props.marja);

  return (
    <>
      {props.slots.progress.review}
      <form action={props.formAction} className="flex flex-col gap-8">
        <input type="hidden" name="marja" value={props.marja} />
        <div className="flex max-w-3xl flex-col gap-2">
          <h1 ref={heading} tabIndex={-1} className={headingClass}>
            {review.title}
          </h1>
          <p className="text-muted-foreground text-base text-pretty">{review.description}</p>
        </div>

        {selected === undefined ? (
          <Alert variant="warning">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>{review.notListed.title}</AlertTitle>
            <AlertDescription>
              <p>{review.notListed.body}</p>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <Card>
              <CardHeader>
                <p className="text-muted-foreground text-sm">{review.yourSelection}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold">{selected.name}</h2>
                  <Badge variant="primary">
                    <UserCheck aria-hidden="true" />
                    {review.selectedByYou}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">{review.statusHeading}</h3>
                <MarjaStatusList rows={selected.statuses} />
              </CardContent>
            </Card>

            {!selected.calculationAvailable && (
              <Alert variant="warning">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>{review.unavailable.title}</AlertTitle>
                <AlertDescription className="flex flex-col gap-2">
                  <p>{formatMessage(review.unavailable.body, { name: selected.name })}</p>
                  <p>{review.unavailable.consult}</p>
                </AlertDescription>
              </Alert>
            )}

            {selected.verifiedDeceased && (
              <Alert variant="info">
                <Info aria-hidden="true" />
                <AlertTitle>{review.deceased.title}</AlertTitle>
                <AlertDescription>
                  <p>{review.deceased.body}</p>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        <TemporaryNote>{review.temporary}</TemporaryNote>

        <div className="flex flex-wrap gap-3">
          <IntentButton intent="continue-to-assessment" pending={props.pending}>
            {review.continue}
            <Forward />
          </IntentButton>
          <IntentButton intent="change-marja" variant="outline" pending={props.pending}>
            {review.change}
          </IntentButton>
          <Link href={props.homeHref} className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
            {review.home}
          </Link>
        </div>
      </form>
    </>
  );
}

/** Small summary of the Marja carried into later steps. */
function SelectedMarja(props: { readonly label: string; readonly name: string }) {
  return (
    <p className="bg-muted flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-4 py-3 text-sm">
      <span className="text-muted-foreground">{props.label}</span>
      <span className="font-semibold">{props.name}</span>
    </p>
  );
}

function AssessmentStep(
  props: StepProps & {
    readonly marja: MarjaChoice;
    readonly selected: Workflow | null;
    readonly serverError: 'required' | 'invalid' | 'unsupported' | null;
    readonly onInput: () => void;
    /** Saved financial entries held in memory, if any (they belong to one assessment type). */
    readonly savedEntries: { readonly workflow: Workflow; readonly count: number } | null;
    readonly confirm: (options: ConfirmOptions) => Promise<boolean>;
    readonly onDiscardEntries: () => void;
  },
) {
  const { assessment, marja: marjaContent } = props.content;
  const heading = useStepHeading(props.moveFocus);
  const {
    clientError,
    setClientError,
    firstRadio,
    onSubmit: requireChoice,
  } = useRequiredChoice('assessment', 'select-assessment');
  // Choosing a different type discards entries recorded for the previous one: ask first.
  const confirmTypeChange = useConfirmBeforeSubmit(props.confirm, (form, submitter) => {
    const saved = props.savedEntries;
    const intent = submitter instanceof HTMLButtonElement ? submitter.value : '';
    const chosen = new FormData(form).get('assessment');
    if (saved === null || intent !== 'select-assessment' || chosen === saved.workflow) return null;
    const unsaved = props.facts.unsaved.changeType;
    return {
      text: {
        ...unsaved,
        body: formatMessage(unsaved.body, {
          type: assessment.types[saved.workflow].title,
          count: new Intl.NumberFormat(props.localeTag).format(saved.count),
        }),
      },
      onConfirm: props.onDiscardEntries,
    };
  });
  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    requireChoice(event);
    if (!event.defaultPrevented) confirmTypeChange(event);
  };
  const error = clientError ?? props.serverError;
  const baseId = useId();
  const errorId = `${baseId}-error`;
  const option = findOption(props.options, props.marja);
  const marjaName = option?.name ?? marjaContent.notListed.label;
  const calculationAvailable = option?.calculationAvailable ?? false;
  // Public state: only the types the Marja's verified pack defines are offered (null: all; the
  // server refuses any other type too). Others stay visible, disabled, with the reason.
  const offered = useMemo(
    () => offeredWorkflows(props.calculation, props.marja),
    [props.calculation, props.marja],
  );
  const isOffered = (workflow: Workflow) => offered === null || offered.includes(workflow);
  const firstOffered = props.workflows.find(isOffered);
  const calculation = calculationFor(props.calculation, props.marja);
  const verifiedMode = props.calculation?.kind === 'VERIFIED';
  const onChange = () => {
    setClientError(null);
    if (props.serverError !== null) props.onInput();
  };

  return (
    <>
      {props.slots.progress.assessment}
      <form
        action={props.formAction}
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-8"
      >
        <input type="hidden" name="marja" value={props.marja} />
        <fieldset
          aria-describedby={error === null ? undefined : errorId}
          className="flex flex-col gap-4"
        >
          <legend className="mb-2 flex flex-col gap-2">
            <h1 ref={heading} tabIndex={-1} className={headingClass}>
              {assessment.title}
            </h1>
            <span className="text-muted-foreground text-base">{assessment.description}</span>
          </legend>

          <SelectedMarja label={assessment.selectedMarja} name={marjaName} />

          {verifiedMode ? (
            <VerifiedRulesAlert calculation={calculation} content={props.results.verified} />
          ) : (
            !calculationAvailable && (
              <Alert variant="warning">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>{assessment.unavailable.title}</AlertTitle>
                <AlertDescription>
                  <p>{assessment.unavailable.body}</p>
                </AlertDescription>
              </Alert>
            )
          )}

          {error !== null && <ErrorMessage id={errorId}>{assessment.errors[error]}</ErrorMessage>}

          <ul className="grid gap-3 md:grid-cols-3">
            {props.workflows.map((workflow) => (
              <RadioCard
                key={workflow}
                name="assessment"
                id={`${baseId}-${workflow}`}
                value={workflow}
                label={assessment.types[workflow].title}
                description={
                  <>
                    <p className="text-muted-foreground text-sm">
                      {assessment.types[workflow].description}
                    </p>
                    {!isOffered(workflow) && (
                      <p
                        className="text-warning-strong mt-2 text-sm font-medium"
                        data-testid="workflow-not-offered"
                      >
                        {formatMessage(assessment.notOffered, { name: marjaName })}
                      </p>
                    )}
                  </>
                }
                defaultChecked={props.selected === workflow}
                disabled={!isOffered(workflow)}
                ref={workflow === firstOffered ? firstRadio : undefined}
                onChange={onChange}
              />
            ))}
          </ul>
        </fieldset>

        <TemporaryNote>{assessment.temporary}</TemporaryNote>

        <div className="flex flex-wrap gap-3">
          <IntentButton intent="select-assessment" pending={props.pending}>
            {assessment.continue}
            <Forward />
          </IntentButton>
          <IntentButton intent="back-to-review" variant="outline" pending={props.pending}>
            {assessment.back}
          </IntentButton>
        </div>
      </form>
    </>
  );
}

function SummaryStep(
  props: StepProps & { readonly marja: MarjaChoice; readonly workflow: Workflow },
) {
  const { summary, assessment, marja: marjaContent } = props.content;
  const heading = useStepHeading(props.moveFocus);
  const option = findOption(props.options, props.marja);
  const calculationAvailable = option?.calculationAvailable ?? false;
  const verifiedMode = props.calculation?.kind === 'VERIFIED';

  return (
    <>
      {props.slots.progress.summary}
      <form action={props.formAction} className="flex flex-col gap-8">
        <input type="hidden" name="marja" value={props.marja} />
        <input type="hidden" name="assessment" value={props.workflow} />
        <div className="flex max-w-3xl flex-col gap-2">
          <h1 ref={heading} tabIndex={-1} className={headingClass}>
            {summary.title}
          </h1>
          <p className="text-muted-foreground text-base text-pretty">{summary.description}</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground text-sm">{summary.marjaLabel}</dt>
              <dd className="font-semibold">{option?.name ?? marjaContent.notListed.label}</dd>
              <dt className="text-muted-foreground text-sm">{summary.assessmentLabel}</dt>
              <dd className="font-semibold">{assessment.types[props.workflow].title}</dd>
            </dl>
          </CardContent>
        </Card>

        {verifiedMode ? (
          <VerifiedRulesAlert
            calculation={calculationFor(props.calculation, props.marja)}
            content={props.results.verified}
          />
        ) : null}
        {!verifiedMode && !calculationAvailable && (
          <Alert variant="warning">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>{summary.unavailable.title}</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <p>{summary.unavailable.body}</p>
              <p>{summary.unavailable.consult}</p>
            </AlertDescription>
          </Alert>
        )}

        <TemporaryNote>{summary.temporary}</TemporaryNote>
        <p className="text-muted-foreground text-sm">{summary.nextSteps}</p>

        <div className="flex flex-wrap gap-3">
          <IntentButton intent="continue-to-details" pending={props.pending}>
            {summary.continue}
            <Forward />
          </IntentButton>
          <IntentButton intent="change-assessment" variant="outline" pending={props.pending}>
            {summary.changeAssessment}
          </IntentButton>
          <IntentButton intent="change-marja" variant="outline" pending={props.pending}>
            {summary.changeMarja}
          </IntentButton>
          <Link href={props.homeHref} className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
            {summary.home}
          </Link>
        </div>
      </form>
    </>
  );
}

function DetailsStep(
  props: StepProps & {
    readonly marja: MarjaChoice;
    readonly workflow: Workflow;
    readonly entry: FactEntryState;
    /** The saved calculation these entries were opened from, if any (decision 71). */
    readonly reopened: ReopenRequest | null;
    readonly onEntryChange: (update: (state: FactEntryState) => FactEntryState) => void;
    readonly formDirty: boolean;
    readonly onFormDirtyChange: (dirty: boolean) => void;
    readonly keptAnswers: KeptAnswers;
    readonly onKeptAnswersChange: (update: (kept: KeptAnswers) => KeptAnswers) => void;
    readonly confirm: (options: ConfirmOptions) => Promise<boolean>;
  },
) {
  const { facts, content } = props;
  const heading = useStepHeading(props.moveFocus);
  const option = findOption(props.options, props.marja);
  // Going back keeps saved entries but would drop an open form with unsaved changes.
  const confirmBack = useConfirmBeforeSubmit(props.confirm, () =>
    props.formDirty
      ? {
          text: facts.unsaved.backWithDraft,
          onConfirm: () => {
            props.onFormDirtyChange(false);
          },
        }
      : null,
  );
  // Entry or read-only review of the same in-memory sheet (client-side view; nothing is sent).
  const [view, setView] = useState<
    { readonly mode: 'entry'; readonly edit: string | null } | { readonly mode: 'review' }
  >({ mode: 'entry', edit: null });
  // Results are a third view of the same in-memory sheet (calculated in the browser).
  const [resultSheet, setResultSheet] = useState<FinancialFactSheet | null>(null);
  // Focus the heading after a view change (not when an edit form takes focus itself).
  const [headingFocus, setHeadingFocus] = useState(0);
  useEffect(() => {
    if (headingFocus > 0) heading.current?.focus();
  }, [headingFocus, heading]);
  const reviewing = view.mode === 'review';
  // Decision 65: the rules for THIS Marja (development mock, its verified pack, or none).
  const calculation = calculationFor(props.calculation, props.marja);
  // Phase 3 step 2: in the public state, which entry types this Marja's verified pack uses for
  // this workflow (from the pack's own fact mapping; null elsewhere, so the form is unchanged).
  const verifiedBundle = calculation.kind === 'VERIFIED' ? calculation.bundle : null;
  const coverage = useMemo(() => {
    if (verifiedBundle === null) return null;
    const described = describeVerifiedEntryCoverage(verifiedBundle, props.workflow);
    return described.ok ? described.value : null;
  }, [verifiedBundle, props.workflow]);

  return (
    <>
      {props.slots.progress.details}
      <div className="flex max-w-3xl flex-col gap-2">
        <h1 ref={heading} tabIndex={-1} className={headingClass}>
          {resultSheet !== null
            ? props.results.title
            : reviewing
              ? facts.review.title
              : facts.title}
        </h1>
        <p className="text-muted-foreground text-base text-pretty">
          {resultSheet !== null
            ? props.results.description
            : reviewing
              ? facts.review.description
              : facts.description}
        </p>
      </div>

      <p className="bg-muted flex flex-wrap gap-x-6 gap-y-1 rounded-md px-4 py-3 text-sm">
        <span>
          <span className="text-muted-foreground">{facts.selection.marja}: </span>
          <span className="font-semibold">{option?.name ?? content.marja.notListed.label}</span>
        </span>
        <span>
          <span className="text-muted-foreground">{facts.selection.assessment}: </span>
          <span className="font-semibold">{content.assessment.types[props.workflow].title}</span>
        </span>
      </p>

      {props.reopened !== null && (
        <ReopenedNotice
          reopened={props.reopened}
          content={facts.reopened}
          localeTag={props.localeTag}
          historyHref={props.historyHref}
          noRules={
            calculation.kind === 'NO_VERIFIED_RULES' || calculation.kind === 'VERIFIED_UNAVAILABLE'
          }
        />
      )}

      <Alert variant="info">
        <Clock aria-hidden="true" />
        <AlertTitle>{facts.temporary.title}</AlertTitle>
        <AlertDescription>
          <p>{facts.temporary.body}</p>
        </AlertDescription>
      </Alert>
      {calculation.kind === 'NO_VERIFIED_RULES' || calculation.kind === 'VERIFIED_UNAVAILABLE' ? (
        <Alert variant="warning" data-testid="no-verified-rules">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>
            {calculation.kind === 'NO_VERIFIED_RULES'
              ? props.results.verified.noRules.title
              : props.results.verified.loadFailed.title}
          </AlertTitle>
          <AlertDescription>
            <p>
              {calculation.kind === 'NO_VERIFIED_RULES'
                ? props.results.verified.noRules.body
                : props.results.verified.loadFailed.body}
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      {resultSheet !== null && calculation.kind === 'DEVELOPMENT' ? (
        <ResultsView
          pack={calculation.pack}
          sheet={resultSheet}
          content={props.results}
          facts={facts}
          localeTag={props.localeTag}
          onBack={() => {
            setResultSheet(null);
            setHeadingFocus((n) => n + 1);
          }}
          onEditFact={(factId) => {
            setResultSheet(null);
            setView({ mode: 'entry', edit: factId });
          }}
        />
      ) : resultSheet !== null && calculation.kind === 'VERIFIED' ? (
        <VerifiedResultsView
          marjaId={calculation.marjaId}
          bundle={calculation.bundle}
          sheet={resultSheet}
          content={props.results}
          facts={facts}
          localeTag={props.localeTag}
          historyHref={props.historyHref}
          reopened={props.reopened}
          keptAnswers={props.keptAnswers}
          onKeptAnswersChange={props.onKeptAnswersChange}
          onBack={() => {
            setResultSheet(null);
            setHeadingFocus((n) => n + 1);
          }}
          onEditFact={(factId) => {
            setResultSheet(null);
            setView({ mode: 'entry', edit: factId });
          }}
        />
      ) : view.mode === 'review' ? (
        <FactReview
          {...(calculation.kind !== 'DEVELOPMENT' && calculation.kind !== 'VERIFIED'
            ? {}
            : {
                calculate: {
                  content:
                    calculation.kind === 'VERIFIED'
                      ? props.results.verified.calculate
                      : props.results.calculate,
                  onCalculate: (sheet: FinancialFactSheet) => {
                    setResultSheet(sheet);
                    setHeadingFocus((n) => n + 1);
                  },
                },
              })}
          content={facts}
          workflowTitles={{
            annual: content.assessment.types.annual.title,
            'first-time': content.assessment.types['first-time'].title,
            'missed-year': content.assessment.types['missed-year'].title,
          }}
          localeTag={props.localeTag}
          state={props.entry}
          confirm={props.confirm}
          onEdit={(factId) => {
            setView({ mode: 'entry', edit: factId });
          }}
          onRemove={(factId) => {
            props.onEntryChange((current) => removeFact(current, factId));
          }}
          onBack={() => {
            setView({ mode: 'entry', edit: null });
            setHeadingFocus((n) => n + 1);
          }}
        />
      ) : (
        <>
          <Alert variant="warning">
            <Info aria-hidden="true" />
            <AlertTitle>{facts.neutral.title}</AlertTitle>
            <AlertDescription>
              <p>{facts.neutral.body}</p>
            </AlertDescription>
          </Alert>

          <FactEntry
            key={view.edit ?? 'entry'}
            content={facts}
            localeTag={props.localeTag}
            state={props.entry}
            onChange={props.onEntryChange}
            formDirty={props.formDirty}
            onFormDirtyChange={props.onFormDirtyChange}
            confirm={props.confirm}
            editRequest={view.edit}
            coverage={coverage}
            onOpenReview={() => {
              setView({ mode: 'review' });
              setHeadingFocus((n) => n + 1);
            }}
          />

          {/* Navigation only: carries the validated Marja and assessment type, never any fact. */}
          <form action={props.formAction} onSubmit={confirmBack}>
            <input type="hidden" name="marja" value={props.marja} />
            <input type="hidden" name="assessment" value={props.workflow} />
            <IntentButton intent="back-to-summary" variant="outline" pending={props.pending}>
              {facts.actions.back}
            </IntentButton>
          </form>
        </>
      )}
    </>
  );
}

/** Decision 71: these entries come from a calculation saved on this device (edit or copy). */
function ReopenedNotice(props: {
  readonly reopened: ReopenRequest;
  readonly content: FactsContent['reopened'];
  readonly localeTag: string;
  readonly historyHref: string;
  readonly noRules: boolean;
}) {
  const { content, reopened } = props;
  const { label, savedAt } = reopened.saved;
  const date = new Intl.DateTimeFormat(props.localeTag, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(savedAt));
  const copy = reopened.mode === 'copy';
  return (
    <Alert variant="info" data-testid="reopened-notice">
      <History aria-hidden="true" />
      <AlertTitle>
        {formatMessage(copy ? content.copyTitle : content.editTitle, { label })}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>{copy ? content.copyBody : formatMessage(content.editBody, { date })}</p>
        {props.noRules && <p className="font-medium">{content.noRules}</p>}
        <p>
          <Link href={props.historyHref} className="underline underline-offset-4">
            {content.viewSaved}
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  );
}
