import type { ClientSession, MongoClient } from 'mongodb';

import { TransactionConflictError } from './mongo-append-only-collection';

/**
 * Atomic units of work over a set of collections (M4.6.2b, shared by the governance API since
 * M4.6.4a). With MongoDB the work runs in one multi-document transaction (Atlas is a replica set):
 * every write commits together or none does. In memory (development/test only) operations run in
 * order without rollback, so services make every refusal decision before their first write.
 */
export type UnitOfWork<C> = <T>(work: (collections: C) => Promise<T>) => Promise<T>;

/** Thrown inside a unit of work to roll back and return `value` (a refusal or failure result). */
export class Rollback<T> extends Error {
  constructor(readonly value: T) {
    super('rollback');
  }
}

/** The value of a `Rollback`, or the error rethrown. */
function rollbackValue(error: unknown): unknown {
  if (error instanceof Rollback) return error.value;
  throw error;
}

/** DEVELOPMENT/TEST (and fail-closed stores): sequential, no rollback. */
export function sequentialUnitOfWork<C>(collections: C): UnitOfWork<C> {
  return async <T>(work: (collections: C) => Promise<T>) => {
    try {
      return await work(collections);
    } catch (error) {
      return rollbackValue(error) as T;
    }
  };
}

/** Attempts for a unit of work that loses a race for the next sequence of a chain. */
export const TRANSACTION_ATTEMPTS = 10;

/** Short randomized backoff between attempts, so racing writers spread out. */
const backoff = (attempt: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 20 * attempt)));

/**
 * MongoDB transactions with snapshot reads and majority, journaled writes. `bind(session)` returns
 * the collections bound to the transaction. A `TransactionConflictError` (a concurrent writer took
 * a chain sequence) retries the WHOLE unit of work, which re-reads everything, up to
 * `TRANSACTION_ATTEMPTS` times. Never run operations concurrently inside `work`: MongoDB does not
 * support concurrent operations on one transaction session.
 */
export function mongoUnitOfWork<C>(
  client: MongoClient,
  bind: (session: ClientSession) => C,
): UnitOfWork<C> {
  return async <T>(work: (collections: C) => Promise<T>) => {
    for (let attempt = 1; ; attempt += 1) {
      const session = client.startSession();
      try {
        const box: { result?: { value: T } } = {};
        // withTransaction retries transient errors and commit outcomes itself.
        await session.withTransaction(
          async () => {
            box.result = { value: await work(bind(session)) };
          },
          { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', journal: true } },
        );
        if (box.result === undefined) throw new Error('transaction produced no result');
        return box.result.value;
      } catch (error) {
        if (error instanceof TransactionConflictError && attempt < TRANSACTION_ATTEMPTS) {
          await backoff(attempt);
          continue;
        }
        return rollbackValue(error) as T;
      } finally {
        await session.endSession();
      }
    }
  };
}
