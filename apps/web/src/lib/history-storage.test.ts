import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SavedCalculation } from '@khums/core';

import {
  browserStorage,
  clearHistory,
  deleteCalculation,
  HISTORY_STORAGE_KEY,
  historyWarnings,
  loadHistory,
  renameCalculation,
  saveCalculation,
  type StorageLike,
} from './history-storage';

/** Browser-only history storage (decisions 65, 71). TEST values only. */

class MemoryStorage implements StorageLike {
  readonly items = new Map<string, string>();
  writes = 0;
  constructor(private readonly failWrites: false | 'ERROR' | 'QUOTA' = false) {}
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites === 'ERROR') throw new Error('write failed');
    // What browsers throw when the storage quota is used up.
    if (this.failWrites === 'QUOTA') throw new DOMException('full', 'QuotaExceededError');
    this.writes += 1;
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('SecurityError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

const figuresOnly = (id: string) => ({
  id,
  savedAt: '2026-11-23T10:00:00.000Z',
  marjaId: 'sistani',
  workflow: 'annual' as const,
  rulePack: { packId: 'test-public-pack', version: '1.0.0', contentDigest: 'c'.repeat(64) },
  engineVersion: '0.2.0',
  currency: 'GBP',
  sections: [
    {
      period: null,
      status: 'COMPLETED' as const,
      figures: [{ id: 'o', label: 'TEST', amount: '25' }],
    },
  ],
});
const entry = (id: string): SavedCalculation => ({
  ...figuresOnly(id),
  label: 'TEST year',
  sheet: {
    schemaVersion: 1,
    currency: 'GBP',
    context: { workflow: 'annual', period: { start: '2025-07-01', end: '2026-06-30' } },
    facts: [],
  },
  answers: {},
  yearAnswers: {},
  factAnswers: {},
});
const A = '0f0e0d0c-0b0a-4908-8706-050403020100';
const B = '1f0e0d0c-0b0a-4908-8706-050403020100';

describe('history storage', () => {
  it('saves (newest first), reads back, deletes one and clears all under one versioned key', () => {
    const storage = new MemoryStorage();
    expect(loadHistory(storage).status).toBe('EMPTY');
    expect(saveCalculation(storage, entry(A))).toBe('SAVED');
    expect(saveCalculation(storage, entry(B))).toBe('SAVED');
    const loaded = loadHistory(storage);
    expect(loaded.status).toBe('OK');
    if (loaded.status !== 'OK') return;
    expect(loaded.history.entries.map((e) => e.id)).toEqual([B, A]);
    expect(JSON.parse(storage.items.get(HISTORY_STORAGE_KEY) ?? '')).toMatchObject({
      schemaVersion: 2,
    });
    expect(deleteCalculation(storage, B)?.entries.map((e) => e.id)).toEqual([A]);
    expect(clearHistory(storage)).toBe(true);
    expect(storage.items.has(HISTORY_STORAGE_KEY)).toBe(false);
  });

  it('ignores unreadable data, and replaces it on the next save', () => {
    const storage = new MemoryStorage();
    storage.items.set(HISTORY_STORAGE_KEY, '{"schemaVersion":99}');
    expect(loadHistory(storage)).toMatchObject({ status: 'DISCARDED', history: { entries: [] } });
    expect(historyWarnings(loadHistory(storage)).unreadable).toBe(true);
    expect(saveCalculation(storage, entry(A))).toBe('SAVED');
    expect(loadHistory(storage)).toMatchObject({ status: 'OK', unreadable: 0 });
  });

  it('never throws when storage is missing, blocked or full', () => {
    expect(loadHistory(null)).toEqual({ status: 'UNAVAILABLE' });
    expect(loadHistory(throwing)).toEqual({ status: 'UNAVAILABLE' });
    expect(saveCalculation(null, entry(A))).toBe('FAILED');
    expect(saveCalculation(throwing, entry(A))).toBe('FAILED');
    expect(saveCalculation(new MemoryStorage('ERROR'), entry(A))).toBe('FAILED');
    expect(renameCalculation(null, A, 'x')).toBeNull();
    expect(renameCalculation(throwing, A, 'x')).toBeNull();
    expect(deleteCalculation(null, A)).toBeNull();
    expect(deleteCalculation(throwing, A)).toBeNull();
    expect(clearHistory(null)).toBe(false);
    expect(clearHistory(throwing)).toBe(false);
  });

  it('reports a full storage quota clearly and keeps the existing history', () => {
    const storage = new MemoryStorage();
    saveCalculation(storage, entry(A));
    const before = storage.items.get(HISTORY_STORAGE_KEY);
    const full = Object.assign(Object.create(storage) as MemoryStorage, {
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    });
    expect(saveCalculation(full, entry(B))).toBe('FULL');
    expect(saveCalculation(new MemoryStorage('QUOTA'), entry(A))).toBe('FULL');
    expect(storage.items.get(HISTORY_STORAGE_KEY)).toBe(before);
  });

  it('renames a saved calculation in place', () => {
    const storage = new MemoryStorage();
    saveCalculation(storage, entry(A));
    saveCalculation(storage, entry(B));
    expect(renameCalculation(storage, A, 'Khums year 1446')?.entries.map((e) => e.id)).toEqual([
      B,
      A,
    ]);
    const loaded = loadHistory(storage);
    expect(loaded.status === 'OK' && loaded.history.entries[1]).toMatchObject({
      label: 'Khums year 1446',
    });
    expect(renameCalculation(storage, A, '  ')).toBeNull();
  });

  it('keeps results saved by version 1 (figures only) readable, next to new ones', () => {
    const storage = new MemoryStorage();
    storage.items.set(
      HISTORY_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, entries: [figuresOnly(A)] }),
    );
    expect(loadHistory(storage)).toMatchObject({ status: 'OK', history: { entries: [{ id: A }] } });
    expect(saveCalculation(storage, entry(B))).toBe('SAVED');
    const loaded = loadHistory(storage);
    expect(loaded.status === 'OK' && loaded.history.entries.map((e) => e.id)).toEqual([B, A]);
    // Version 1 entries cannot be renamed (they have no name or entries).
    expect(renameCalculation(storage, A, 'Name')).toBeNull();
  });

  it('refuses to store an entry that does not match the schema', () => {
    const storage = new MemoryStorage();
    expect(saveCalculation(storage, { ...entry(A), id: 'not-a-uuid' })).toBe('FAILED');
    expect(storage.writes).toBe(0);
  });
});

describe('history snapshots', () => {
  it('reads a stable text snapshot and parses it', async () => {
    const { historySnapshot, historyFromSnapshot, HISTORY_UNAVAILABLE } =
      await import('./history-storage');
    const storage = new MemoryStorage();
    expect(historySnapshot(storage)).toBe('');
    expect(historyFromSnapshot('').status).toBe('EMPTY');
    saveCalculation(storage, entry(A));
    expect(historyFromSnapshot(historySnapshot(storage)).status).toBe('OK');
    expect(historySnapshot(throwing)).toBe(HISTORY_UNAVAILABLE);
    expect(historyFromSnapshot(HISTORY_UNAVAILABLE)).toEqual({ status: 'UNAVAILABLE' });
  });
});

describe('audit fixes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // L-1: a full quota must not look like "unavailable"; the person can still view and delete.
  it('reaches storage without writing to it, so a full quota still shows and deletes', () => {
    const storage = new MemoryStorage();
    saveCalculation(storage, entry(A));
    saveCalculation(storage, entry(B));
    // Full: only a write that GROWS the stored data fails (as in browsers).
    const full: StorageLike = {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => {
        if (value.length > (storage.getItem(key) ?? '').length) {
          throw new DOMException('full', 'QuotaExceededError');
        }
        storage.setItem(key, value);
      },
      removeItem: (key) => {
        storage.removeItem(key);
      },
    };
    const setItem = vi.fn((key: string, value: string) => {
      full.setItem(key, value);
    });
    vi.stubGlobal('window', { localStorage: { ...full, setItem } });
    const reached = browserStorage();
    expect(reached).not.toBeNull();
    expect(setItem).not.toHaveBeenCalled();
    expect(loadHistory(reached).status).toBe('OK');
    expect(deleteCalculation(reached, B)?.entries.map((e) => e.id)).toEqual([A]);
    expect(saveCalculation(reached, entry(B))).toBe('FULL');
  });

  it('is unavailable only when storage itself cannot be reached', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    expect(browserStorage()).toBeNull();
  });

  // M-3: one unreadable entry keeps the others; the save box is told first.
  it('keeps readable entries next to an unreadable one, and warns before a save removes it', () => {
    const storage = new MemoryStorage();
    storage.items.set(
      HISTORY_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 2, entries: [entry(A), { ...entry(B), id: 'broken' }] }),
    );
    const loaded = loadHistory(storage);
    expect(loaded).toMatchObject({ status: 'OK', unreadable: 1 });
    expect(historyWarnings(loaded)).toEqual({ unreadable: true, dropsOldest: null });
    expect(saveCalculation(storage, entry(B))).toBe('SAVED');
    const after = loadHistory(storage);
    expect(after.status === 'OK' && after.history.entries.map((e) => e.id)).toEqual([B, A]);
    expect(historyWarnings(after)).toEqual({ unreadable: false, dropsOldest: null });
    storage.items.set(HISTORY_STORAGE_KEY, 'garbage');
    expect(historyWarnings(loadHistory(storage)).unreadable).toBe(true);
    expect(historyWarnings({ status: 'UNAVAILABLE' })).toEqual({
      unreadable: false,
      dropsOldest: null,
    });
  });

  // L-5: at the limit, the save box names the saved calculation the save will remove.
  it('names the oldest saved calculation when the history is full', () => {
    const storage = new MemoryStorage();
    const ids = Array.from(
      { length: 50 },
      (_, i) => `${i.toString(16).padStart(8, '0')}-0b0a-4908-8706-050403020100`,
    );
    for (const id of ids) saveCalculation(storage, entry(id));
    expect(historyWarnings(loadHistory(storage)).dropsOldest?.id).toBe(ids[0]);
    storage.items.clear();
    for (const id of ids.slice(1)) saveCalculation(storage, entry(id));
    expect(historyWarnings(loadHistory(storage)).dropsOldest).toBeNull();
  });
});
