import type { GovernanceLedger } from '../governance/records';

/**
 * Identity and authorization TYPES for rule-pack governance (designed in M4.6.0; the evaluator
 * is implemented in `@khums/core` since M4.6.1; FR-2). docs/AUTH_ARCHITECTURE.md is the
 * specification. Nothing here authenticates anyone: these types describe what the API will
 * construct AFTER verifying an identity-provider token or session. They are never built from
 * values a browser supplies.
 */

/**
 * Staff roles that can be granted (Phase 2, owner decision 2026-11-23; ARCHITECTURE decision 64).
 * `SUPER_ADMIN`: complete platform access, scope ALL. `SCHOLAR`: one or more catalogue Marjas
 * (scope MARJA), plus read-only test calculations and reads for other Marjas. The public `USER`
 * is not a staff role and has no account.
 */
export type GrantableStaffRole = 'SUPER_ADMIN' | 'SCHOLAR';

/**
 * Legacy staff roles (before Phase 2). Role records are append-only and validated on every read,
 * so these names stay readable forever, but they can no longer be granted. `GOVERNING_SCHOLAR`
 * acts exactly as `SCHOLAR`; the other five keep exactly their earlier permissions until a
 * SUPER_ADMIN converts (revoke + grant) or revokes them.
 */
export type LegacyStaffRole =
  | 'RULE_PACK_AUTHOR'
  | 'RELIGIOUS_RESEARCHER'
  | 'SCHOLAR_REVIEWER'
  | 'INDEPENDENT_APPROVER'
  | 'AUDITOR'
  /** Acts exactly as `SCHOLAR` (owner decision 2026-11-23). */
  | 'GOVERNING_SCHOLAR';

/** Every staff role that may appear in stored role records (grantable and legacy). */
export type GovernanceRole = GrantableStaffRole | LegacyStaffRole;

/**
 * Permission catalogue. Code checks permissions, never role names. Role → permission mapping is
 * server-side policy (docs/AUTH_ARCHITECTURE.md §5.2).
 */
export type GovernancePermission =
  // Rule-pack authoring
  | 'pack.draft.create'
  | 'pack.draft.edit'
  | 'pack.seal'
  | 'governance.submit'
  // Scholar research (M5.3.2; docs/SCHOLAR_RESEARCH_ARCHITECTURE.md §7). Resource MARJA_RESEARCH.
  // Held by SCHOLAR / GOVERNING_SCHOLAR within their Marjas and by SUPER_ADMIN (decision 64);
  // AUDITOR holds `research.audit.read` only (D6).
  /** Read research content, interpretations and notes. */
  | 'research.read'
  /** Read research history and metadata only (no draft content, interpretations or notes). */
  | 'research.audit.read'
  | 'research.source.record'
  | 'research.source.verify'
  | 'research.translation.edit'
  | 'research.translation.review'
  | 'research.finding.edit'
  | 'research.finding.verify'
  | 'research.finding.approve'
  | 'research.ruling.edit'
  | 'research.ruling.approve'
  | 'research.ruling.withdraw'
  // Review
  | 'governance.review.start'
  | 'governance.review.requestChanges'
  | 'governance.review.complete'
  // Approval, publication, lifecycle
  | 'governance.approve'
  | 'governance.publish'
  | 'governance.withdraw'
  /**
   * Administrative emergency withdrawal of a PUBLISHED pack version, with a required reason
   * (M5.2.1). Never approves, publishes or activates anything.
   */
  | 'governance.withdraw.emergency'
  | 'governance.supersede'
  | 'governance.activate'
  // Read and audit
  | 'governance.ledger.read'
  | 'audit.log.read'
  // Identity administration
  | 'identity.user.read'
  | 'identity.user.invite'
  | 'identity.user.suspend'
  | 'identity.role.assign'
  | 'identity.session.revoke'
  // Governance configuration (process, not religious authority)
  | 'governance.policy.change'
  /**
   * Bind a legacy pack version (ledger with no recorded policy) to its Marja's CURRENT registry
   * policy (M5.2.1). The policy comes from the dual-controlled registry, never from the caller.
   */
  | 'governance.policy.bindLegacy'
  // Provisional scholar-review track (M4.5a). Provisional results are never religious guidance.
  /** Store a sealed scholar-review pack version (content only; it starts disabled). */
  | 'provisional.pack.register'
  /** Make a registered scholar-review pack available for provisional calculations. */
  | 'provisional.pack.enable'
  /** Withdraw a scholar-review pack from provisional calculations. */
  | 'provisional.pack.disable'
  /** Administrative emergency stop (never enables, never approves). */
  | 'provisional.pack.emergencyDisable'
  | 'provisional.pack.read'
  /** Run a provisional calculation (PROVISIONAL — FOR SCHOLAR REVIEW ONLY). */
  | 'provisional.calculate'
  | 'feedback.submit'
  | 'feedback.read'
  /** Acknowledge or resolve feedback (records a status; never changes rule content). */
  | 'feedback.respond'
  // Scholar rule builder (Phase 2 steps 3–4). Resource MARJA_RESEARCH. Saving a rule stores only
  // what the scholar entered; it approves nothing.
  /** Read the builder rules of a Marja and check unsaved content. */
  | 'builder.rule.read'
  /** Create a builder rule or save a new revision of one. */
  | 'builder.rule.edit'
  /** Compile a Marja's builder rules into a test pack and run a PROVISIONAL test calculation. */
  | 'builder.rule.test'
  /**
   * Record the source verification of one builder rule revision (Phase 2 step 5, decision 67):
   * the four attestations of the authorized scholar of that Marja (or a SUPER_ADMIN). Recording it
   * approves the rule automatically and publishes a new builder pack version (decision 63).
   */
  | 'builder.rule.verify';

/** Account lifecycle (stored server-side; the identity provider is not the source of roles). */
export type AccountStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

/** NIST SP 800-63B authenticator assurance level reached in the current session. */
export type AuthenticatorAssurance = 'AAL1' | 'AAL2' | 'AAL3';

/** Authentication methods as reported by the provider (`amr`), normalized. */
export type AuthenticationMethod = 'PASSKEY' | 'SECURITY_KEY' | 'TOTP' | 'PASSWORD' | 'FEDERATED';

/** Scope of a role assignment, e.g. a reviewer authorized only for one Marja's packs. */
export interface RoleScope {
  readonly kind: 'ALL' | 'MARJA';
  /** Marja ids when `kind` is `MARJA`. */
  readonly marjaIds: readonly string[];
}

/** One role grant. Append-only history: revocation adds `revokedAt`, never deletes. */
export interface RoleAssignment {
  readonly assignmentId: string;
  readonly principalId: string;
  readonly role: GovernanceRole;
  readonly scope: RoleScope;
  readonly grantedBy: string;
  readonly grantedAt: string;
  readonly revokedBy: string | null;
  readonly revokedAt: string | null;
}

/**
 * A verified principal, built by the API from a validated provider token and the server-side
 * account record. `principalId` is the platform's own stable, opaque id (never an email); the
 * provider's `issuer` + `subject` are the verified external identity.
 */
export interface VerifiedPrincipal {
  readonly kind: 'VERIFIED_PRINCIPAL';
  readonly principalId: string;
  /**
   * Server time at which the API assembled this principal from its stores. Principals are
   * per-request snapshots: the evaluator refuses one older than the maximum principal age, so
   * role revocation or suspension cannot be outlived by a cached principal.
   */
  readonly establishedAt: string;
  readonly identity: {
    /** OIDC issuer URL of the identity provider that verified the user. */
    readonly issuer: string;
    /** The provider's stable subject (`sub`) for this user. */
    readonly subject: string;
    readonly emailVerified: boolean;
  };
  readonly accountStatus: AccountStatus;
  /** Active role assignments (server-side source of truth). */
  readonly roles: readonly RoleAssignment[];
  /**
   * Effective permissions (all scopes) computed server-side from `roles`; never sent by a client.
   * Informational: the evaluator recomputes permissions per resource scope from `roles`.
   */
  readonly permissions: readonly GovernancePermission[];
  readonly authentication: {
    /** When the user last actively authenticated (`auth_time`). */
    readonly authenticatedAt: string;
    readonly methods: readonly AuthenticationMethod[];
    readonly assurance: AuthenticatorAssurance;
  };
  readonly session: {
    /** Opaque server-side session id. Never logged raw (only a keyed hash). */
    readonly sessionId: string;
    readonly issuedAt: string;
    readonly idleExpiresAt: string;
    readonly absoluteExpiresAt: string;
  };
}

/** The resource a governance action targets. */
export interface GovernanceResource {
  readonly type: 'RULE_PACK_VERSION';
  readonly packId: string;
  readonly version: string;
  readonly marjaId: string;
  /** Recomputed content digest when the action concerns content. */
  readonly contentDigest: string | null;
}

/** Research records (Layers 1–2) of one Marja. */
export interface MarjaResearchResource {
  readonly type: 'MARJA_RESEARCH';
  readonly marjaId: string;
}

/** A staff account targeted by an identity-administration action. */
export interface AccountResource {
  readonly type: 'ACCOUNT';
  readonly targetPrincipalId: string;
}

/** The sessions of one account (revocation). */
export interface SessionResource {
  readonly type: 'SESSION';
  readonly targetPrincipalId: string;
}

/**
 * A role grant. Grants of dual-control roles take two steps by two different administrators: a
 * `PROPOSE` (no `proposedBy`) and a `CONFIRM` naming the proposing administrator.
 */
export interface RoleAssignmentResource {
  readonly type: 'ROLE_ASSIGNMENT';
  readonly targetPrincipalId: string;
  readonly role: GovernanceRole;
  readonly scope: RoleScope;
  readonly stage: 'PROPOSE' | 'CONFIRM';
  readonly proposedBy: string | null;
}

/** The governance policy configuration of one Marja. */
export interface GovernancePolicyResource {
  readonly type: 'GOVERNANCE_POLICY';
  readonly marjaId: string;
}

/** The governance audit log. */
export interface AuditLogResource {
  readonly type: 'AUDIT_LOG';
}

export type AuthorizationResource =
  | GovernanceResource
  | MarjaResearchResource
  | AccountResource
  | SessionResource
  | RoleAssignmentResource
  | AuditLogResource
  | GovernancePolicyResource;

export type AuthorizationResourceType = AuthorizationResource['type'];

/**
 * Server-side facts for one authorization decision. Every value comes from the API (its clock,
 * its id generator, its session store, its ledger store), never from the client.
 */
export interface AuthorizationContext {
  /** Unique id for this decision (correlates the audit entry). */
  readonly decisionId: string;
  /** Server time of the decision, ISO 8601 UTC with milliseconds. */
  readonly evaluatedAt: string;
  /** The server-side session record looked up for this request. */
  readonly session: {
    readonly sessionId: string;
    readonly state: 'ACTIVE' | 'REVOKED';
  };
  /** The pack version's ledger, required by permissions with separation-of-duties rules. */
  readonly governance: { readonly ledger: GovernanceLedger } | null;
}

export type AuthorizationDenyReason =
  | 'NOT_AUTHENTICATED'
  | 'ACCOUNT_NOT_ACTIVE'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'MISSING_PERMISSION'
  | 'OUT_OF_SCOPE'
  | 'MFA_REQUIRED'
  | 'SEPARATION_OF_DUTIES'
  | 'SELF_ADMINISTRATION'
  /** The principal snapshot is older than the maximum principal age; re-establish it. */
  | 'PRINCIPAL_STALE'
  /** A principal-shaped value that the server did not establish (e.g. from client input). */
  | 'UNVERIFIED_PRINCIPAL'
  /** Missing, malformed or inconsistent permission, resource or context (fail closed). */
  | 'INVALID_REQUEST';

/** Result of the server-side policy decision point. */
export type AuthorizationDecision =
  | {
      readonly allowed: true;
      readonly decisionId: string;
      readonly permission: GovernancePermission;
      readonly evaluatedAt: string;
    }
  | {
      readonly allowed: false;
      /** Null only when the context itself was unusable (`INVALID_REQUEST`). */
      readonly decisionId: string | null;
      /** Null when the requested permission is not in the catalogue (`INVALID_REQUEST`). */
      readonly permission: GovernancePermission | null;
      readonly reason: AuthorizationDenyReason;
      readonly evaluatedAt: string | null;
    };

/**
 * Audit entry for every governance attempt (allowed or denied). Contains no tokens, emails,
 * session ids or pack content; only stable ids, the decision and correlation data.
 */
export interface GovernanceAuditEntry {
  readonly auditId: string;
  /** `x-request-id` correlation id. */
  readonly requestId: string;
  readonly principalId: string | null;
  readonly permission: GovernancePermission | null;
  readonly decision: 'ALLOWED' | 'DENIED';
  readonly denyReason: AuthorizationDenyReason | null;
  readonly resource: AuthorizationResource | null;
  /** The ledger record created when allowed and the domain accepted it. */
  readonly ledgerRecordId: string | null;
  /** Domain refusal code when authorization passed but the domain rules refused. */
  readonly domainIssue: string | null;
  readonly assurance: AuthenticatorAssurance | null;
  readonly at: string;
}
