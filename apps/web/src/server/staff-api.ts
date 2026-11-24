import { cookies, headers } from 'next/headers';

import { createApiClient, type AdminSessionResponse, type ApiClient } from '@khums/api-client';

import { apiOrigin } from './staff-api-origin';

/**
 * SERVER-ONLY staff API access (M4.6.2b; docs/AUTH_ARCHITECTURE.md §4.10). Never import this from
 * a Client Component.
 *
 * The browser talks only to the web origin: `/api/v1/*` is rewritten to the API host
 * (`next.config.ts`, transport only, not a BFF), so the staff session cookie is first-party and
 * the API itself authenticates and authorizes every request. Server Components read the signed-in
 * staff member by forwarding ONLY the staff session cookie to the API; they decide nothing.
 */

import { clientIpAssertion, edgeConfig } from '@/lib/client-ip-signature';
import { STAFF_SESSION_COOKIES } from '@/lib/staff-cookies';

/** Server Component calls to the API give up after this (M4.7 cold starts). */
export const SERVER_API_TIMEOUT_MS = 15_000;

export type StaffSessionLookup =
  | { readonly kind: 'SIGNED_IN'; readonly session: AdminSessionResponse }
  | { readonly kind: 'SIGNED_OUT' }
  | { readonly kind: 'NOT_ACTIVE' }
  | { readonly kind: 'UNAVAILABLE' };

/**
 * An API client for this request that forwards ONLY the staff session cookie (Server Components;
 * reads only: commands go from the browser with the CSRF header). Null when there is no session
 * cookie or no API origin.
 */
export async function serverStaffApi(): Promise<
  | { readonly kind: 'READY'; readonly api: ApiClient }
  | { readonly kind: 'SIGNED_OUT' | 'UNAVAILABLE' }
> {
  const store = await cookies();
  const cookie = STAFF_SESSION_COOKIES.flatMap((name) => {
    const value = store.get(name)?.value;
    return value === undefined ? [] : [`${name}=${value}`];
  }).join('; ');
  if (cookie === '') return { kind: 'SIGNED_OUT' };
  const api = await serverApiClient(cookie);
  return api === null ? { kind: 'UNAVAILABLE' } : { kind: 'READY', api };
}

/**
 * An API client for this request (Server Components only): each request carries the signed
 * client IP of the browser request being rendered, exactly like `/api/v1/*` requests through
 * proxy.ts (M4.7: the API refuses unsigned requests). `cookie` is the staff session cookie header
 * to forward, or null for the public, unauthenticated reads (decision 65), which forward no cookie
 * at all. Null when there is no API origin.
 */
export async function serverApiClient(cookie: string | null): Promise<ApiClient | null> {
  const origin = apiOrigin();
  if (origin === null) return null;
  const incoming = await headers();
  const config = edgeConfig();
  return createApiClient({
    baseUrl: `${origin}/api/v1`,
    fetch: async (url, init) => {
      const assertion = await clientIpAssertion(
        incoming,
        init.method,
        new URL(url).pathname,
        config,
        Date.now(),
      );
      if (assertion.kind === 'MISCONFIGURED') throw new Error('Staff API is not configured');
      const extra = assertion.kind === 'SIGNED' ? assertion.headers : {};
      return fetch(url, {
        ...init,
        headers: { ...init.headers, ...extra },
        cache: 'no-store',
        // A sleeping API host (free tier) is reported as unavailable instead of holding the
        // page render until the hosting platform's own time limit.
        signal: AbortSignal.timeout(SERVER_API_TIMEOUT_MS),
      });
    },
    headers: () => (cookie === null ? {} : { cookie }),
  });
}

/** The signed-in staff member as the API establishes it, from the forwarded session cookie. */
export async function lookupStaffSession(): Promise<StaffSessionLookup> {
  const client = await serverStaffApi();
  if (client.kind !== 'READY') return { kind: client.kind };
  const result = await client.api.admin.session();
  if (result.ok) return { kind: 'SIGNED_IN', session: result.value };
  if (result.error.kind !== 'http') return { kind: 'UNAVAILABLE' };
  switch (result.error.problem.code) {
    case 'AUTHENTICATION_REQUIRED':
    case 'REAUTHENTICATION_REQUIRED':
    case 'SESSION_REVOKED':
      return { kind: 'SIGNED_OUT' };
    case 'ACCOUNT_NOT_ACTIVE':
      return { kind: 'NOT_ACTIVE' };
    default:
      return { kind: 'UNAVAILABLE' };
  }
}
