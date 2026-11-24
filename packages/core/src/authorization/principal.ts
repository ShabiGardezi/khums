import type {
  AuthenticationMethod,
  AuthenticatorAssurance,
  GovernancePermission,
  VerifiedPrincipal,
} from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import { trustedPrincipalInputSchema } from '@khums/validation';

import { deepFreeze } from '../governance/ledger';
import { GOVERNANCE_PERMISSIONS, ROLE_PERMISSIONS } from './catalogue';

/**
 * Trusted principals (M4.6.1). Since M4.6.2b the API establishes them from its own server-side
 * staff sessions (username/password); see docs/AUTH_ARCHITECTURE.md §4.10 and §5.6.
 *
 * The evaluator accepts ONLY principal objects created by `establishPrincipal` in this module
 * instance. A value with the same shape (JSON from a browser, a spread copy, a deserialized
 * session, a structurally forged object) is not in the registry and is refused as
 * `UNVERIFIED_PRINCIPAL`. Established principals are deeply frozen, so their roles cannot change
 * afterwards.
 *
 * `establishPrincipal` is exported only through `@khums/core/trusted-principal`, which the
 * boundary check allows only in `apps/api`. The API calls it AFTER verifying the identity-provider
 * token or server session and loading the account and role assignments from its own store.
 */

const TRUSTED = new WeakSet<object>();

export type PrincipalIssueCode =
  /** The input does not match the strict principal input schema. */
  | 'PRINCIPAL_MALFORMED'
  /** A role assignment belongs to another principal. */
  | 'ROLE_ASSIGNMENT_MISMATCH'
  /** The reported assurance level is not supported by the reported authentication methods. */
  | 'ASSURANCE_INCONSISTENT'
  /** Session times are not ordered (issued ≤ idle expiry ≤ absolute expiry). */
  | 'SESSION_INCONSISTENT'
  /** The principal is dated before its session or authentication. */
  | 'ESTABLISHED_TOO_EARLY';
// Decision 64 removed `ROLE_COMBINATION_FORBIDDEN`: SUPER_ADMIN now holds every permission, so no
// role combination on one account is forbidden.

const PHISHING_RESISTANT: ReadonlySet<AuthenticationMethod> = new Set(['PASSKEY', 'SECURITY_KEY']);
const MULTI_FACTOR: ReadonlySet<AuthenticationMethod> = new Set([
  'PASSKEY',
  'SECURITY_KEY',
  'TOTP',
]);

/** AAL3 needs a phishing-resistant authenticator; AAL2 needs at least one strong factor. */
function assuranceSupported(
  assurance: AuthenticatorAssurance,
  methods: readonly AuthenticationMethod[],
): boolean {
  switch (assurance) {
    case 'AAL3':
      return methods.some((m) => PHISHING_RESISTANT.has(m));
    case 'AAL2':
      return methods.some((m) => MULTI_FACTOR.has(m));
    case 'AAL1':
      return true;
  }
}

/**
 * Builds a trusted, frozen `VerifiedPrincipal` from server-side facts. Revoked role assignments
 * are dropped; effective permissions are derived from the remaining roles (never supplied).
 */
export function establishPrincipal(input: unknown): Result<VerifiedPrincipal, PrincipalIssueCode> {
  const parsed = trustedPrincipalInputSchema.safeParse(input);
  if (!parsed.success) return err('PRINCIPAL_MALFORMED');
  const value = parsed.data;
  if (value.roles.some((r) => r.principalId !== value.principalId)) {
    return err('ROLE_ASSIGNMENT_MISMATCH');
  }
  if (!assuranceSupported(value.authentication.assurance, value.authentication.methods)) {
    return err('ASSURANCE_INCONSISTENT');
  }
  const { issuedAt, idleExpiresAt, absoluteExpiresAt } = value.session;
  if (!(issuedAt <= idleExpiresAt && idleExpiresAt <= absoluteExpiresAt)) {
    return err('SESSION_INCONSISTENT');
  }
  if (
    value.establishedAt < issuedAt ||
    value.establishedAt < value.authentication.authenticatedAt
  ) {
    return err('ESTABLISHED_TOO_EARLY');
  }
  const roles = value.roles.filter((r) => r.revokedAt === null);
  const granted = new Set<GovernancePermission>(roles.flatMap((r) => ROLE_PERMISSIONS[r.role]));
  const principal: VerifiedPrincipal = deepFreeze({
    kind: 'VERIFIED_PRINCIPAL',
    principalId: value.principalId,
    establishedAt: value.establishedAt,
    identity: value.identity,
    accountStatus: value.accountStatus,
    roles,
    permissions: GOVERNANCE_PERMISSIONS.filter((p) => granted.has(p)),
    authentication: value.authentication,
    session: value.session,
  });
  TRUSTED.add(principal);
  return ok(principal);
}

/** True only for principals created by `establishPrincipal` (identity, not shape). */
export const isTrustedPrincipal = (value: unknown): value is VerifiedPrincipal =>
  typeof value === 'object' && value !== null && TRUSTED.has(value);
