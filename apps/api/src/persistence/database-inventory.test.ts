import type { Document } from 'mongodb';
import { describe, expect, it } from 'vitest';

import { inventoryDatabase, type InventoryDb } from './database-inventory';

/** The read-only inventory (M5.3.3 hardening) against a fake database: what it reads and reports. */

function fakeDb(options: {
  hello: Document;
  collections: {
    name: string;
    docs: number;
    marked?: number;
    indexes: Document[];
    required?: string[];
  }[];
}) {
  const calls: string[] = [];
  const db: InventoryDb = {
    databaseName: 'khums',
    command: (command) => {
      calls.push(`command:${Object.keys(command)[0] ?? ''}`);
      return Promise.resolve('hello' in command ? options.hello : { version: '8.0.4' });
    },
    listCollections: () => ({
      toArray: () => {
        calls.push('listCollections');
        return Promise.resolve(
          options.collections.map((c) => ({
            name: c.name,
            type: 'collection',
            options:
              c.required === undefined
                ? {}
                : { validator: { $jsonSchema: { required: c.required } } },
          })),
        );
      },
    }),
    collection: (name) => {
      const c = options.collections.find((x) => x.name === name);
      return {
        listIndexes: () => ({
          toArray: () => {
            calls.push(`listIndexes:${name}`);
            return Promise.resolve(c?.indexes ?? []);
          },
        }),
        countDocuments: (filter?: Document) => {
          calls.push(`count:${name}`);
          return Promise.resolve(
            filter !== undefined && Object.keys(filter).length > 0
              ? (c?.marked ?? 0)
              : (c?.docs ?? 0),
          );
        },
      };
    },
  };
  return { db, calls };
}

describe('database inventory (read-only)', () => {
  it('reports transactions, existing and missing collections, indexes and marked test records', async () => {
    const { db, calls } = fakeDb({
      hello: { setName: 'atlas-x-shard-0', logicalSessionTimeoutMinutes: 30 },
      collections: [
        {
          name: 'auditEvents',
          docs: 12,
          marked: 3,
          indexes: [{ name: '_id_' }, { name: 'sequence_unique', unique: true }],
          required: ['eventId'],
        },
        { name: 'someOtherAppData', docs: 40, indexes: [{ name: '_id_' }] },
      ],
    });
    const report = await inventoryDatabase(db);
    expect(report).toMatchObject({
      database: 'khums',
      replicaSet: true,
      transactionsSupported: true,
      serverVersionMajor: 8,
    });
    const audit = report.collections.find((c) => c.name === 'auditEvents');
    expect(audit).toMatchObject({
      known: true,
      documents: 12,
      markedTestRecords: 3,
      missingIndexes: ['eventId_unique'],
      validatorRequired: ['eventId'],
    });
    expect(report.collections.find((c) => c.name === 'someOtherAppData')).toMatchObject({
      known: false,
      markedTestRecords: null,
    });
    expect(report.missingCollections).toContain('researchSources');
    // Only read operations are issued.
    expect(
      calls.every((c) =>
        /^(command:(hello|buildInfo)|listCollections|listIndexes:|count:)/.test(c),
      ),
    ).toBe(true);
  });

  it('reports no transaction support on a standalone server', async () => {
    const { db } = fakeDb({ hello: { isWritablePrimary: true }, collections: [] });
    expect(await inventoryDatabase(db)).toMatchObject({
      replicaSet: false,
      transactionsSupported: false,
    });
  });
});
