import { tokenMatchesHash } from './secrets';

/**
 * CSRF defence in depth for staff routes (M4.6.2b; docs/AUTH_ARCHITECTURE.md §4.10). Every
 * unsafe request must pass ALL layers; none replaces another:
 *
 * 1. `Origin` present and exactly one of the configured web origins;
 * 2. `Sec-Fetch-Site: same-origin` (the browser reached the API through the web origin's rewrite);
 * 3. (with a session) `X-CSRF-Token` matching the token bound to that server-side session,
 *    compared in constant time against its stored SHA-256 hash.
 *
 * Pure functions over header values, so each layer is tested on its own.
 */

export const UNSAFE_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type CsrfFailure =
  | 'CSRF_ORIGIN_REJECTED'
  | 'CSRF_FETCH_SITE_REJECTED'
  | 'CSRF_TOKEN_MISSING'
  | 'CSRF_TOKEN_MISMATCH';

const single = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? undefined : value;

/** Layers 1 and 2 (also applied to sign-in, which has no session yet). */
export function checkRequestOrigin(
  headers: {
    readonly origin?: string | string[] | undefined;
    readonly 'sec-fetch-site'?: string | string[] | undefined;
  },
  allowedOrigins: readonly string[],
): CsrfFailure | null {
  const origin = single(headers.origin);
  if (origin === undefined || origin === 'null' || !allowedOrigins.includes(origin)) {
    return 'CSRF_ORIGIN_REJECTED';
  }
  if (single(headers['sec-fetch-site']) !== 'same-origin') return 'CSRF_FETCH_SITE_REJECTED';
  return null;
}

/** Layer 3: the session-bound token. */
export function checkCsrfToken(
  header: string | string[] | undefined,
  storedHash: string,
): CsrfFailure | null {
  const token = single(header);
  if (token === undefined || token.length === 0 || token.length > 200) return 'CSRF_TOKEN_MISSING';
  return tokenMatchesHash(token, storedHash) ? null : 'CSRF_TOKEN_MISMATCH';
}
