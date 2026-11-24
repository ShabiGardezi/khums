import {
  MongoError,
  MongoServerError,
  type ClientSession,
  type Db,
  type MongoClientOptions,
} from 'mongodb';

import { err, ok } from '@khums/utils';

import type { AppendOnlyCollection } from './append-only-collection';
import type { AppendOnlyCollectionSpec } from './collections';

/**
 * Client options for every connection (M4.6.3a). Majority, journaled writes and majority reads
 * from the primary: an acknowledged append survives failover, and a conflict check (unique
 * index) is always decided by the primary. Retryable writes are safe because every append is
 * idempotent by record identity.
 */
export const MONGO_CLIENT_OPTIONS: MongoClientOptions = {
  appName: 'khums-api',
  retryWrites: true,
  retryReads: true,
  writeConcern: { w: 'majority', journal: true },
  readConcern: { level: 'majority' },
  readPreference: 'primary',
  serverSelectionTimeoutMS: 5_000,
  connectTimeoutMS: 10_000,
  maxPoolSize: 10,
};

/** MongoDB duplicate-key error code. */
const DUPLICATE_KEY = 11000;

/**
 * Thrown inside a transaction when a concurrent transaction took the next chain sequence (the
 * transaction is aborted by the server). The staff store retries the WHOLE unit of work.
 */
export class TransactionConflictError extends Error {
  constructor() {
    super('transaction conflict');
  }
}

/**
 * Inside a transaction, errors the driver must see to retry (transient transaction errors) are
 * rethrown instead of being reported as `UNAVAILABLE`.
 */
export function rethrowIfTransient(error: unknown, session: ClientSession | undefined): void {
  if (
    session !== undefined &&
    error instanceof MongoError &&
    error.hasErrorLabel('TransientTransactionError')
  ) {
    throw error;
  }
}

/** Index name from a duplicate-key error (`... index: sequence_unique dup key: ...`). */
export function duplicateIndexName(error: unknown): string | null {
  if (!(error instanceof MongoServerError) || error.code !== DUPLICATE_KEY) return null;
  const match = /index: (\S+)/.exec(error.message);
  return match?.[1] ?? 'unknown';
}

/**
 * An append-only collection backed by MongoDB. Only `insertOne` and `find` are used; documents
 * are read without `_id`. Errors are never logged or returned with their message: duplicate-key
 * messages contain the key values.
 */
export function mongoAppendOnlyCollection(
  db: Db,
  spec: AppendOnlyCollectionSpec,
  session?: ClientSession,
  /** Inside a transaction: duplicates on these indexes abort and retry the unit of work. */
  conflictIndexes: readonly string[] = [],
): AppendOnlyCollection {
  const collection = db.collection(spec.name);
  const opts = session === undefined ? {} : { session };
  return {
    spec,
    insert: async (document) => {
      try {
        // A copy: the driver adds `_id` to the object it is given.
        await collection.insertOne({ ...document }, opts);
        return { kind: 'INSERTED' };
      } catch (error) {
        rethrowIfTransient(error, session);
        const index = duplicateIndexName(error);
        if (index !== null && session !== undefined && conflictIndexes.includes(index)) {
          throw new TransactionConflictError();
        }
        return index === null ? { kind: 'UNAVAILABLE' } : { kind: 'DUPLICATE', index };
      }
    },
    find: async (filter, options) => {
      try {
        const cursor = collection.find(
          { ...filter },
          {
            ...opts,
            projection: { _id: 0 },
            sort: { [options.sort.field]: options.sort.direction },
            ...(options.limit === undefined ? {} : { limit: options.limit }),
          },
        );
        return ok(await cursor.toArray());
      } catch (error) {
        rethrowIfTransient(error, session);
        return err('UNAVAILABLE');
      }
    },
  };
}
