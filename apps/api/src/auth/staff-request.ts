import type { VerifiedPrincipal } from '@khums/shared-types';

/** What the guard established for this request (M4.6.2b). */
export interface StaffAuthentication {
  readonly principal: VerifiedPrincipal;
  /** Session state looked up for this request, for the authorization context. */
  readonly sessionState: 'ACTIVE';
  readonly session: {
    /** SHA-256 of the cookie value (the stored id); the raw value never leaves the guard. */
    readonly sessionIdHash: string;
    /** Signed in with a temporary password: only the password change and sign-out are allowed. */
    readonly passwordChangeOnly: boolean;
    readonly expiresAt: string;
  };
  readonly account: { readonly username: string };
}

/**
 * Per-request staff authentication, set only by `StaffAuthGuard`. Kept in a module-private
 * WeakMap keyed by the request object rather than on a request property, so nothing a client
 * sends (headers, body, query) can ever be read as authentication state.
 */
const AUTHENTICATED = new WeakMap<object, StaffAuthentication>();

export function attachStaffAuthentication(request: object, value: StaffAuthentication): void {
  AUTHENTICATED.set(request, value);
}

/** The guard's result for this request, or `undefined` when the guard did not run or failed. */
export function staffAuthenticationOf(request: object): StaffAuthentication | undefined {
  return AUTHENTICATED.get(request);
}
