import type { ClientSession, Db, Document, UpdateFilter } from 'mongodb';

import { err, ok } from '@khums/utils';

import type { ControlledCollectionSpec } from './collections';
import type { ControlledCollection, MatchFilter, UpdateSpec } from './controlled-collection';
import { duplicateIndexName, rethrowIfTransient } from './mongo-append-only-collection';

/**
 * A controlled-update collection backed by MongoDB (M4.6.2b): `insertOne`, `find`, `updateOne`,
 * `updateMany` and `findOneAndUpdate` only; never a delete. With a `session`, every operation
 * runs inside that transaction. Errors are never logged or returned with their message.
 */
export function mongoControlledCollection(
  db: Db,
  spec: ControlledCollectionSpec,
  session?: ClientSession,
): ControlledCollection {
  const collection = db.collection(spec.name);
  const opts = session === undefined ? {} : { session };
  const toUpdate = (update: UpdateSpec): UpdateFilter<Document> => ({
    ...(update.set === undefined ? {} : { $set: { ...update.set } }),
    ...(update.inc === undefined ? {} : { $inc: { ...update.inc } }),
  });
  const toFilter = (filter: MatchFilter): Document => ({ ...filter });
  return {
    spec,
    insert: async (document) => {
      try {
        await collection.insertOne({ ...document }, opts);
        return { kind: 'INSERTED' };
      } catch (error) {
        rethrowIfTransient(error, session);
        const index = duplicateIndexName(error);
        return index === null ? { kind: 'UNAVAILABLE' } : { kind: 'DUPLICATE', index };
      }
    },
    find: async (filter, options) => {
      try {
        const cursor = collection.find(toFilter(filter), {
          ...opts,
          projection: { _id: 0 },
          ...(options === undefined
            ? {}
            : { sort: { [options.sort.field]: options.sort.direction } }),
          ...(options?.limit === undefined ? {} : { limit: options.limit }),
        });
        return ok(await cursor.toArray());
      } catch (error) {
        rethrowIfTransient(error, session);
        return err('UNAVAILABLE');
      }
    },
    updateOne: async (filter, update) => {
      try {
        return ok(
          (await collection.updateOne(toFilter(filter), toUpdate(update), opts)).matchedCount,
        );
      } catch (error) {
        rethrowIfTransient(error, session);
        return err('UNAVAILABLE');
      }
    },
    updateMany: async (filter, update) => {
      try {
        return ok(
          (await collection.updateMany(toFilter(filter), toUpdate(update), opts)).matchedCount,
        );
      } catch (error) {
        rethrowIfTransient(error, session);
        return err('UNAVAILABLE');
      }
    },
    upsertAndGet: async (filter, update, insertDefaults = {}) => {
      try {
        const updateDoc = toUpdate(update);
        const doc = await collection.findOneAndUpdate(
          toFilter(filter),
          { ...updateDoc, $setOnInsert: { ...insertDefaults } },
          { ...opts, upsert: true, returnDocument: 'after', projection: { _id: 0 } },
        );
        return doc === null ? err('UNAVAILABLE') : ok(doc);
      } catch (error) {
        rethrowIfTransient(error, session);
        return err('UNAVAILABLE');
      }
    },
  };
}
