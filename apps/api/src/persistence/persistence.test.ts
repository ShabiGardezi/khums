import { MongoNetworkError, MongoServerError, type Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

import {
  inMemoryAppendOnlyCollection,
  unavailableAppendOnlyCollection,
} from './append-only-collection';
import { ALL_COLLECTIONS, COLLECTIONS } from './collections';
import { printMigrationManifest } from './operator-commands';
import type { migrationManifest } from './migration-manifest';
import { databaseRoles, privilegesOf, type AtlasCustomRole } from './database-roles';
import {
  migrateDatabase,
  validatorOf,
  type MigrationDb,
  migrateResearchCollections,
  RESEARCH_COLLECTION_NAMES,
} from './migrate';
import {
  duplicateIndexName,
  MONGO_CLIENT_OPTIONS,
  mongoAppendOnlyCollection,
} from './mongo-append-only-collection';

/** Persistence foundation (M4.6.3a): adapters, collection specs, roles and migration. */

const duplicate = (index: string) =>
  new MongoServerError({
    message: `E11000 duplicate key error collection: khums.auditEvents index: ${index} dup key: { sequence: 3 }`,
    code: 11000,
  });

describe('in-memory append-only collection (same semantics as the database)', () => {
  it('enforces every unique index, including compound ones', async () => {
    const ledger = inMemoryAppendOnlyCollection(COLLECTIONS.governanceLedgerRecords);
    const record = { packId: 'p', version: '1.0.0', sequence: 0, recordId: 'p@1.0.0#0' };
    expect(await ledger.insert(record)).toEqual({ kind: 'INSERTED' });
    expect(await ledger.insert({ ...record, recordId: 'other' })).toEqual({
      kind: 'DUPLICATE',
      index: 'ledger_sequence_unique',
    });
    expect(await ledger.insert({ ...record, sequence: 1 })).toEqual({
      kind: 'DUPLICATE',
      index: 'recordId_unique',
    });
    // Same sequence in another pack version is fine.
    expect(await ledger.insert({ ...record, version: '1.0.1', recordId: 'p@1.0.1#0' })).toEqual({
      kind: 'INSERTED',
    });
  });

  it('filters, sorts and limits, and returns copies (no aliasing of stored history)', async () => {
    const audit = inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents);
    for (const sequence of [2, 0, 1])
      await audit.insert({ sequence, eventId: `e${String(sequence)}` });
    const desc = await audit.find({}, { sort: { field: 'sequence', direction: -1 }, limit: 2 });
    expect(desc.ok && desc.value).toEqual([
      { sequence: 2, eventId: 'e2' },
      { sequence: 1, eventId: 'e1' },
    ]);
    const one = await audit.find({ eventId: 'e0' }, { sort: { field: 'sequence', direction: 1 } });
    if (!one.ok) throw new Error('fixture');
    (one.value[0] as { sequence: number }).sequence = 99;
    const again = await audit.find(
      { eventId: 'e0' },
      { sort: { field: 'sequence', direction: 1 } },
    );
    expect(again.ok && again.value).toEqual([{ sequence: 0, eventId: 'e0' }]);
  });

  it('the unavailable collection fails every call closed', async () => {
    const none = unavailableAppendOnlyCollection(COLLECTIONS.auditEvents);
    expect(await none.insert({})).toEqual({ kind: 'UNAVAILABLE' });
    expect((await none.find({}, { sort: { field: 'sequence', direction: 1 } })).ok).toBe(false);
  });

  it('exposes no way to update or delete', () => {
    const audit = inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents);
    expect(Object.keys(audit).sort()).toEqual(['find', 'insert', 'spec']);
  });
});

function fakeDb(behaviour: {
  insertOne?: () => Promise<unknown>;
  toArray?: () => Promise<unknown[]>;
}) {
  const insertOne = vi.fn(behaviour.insertOne ?? (() => Promise.resolve({ acknowledged: true })));
  const find = vi.fn(() => ({ toArray: behaviour.toArray ?? (() => Promise.resolve([])) }));
  const collection = vi.fn(() => ({ insertOne, find }));
  return { db: { collection } as unknown as Db, insertOne, find, collection };
}

describe('MongoDB append-only collection', () => {
  it('uses majority, journaled writes and majority reads from the primary', () => {
    expect(MONGO_CLIENT_OPTIONS).toMatchObject({
      writeConcern: { w: 'majority', journal: true },
      readConcern: { level: 'majority' },
      readPreference: 'primary',
      retryWrites: true,
    });
  });

  it('inserts a copy (the driver must not add _id to the caller object)', async () => {
    const { db, insertOne } = fakeDb({
      insertOne: (...args: unknown[]) => {
        (args[0] as { _id?: string })._id = 'generated';
        return Promise.resolve({ acknowledged: true });
      },
    });
    const record = { sequence: 0, eventId: 'e0' };
    expect(await mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents).insert(record)).toEqual({
      kind: 'INSERTED',
    });
    expect(record).toEqual({ sequence: 0, eventId: 'e0' });
    expect(insertOne).toHaveBeenCalledTimes(1);
  });

  it('maps duplicate-key errors to the index name, anything else to UNAVAILABLE', async () => {
    const audit = (insertOne: () => Promise<unknown>) =>
      mongoAppendOnlyCollection(fakeDb({ insertOne }).db, COLLECTIONS.auditEvents);
    expect(await audit(() => Promise.reject(duplicate('eventId_unique'))).insert({})).toEqual({
      kind: 'DUPLICATE',
      index: 'eventId_unique',
    });
    expect(await audit(() => Promise.reject(new MongoNetworkError('reset'))).insert({})).toEqual({
      kind: 'UNAVAILABLE',
    });
    expect(
      await audit(() => Promise.reject(new MongoServerError({ message: 'x', code: 121 }))).insert(
        {},
      ),
    ).toEqual({ kind: 'UNAVAILABLE' });
    expect(duplicateIndexName(new Error('E11000 index: x'))).toBeNull();
  });

  it('reads without _id, with the requested sort and limit, and fails closed on errors', async () => {
    const { db, find } = fakeDb({ toArray: () => Promise.resolve([{ sequence: 4 }]) });
    const audit = mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents);
    const found = await audit.find(
      { eventId: 'e' },
      { sort: { field: 'sequence', direction: -1 }, limit: 1 },
    );
    expect(found.ok && found.value).toEqual([{ sequence: 4 }]);
    expect(find).toHaveBeenCalledWith(
      { eventId: 'e' },
      { projection: { _id: 0 }, sort: { sequence: -1 }, limit: 1 },
    );
    const broken = mongoAppendOnlyCollection(
      fakeDb({ toArray: () => Promise.reject(new MongoNetworkError('reset')) }).db,
      COLLECTIONS.auditEvents,
    );
    expect((await broken.find({}, { sort: { field: 'sequence', direction: 1 } })).ok).toBe(false);
  });
});

describe('collection specs', () => {
  it('declares append-only history and controlled-update operational state', () => {
    const access = Object.fromEntries(ALL_COLLECTIONS.map((c) => [c.name, c.access]));
    expect(access).toEqual({
      auditEvents: 'APPEND_ONLY',
      auditCheckpoints: 'APPEND_ONLY',
      governanceLedgerRecords: 'APPEND_ONLY',
      governancePolicyRegistry: 'APPEND_ONLY',
      rulePackContents: 'APPEND_ONLY',
      researchSources: 'APPEND_ONLY',
      sourcePassages: 'APPEND_ONLY',
      passageTranslations: 'APPEND_ONLY',
      researchFindings: 'APPEND_ONLY',
      religiousRulings: 'APPEND_ONLY',
      evidenceArtefacts: 'APPEND_ONLY',
      // Phase 2 step 3: scholar rule builder revisions (one document per save).
      scholarRuleRevisions: 'APPEND_ONLY',
      // Phase 4: scholar requests (missing rules, calculation changes) and their resolution.
      scholarRuleRequests: 'APPEND_ONLY',
      // Phase 2 step 5: source verifications of builder rule revisions.
      ruleVerificationRecords: 'APPEND_ONLY',
      staffRoleAssignments: 'APPEND_ONLY',
      administrativeControl: 'APPEND_ONLY',
      staffAccounts: 'CONTROLLED_UPDATE',
      staffSessions: 'CONTROLLED_UPDATE',
      staffLoginThrottles: 'CONTROLLED_UPDATE',
    });
  });

  it('every chained collection has a unique sequence index (the atomic conflict check)', () => {
    const uniqueKeys = (name: keyof typeof COLLECTIONS) =>
      COLLECTIONS[name].indexes
        .filter((i) => 'unique' in i)
        .map((i) => Object.keys(i.key).join(','));
    expect(uniqueKeys('auditEvents')).toEqual(['sequence', 'eventId']);
    expect(uniqueKeys('governancePolicyRegistry')).toEqual(['sequence', 'recordId']);
    expect(uniqueKeys('governanceLedgerRecords')).toEqual(['packId,version,sequence', 'recordId']);
    expect(uniqueKeys('administrativeControl')).toEqual(['sequence']);
    // Pack content: one write-once document per binding record and kind (D2, M4.6.4a).
    expect(uniqueKeys('rulePackContents')).toEqual(['recordId,kind']);
    // Research chains (M5.3.3): one document per revision; ids and display refs never collide.
    for (const name of [
      'researchSources',
      'sourcePassages',
      'passageTranslations',
      'researchFindings',
    ] as const) {
      expect(uniqueKeys(name), name).toEqual([
        'entityId,revision',
        'recordId',
        'displayRef,revision',
      ]);
    }
    // Ruling versions (M5.3.5): one version number per series.
    expect(uniqueKeys('religiousRulings')).toEqual([
      'entityId,revision',
      'recordId',
      'displayRef,revision',
      'rulingSeriesId,rulingVersion,revision',
    ]);
    // Evidence: write-once per artefact, one file per digest per Marja.
    expect(uniqueKeys('evidenceArtefacts')).toEqual(['artefactId', 'marjaId,digest']);
    // Rule builder: one revision number per rule (of two concurrent saves exactly one commits).
    expect(uniqueKeys('scholarRuleRevisions')).toEqual(['ruleId,revision']);
    // Source verifications: one document per verification id.
    expect(uniqueKeys('ruleVerificationRecords')).toEqual(['verificationId']);
    // Scholar requests: one request and at most one resolution per request id.
    expect(uniqueKeys('scholarRuleRequests')).toEqual(['requestId,type']);
  });

  it('expires sessions and throttles with TTL indexes (no application deletes)', () => {
    const ttl = ALL_COLLECTIONS.flatMap((c) =>
      c.indexes.filter((i) => 'expireAfterSeconds' in i).map(() => c.name),
    );
    expect(ttl).toEqual(['staffSessions', 'staffLoginThrottles']);
  });
});

describe('least-privilege database roles', () => {
  const roles = databaseRoles('khums');
  const roleNamed = (name: AtlasCustomRole['roleName']) => {
    const found = roles.find((r) => r.roleName === name);
    if (found === undefined) throw new Error(name);
    return privilegesOf(found);
  };
  const appendOnly = ALL_COLLECTIONS.filter((c) => c.access === 'APPEND_ONLY').map((c) => c.name);

  it('the API runtime can only find and insert on append-only collections', () => {
    const app = roleNamed('khumsApp');
    for (const name of appendOnly)
      expect([...(app.get(name) ?? [])].sort(), name).toEqual(['FIND', 'INSERT']);
    for (const name of ['staffAccounts', 'staffSessions', 'staffLoginThrottles']) {
      expect([...(app.get(name) ?? [])].sort(), name).toEqual(['FIND', 'INSERT', 'UPDATE']);
    }
    expect([...app.keys()].sort()).toEqual(ALL_COLLECTIONS.map((c) => c.name).sort());
  });

  it('no role may update, remove, drop or change an append-only collection at runtime', () => {
    for (const role of roles) {
      const privileges = privilegesOf(role);
      for (const name of appendOnly) {
        const actions = [...(privileges.get(name) ?? [])];
        expect(actions, `${role.roleName}/${name}`).not.toContain('UPDATE');
        if (role.roleName !== 'khumsMigrator') expect(actions).not.toContain('COLL_MOD');
      }
      const all = role.actions.map((a) => a.action as string);
      for (const forbidden of [
        'REMOVE',
        'DROP_COLLECTION',
        'DROP_DATABASE',
        'CREATE_USER',
        'CREATE_ROLE',
      ]) {
        expect(all, role.roleName).not.toContain(forbidden);
      }
      expect(role.inheritedRoles).toEqual([]);
    }
  });

  it('the checkpoint job reads chains and writes only checkpoints', () => {
    const job = roleNamed('khumsCheckpoint');
    expect(Object.fromEntries([...job.entries()].map(([k, v]) => [k, [...v].sort()]))).toEqual({
      auditEvents: ['FIND'],
      governanceLedgerRecords: ['FIND'],
      governancePolicyRegistry: ['FIND'],
      researchSources: ['FIND'],
      sourcePassages: ['FIND'],
      passageTranslations: ['FIND'],
      researchFindings: ['FIND'],
      religiousRulings: ['FIND'],
      auditCheckpoints: ['FIND', 'INSERT'],
    });
  });

  it('the migrator changes schemas and indexes but reads no staff or audit data', () => {
    const migrator = roleNamed('khumsMigrator');
    for (const [name, actions] of migrator) {
      if (name === 'governancePolicyRegistry') continue;
      expect([...actions], name).not.toContain('FIND');
      expect([...actions], name).not.toContain('INSERT');
    }
    expect(roles.flatMap((r) => r.actions.flatMap((a) => a.resources.map((x) => x.db)))).toSatisfy(
      (dbs: string[]) => dbs.every((db) => db === 'khums'),
    );
  });
});

function migrationDb(existing: string[], failCreate = false) {
  const calls: { op: string; name: string; arg?: unknown }[] = [];
  const db = {
    listCollections: () => ({ toArray: () => Promise.resolve(existing.map((name) => ({ name }))) }),
    createCollection: (name: string, options: unknown) => {
      if (failCreate) return Promise.reject(new MongoServerError({ message: 'exists', code: 48 }));
      calls.push({ op: 'create', name, arg: options });
      return Promise.resolve({});
    },
    command: (command: { collMod: string }) => {
      calls.push({ op: 'collMod', name: command.collMod, arg: command });
      return Promise.resolve({ ok: 1 });
    },
    collection: (name: string) => ({
      createIndexes: (indexes: unknown) => {
        calls.push({ op: 'indexes', name, arg: indexes });
        return Promise.resolve([]);
      },
    }),
  } as unknown as MigrationDb;
  return { db, calls };
}

describe('migration (idempotent; operator-run)', () => {
  it('creates missing collections with strict validators and every index', async () => {
    const { db, calls } = migrationDb(['auditEvents']);
    const report = await migrateDatabase(db);
    expect(report.updated).toEqual(['auditEvents']);
    expect(report.created).toHaveLength(ALL_COLLECTIONS.length - 1);
    expect(calls.find((c) => c.op === 'create' && c.name === 'staffSessions')?.arg).toEqual({
      validator: validatorOf(COLLECTIONS.staffSessions),
      validationLevel: 'strict',
      validationAction: 'error',
    });
    expect(calls.find((c) => c.op === 'indexes' && c.name === 'staffSessions')?.arg).toEqual([
      { name: 'sessionIdHash_unique', key: { sessionIdHash: 1 }, unique: true },
      { name: 'principalId', key: { principalId: 1 } },
      { name: 'expireAt_ttl', key: { expireAt: 1 }, expireAfterSeconds: 0 },
    ]);
  });

  it('falls back to updating the validator when another migrator created the collection', async () => {
    const { db, calls } = migrationDb([], true);
    const report = await migrateDatabase(db);
    expect(report.created).toEqual([]);
    expect(report.updated).toHaveLength(ALL_COLLECTIONS.length);
    expect(calls.filter((c) => c.op === 'collMod')).toHaveLength(ALL_COLLECTIONS.length);
  });

  it('requires the chain fields in the database validator', () => {
    expect(validatorOf(COLLECTIONS.auditEvents)).toEqual({
      $jsonSchema: {
        bsonType: 'object',
        required: ['eventId', 'type', 'sequence', 'previousDigest', 'digest', 'occurredAt'],
      },
    });
  });
});

describe('additive research-only migration (M5.3.3)', () => {
  it('creates only the missing research collections and never changes existing ones', async () => {
    const { db, calls } = migrationDb(['auditEvents', 'staffAccounts', 'researchSources']);
    const report = await migrateResearchCollections(db);
    expect(report).toEqual({
      created: [
        'sourcePassages',
        'passageTranslations',
        'researchFindings',
        'religiousRulings',
        'evidenceArtefacts',
      ],
      alreadyPresent: ['researchSources'],
    });
    // No collMod anywhere, nothing outside the research collections.
    expect(calls.some((c) => c.op === 'collMod')).toBe(false);
    expect(calls.every((c) => RESEARCH_COLLECTION_NAMES.includes(c.name as never))).toBe(true);
    expect(calls.some((c) => c.name === 'researchSources')).toBe(false);
    expect(calls.find((c) => c.op === 'create' && c.name === 'evidenceArtefacts')?.arg).toEqual({
      validator: validatorOf(COLLECTIONS.evidenceArtefacts),
      validationLevel: 'strict',
      validationAction: 'error',
    });
  });
});

describe('migration manifest (M5.3.3 plan R3)', () => {
  it('lists every collection, index and validator, and seeds only Sistani and Khamenei', () => {
    const result = printMigrationManifest();
    const manifest = result.output as ReturnType<typeof migrationManifest>;
    expect(manifest.collections.map((c) => c.name)).toEqual(ALL_COLLECTIONS.map((s) => s.name));
    expect(manifest.collections).toHaveLength(19);
    for (const c of manifest.collections) {
      expect(c.validator, c.name).toEqual(
        validatorOf(ALL_COLLECTIONS.find((s) => s.name === c.name) ?? ALL_COLLECTIONS[0]!),
      );
    }
    expect(manifest.seededPolicyRecords.map((r) => [r.sequence, r.marjaId, r.policy])).toEqual([
      [0, 'sistani', 'SINGLE_SCHOLAR_V1'],
      [1, 'khamenei', 'SINGLE_SCHOLAR_V1'],
    ]);
  });
});
