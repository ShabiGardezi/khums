import type { ApiError } from '@khums/api-client';

import type { ConsoleContent } from '@/content/console/types';

/**
 * A localized message for a failed console call, by stable problem code (M4.6.5). The code is
 * returned too, so staff can quote it; server `detail` text is never shown.
 */
export function problemMessage(
  error: ApiError,
  errors: ConsoleContent['common']['errors'],
): { readonly message: string; readonly code: string | null } {
  if (error.kind === 'network') return { message: errors.network, code: null };
  if (error.kind === 'invalid_response') return { message: errors.invalidResponse, code: null };
  const code = error.problem.code;
  const byCode: Readonly<Record<string, string>> = {
    ACCESS_DENIED: errors.accessDenied,
    AUTHENTICATION_REQUIRED: errors.signedOut,
    REAUTHENTICATION_REQUIRED: errors.signedOut,
    SESSION_REVOKED: errors.signedOut,
    GOVERNANCE_CONFLICT: errors.conflict,
    PROVISIONAL_CONFLICT: errors.conflict,
    ADMINISTRATION_CONFLICT: errors.conflict,
    GOVERNANCE_REFUSED: errors.refused,
    PROVISIONAL_REFUSED: errors.refused,
    VALIDATION_FAILED: errors.validation,
    PAYLOAD_TOO_LARGE: errors.fileInvalid,
    FILE_INVALID: errors.fileInvalid,
    OPERATIONAL_STATE_FORBIDS: errors.stateForbids,
    PACK_VERSION_NOT_FOUND: errors.notFound,
    FEEDBACK_NOT_FOUND: errors.notFound,
    ACCOUNT_NOT_FOUND: errors.notFound,
    USERNAME_TAKEN: errors.usernameTaken,
    USERNAME_INVALID: errors.usernameInvalid,
    SELF_ADMINISTRATION: errors.selfAdministration,
    ROLE_INCOMPATIBLE: errors.roleIncompatible,
    ROLE_NOT_GRANTABLE: errors.roleNotGrantable,
    SCOPE_INVALID: errors.scopeInvalid,
    ROLE_ALREADY_HELD: errors.roleAlreadyHeld,
    LAST_SUPER_ADMIN: errors.lastSuperAdmin,
    CONFIRMATION_REQUIRED: errors.confirmationRequired,
    STATUS_UNCHANGED: errors.statusUnchanged,
    PACK_MARJA_MISMATCH: errors.marjaMismatch,
    RULE_CONFLICT: errors.conflict,
    RULE_REFUSED: errors.refused,
    RULE_VERIFICATION_REFUSED: errors.refused,
    ALREADY_VERIFIED: errors.alreadyVerified,
    RULE_NOT_FOUND: errors.notFound,
  };
  return { message: byCode[code] ?? errors.generic, code };
}
