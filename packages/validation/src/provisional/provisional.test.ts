import { describe, expect, it } from 'vitest';

import { OPERATIONAL_STATES, operationalStateSchema } from './index';

/** Operational states (M4.5a). */

describe('operational state', () => {
  it('accepts exactly the three states', () => {
    expect(OPERATIONAL_STATES).toEqual(['DEVELOPMENT', 'SCHOLAR_REVIEW', 'PRODUCTION_APPROVED']);
    expect(operationalStateSchema.safeParse('SCHOLAR_REVIEW').success).toBe(true);
    for (const bad of ['scholar_review', 'PRODUCTION', '', 'STAGING']) {
      expect(operationalStateSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});
