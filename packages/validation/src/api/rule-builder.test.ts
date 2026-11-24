import { describe, expect, it } from 'vitest';

import { ruleVerificationRecordSchema, scholarRuleRevisionSchema } from '../rule-builder';
import {
  ruleVerificationStatusResponseSchema,
  verifyScholarRuleRequestSchema,
  checkScholarRuleRequestSchema,
  createScholarRuleRequestSchema,
  reviseScholarRuleRequestSchema,
  scholarRuleListResponseSchema,
  testScholarRulesRequestSchema,
} from './rule-builder';

/** TEST values only: nothing here is a ruling. */
const content = {
  category: 'MINED_PRODUCT',
  rulingId: '01890000-0000-7000-8000-0000000000a1',
  rate: '12.5',
  includedEntries: [{ kind: 'INCOME', subtype: 'MINED_PRODUCT' }],
  deductions: [{ type: 'COSTS_OF_EARNING', entries: [{ kind: 'EXPENSE', subtype: 'BUSINESS' }] }],
  conditions: [
    { scope: 'CALCULATION', label: 'TEST question?', effect: 'STOP_FOR_REVIEW', entries: [] },
  ],
  exceptions: [],
  threshold: null,
  sourceRefs: [],
  requirementFlags: ['CARRY_OVER'],
  otherRequirement: null,
  notes: null,
};

describe('rule builder contracts', () => {
  it('requests are strict: predefined fields only, never actor, status or ruling version', () => {
    expect(
      createScholarRuleRequestSchema.safeParse({ marjaId: 'sistani', content, reason: 'TEST' })
        .success,
    ).toBe(true);
    for (const extra of [
      { actor: 'x' },
      { status: 'READY_FOR_VERIFICATION' },
      { rulingVersion: 1 },
    ]) {
      expect(
        createScholarRuleRequestSchema.safeParse({
          marjaId: 'sistani',
          content,
          reason: 'TEST',
          ...extra,
        }).success,
      ).toBe(false);
    }
    expect(
      createScholarRuleRequestSchema.safeParse({
        marjaId: 'sistani',
        content: { ...content, expression: '1+1' },
        reason: 'TEST',
      }).success,
    ).toBe(false);
    expect(
      createScholarRuleRequestSchema.safeParse({ marjaId: 'sistani', content, reason: 'x' })
        .success,
    ).toBe(false);
    expect(
      reviseScholarRuleRequestSchema.safeParse({ expectedRevision: 0, content, reason: 'TEST' })
        .success,
    ).toBe(false);
    expect(checkScholarRuleRequestSchema.safeParse({ marjaId: 'sistani', content }).success).toBe(
      true,
    );
    expect(
      checkScholarRuleRequestSchema.safeParse({
        marjaId: 'sistani',
        content: { ...content, rate: 12.5 },
      }).success,
    ).toBe(false);
  });

  it('test requests carry exact decimal strings and known entry types', () => {
    const base = {
      marjaId: 'sistani',
      currency: 'USD',
      period: { start: '2025-01-01', end: '2025-12-31' },
      entries: [
        { id: 'e1', kind: 'INCOME', subtype: 'EMPLOYMENT', amount: '10.00', date: '2025-02-01' },
      ],
      answers: { 'builder:x:confirm:0': true },
      entryAnswers: { e1: { 'builder:x:entry-confirm:0': false } },
    };
    expect(testScholarRulesRequestSchema.safeParse(base).success).toBe(true);
    const entry = base.entries[0];
    expect(
      testScholarRulesRequestSchema.safeParse({ ...base, entries: [{ ...entry, amount: 10 }] })
        .success,
    ).toBe(false);
    expect(
      testScholarRulesRequestSchema.safeParse({ ...base, entries: [{ ...entry, subtype: 'GOLD' }] })
        .success,
    ).toBe(false);
    expect(testScholarRulesRequestSchema.safeParse({ ...base, currency: 'XXX1' }).success).toBe(
      false,
    );
  });

  it('stored revisions validate their content; responses are additive', () => {
    const revision = {
      ruleId: '01890000-0000-7000-8000-000000000001',
      revision: 0,
      marjaId: 'sistani',
      content,
      rulingVersion: 1,
      actor: 'test-scholar',
      at: '2026-11-20T10:00:00.000Z',
      reason: 'TEST save',
    };
    expect(scholarRuleRevisionSchema.safeParse(revision).success).toBe(true);
    expect(scholarRuleRevisionSchema.safeParse({ ...revision, revision: -1 }).success).toBe(false);
    expect(
      scholarRuleListResponseSchema.safeParse({
        marjaId: 'sistani',
        canEdit: true,
        canTest: true,
        rules: [],
        future: 'ignored',
      }).success,
    ).toBe(true);
  });
});

describe('source verification contracts (Phase 2 step 5)', () => {
  const attestations = {
    sourcesAuthentic: true,
    originalTextMatches: true,
    translationAccurate: true,
    attributionCorrect: true,
  };
  const body = { revision: 0, attestations, notes: null, reason: 'TEST verification' };

  it('requires all four attestations to be true, strictly', () => {
    expect(verifyScholarRuleRequestSchema.safeParse(body).success).toBe(true);
    for (const key of Object.keys(attestations)) {
      expect(
        verifyScholarRuleRequestSchema.safeParse({
          ...body,
          attestations: { ...attestations, [key]: false },
        }).success,
      ).toBe(false);
      const { [key as keyof typeof attestations]: _omit, ...missing } = attestations;
      expect(
        verifyScholarRuleRequestSchema.safeParse({ ...body, attestations: missing }).success,
      ).toBe(false);
    }
    // Never an actor, time or status from the client.
    expect(verifyScholarRuleRequestSchema.safeParse({ ...body, actor: 'x' }).success).toBe(false);
  });

  it('stores a record bound to the revision, content hash and pack version', () => {
    const record = {
      verificationId: '01890000-0000-7000-8000-0000000000c1',
      ruleId: '01890000-0000-7000-8000-000000000001',
      revision: 0,
      marjaId: 'sistani',
      contentHash: 'a'.repeat(64),
      rulingRef: '01890000-0000-7000-8000-0000000000a1@1',
      rulingContentDigest: 'b'.repeat(64),
      attestations,
      notes: null,
      actor: 'test-scholar',
      at: '2026-11-24T00:00:00.000Z',
      reason: 'TEST verification',
      decisionId: 'test-decision',
      publication: { packId: 'sistani-builder', version: '1.0.0', contentDigest: 'c'.repeat(64) },
    };
    expect(ruleVerificationRecordSchema.safeParse(record).success).toBe(true);
    expect(ruleVerificationRecordSchema.safeParse({ ...record, contentHash: 'x' }).success).toBe(
      false,
    );
    expect(
      ruleVerificationRecordSchema.safeParse({
        ...record,
        attestations: { ...attestations, attributionCorrect: false },
      }).success,
    ).toBe(false);
  });

  it('describes blockers and the public status', () => {
    const parsed = ruleVerificationStatusResponseSchema.safeParse({
      ruleId: 'r',
      marjaId: 'sistani',
      currentRevision: 1,
      currentVerified: false,
      canVerify: true,
      blockers: [
        { code: 'PASSAGE_NOT_VERIFIED', entityType: 'PASSAGE', entityId: 'p', state: 'DRAFT' },
      ],
      history: [],
      publicStatus: {
        status: 'LIVE',
        packId: 'sistani-builder',
        version: '1.0.0',
        activatedAt: '2026-11-24',
        liveRevision: 0,
        suspendedRules: [],
      },
      preview: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('describes a suspended live version and the publication preview (audit fixes)', () => {
    const parsed = ruleVerificationStatusResponseSchema.safeParse({
      ruleId: 'r',
      marjaId: 'sistani',
      currentRevision: 1,
      currentVerified: false,
      canVerify: true,
      blockers: [],
      history: [],
      publicStatus: {
        status: 'SUSPENDED',
        packId: 'sistani-builder',
        version: '1.0.0',
        activatedAt: '2026-11-24',
        liveRevision: 0,
        suspendedRules: [{ ruleId: 'r', codes: ['PASSAGE_NOT_VERIFIED'] }],
      },
      preview: {
        nextVersion: '2.0.0',
        included: [{ ruleId: 'r', revision: 1 }],
        withheld: [{ ruleId: 'q', revision: 0, reason: 'VERIFIER_NOT_AUTHORIZED' }],
        removedFromPublic: ['q'],
      },
    });
    expect(parsed.success).toBe(true);
  });
});
