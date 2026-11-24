export type { PermissionRequirement, SeparationRule } from './catalogue';
export {
  ANY_MARJA_PERMISSIONS,
  assuranceSatisfies,
  CROSS_MARJA_READ_ONLY_PERMISSIONS,
  DUAL_CONTROL_ROLES,
  GOVERNANCE_PERMISSIONS,
  isGovernancePermission,
  MARJA_SCOPED_ROLES,
  PERMISSION_REQUIREMENTS,
  PRINCIPAL_MAX_AGE_MS,
  ROLE_PERMISSIONS,
} from './catalogue';
export type { HeldRole } from './marja-access';
export { isCrossMarjaReadOnly, ownsMarjaScope, permissionsForMarja } from './marja-access';
export type { AuthorizationRequest } from './evaluate';
export { authorize } from './evaluate';
export type { PrincipalIssueCode } from './principal';
export { isTrustedPrincipal } from './principal';
