import { establishPrincipal } from '@khums/core/trusted-principal';
import type { GovernanceRole } from '@khums/shared-types';

import { attachStaffAuthentication } from '../../src/auth/staff-request';

/**
 * TEST ONLY (M4.6.4a): a request object carrying a staff principal exactly as the staff guard
 * leaves it (`attachStaffAuthentication`), established at `nowMs` so it is never stale.
 */
export type TestScope = 'ALL' | readonly string[];

const iso = (ms: number) => new Date(ms).toISOString();

export function staffRequest(
  nowMs: number,
  principalId: string,
  ...roles: readonly (readonly [GovernanceRole, TestScope])[]
): object {
  const established = establishPrincipal({
    principalId,
    establishedAt: iso(nowMs),
    identity: {
      issuer: 'https://staff-accounts.khums.invalid/',
      subject: principalId,
      emailVerified: false,
    },
    accountStatus: 'ACTIVE',
    roles: roles.map(([role, scope], index) => ({
      assignmentId: `${principalId}-${String(index)}`,
      principalId,
      role,
      scope:
        scope === 'ALL' ? { kind: 'ALL', marjaIds: [] } : { kind: 'MARJA', marjaIds: [...scope] },
      grantedBy: 'test-granting-admin',
      grantedAt: '2026-01-01T00:00:00.000Z',
      revokedBy: null,
      revokedAt: null,
    })),
    authentication: {
      authenticatedAt: iso(nowMs - 60_000),
      methods: ['PASSWORD'],
      assurance: 'AAL1',
    },
    session: {
      sessionId: `session-${principalId}`,
      issuedAt: iso(nowMs - 60_000),
      idleExpiresAt: iso(nowMs + 600_000),
      absoluteExpiresAt: iso(nowMs + 3_600_000),
    },
  });
  if (!established.ok) throw new Error(established.error);
  const request = {};
  attachStaffAuthentication(request, {
    principal: established.value,
    sessionState: 'ACTIVE',
    session: { sessionIdHash: 'h', passwordChangeOnly: false, expiresAt: iso(nowMs + 600_000) },
    account: { username: principalId },
  });
  return request;
}
