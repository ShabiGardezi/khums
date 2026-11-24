import { describe, expect, it } from 'vitest';

import { ATLAS_ITEST_PLAN_ID, atlasItestTargetFromEnv } from './support/atlas-itest-target';

/** The existing-database suite's guard (M5.3.3): refuses everything but an approved, marked run. */
const ready = {
  KHUMS_ATLAS_ITEST: '1',
  KHUMS_ATLAS_ITEST_URI: 'mongodb+srv://placeholder:placeholder@placeholder.invalid/',
  KHUMS_ATLAS_ITEST_DATABASE: 'khums',
  KHUMS_ATLAS_ITEST_RUN_ID: 'itest-20261122t120000z-ab12cd',
  KHUMS_ATLAS_ITEST_APPROVED_PLAN: ATLAS_ITEST_PLAN_ID,
};

describe('existing-database integration guard', () => {
  it('is disabled unless the atlas-itest script runs it', () => {
    expect(atlasItestTargetFromEnv({ ...ready, KHUMS_ATLAS_ITEST: undefined })).toEqual({
      kind: 'DISABLED',
    });
  });

  it('runs only against khums, with a fresh run id and the approved plan id', () => {
    expect(atlasItestTargetFromEnv(ready)).toMatchObject({ kind: 'READY', database: 'khums' });
    for (const env of [
      { ...ready, KHUMS_ATLAS_ITEST_DATABASE: 'khums_copy' },
      { ...ready, KHUMS_ATLAS_ITEST_RUN_ID: 'test-run' },
      { ...ready, KHUMS_ATLAS_ITEST_APPROVED_PLAN: 'yes' },
      { ...ready, KHUMS_ATLAS_ITEST_URI: 'http://x' },
    ]) {
      const target = atlasItestTargetFromEnv(env);
      expect(target.kind).toBe('REFUSED');
      expect(JSON.stringify(target)).not.toContain('placeholder:placeholder');
    }
  });
});
