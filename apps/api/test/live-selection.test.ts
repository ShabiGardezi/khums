import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ATLAS_ITEST_FILES,
  ATLAS_ITEST_FLAG,
  LIVE_TEST_FILES,
  LIVE_TEST_FLAG,
  testSelection,
} from './support/live-selection';

/**
 * Live MongoDB suites are excluded from every default test command (M4.6.2b hardening). They run
 * only through `pnpm --filter @khums/api test:live`, which alone sets KHUMS_LIVE_TESTS=1, and then
 * sequentially. No network access happens in these tests.
 */

const API_ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as Record<string, unknown>;

describe('test file selection', () => {
  it('normal runs exclude both live suites and may run files in parallel', () => {
    for (const env of [
      {},
      { [LIVE_TEST_FLAG]: '0' },
      { [LIVE_TEST_FLAG]: 'true' },
      { KHUMS_TEST_MONGODB_URI: 'x' },
    ]) {
      const selection = testSelection(env);
      for (const file of LIVE_TEST_FILES)
        expect(selection.exclude, JSON.stringify(env)).toContain(file);
      expect(selection.fileParallelism).toBe(true);
    }
  });

  it('a live run includes only the two live suites and runs them one after another', () => {
    const selection = testSelection({ [LIVE_TEST_FLAG]: '1' });
    expect(selection.include).toEqual([...LIVE_TEST_FILES]);
    expect(selection.exclude).not.toContain(LIVE_TEST_FILES[0]);
    expect(selection.fileParallelism).toBe(false);
  });
});

describe('existing-database integration suite (M5.3.3)', () => {
  it('is excluded from normal and live runs, and is the only file of an atlas-itest run', () => {
    for (const env of [{}, { [LIVE_TEST_FLAG]: '1' }, { [ATLAS_ITEST_FLAG]: 'true' }]) {
      expect(testSelection(env).exclude, JSON.stringify(env)).toContain(ATLAS_ITEST_FILES[0]);
    }
    const run = testSelection({ [ATLAS_ITEST_FLAG]: '1' });
    expect(run.include).toEqual([...ATLAS_ITEST_FILES]);
    expect(run.fileParallelism).toBe(false);
  });

  it('only test:atlas-itest sets its flag', () => {
    const api = (json('../package.json').scripts ?? {}) as Record<string, string>;
    const root = (json('../../../package.json').scripts ?? {}) as Record<string, string>;
    const setters = Object.entries({ ...api, ...root }).filter(([, c]) =>
      c.includes(ATLAS_ITEST_FLAG),
    );
    expect(setters.map(([name]) => name)).toEqual(['test:atlas-itest']);
  });
});

describe('only test:live sets the flag', () => {
  const scripts = (path: string) => (json(path).scripts ?? {}) as Record<string, string>;

  it('test:live sets KHUMS_LIVE_TESTS=1 and runs sequentially; no other script sets it', () => {
    const api = scripts('../package.json');
    expect(api['test:live']).toMatch(
      /^KHUMS_LIVE_TESTS=1 node --env-file-if-exists=\.env\.test\.local .*vitest\.mjs run --no-file-parallelism$/,
    );
    expect(api.test).toBe('vitest run');
    const all = { ...api, ...scripts('../../../package.json') };
    const setters = Object.entries(all).filter(([, command]) => command.includes(LIVE_TEST_FLAG));
    expect(setters.map(([name]) => name)).toEqual(['test:live']);
  });

  it('turbo does not pass the flag or a test URI to default tasks', () => {
    const turbo = readFileSync(new URL('../../../turbo.json', import.meta.url), 'utf8');
    expect(turbo).not.toContain(LIVE_TEST_FLAG);
    expect(turbo).not.toContain('KHUMS_TEST_MONGODB');
  });
});

describe('direct Vitest execution', () => {
  it('a direct `vitest run` of a live file finds no tests, even with a test URI exported', () => {
    const { KHUMS_LIVE_TESTS: _flag, ...inherited } = process.env;
    const env: Record<string, string | undefined> = {
      ...inherited,
      // A placeholder that is never contacted: the file is excluded before anything runs.
      KHUMS_TEST_MONGODB_URI: 'mongodb+srv://placeholder:placeholder@placeholder.invalid/',
      KHUMS_TEST_MONGODB_DATABASE: 'khums_test_live',
    };
    const result = spawnSync(
      process.execPath,
      [
        './node_modules/vitest/vitest.mjs',
        'run',
        'test/staff-auth.live.test.ts',
        'src/persistence/mongo.integration.test.ts',
      ],
      { cwd: API_ROOT, env, encoding: 'utf8', timeout: 60_000 },
    );
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toMatch(/No test files found/);
    expect(output).not.toMatch(/live Atlas|live MongoDB/);
    expect(result.status).not.toBe(0);
  }, 90_000);
});
