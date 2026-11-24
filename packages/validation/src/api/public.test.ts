import { describe, expect, it } from 'vitest';

import {
  publicMarjaListResponseSchema,
  publicMarjaParamsSchema,
  publicVerifiedPackResponseSchema,
} from './public';

/** Public calculator contracts (decision 65). TEST values only. */

const summary = {
  packId: 'test-public-pack',
  version: '1.0.0',
  contentDigest: 'a'.repeat(64),
  activatedAt: '2026-11-23',
  workflows: ['annual'],
  publishedAt: '2026-11-23',
  approvalReferences: ['approval#3/' + 'b'.repeat(64)],
  publicationReference: 'publication#4/' + 'c'.repeat(64),
  rules: [{ ruleId: 'builder:test-rule', verified: true }],
};

describe('public calculator contracts', () => {
  it('validates the Marja path parameter strictly', () => {
    expect(publicMarjaParamsSchema.safeParse({ marjaId: 'sistani' }).success).toBe(true);
    expect(publicMarjaParamsSchema.safeParse({ marjaId: '../x' }).success).toBe(false);
    expect(publicMarjaParamsSchema.safeParse({ marjaId: 'sistani', extra: 1 }).success).toBe(false);
  });

  it('lists Marjas with a verified pack summary or null', () => {
    const parsed = publicMarjaListResponseSchema.parse({
      marjas: [
        { marjaId: 'sistani', verifiedPack: summary },
        { marjaId: 'khamenei', verifiedPack: null },
      ],
    });
    expect(parsed.marjas[1]?.verifiedPack).toBeNull();
    expect(
      publicMarjaListResponseSchema.safeParse({
        marjas: [{ marjaId: 'x', verifiedPack: { ...summary, workflows: ['other'] } }],
      }).success,
    ).toBe(false);
  });

  it('distinguishes an available verified pack from "no verified rules yet", stripping extras', () => {
    const available = publicVerifiedPackResponseSchema.parse({
      status: 'AVAILABLE',
      marjaId: 'sistani',
      summary,
      pack: { metadata: {} },
      // Phase 2 step 5: a ledger (staff principal ids) is never part of the contract.
      ledger: { records: [] },
      internal: 'stripped',
    });
    expect(available).not.toHaveProperty('internal');
    expect(available).not.toHaveProperty('ledger');
    expect(
      publicVerifiedPackResponseSchema.parse({ status: 'NOT_AVAILABLE', marjaId: 'khamenei' }),
    ).toEqual({ status: 'NOT_AVAILABLE', marjaId: 'khamenei' });
    expect(
      publicVerifiedPackResponseSchema.safeParse({ status: 'AVAILABLE', marjaId: 'sistani' })
        .success,
    ).toBe(false);
  });
});
