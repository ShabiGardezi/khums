import { configDefaults } from 'vitest/config';

/**
 * Which test files a Vitest run includes (M4.6.2b hardening). The live MongoDB suites run
 * ONLY when `KHUMS_LIVE_TESTS=1`, which only the `test:live` script sets. Every other run
 * (`vitest`, `pnpm test`, `pnpm check`, CI) excludes them, even when a test URI is exported.
 * A live run includes nothing else and always runs files one after another.
 */

export const LIVE_TEST_FLAG = 'KHUMS_LIVE_TESTS';

export const LIVE_TEST_FILES = [
  'src/persistence/mongo.integration.test.ts',
  'test/staff-auth.live.test.ts',
  'test/governance.live.test.ts',
] as const;

/**
 * The existing-database integration suite (M5.3.3; docs/ATLAS_INTEGRATION_TEST_PLAN.md): only with
 * `KHUMS_ATLAS_ITEST=1`, which only the `test:atlas-itest` script sets. Never part of any other run.
 */
export const ATLAS_ITEST_FLAG = 'KHUMS_ATLAS_ITEST';
export const ATLAS_ITEST_FILES = ['test/research.atlas.test.ts'] as const;

const UNIT_TEST_GLOBS = ['src/**/*.test.ts', 'test/**/*.test.ts'];

export const isLiveRun = (env: Readonly<Record<string, string | undefined>>): boolean =>
  env[LIVE_TEST_FLAG] === '1';

export const isAtlasItestRun = (env: Readonly<Record<string, string | undefined>>): boolean =>
  env[ATLAS_ITEST_FLAG] === '1';

export function testSelection(env: Readonly<Record<string, string | undefined>>) {
  if (isAtlasItestRun(env)) {
    return {
      include: [...ATLAS_ITEST_FILES],
      exclude: [...configDefaults.exclude],
      fileParallelism: false,
    };
  }
  const live = isLiveRun(env);
  const never = [...LIVE_TEST_FILES, ...ATLAS_ITEST_FILES];
  return {
    include: live ? [...LIVE_TEST_FILES] : UNIT_TEST_GLOBS,
    exclude: live
      ? [...configDefaults.exclude, ...ATLAS_ITEST_FILES]
      : [...configDefaults.exclude, ...never],
    // Live suites share one test database: never in parallel.
    fileParallelism: !live,
  };
}
