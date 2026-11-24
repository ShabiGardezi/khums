import {
  addSavedCalculation,
  MAX_SAVED_CALCULATIONS,
  emptySavedHistory,
  parseSavedHistory,
  removeSavedCalculation,
  renameSavedCalculation,
  serializeSavedHistory,
  type SavedCalculation,
  type SavedCalculationHistory,
  type SavedHistoryRead,
} from '@khums/core';

/**
 * Browser-only calculation history storage (owner decisions 2026-11-23 and 2026-11-24; decisions
 * 65 and 71). The history (saved calculations with their entries and answers, written only when
 * the user taps Save) lives ONLY in this browser's `localStorage`, under one key; nothing is ever
 * sent to a server, logged or put in a URL (CLAUDE.md rule 5). Every access is wrapped: storage
 * can be blocked (private browsing, settings) or full, and the page must still work.
 * Reading, checking and changing the history are pure functions from `@khums/core`.
 *
 * The key keeps its original name: the stored value carries its own `schemaVersion` (1 or 2), so
 * results saved before decision 71 stay readable without a second key.
 */

export const HISTORY_STORAGE_KEY = 'khums.savedCalculations.v1';

/** The part of the Web Storage API used here (a fake in tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * This browser's localStorage, or null when it cannot be reached at all (blocked site data, some
 * private modes: accessing it throws). Nothing is written to check it (audit L-1): with a full
 * quota a test write would fail, and the person could then neither see nor delete their saved
 * calculations to free space. A write that fails is reported by the write itself.
 */
export function browserStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export type HistoryLoad = SavedHistoryRead | { readonly status: 'UNAVAILABLE' };

export function loadHistory(storage: StorageLike | null): HistoryLoad {
  if (storage === null) return { status: 'UNAVAILABLE' };
  try {
    return parseSavedHistory(storage.getItem(HISTORY_STORAGE_KEY));
  } catch {
    return { status: 'UNAVAILABLE' };
  }
}

/** Why a write failed: `FULL` when the browser's storage quota is used up. */
export type WriteFailure = 'FAILED' | 'FULL';

const isQuotaError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');

function write(storage: StorageLike, history: SavedCalculationHistory): true | WriteFailure {
  let text: string;
  try {
    text = serializeSavedHistory(history);
  } catch {
    return 'FAILED';
  }
  try {
    storage.setItem(HISTORY_STORAGE_KEY, text);
  } catch (error) {
    return isQuotaError(error) ? 'FULL' : 'FAILED';
  }
  notify();
  return true;
}

// ── Change notifications (for React's useSyncExternalStore) ────────────────────────────

const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

/** Snapshot value when storage cannot be used at all. */
export const HISTORY_UNAVAILABLE = '\u0000unavailable';

/**
 * Subscribes to history changes made on this page (save, delete, clear) and in other tabs
 * (`storage` events). Returns the unsubscribe function.
 */
export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === HISTORY_STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * The stored text (a stable string snapshot: `''` when nothing is stored), or
 * `HISTORY_UNAVAILABLE`. Parse it with `historyFromSnapshot`.
 */
export function historySnapshot(storage: StorageLike | null = browserStorage()): string {
  if (storage === null) return HISTORY_UNAVAILABLE;
  try {
    return storage.getItem(HISTORY_STORAGE_KEY) ?? '';
  } catch {
    return HISTORY_UNAVAILABLE;
  }
}

export const historyFromSnapshot = (snapshot: string): HistoryLoad =>
  snapshot === HISTORY_UNAVAILABLE ? { status: 'UNAVAILABLE' } : parseSavedHistory(snapshot);

/**
 * Saves one entry (newest first), keeping every readable saved calculation. Unreadable stored
 * data (a damaged value, or entries that no longer verify) cannot be kept and is removed: the
 * save box warns about it before Save (`historyWarnings`). `FULL` when the browser has no room
 * left (nothing is saved; the existing history is unchanged).
 */
export function saveCalculation(
  storage: StorageLike | null,
  entry: SavedCalculation,
): 'SAVED' | WriteFailure {
  if (storage === null) return 'FAILED';
  const current = loadHistory(storage);
  const base = current.status === 'UNAVAILABLE' ? emptySavedHistory() : current.history;
  const result = write(storage, addSavedCalculation(base, entry));
  return result === true ? 'SAVED' : result;
}

/** Deletes one entry; returns the history now stored, or null when the change failed. */
export function deleteCalculation(
  storage: StorageLike | null,
  id: string,
): SavedCalculationHistory | null {
  if (storage === null) return null;
  const current = loadHistory(storage);
  if (current.status === 'UNAVAILABLE') return null;
  const next = removeSavedCalculation(current.history, id);
  return write(storage, next) === true ? next : null;
}

/** Renames one saved calculation; returns the history now stored, or null when it failed. */
export function renameCalculation(
  storage: StorageLike | null,
  id: string,
  label: string,
): SavedCalculationHistory | null {
  if (storage === null) return null;
  const current = loadHistory(storage);
  if (current.status === 'UNAVAILABLE') return null;
  const next = renameSavedCalculation(current.history, id, label);
  if (next === null) return null;
  return write(storage, next) === true ? next : null;
}

/** Removes the whole history (including unreadable data). */
export function clearHistory(storage: StorageLike | null): boolean {
  if (storage === null) return false;
  try {
    storage.removeItem(HISTORY_STORAGE_KEY);
    notify();
    return true;
  } catch {
    return false;
  }
}

/**
 * What the person must know before saving (audit M-3, L-5): whether unreadable stored data will be
 * removed by the save, and which saved calculation the save will push out when the history is at
 * its limit (null when none).
 */
export function historyWarnings(load: HistoryLoad): {
  readonly unreadable: boolean;
  readonly dropsOldest: SavedCalculationHistory['entries'][number] | null;
} {
  if (load.status === 'UNAVAILABLE' || load.status === 'EMPTY') {
    return { unreadable: false, dropsOldest: null };
  }
  const { entries } = load.history;
  return {
    unreadable: load.status === 'DISCARDED' || load.unreadable > 0,
    dropsOldest: entries.length >= MAX_SAVED_CALCULATIONS ? (entries.at(-1) ?? null) : null,
  };
}
