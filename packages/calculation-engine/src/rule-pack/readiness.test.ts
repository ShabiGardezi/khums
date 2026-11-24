import { describe, expect, it } from 'vitest';

import type { RulePack } from '@khums/shared-types';

import {
  activationFor,
  createApprovedTestPack,
  createMockRulePack,
  sealApproved,
} from '../__fixtures__/mock-rule-pack';
import {
  checkActivationEligibility,
  checkProductionReadiness,
  type ReadinessRequest,
} from './readiness';

const request = (pack: RulePack, overrides: Partial<ReadinessRequest> = {}): ReadinessRequest => ({
  workflow: 'annual',
  activation: 'activation' in overrides ? (overrides.activation ?? null) : activationFor(pack),
  dateRanges: [{ start: '2026-01-01', end: '2026-12-31' }],
  ...overrides,
});

const codes = (pack: RulePack, overrides: Partial<ReadinessRequest> = {}) =>
  checkProductionReadiness(pack, request(pack, overrides)).map((i) => i.code);

describe('checkProductionReadiness', () => {
  it('passes for a published, approved, activated, sourced (test) pack', () => {
    expect(codes(createApprovedTestPack())).toEqual([]);
  });

  it('refuses the MOCK pack with every relevant reason', () => {
    const pack = createMockRulePack();
    const result = codes(pack, { activation: null });
    expect(result).toEqual(
      expect.arrayContaining([
        'READINESS_MOCK_RULE_PACK',
        'READINESS_NOT_PUBLISHED',
        'READINESS_MISSING_SCHOLAR_APPROVAL',
        'READINESS_MISSING_APPROVER',
        'READINESS_MISSING_CONTENT_HASH',
        'READINESS_NOT_ACTIVATED',
        'READINESS_RULE_NOT_APPROVED',
      ]),
    );
    expect(
      checkProductionReadiness(pack, request(pack, { activation: null })).every(
        (i) => i.severity === 'error',
      ),
    ).toBe(true);
  });

  it('requires approver and scholar to be different people', () => {
    const pack = createApprovedTestPack();
    const sameReviewer: RulePack = {
      ...pack,
      metadata: {
        ...pack.metadata,
        approvals: pack.metadata.approvals.map((a) => ({ ...a, reviewerId: 'same-person' })),
      },
    };
    expect(codes(sameReviewer)).toContain('READINESS_APPROVAL_SEPARATION');
  });

  describe('single governing-scholar approval (SINGLE_SCHOLAR_V1)', () => {
    /** The approved test pack, re-signed by one governing scholar instead of two people. */
    const singleScholarPack = (): RulePack => {
      const pack = createApprovedTestPack();
      const integrity = pack.metadata.integrity;
      return {
        ...pack,
        metadata: {
          ...pack.metadata,
          approvals: [
            {
              role: 'GOVERNING_SCHOLAR',
              reviewerId: 'test-governing-scholar',
              approvedAt: '2026-01-02',
              reference: 'TEST',
              ...(integrity === undefined ? {} : { integrity }),
            },
          ],
        },
      };
    };

    it('satisfies the approval sign-off and nothing else changes', () => {
      expect(codes(singleScholarPack())).toEqual([]);
    });

    it('does not count when stale or unbound', () => {
      const pack = singleScholarPack();
      const [approval] = pack.metadata.approvals;
      if (approval?.integrity === undefined) throw new Error('fixture');
      const stale: RulePack = {
        ...pack,
        metadata: {
          ...pack.metadata,
          approvals: [
            { ...approval, integrity: { ...approval.integrity, digest: '0'.repeat(64) } },
          ],
        },
      };
      expect(codes(stale)).toEqual(
        expect.arrayContaining([
          'READINESS_APPROVAL_STALE',
          'READINESS_MISSING_SCHOLAR_APPROVAL',
          'READINESS_MISSING_APPROVER',
        ]),
      );
      const { integrity: _omit, ...unbound } = approval;
      expect(codes({ ...pack, metadata: { ...pack.metadata, approvals: [unbound] } })).toEqual(
        expect.arrayContaining(['READINESS_APPROVAL_NOT_BOUND', 'READINESS_MISSING_APPROVER']),
      );
    });

    it('keeps every other production requirement mandatory', () => {
      const pack = singleScholarPack();
      // Not published, MOCK, changed content and no activation are all still refused.
      expect(codes({ ...pack, metadata: { ...pack.metadata, status: 'APPROVED' } })).toContain(
        'READINESS_NOT_PUBLISHED',
      );
      expect(codes({ ...pack, metadata: { ...pack.metadata, isMock: true } })).toContain(
        'READINESS_MOCK_RULE_PACK',
      );
      const changed: RulePack = {
        ...pack,
        rules: pack.rules.map((r, i) => (i === 0 ? { ...r, summary: `${r.summary} (edited)` } : r)),
      };
      expect(codes(changed)).toEqual(expect.arrayContaining(['READINESS_APPROVAL_STALE']));
      expect(codes(pack, { activation: null })).toContain('READINESS_NOT_ACTIVATED');
      const unapproved: RulePack = {
        ...pack,
        rules: pack.rules.map((r) => ({ ...r, status: 'UNVERIFIED' as const })),
      };
      expect(codes(sealApproved(unapproved))).toContain('READINESS_RULE_NOT_APPROVED');
    });
  });

  describe('source-verification sign-off (SOURCE_VERIFIED_AUTO_V1, decision 67)', () => {
    /** The approved test pack, signed off by the source verification of one person. */
    const sourceVerifiedPack = (): RulePack => {
      const pack = createApprovedTestPack();
      const integrity = pack.metadata.integrity;
      return {
        ...pack,
        metadata: {
          ...pack.metadata,
          approvals: [
            {
              role: 'SOURCE_VERIFIER',
              reviewerId: 'test-source-verifier',
              approvedAt: '2026-01-02',
              reference: 'TEST',
              ...(integrity === undefined ? {} : { integrity }),
            },
          ],
        },
      };
    };

    it('satisfies the approval sign-off and changes nothing else', () => {
      expect(codes(sourceVerifiedPack())).toEqual([]);
    });

    it('keeps integrity, publication, activation and rule approval mandatory', () => {
      const pack = sourceVerifiedPack();
      const [approval] = pack.metadata.approvals;
      if (approval?.integrity === undefined) throw new Error('fixture');
      const stale: RulePack = {
        ...pack,
        metadata: {
          ...pack.metadata,
          approvals: [
            { ...approval, integrity: { ...approval.integrity, digest: '0'.repeat(64) } },
          ],
        },
      };
      expect(codes(stale)).toEqual(
        expect.arrayContaining(['READINESS_APPROVAL_STALE', 'READINESS_MISSING_APPROVER']),
      );
      expect(codes({ ...pack, metadata: { ...pack.metadata, status: 'APPROVED' } })).toContain(
        'READINESS_NOT_PUBLISHED',
      );
      expect(codes(pack, { activation: null })).toContain('READINESS_NOT_ACTIVATED');
      const unapproved: RulePack = {
        ...pack,
        rules: pack.rules.map((r) => ({ ...r, status: 'UNVERIFIED' as const })),
      };
      expect(codes(sealApproved(unapproved))).toContain('READINESS_RULE_NOT_APPROVED');
    });
  });

  it('requires a matching activation', () => {
    const pack = createApprovedTestPack();
    expect(codes(pack, { activation: null })).toContain('READINESS_NOT_ACTIVATED');
    expect(codes(pack, { activation: { ...activationFor(pack), version: '9.9.9' } })).toContain(
      'READINESS_ACTIVATION_MISMATCH',
    );
    expect(
      codes(pack, {
        activation: { ...activationFor(pack), approvalReferences: ['UNKNOWN-REVIEW'] },
      }),
    ).toContain('READINESS_ACTIVATION_MISMATCH');
  });

  it('refuses when a used rule is unapproved, unsourced or missing for an element', () => {
    const pack = createApprovedTestPack();
    const unverified: RulePack = {
      ...pack,
      rules: pack.rules.map((r) => (r.id === 'mock-rule-c' ? { ...r, status: 'UNVERIFIED' } : r)),
    };
    expect(codes(unverified)).toContain('READINESS_RULE_NOT_APPROVED');

    const unsourced: RulePack = {
      ...pack,
      rules: pack.rules.map((r) => (r.id === 'mock-rule-b' ? { ...r, sourceRefs: [] } : r)),
    };
    expect(codes(unsourced)).toContain('READINESS_RULE_WITHOUT_SOURCE');

    const annual = pack.workflows.annual!;
    const stepWithoutRule: RulePack = {
      ...pack,
      workflows: {
        ...pack.workflows,
        annual: {
          ...annual,
          steps: annual.steps.map((s, i) => (i === 0 ? { ...s, ruleIds: [] } : s)),
        },
      },
    };
    expect(codes(stepWithoutRule)).toContain('READINESS_ELEMENT_WITHOUT_RULE');

    const parameterWithoutRule: RulePack = {
      ...pack,
      parameters: pack.parameters.map((p) => ({ ...p, ruleIds: [] })),
    };
    expect(codes(parameterWithoutRule)).toContain('READINESS_ELEMENT_WITHOUT_RULE');
  });

  it('ignores unapproved rules that the workflow does not use', () => {
    const pack = createApprovedTestPack();
    // Re-authored and re-approved (resealed): only the unused draft rule differs.
    const withUnusedDraft: RulePack = sealApproved({
      ...pack,
      rules: [
        ...pack.rules,
        { id: 'unused', status: 'DRAFT', summary: 'x', sourceRefs: [], rulingRefs: [] },
      ],
    });
    expect(codes(withUnusedDraft)).toEqual([]);
  });

  it('checks effective dates', () => {
    const pack = createApprovedTestPack();
    const bounded: RulePack = sealApproved({
      ...pack,
      metadata: { ...pack.metadata, effectiveFrom: '2026-03-01', effectiveTo: '2026-06-30' },
    });
    expect(codes(bounded)).toContain('READINESS_NOT_EFFECTIVE');
    expect(codes(bounded, { dateRanges: [{ start: '2026-04-01', end: '2026-05-01' }] })).toEqual(
      [],
    );
  });

  it('requires a justified aggregation for missed-year packs', () => {
    const pack = createApprovedTestPack();
    const noAggregateRule: RulePack = {
      ...pack,
      workflows: {
        ...pack.workflows,
        missedYear: { ...pack.workflows.missedYear!, aggregateRuleIds: [] },
      },
    };
    expect(codes(noAggregateRule, { workflow: 'missed-year' })).toContain(
      'READINESS_ELEMENT_WITHOUT_RULE',
    );
  });
});

describe('checkActivationEligibility', () => {
  it('allows activation only for fully approved packs', () => {
    expect(checkActivationEligibility(createApprovedTestPack())).toEqual([]);
    const codes = checkActivationEligibility(createMockRulePack()).map((i) => i.code);
    expect(codes).toContain('READINESS_MOCK_RULE_PACK');
    expect(codes).not.toContain('READINESS_NOT_ACTIVATED');
  });
});

describe('checkProductionReadiness — other workflows', () => {
  it('checks the first-time program and open-ended effective dates', () => {
    const pack = createApprovedTestPack();
    expect(
      checkProductionReadiness(pack, {
        workflow: 'first-time',
        activation: activationFor(pack),
        dateRanges: [{ start: '2030-01-01', end: '2030-01-01' }],
      }),
    ).toEqual([]);
    const unapprovedFirstTime: RulePack = {
      ...pack,
      questions: pack.questions.map((q) => (q.id === 'mock-choice' ? { ...q, ruleIds: [] } : q)),
    };
    expect(
      checkProductionReadiness(unapprovedFirstTime, {
        workflow: 'first-time',
        activation: activationFor(pack),
        dateRanges: [],
      }).map((i) => i.code),
    ).toContain('READINESS_ELEMENT_WITHOUT_RULE');
  });

  it('reports a workflow the pack does not define as having nothing to check', () => {
    const pack = createApprovedTestPack();
    const noFirstTime: RulePack = sealApproved({
      ...pack,
      workflows: { ...pack.workflows, firstTime: null },
    });
    expect(
      checkProductionReadiness(noFirstTime, {
        workflow: 'first-time',
        activation: activationFor(noFirstTime),
        dateRanges: [],
      }),
    ).toEqual([]);
  });

  it('requires rules for categories and consultations used by the program', () => {
    const pack = createApprovedTestPack();
    const bare: RulePack = {
      ...pack,
      inputCategories: pack.inputCategories.map((c) => ({ ...c, ruleIds: [] })),
      consultations: pack.consultations.map((c) => ({ ...c, ruleIds: [] })),
    };
    const issues = checkProductionReadiness(bare, {
      workflow: 'annual',
      activation: activationFor(pack),
      dateRanges: [],
    });
    expect(
      issues.filter((i) => i.code === 'READINESS_ELEMENT_WITHOUT_RULE').map((i) => i.path),
    ).toEqual(expect.arrayContaining(['inputCategories.0', 'consultations.0']));
  });
});

describe('checkActivationEligibility — partial packs', () => {
  it('only checks workflows the pack defines', () => {
    const pack = createApprovedTestPack();
    const annualOnly: RulePack = sealApproved({
      ...pack,
      workflows: { annual: pack.workflows.annual, firstTime: null, missedYear: null },
    });
    expect(checkActivationEligibility(annualOnly)).toEqual([]);
  });
});
