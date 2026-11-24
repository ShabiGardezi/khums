import { MongoNetworkError, MongoServerError, type Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

import { COLLECTIONS } from './collections';
import {
  inMemoryControlledCollection,
  unavailableControlledCollection,
} from './controlled-collection';
import { mongoControlledCollection } from './mongo-controlled-collection';

/** Controlled-update collections (M4.6.2b): insert, read, update; never delete. */

describe('in-memory controlled collection', () => {
  it('enforces unique indexes and has no delete operation', async () => {
    const accounts = inMemoryControlledCollection(COLLECTIONS.staffAccounts);
    expect(await accounts.insert({ principalId: 'p1', usernameKey: 'a' })).toEqual({
      kind: 'INSERTED',
    });
    expect(await accounts.insert({ principalId: 'p2', usernameKey: 'a' })).toEqual({
      kind: 'DUPLICATE',
      index: 'usernameKey_unique',
    });
    expect(Object.keys(accounts).sort()).toEqual([
      'find',
      'insert',
      'spec',
      'updateMany',
      'updateOne',
      'upsertAndGet',
    ]);
  });

  it('applies version-checked $set/$inc updates and matches null to missing fields', async () => {
    const accounts = inMemoryControlledCollection(COLLECTIONS.staffAccounts);
    await accounts.insert({ principalId: 'p1', usernameKey: 'a', version: 0, sessionEpoch: 0 });
    expect(
      await accounts.updateOne({ principalId: 'p1', version: 1 }, { set: { status: 'X' } }),
    ).toEqual({ ok: true, value: 0 });
    expect(
      await accounts.updateOne(
        { principalId: 'p1', version: 0 },
        { set: { status: 'SUSPENDED' }, inc: { version: 1, sessionEpoch: 1 } },
      ),
    ).toEqual({ ok: true, value: 1 });
    const found = await accounts.find({ principalId: 'p1', revokedAt: null });
    expect(found.ok && found.value).toEqual([
      { principalId: 'p1', usernameKey: 'a', version: 1, sessionEpoch: 1, status: 'SUSPENDED' },
    ]);
  });

  it('upserts atomically (throttle counters) and updates many (session revocation)', async () => {
    const throttles = inMemoryControlledCollection(COLLECTIONS.staffLoginThrottles);
    await throttles.upsertAndGet({ key: 'k' }, { inc: { failures: 1 } }, { throttledUntil: null });
    const second = await throttles.upsertAndGet(
      { key: 'k' },
      { inc: { failures: 1 } },
      { throttledUntil: null },
    );
    expect(second.ok && second.value).toEqual({ key: 'k', throttledUntil: null, failures: 2 });
    const sessions = inMemoryControlledCollection(COLLECTIONS.staffSessions);
    for (const h of ['a', 'b', 'c'])
      await sessions.insert({
        sessionIdHash: h,
        principalId: h === 'c' ? 'q' : 'p',
        revokedAt: null,
      });
    expect(
      await sessions.updateMany(
        { principalId: 'p', revokedAt: null },
        { set: { revokedAt: 'now' } },
      ),
    ).toEqual({ ok: true, value: 2 });
  });

  it('the unavailable collection fails closed', async () => {
    const none = unavailableControlledCollection(COLLECTIONS.staffSessions);
    expect(await none.insert({})).toEqual({ kind: 'UNAVAILABLE' });
    expect((await none.updateMany({}, {})).ok).toBe(false);
  });
});

describe('MongoDB controlled collection', () => {
  function fake(overrides: Record<string, unknown> = {}) {
    const ops = {
      insertOne: vi.fn(() => Promise.resolve({})),
      find: vi.fn(() => ({ toArray: () => Promise.resolve([{ key: 'k' }]) })),
      updateOne: vi.fn(() => Promise.resolve({ matchedCount: 1 })),
      updateMany: vi.fn(() => Promise.resolve({ matchedCount: 3 })),
      findOneAndUpdate: vi.fn(() => Promise.resolve({ key: 'k', failures: 1 })),
      ...overrides,
    };
    return { db: { collection: () => ops } as unknown as Db, ops };
  }

  it('maps $set/$inc, passes the transaction session and never reads _id', async () => {
    const { db, ops } = fake();
    const session = { id: 'tx' } as never;
    const sessions = mongoControlledCollection(db, COLLECTIONS.staffSessions, session);
    expect(
      await sessions.updateMany({ principalId: 'p', revokedAt: null }, { set: { revokedAt: 't' } }),
    ).toEqual({ ok: true, value: 3 });
    expect(ops.updateMany).toHaveBeenCalledWith(
      { principalId: 'p', revokedAt: null },
      { $set: { revokedAt: 't' } },
      { session },
    );
    await sessions.upsertAndGet({ key: 'k' }, { inc: { failures: 1 } }, { throttledUntil: null });
    expect(ops.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'k' },
      { $inc: { failures: 1 }, $setOnInsert: { throttledUntil: null } },
      { session, upsert: true, returnDocument: 'after', projection: { _id: 0 } },
    );
  });

  it('maps duplicate keys to the index and other errors to UNAVAILABLE', async () => {
    const dup = fake({
      insertOne: () =>
        Promise.reject(
          new MongoServerError({
            message: 'E11000 index: usernameKey_unique dup key',
            code: 11000,
          }),
        ),
    });
    expect(await mongoControlledCollection(dup.db, COLLECTIONS.staffAccounts).insert({})).toEqual({
      kind: 'DUPLICATE',
      index: 'usernameKey_unique',
    });
    const down = fake({ updateOne: () => Promise.reject(new MongoNetworkError('reset')) });
    expect(
      (await mongoControlledCollection(down.db, COLLECTIONS.staffAccounts).updateOne({}, {})).ok,
    ).toBe(false);
  });
});
