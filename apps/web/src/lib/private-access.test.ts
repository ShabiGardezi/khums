import { describe, expect, it, vi } from 'vitest';

import { accessMode, checkStaffSession, safeContinuePath } from './private-access';

/** Whole-application private gate (M4.7). */

const urlOf = (input: string | URL | Request | undefined) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;

describe('access mode', () => {
  it('is always private for SCHOLAR_REVIEW, hosted or not', () => {
    expect(accessMode({ KHUMS_OPERATIONAL_STATE: 'SCHOLAR_REVIEW' })).toBe('PRIVATE');
    expect(accessMode({ KHUMS_OPERATIONAL_STATE: 'SCHOLAR_REVIEW', VERCEL: '1' })).toBe('PRIVATE');
    expect(
      accessMode({
        KHUMS_OPERATIONAL_STATE: 'SCHOLAR_REVIEW',
        VERCEL: '1',
        KHUMS_PUBLIC_ACCESS: 'enabled',
      }),
    ).toBe('PRIVATE');
  });

  it('fails closed on a hosted deployment that is not an explicit public launch', () => {
    for (const env of [
      { VERCEL: '1' },
      { VERCEL: '1', KHUMS_OPERATIONAL_STATE: 'NONSENSE' },
      { VERCEL: '1', KHUMS_OPERATIONAL_STATE: 'DEVELOPMENT' },
      { VERCEL: '1', KHUMS_OPERATIONAL_STATE: 'PRODUCTION_APPROVED' },
      { VERCEL: '1', KHUMS_OPERATIONAL_STATE: 'PRODUCTION_APPROVED', KHUMS_PUBLIC_ACCESS: 'yes' },
    ]) {
      expect(accessMode(env), JSON.stringify(env)).toBe('PRIVATE');
    }
    expect(
      accessMode({
        VERCEL: '1',
        KHUMS_OPERATIONAL_STATE: 'PRODUCTION_APPROVED',
        KHUMS_PUBLIC_ACCESS: 'enabled',
      }),
    ).toBe('PUBLIC');
  });

  it('keeps local development public unless forced private', () => {
    expect(accessMode({ NODE_ENV: 'development' })).toBe('PUBLIC');
    expect(accessMode({ KHUMS_OPERATIONAL_STATE: 'DEVELOPMENT' })).toBe('PUBLIC');
    expect(accessMode({ KHUMS_PRIVATE_ACCESS: 'required' })).toBe('PRIVATE');
  });
});

describe('session check', () => {
  const edge = {
    secret: 'e2e-only-edge-signing-key-not-a-secret-0123456',
    header: 'x-forwarded-for',
    hosted: false,
  };
  const respond = (status: number, body: unknown) =>
    vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: {
            'content-type': status < 400 ? 'application/json' : 'application/problem+json',
          },
        }),
      ),
    );
  const session = (mustChangePassword: boolean) => ({
    principalId: 'p-1',
    username: 'scholar',
    accountStatus: 'ACTIVE',
    roles: [],
    permissions: [],
    authentication: {
      assurance: 'AAL1',
      methods: ['PASSWORD'],
      authenticatedAt: '2026-11-22T09:55:00.000Z',
    },
    mustChangePassword,
    sessionExpiresAt: '2026-11-22T10:30:00.000Z',
  });
  const problem = (status: number, code: string) => ({
    type: 'about:blank',
    title: 'x',
    status,
    code,
  });
  const check = (
    fetchImpl: ReturnType<typeof respond>,
    origin: string | null = 'http://api.test',
  ) =>
    checkStaffSession({
      origin,
      cookie: '__Host-khums_staff=abc',
      incoming: new Headers({ 'x-forwarded-for': '203.0.113.9' }),
      edge,
      nowMs: Date.parse('2026-11-22T10:00:00.000Z'),
      fetch: fetchImpl,
    });

  it('asks the API with only the session cookie and a signed client IP', async () => {
    const fetchImpl = respond(401, problem(401, 'AUTHENTICATION_REQUIRED'));
    await check(fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(urlOf(url)).toBe('http://api.test/api/v1/admin/session');
    const headers = new Headers(init?.headers);
    expect(headers.get('cookie')).toBe('__Host-khums_staff=abc');
    expect(headers.get('x-khums-client-ip')).toBe('203.0.113.9');
    expect(headers.get('x-khums-client-ip-sig')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('confirms a session, and reports a temporary-password session', async () => {
    expect(await check(respond(200, session(false)))).toBe('SIGNED_IN');
    expect(await check(respond(200, session(true)))).toBe('MUST_CHANGE_PASSWORD');
  });

  it('maps the API answer; anything unconfirmed is a denial', async () => {
    expect(await check(respond(401, problem(401, 'AUTHENTICATION_REQUIRED')))).toBe('SIGNED_OUT');
    expect(await check(respond(401, problem(401, 'SESSION_REVOKED')))).toBe('SIGNED_OUT');
    expect(await check(respond(403, problem(403, 'ACCOUNT_NOT_ACTIVE')))).toBe('SIGNED_OUT');
    expect(await check(respond(503, problem(503, 'AUTHENTICATION_UNAVAILABLE')))).toBe(
      'UNAVAILABLE',
    );
    expect(await check(respond(403, problem(403, 'EDGE_SIGNATURE_REQUIRED')))).toBe('UNAVAILABLE');
    expect(await check(respond(200, { unexpected: true }))).toBe('UNAVAILABLE');
    const offline = vi.fn(() => Promise.reject(new Error('timeout')));
    expect(await check(offline as unknown as ReturnType<typeof respond>)).toBe('UNAVAILABLE');
    expect(await check(respond(200, session(false)), null)).toBe('UNAVAILABLE');
  });
});

describe('continue path after waking the API', () => {
  it('accepts only same-origin localized paths', () => {
    expect(safeContinuePath('/en/admin/rules?x=1', ['en', 'ur'])).toBe('/en/admin/rules?x=1');
    expect(safeContinuePath('/ur', ['en', 'ur'])).toBe('/ur');
    for (const bad of [
      null,
      'https://evil.example/en',
      '//evil.example/en',
      '/\\evil.example',
      '/fr/page',
      'en/page',
      '/en/\u0000',
      `/en/${'a'.repeat(600)}`,
    ]) {
      expect(safeContinuePath(bad, ['en', 'ur']), String(bad)).toBeNull();
    }
  });
});
