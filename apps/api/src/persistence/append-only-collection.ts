import { err, ok, type Result } from '@khums/utils';

import type { AppendOnlyCollectionSpec } from './collections';

/**
 * The only way application code touches an append-only collection (M4.6.3a). There is no update,
 * replace or delete method, so history cannot be changed through this port even by mistake; the
 * database role (`khumsApp`) enforces the same for anything that bypasses it.
 *
 * Reads return `unknown`: every store validates documents with `@khums/validation` and verifies
 * chains in `@khums/core` before using them. Database documents are never trusted as shaped.
 */

/** Exact-equality filter on top-level fields. */
export type ExactFilter = Readonly<Record<string, string | number>>;

export type InsertOutcome =
  | { readonly kind: 'INSERTED' }
  /** A unique index rejected the document; `index` is the spec's index name. */
  | { readonly kind: 'DUPLICATE'; readonly index: string }
  /** The outcome is unknown (network, timeout, server error). Retrying must be idempotent. */
  | { readonly kind: 'UNAVAILABLE' };

export interface FindOptions {
  readonly sort: { readonly field: string; readonly direction: 1 | -1 };
  readonly limit?: number;
}

export interface AppendOnlyCollection {
  readonly spec: AppendOnlyCollectionSpec;
  insert(document: object): Promise<InsertOutcome>;
  find(
    filter: ExactFilter,
    options: FindOptions,
  ): Promise<Result<readonly unknown[], 'UNAVAILABLE'>>;
}

/**
 * DEVELOPMENT/TEST ONLY: process memory with the same unique-index semantics as the database
 * collection (documents are copied on the way in and out). Lost on restart.
 */
export function inMemoryAppendOnlyCollection(spec: AppendOnlyCollectionSpec): AppendOnlyCollection {
  const documents: Record<string, unknown>[] = [];
  const keyOf = (doc: object, fields: readonly string[]) =>
    JSON.stringify(fields.map((field) => (doc as Record<string, unknown>)[field] ?? null));
  return {
    spec,
    insert: (document) => {
      for (const index of spec.indexes) {
        if (!('unique' in index)) continue;
        const fields = Object.keys(index.key);
        const key = keyOf(document, fields);
        if (documents.some((existing) => keyOf(existing, fields) === key)) {
          return Promise.resolve({ kind: 'DUPLICATE', index: index.name });
        }
      }
      documents.push(structuredClone({ ...document }));
      return Promise.resolve({ kind: 'INSERTED' });
    },
    find: (filter, options) => {
      const matches = documents
        .filter((doc) => Object.entries(filter).every(([field, value]) => doc[field] === value))
        .sort((a, b) => {
          const x = a[options.sort.field];
          const y = b[options.sort.field];
          const order =
            typeof x === 'number' && typeof y === 'number'
              ? x - y
              : String(x).localeCompare(String(y));
          return order * options.sort.direction;
        });
      const limited = options.limit === undefined ? matches : matches.slice(0, options.limit);
      return Promise.resolve(ok(limited.map((doc) => structuredClone(doc))));
    },
  };
}

/** A collection whose store is not configured: every call fails closed. */
export function unavailableAppendOnlyCollection(
  spec: AppendOnlyCollectionSpec,
): AppendOnlyCollection {
  return {
    spec,
    insert: () => Promise.resolve({ kind: 'UNAVAILABLE' }),
    find: () => Promise.resolve(err('UNAVAILABLE')),
  };
}
