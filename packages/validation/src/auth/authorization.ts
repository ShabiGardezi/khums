import { z } from 'zod';

import type {
  AccountStatus,
  AuthenticationMethod,
  AuthenticatorAssurance,
  AuthorizationContext,
  AuthorizationResource,
  GovernanceRole,
  GrantableStaffRole,
  LegacyStaffRole,
  RoleAssignment,
  VerifiedPrincipal,
} from '@khums/shared-types';

import { identifierSchema } from '../calculation/common';
import { governanceLedgerSchema } from '../governance/records';

/**
 * Strict schemas for the authorization domain (M4.6.1; docs/AUTH_ARCHITECTURE.md). Shape only:
 * `@khums/core` decides. Permission names are NOT enumerated here; the single runtime catalogue
 * lives in `@khums/core` (keyed by the `GovernancePermission` type) and checks membership.
 */

/** Exhaustive enum helper: compile error when a type member is missing from the tuple. */
type Exhaustive<T extends string, L extends readonly T[]> = [T] extends [L[number]] ? L : never;
const exhaustive =
  <T extends string>() =>
  <const L extends readonly T[]>(list: Exhaustive<T, L>): L =>
    list;

/**
 * Staff roles that can be granted (decision 64): `SUPER_ADMIN` (scope ALL) and `SCHOLAR` (scope
 * MARJA). Grant requests accept only these.
 */
export const GRANTABLE_STAFF_ROLES = exhaustive<GrantableStaffRole>()(['SUPER_ADMIN', 'SCHOLAR']);

/**
 * Legacy roles: readable from stored role records forever (append-only records are validated on
 * every read), never grantable. Shown as legacy in the admin console, to be converted or revoked.
 */
export const LEGACY_STAFF_ROLES = exhaustive<LegacyStaffRole>()([
  'RULE_PACK_AUTHOR',
  'RELIGIOUS_RESEARCHER',
  'SCHOLAR_REVIEWER',
  'INDEPENDENT_APPROVER',
  'AUDITOR',
  'GOVERNING_SCHOLAR',
]);

/** Every role a stored record, session or account response may carry (grantable + legacy). */
export const GOVERNANCE_ROLES = exhaustive<GovernanceRole>()([
  ...GRANTABLE_STAFF_ROLES,
  ...LEGACY_STAFF_ROLES,
]);

/** True for a role that can no longer be granted. */
export const isLegacyStaffRole = (role: GovernanceRole): role is LegacyStaffRole =>
  (LEGACY_STAFF_ROLES as readonly GovernanceRole[]).includes(role);
const ACCOUNT_STATUSES = exhaustive<AccountStatus>()([
  'INVITED',
  'ACTIVE',
  'SUSPENDED',
  'DEACTIVATED',
]);
const ASSURANCE_LEVELS = exhaustive<AuthenticatorAssurance>()(['AAL1', 'AAL2', 'AAL3']);
const AUTHENTICATION_METHODS = exhaustive<AuthenticationMethod>()([
  'PASSKEY',
  'SECURITY_KEY',
  'TOTP',
  'PASSWORD',
  'FEDERATED',
]);

const timestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'ISO 8601 UTC with milliseconds')
  .refine((at) => !Number.isNaN(Date.parse(at)) && new Date(at).toISOString() === at);
const semver = z.string().regex(/^\d+\.\d+\.\d+$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const opaqueId = z.string().min(1).max(200);

export const roleScopeSchema = z
  .strictObject({
    kind: z.enum(['ALL', 'MARJA']),
    marjaIds: z.array(identifierSchema).max(200),
  })
  .refine(
    (s) => (s.kind === 'ALL' ? s.marjaIds.length === 0 : s.marjaIds.length > 0),
    'ALL takes no Marja ids; MARJA needs at least one',
  );

export const roleAssignmentSchema: z.ZodType<RoleAssignment> = z
  .strictObject({
    assignmentId: opaqueId,
    principalId: identifierSchema,
    role: z.enum(GOVERNANCE_ROLES),
    scope: roleScopeSchema,
    grantedBy: identifierSchema,
    grantedAt: timestamp,
    revokedBy: identifierSchema.nullable(),
    revokedAt: timestamp.nullable(),
  })
  .refine((r) => (r.revokedAt === null) === (r.revokedBy === null), 'Revocation needs both fields');

/**
 * What the API supplies to establish a principal, after verifying the provider token and loading
 * the server-side account. `kind` and `permissions` are derived by core, never supplied.
 */
export const trustedPrincipalInputSchema = z.strictObject({
  principalId: identifierSchema,
  establishedAt: timestamp,
  identity: z.strictObject({
    issuer: z.url({ protocol: /^https$/ }).max(500),
    subject: z.string().min(1).max(255),
    emailVerified: z.boolean(),
  }),
  accountStatus: z.enum(ACCOUNT_STATUSES),
  roles: z.array(roleAssignmentSchema).max(50),
  authentication: z.strictObject({
    authenticatedAt: timestamp,
    methods: z.array(z.enum(AUTHENTICATION_METHODS)).min(1).max(10),
    assurance: z.enum(ASSURANCE_LEVELS),
  }),
  session: z.strictObject({
    sessionId: opaqueId,
    issuedAt: timestamp,
    idleExpiresAt: timestamp,
    absoluteExpiresAt: timestamp,
  }),
});

export type TrustedPrincipalInput = Omit<VerifiedPrincipal, 'kind' | 'permissions'>;

export const authorizationResourceSchema: z.ZodType<AuthorizationResource> = z.discriminatedUnion(
  'type',
  [
    z.strictObject({
      type: z.literal('RULE_PACK_VERSION'),
      packId: identifierSchema,
      version: semver,
      marjaId: identifierSchema,
      contentDigest: digest.nullable(),
    }),
    z.strictObject({ type: z.literal('MARJA_RESEARCH'), marjaId: identifierSchema }),
    z.strictObject({ type: z.literal('ACCOUNT'), targetPrincipalId: identifierSchema }),
    z.strictObject({ type: z.literal('SESSION'), targetPrincipalId: identifierSchema }),
    z
      .strictObject({
        type: z.literal('ROLE_ASSIGNMENT'),
        targetPrincipalId: identifierSchema,
        role: z.enum(GOVERNANCE_ROLES),
        scope: roleScopeSchema,
        stage: z.enum(['PROPOSE', 'CONFIRM']),
        proposedBy: identifierSchema.nullable(),
      })
      .refine(
        (r) => (r.stage === 'PROPOSE') === (r.proposedBy === null),
        'PROPOSE has no proposer; CONFIRM names the proposing administrator',
      ),
    z.strictObject({ type: z.literal('AUDIT_LOG') }),
    z.strictObject({ type: z.literal('GOVERNANCE_POLICY'), marjaId: identifierSchema }),
  ],
);

export const authorizationContextSchema: z.ZodType<AuthorizationContext> = z.strictObject({
  decisionId: opaqueId,
  evaluatedAt: timestamp,
  session: z.strictObject({ sessionId: opaqueId, state: z.enum(['ACTIVE', 'REVOKED']) }),
  governance: z.strictObject({ ledger: governanceLedgerSchema }).nullable(),
});
