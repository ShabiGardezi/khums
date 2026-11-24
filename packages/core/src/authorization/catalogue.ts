import type {
  AuthenticatorAssurance,
  AuthorizationResourceType,
  GovernancePermission,
  GovernanceRole,
} from '@khums/shared-types';

import { deepFreeze } from '../governance/ledger';

/**
 * The permission catalogue (M4.6.1). docs/AUTH_ARCHITECTURE.md §5.2 is the specification.
 *
 * This is the ONLY runtime definition of permissions. Both maps are keyed by the
 * `GovernancePermission` / `GovernanceRole` types, so the compiler rejects a missing or unknown
 * entry. Code checks permissions, never role names. Security policy only: nothing here is a
 * religious ruling.
 */

/**
 * Separation-of-duties pre-checks evaluated by policy against the pack version's ledger or the
 * target account. The governance domain (`@khums/core` governance) still enforces its own rules
 * authoritatively on every command.
 */
export type SeparationRule =
  /** No separation rule. */
  | 'NONE'
  /** The principal submitted no content in this pack version's ledger. */
  | 'NOT_AN_AUTHOR'
  /** The principal is the reviewer who started the current review (and not an author). */
  | 'CURRENT_REVIEWER'
  /** Not an author and not the current cycle's reviewer. */
  | 'INDEPENDENT_OF_AUTHORS_AND_REVIEWER'
  /** Not an author, not the reviewer and not the approver of the current cycle. */
  | 'INDEPENDENT_OF_APPROVAL_CHAIN'
  /** The target account is not the principal's own. */
  | 'NOT_SELF'
  /** Not self; dual-control roles need a confirming administrator other than the proposer. */
  | 'DUAL_CONTROL';

export interface PermissionRequirement {
  /** The only resource type this permission applies to. */
  readonly resource: AuthorizationResourceType;
  /**
   * Minimum authenticator assurance reached at sign-in. Staff sign in once with a username and
   * password (AAL1); there is no mandatory MFA and no per-action step-up (owner decisions
   * 2026-11-21, ARCHITECTURE decisions 35–36). The field stays so optional MFA can raise it later.
   */
  readonly assurance: AuthenticatorAssurance;
  readonly separation: SeparationRule;
}

/**
 * Maximum age of an established principal (1 minute). The API establishes a principal per request
 * from its stores; anything older is refused (`PRINCIPAL_STALE`), which bounds how long a role
 * revocation, suspension or deactivation can be outlived by a cached principal.
 */
export const PRINCIPAL_MAX_AGE_MS = 60 * 1000;

const PACK = 'RULE_PACK_VERSION';
/** Every permission needs an authenticated staff sign-in (AAL1); nothing needs re-authentication. */
const SIGNED_IN = 'AAL1';
const req = (
  resource: AuthorizationResourceType,
  separation: SeparationRule = 'NONE',
): PermissionRequirement => ({ resource, assurance: SIGNED_IN, separation });

export const PERMISSION_REQUIREMENTS: Readonly<
  Record<GovernancePermission, PermissionRequirement>
> = deepFreeze({
  'pack.draft.create': req(PACK),
  'pack.draft.edit': req(PACK),
  'pack.seal': req(PACK),
  'governance.submit': req(PACK),
  // Scholar research (M5.3.2). Separation NONE: the authorized scholar may approve their own work,
  // and no governance policy is consulted, so no configuration can add a second person (owner D5).
  'research.read': req('MARJA_RESEARCH'),
  'research.audit.read': req('MARJA_RESEARCH'),
  'research.source.record': req('MARJA_RESEARCH'),
  'research.source.verify': req('MARJA_RESEARCH'),
  'research.translation.edit': req('MARJA_RESEARCH'),
  'research.translation.review': req('MARJA_RESEARCH'),
  'research.finding.edit': req('MARJA_RESEARCH'),
  'research.finding.verify': req('MARJA_RESEARCH'),
  'research.finding.approve': req('MARJA_RESEARCH'),
  'research.ruling.edit': req('MARJA_RESEARCH'),
  'research.ruling.approve': req('MARJA_RESEARCH'),
  'research.ruling.withdraw': req('MARJA_RESEARCH'),
  'governance.review.start': req(PACK, 'NOT_AN_AUTHOR'),
  'governance.review.requestChanges': req(PACK, 'CURRENT_REVIEWER'),
  'governance.review.complete': req(PACK, 'CURRENT_REVIEWER'),
  'governance.approve': req(PACK, 'INDEPENDENT_OF_AUTHORS_AND_REVIEWER'),
  'governance.publish': req(PACK, 'INDEPENDENT_OF_AUTHORS_AND_REVIEWER'),
  'governance.supersede': req(PACK, 'INDEPENDENT_OF_AUTHORS_AND_REVIEWER'),
  'governance.withdraw': req(PACK),
  // M5.2.1: administrative emergency withdrawal of a PUBLISHED version (reason required).
  'governance.withdraw.emergency': req(PACK),
  'governance.activate': req(PACK, 'INDEPENDENT_OF_APPROVAL_CHAIN'),
  'governance.ledger.read': req(PACK),
  'audit.log.read': req('AUDIT_LOG'),
  // Listing staff accounts (resource: the staff directory, `targetPrincipalId: 'staff-directory'`).
  'identity.user.read': req('ACCOUNT'),
  'identity.user.invite': req('ACCOUNT', 'NOT_SELF'),
  'identity.user.suspend': req('ACCOUNT', 'NOT_SELF'),
  'identity.role.assign': req('ROLE_ASSIGNMENT', 'DUAL_CONTROL'),
  'identity.session.revoke': req('SESSION'),
  // Per-Marja governance policy (process configuration; grants no religious authority).
  'governance.policy.change': req('GOVERNANCE_POLICY'),
  // M5.2.1: bind a legacy pack version to its Marja's current registry policy (process only).
  'governance.policy.bindLegacy': req(PACK),
  // Provisional scholar-review track (M4.5a). Scoped to the pack version's Marja. Nothing here
  // approves anything: provisional results are PROVISIONAL — FOR SCHOLAR REVIEW ONLY.
  'provisional.pack.register': req(PACK),
  'provisional.pack.enable': req(PACK),
  'provisional.pack.disable': req(PACK),
  'provisional.pack.emergencyDisable': req(PACK),
  'provisional.pack.read': req(PACK),
  'provisional.calculate': req(PACK),
  'feedback.submit': req(PACK),
  'feedback.read': req(PACK),
  'feedback.respond': req(PACK),
  // Scholar rule builder (Phase 2 steps 3–4): scoped to the Marja; approves nothing.
  'builder.rule.read': req('MARJA_RESEARCH'),
  'builder.rule.edit': req('MARJA_RESEARCH'),
  'builder.rule.test': req('MARJA_RESEARCH'),
  // Phase 2 step 5 (decision 67): record a source verification of one builder rule revision. Only
  // the Marja's own scholars and SUPER_ADMIN; never cross-Marja; never an unverified principal.
  'builder.rule.verify': req('MARJA_RESEARCH'),
});

/**
 * The scholar's permissions within the Marjas of its assignment (formerly `GOVERNING_SCHOLAR`).
 * Separation of duties still applies as the pack version's bound policy requires: under
 * `INDEPENDENT_REVIEW_V1` a scholar cannot review or approve their own work; under
 * `SINGLE_SCHOLAR_V1` they may carry a pack from draft to activation alone.
 */
const SCHOLAR_PERMISSIONS: readonly GovernancePermission[] = [
  // M5.3.2: the complete research and ruling lifecycle within the assigned Marjas (D4, D5).
  'research.read',
  'research.audit.read',
  'research.source.record',
  'research.source.verify',
  'research.translation.edit',
  'research.translation.review',
  'research.finding.edit',
  'research.finding.verify',
  'research.finding.approve',
  'research.ruling.edit',
  'research.ruling.approve',
  'research.ruling.withdraw',
  'pack.draft.create',
  'pack.draft.edit',
  'pack.seal',
  'governance.submit',
  'governance.review.start',
  'governance.review.requestChanges',
  'governance.review.complete',
  'governance.approve',
  'governance.publish',
  'governance.supersede',
  'governance.withdraw',
  'governance.activate',
  'governance.ledger.read',
  'provisional.pack.register',
  'provisional.pack.enable',
  'provisional.pack.disable',
  'provisional.pack.read',
  'provisional.calculate',
  'feedback.submit',
  'feedback.read',
  'feedback.respond',
  // Phase 2 steps 3–4: the scholar rule builder of the assigned Marjas.
  'builder.rule.read',
  'builder.rule.edit',
  'builder.rule.test',
  // Phase 2 step 5: source verification of the assigned Marjas' builder rules (decision 67).
  'builder.rule.verify',
];

/**
 * Role → permission matrix (§5.2; decision 64, owner decision 2026-11-23).
 *
 * - `SUPER_ADMIN`: complete platform access, every catalogued permission, scope ALL. Safety that
 *   stays: nobody administers their own account or roles (`NOT_SELF`, `DUAL_CONTROL`), the last
 *   SUPER_ADMIN cannot be removed, and governance separation rules still follow the pack
 *   version's bound policy (a policy relaxes them only for the scholar roles).
 * - `SCHOLAR`: the scholar permissions within its assigned Marjas, plus the read-only
 *   `ANY_MARJA_PERMISSIONS` for every other Marja.
 * - Legacy roles: `GOVERNING_SCHOLAR` is exactly `SCHOLAR`; the other five keep exactly their
 *   pre-Phase-2 permissions (no broadening) until converted or revoked. None can be granted.
 */
export const ROLE_PERMISSIONS: Readonly<Record<GovernanceRole, readonly GovernancePermission[]>> =
  deepFreeze({
    SUPER_ADMIN: Object.keys(PERMISSION_REQUIREMENTS) as GovernancePermission[],
    SCHOLAR: [...SCHOLAR_PERMISSIONS],
    RULE_PACK_AUTHOR: [
      'pack.draft.create',
      'pack.draft.edit',
      'pack.seal',
      'governance.submit',
      'governance.ledger.read',
      'provisional.pack.register',
      'provisional.pack.read',
      'provisional.calculate',
      'feedback.read',
      'feedback.respond',
    ],
    // M5.3.2 (owner D4): no authority over religious content; non-authoritative operations only.
    RELIGIOUS_RESEARCHER: [
      'governance.ledger.read',
      'provisional.pack.read',
      'provisional.calculate',
      'feedback.submit',
      'feedback.read',
    ],
    SCHOLAR_REVIEWER: [
      'governance.review.start',
      'governance.review.requestChanges',
      'governance.review.complete',
      'governance.ledger.read',
      'provisional.pack.disable',
      'provisional.pack.read',
      'provisional.calculate',
      'feedback.submit',
      'feedback.read',
    ],
    INDEPENDENT_APPROVER: [
      'governance.approve',
      'governance.publish',
      'governance.supersede',
      'governance.withdraw',
      'governance.ledger.read',
      'provisional.pack.read',
      'provisional.calculate',
      'feedback.submit',
      'feedback.read',
    ],
    AUDITOR: [
      // M5.3.2 (owner D6): research history and metadata only, never research content.
      'research.audit.read',
      'governance.ledger.read',
      'audit.log.read',
      'identity.user.read',
      'provisional.pack.read',
      'feedback.read',
    ],
    /** Legacy: acts exactly as `SCHOLAR` (owner decision 2026-11-23). */
    GOVERNING_SCHOLAR: [...SCHOLAR_PERMISSIONS],
  });

/**
 * Read-only permissions a role's MARJA-scoped assignment holds for EVERY Marja, not only the
 * Marjas in its scope (decision 64): a scholar may read research and provisional packs of other
 * Marjas and run test calculations on them, but never write, verify, approve, register, enable,
 * disable, submit or answer feedback there. Each entry must be held by the role
 * (`ROLE_PERMISSIONS`) and must be one of `CROSS_MARJA_READ_ONLY_PERMISSIONS` (tested).
 * A test calculation records who ran it, as every provisional calculation does; it changes no
 * rule, pack, research or feedback state.
 */
export const CROSS_MARJA_READ_ONLY_PERMISSIONS: readonly GovernancePermission[] = Object.freeze([
  'research.read',
  'provisional.pack.read',
  'provisional.calculate',
  // Phase 2 steps 3–4: view another Marja's builder rules and run test calculations on them.
  'builder.rule.read',
  'builder.rule.test',
]);

export const ANY_MARJA_PERMISSIONS: Readonly<
  Record<GovernanceRole, readonly GovernancePermission[]>
> = deepFreeze({
  SUPER_ADMIN: [],
  SCHOLAR: [...CROSS_MARJA_READ_ONLY_PERMISSIONS],
  RULE_PACK_AUTHOR: [],
  RELIGIOUS_RESEARCHER: [],
  SCHOLAR_REVIEWER: [],
  INDEPENDENT_APPROVER: [],
  AUDITOR: [],
  GOVERNING_SCHOLAR: [...CROSS_MARJA_READ_ONLY_PERMISSIONS],
});

/**
 * Roles whose grant needs a second administrator to confirm under `DUAL_ADMIN_V1` (§5.3). Under
 * the initial `SINGLE_ADMIN_V1` every grant is one step. `SUPER_ADMIN` is included so one
 * compromised administrator cannot create another; `SCHOLAR` (and legacy `GOVERNING_SCHOLAR`)
 * because it carries religious authority on its own.
 */
export const DUAL_CONTROL_ROLES: readonly GovernanceRole[] = Object.freeze([
  'SUPER_ADMIN',
  'SCHOLAR',
  'SCHOLAR_REVIEWER',
  'INDEPENDENT_APPROVER',
  'GOVERNING_SCHOLAR',
]);

/**
 * Roles granted with a Marja scope (catalogue Marjas). `SUPER_ADMIN` and `AUDITOR` take scope ALL.
 * Since decision 64 no role combination on one account is forbidden: `SUPER_ADMIN` already holds
 * every permission.
 */
export const MARJA_SCOPED_ROLES: readonly GovernanceRole[] = Object.freeze([
  'SCHOLAR',
  'RULE_PACK_AUTHOR',
  'RELIGIOUS_RESEARCHER',
  'SCHOLAR_REVIEWER',
  'INDEPENDENT_APPROVER',
  'GOVERNING_SCHOLAR',
]);

/** Every catalogued permission, in catalogue order. */
export const GOVERNANCE_PERMISSIONS: readonly GovernancePermission[] = Object.freeze(
  Object.keys(PERMISSION_REQUIREMENTS) as GovernancePermission[],
);

export const isGovernancePermission = (value: unknown): value is GovernancePermission =>
  typeof value === 'string' && Object.hasOwn(PERMISSION_REQUIREMENTS, value);

const ASSURANCE_RANK: Readonly<Record<AuthenticatorAssurance, number>> = {
  AAL1: 1,
  AAL2: 2,
  AAL3: 3,
};
export const assuranceSatisfies = (
  actual: AuthenticatorAssurance,
  required: AuthenticatorAssurance,
): boolean => ASSURANCE_RANK[actual] >= ASSURANCE_RANK[required];
