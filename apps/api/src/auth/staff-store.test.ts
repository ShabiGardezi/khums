import { MongoServerError, type Db, type MongoClient } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

import { COLLECTIONS } from '../persistence/collections';
import {
  mongoAppendOnlyCollection,
  rethrowIfTransient,
  TransactionConflictError,
} from '../persistence/mongo-append-only-collection';
import { mongoStaffStore, Rollback, TRANSACTION_ATTEMPTS } from './staff-store';

/** Transaction behaviour of the MongoDB staff store, with a fake driver session (M4.6.2b). */

function fakeClient() {
  const sessions: { ended: boolean }[] = [];
  const client = {
    startSession: () => {
      const session = {
        ended: false,
        withTransaction: async (fn: () => Promise<void>) => fn(),
        endSession: () => {
          session.ended = true;
          return Promise.resolve();
        },
      };
      sessions.push(session);
      return session;
    },
  };
  const db = { collection: () => ({}) } as unknown as Db;
  return { client: client as unknown as MongoClient, db, sessions };
}

const transient = () => {
  const error = new MongoServerError({ message: 'WriteConflict', code: 112 });
  error.addErrorLabel('TransientTransactionError');
  return error;
};

describe('MongoDB staff store transactions', () => {
  it('retries the whole unit of work after losing the race for the next audit sequence', async () => {
    const { client, db, sessions } = fakeClient();
    const store = mongoStaffStore(db, client);
    let calls = 0;
    const result = await store.atomically(() => {
      calls += 1;
      if (calls < 3) throw new TransactionConflictError();
      return Promise.resolve('committed');
    });
    expect(result).toBe('committed');
    expect(calls).toBe(3);
    expect(sessions.every((s) => s.ended)).toBe(true);
  });

  it('gives up after a bounded number of attempts (no endless retry)', async () => {
    const { client, db } = fakeClient();
    const work = vi.fn(() => Promise.reject(new TransactionConflictError()));
    await expect(mongoStaffStore(db, client).atomically(work)).rejects.toBeInstanceOf(
      TransactionConflictError,
    );
    expect(work).toHaveBeenCalledTimes(TRANSACTION_ATTEMPTS);
  });

  it('returns a Rollback value (refusals abort the transaction)', async () => {
    const { client, db } = fakeClient();
    expect(
      await mongoStaffStore(db, client).atomically(() => Promise.reject(new Rollback('refused'))),
    ).toBe('refused');
  });

  it('inside a transaction, transient driver errors reach the driver and sequence duplicates become conflicts', async () => {
    expect(() => {
      rethrowIfTransient(transient(), {} as never);
    }).toThrow('WriteConflict');
    expect(() => {
      rethrowIfTransient(transient(), undefined);
    }).not.toThrow();
    const duplicate = new MongoServerError({
      message: 'E11000 index: sequence_unique dup key',
      code: 11000,
    });
    const db = {
      collection: () => ({ insertOne: () => Promise.reject(duplicate) }),
    } as unknown as Db;
    const inTx = mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents, {} as never, [
      'sequence_unique',
    ]);
    await expect(inTx.insert({})).rejects.toBeInstanceOf(TransactionConflictError);
    const outside = mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents);
    expect(await outside.insert({})).toEqual({ kind: 'DUPLICATE', index: 'sequence_unique' });
    const transientDb = {
      collection: () => ({ insertOne: () => Promise.reject(transient()) }),
    } as unknown as Db;
    await expect(
      mongoAppendOnlyCollection(transientDb, COLLECTIONS.auditEvents, {} as never).insert({}),
    ).rejects.toThrow('WriteConflict');
  });
});
