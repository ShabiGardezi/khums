import { describe, expect, it } from 'vitest';

import {
  authorizationContextSchema,
  authorizationResourceSchema,
  GOVERNANCE_ROLES,
  GRANTABLE_STAFF_ROLES,
  isLegacyStaffRole,
  LEGACY_STAFF_ROLES,
  roleAssignmentSchema,
  roleScopeSchema,
  trustedPrincipalInputSchema,
} from './index';

// Test values only.
const assignment = {
  assignmentId: 'a-1',
  principalId: 'test-p',
  role: 'AUDITOR',
  scope: { kind: 'ALL', marjaIds: [] },
  grantedBy: 'test-admin',
  grantedAt: '2026-11-01T00:00:00.000Z',
  revokedBy: null,
  revokedAt: null,
};
const principalInput = {
  principalId: 'test-p',
  establishedAt: '2026-11-20T10:00:00.000Z',
  identity: { issuer: 'https://idp.test.invalid/', subject: 'sub-1', emailVerified: true },
  accountStatus: 'ACTIVE',
  roles: [assignment],
  authentication: {
    authenticatedAt: '2026-11-20T09:59:00.000Z',
    methods: ['PASSKEY'],
    assurance: 'AAL3',
  },
  session: {
    sessionId: 's-1',
    issuedAt: '2026-11-20T09:00:00.000Z',
    idleExpiresAt: '2026-11-20T10:15:00.000Z',
    absoluteExpiresAt: '2026-11-20T17:00:00.000Z',
  },
};

describe('authorization schemas', () => {
  it('separates grantable roles from legacy roles that stay readable (decision 64)', () => {
    expect(GRANTABLE_STAFF_ROLES).toEqual(['SUPER_ADMIN', 'SCHOLAR']);
    expect(LEGACY_STAFF_ROLES).toEqual([
      'RULE_PACK_AUTHOR',
      'RELIGIOUS_RESEARCHER',
      'SCHOLAR_REVIEWER',
      'INDEPENDENT_APPROVER',
      'AUDITOR',
      'GOVERNING_SCHOLAR',
    ]);
    for (const role of LEGACY_STAFF_ROLES) {
      expect(isLegacyStaffRole(role)).toBe(true);
      // Stored assignments with legacy roles must stay readable forever.
      expect(roleAssignmentSchema.safeParse({ ...assignment, role }).success).toBe(true);
    }
    for (const role of GRANTABLE_STAFF_ROLES) expect(isLegacyStaffRole(role)).toBe(false);
  });

  it('lists every governance role (grantable first, then legacy)', () => {
    expect(GOVERNANCE_ROLES).toEqual([
      'SUPER_ADMIN',
      'SCHOLAR',
      'RULE_PACK_AUTHOR',
      'RELIGIOUS_RESEARCHER',
      'SCHOLAR_REVIEWER',
      'INDEPENDENT_APPROVER',
      'AUDITOR',
      'GOVERNING_SCHOLAR',
    ]);
  });

  it('validates role scopes and assignments strictly', () => {
    expect(roleScopeSchema.safeParse({ kind: 'MARJA', marjaIds: ['m'] }).success).toBe(true);
    expect(roleScopeSchema.safeParse({ kind: 'MARJA', marjaIds: [] }).success).toBe(false);
    expect(roleScopeSchema.safeParse({ kind: 'ALL', marjaIds: ['m'] }).success).toBe(false);
    expect(roleAssignmentSchema.safeParse(assignment).success).toBe(true);
    expect(roleAssignmentSchema.safeParse({ ...assignment, role: 'ROOT' }).success).toBe(false);
    expect(roleAssignmentSchema.safeParse({ ...assignment, revokedBy: 'x' }).success).toBe(false);
    expect(roleAssignmentSchema.safeParse({ ...assignment, extra: 1 }).success).toBe(false);
  });

  it('accepts server principal input and rejects client-style claims', () => {
    expect(trustedPrincipalInputSchema.safeParse(principalInput).success).toBe(true);
    for (const bad of [
      { ...principalInput, permissions: ['governance.approve'] },
      { ...principalInput, kind: 'VERIFIED_PRINCIPAL' },
      { ...principalInput, establishedAt: undefined },
      { ...principalInput, identity: { ...principalInput.identity, issuer: 'http://idp.test/' } },
      { ...principalInput, authentication: { ...principalInput.authentication, methods: [] } },
    ]) {
      expect(trustedPrincipalInputSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('validates resources and contexts', () => {
    expect(authorizationResourceSchema.safeParse({ type: 'AUDIT_LOG' }).success).toBe(true);
    expect(
      authorizationResourceSchema.safeParse({
        type: 'ROLE_ASSIGNMENT',
        targetPrincipalId: 'x',
        role: 'AUDITOR',
        scope: { kind: 'ALL', marjaIds: [] },
        stage: 'CONFIRM',
        proposedBy: null,
      }).success,
    ).toBe(false);
    const ctx = {
      decisionId: 'd',
      evaluatedAt: '2026-11-20T10:00:00.000Z',
      session: { sessionId: 's-1', state: 'ACTIVE' },
      governance: null,
    };
    expect(authorizationContextSchema.safeParse(ctx).success).toBe(true);
    expect(
      authorizationContextSchema.safeParse({ ...ctx, evaluatedAt: '2026-13-01T00:00:00.000Z' })
        .success,
    ).toBe(false);
  });
});
