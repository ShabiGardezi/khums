import { sealRulePack } from '@khums/calculation-engine';
import type {
  AuthenticationMethod,
  AuthenticatorAssurance,
  GovernanceActorRef,
  GovernanceLedger,
  GovernancePolicyId,
  GovernancePolicyRegistry,
  GovernanceRole,
  RoleScope,
  RulePack,
  VerifiedPrincipal,
} from '@khums/shared-types';

import { completeReview, requestChanges, startReview, submit } from '../governance/commands';
import { createLedger } from '../governance/ledger';
import { initialPolicyRegistry } from '../governance/policy-registry';
import { establishPrincipal } from './principal';

/**
 * TEST SUPPORT ONLY (M4.6.1). Never exported from the package. The pack is structurally valid and
 * `isMock: false` only so governance gates can be exercised; it is not a ruling.
 */

export const NOW = '2026-11-20T10:00:00.000Z';
export const shift = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();
export const MINUTE = 60_000;
export const ALL: RoleScope = { kind: 'ALL', marjaIds: [] };
export const marjaScope = (...marjaIds: string[]): RoleScope => ({ kind: 'MARJA', marjaIds });
export const MARJA = 'test-marja';
export const PACK_ID = 'test-governed-pack';

export interface PrincipalOptions {
  readonly roles?: readonly (GovernanceRole | readonly [GovernanceRole, RoleScope])[];
  readonly accountStatus?: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  readonly assurance?: AuthenticatorAssurance;
  readonly methods?: readonly AuthenticationMethod[];
  readonly authenticatedAt?: string;
  readonly revoked?: readonly GovernanceRole[];
  readonly establishedAt?: string;
  readonly session?: Partial<{
    sessionId: string;
    issuedAt: string;
    idleExpiresAt: string;
    absoluteExpiresAt: string;
  }>;
}

/** Server-side principal input (what the API would assemble after verification). */
export function principalInput(principalId: string, options: PrincipalOptions = {}) {
  const roles = (options.roles ?? []).map((entry, index) => {
    const [role, scope] = typeof entry === 'string' ? [entry, ALL] : entry;
    const revoked = options.revoked?.includes(role) ?? false;
    return {
      assignmentId: `${principalId}-assignment-${String(index)}`,
      principalId,
      role,
      scope,
      grantedBy: 'test-granting-admin',
      grantedAt: shift(NOW, -30 * 24 * 60 * MINUTE),
      revokedBy: revoked ? 'test-granting-admin' : null,
      revokedAt: revoked ? shift(NOW, -MINUTE) : null,
    };
  });
  return {
    principalId,
    establishedAt: options.establishedAt ?? NOW,
    identity: {
      issuer: 'https://idp.test.invalid/',
      subject: `sub-${principalId}`,
      emailVerified: true,
    },
    accountStatus: options.accountStatus ?? 'ACTIVE',
    roles,
    authentication: {
      authenticatedAt: options.authenticatedAt ?? shift(NOW, -MINUTE),
      methods: options.methods ?? ['PASSKEY'],
      assurance: options.assurance ?? 'AAL3',
    },
    session: {
      sessionId: `session-${principalId}`,
      issuedAt: shift(NOW, -60 * MINUTE),
      idleExpiresAt: shift(NOW, 15 * MINUTE),
      absoluteExpiresAt: shift(NOW, 7 * 60 * MINUTE),
      ...options.session,
    },
  };
}

export function principal(principalId: string, options: PrincipalOptions = {}): VerifiedPrincipal {
  const result = establishPrincipal(principalInput(principalId, options));
  if (!result.ok) throw new Error(`establishPrincipal failed: ${result.error}`);
  return result.value;
}

export const context = (
  who: VerifiedPrincipal,
  ledger: GovernanceLedger | null = null,
  overrides: Partial<{ evaluatedAt: string; state: 'ACTIVE' | 'REVOKED'; sessionId: string }> = {},
) => ({
  decisionId: 'decision-1',
  evaluatedAt: overrides.evaluatedAt ?? NOW,
  session: {
    sessionId: overrides.sessionId ?? who.session.sessionId,
    state: overrides.state ?? 'ACTIVE',
  },
  governance: ledger === null ? null : { ledger },
});

export function testPack(version = '1.0.0', label = 'TEST category', marjaId = MARJA): RulePack {
  const sealed = sealRulePack({
    metadata: {
      packId: PACK_ID,
      marjaId,
      version,
      schemaVersion: 1,
      title: 'TEST PACK — authorization fixture (not a ruling)',
      status: 'DRAFT',
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
        status: 'APPROVED',
        summary: 'TEST',
        sourceRefs: ['test-source'],
        rulingRefs: [],
      },
    ],
    inputCategories: [{ id: 'test-category', label, ruleIds: ['test-rule'] }],
    questions: [],
    parameters: [],
    consultations: [],
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
        ],
        outputs: [{ id: 'test-out', label: 'TEST', stepId: 'test-sum' }],
      },
      missedYear: null,
    },
  });
  if (!sealed.ok) throw new Error('seal failed');
  return sealed.value;
}

export const packResource = (marjaId = MARJA, version = '1.0.0') => ({
  type: 'RULE_PACK_VERSION' as const,
  packId: PACK_ID,
  version,
  marjaId,
  contentDigest: null,
});

const ref = (subject: string): GovernanceActorRef => ({ kind: 'UNVERIFIED_REFERENCE', subject });
const evidence = { reference: 'docs/research/reviews/test/test-pack.REVIEW.md' };

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`fixture step failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

/** A ledger in UNDER_REVIEW (optionally review completed) with the given people. */
export function ledgerUnderReview(
  author: string,
  reviewer: string,
  completed = false,
  pack: RulePack = testPack(),
): GovernanceLedger {
  let ledger = createLedger(PACK_ID, pack.metadata.version);
  ledger = must(
    submit({
      policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
      ledger,
      actor: ref(author),
      at: shift(NOW, -50 * MINUTE),
      pack,
    }),
  ).ledger;
  ledger = must(
    startReview({ ledger, actor: ref(reviewer), at: shift(NOW, -40 * MINUTE), pack }),
  ).ledger;
  if (completed) {
    ledger = must(
      completeReview({
        ledger,
        actor: ref(reviewer),
        at: shift(NOW, -30 * MINUTE),
        pack,
        evidence,
      }),
    ).ledger;
  }
  return ledger;
}

/**
 * First cycle by `firstAuthor` returned with changes; changed content resubmitted by
 * `secondAuthor`, then reviewed and completed by `reviewer`.
 */
export function ledgerWithResubmission(
  firstAuthor: string,
  secondAuthor: string,
  reviewer: string,
): GovernanceLedger {
  const first = testPack();
  const second = testPack('1.0.0', 'TEST category (revised)');
  let ledger = createLedger(PACK_ID, '1.0.0');
  const step = (n: number) => shift(NOW, (n - 60) * MINUTE);
  ledger = must(
    submit({
      policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
      ledger,
      actor: ref(firstAuthor),
      at: step(1),
      pack: first,
    }),
  ).ledger;
  ledger = must(startReview({ ledger, actor: ref(reviewer), at: step(2), pack: first })).ledger;
  ledger = must(
    requestChanges({ ledger, actor: ref(reviewer), at: step(3), pack: first, evidence }),
  ).ledger;
  ledger = must(
    submit({
      policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
      ledger,
      actor: ref(secondAuthor),
      at: step(4),
      pack: second,
    }),
  ).ledger;
  ledger = must(startReview({ ledger, actor: ref(reviewer), at: step(5), pack: second })).ledger;
  ledger = must(
    completeReview({ ledger, actor: ref(reviewer), at: step(6), pack: second, evidence }),
  ).ledger;
  return ledger;
}

/** A policy registry assigning `policy` to the given Marja ids (initial configuration). */
export function policyRegistryFor(
  policy: GovernancePolicyId,
  ...marjaIds: string[]
): GovernancePolicyRegistry {
  const ids = marjaIds.length === 0 ? [MARJA] : marjaIds;
  const registry = initialPolicyRegistry(
    ids.map((marjaId) => ({ marjaId, policy })),
    shift(NOW, -24 * 60 * MINUTE),
    'TEST initial configuration',
    'test-request',
  );
  if (!registry.ok) throw new Error(`registry fixture failed: ${registry.error}`);
  return registry.value;
}
