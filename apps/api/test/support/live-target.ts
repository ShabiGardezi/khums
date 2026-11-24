import { existsSync, readFileSync } from 'node:fs';

import type { MongoClient } from 'mongodb';

import { ALL_COLLECTIONS } from '../../src/persistence/collections';
import { isLiveRun } from './live-selection';

/**
 * MANDATORY safety guard for the opt-in live MongoDB suites (M4.6.2b hardening;
 * docs/DEPLOYMENT_VERIFICATION.md §1–§2). The suites may run on the existing Atlas cluster, but
 * ONLY in one dedicated test database (`KHUMS_TEST_MONGODB_DATABASE`, e.g. `khums_test_live`),
 * with a database user whose privileges are restricted to that database.
 *
 * Before any write, every suite must pass:
 * 1. `liveTargetFromEnv`: the test URI and user differ from every production URI and user
 *    (`MONGODB_URI` in the shell and in `apps/api/.env`, compared in memory, never printed), and
 *    the database name matches `khums_test_*` and is not the production database.
 * 2. `assertLiveDatabaseIsolated`: the server reports that the signed-in user's EFFECTIVE
 *    privileges (inherited ones included) apply to the test database ONLY (nothing cluster-wide,
 *    nothing on any other database) and consist of exactly the nine approved actions, and the
 *    database holds nothing but this suite's own collections.
 * Live suites are enabled only by `KHUMS_LIVE_TESTS=1` (the `test:live` script).
 * The suites then drop and recreate only that database. No code path names another database.
 * Error messages never contain URIs, usernames or passwords.
 */

export const TEST_DATABASE_PATTERN = /^khums_test_[a-z0-9_]{1,40}$/;

/**
 * Exactly the actions the suites need on the test database (least privilege): reads and writes,
 * the migration (collections, validators, indexes) and dropping the test database itself.
 */
export const REQUIRED_TEST_ACTIONS = [
  'find',
  'insert',
  'update',
  'createCollection',
  'createIndex',
  'collMod',
  'listCollections',
  'listIndexes',
  'dropDatabase',
] as const;

export type LiveTarget =
  | { readonly kind: 'DISABLED' }
  | { readonly kind: 'REFUSED'; readonly reason: string }
  | { readonly kind: 'READY'; readonly uri: string; readonly database: string };

type Env = Readonly<Record<string, string | undefined>>;

/** `KEY=value` lines of a dotenv file (quotes removed). Values stay in memory only. */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] !== undefined) out[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '');
  }
  return out;
}

const API_ENV_FILE = new URL('../../.env', import.meta.url);

/** The API's local `.env` (production-like configuration of this machine), if present. */
export function readApiEnvFile(): Record<string, string> {
  return existsSync(API_ENV_FILE) ? parseDotenv(readFileSync(API_ENV_FILE, 'utf8')) : {};
}

const usernameOf = (uri: string): string | null => {
  try {
    const user = decodeURIComponent(new URL(uri).username);
    return user === '' ? null : user;
  } catch {
    return null;
  }
};

/** Step 1: configuration checks, before connecting. */
export function liveTargetFromEnv(
  env: Env = process.env,
  apiEnvFile: Env = readApiEnvFile(),
): LiveTarget {
  // Only the `test:live` runner enables live suites, even when a test URI is exported.
  if (!isLiveRun(env)) return { kind: 'DISABLED' };
  const uri = env.KHUMS_TEST_MONGODB_URI;
  if (uri === undefined || uri === '') return { kind: 'DISABLED' };
  const database = env.KHUMS_TEST_MONGODB_DATABASE ?? '';
  if (!TEST_DATABASE_PATTERN.test(database)) {
    return {
      kind: 'REFUSED',
      reason: 'KHUMS_TEST_MONGODB_DATABASE must be set and match khums_test_*',
    };
  }
  if (!/^mongodb(\+srv)?:\/\//.test(uri) || usernameOf(uri) === null) {
    return {
      kind: 'REFUSED',
      reason: 'KHUMS_TEST_MONGODB_URI must be a mongodb URI with a dedicated test user',
    };
  }
  const productionUris = [env.MONGODB_URI, apiEnvFile.MONGODB_URI].filter(
    (value): value is string => value !== undefined && value !== '',
  );
  if (productionUris.includes(uri)) {
    return { kind: 'REFUSED', reason: 'the test URI equals a production MONGODB_URI' };
  }
  const testUser = usernameOf(uri);
  if (productionUris.some((p) => usernameOf(p) === testUser)) {
    return { kind: 'REFUSED', reason: 'the test URI uses the production database user' };
  }
  const productionDatabases = new Set(['khums', env.MONGODB_DATABASE, apiEnvFile.MONGODB_DATABASE]);
  if (productionDatabases.has(database)) {
    return { kind: 'REFUSED', reason: 'the test database is a production database' };
  }
  return { kind: 'READY', uri, database };
}

interface Privilege {
  readonly resource: {
    readonly db?: string;
    readonly collection?: string;
    readonly cluster?: boolean;
    readonly anyResource?: boolean;
  };
  readonly actions: readonly string[];
}

/** The subset of the driver used here (tests use a fake). */
export interface PrivilegeSource {
  privileges(): Promise<readonly Privilege[]>;
  collectionNames(database: string): Promise<readonly string[]>;
}

export const clientPrivilegeSource = (client: MongoClient): PrivilegeSource => ({
  privileges: async () => {
    const status = (await client
      .db('admin')
      .command({ connectionStatus: 1, showPrivileges: true })) as {
      authInfo?: { authenticatedUserPrivileges?: Privilege[] };
    };
    return status.authInfo?.authenticatedUserPrivileges ?? [];
  },
  collectionNames: async (database) =>
    (await client.db(database).listCollections({}, { nameOnly: true }).toArray()).map(
      (c) => c.name,
    ),
});

const OWN_COLLECTIONS = new Set(ALL_COLLECTIONS.map((c) => c.name));

/**
 * Step 2: after connecting, before any write. Throws unless the user's privileges are confined to
 * `database`, include every required action there, and the database holds only this suite's
 * collections (left by an earlier run) or nothing.
 */
export async function assertLiveDatabaseIsolated(
  source: PrivilegeSource,
  database: string,
): Promise<void> {
  if (!TEST_DATABASE_PATTERN.test(database))
    throw new Error('refused: not a khums_test_* database');
  const privileges = await source.privileges();
  if (privileges.length === 0)
    throw new Error('refused: the server reported no privileges for the test user');
  for (const { resource } of privileges) {
    if (resource.cluster === true || resource.anyResource === true || resource.db !== database) {
      throw new Error('refused: the test user has privileges outside the test database');
    }
  }
  const granted = new Set(privileges.flatMap((p) => p.actions));
  // Strict allowlist: no action beyond the approved nine, even on the test database (so only the
  // custom `khumsLiveTest` role passes; built-in roles such as readWrite/dbAdmin grant more).
  const approved = new Set<string>(REQUIRED_TEST_ACTIONS);
  const unexpected = [...granted].filter((action) => !approved.has(action)).sort();
  if (unexpected.length > 0) {
    throw new Error(
      `refused: the test user has actions outside the approved nine: ${unexpected.join(', ')}`,
    );
  }
  const missing = REQUIRED_TEST_ACTIONS.filter((action) => !granted.has(action));
  if (missing.length > 0)
    throw new Error(`refused: the test user lacks ${missing.join(', ')} on the test database`);
  const foreign = (await source.collectionNames(database)).filter(
    (name) => !OWN_COLLECTIONS.has(name) && !name.startsWith('system.'),
  );
  if (foreign.length > 0) {
    throw new Error('refused: the test database contains collections this suite did not create');
  }
}

/** Connects-and-checks helper for the suites: the ONLY database they ever open or drop. */
export async function openIsolatedTestDatabase(client: MongoClient, database: string) {
  await assertLiveDatabaseIsolated(clientPrivilegeSource(client), database);
  const db = client.db(database);
  // Leftovers of an interrupted run of this suite only (checked above).
  await db.dropDatabase();
  return db;
}
