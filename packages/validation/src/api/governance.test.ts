import { describe, expect, it } from 'vitest';

import {
  auditEventListQuerySchema,
  bindGovernancePolicyRequestSchema,
  emergencyWithdrawGovernancePackRequestSchema,
  confirmGovernancePolicyRequestSchema,
  governanceCommandRequestSchema,
  governanceEvidenceCommandRequestSchema,
  governancePackVersionParamsSchema,
  governancePackVersionSchema,
  submitGovernancePackRequestSchema,
  supersedeGovernancePackRequestSchema,
  withdrawGovernancePackRequestSchema,
} from './governance';

/** Governance API contracts (M4.6.4a): strict requests, additive responses. */

describe('governance request contracts', () => {
  it('accept the documented shapes', () => {
    expect(governanceCommandRequestSchema.safeParse({ expectedSequence: 3 }).success).toBe(true);
    expect(
      governanceEvidenceCommandRequestSchema.safeParse({
        expectedSequence: 2,
        evidence: { reference: 'docs/research/reviews/x/p.REVIEW.md#round-1' },
      }).success,
    ).toBe(true);
    expect(
      submitGovernancePackRequestSchema.safeParse({ expectedSequence: 0, pack: { metadata: {} } })
        .success,
    ).toBe(true);
    expect(
      withdrawGovernancePackRequestSchema.safeParse({ expectedSequence: 1, reason: 'OTHER' })
        .success,
    ).toBe(true);
    expect(
      supersedeGovernancePackRequestSchema.safeParse({
        expectedSequence: 5,
        successorVersion: '1.1.0',
      }).success,
    ).toBe(true);
  });

  it('never accept an actor, time, Marja, policy or content on later commands', () => {
    for (const extra of [
      { actor: { kind: 'STAFF_PRINCIPAL', subject: 'x' } },
      { recordedAt: '2026-01-01T00:00:00.000Z' },
      { marjaId: 'test-marja' },
      { governancePolicy: 'SINGLE_SCHOLAR_V1' },
      { pack: {} },
    ]) {
      expect(
        governanceCommandRequestSchema.safeParse({ expectedSequence: 0, ...extra }).success,
        JSON.stringify(extra),
      ).toBe(false);
    }
    expect(
      submitGovernancePackRequestSchema.safeParse({
        expectedSequence: 0,
        pack: {},
        actor: { kind: 'STAFF_PRINCIPAL', subject: 'x' },
      }).success,
    ).toBe(false);
  });

  it('bound sequences, versions, evidence references and withdrawal reasons', () => {
    for (const expectedSequence of [-1, 1.5, '1', 10_001]) {
      expect(governanceCommandRequestSchema.safeParse({ expectedSequence }).success).toBe(false);
    }
    for (const reference of ['', ' leading-space', 'javascript:alert(1) x', 'a'.repeat(501)]) {
      expect(
        governanceEvidenceCommandRequestSchema.safeParse({
          expectedSequence: 0,
          evidence: { reference },
        }).success,
        reference,
      ).toBe(false);
    }
    expect(
      withdrawGovernancePackRequestSchema.safeParse({ expectedSequence: 0, reason: 'BORED' })
        .success,
    ).toBe(false);
    for (const version of ['1', '1.0', 'latest', '1.0.0-rc1']) {
      expect(
        governancePackVersionParamsSchema.safeParse({ packId: 'p', version }).success,
        version,
      ).toBe(false);
    }
    expect(
      governancePackVersionParamsSchema.safeParse({ packId: '../etc', version: '1.0.0' }).success,
    ).toBe(false);
  });

  it('the policy confirmation names every field of the proposal it confirms', () => {
    const confirmation = {
      proposalRecordId: 'policy#7',
      marjaId: 'test-marja',
      previousPolicy: 'SINGLE_SCHOLAR_V1',
      newPolicy: 'INDEPENDENT_REVIEW_V1',
      reason: 'TEST reason',
      proposalRequestId: 'req-1',
    };
    expect(confirmGovernancePolicyRequestSchema.safeParse(confirmation).success).toBe(true);
    const { proposalRequestId: _omitted, ...missing } = confirmation;
    expect(confirmGovernancePolicyRequestSchema.safeParse(missing).success).toBe(false);
  });

  it('coerces and bounds audit paging', () => {
    expect(auditEventListQuerySchema.parse({ afterSequence: '4', limit: '10' })).toEqual({
      afterSequence: 4,
      limit: 10,
    });
    expect(auditEventListQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
    expect(auditEventListQuerySchema.safeParse({ cursor: 'x' }).success).toBe(false);
  });
});

describe('governance response contracts are additive', () => {
  it('tolerate new fields', () => {
    const version = {
      packId: 'p',
      version: '1.0.0',
      marjaId: 'test-marja',
      state: 'SUBMITTED',
      policy: 'INDEPENDENT_REVIEW_V1',
      policySource: 'RECORDED',
      activated: false,
      contentDigest: 'a'.repeat(64),
      expectedSequence: 1,
      lastRecordedAt: '2026-11-21T10:00:00.000Z',
      records: [],
      futureField: true,
    };
    expect(governancePackVersionSchema.safeParse(version).success).toBe(true);
  });
});

describe('M5.2.1 command contracts', () => {
  it('emergency withdrawal needs a reason code and a reason text; nothing else', () => {
    const ok = emergencyWithdrawGovernancePackRequestSchema.safeParse({
      expectedSequence: 5,
      reason: 'ERROR_FOUND',
      note: '  TEST emergency  ',
    });
    expect(ok.success && ok.data.note).toBe('TEST emergency');
    for (const bad of [
      { expectedSequence: 5, reason: 'ERROR_FOUND' },
      { expectedSequence: 5, reason: 'ERROR_FOUND', note: 'ab' },
      { expectedSequence: 5, reason: 'ERROR_FOUND', note: 'x'.repeat(501) },
      { expectedSequence: 5, reason: 'NOT_A_REASON', note: 'TEST note' },
      { expectedSequence: 5, reason: 'OTHER', note: 'TEST note', actor: 'someone' },
    ]) {
      expect(
        emergencyWithdrawGovernancePackRequestSchema.safeParse(bad).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });

  it('binding takes only the ledger length and a reason, never a policy', () => {
    expect(
      bindGovernancePolicyRequestSchema.safeParse({ expectedSequence: 1, reason: 'TEST binding' })
        .success,
    ).toBe(true);
    for (const bad of [
      { expectedSequence: 1 },
      { expectedSequence: 1, reason: 'TEST binding', policy: 'SINGLE_SCHOLAR_V1' },
      { expectedSequence: 1, reason: 'TEST binding', governancePolicy: 'SINGLE_SCHOLAR_V1' },
    ]) {
      expect(bindGovernancePolicyRequestSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(
        false,
      );
    }
  });
});
