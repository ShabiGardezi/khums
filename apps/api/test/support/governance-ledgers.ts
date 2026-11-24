import { readFileSync } from 'node:fs';

import { createLedger, executeGovernanceCommand, initialPolicyRegistry } from '@khums/core';
import { establishPrincipal } from '@khums/core/trusted-principal';
import type { GovernanceLedger, RoleAssignment, RulePack } from '@khums/shared-types';

/**
 * Real, verified governance ledgers for persistence tests (M4.6.3a). TEST PACK — sealed fixture,
 * not a ruling (isMock: false only so governance gates run).
 */
export const TEST_PACK = JSON.parse(
  readFileSync(new URL('../fixtures/governance-test-pack.json', import.meta.url), 'utf8'),
) as RulePack;

const NOW = Date.parse('2026-11-21T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

const registry = initialPolicyRegistry(
  [{ marjaId: TEST_PACK.metadata.marjaId, policy: 'INDEPENDENT_REVIEW_V1' }],
  '2026-01-01T00:00:00.000Z',
  'TEST initial configuration',
  'test-request',
);
if (!registry.ok) throw new Error('registry fixture');

function principal(principalId: string, role: RoleAssignment['role']) {
  const established = establishPrincipal({
    principalId,
    establishedAt: iso(NOW),
    identity: { issuer: 'https://t.invalid/', subject: `sub-${principalId}`, emailVerified: false },
    accountStatus: 'ACTIVE',
    roles: [
      {
        assignmentId: `${principalId}-0`,
        principalId,
        role,
        scope: { kind: 'ALL', marjaIds: [] },
        grantedBy: 'test-admin-0',
        grantedAt: '2026-01-01T00:00:00.000Z',
        revokedBy: null,
        revokedAt: null,
      },
    ],
    authentication: {
      authenticatedAt: iso(NOW - 60_000),
      methods: ['PASSWORD', 'TOTP'],
      assurance: 'AAL2',
    },
    session: {
      sessionId: `session-${principalId}`,
      issuedAt: iso(NOW - 60_000),
      idleExpiresAt: iso(NOW + 600_000),
      absoluteExpiresAt: iso(NOW + 3_600_000),
    },
  });
  if (!established.ok) throw new Error(established.error);
  return established.value;
}

/** A ledger with SUBMITTED and REVIEW_STARTED records (two records, valid hash chain). */
export function twoRecordLedger(): {
  readonly one: GovernanceLedger;
  readonly two: GovernanceLedger;
} {
  if (!registry.ok) throw new Error('registry fixture');
  const context = (id: string, who: ReturnType<typeof principal>) => ({
    decisionId: id,
    evaluatedAt: iso(NOW),
    session: { sessionId: who.session.sessionId, state: 'ACTIVE' as const },
    policyRegistry: registry.value,
  });
  const author = principal('test-author', 'RULE_PACK_AUTHOR');
  const reviewer = principal('test-reviewer', 'SCHOLAR_REVIEWER');
  const submitted = executeGovernanceCommand({
    principal: author,
    ledger: createLedger(TEST_PACK.metadata.packId, TEST_PACK.metadata.version),
    command: { type: 'SUBMIT', pack: TEST_PACK },
    context: context('d-1', author),
  });
  if (submitted.status !== 'APPLIED') throw new Error('submit fixture');
  const reviewed = executeGovernanceCommand({
    principal: reviewer,
    ledger: submitted.ledger,
    command: { type: 'START_REVIEW', pack: TEST_PACK },
    context: context('d-2', reviewer),
  });
  if (reviewed.status !== 'APPLIED') throw new Error('review fixture');
  return { one: submitted.ledger, two: reviewed.ledger };
}
