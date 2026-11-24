import { sealRulePack } from '@khums/core';
import type { RulePack } from '@khums/shared-types';

/**
 * TEST PACK (decision 65): a sealed PRODUCTION-channel pack with a fact mapping, so that the
 * public calculator's governed readiness check can pass once it is taken through the ledger.
 * Arbitrary engineering values (category, "TEST rate"): NOT a ruling of any Marja. `isMock: false`
 * only so that the governance and production gates run; its rules cite a SYNTHETIC test ruling.
 */
const clarify = { handling: 'clarify' } as const;

export function publicTestPack(
  packId: string,
  marjaId: string,
  rulingRef: string,
  options: { readonly version?: string; readonly channel?: 'PRODUCTION' | 'SCHOLAR_REVIEW' } = {},
): RulePack {
  const channel = options.channel ?? 'PRODUCTION';
  const sealed = sealRulePack({
    metadata: {
      packId,
      marjaId,
      version: options.version ?? '1.0.0',
      schemaVersion: 3,
      releaseChannel: channel,
      title: 'TEST PACK — public calculator fixture (not a ruling)',
      status: channel === 'PRODUCTION' ? 'DRAFT' : 'IN_REVIEW',
      isMock: false,
      effectiveFrom: '2000-01-01',
      effectiveTo: null,
      contentHash: null,
      researchBaseline: null,
      approvals: [],
      supersedes: null,
    },
    sources: [{ id: 'test-source', title: 'TEST source', url: null, locator: null }],
    rules: [
      {
        id: 'test-rule',
        status: channel === 'PRODUCTION' ? 'APPROVED' : 'UNVERIFIED',
        summary: 'TEST',
        sourceRefs: ['test-source'],
        rulingRefs: [rulingRef],
      },
    ],
    inputCategories: [{ id: 'test-category', label: 'TEST category', ruleIds: ['test-rule'] }],
    questions: [],
    parameters: [{ id: 'test-rate', label: 'TEST rate', value: '12.5', ruleIds: ['test-rule'] }],
    consultations: [{ id: 'test-consultation', label: 'TEST', ruleIds: ['test-rule'] }],
    workflows: {
      annual: null,
      firstTime: {
        steps: [
          {
            id: 'test-sum',
            label: 'TEST sum',
            ruleIds: ['test-rule'],
            expression: { op: 'sumCategories', categoryIds: ['test-category'] },
            rounding: null,
          },
          {
            id: 'test-share',
            label: 'TEST share',
            ruleIds: ['test-rule'],
            expression: {
              op: 'percentage',
              of: { op: 'step', stepId: 'test-sum' },
              rate: { op: 'parameter', parameterId: 'test-rate' },
            },
            rounding: { scale: 'currency', mode: 'HALF_EVEN' },
          },
        ],
        outputs: [{ id: 'test-out', label: 'TEST share', stepId: 'test-share' }],
      },
      missedYear: null,
    },
    factMapping: {
      mappingVersion: 1,
      factSheetSchemaVersions: [1],
      ruleIds: ['test-rule'],
      unmatched: { handling: 'consult', consultationId: 'test-consultation' },
      rules: [
        {
          id: 'test-map',
          ruleIds: ['test-rule'],
          match: { workflows: ['first-time'], kinds: ['BALANCE'], subtypes: ['CASH'] },
          then: {
            action: 'category',
            categoryId: 'test-category',
            amount: { estimated: clarify, range: clarify, unknown: clarify, notProvided: clarify },
            date: { field: null, approximate: clarify, unknown: clarify, notProvided: clarify },
          },
        },
      ],
    },
  });
  if (!sealed.ok) throw new Error('TEST public pack could not be sealed');
  return sealed.value;
}
