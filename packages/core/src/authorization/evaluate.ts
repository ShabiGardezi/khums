import type {
  AuthorizationContext,
  AuthorizationDecision,
  AuthorizationDenyReason,
  AuthorizationResource,
  GovernancePermission,
  RoleAssignment,
  VerifiedPrincipal,
} from '@khums/shared-types';
import { authorizationContextSchema, authorizationResourceSchema } from '@khums/validation';

import { replayDetached } from '../governance/ledger';
import {
  GOVERNANCE_POLICIES,
  LEGACY_GOVERNANCE_POLICY,
  STRICT_GOVERNANCE_POLICY,
} from '../governance/policy';
import {
  ANY_MARJA_PERMISSIONS,
  assuranceSatisfies,
  DUAL_CONTROL_ROLES,
  isGovernancePermission,
  PERMISSION_REQUIREMENTS,
  PRINCIPAL_MAX_AGE_MS,
  ROLE_PERMISSIONS,
  type SeparationRule,
} from './catalogue';
import { isTrustedPrincipal } from './principal';

/**
 * Centralized authorization evaluator (M4.6.1; docs/AUTH_ARCHITECTURE.md §5.1).
 *
 * Pure and deterministic: the same request always yields the same decision. Every input is
 * `unknown` and validated here; anything missing, malformed or unexpected is denied
 * (`INVALID_REQUEST`), and an unexpected exception is also a denial. The order of checks is fixed:
 *
 *  1. well-formed context and catalogued permission;
 *  2. a principal established by the server (not a look-alike);
 *  3. a well-formed resource of the permission's type;
 *  4. principal snapshot fresh; account ACTIVE; session matching, not revoked, not expired;
 *  5. permission granted by an unrevoked role assignment;
 *  6. that assignment's scope covers the resource;
 *  7. assurance level reached at sign-in (MFA); there is no per-action step-up;
 *  8. separation of duties and self-administration.
 *
 * Allowing a governance action here does not make it valid: the governance domain still applies
 * its lifecycle, separation and content-integrity rules authoritatively.
 */

export interface AuthorizationRequest {
  /** Must be a principal returned by `establishPrincipal`. */
  readonly principal: unknown;
  readonly permission: unknown;
  readonly resource: unknown;
  /** Server-side facts (`AuthorizationContext`). */
  readonly context: unknown;
}

const decided = (decision: AuthorizationDecision): AuthorizationDecision => Object.freeze(decision);

function deny(
  reason: AuthorizationDenyReason,
  permission: GovernancePermission | null,
  context: AuthorizationContext | null,
): AuthorizationDecision {
  return decided({
    allowed: false,
    decisionId: context?.decisionId ?? null,
    permission,
    reason,
    evaluatedAt: context?.evaluatedAt ?? null,
  });
}

/** Does the assignment's scope cover the resource? Non-Marja resources need scope ALL. */
function covers(assignment: RoleAssignment, resource: AuthorizationResource): boolean {
  if (assignment.scope.kind === 'ALL') return true;
  switch (resource.type) {
    case 'RULE_PACK_VERSION':
    case 'MARJA_RESEARCH':
    case 'GOVERNANCE_POLICY':
      return assignment.scope.marjaIds.includes(resource.marjaId);
    case 'ACCOUNT':
    case 'SESSION':
    case 'ROLE_ASSIGNMENT':
    case 'AUDIT_LOG':
      return false;
  }
}

/**
 * Scope check for one permission (decision 64): the assignment's scope covers the resource, or the
 * permission is one of the role's read-only `ANY_MARJA_PERMISSIONS` and the resource is a Marja
 * pack version or Marja research (any Marja). Never widens anything else.
 */
function coversFor(
  assignment: RoleAssignment,
  permission: GovernancePermission,
  resource: AuthorizationResource,
): boolean {
  if (covers(assignment, resource)) return true;
  return (
    (resource.type === 'RULE_PACK_VERSION' || resource.type === 'MARJA_RESEARCH') &&
    ANY_MARJA_PERMISSIONS[assignment.role].includes(permission)
  );
}

type SeparationOutcome = AuthorizationDenyReason | null;

/**
 * Separation rules that read the pack version's ledger (replayed and verified here). They follow
 * the governance policy BOUND TO THAT PACK VERSION in its ledger (never a client value):
 * `INDEPENDENT_REVIEW_V1` (and pre-policy ledgers) keep every rule. `SINGLE_SCHOLAR_V1` relaxes
 * them ONLY for a principal holding an unrevoked `SCHOLAR` (or legacy `GOVERNING_SCHOLAR`)
 * assignment that covers this pack's Marja; anyone else (including mixed author/reviewer/approver role holders) keeps the
 * strict rules. Roles and scope are checked before this point as well.
 */
function ledgerSeparation(
  rule: SeparationRule,
  principal: VerifiedPrincipal,
  resource: AuthorizationResource,
  context: AuthorizationContext,
): SeparationOutcome {
  const principalId = principal.principalId;
  if (resource.type !== 'RULE_PACK_VERSION' || context.governance === null)
    return 'INVALID_REQUEST';
  const replayed = replayDetached(context.governance.ledger);
  if (!replayed.ok) return 'INVALID_REQUEST';
  const { view, ledger } = replayed.value;
  if (ledger.packId !== resource.packId || ledger.version !== resource.version) {
    return 'INVALID_REQUEST';
  }
  const bound = GOVERNANCE_POLICIES[view.policy ?? LEGACY_GOVERNANCE_POLICY];
  // Relaxation needs a relaxed role whose OWN scope covers the pack's Marja (cross-Marja read-only
  // access never relaxes anything).
  const relaxed = principal.roles.some(
    (r) => r.revokedAt === null && bound.relaxedForRoles.includes(r.role) && covers(r, resource),
  );
  const rules = relaxed ? bound : GOVERNANCE_POLICIES[STRICT_GOVERNANCE_POLICY];
  // Under historical authorship every submitter in the ledger's history counts as an author (a
  // resubmission may be made by someone else; neither may review or approve).
  const authors = new Set(
    rules.historicalAuthorship
      ? ledger.records.filter((r) => r.type === 'SUBMITTED').map((r) => r.actor.subject)
      : view.submitter === null
        ? []
        : [view.submitter.subject],
  );
  const reviewer = view.reviewStart?.actor.subject ?? null;
  const completedBy = view.reviewCompleted?.actor.subject ?? null;
  const approver = view.approval?.actor.subject ?? null;
  const isAuthor = authors.has(principalId);
  const isReviewer = principalId === reviewer || principalId === completedBy;
  switch (rule) {
    case 'NOT_AN_AUTHOR':
      return rules.reviewerMustDifferFromAuthor && isAuthor ? 'SEPARATION_OF_DUTIES' : null;
    case 'CURRENT_REVIEWER':
      // Only the reviewer who started the review continues it, under every policy.
      return reviewer !== null &&
        principalId === reviewer &&
        !(rules.reviewerMustDifferFromAuthor && isAuthor)
        ? null
        : 'SEPARATION_OF_DUTIES';
    case 'INDEPENDENT_OF_AUTHORS_AND_REVIEWER':
      return rules.approverMustBeIndependent && (isAuthor || isReviewer)
        ? 'SEPARATION_OF_DUTIES'
        : null;
    case 'INDEPENDENT_OF_APPROVAL_CHAIN':
      return rules.independentActivation && (isAuthor || isReviewer || principalId === approver)
        ? 'SEPARATION_OF_DUTIES'
        : null;
    case 'NONE':
    case 'NOT_SELF':
    case 'DUAL_CONTROL':
      return 'INVALID_REQUEST';
  }
}

function separation(
  rule: SeparationRule,
  principal: VerifiedPrincipal,
  resource: AuthorizationResource,
  context: AuthorizationContext,
): SeparationOutcome {
  const me = principal.principalId;
  switch (rule) {
    case 'NONE':
      return null;
    case 'NOT_SELF':
      if (resource.type !== 'ACCOUNT') return 'INVALID_REQUEST';
      return resource.targetPrincipalId === me ? 'SELF_ADMINISTRATION' : null;
    case 'DUAL_CONTROL': {
      if (resource.type !== 'ROLE_ASSIGNMENT') return 'INVALID_REQUEST';
      if (resource.targetPrincipalId === me) return 'SELF_ADMINISTRATION';
      if (!DUAL_CONTROL_ROLES.includes(resource.role) || resource.stage === 'PROPOSE') return null;
      // CONFIRM: a second administrator, other than the proposer, and the proposer was not the
      // person receiving the role.
      return resource.proposedBy === me || resource.proposedBy === resource.targetPrincipalId
        ? 'SEPARATION_OF_DUTIES'
        : null;
    }
    case 'NOT_AN_AUTHOR':
    case 'CURRENT_REVIEWER':
    case 'INDEPENDENT_OF_AUTHORS_AND_REVIEWER':
    case 'INDEPENDENT_OF_APPROVAL_CHAIN':
      return ledgerSeparation(rule, principal, resource, context);
  }
}

function evaluate(request: AuthorizationRequest): AuthorizationDecision {
  const parsedContext = authorizationContextSchema.safeParse(request.context);
  const permission = isGovernancePermission(request.permission) ? request.permission : null;
  if (!parsedContext.success) return deny('INVALID_REQUEST', permission, null);
  const context = parsedContext.data;
  if (permission === null) return deny('INVALID_REQUEST', null, context);

  const { principal } = request;
  if (principal === null || principal === undefined) {
    return deny('NOT_AUTHENTICATED', permission, context);
  }
  if (!isTrustedPrincipal(principal)) return deny('UNVERIFIED_PRINCIPAL', permission, context);

  const requirement = PERMISSION_REQUIREMENTS[permission];
  const parsedResource = authorizationResourceSchema.safeParse(request.resource);
  if (!parsedResource.success || parsedResource.data.type !== requirement.resource) {
    return deny('INVALID_REQUEST', permission, context);
  }
  const resource = parsedResource.data;
  const now = context.evaluatedAt;

  // Per-request snapshot: not from the future, not older than the maximum principal age.
  if (now < principal.establishedAt) return deny('INVALID_REQUEST', permission, context);
  if (Date.parse(now) - Date.parse(principal.establishedAt) > PRINCIPAL_MAX_AGE_MS) {
    return deny('PRINCIPAL_STALE', permission, context);
  }
  if (principal.accountStatus !== 'ACTIVE') return deny('ACCOUNT_NOT_ACTIVE', permission, context);
  const { session } = principal;
  if (context.session.sessionId !== session.sessionId) {
    return deny('INVALID_REQUEST', permission, context);
  }
  if (context.session.state !== 'ACTIVE') return deny('SESSION_REVOKED', permission, context);
  if (now < session.issuedAt) return deny('INVALID_REQUEST', permission, context);
  if (now >= session.idleExpiresAt || now >= session.absoluteExpiresAt) {
    return deny('SESSION_EXPIRED', permission, context);
  }

  // `establishPrincipal` already drops revoked assignments; re-checked here as defence in depth.
  const granting = principal.roles.filter(
    (r) => r.revokedAt === null && ROLE_PERMISSIONS[r.role].includes(permission),
  );
  if (granting.length === 0) return deny('MISSING_PERMISSION', permission, context);
  if (!granting.some((r) => coversFor(r, permission, resource))) {
    return deny('OUT_OF_SCOPE', permission, context);
  }

  if (!assuranceSatisfies(principal.authentication.assurance, requirement.assurance)) {
    return deny('MFA_REQUIRED', permission, context);
  }
  const authenticatedAt = principal.authentication.authenticatedAt;
  if (now < authenticatedAt) return deny('INVALID_REQUEST', permission, context);

  const separated = separation(requirement.separation, principal, resource, context);
  if (separated !== null) return deny(separated, permission, context);

  return decided({
    allowed: true,
    decisionId: context.decisionId,
    permission,
    evaluatedAt: now,
  });
}

/** Evaluates one authorization request. Never throws; fails closed. */
export function authorize(request: AuthorizationRequest): AuthorizationDecision {
  try {
    return evaluate(request);
  } catch {
    // Nothing from the request is trusted after an exception (it may be a throwing proxy).
    return deny('INVALID_REQUEST', null, null);
  }
}
