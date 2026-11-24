import type { Workflow } from '@khums/shared-types';

/**
 * Browser-only calculation history (owner decisions 2026-11-23 and 2026-11-24; decisions 65 and
 * 71): saved only when the person taps Save, on their own device; nothing is sent to a server.
 */
export interface HistoryContent {
  readonly metadataTitle: string;
  readonly title: string;
  readonly description: string;
  readonly privacy: { readonly title: string; readonly body: string };
  readonly loading: string;
  readonly empty: { readonly title: string; readonly body: string; readonly start: string };
  /** Browser storage is blocked (private browsing, settings): nothing can be shown or saved. */
  readonly unavailable: { readonly title: string; readonly body: string };
  /** Stored data from another version or damaged: not shown, removed by the next change. */
  readonly discarded: string;
  /** How many saved items could not be read ({count}), when known. */
  readonly unreadableCount: string;
  readonly listHeading: string;
  readonly count: string;
  readonly savedOn: string;
  readonly marja: string;
  readonly unknownMarja: string;
  readonly assessment: string;
  readonly workflows: Readonly<Record<Workflow, string>>;
  readonly pack: string;
  readonly version: string;
  readonly digest: string;
  readonly figures: string;
  readonly total: string;
  readonly period: string;
  readonly notCalculated: string;
  readonly openItems: string;
  /** Results saved before decision 71: figures only, cannot be edited or copied. */
  readonly legacyLabel: string;
  readonly legacyNote: string;
  readonly open: string;
  /** {label} */
  readonly openLabel: string;
  readonly back: string;
  /** The opened, read-only historical view ({date}, {packId}, {version}). */
  readonly historical: { readonly title: string; readonly body: string };
  readonly dates: string;
  readonly assessmentDate: string;
  readonly entries: string;
  readonly entryCount: string;
  readonly edit: { readonly button: string; readonly description: string };
  readonly copy: { readonly button: string; readonly description: string };
  readonly rename: {
    readonly button: string;
    readonly label: string;
    readonly save: string;
    readonly cancel: string;
    readonly required: string;
    readonly done: string;
  };
  readonly deleteOne: string;
  /** {label} */
  readonly deleteOneLabel: string;
  readonly deleteConfirm: {
    readonly title: string;
    readonly body: string;
    readonly confirm: string;
    readonly cancel: string;
  };
  readonly clearAll: string;
  readonly clearConfirm: {
    readonly title: string;
    readonly body: string;
    readonly confirm: string;
    readonly cancel: string;
  };
  readonly deleted: string;
  readonly cleared: string;
  readonly failed: string;
}
