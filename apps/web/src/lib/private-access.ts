import { createApiClient } from '@khums/api-client';

import { resolveOperationalState } from '@/server/operational-state';

import { clientIpAssertion, type EdgeConfig } from './client-ip-signature';

/**
 * Whole-application private access gate (M4.7; docs/DEPLOYMENT_FREE_TIER.md §4).
 *
 * `PRIVATE`: every page except staff sign-in needs a staff session that the API confirms on each
 * page request (not merely a cookie). Used for the private scholar-review deployment and, fail
 * closed, for every hosted deployment that is not explicitly public. `PUBLIC`: today's behaviour
 * (only `/admin` needs a session cookie; the admin pages ask the API).
 *
 * - `SCHOLAR_REVIEW` is always private, hosted or not.
 * - Hosted (Vercel) deployments are private unless they are `PRODUCTION_APPROVED` AND set
 *   `KHUMS_PUBLIC_ACCESS=enabled`: the public launch is a separate, explicit decision.
 * - `KHUMS_PRIVATE_ACCESS=required` forces private anywhere (another host, local rehearsal).
 * - Local development and the test builds otherwise stay public (anonymous local use).
 *
 * Decision 65 (one deployment): the public `PRODUCTION_APPROVED` deployment also hosts staff
 * testing of provisional packs. That needs no private mode: provisional pages live under `/admin`
 * (session cookie here, `admin`/`review` access checks in the pages) and every provisional API
 * route is a staff route the API authenticates and authorizes, so nothing provisional is ever
 * reachable without a staff session.
 */
export type AccessMode = 'PRIVATE' | 'PUBLIC';

/** Sign-in query flag: the API did not answer in time (asleep); the page wakes it first. */
export const WAKE_PARAM = 'wake';
/** Sign-in query value: the page to continue to once the API answers (`safeContinuePath`). */
export const CONTINUE_PARAM = 'next';

export function accessMode(env: Readonly<Record<string, string | undefined>>): AccessMode {
  if (env.KHUMS_PRIVATE_ACCESS === 'required') return 'PRIVATE';
  const state = resolveOperationalState(env);
  if (state.ok && state.state === 'SCHOLAR_REVIEW') return 'PRIVATE';
  if (env.VERCEL === '1') {
    const publicLaunch =
      state.ok && state.state === 'PRODUCTION_APPROVED' && env.KHUMS_PUBLIC_ACCESS === 'enabled';
    return publicLaunch ? 'PUBLIC' : 'PRIVATE';
  }
  return 'PUBLIC';
}

export type SessionCheck = 'SIGNED_IN' | 'MUST_CHANGE_PASSWORD' | 'SIGNED_OUT' | 'UNAVAILABLE';

/** How long a page request waits for the API before treating it as asleep (cold start). */
export const SESSION_CHECK_TIMEOUT_MS = 8_000;

/**
 * Asks the API who holds this session cookie (`GET /api/v1/admin/session`), with the browser's
 * signed client IP, exactly like any other staff request. The API decides; anything other than a
 * confirmed session is a denial (`UNAVAILABLE` included: never a bypass).
 */
export async function checkStaffSession(input: {
  readonly origin: string | null;
  readonly cookie: string;
  readonly incoming: Headers;
  readonly edge: EdgeConfig;
  readonly nowMs: number;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}): Promise<SessionCheck> {
  if (input.origin === null) return 'UNAVAILABLE';
  const doFetch = input.fetch ?? fetch;
  const api = createApiClient({
    baseUrl: `${input.origin}/api/v1`,
    fetch: async (url, init) => {
      const assertion = await clientIpAssertion(
        input.incoming,
        init.method,
        new URL(url).pathname,
        input.edge,
        input.nowMs,
      );
      if (assertion.kind === 'MISCONFIGURED') throw new Error('Staff API is not configured');
      const extra = assertion.kind === 'SIGNED' ? assertion.headers : {};
      return doFetch(url, {
        ...init,
        headers: { ...init.headers, ...extra },
        cache: 'no-store',
        signal: AbortSignal.timeout(input.timeoutMs ?? SESSION_CHECK_TIMEOUT_MS),
      });
    },
    headers: () => ({ cookie: input.cookie }),
  });
  const result = await api.admin.session();
  if (result.ok) return result.value.mustChangePassword ? 'MUST_CHANGE_PASSWORD' : 'SIGNED_IN';
  if (result.error.kind !== 'http') return 'UNAVAILABLE';
  switch (result.error.problem.code) {
    case 'AUTHENTICATION_REQUIRED':
    case 'REAUTHENTICATION_REQUIRED':
    case 'SESSION_REVOKED':
    case 'ACCOUNT_NOT_ACTIVE':
      return 'SIGNED_OUT';
    default:
      return 'UNAVAILABLE';
  }
}

/**
 * The page to continue to after the sign-in page has woken the API: only a same-origin,
 * localized page path (`/en/...`, `/ur/...`), never another origin or a protocol-relative URL.
 */
export function safeContinuePath(raw: string | null, locales: readonly string[]): string | null {
  if (raw === null || raw.length > 512) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return null; // control characters
  }
  const [, first] = raw.split('/');
  return first !== undefined && locales.includes(first) ? raw : null;
}
