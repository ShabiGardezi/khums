import { err, ok, type Result } from '@khums/utils';

import type { FindOptions, InsertOutcome } from './append-only-collection';
import type { ControlledCollectionSpec } from './collections';

/**
 * The only way application code touches a controlled-update collection (`staffAccounts`,
 * `staffSessions`, `staffLoginThrottles`; M4.6.2b). Insert, read and field updates (`$set`,
 * `$inc`); there is NO delete: expiry is done by TTL indexes on the server, matching the
 * `khumsApp` role (find, insert, update; no remove). Reads return `unknown`: stores validate.
 */

/** Exact equality on top-level fields; `null` also matches a missing field. */
export type MatchFilter = Readonly<Record<string, string | number | boolean | null>>;

export interface UpdateSpec {
  readonly set?: Readonly<Record<string, unknown>>;
  readonly inc?: Readonly<Record<string, number>>;
}

export interface ControlledCollection {
  readonly spec: ControlledCollectionSpec;
  insert(document: object): Promise<InsertOutcome>;
  find(
    filter: MatchFilter,
    options?: FindOptions,
  ): Promise<Result<readonly unknown[], 'UNAVAILABLE'>>;
  /** Updates the first match; returns the number matched (0 or 1). */
  updateOne(filter: MatchFilter, update: UpdateSpec): Promise<Result<number, 'UNAVAILABLE'>>;
  updateMany(filter: MatchFilter, update: UpdateSpec): Promise<Result<number, 'UNAVAILABLE'>>;
  /**
   * Atomically updates the match, inserting `filter + insertDefaults` first when none exists, and
   * returns the document after the update (sign-in throttle counters).
   */
  upsertAndGet(
    filter: MatchFilter,
    update: UpdateSpec,
    insertDefaults?: Readonly<Record<string, unknown>>,
  ): Promise<Result<unknown, 'UNAVAILABLE'>>;
}

const matches = (doc: Record<string, unknown>, filter: MatchFilter) =>
  Object.entries(filter).every(([field, value]) => (doc[field] ?? null) === value);

function apply(doc: Record<string, unknown>, update: UpdateSpec): void {
  for (const [field, value] of Object.entries(update.set ?? {}))
    doc[field] = structuredClone(value);
  for (const [field, by] of Object.entries(update.inc ?? {})) {
    const current = doc[field];
    doc[field] = (typeof current === 'number' ? current : 0) + by;
  }
}

/**
 * DEVELOPMENT/TEST ONLY: process memory with the database's unique-index semantics. Operations are
 * synchronous inside one call, so each is atomic like its MongoDB counterpart.
 */
export function inMemoryControlledCollection(spec: ControlledCollectionSpec): ControlledCollection {
  const documents: Record<string, unknown>[] = [];
  const keyOf = (doc: Record<string, unknown>, fields: readonly string[]) =>
    JSON.stringify(fields.map((field) => doc[field] ?? null));
  const duplicateIndex = (candidate: Record<string, unknown>, except: object | null) => {
    for (const index of spec.indexes) {
      if (!('unique' in index)) continue;
      const fields = Object.keys(index.key);
      const key = keyOf(candidate, fields);
      if (documents.some((d) => d !== except && keyOf(d, fields) === key)) return index.name;
    }
    return null;
  };
  return {
    spec,
    insert: (document) => {
      const copy = structuredClone({ ...document }) as Record<string, unknown>;
      const index = duplicateIndex(copy, null);
      if (index !== null) return Promise.resolve({ kind: 'DUPLICATE', index });
      documents.push(copy);
      return Promise.resolve({ kind: 'INSERTED' });
    },
    find: (filter, options) => {
      let found = documents.filter((doc) => matches(doc, filter));
      if (options !== undefined) {
        const { field, direction } = options.sort;
        found = [...found].sort(
          (a, b) => String(a[field]).localeCompare(String(b[field])) * direction,
        );
        if (options.limit !== undefined) found = found.slice(0, options.limit);
      }
      return Promise.resolve(ok(found.map((doc) => structuredClone(doc))));
    },
    updateOne: (filter, update) => {
      const doc = documents.find((d) => matches(d, filter));
      if (doc === undefined) return Promise.resolve(ok(0));
      apply(doc, update);
      return Promise.resolve(ok(1));
    },
    updateMany: (filter, update) => {
      const docs = documents.filter((d) => matches(d, filter));
      for (const doc of docs) apply(doc, update);
      return Promise.resolve(ok(docs.length));
    },
    upsertAndGet: (filter, update, insertDefaults = {}) => {
      let doc = documents.find((d) => matches(d, filter));
      if (doc === undefined) {
        doc = structuredClone({ ...insertDefaults, ...filter });
        documents.push(doc);
      }
      apply(doc, update);
      return Promise.resolve(ok(structuredClone(doc)));
    },
  };
}

/** A collection whose store is not configured: every call fails closed. */
export function unavailableControlledCollection(
  spec: ControlledCollectionSpec,
): ControlledCollection {
  const unavailable = () => Promise.resolve(err('UNAVAILABLE' as const));
  return {
    spec,
    insert: () => Promise.resolve({ kind: 'UNAVAILABLE' }),
    find: unavailable,
    updateOne: unavailable,
    updateMany: unavailable,
    upsertAndGet: unavailable,
  };
}
