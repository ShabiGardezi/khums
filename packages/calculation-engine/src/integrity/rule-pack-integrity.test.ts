import { describe, expect, it } from 'vitest';

import type { ContentIntegrity, RulePack, RulePackActivation } from '@khums/shared-types';

import {
  createApprovedMappingTestPack,
  createMockMappingPack,
} from '../__fixtures__/mock-mapping-pack';
import {
  activationFor,
  createApprovedTestPack,
  createMockRulePack,
  sealApproved,
} from '../__fixtures__/mock-rule-pack';
import { calculate } from '../calculate';
import {
  checkActivationEligibility,
  checkApprovalEligibility,
  checkProductionReadiness,
  checkPublicationEligibility,
  type ReadinessRequest,
} from '../rule-pack/readiness';
import { validateRulePackStructure } from '../rule-pack/structure';
import {
  canonicalRulePackContent,
  computeRulePackIntegrity,
  EXCLUDED_METADATA_FIELDS,
  sealRulePack,
} from './rule-pack-integrity';

/** Adversarial integrity tests (M4.4.2, FR-1). MOCK / NOT FOR PRODUCTION data only. */

const digest = (pack: unknown): string => {
  const result = computeRulePackIntegrity(pack);
  if (!result.ok) throw new Error(result.error.code);
  return result.value.digest;
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Recursively rebuilds objects with reversed key insertion order. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([k, v]) => [k, reverseKeys(v)]),
    );
  }
  return value;
}

const codes = (pack: RulePack, request: ReadinessRequest) =>
  checkProductionReadiness(pack, request).map((i) => i.code);
const ready = (pack: RulePack, activation: RulePackActivation | null = activationFor(pack)) => ({
  workflow: 'annual' as const,
  activation,
  dateRanges: [{ start: '2026-01-01', end: '2026-12-31' }],
});

describe('determinism', () => {
  it('ignores property insertion order and repeats exactly', () => {
    const pack = createMockMappingPack();
    expect(digest(reverseKeys(pack))).toBe(digest(pack));
    expect(digest(clone(pack))).toBe(digest(pack));
    expect(new Set(Array.from({ length: 5 }, () => digest(pack))).size).toBe(1);
  });

  it('produces lowercase SHA-256 hex bound to its canonicalization and scope', () => {
    const result = computeRulePackIntegrity(createMockRulePack());
    expect(result.ok && result.value).toEqual({
      algorithm: 'SHA-256',
      canonicalization: 'khums-jcs-1',
      scope: 'rule-pack-content-1',
      digest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const canonical = canonicalRulePackContent(createMockRulePack());
    expect(
      canonical.ok && canonical.value.startsWith('{"canonicalization":"khums-jcs-1","content":'),
    ).toBe(true);
  });

  it('handles Unicode and decimal strings exactly', () => {
    const pack = createMockRulePack();
    const withText = (title: string): RulePack => ({
      ...pack,
      metadata: { ...pack.metadata, title },
    });
    expect(digest(withText('Ø € 😀 اردو'))).toBe(digest(withText('Ø € 😀 اردو')));
    expect(digest(withText('café'))).not.toBe(digest(withText('café')));
    const withRate = (value: string): RulePack => ({
      ...pack,
      parameters: pack.parameters.map((p) => ({ ...p, value })),
    });
    expect(digest(withRate('12.5'))).not.toBe(digest(withRate('12.50')));
  });
});

describe('change detection: every calculation-relevant field is hashed', () => {
  const pack = createMockMappingPack();
  const mapping = pack.factMapping!;
  const base = digest(pack);
  const changes: [string, RulePack][] = [
    [
      'mapping action',
      {
        ...pack,
        factMapping: {
          ...mapping,
          rules: mapping.rules.map((r) =>
            r.id === 'mock-map-gift'
              ? { ...r, then: { action: 'exclude', ruleIds: ['mock-rule-exclusion'] } }
              : r,
          ),
        },
      },
    ],
    [
      'mapping unmatched consultation',
      {
        ...pack,
        factMapping: {
          ...mapping,
          unmatched: { handling: 'consult', consultationId: 'mock-fact-consultation' },
        },
      },
    ],
    [
      'mapping rule order',
      { ...pack, factMapping: { ...mapping, rules: [...mapping.rules].reverse() } },
    ],
    [
      'parameter value',
      { ...pack, parameters: pack.parameters.map((p) => ({ ...p, value: '12.6' })) },
    ],
    [
      'rule status',
      {
        ...pack,
        rules: pack.rules.map((r, i) => (i === 0 ? { ...r, status: 'UNVERIFIED' as const } : r)),
      },
    ],
    [
      'rule summary',
      { ...pack, rules: pack.rules.map((r, i) => (i === 0 ? { ...r, summary: 'changed' } : r)) },
    ],
    [
      'source association',
      { ...pack, rules: pack.rules.map((r, i) => (i === 0 ? { ...r, sourceRefs: [] } : r)) },
    ],
    ['source record', { ...pack, sources: pack.sources.map((s) => ({ ...s, locator: 'p. 2' })) }],
    [
      'workflow program step',
      {
        ...pack,
        workflows: {
          ...pack.workflows,
          annual: { ...pack.workflows.annual!, steps: pack.workflows.annual!.steps.slice(0, 1) },
        },
      },
    ],
    [
      'missed-year aggregation',
      {
        ...pack,
        workflows: {
          ...pack.workflows,
          missedYear: { ...pack.workflows.missedYear!, aggregateOutputIds: [] },
        },
      },
    ],
    ['effective from', { ...pack, metadata: { ...pack.metadata, effectiveFrom: '2000-01-02' } }],
    ['effective to', { ...pack, metadata: { ...pack.metadata, effectiveTo: '2030-01-01' } }],
    [
      'question choices',
      {
        ...pack,
        questions: pack.questions.map((q) =>
          q.kind === 'choice' ? { ...q, choices: [...q.choices, 'mock-option-3'] } : q,
        ),
      },
    ],
    [
      'question justification',
      { ...pack, questions: pack.questions.map((q, i) => (i === 0 ? { ...q, ruleIds: [] } : q)) },
    ],
    [
      'consultation',
      {
        ...pack,
        consultations: pack.consultations.map((c, i) => (i === 0 ? { ...c, label: 'changed' } : c)),
      },
    ],
    ['input category', { ...pack, inputCategories: pack.inputCategories.slice(1) }],
    ['pack id / version / Marja', { ...pack, metadata: { ...pack.metadata, version: '0.1.1' } }],
    ['schema version', { ...pack, metadata: { ...pack.metadata, schemaVersion: 1 } }],
    ['mock flag', { ...pack, metadata: { ...pack.metadata, isMock: false } }],
    [
      'research baseline',
      { ...pack, metadata: { ...pack.metadata, researchBaseline: 'baseline-1' } },
    ],
    ['supersedes', { ...pack, metadata: { ...pack.metadata, supersedes: 'mock@0.0.1' } }],
    ['an unknown extra field', { ...pack, extra: true } as unknown as RulePack],
  ];
  for (const [what, changed] of changes) {
    it(`changes the digest when the ${what} changes`, () => {
      expect(digest(changed)).not.toBe(base);
    });
  }

  it('distinguishes an absent fact mapping from any present one', () => {
    const { factMapping: _omit, ...withoutMapping } = pack;
    expect(digest(withoutMapping)).not.toBe(base);
  });
});

describe('exclusions', () => {
  const pack = createApprovedMappingTestPack();
  const base = digest(pack);

  it('excludes exactly the declared integrity, legacy hash, approvals and status', () => {
    expect([...EXCLUDED_METADATA_FIELDS]).toEqual([
      'integrity',
      'contentHash',
      'approvals',
      'status',
    ]);
    const other: ContentIntegrity = { ...pack.metadata.integrity!, digest: 'f'.repeat(64) };
    for (const changed of [
      { ...pack, metadata: { ...pack.metadata, integrity: other } },
      { ...pack, metadata: { ...pack.metadata, contentHash: `sha256:${'0'.repeat(64)}` } },
      { ...pack, metadata: { ...pack.metadata, approvals: [] } },
      { ...pack, metadata: { ...pack.metadata, status: 'SUPERSEDED' as const } },
    ]) {
      expect(digest(changed)).toBe(base);
    }
  });

  it('rejects undefined values and unsupported values inside the content', () => {
    const withUndefined = { ...pack, sources: [{ ...pack.sources[0]!, url: undefined }] };
    expect(computeRulePackIntegrity(withUndefined)).toMatchObject({
      ok: false,
      error: { code: 'UNDEFINED_VALUE', path: '$.content.sources[0].url' },
    });
    const fractional = { ...pack, metadata: { ...pack.metadata, schemaVersion: 2.5 } };
    expect(computeRulePackIntegrity(fractional).ok).toBe(false);
    expect(
      validateRulePackStructure(fractional as unknown as RulePack).issues.map((i) => i.code),
    ).toContain('PACK_NOT_CANONICALIZABLE');
    expect(computeRulePackIntegrity(null).ok).toBe(false);
    expect(computeRulePackIntegrity({ rules: [] }).ok).toBe(false);
  });
});

describe('lifecycle security', () => {
  it('a sealed, approved, activated pack passes every gate', () => {
    const pack = createApprovedMappingTestPack();
    expect(codes(pack, { ...ready(pack), requireFactMapping: true })).toEqual([]);
    expect(checkActivationEligibility(pack)).toEqual([]);
    expect(checkApprovalEligibility(pack)).toEqual([]);
    const approved = { ...pack, metadata: { ...pack.metadata, status: 'APPROVED' as const } };
    expect(checkPublicationEligibility(approved)).toEqual([]);
  });

  it('a tampered pack fails, and its approvals and activation become stale', () => {
    const pack = createApprovedMappingTestPack();
    const activation = activationFor(pack);
    const mapping = pack.factMapping!;
    const tampered: RulePack = {
      ...pack,
      factMapping: {
        ...mapping,
        rules: mapping.rules.map((r) =>
          r.id === 'mock-map-gift'
            ? { ...r, then: { action: 'exclude', ruleIds: ['mock-rule-exclusion'] } }
            : r,
        ),
      },
    };
    const found = codes(tampered, ready(tampered, activation));
    expect(found).toEqual(
      expect.arrayContaining([
        'READINESS_INTEGRITY_MISMATCH',
        'READINESS_APPROVAL_STALE',
        'READINESS_ACTIVATION_STALE',
        'READINESS_MISSING_SCHOLAR_APPROVAL',
        'READINESS_MISSING_APPROVER',
      ]),
    );
    expect(checkActivationEligibility(tampered).map((i) => i.code)).toContain(
      'READINESS_INTEGRITY_MISMATCH',
    );
  });

  it('re-declaring the digest after a change cannot reuse earlier approvals or activation', () => {
    const pack = createApprovedTestPack();
    const activation = activationFor(pack);
    const changed: RulePack = {
      ...pack,
      parameters: pack.parameters.map((p) => ({ ...p, value: '99' })),
    };
    const resealed = sealRulePack(changed);
    if (!resealed.ok) throw new Error('seal failed');
    const found = codes(resealed.value, ready(resealed.value, activation));
    expect(found).not.toContain('READINESS_INTEGRITY_MISMATCH');
    expect(found).toEqual(
      expect.arrayContaining(['READINESS_APPROVAL_STALE', 'READINESS_ACTIVATION_STALE']),
    );
  });

  it('rejects a stale activation even when the declared digest still matches the pack', () => {
    const pack = createApprovedTestPack();
    const stale = {
      ...activationFor(pack),
      integrity: { ...pack.metadata.integrity!, digest: '0'.repeat(64) },
    };
    expect(codes(pack, ready(pack, stale))).toEqual(['READINESS_ACTIVATION_STALE']);
  });

  it('rejects approvals that are unbound or bound to other content', () => {
    const pack = createApprovedTestPack();
    const [scholar, approver] = pack.metadata.approvals;
    const unbound = {
      ...pack,
      metadata: { ...pack.metadata, approvals: [{ ...scholar!, integrity: undefined }, approver!] },
    };
    const { integrity: _i, ...scholarWithoutIntegrity } = scholar!;
    const reallyUnbound = {
      ...pack,
      metadata: { ...pack.metadata, approvals: [scholarWithoutIntegrity, approver!] },
    };
    expect(codes(reallyUnbound as RulePack, ready(pack))).toEqual(
      expect.arrayContaining([
        'READINESS_APPROVAL_NOT_BOUND',
        'READINESS_MISSING_SCHOLAR_APPROVAL',
      ]),
    );
    expect(unbound.metadata.approvals[0]?.integrity).toBeUndefined();
    const otherDigest = { ...scholar!.integrity!, digest: '1'.repeat(64) };
    const stale = {
      ...pack,
      metadata: {
        ...pack.metadata,
        approvals: [{ ...scholar!, integrity: otherDigest }, approver!],
      },
    };
    expect(codes(stale, ready(pack))).toEqual(
      expect.arrayContaining(['READINESS_APPROVAL_STALE', 'READINESS_MISSING_SCHOLAR_APPROVAL']),
    );
  });

  it('rejects an unsupported or wrong canonicalization version', () => {
    const pack = createApprovedTestPack();
    const wrong = {
      ...pack,
      metadata: {
        ...pack.metadata,
        integrity: { ...pack.metadata.integrity!, canonicalization: 'khums-jcs-2' },
      },
    } as unknown as RulePack;
    expect(codes(wrong, ready(pack))).toContain('READINESS_INTEGRITY_UNSUPPORTED');
    const malformed = {
      ...pack,
      metadata: { ...pack.metadata, integrity: { ...pack.metadata.integrity!, digest: 'ABC' } },
    };
    expect(validateRulePackStructure(malformed).issues.map((i) => i.code)).toContain(
      'PACK_INTEGRITY_MALFORMED',
    );
  });

  it('fails closed in production when integrity is missing or only a legacy hash exists', () => {
    const pack = createApprovedTestPack();
    const { integrity: _omit, ...metadata } = pack.metadata;
    const missing = { ...pack, metadata };
    expect(codes(missing, ready(pack))).toContain('READINESS_MISSING_CONTENT_HASH');
    const legacy = { ...missing, metadata: { ...metadata, contentHash: `sha256:${digest(pack)}` } };
    expect(codes(legacy, ready(pack))).toEqual(
      expect.arrayContaining(['READINESS_LEGACY_CONTENT_HASH', 'READINESS_MISSING_CONTENT_HASH']),
    );
    const refused = calculate(
      {
        workflow: 'annual',
        currency: 'USD',
        period: { start: '2026-01-01', end: '2026-12-31' },
        entries: [],
        answers: { 'mock-choice': 'mock-option-1' },
      },
      missing,
      { mode: 'production', activation: activationFor(pack) },
    );
    expect(refused.ok).toBe(false);
  });

  it('recomputes on every check: modifying the same object after a passing check fails', () => {
    const pack = clone(createApprovedTestPack());
    expect(codes(pack, ready(pack))).toEqual([]);
    (pack.parameters[0] as { value: string }).value = '13.5';
    expect(codes(pack, ready(pack))).toContain('READINESS_INTEGRITY_MISMATCH');
  });

  it('keeps approvals valid through publication (status is not content)', () => {
    const approved = {
      ...createApprovedTestPack(),
      metadata: { ...createApprovedTestPack().metadata, status: 'APPROVED' as const },
    };
    expect(checkPublicationEligibility(approved)).toEqual([]);
    const published = {
      ...approved,
      metadata: { ...approved.metadata, status: 'PUBLISHED' as const },
    };
    expect(codes(published, ready(published))).toEqual([]);
    expect(checkPublicationEligibility(published).map((i) => i.code)).toContain(
      'READINESS_NOT_APPROVED_STATUS',
    );
  });

  it('requires sealed, non-MOCK content for approval', () => {
    expect(checkApprovalEligibility(createMockRulePack()).map((i) => i.code)).toEqual(
      expect.arrayContaining(['READINESS_MISSING_CONTENT_HASH', 'READINESS_MOCK_RULE_PACK']),
    );
  });
});

describe('compatibility', () => {
  it('schemaVersion 1 and 2 MOCK packs still validate and calculate in development', () => {
    for (const pack of [createMockRulePack(), createMockMappingPack()]) {
      expect(validateRulePackStructure(pack).issues).toEqual([]);
      const result = calculate(
        {
          workflow: 'first-time',
          currency: 'USD',
          assessmentDate: '2026-06-30',
          entries: [],
          answers: { 'mock-choice': 'mock-option-1' },
        },
        pack,
        { mode: 'development' },
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.meta.rulePack.contentDigest).toBe(digest(pack));
        expect(result.value.meta.guidance).toBe('NOT_RELIGIOUS_GUIDANCE');
      }
    }
  });

  it('no MOCK pack passes production readiness, even sealed, approved and activated', () => {
    for (const mock of [createMockRulePack(), createMockMappingPack()]) {
      const sealed = sealApproved({
        ...mock,
        metadata: {
          ...mock.metadata,
          status: 'PUBLISHED',
          approvals: createApprovedTestPack().metadata.approvals,
        },
        rules: mock.rules.map((r) => ({ ...r, status: 'APPROVED' as const })),
      });
      expect(codes(sealed, ready(sealed))).toEqual(['READINESS_MOCK_RULE_PACK']);
    }
  });
});
