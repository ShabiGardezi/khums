'use client';

import { Copy, FolderOpen, HardDrive, History, Pencil, SquarePen, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type SubmitEvent,
} from 'react';

import {
  formatFactAmount,
  isEditableSavedCalculation,
  MAX_SAVED_LABEL_LENGTH,
  type SavedHistoryEntry,
} from '@khums/core';
import { Alert, AlertDescription, AlertTitle } from '@khums/ui/components/alert';
import { buttonVariants } from '@khums/ui/components/button';
import { EmptyState } from '@khums/ui/components/empty-state';
import { Field } from '@khums/ui/components/field';
import { Input } from '@khums/ui/components/input';

import { useConfirmDialog } from '@/components/common/confirm-dialog';
import type { HistoryContent } from '@/content/history/types';
import { formatMessage } from '@/i18n/format';
import {
  browserStorage,
  clearHistory,
  deleteCalculation,
  historyFromSnapshot,
  historySnapshot,
  renameCalculation,
  subscribeHistory,
} from '@/lib/history-storage';
import { requestReopen } from '@/lib/reopen-request';

const readSnapshot = () => historySnapshot();
/** On the server (and the first client render) nothing is read: storage is browser-only. */
const serverSnapshot = () => null;

export interface HistoryListProps {
  readonly content: HistoryContent;
  readonly localeTag: string;
  /** Catalogue Marja names in this locale, by id (names are never stored with the entries). */
  readonly marjaNames: Readonly<Record<string, string>>;
  readonly startHref: string;
  /** The calculator (onboarding flow), where a saved calculation is opened to edit or copy. */
  readonly calculatorHref: string;
}

/**
 * The browser-only history (owner decisions 2026-11-23 and 2026-11-24; decisions 65 and 71).
 * Reads this browser's storage after mounting (never on the server) and lists each saved
 * calculation. "Open" shows its figures exactly as saved (historical, never recalculated); from
 * there it can be renamed, edited and recalculated, copied to a new year (both in the calculator,
 * handed over in page memory only) or deleted. Delete one and delete all are confirmed. Nothing is
 * sent anywhere.
 */
export function HistoryList(props: HistoryListProps) {
  const { content } = props;
  const snapshot = useSyncExternalStore(subscribeHistory, readSnapshot, serverSnapshot);
  const load = useMemo(
    () => (snapshot === null ? null : historyFromSnapshot(snapshot)),
    [snapshot],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { dialog, confirm } = useConfirmDialog();
  const listId = useId();
  const listHeading = useRef<HTMLHeadingElement>(null);
  const [focusList, setFocusList] = useState(0);
  useEffect(() => {
    if (focusList > 0) listHeading.current?.focus();
  }, [focusList]);
  const router = useRouter();

  if (load === null) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {content.loading}
      </p>
    );
  }

  const privacy = (
    <Alert variant="info">
      <HardDrive aria-hidden="true" />
      <AlertTitle>{content.privacy.title}</AlertTitle>
      <AlertDescription>
        <p>{content.privacy.body}</p>
      </AlertDescription>
    </Alert>
  );

  if (load.status === 'UNAVAILABLE') {
    return (
      <div className="flex flex-col gap-6">
        {privacy}
        <Alert variant="warning">
          <HardDrive aria-hidden="true" />
          <AlertTitle>{content.unavailable.title}</AlertTitle>
          <AlertDescription>
            <p>{content.unavailable.body}</p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const entries = load.history.entries;
  // Audit M-3: unreadable stored data is not shown and is removed by the next change.
  const unreadable = load.status === 'OK' ? load.unreadable : 0;
  const hasUnreadable = load.status === 'DISCARDED' || unreadable > 0;
  const dateOf = (iso: string) =>
    new Intl.DateTimeFormat(props.localeTag, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );
  const labelOf = (entry: SavedHistoryEntry) =>
    isEditableSavedCalculation(entry) ? entry.label : content.legacyLabel;
  const marjaNameOf = (entry: SavedHistoryEntry) =>
    Object.hasOwn(props.marjaNames, entry.marjaId)
      ? (props.marjaNames[entry.marjaId] ?? entry.marjaId)
      : formatMessage(content.unknownMarja, { id: entry.marjaId });

  const backToList = () => {
    setOpenId(null);
    setFocusList((n) => n + 1);
  };

  const removeOne = async (entry: SavedHistoryEntry) => {
    const ok = await confirm({
      title: content.deleteConfirm.title,
      body: content.deleteConfirm.body,
      confirmLabel: content.deleteConfirm.confirm,
      cancelLabel: content.deleteConfirm.cancel,
    });
    if (!ok) return;
    if (deleteCalculation(browserStorage(), entry.id) === null) {
      setMessage(content.failed);
      return;
    }
    setMessage(content.deleted);
    if (openId === entry.id) backToList();
  };

  const removeAll = async () => {
    const ok = await confirm({
      title: content.clearConfirm.title,
      body: content.clearConfirm.body,
      confirmLabel: content.clearConfirm.confirm,
      cancelLabel: content.clearConfirm.cancel,
    });
    if (!ok) return;
    if (!clearHistory(browserStorage())) {
      setMessage(content.failed);
      return;
    }
    setMessage(content.cleared);
  };

  const reopen = (entry: SavedHistoryEntry, mode: 'edit' | 'copy') => {
    if (!isEditableSavedCalculation(entry)) return;
    // Page memory only: the entries never go into the URL or to the server.
    requestReopen({ saved: entry, mode });
    router.push(props.calculatorHref);
  };

  // An opened entry that is no longer stored (deleted here or in another tab) shows the list.
  const opened = openId === null ? undefined : entries.find((e) => e.id === openId);

  return (
    <div className="flex flex-col gap-6">
      {privacy}
      {hasUnreadable && (
        <Alert variant="warning" data-testid="history-unreadable">
          <History aria-hidden="true" />
          <AlertDescription className="flex flex-col gap-1">
            <p>{content.discarded}</p>
            {unreadable > 0 && (
              <p className="font-medium">
                {formatMessage(content.unreadableCount, {
                  count: new Intl.NumberFormat(props.localeTag).format(unreadable),
                })}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
      {opened !== undefined ? (
        <SavedCalculationView
          entry={opened}
          content={content}
          localeTag={props.localeTag}
          label={labelOf(opened)}
          marjaName={marjaNameOf(opened)}
          savedOn={dateOf(opened.savedAt)}
          onBack={backToList}
          onDelete={() => void removeOne(opened)}
          onEdit={() => {
            reopen(opened, 'edit');
          }}
          onCopy={() => {
            reopen(opened, 'copy');
          }}
          onRenamed={() => {
            setMessage(content.rename.done);
          }}
          onRenameFailed={() => {
            setMessage(content.failed);
          }}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<History />}
          title={content.empty.title}
          description={content.empty.body}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link href={props.startHref} className={buttonVariants({ variant: 'outline' })}>
                {content.empty.start}
              </Link>
              {hasUnreadable && (
                <button
                  type="button"
                  onClick={() => void removeAll()}
                  className={buttonVariants({ variant: 'ghost' })}
                >
                  {content.clearAll}
                </button>
              )}
            </div>
          }
        />
      ) : (
        <section aria-labelledby={listId} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id={listId}
              ref={listHeading}
              tabIndex={-1}
              className="text-lg font-semibold focus-visible:outline-none"
            >
              {content.listHeading}{' '}
              <span className="text-muted-foreground text-sm font-normal">
                {formatMessage(content.count, {
                  count: new Intl.NumberFormat(props.localeTag).format(entries.length),
                })}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => void removeAll()}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Trash2 aria-hidden="true" />
              {content.clearAll}
            </button>
          </div>
          <ul className="flex flex-col gap-4">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-lg border p-4" data-testid="saved-calculation">
                <SavedEntrySummary
                  entry={entry}
                  content={content}
                  label={labelOf(entry)}
                  marjaName={marjaNameOf(entry)}
                  savedOn={dateOf(entry.savedAt)}
                  onOpen={() => {
                    setMessage(null);
                    setOpenId(entry.id);
                  }}
                  onDelete={() => void removeOne(entry)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {dialog}
    </div>
  );
}

/** One row of the list: name, when, Marja, assessment type and pack version. */
function SavedEntrySummary(props: {
  readonly entry: SavedHistoryEntry;
  readonly content: HistoryContent;
  readonly label: string;
  readonly marjaName: string;
  readonly savedOn: string;
  readonly onOpen: () => void;
  readonly onDelete: () => void;
}) {
  const { entry, content } = props;
  const headingId = useId();
  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="font-semibold">
        {props.label}
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{content.savedOn}</dt>
        <dd>{props.savedOn}</dd>
        <dt className="text-muted-foreground">{content.marja}</dt>
        <dd>{props.marjaName}</dd>
        <dt className="text-muted-foreground">{content.assessment}</dt>
        <dd>{content.workflows[entry.workflow]}</dd>
        <dt className="text-muted-foreground">{content.version}</dt>
        <dd dir="ltr" className="text-start font-mono">
          {entry.rulePack.version}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={props.onOpen}
          aria-label={formatMessage(content.openLabel, { label: props.label })}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <FolderOpen aria-hidden="true" />
          {content.open}
        </button>
        <button
          type="button"
          onClick={props.onDelete}
          aria-label={formatMessage(content.deleteOneLabel, { label: props.label })}
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          <Trash2 aria-hidden="true" />
          {content.deleteOne}
        </button>
      </div>
    </article>
  );
}

/**
 * An opened saved calculation: the figures exactly as saved, clearly marked with the date and the
 * pack version (historical, read-only, never recalculated), and the actions.
 */
function SavedCalculationView(props: {
  readonly entry: SavedHistoryEntry;
  readonly content: HistoryContent;
  readonly localeTag: string;
  readonly label: string;
  readonly marjaName: string;
  readonly savedOn: string;
  readonly onBack: () => void;
  readonly onDelete: () => void;
  readonly onEdit: () => void;
  readonly onCopy: () => void;
  readonly onRenamed: () => void;
  readonly onRenameFailed: () => void;
}) {
  const { entry, content } = props;
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const editable = isEditableSavedCalculation(entry) ? entry : null;
  const [renaming, setRenaming] = useState(false);
  const money = (amount: string) =>
    formatFactAmount(amount, entry.currency, props.localeTag) ?? `${amount} ${entry.currency}`;
  const context = editable?.sheet.context;

  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-5" data-testid="saved-view">
      <div>
        <button
          type="button"
          onClick={props.onBack}
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          {content.back}
        </button>
      </div>
      <h2
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className="text-xl font-semibold focus-visible:outline-none"
      >
        {props.label}
      </h2>

      <Alert variant="info" data-testid="historical-notice">
        <History aria-hidden="true" />
        <AlertTitle>{content.historical.title}</AlertTitle>
        <AlertDescription>
          <p>
            {formatMessage(content.historical.body, {
              date: props.savedOn,
              packId: entry.rulePack.packId,
              version: entry.rulePack.version,
            })}
          </p>
        </AlertDescription>
      </Alert>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{content.savedOn}</dt>
        <dd>{props.savedOn}</dd>
        <dt className="text-muted-foreground">{content.marja}</dt>
        <dd>{props.marjaName}</dd>
        <dt className="text-muted-foreground">{content.assessment}</dt>
        <dd>{content.workflows[entry.workflow]}</dd>
        {context !== undefined && (
          <>
            <dt className="text-muted-foreground">
              {context.workflow === 'annual' ? content.dates : content.assessmentDate}
            </dt>
            <dd dir="ltr" className="text-start">
              {context.workflow === 'annual'
                ? formatMessage(content.period, {
                    start: context.period.start,
                    end: context.period.end,
                  })
                : context.assessmentDate}
            </dd>
          </>
        )}
        {editable !== null && (
          <>
            <dt className="text-muted-foreground">{content.entries}</dt>
            <dd>
              {formatMessage(content.entryCount, {
                count: new Intl.NumberFormat(props.localeTag).format(editable.sheet.facts.length),
              })}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">{content.pack}</dt>
        <dd dir="ltr" className="text-start font-mono">
          {entry.rulePack.packId}
        </dd>
        <dt className="text-muted-foreground">{content.version}</dt>
        <dd dir="ltr" className="text-start font-mono">
          {entry.rulePack.version}
        </dd>
        <dt className="text-muted-foreground">{content.digest}</dt>
        <dd dir="ltr" className="text-start font-mono break-all">
          {entry.rulePack.contentDigest}
        </dd>
      </dl>

      {entry.sections.map((section, index) => (
        <section key={index} className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">
            {section.period === null
              ? entry.workflow === 'missed-year'
                ? content.total
                : content.figures
              : formatMessage(content.period, {
                  start: section.period.start,
                  end: section.period.end,
                })}
          </h3>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            {section.figures.map((figure) => (
              <div key={figure.id} className="contents">
                <dt>
                  <span lang="en" dir="ltr">
                    {figure.label}
                  </span>
                </dt>
                <dd className="text-end font-semibold tabular-nums">
                  {figure.amount === null ? content.notCalculated : money(figure.amount)}
                </dd>
              </div>
            ))}
          </dl>
          {section.status !== 'COMPLETED' && (
            <p className="text-warning-strong text-sm">{content.openItems}</p>
          )}
        </section>
      ))}

      {editable === null ? (
        <p className="text-muted-foreground text-sm">{content.legacyNote}</p>
      ) : renaming ? (
        <RenameForm
          id={editable.id}
          label={editable.label}
          content={content.rename}
          onDone={(ok) => {
            setRenaming(false);
            if (ok) props.onRenamed();
            else props.onRenameFailed();
          }}
          onCancel={() => {
            setRenaming(false);
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={props.onEdit}
              className={buttonVariants({ variant: 'primary' })}
            >
              <SquarePen aria-hidden="true" />
              {content.edit.button}
            </button>
            <button
              type="button"
              onClick={props.onCopy}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Copy aria-hidden="true" />
              {content.copy.button}
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(true);
              }}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Pencil aria-hidden="true" />
              {content.rename.button}
            </button>
          </div>
          <ul className="text-muted-foreground flex list-disc flex-col gap-1 ps-5 text-sm">
            <li>{content.edit.description}</li>
            <li>{content.copy.description}</li>
          </ul>
        </div>
      )}
      <div>
        <button
          type="button"
          onClick={props.onDelete}
          aria-label={formatMessage(content.deleteOneLabel, { label: props.label })}
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          <Trash2 aria-hidden="true" />
          {content.deleteOne}
        </button>
      </div>
    </article>
  );
}

function RenameForm(props: {
  readonly id: string;
  readonly label: string;
  readonly content: HistoryContent['rename'];
  readonly onDone: (ok: boolean) => void;
  readonly onCancel: () => void;
}) {
  const { content } = props;
  const [name, setName] = useState(props.label);
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const label = name.trim();
    if (label === '' || label.length > MAX_SAVED_LABEL_LENGTH) {
      setError(true);
      input.current?.focus();
      return;
    }
    props.onDone(renameCalculation(browserStorage(), props.id, label) !== null);
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <Field
        label={content.label}
        error={error ? content.required : undefined}
        required
        className="max-w-md"
      >
        <Input
          ref={input}
          value={name}
          maxLength={MAX_SAVED_LABEL_LENGTH}
          onChange={(event) => {
            setName(event.target.value);
            setError(false);
          }}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={buttonVariants({ variant: 'primary' })}>
          {content.save}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className={buttonVariants({ variant: 'outline' })}
        >
          {content.cancel}
        </button>
      </div>
    </form>
  );
}
