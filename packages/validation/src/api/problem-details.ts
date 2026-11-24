import { z } from 'zod';

/**
 * Standard error body for every non-2xx API response — RFC 9457 "Problem Details for HTTP
 * APIs" (`application/problem+json`), extended with a stable machine-readable `code`.
 * Clients branch on `code`, never on `title`/`detail` text.
 */
export const problemFieldErrorSchema = z.object({
  /** JSON-pointer-like path to the offending field, e.g. `items.0.amount`. */
  path: z.string(),
  message: z.string(),
  code: z.string(),
});

export const problemDetailsSchema = z
  .object({
    type: z
      .string()
      .meta({ description: 'URI identifying the problem type', example: 'about:blank' }),
    title: z.string().meta({ example: 'Bad Request' }),
    status: z.int().min(400).max(599),
    code: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .meta({ description: 'Stable machine-readable error code', example: 'VALIDATION_FAILED' }),
    detail: z.string().optional(),
    instance: z.string().optional().meta({ description: 'Request path' }),
    requestId: z.string().optional(),
    errors: z.array(problemFieldErrorSchema).optional(),
  })
  .meta({ id: 'ProblemDetails', title: 'ProblemDetails' });

export type ProblemFieldError = z.infer<typeof problemFieldErrorSchema>;
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

/** Error codes shared by API and clients. Feature modules extend this list. */
export const API_ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MALFORMED_REQUEST: 'MALFORMED_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  // Staff authentication (M4.6.2b: username/password, server-side sessions). 401 = who you are is
  // not established; 403 = established but not allowed; 429 = slowed down (never permanent);
  // 503 = it could not be checked (always a denial, never a bypass).
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  LOGIN_THROTTLED: 'LOGIN_THROTTLED',
  TEMPORARY_PASSWORD_EXPIRED: 'TEMPORARY_PASSWORD_EXPIRED',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  PASSWORD_POLICY_VIOLATION: 'PASSWORD_POLICY_VIOLATION',
  PASSWORD_REUSED: 'PASSWORD_REUSED',
  REAUTHENTICATION_REQUIRED: 'REAUTHENTICATION_REQUIRED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  CSRF_REJECTED: 'CSRF_REJECTED',
  AUTHENTICATION_UNAVAILABLE: 'AUTHENTICATION_UNAVAILABLE',
  ACCOUNT_NOT_ACTIVE: 'ACCOUNT_NOT_ACTIVE',
  // Authorization denials by the centralized evaluator (M4.6.1 deny reasons).
  MFA_REQUIRED: 'MFA_REQUIRED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  // Staff administration (M4.6.2b). Rules from @khums/core; refusals change nothing.
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  USERNAME_INVALID: 'USERNAME_INVALID',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  SELF_ADMINISTRATION: 'SELF_ADMINISTRATION',
  /** No longer produced since decision 64 (SUPER_ADMIN may hold every permission); kept stable. */
  ROLE_INCOMPATIBLE: 'ROLE_INCOMPATIBLE',
  /** Legacy roles can no longer be granted (decision 64). */
  ROLE_NOT_GRANTABLE: 'ROLE_NOT_GRANTABLE',
  SCOPE_INVALID: 'SCOPE_INVALID',
  ROLE_ALREADY_HELD: 'ROLE_ALREADY_HELD',
  ROLE_NOT_HELD: 'ROLE_NOT_HELD',
  TARGET_NOT_ACTIVE: 'TARGET_NOT_ACTIVE',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  LAST_SUPER_ADMIN: 'LAST_SUPER_ADMIN',
  STATUS_UNCHANGED: 'STATUS_UNCHANGED',
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
  ADMINISTRATION_CONFLICT: 'ADMINISTRATION_CONFLICT',
  // Governance API (M4.6.4a). Domain refusals come from @khums/core and change nothing.
  /** No ledger or stored content for this pack version (or it is outside the caller's scope). */
  PACK_VERSION_NOT_FOUND: 'PACK_VERSION_NOT_FOUND',
  /** The ledger changed since the caller read it (`expectedSequence`); reload and retry. */
  GOVERNANCE_CONFLICT: 'GOVERNANCE_CONFLICT',
  /** Authorized, but the governance rules refused the transition (issue codes in `detail`). */
  GOVERNANCE_REFUSED: 'GOVERNANCE_REFUSED',
  /** The content names a different Marja than the one bound to this pack id. */
  PACK_MARJA_MISMATCH: 'PACK_MARJA_MISMATCH',
  /** Mock packs are never governed (development fixtures only). */
  MOCK_PACK_REFUSED: 'MOCK_PACK_REFUSED',
  // Provisional scholar-review track (M4.5a). Refusals change nothing.
  /** The server's operational state does not allow this action (e.g. provisional in production). */
  OPERATIONAL_STATE_FORBIDS: 'OPERATIONAL_STATE_FORBIDS',
  /** Authorized, but the provisional rules refused the action (issue code in `detail`). */
  PROVISIONAL_REFUSED: 'PROVISIONAL_REFUSED',
  /** The provisional state or feedback changed since the caller read it; reload and retry. */
  PROVISIONAL_CONFLICT: 'PROVISIONAL_CONFLICT',
  FEEDBACK_NOT_FOUND: 'FEEDBACK_NOT_FOUND',
  // Private deployment (M4.7). The request did not come through the web tier's signed edge.
  EDGE_SIGNATURE_REQUIRED: 'EDGE_SIGNATURE_REQUIRED',
  // Scholar research (M5.3.3). Refusals change nothing.
  /** No research record with this id is available to you (unknown or outside your Marjas). */
  RESEARCH_NOT_FOUND: 'RESEARCH_NOT_FOUND',
  /** The record changed since the caller read it (`expectedRevision`); reload and retry. */
  RESEARCH_CONFLICT: 'RESEARCH_CONFLICT',
  /** Authorized, but the research rules refused the command (issue codes in `detail`). */
  RESEARCH_REFUSED: 'RESEARCH_REFUSED',
  EVIDENCE_NOT_FOUND: 'EVIDENCE_NOT_FOUND',
  /** The evidence file was refused (digest, size, media type, copyright or duplicate). */
  EVIDENCE_REFUSED: 'EVIDENCE_REFUSED',
  /** No durable evidence storage is configured on this deployment (bytes are never accepted). */
  EVIDENCE_STORAGE_UNAVAILABLE: 'EVIDENCE_STORAGE_UNAVAILABLE',
  // Scholar rule builder (Phase 2 steps 3–4). Refusals change nothing.
  /** No builder rule with this id is available to you. */
  RULE_NOT_FOUND: 'RULE_NOT_FOUND',
  /** The rule gained a revision since the caller read it (`expectedRevision`); reload and retry. */
  RULE_CONFLICT: 'RULE_CONFLICT',
  /** The content or its research references were refused (issue codes in `detail`). */
  RULE_REFUSED: 'RULE_REFUSED',
  // Source verification (Phase 2 step 5). Refusals change nothing.
  /** A verification precondition failed (blocker codes in `detail`); nothing was recorded. */
  RULE_VERIFICATION_REFUSED: 'RULE_VERIFICATION_REFUSED',
  /**
   * The rule's current revision is already source-verified against the same ruling content; a
   * repeat would only publish another identical version (audit SEC-03). Nothing was recorded.
   */
  ALREADY_VERIFIED: 'ALREADY_VERIFIED',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
