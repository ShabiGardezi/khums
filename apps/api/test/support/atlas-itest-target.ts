/**
 * Configuration guard for the EXISTING-database integration suite (M5.3.3;
 * docs/ATLAS_INTEGRATION_TEST_PLAN.md). Runs only when ALL of these hold, checked before any
 * connection: `KHUMS_ATLAS_ITEST=1` (only the `test:atlas-itest` script sets it); the database is
 * exactly `khums` (owner decision: no separate test database); a fresh run id; and the id of the
 * owner-approved plan revision. The suite itself never migrates, drops, updates or deletes; it only
 * inserts run-marked synthetic records through the application's services. Error messages never
 * contain URIs, users or passwords.
 */

/** The plan revision the owner must approve (docs/ATLAS_INTEGRATION_TEST_PLAN.md header). */
export const ATLAS_ITEST_PLAN_ID = 'ATLAS-ITEST-PLAN-M533-R5';

/** `itest-YYYYMMDDTHHMMSSZ-xxxxxx` (lowercase): every synthetic record carries it. */
export const RUN_ID_PATTERN = /^itest-\d{8}t\d{6}z-[a-z0-9]{6}$/;

export type AtlasItestTarget =
  | { readonly kind: 'DISABLED' }
  | { readonly kind: 'REFUSED'; readonly reason: string }
  | {
      readonly kind: 'READY';
      readonly uri: string;
      readonly database: 'khums';
      readonly runId: string;
    };

export function atlasItestTargetFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AtlasItestTarget {
  if (env.KHUMS_ATLAS_ITEST !== '1') return { kind: 'DISABLED' };
  const uri = env.KHUMS_ATLAS_ITEST_URI ?? '';
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    return { kind: 'REFUSED', reason: 'KHUMS_ATLAS_ITEST_URI must be a mongodb URI' };
  }
  if (env.KHUMS_ATLAS_ITEST_DATABASE !== 'khums') {
    return { kind: 'REFUSED', reason: 'KHUMS_ATLAS_ITEST_DATABASE must be exactly khums' };
  }
  const runId = env.KHUMS_ATLAS_ITEST_RUN_ID ?? '';
  if (!RUN_ID_PATTERN.test(runId)) {
    return {
      kind: 'REFUSED',
      reason: 'KHUMS_ATLAS_ITEST_RUN_ID must match itest-YYYYMMDDTHHMMSSZ-xxxxxx',
    };
  }
  if (env.KHUMS_ATLAS_ITEST_APPROVED_PLAN !== ATLAS_ITEST_PLAN_ID) {
    return {
      kind: 'REFUSED',
      reason: `KHUMS_ATLAS_ITEST_APPROVED_PLAN must name the approved plan (${ATLAS_ITEST_PLAN_ID})`,
    };
  }
  return { kind: 'READY', uri, database: 'khums', runId };
}
