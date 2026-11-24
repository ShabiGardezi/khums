import type { AccountStatus, GovernanceRole, RoleAssignment, RoleScope } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';

import { isLegacyStaffRole } from '@khums/validation';

import { DUAL_CONTROL_ROLES, MARJA_SCOPED_ROLES } from '../authorization/catalogue';
import { findMarjaCatalogueEntry } from '../marja/catalogue';

/**
 * Staff administration rules (M4.6.2b; docs/AUTH_ARCHITECTURE.md §4.10, decisions 36 and 64).
 * Pure decisions the API applies AFTER `authorize` has allowed the permission. Only `SUPER_ADMIN`
 * and `SCHOLAR` can be granted; legacy roles can only be revoked or replaced. Nobody administers
 * themselves, and the last SUPER_ADMIN cannot be removed.
 */

/**
 * Versioned administrative-control setting:
 * - `SINGLE_ADMIN_V1` (initial): one SUPER_ADMIN may create accounts and grant roles and Marja
 *   scopes in one step, with a mandatory reason and an audit event.
 * - `DUAL_ADMIN_V1` (future): grants of dual-control roles need a second SUPER_ADMIN. It can be
 *   selected only while at least two SUPER_ADMIN accounts are active, so it cannot deadlock.
 */
export type AdministrativeControlSetting = 'SINGLE_ADMIN_V1' | 'DUAL_ADMIN_V1';

export const INITIAL_ADMINISTRATIVE_CONTROL: AdministrativeControlSetting = 'SINGLE_ADMIN_V1';

/** `DUAL_ADMIN_V1` needs two active SUPER_ADMIN accounts (no deadlock). */
export const canSelectDualAdmin = (activeSuperAdmins: number): boolean => activeSuperAdmins >= 2;

export type StaffAdministrationIssue =
  /** Nobody administers their own account, roles or sessions. */
  | 'SELF_ADMINISTRATION'
  /** Legacy roles can no longer be granted (decision 64). */
  | 'ROLE_NOT_GRANTABLE'
  /** Marja-scoped roles need a Marja scope of catalogue Marjas; SUPER_ADMIN and AUDITOR need ALL. */
  | 'SCOPE_INVALID'
  | 'ROLE_ALREADY_HELD'
  | 'ROLE_NOT_HELD'
  | 'TARGET_NOT_ACTIVE'
  /** `DUAL_ADMIN_V1`: a second administrator must confirm (two-step flow not yet available). */
  | 'CONFIRMATION_REQUIRED'
  /** The change would leave no active SUPER_ADMIN. */
  | 'LAST_SUPER_ADMIN'
  | 'STATUS_UNCHANGED'
  /** Deactivation is final. */
  | 'ACCOUNT_DEACTIVATED';

export interface TargetAccount {
  readonly principalId: string;
  readonly status: AccountStatus;
  /** Active (unrevoked) assignments. */
  readonly roles: readonly RoleAssignment[];
}

const sameScope = (a: RoleScope, b: RoleScope) =>
  a.kind === b.kind &&
  a.marjaIds.length === b.marjaIds.length &&
  [...a.marjaIds].sort().every((id, i) => id === [...b.marjaIds].sort()[i]);

/** The scope rules for a role. */
export function scopeValidFor(role: GovernanceRole, scope: RoleScope): boolean {
  if (MARJA_SCOPED_ROLES.includes(role)) {
    return (
      scope.kind === 'MARJA' &&
      scope.marjaIds.length > 0 &&
      new Set(scope.marjaIds).size === scope.marjaIds.length &&
      scope.marjaIds.every((id) => findMarjaCatalogueEntry(id) !== undefined)
    );
  }
  return scope.kind === 'ALL' && scope.marjaIds.length === 0;
}

export function checkRoleGrant(input: {
  readonly actorPrincipalId: string;
  readonly target: TargetAccount;
  readonly role: GovernanceRole;
  readonly scope: RoleScope;
  readonly setting: AdministrativeControlSetting;
}): Result<void, StaffAdministrationIssue> {
  const { target, role, scope } = input;
  if (target.principalId === input.actorPrincipalId) return err('SELF_ADMINISTRATION');
  if (isLegacyStaffRole(role)) return err('ROLE_NOT_GRANTABLE');
  if (target.status !== 'ACTIVE') return err('TARGET_NOT_ACTIVE');
  if (!scopeValidFor(role, scope)) return err('SCOPE_INVALID');
  if (target.roles.some((r) => r.role === role && sameScope(r.scope, scope))) {
    return err('ROLE_ALREADY_HELD');
  }
  if (input.setting === 'DUAL_ADMIN_V1' && DUAL_CONTROL_ROLES.includes(role)) {
    return err('CONFIRMATION_REQUIRED');
  }
  return ok(undefined);
}

const holdsSuperAdmin = (account: TargetAccount) =>
  account.roles.some((r) => r.role === 'SUPER_ADMIN');

export function checkRoleRevocation(input: {
  readonly actorPrincipalId: string;
  readonly target: TargetAccount;
  readonly assignmentId: string;
  readonly activeSuperAdmins: number;
}): Result<RoleAssignment, StaffAdministrationIssue> {
  const { target } = input;
  if (target.principalId === input.actorPrincipalId) return err('SELF_ADMINISTRATION');
  const assignment = target.roles.find((r) => r.assignmentId === input.assignmentId);
  if (assignment === undefined) return err('ROLE_NOT_HELD');
  if (assignment.role === 'SUPER_ADMIN' && input.activeSuperAdmins <= 1) {
    return err('LAST_SUPER_ADMIN');
  }
  return ok(assignment);
}

/**
 * Replacing one held assignment with a grantable role and scope in one unit of work (decision 64):
 * changing a scholar's Marjas, or converting a legacy role. The revocation rules apply to the old
 * assignment (including `LAST_SUPER_ADMIN`) and the grant rules to the new one, judged against the
 * account WITHOUT the old assignment. Replacing an assignment with the identical role and scope is
 * refused (`ROLE_ALREADY_HELD`).
 */
export function checkRoleReplacement(input: {
  readonly actorPrincipalId: string;
  readonly target: TargetAccount;
  readonly assignmentId: string;
  readonly role: GovernanceRole;
  readonly scope: RoleScope;
  readonly activeSuperAdmins: number;
  readonly setting: AdministrativeControlSetting;
}): Result<RoleAssignment, StaffAdministrationIssue> {
  const revocation = checkRoleRevocation({
    actorPrincipalId: input.actorPrincipalId,
    target: input.target,
    assignmentId: input.assignmentId,
    activeSuperAdmins: input.activeSuperAdmins,
  });
  if (!revocation.ok) return revocation;
  const old = revocation.value;
  if (old.role === input.role && sameScope(old.scope, input.scope)) return err('ROLE_ALREADY_HELD');
  const grant = checkRoleGrant({
    actorPrincipalId: input.actorPrincipalId,
    target: {
      ...input.target,
      roles: input.target.roles.filter((r) => r.assignmentId !== input.assignmentId),
    },
    role: input.role,
    scope: input.scope,
    setting: input.setting,
  });
  return grant.ok ? ok(old) : grant;
}

export function checkAccountStatusChange(input: {
  readonly actorPrincipalId: string;
  readonly target: TargetAccount;
  readonly to: AccountStatus;
  readonly activeSuperAdmins: number;
}): Result<void, StaffAdministrationIssue> {
  const { target, to } = input;
  if (target.principalId === input.actorPrincipalId) return err('SELF_ADMINISTRATION');
  if (target.status === 'DEACTIVATED') return err('ACCOUNT_DEACTIVATED');
  if (target.status === to) return err('STATUS_UNCHANGED');
  if (to !== 'ACTIVE' && holdsSuperAdmin(target) && input.activeSuperAdmins <= 1) {
    return err('LAST_SUPER_ADMIN');
  }
  return ok(undefined);
}

/** Password resets and session revocation: never one's own account through administration. */
export function checkAccountAdministration(input: {
  readonly actorPrincipalId: string;
  readonly target: TargetAccount;
}): Result<void, StaffAdministrationIssue> {
  if (input.target.principalId === input.actorPrincipalId) return err('SELF_ADMINISTRATION');
  if (input.target.status === 'DEACTIVATED') return err('ACCOUNT_DEACTIVATED');
  return ok(undefined);
}
