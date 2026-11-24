import { describe, expect, it } from 'vitest';

import {
  assertLiveDatabaseIsolated,
  liveTargetFromEnv,
  parseDotenv,
  REQUIRED_TEST_ACTIONS,
  type PrivilegeSource,
} from './support/live-target';

/** The mandatory guard of the live MongoDB suites (no network; runs in every `pnpm test`). */

const TEST_URI =
  'mongodb+srv://khums-live-test:test-pass@cluster.example.mongodb.net/?retryWrites=true';
const PROD_URI = 'mongodb+srv://khums-prod:prod-pass@cluster.example.mongodb.net/';
const DB = 'khums_test_live';

describe('configuration checks (before connecting)', () => {
  it('is disabled without a test URI and ready with a scoped test database', () => {
    expect(liveTargetFromEnv({}, {})).toEqual({ kind: 'DISABLED' });
    expect(liveTargetFromEnv({ KHUMS_LIVE_TESTS: '1' }, {})).toEqual({ kind: 'DISABLED' });
    expect(
      liveTargetFromEnv(
        {
          KHUMS_LIVE_TESTS: '1',
          KHUMS_TEST_MONGODB_URI: TEST_URI,
          KHUMS_TEST_MONGODB_DATABASE: DB,
        },
        { MONGODB_URI: PROD_URI },
      ),
    ).toEqual({
      kind: 'READY',
      uri: TEST_URI,
      database: DB,
    });
  });

  it('requires an explicit khums_test_* database (no default)', () => {
    for (const database of [
      undefined,
      '',
      'khums',
      'test',
      'khums_test_',
      'khums_test_Live',
      'admin',
      'khums_test_live;x',
    ]) {
      const target = liveTargetFromEnv(
        {
          KHUMS_LIVE_TESTS: '1',
          KHUMS_TEST_MONGODB_URI: TEST_URI,
          KHUMS_TEST_MONGODB_DATABASE: database,
        },
        {},
      );
      expect(target.kind, String(database)).toBe('REFUSED');
    }
  });

  it('refuses the production URI, from the shell or from apps/api/.env', () => {
    const base = {
      KHUMS_LIVE_TESTS: '1',
      KHUMS_TEST_MONGODB_URI: PROD_URI,
      KHUMS_TEST_MONGODB_DATABASE: DB,
    };
    expect(liveTargetFromEnv({ ...base, MONGODB_URI: PROD_URI }, {})).toEqual({
      kind: 'REFUSED',
      reason: 'the test URI equals a production MONGODB_URI',
    });
    expect(liveTargetFromEnv(base, { MONGODB_URI: PROD_URI }).kind).toBe('REFUSED');
  });

  it('refuses the production database user even with a different password or options', () => {
    const sameUser = 'mongodb+srv://khums-prod:other@cluster.example.mongodb.net/?appName=x';
    expect(
      liveTargetFromEnv(
        {
          KHUMS_LIVE_TESTS: '1',
          KHUMS_TEST_MONGODB_URI: sameUser,
          KHUMS_TEST_MONGODB_DATABASE: DB,
        },
        { MONGODB_URI: PROD_URI },
      ),
    ).toEqual({
      kind: 'REFUSED',
      reason: 'the test URI uses the production database user',
    });
  });

  it('refuses a URI without a dedicated user and the configured production database name', () => {
    expect(
      liveTargetFromEnv(
        {
          KHUMS_LIVE_TESTS: '1',
          KHUMS_TEST_MONGODB_URI: 'mongodb://localhost:27017',
          KHUMS_TEST_MONGODB_DATABASE: DB,
        },
        {},
      ).kind,
    ).toBe('REFUSED');
    expect(
      liveTargetFromEnv(
        {
          KHUMS_LIVE_TESTS: '1',
          KHUMS_TEST_MONGODB_URI: TEST_URI,
          KHUMS_TEST_MONGODB_DATABASE: 'khums_test_prod',
          MONGODB_DATABASE: 'khums_test_prod',
        },
        {},
      ).kind,
    ).toBe('REFUSED');
  });

  it('never puts URIs, users or passwords in a refusal', () => {
    const target = liveTargetFromEnv(
      { KHUMS_LIVE_TESTS: '1', KHUMS_TEST_MONGODB_URI: PROD_URI, KHUMS_TEST_MONGODB_DATABASE: DB },
      { MONGODB_URI: PROD_URI },
    );
    expect(JSON.stringify(target)).not.toMatch(/prod-pass|khums-prod|mongodb\+srv/);
  });

  it('parses dotenv lines without echoing anything', () => {
    expect(parseDotenv('# c\nMONGODB_URI="mongodb://a:b@h/"\nNODE_ENV=development\n')).toEqual({
      MONGODB_URI: 'mongodb://a:b@h/',
      NODE_ENV: 'development',
    });
  });
});

describe('live suites run only under the test:live runner', () => {
  it('stays disabled without KHUMS_LIVE_TESTS=1, even with a test URI and database exported', () => {
    for (const flag of [undefined, '', '0', 'true', 'yes', ' 1']) {
      expect(
        liveTargetFromEnv(
          {
            KHUMS_LIVE_TESTS: flag,
            KHUMS_TEST_MONGODB_URI: TEST_URI,
            KHUMS_TEST_MONGODB_DATABASE: DB,
          },
          {},
        ),
        String(flag),
      ).toEqual({ kind: 'DISABLED' });
    }
  });
});

describe('server privilege checks (after connecting, before any write)', () => {
  const scoped = (actions: readonly string[] = REQUIRED_TEST_ACTIONS, db = DB) => [
    { resource: { db, collection: '' }, actions },
  ];
  const source = (privileges: unknown[], collections: string[] = []): PrivilegeSource => ({
    privileges: () => Promise.resolve(privileges as never),
    collectionNames: () => Promise.resolve(collections),
  });

  it('accepts a least-privilege role confined to the test database', async () => {
    await expect(assertLiveDatabaseIsolated(source(scoped()), DB)).resolves.toBeUndefined();
    await expect(
      assertLiveDatabaseIsolated(source(scoped(), ['auditEvents', 'staffAccounts']), DB),
    ).resolves.toBeUndefined();
  });

  it('refuses any privilege on another database, any database, or the cluster', async () => {
    for (const extra of [
      { resource: { db: 'khums', collection: '' }, actions: ['find'] },
      { resource: { db: '', collection: '' }, actions: ['insert'] },
      { resource: { cluster: true }, actions: ['listDatabases'] },
      { resource: { anyResource: true }, actions: ['anyAction'] },
      { resource: { db: 'admin', collection: '' }, actions: ['find'] },
    ]) {
      await expect(
        assertLiveDatabaseIsolated(source([...scoped(), extra]), DB),
        JSON.stringify(extra),
      ).rejects.toThrow(/privileges outside the test database/);
    }
  });

  it('refuses any action outside the approved nine, even on the test database', async () => {
    for (const extra of [
      'remove',
      'dropCollection',
      'renameCollectionSameDB',
      'createUser',
      'dropIndex',
    ]) {
      await expect(
        assertLiveDatabaseIsolated(source(scoped([...REQUIRED_TEST_ACTIONS, extra])), DB),
        extra,
      ).rejects.toThrow(`actions outside the approved nine: ${extra}`);
    }
  });

  it('refuses unexpected actions arriving through a second (inherited) privilege entry', async () => {
    const inherited = { resource: { db: DB, collection: 'auditEvents' }, actions: ['remove'] };
    await expect(assertLiveDatabaseIsolated(source([...scoped(), inherited]), DB)).rejects.toThrow(
      /outside the approved nine: remove/,
    );
  });

  it('refuses the built-in readWrite + dbAdmin combination (custom role required)', async () => {
    const builtIn = [
      ...REQUIRED_TEST_ACTIONS,
      'remove',
      'dropCollection',
      'changeStream',
      'dbStats',
      'collStats',
      'convertToCapped',
      'dropIndex',
      'reIndex',
    ];
    await expect(assertLiveDatabaseIsolated(source(scoped(builtIn)), DB)).rejects.toThrow(
      /outside the approved nine/,
    );
  });

  it('refuses when a required action is missing, or nothing is reported', async () => {
    await expect(
      assertLiveDatabaseIsolated(source(scoped(['find', 'insert'])), DB),
    ).rejects.toThrow(/lacks update/);
    await expect(assertLiveDatabaseIsolated(source([]), DB)).rejects.toThrow(/no privileges/);
  });

  it('refuses a test database holding collections this suite did not create', async () => {
    await expect(
      assertLiveDatabaseIsolated(source(scoped(), ['auditEvents', 'customers']), DB),
    ).rejects.toThrow(/did not create/);
  });

  it('refuses a non-test database name outright', async () => {
    await expect(
      assertLiveDatabaseIsolated(source(scoped(REQUIRED_TEST_ACTIONS, 'khums')), 'khums'),
    ).rejects.toThrow(/not a khums_test_/);
  });
});
