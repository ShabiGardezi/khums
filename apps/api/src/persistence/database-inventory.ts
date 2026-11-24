import type { Db, Document } from 'mongodb';

import { ALL_COLLECTIONS } from './collections';

/**
 * READ-ONLY database inventory (M5.3.3 hardening; docs/ATLAS_INTEGRATION_TEST_PLAN.md step 0):
 * what exists before anything is written. Reports names, counts, index names, validator required
 * fields, replica-set/transaction support and counts of records carrying an integration-test run
 * marker. Never documents, field values, hosts, users or the URI. Uses only `hello`,
 * `listCollections`, `listIndexes` and `countDocuments`; it writes nothing.
 */

/** Prefix of every integration-test run id (`itest-<UTC timestamp>-<random>`). */
export const ITEST_MARKER_PREFIX = 'itest-';

export interface CollectionInventory {
  readonly name: string;
  /** Declared in `COLLECTIONS` (the application's own) or unknown to this application. */
  readonly known: boolean;
  readonly documents: number;
  readonly indexes: readonly { readonly name: string; readonly unique: boolean }[];
  readonly validatorRequired: readonly string[] | null;
  /** Documents carrying an integration-test run marker (only for known chained collections). */
  readonly markedTestRecords: number | null;
  /** Declared indexes of this application that are missing (migration not applied). */
  readonly missingIndexes: readonly string[];
}

export interface DatabaseInventory {
  readonly database: string;
  readonly replicaSet: boolean;
  readonly sessionsSupported: boolean;
  readonly transactionsSupported: boolean;
  readonly serverVersionMajor: number | null;
  readonly collections: readonly CollectionInventory[];
  /** Application collections that do not exist yet (migration not applied). */
  readonly missingCollections: readonly string[];
}

/** The subset of the driver this needs (tests use a fake). */
export interface InventoryDb {
  readonly databaseName: string;
  command(command: Document): Promise<Document>;
  listCollections(
    filter: Document,
    options: { nameOnly: false },
  ): { toArray(): Promise<Document[]> };
  collection(name: string): {
    listIndexes(): { toArray(): Promise<Document[]> };
    countDocuments(filter?: Document): Promise<number>;
  };
}

/** Where each known collection keeps a run marker (exact top-level fields or the record JSON). */
const MARKER_FILTERS: Readonly<Record<string, Document>> = {
  auditEvents: { requestId: { $regex: `^${ITEST_MARKER_PREFIX}` } },
  evidenceArtefacts: { requestId: { $regex: `^${ITEST_MARKER_PREFIX}` } },
  researchSources: { recordJson: { $regex: `"requestId":"${ITEST_MARKER_PREFIX}` } },
  sourcePassages: { recordJson: { $regex: `"requestId":"${ITEST_MARKER_PREFIX}` } },
  passageTranslations: { recordJson: { $regex: `"requestId":"${ITEST_MARKER_PREFIX}` } },
  researchFindings: { recordJson: { $regex: `"requestId":"${ITEST_MARKER_PREFIX}` } },
  religiousRulings: { recordJson: { $regex: `"requestId":"${ITEST_MARKER_PREFIX}` } },
  staffAccounts: { usernameKey: { $regex: `^${ITEST_MARKER_PREFIX}` } },
};

export async function inventoryDatabase(db: InventoryDb | Db): Promise<DatabaseInventory> {
  const source = db;
  const hello = await source.command({ hello: 1 });
  const replicaSet = typeof hello.setName === 'string';
  const sessionsSupported = typeof hello.logicalSessionTimeoutMinutes === 'number';
  const build: { version?: unknown } = await source
    .command({ buildInfo: 1 })
    .catch((): Document => ({}));
  const version =
    typeof build.version === 'string' ? Number(build.version.split('.')[0]) : Number.NaN;
  const known = new Map(ALL_COLLECTIONS.map((spec) => [spec.name, spec]));
  const listed = await source.listCollections({}, { nameOnly: false }).toArray();
  const collections: CollectionInventory[] = [];
  for (const entry of listed.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    const name = String(entry.name);
    if (entry.type !== undefined && entry.type !== 'collection') continue; // views etc.
    const handle = source.collection(name);
    const rawIndexes = (await handle.listIndexes().toArray()) as {
      name?: unknown;
      unique?: unknown;
    }[];
    const indexes = rawIndexes.map((i) => ({ name: String(i.name), unique: i.unique === true }));
    const options = (entry.options ?? {}) as Document;
    const schema = (options.validator as Document | undefined)?.$jsonSchema as Document | undefined;
    const spec = known.get(name);
    const filter = MARKER_FILTERS[name];
    collections.push({
      name,
      known: spec !== undefined,
      documents: await handle.countDocuments({}),
      indexes,
      validatorRequired: Array.isArray(schema?.required) ? (schema.required as string[]) : null,
      markedTestRecords: filter === undefined ? null : await handle.countDocuments(filter),
      missingIndexes:
        spec === undefined
          ? []
          : spec.indexes.map((i) => i.name).filter((n) => !indexes.some((i) => i.name === n)),
    });
  }
  const existing = new Set(collections.map((c) => c.name));
  return {
    database: source.databaseName,
    replicaSet,
    sessionsSupported,
    // Multi-document transactions need a replica set (or sharded cluster) and sessions, 4.0+.
    transactionsSupported:
      replicaSet && sessionsSupported && (Number.isNaN(version) || version >= 4),
    serverVersionMajor: Number.isNaN(version) ? null : version,
    collections,
    missingCollections: ALL_COLLECTIONS.map((s) => s.name).filter((n) => !existing.has(n)),
  };
}
