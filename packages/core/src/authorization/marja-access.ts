import type { GovernancePermission, GovernanceRole, RoleScope } from '@khums/shared-types';

import { ANY_MARJA_PERMISSIONS, GOVERNANCE_PERMISSIONS, ROLE_PERMISSIONS } from './catalogue';

/**
 * Informational helpers for clients that show what a signed-in staff member may do for ONE Marja
 * (decision 64). They mirror the evaluator's scope rule for Marja resources; the API still
 * authorizes every request with `authorize`, so these never grant anything.
 */

export interface HeldRole {
  readonly role: GovernanceRole;
  readonly scope: RoleScope;
}

const scopeCovers = (scope: RoleScope, marjaId: string): boolean =>
  scope.kind === 'ALL' || scope.marjaIds.includes(marjaId);

/** True when one of the roles' OWN scopes covers the Marja (not only cross-Marja read access). */
export function ownsMarjaScope(roles: readonly HeldRole[], marjaId: string): boolean {
  return roles.some((r) => scopeCovers(r.scope, marjaId));
}

/**
 * The permissions the roles hold for a Marja's pack versions and research, in catalogue order: a
 * role's full permissions where its scope covers the Marja, otherwise only its read-only
 * `ANY_MARJA_PERMISSIONS`.
 */
export function permissionsForMarja(
  roles: readonly HeldRole[],
  marjaId: string,
): readonly GovernancePermission[] {
  const held = new Set<GovernancePermission>(
    roles.flatMap((r) =>
      scopeCovers(r.scope, marjaId) ? ROLE_PERMISSIONS[r.role] : ANY_MARJA_PERMISSIONS[r.role],
    ),
  );
  return GOVERNANCE_PERMISSIONS.filter((p) => held.has(p));
}

/**
 * True when the roles reach this Marja ONLY through cross-Marja read-only access: test
 * calculations and reads are allowed, every write is not. Clients label such views read-only.
 */
export function isCrossMarjaReadOnly(roles: readonly HeldRole[], marjaId: string): boolean {
  return !ownsMarjaScope(roles, marjaId) && permissionsForMarja(roles, marjaId).length > 0;
}
