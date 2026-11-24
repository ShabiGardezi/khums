import { describe, expect, it } from 'vitest';

import type { AnnualAssessmentInput, RulePack } from '@khums/shared-types';

import { createApprovedMappingTestPack } from './__fixtures__/mock-mapping-pack';
import {
  activationFor,
  createApprovedTestPack,
  createMockRulePack,
  createProductionChannelTestPack,
  createScholarReviewTestPack,
  sealApproved,
} from './__fixtures__/mock-rule-pack';
import {
  calculate,
  checkActivationEligibility,
  checkApprovalEligibility,
  checkProductionReadiness,
  checkPublicationEligibility,
  checkScholarReviewReadiness,
  computeRulePackIntegrity,
  PROVISIONAL_DISCLAIMER,
  PROVISIONAL_LABEL,
  sealRulePack,
  validateRulePackStructure,
} from './index';

// ███ TEST packs built from MOCK content. Figures are interpreter checks, not rulings. ███

const input: AnnualAssessmentInput = {
  workflow: 'annual',
  currency: 'USD',
  period: { start: '2026-01-01', end: '2026-12-31' },
  entries: [
    {
      id: 'a1',
      categoryId: 'mock-category-a',
      amount: '1000',
      date: '2026-03-01',
      description: null,
    },
  ],
  answers: { 'mock-flag': false },
};
const codes = (issues: readonly { code: string }[]) => issues.map((i) => i.code);
const reseal = (pack: RulePack) => {
  const sealed = sealRulePack(pack);
  if (!sealed.ok) throw new Error('seal');
  return sealed.value;
};

describe('scholar-review mode (M4.5a)', () => {
  it('calculates with a scholar-review pack and labels the result PROVISIONAL, never guidance', () => {
    const pack = createScholarReviewTestPack();
    const result = calculate(input, pack, { mode: 'scholar-review' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.meta).toMatchObject({
      mode: 'scholar-review',
      guidance: 'PROVISIONAL_SCHOLAR_REVIEW',
      disclaimer: PROVISIONAL_DISCLAIMER,
      rulePack: { releaseChannel: 'SCHOLAR_REVIEW', isMock: false },
    });
    expect(PROVISIONAL_DISCLAIMER.startsWith(PROVISIONAL_LABEL)).toBe(true);
    expect(PROVISIONAL_LABEL).toBe('PROVISIONAL — FOR SCHOLAR REVIEW ONLY');
  });

  it('refuses every pack that is not a sealed scholar-review pack (strict separation)', () => {
    for (const [name, pack] of [
      ['mock', createMockRulePack()],
      ['legacy production-ready', createApprovedTestPack()],
      ['production channel', createProductionChannelTestPack()],
    ] as const) {
      const result = calculate(input, pack, { mode: 'scholar-review' });
      expect(result.ok, name).toBe(false);
      if (!result.ok) {
        expect(result.error.reason).toBe('RULE_PACK_NOT_READY');
        expect(codes(result.error.issues), name).toContain('CHANNEL_MISMATCH');
      }
    }
  });

  it('refuses DRAFT or SUPERSEDED rules, unsourced rules and unsealed content', () => {
    const base = createScholarReviewTestPack();
    const draft = reseal({
      ...base,
      rules: base.rules.map((r, i) => (i === 0 ? { ...r, status: 'DRAFT' } : r)),
    });
    expect(
      codes(checkScholarReviewReadiness(draft, { workflow: 'annual', dateRanges: [] })),
    ).toContain('PROVISIONAL_RULE_STATUS');
    const superseded = reseal({
      ...base,
      rules: base.rules.map((r, i) => (i === 0 ? { ...r, status: 'SUPERSEDED' } : r)),
    });
    expect(
      codes(checkScholarReviewReadiness(superseded, { workflow: 'annual', dateRanges: [] })),
    ).toContain('PROVISIONAL_RULE_STATUS');
    const unsourced = reseal({
      ...base,
      rules: base.rules.map((r, i) => (i === 0 ? { ...r, sourceRefs: [] } : r)),
    });
    expect(
      codes(checkScholarReviewReadiness(unsourced, { workflow: 'annual', dateRanges: [] })),
    ).toContain('READINESS_RULE_WITHOUT_SOURCE');
    // Content changed after sealing: the declared digest no longer matches.
    const tampered = {
      ...base,
      inputCategories: base.inputCategories.map((c) => ({ ...c, label: 'TEST changed' })),
    };
    expect(calculate(input, tampered, { mode: 'scholar-review' }).ok).toBe(false);
    const { integrity: _integrity, ...unsealedMetadata } = base.metadata;
    const unsealed: RulePack = { ...base, metadata: unsealedMetadata };
    expect(calculate(input, unsealed, { mode: 'scholar-review' }).ok).toBe(false);
  });

  it('accepts APPROVED rules, which still never make the pack authoritative', () => {
    const base = createScholarReviewTestPack();
    const approvedRules = reseal({
      ...base,
      rules: base.rules.map((r) => ({ ...r, status: 'APPROVED' })),
    });
    const result = calculate(input, approvedRules, { mode: 'scholar-review' });
    expect(result.ok && result.value.meta.guidance).toBe('PROVISIONAL_SCHOLAR_REVIEW');
  });

  it('refuses dates outside the pack’s effective range', () => {
    const base = createScholarReviewTestPack();
    const later = reseal({ ...base, metadata: { ...base.metadata, effectiveFrom: '2027-01-01' } });
    expect(
      codes(
        checkScholarReviewReadiness(later, {
          workflow: 'annual',
          dateRanges: [{ start: '2026-01-01', end: '2026-12-31' }],
        }),
      ),
    ).toContain('READINESS_NOT_EFFECTIVE');
  });
});

describe('scholar-review gate across workflows and fact mappings (M4.5a)', () => {
  it('passes every workflow the pack defines, and reports unjustified elements', () => {
    const pack = createScholarReviewTestPack();
    for (const workflow of ['annual', 'first-time', 'missed-year'] as const) {
      expect(checkScholarReviewReadiness(pack, { workflow, dateRanges: [] }), workflow).toEqual([]);
    }
    const missedYear = pack.workflows.missedYear;
    if (missedYear === null) throw new Error('fixture');
    const unjustified = reseal({
      ...pack,
      workflows: { ...pack.workflows, missedYear: { ...missedYear, aggregateRuleIds: [] } },
    });
    expect(
      codes(checkScholarReviewReadiness(unjustified, { workflow: 'missed-year', dateRanges: [] })),
    ).toContain('READINESS_ELEMENT_WITHOUT_RULE');
  });

  it('accepts a fact mapping whose rules are proposed (UNVERIFIED), but not unjustified mappings', () => {
    const base = createApprovedMappingTestPack();
    const mapped = reseal({
      ...base,
      metadata: {
        ...base.metadata,
        schemaVersion: 3,
        releaseChannel: 'SCHOLAR_REVIEW',
        status: 'IN_REVIEW',
        approvals: [],
      },
      rules: base.rules.map((r) => ({ ...r, status: 'UNVERIFIED' })),
    });
    expect(checkScholarReviewReadiness(mapped, { workflow: 'annual', dateRanges: [] })).toEqual([]);
    const mapping = mapped.factMapping;
    if (mapping === undefined) throw new Error('fixture');
    const unjustified = reseal({ ...mapped, factMapping: { ...mapping, ruleIds: [] } });
    expect(
      codes(checkScholarReviewReadiness(unjustified, { workflow: 'annual', dateRanges: [] })),
    ).toContain('READINESS_ELEMENT_WITHOUT_RULE');
  });
});

describe('scholar-review packs never reach production (M4.5a)', () => {
  /** A scholar-review pack dressed up with every production attribute (adversarial). */
  function disguised(): RulePack {
    const base = createScholarReviewTestPack();
    const approved = createApprovedTestPack();
    return sealApproved({
      ...base,
      metadata: {
        ...base.metadata,
        status: 'PUBLISHED',
        approvals: approved.metadata.approvals,
      },
      rules: base.rules.map((r) => ({ ...r, status: 'APPROVED' })),
    });
  }

  it('production mode refuses it even when published, approved and activated', () => {
    const pack = disguised();
    const result = calculate(input, pack, { mode: 'production', activation: activationFor(pack) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.error.issues)).toContain('READINESS_SCHOLAR_REVIEW_PACK');
    expect(
      codes(
        checkProductionReadiness(pack, {
          workflow: 'annual',
          activation: activationFor(pack),
          dateRanges: [],
        }),
      ),
    ).toEqual(['READINESS_SCHOLAR_REVIEW_PACK']);
  });

  it('governance refuses to approve, publish or activate it', () => {
    const pack = disguised();
    expect(codes(checkApprovalEligibility(pack))).toContain('READINESS_SCHOLAR_REVIEW_PACK');
    expect(
      codes(
        checkPublicationEligibility({
          ...pack,
          metadata: { ...pack.metadata, status: 'APPROVED' },
        }),
      ),
    ).toContain('READINESS_SCHOLAR_REVIEW_PACK');
    expect(codes(checkActivationEligibility(pack))).toContain('READINESS_SCHOLAR_REVIEW_PACK');
  });

  it('relabelling the channel changes the digest, so approvals and activations never carry over', () => {
    const review = createScholarReviewTestPack();
    const relabelled = {
      ...review,
      metadata: { ...review.metadata, releaseChannel: 'PRODUCTION' as const },
    };
    const before = computeRulePackIntegrity(review);
    const after = computeRulePackIntegrity(relabelled);
    expect(before.ok && after.ok && before.value.digest !== after.value.digest).toBe(true);
    // The declared integrity no longer matches: sealed content was changed.
    expect(
      calculate(input, relabelled, { mode: 'production', activation: activationFor(review) }).ok,
    ).toBe(false);
  });

  it('development mode refuses scholar-review packs (they always carry the provisional label)', () => {
    const result = calculate(input, createScholarReviewTestPack(), { mode: 'development' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.error.issues)).toEqual(['CHANNEL_MISMATCH']);
  });

  it('production-channel schemaVersion 3 packs follow the unchanged production gate', () => {
    const pack = createProductionChannelTestPack();
    const result = calculate(input, pack, { mode: 'production', activation: activationFor(pack) });
    expect(result.ok && result.value.meta).toMatchObject({
      guidance: 'APPROVED_RULE_PACK',
      rulePack: { releaseChannel: 'PRODUCTION' },
    });
  });
});

describe('schemaVersion 3 structure (M4.5a)', () => {
  it('requires the release channel in version 3 and forbids it before', () => {
    const v3 = createScholarReviewTestPack();
    const { releaseChannel: _channel, ...withoutChannel } = v3.metadata;
    const missing: RulePack = { ...v3, metadata: withoutChannel };
    expect(codes(validateRulePackStructure(missing).issues)).toContain('CHANNEL_MISMATCH');
    const legacy = createMockRulePack();
    const withChannel = {
      ...legacy,
      metadata: { ...legacy.metadata, releaseChannel: 'PRODUCTION' as const },
    };
    expect(codes(validateRulePackStructure(withChannel).issues)).toContain('CHANNEL_MISMATCH');
  });

  it('a MOCK pack can never be on the scholar-review channel', () => {
    const v3 = createScholarReviewTestPack();
    const mock = { ...v3, metadata: { ...v3.metadata, isMock: true } };
    expect(codes(validateRulePackStructure(mock).issues)).toContain(
      'STRUCTURE_MOCK_SCHOLAR_REVIEW',
    );
  });

  it('versions 1 and 2 keep their digests (no release channel is ever added)', () => {
    const legacy = createApprovedTestPack();
    const recomputed = computeRulePackIntegrity(legacy);
    expect(recomputed.ok && recomputed.value.digest).toBe(legacy.metadata.integrity?.digest);
    expect('releaseChannel' in legacy.metadata).toBe(false);
  });
});
