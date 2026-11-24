import { describe, expect, it } from 'vitest';

import type { GovernanceRole, RoleAssignment, RoleScope } from '@khums/shared-types';
import { err, ok } from '@khums/utils';

import {
  canSelectDualAdmin,
  checkAccountAdministration,
  checkAccountStatusChange,
  checkRoleGrant,
  checkRoleReplacement,
  checkRoleRevocation,
  INITIAL_ADMINISTRATIVE_CONTROL,
  scopeValidFor,
  type TargetAccount,
} from './administration';
import { checkPasswordPolicy, normalizeUsername } from './credentials';

/** Staff credential and administration rules (M4.6.2b). */

const ALL: RoleScope = { kind: 'ALL', marjaIds: [] };
const SISTANI: RoleScope = { kind: 'MARJA', marjaIds: ['sistani'] };
const SISTANI_KHAMENEI: RoleScope = { kind: 'MARJA', marjaIds: ['sistani', 'khamenei'] };

const assignment = (
  role: GovernanceRole,
  scope: RoleScope = ALL,
  id = `a-${role}`,
): RoleAssignment => ({
  assignmentId: id,
  principalId: 'target',
  role,
  scope,
  grantedBy: 'admin',
  grantedAt: '2026-11-21T10:00:00.000Z',
  revokedBy: null,
  revokedAt: null,
});
const target = (
  roles: RoleAssignment[] = [],
  status: TargetAccount['status'] = 'ACTIVE',
): TargetAccount => ({
  principalId: 'target',
  status,
  roles,
});

describe('usernames', () => {
  it('normalizes case, width and surrounding space to one account name', () => {
    expect(normalizeUsername('  Scholar.One ')).toEqual(ok('scholar.one'));
    expect(normalizeUsername('ＳＣＨＯＬＡＲ1')).toEqual(ok('scholar1'));
  });

  it('refuses short, symbolic, overlong and non-string names', () => {
    for (const bad of ['ab', '-scholar', 'a b c', 'scholar@x', 'x'.repeat(65), 42, null]) {
      expect(normalizeUsername(bad)).toEqual(err('USERNAME_INVALID'));
    }
  });
});

describe('password policy (new passwords only)', () => {
  it('accepts a long passphrase', () => {
    expect(checkPasswordPolicy('correct horse battery staple', 'scholar1')).toEqual(ok(undefined));
  });

  it('enforces length 12–128 by characters, and refuses the username and common choices', () => {
    expect(checkPasswordPolicy('short-pass1', 'scholar1')).toEqual(err('PASSWORD_TOO_SHORT'));
    expect(checkPasswordPolicy('x'.repeat(129), 'scholar1')).toEqual(err('PASSWORD_TOO_LONG'));
    // 12 characters of Urdu text count as 12, not as their byte length.
    expect(checkPasswordPolicy('خمس'.repeat(4), 'scholar1')).toEqual(ok(undefined));
    expect(checkPasswordPolicy('my-Scholar1-password', 'scholar1')).toEqual(
      err('PASSWORD_CONTAINS_USERNAME'),
    );
    expect(checkPasswordPolicy('Password1234', 'scholar1')).toEqual(err('PASSWORD_TOO_COMMON'));
    expect(checkPasswordPolicy('Bismillah 123', 'scholar1')).toEqual(err('PASSWORD_TOO_COMMON'));
  });
});

describe('role grants', () => {
  const grant = (
    roles: RoleAssignment[],
    role: GovernanceRole,
    scope: RoleScope,
    extra: Partial<Parameters<typeof checkRoleGrant>[0]> = {},
  ) =>
    checkRoleGrant({
      actorPrincipalId: 'admin',
      target: target(roles),
      role,
      scope,
      setting: 'SINGLE_ADMIN_V1',
      ...extra,
    });

  it('lets one SUPER_ADMIN create the first scholar under SINGLE_ADMIN_V1', () => {
    expect(INITIAL_ADMINISTRATIVE_CONTROL).toBe('SINGLE_ADMIN_V1');
    expect(grant([], 'SCHOLAR', SISTANI)).toEqual(ok(undefined));
    expect(grant([], 'SCHOLAR', SISTANI_KHAMENEI)).toEqual(ok(undefined));
    expect(grant([], 'SUPER_ADMIN', ALL)).toEqual(ok(undefined));
  });

  it('grants only SUPER_ADMIN and SCHOLAR: every legacy role is refused (decision 64)', () => {
    for (const role of [
      'GOVERNING_SCHOLAR',
      'RULE_PACK_AUTHOR',
      'RELIGIOUS_RESEARCHER',
      'SCHOLAR_REVIEWER',
      'INDEPENDENT_APPROVER',
    ] as const) {
      expect(grant([], role, SISTANI), role).toEqual(err('ROLE_NOT_GRANTABLE'));
    }
    expect(grant([], 'AUDITOR', ALL)).toEqual(err('ROLE_NOT_GRANTABLE'));
  });

  it('never lets anyone grant themselves a role', () => {
    expect(
      checkRoleGrant({
        actorPrincipalId: 'target',
        target: target([assignment('SUPER_ADMIN')]),
        role: 'SCHOLAR',
        scope: SISTANI,
        setting: 'SINGLE_ADMIN_V1',
      }),
    ).toEqual(err('SELF_ADMINISTRATION'));
  });

  it('allows SUPER_ADMIN and scholar roles on one account (decision 64 removed the rule)', () => {
    // Policy change: formerly ROLE_INCOMPATIBLE in both directions (decision 37).
    expect(grant([assignment('SUPER_ADMIN')], 'SCHOLAR', SISTANI)).toEqual(ok(undefined));
    expect(grant([assignment('GOVERNING_SCHOLAR', SISTANI)], 'SUPER_ADMIN', ALL)).toEqual(
      ok(undefined),
    );
    expect(grant([assignment('SCHOLAR', SISTANI)], 'SUPER_ADMIN', ALL)).toEqual(ok(undefined));
  });

  it('requires catalogue Marja scopes for scholar roles and ALL for administrative ones', () => {
    for (const role of ['SCHOLAR', 'GOVERNING_SCHOLAR'] as const) {
      expect(scopeValidFor(role, ALL)).toBe(false);
      expect(scopeValidFor(role, { kind: 'MARJA', marjaIds: [] })).toBe(false);
      expect(scopeValidFor(role, { kind: 'MARJA', marjaIds: ['no-such-marja'] })).toBe(false);
      expect(scopeValidFor(role, SISTANI_KHAMENEI)).toBe(true);
    }
    expect(
      scopeValidFor('SCHOLAR_REVIEWER', { kind: 'MARJA', marjaIds: ['sistani', 'sistani'] }),
    ).toBe(false);
    expect(scopeValidFor('SUPER_ADMIN', SISTANI)).toBe(false);
    expect(scopeValidFor('AUDITOR', ALL)).toBe(true);
    expect(grant([], 'SCHOLAR', ALL)).toEqual(err('SCOPE_INVALID'));
    expect(grant([], 'SCHOLAR', { kind: 'MARJA', marjaIds: ['no-such-marja'] })).toEqual(
      err('SCOPE_INVALID'),
    );
    expect(grant([], 'SUPER_ADMIN', SISTANI)).toEqual(err('SCOPE_INVALID'));
  });

  it('refuses duplicates, inactive targets, and dual-control roles under DUAL_ADMIN_V1', () => {
    expect(grant([assignment('SCHOLAR', SISTANI)], 'SCHOLAR', SISTANI)).toEqual(
      err('ROLE_ALREADY_HELD'),
    );
    expect(
      checkRoleGrant({
        actorPrincipalId: 'admin',
        target: target([], 'SUSPENDED'),
        role: 'SCHOLAR',
        scope: SISTANI,
        setting: 'SINGLE_ADMIN_V1',
      }),
    ).toEqual(err('TARGET_NOT_ACTIVE'));
    for (const role of ['SCHOLAR', 'SUPER_ADMIN'] as const) {
      expect(
        grant([], role, role === 'SCHOLAR' ? SISTANI : ALL, { setting: 'DUAL_ADMIN_V1' }),
      ).toEqual(err('CONFIRMATION_REQUIRED'));
    }
  });

  it('allows DUAL_ADMIN_V1 only with two active SUPER_ADMINs (no deadlock)', () => {
    expect(canSelectDualAdmin(1)).toBe(false);
    expect(canSelectDualAdmin(2)).toBe(true);
  });
});

describe('revocation, status changes and account administration', () => {
  it('never removes the last active SUPER_ADMIN, and never administers oneself', () => {
    const admin = target([assignment('SUPER_ADMIN')]);
    expect(
      checkRoleRevocation({
        actorPrincipalId: 'other',
        target: admin,
        assignmentId: 'a-SUPER_ADMIN',
        activeSuperAdmins: 1,
      }),
    ).toEqual(err('LAST_SUPER_ADMIN'));
    expect(
      checkRoleRevocation({
        actorPrincipalId: 'other',
        target: admin,
        assignmentId: 'a-SUPER_ADMIN',
        activeSuperAdmins: 2,
      }).ok,
    ).toBe(true);
    expect(
      checkRoleRevocation({
        actorPrincipalId: 'other',
        target: admin,
        assignmentId: 'missing',
        activeSuperAdmins: 2,
      }),
    ).toEqual(err('ROLE_NOT_HELD'));
    expect(
      checkAccountStatusChange({
        actorPrincipalId: 'other',
        target: admin,
        to: 'SUSPENDED',
        activeSuperAdmins: 1,
      }),
    ).toEqual(err('LAST_SUPER_ADMIN'));
    expect(
      checkAccountStatusChange({
        actorPrincipalId: 'target',
        target: admin,
        to: 'SUSPENDED',
        activeSuperAdmins: 3,
      }),
    ).toEqual(err('SELF_ADMINISTRATION'));
    expect(checkAccountAdministration({ actorPrincipalId: 'target', target: admin })).toEqual(
      err('SELF_ADMINISTRATION'),
    );
  });

  it('treats deactivation as final and refuses no-op changes', () => {
    const scholar = target([assignment('GOVERNING_SCHOLAR', SISTANI)]);
    expect(
      checkAccountStatusChange({
        actorPrincipalId: 'admin',
        target: scholar,
        to: 'SUSPENDED',
        activeSuperAdmins: 1,
      }),
    ).toEqual(ok(undefined));
    expect(
      checkAccountStatusChange({
        actorPrincipalId: 'admin',
        target: scholar,
        to: 'ACTIVE',
        activeSuperAdmins: 1,
      }),
    ).toEqual(err('STATUS_UNCHANGED'));
    const gone = target([], 'DEACTIVATED');
    expect(
      checkAccountStatusChange({
        actorPrincipalId: 'admin',
        target: gone,
        to: 'ACTIVE',
        activeSuperAdmins: 1,
      }),
    ).toEqual(err('ACCOUNT_DEACTIVATED'));
    expect(checkAccountAdministration({ actorPrincipalId: 'admin', target: gone })).toEqual(
      err('ACCOUNT_DEACTIVATED'),
    );
  });
});

describe('role replacement: change a scholar’s Marjas or convert a legacy role (decision 64)', () => {
  const replace = (
    roles: RoleAssignment[],
    assignmentId: string,
    role: GovernanceRole,
    scope: RoleScope,
    extra: Partial<Parameters<typeof checkRoleReplacement>[0]> = {},
  ) =>
    checkRoleReplacement({
      actorPrincipalId: 'admin',
      target: target(roles),
      assignmentId,
      role,
      scope,
      activeSuperAdmins: 2,
      setting: 'SINGLE_ADMIN_V1',
      ...extra,
    });

  it('changes a scholar’s Marjas: old assignment returned for revocation', () => {
    const held = assignment('SCHOLAR', SISTANI);
    expect(replace([held], held.assignmentId, 'SCHOLAR', SISTANI_KHAMENEI)).toEqual(ok(held));
  });

  it('converts every legacy role to SCHOLAR or SUPER_ADMIN', () => {
    for (const role of [
      'GOVERNING_SCHOLAR',
      'RULE_PACK_AUTHOR',
      'RELIGIOUS_RESEARCHER',
      'SCHOLAR_REVIEWER',
      'INDEPENDENT_APPROVER',
    ] as const) {
      const held = assignment(role, SISTANI);
      expect(replace([held], held.assignmentId, 'SCHOLAR', SISTANI).ok, role).toBe(true);
    }
    const auditor = assignment('AUDITOR');
    expect(replace([auditor], auditor.assignmentId, 'SUPER_ADMIN', ALL).ok).toBe(true);
  });

  it('refuses legacy targets, invalid scopes, identical replacements and missing assignments', () => {
    const held = assignment('SCHOLAR', SISTANI);
    expect(replace([held], held.assignmentId, 'GOVERNING_SCHOLAR', SISTANI)).toEqual(
      err('ROLE_NOT_GRANTABLE'),
    );
    expect(replace([held], held.assignmentId, 'SCHOLAR', ALL)).toEqual(err('SCOPE_INVALID'));
    expect(replace([held], held.assignmentId, 'SCHOLAR', SISTANI)).toEqual(
      err('ROLE_ALREADY_HELD'),
    );
    expect(replace([held], 'missing', 'SCHOLAR', SISTANI_KHAMENEI)).toEqual(err('ROLE_NOT_HELD'));
    // The same scope already held by ANOTHER assignment of the account is a duplicate.
    const other = assignment('SCHOLAR', SISTANI_KHAMENEI, 'a-other');
    expect(replace([held, other], held.assignmentId, 'SCHOLAR', SISTANI_KHAMENEI)).toEqual(
      err('ROLE_ALREADY_HELD'),
    );
  });

  it('never administers oneself, never removes the last SUPER_ADMIN, honours DUAL_ADMIN_V1', () => {
    const held = assignment('SCHOLAR', SISTANI);
    expect(
      replace([held], held.assignmentId, 'SCHOLAR', SISTANI_KHAMENEI, {
        actorPrincipalId: 'target',
      }),
    ).toEqual(err('SELF_ADMINISTRATION'));
    const admin = assignment('SUPER_ADMIN');
    expect(
      replace([admin], admin.assignmentId, 'SCHOLAR', SISTANI, { activeSuperAdmins: 1 }),
    ).toEqual(err('LAST_SUPER_ADMIN'));
    expect(
      replace([held], held.assignmentId, 'SCHOLAR', SISTANI_KHAMENEI, {
        setting: 'DUAL_ADMIN_V1',
      }),
    ).toEqual(err('CONFIRMATION_REQUIRED'));
    expect(
      replace([held], held.assignmentId, 'SCHOLAR', SISTANI_KHAMENEI, {
        target: target([held], 'SUSPENDED'),
      }),
    ).toEqual(err('TARGET_NOT_ACTIVE'));
  });
});
