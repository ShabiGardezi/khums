import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { authorize } from '@khums/core';
import type {
  AuthorizationDecision,
  AuthorizationDenyReason,
  AuthorizationResource,
  GovernanceLedger,
  GovernancePermission,
} from '@khums/shared-types';
import { API_ERROR_CODES } from '@khums/validation';

import { ApiProblemException } from '../common/errors/api-problem.exception';
import { CLOCK, type Clock } from './auth.tokens';
import { staffAuthenticationOf } from './staff-request';

/**
 * Builds the server-side authorization context for a guarded request and asks the centralized
 * evaluator (`@khums/core` `authorize`, M4.6.1). The API never decides permissions itself: no
 * role names or assurance rules are re-implemented here.
 */
@Injectable()
export class StaffAuthorizationService {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  /**
   * The server-side facts for one decision on this request: the principal the guard established
   * (or null), a fresh decision id, the server time and the session record. Never client values.
   */
  contextFor(request: object) {
    const authentication = staffAuthenticationOf(request);
    return {
      principal: authentication?.principal ?? null,
      decisionId: randomUUID(),
      evaluatedAt: new Date(this.clock.now()).toISOString(),
      session: {
        sessionId: authentication?.principal.session.sessionId ?? 'none',
        state: authentication?.sessionState ?? ('REVOKED' as const),
      },
    };
  }

  decide(
    request: object,
    permission: GovernancePermission,
    resource: AuthorizationResource,
    ledger: GovernanceLedger | null = null,
  ): AuthorizationDecision {
    const { principal, ...context } = this.contextFor(request);
    return authorize({
      principal,
      permission,
      resource,
      context: { ...context, governance: ledger === null ? null : { ledger } },
    });
  }

  /** Like `decide`, but throws the matching problem when denied. */
  require(
    request: object,
    permission: GovernancePermission,
    resource: AuthorizationResource,
    ledger: GovernanceLedger | null = null,
  ): AuthorizationDecision {
    const decision = this.decide(request, permission, resource, ledger);
    if (!decision.allowed) throw problemForDenial(decision.reason);
    return decision;
  }
}

/**
 * `WWW-Authenticate` challenge for 401s on staff routes: staff authenticate with a server-side
 * session cookie obtained from `POST /api/v1/staff/auth/login` (not an RFC 6750 bearer token).
 */
export const STAFF_CHALLENGE = 'Session realm="khums-staff"';

/** Maps evaluator deny reasons to problems. Authentication-type denials are 401, others 403. */
export function problemForDenial(reason: AuthorizationDenyReason): ApiProblemException {
  switch (reason) {
    case 'NOT_AUTHENTICATED':
    case 'UNVERIFIED_PRINCIPAL':
    case 'PRINCIPAL_STALE':
    case 'SESSION_EXPIRED':
      return new ApiProblemException(
        401,
        API_ERROR_CODES.REAUTHENTICATION_REQUIRED,
        'Sign in again.',
        STAFF_CHALLENGE,
      );
    case 'SESSION_REVOKED':
      return new ApiProblemException(
        401,
        API_ERROR_CODES.SESSION_REVOKED,
        'The session has been revoked. Sign in again.',
        STAFF_CHALLENGE,
      );
    case 'MFA_REQUIRED':
      return new ApiProblemException(
        401,
        API_ERROR_CODES.MFA_REQUIRED,
        'A stronger sign-in method is required for this action.',
        STAFF_CHALLENGE,
      );
    case 'ACCOUNT_NOT_ACTIVE':
      return new ApiProblemException(
        403,
        API_ERROR_CODES.ACCOUNT_NOT_ACTIVE,
        'This staff account is not active.',
      );
    case 'MISSING_PERMISSION':
    case 'OUT_OF_SCOPE':
    case 'SEPARATION_OF_DUTIES':
    case 'SELF_ADMINISTRATION':
    case 'INVALID_REQUEST':
      return new ApiProblemException(403, API_ERROR_CODES.ACCESS_DENIED, 'Access denied.');
  }
}
