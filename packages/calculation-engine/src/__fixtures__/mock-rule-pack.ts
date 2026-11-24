/**
 * ███ MOCK / NOT FOR PRODUCTION ███
 *
 * Test fixtures for the calculation engine. These packs are NOT religious rulings and do NOT
 * represent any Marja's position. Category names, parameters, values and program structure are
 * deliberately arbitrary (e.g. a 12.5 "rate") so they cannot be mistaken for real Khums rules.
 * They exist only to exercise the interpreter. Never export them from the package, and never
 * use them outside tests and clearly labelled development builds.
 */
import type { Program, RulePack, RulePackActivation } from '@khums/shared-types';

import { sealRulePack } from '../integrity/rule-pack-integrity';

export const MOCK_LABEL = 'MOCK / NOT FOR PRODUCTION';

const annualProgram: Program = {
  steps: [
    {
      id: 'mock-gross',
      label: `${MOCK_LABEL}: sum of mock category A and B`,
      ruleIds: ['mock-rule-a'],
      expression: { op: 'sumCategories', categoryIds: ['mock-category-a', 'mock-category-b'] },
      rounding: null,
    },
    {
      id: 'mock-net',
      label: `${MOCK_LABEL}: gross minus mock category C, floored at zero`,
      ruleIds: ['mock-rule-b'],
      expression: {
        op: 'max',
        operands: [
          {
            op: 'subtract',
            minuend: { op: 'step', stepId: 'mock-gross' },
            subtrahends: [{ op: 'sumCategories', categoryIds: ['mock-category-c'] }],
          },
          { op: 'zero' },
        ],
      },
      rounding: null,
    },
    {
      id: 'mock-share',
      label: `${MOCK_LABEL}: mock rate applied, or consultation when the mock flag is set`,
      ruleIds: ['mock-rule-c'],
      expression: {
        op: 'when',
        condition: { kind: 'answer', questionId: 'mock-flag', equals: true },
        then: { op: 'consult', consultationId: 'mock-consultation' },
        otherwise: {
          op: 'percentage',
          of: { op: 'step', stepId: 'mock-net' },
          rate: { op: 'parameter', parameterId: 'mock-rate' },
        },
      },
      rounding: { scale: 'currency', mode: 'HALF_EVEN' },
    },
  ],
  outputs: [
    { id: 'mock-net-output', label: `${MOCK_LABEL}: net`, stepId: 'mock-net' },
    { id: 'mock-share-output', label: `${MOCK_LABEL}: share`, stepId: 'mock-share' },
  ],
};

const firstTimeProgram: Program = {
  steps: [
    {
      id: 'mock-holdings',
      label: `${MOCK_LABEL}: sum of mock holdings`,
      ruleIds: ['mock-rule-a'],
      expression: { op: 'sumCategories', categoryIds: ['mock-category-a'] },
      rounding: null,
    },
    {
      id: 'mock-holdings-share',
      label: `${MOCK_LABEL}: mock rate on holdings, by mock choice`,
      ruleIds: ['mock-rule-c'],
      expression: {
        op: 'when',
        condition: { kind: 'answer', questionId: 'mock-choice', equals: 'mock-option-1' },
        then: {
          op: 'percentage',
          of: { op: 'step', stepId: 'mock-holdings' },
          rate: { op: 'parameter', parameterId: 'mock-rate' },
        },
        otherwise: { op: 'zero' },
      },
      rounding: { scale: 2, mode: 'DOWN' },
    },
  ],
  outputs: [
    {
      id: 'mock-holdings-share-output',
      label: `${MOCK_LABEL}: share`,
      stepId: 'mock-holdings-share',
    },
  ],
};

/** A complete, structurally valid MOCK pack (status DRAFT). */
export function createMockRulePack(): RulePack {
  return {
    metadata: {
      packId: 'mock-pack',
      marjaId: 'mock-marja',
      version: '0.1.0',
      schemaVersion: 1,
      title: `MOCK RULE PACK — ${MOCK_LABEL} — NOT RELIGIOUS GUIDANCE`,
      status: 'DRAFT',
      isMock: true,
      effectiveFrom: '2000-01-01',
      effectiveTo: null,
      contentHash: null,
      researchBaseline: null,
      approvals: [],
      supersedes: null,
    },
    sources: [{ id: 'mock-source', title: `${MOCK_LABEL} source`, url: null, locator: null }],
    rules: [
      {
        id: 'mock-rule-a',
        status: 'DRAFT',
        summary: MOCK_LABEL,
        sourceRefs: ['mock-source'],
        rulingRefs: [],
      },
      {
        id: 'mock-rule-b',
        status: 'DRAFT',
        summary: MOCK_LABEL,
        sourceRefs: ['mock-source'],
        rulingRefs: [],
      },
      {
        id: 'mock-rule-c',
        status: 'DRAFT',
        summary: MOCK_LABEL,
        sourceRefs: ['mock-source'],
        rulingRefs: [],
      },
    ],
    inputCategories: [
      { id: 'mock-category-a', label: `${MOCK_LABEL}: category A`, ruleIds: ['mock-rule-a'] },
      { id: 'mock-category-b', label: `${MOCK_LABEL}: category B`, ruleIds: ['mock-rule-a'] },
      { id: 'mock-category-c', label: `${MOCK_LABEL}: category C`, ruleIds: ['mock-rule-b'] },
      { id: 'mock-category-unused', label: `${MOCK_LABEL}: unused`, ruleIds: ['mock-rule-a'] },
    ],
    questions: [
      {
        id: 'mock-flag',
        label: `${MOCK_LABEL}: flag`,
        kind: 'boolean',
        choices: [],
        required: false,
        ruleIds: ['mock-rule-c'],
      },
      {
        id: 'mock-choice',
        label: `${MOCK_LABEL}: choice`,
        kind: 'choice',
        choices: ['mock-option-1', 'mock-option-2'],
        required: true,
        ruleIds: ['mock-rule-c'],
      },
    ],
    parameters: [
      { id: 'mock-rate', label: `${MOCK_LABEL}: rate`, value: '12.5', ruleIds: ['mock-rule-c'] },
    ],
    consultations: [
      { id: 'mock-consultation', label: `${MOCK_LABEL}: consultation`, ruleIds: ['mock-rule-c'] },
    ],
    workflows: {
      annual: annualProgram,
      firstTime: firstTimeProgram,
      missedYear: {
        perYear: annualProgram,
        aggregateOutputIds: ['mock-share-output'],
        aggregateRuleIds: ['mock-rule-c'],
      },
    },
  };
}

/**
 * Seals a TEST pack as if it had been re-authored and re-approved: recomputes its integrity from
 * the content and binds every approval to it. Use only to build readiness fixtures; a test that
 * checks tamper detection must modify a sealed pack WITHOUT calling this again.
 */
export function sealApproved(pack: RulePack): RulePack {
  const sealed = sealRulePack(pack);
  if (!sealed.ok) throw new Error(`fixture cannot be sealed: ${sealed.error.code}`);
  const integrity = sealed.value.metadata.integrity;
  return {
    ...sealed.value,
    metadata: {
      ...sealed.value.metadata,
      approvals: sealed.value.metadata.approvals.map((a) =>
        integrity === undefined ? a : { ...a, integrity },
      ),
    },
  };
}

/** Activation record for a pack's DECLARED integrity (as an activation tool would create it). */
export function activationFor(pack: RulePack): RulePackActivation {
  const integrity = pack.metadata.integrity;
  if (integrity === undefined) throw new Error('fixture pack is not sealed');
  return {
    packId: pack.metadata.packId,
    version: pack.metadata.version,
    integrity,
    activatedAt: '2026-02-01',
    activatedBy: 'test-approver',
    approvalReferences: ['TEST'],
    publicationReference: 'TEST-PUBLICATION',
  };
}

/**
 * The same MOCK content, made production-ready *structurally* for testing the readiness gate:
 * published, approved by two different reviewers bound to the recomputed content digest, rules
 * APPROVED, sealed. It stays `isMock: false` ONLY inside tests to prove the gate passes; it is
 * still not a ruling.
 */
export function createApprovedTestPack(): RulePack {
  const pack = createMockRulePack();
  return sealApproved({
    ...pack,
    metadata: {
      ...pack.metadata,
      packId: 'test-approved-pack',
      title: `TEST PACK (${MOCK_LABEL}) — readiness-gate fixture`,
      status: 'PUBLISHED',
      isMock: false,
      approvals: [
        {
          role: 'SCHOLAR_REVIEWER',
          reviewerId: 'test-scholar',
          approvedAt: '2026-01-01',
          reference: 'TEST',
        },
        {
          role: 'APPROVER',
          reviewerId: 'test-approver',
          approvedAt: '2026-01-02',
          reference: 'TEST',
        },
      ],
    },
    rules: pack.rules.map((r) => ({ ...r, status: 'APPROVED' })),
  });
}

/**
 * TEST ONLY (M4.5a): the same MOCK content as a schemaVersion 3 SCHOLAR_REVIEW pack, to exercise
 * the scholar-review gate and the provisional label. Rules are UNVERIFIED (proposed), every rule is
 * sourced, and the pack is sealed. `isMock: false` only inside tests; it is still not a ruling.
 */
export function createScholarReviewTestPack(): RulePack {
  const pack = createMockRulePack();
  const sealed = sealRulePack({
    ...pack,
    metadata: {
      ...pack.metadata,
      packId: 'test-scholar-review-pack',
      title: `TEST PACK (${MOCK_LABEL}) — scholar-review fixture`,
      schemaVersion: 3,
      releaseChannel: 'SCHOLAR_REVIEW',
      status: 'IN_REVIEW',
      isMock: false,
    },
    rules: pack.rules.map((r) => ({ ...r, status: 'UNVERIFIED' })),
  });
  if (!sealed.ok) throw new Error('fixture cannot be sealed');
  return sealed.value;
}

/** TEST ONLY (M4.5a): the approved test pack as a schemaVersion 3 PRODUCTION-channel pack. */
export function createProductionChannelTestPack(): RulePack {
  const pack = createApprovedTestPack();
  return sealApproved({
    ...pack,
    metadata: { ...pack.metadata, schemaVersion: 3, releaseChannel: 'PRODUCTION' },
  });
}
