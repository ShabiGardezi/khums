import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { proxy } from './proxy';

/** Admin gating and locale routing (M4.6.2b). The API remains the authority on sessions. */

const request = (path: string, cookie?: string) =>
  new NextRequest(
    `http://localhost:3000${path}`,
    cookie === undefined ? {} : { headers: { cookie } },
  );

describe('proxy', () => {
  it('sends admin visitors without a staff session cookie to the sign-in page (no-store)', async () => {
    for (const [path, target] of [
      ['/en/admin', '/en/admin/sign-in'],
      ['/ur/admin/password', '/ur/admin/sign-in'],
    ] as const) {
      const response = await proxy(request(path));
      expect(response.status, path).toBe(307);
      expect(new URL(response.headers.get('location') ?? '').pathname).toBe(target);
      expect(response.headers.get('cache-control')).toBe('no-store');
      // Decision 65: staff pages on the public deployment are never indexed.
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    }
  });

  it('decision 65: public PRODUCTION_APPROVED keeps public pages public and staff pages gated', async () => {
    vi.stubEnv('KHUMS_OPERATIONAL_STATE', 'PRODUCTION_APPROVED');
    vi.stubEnv('KHUMS_PUBLIC_ACCESS', 'enabled');
    try {
      for (const path of ['/en/start', '/en/start/marja', '/ur/history']) {
        const response = await proxy(request(path));
        expect(response.headers.get('location'), path).toBeNull();
        expect(response.headers.get('x-robots-tag'), path).toBeNull();
      }
      for (const path of ['/en/admin/rules', '/en/admin/audit']) {
        const response = await proxy(request(path));
        expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/en/admin/sign-in');
        expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      }
      const staff = await proxy(request('/en/admin/rules', '__Host-khums_staff=abc'));
      expect(staff.headers.get('location')).toBeNull();
      expect(staff.headers.get('cache-control')).toBe('no-store');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('lets the sign-in page and cookie holders through (the page asks the API)', async () => {
    expect((await proxy(request('/en/admin/sign-in'))).headers.get('location')).toBeNull();
    expect(
      (await proxy(request('/en/admin', '__Host-khums_staff=abc'))).headers.get('location'),
    ).toBeNull();
    expect(
      (await proxy(request('/en/admin', 'khums_staff=abc'))).headers.get('location'),
    ).toBeNull();
  });

  it('leaves public pages alone and sets no cookies', async () => {
    const response = await proxy(request('/en/start'));
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('forwards /api/v1 requests with client-supplied x-khums-client-ip headers removed', async () => {
    const forged = new NextRequest('http://localhost:3000/api/v1/staff/auth/login', {
      method: 'POST',
      headers: { 'x-khums-client-ip': '198.51.100.1', 'x-khums-client-ip-sig': 'forged' },
    });
    const response = await proxy(forged);
    expect(response.headers.get('x-middleware-override-headers') ?? '').not.toContain(
      'x-khums-client-ip-sig',
    );
    expect(response.headers.get('x-middleware-request-x-khums-client-ip')).toBeNull();
    expect(response.headers.get('location')).toBeNull();
  });
});

describe('proxy: whole-application private gate (M4.7)', () => {
  const API = 'http://127.0.0.1:4999';
  const privateEnv = () => {
    vi.stubEnv('KHUMS_OPERATIONAL_STATE', 'SCHOLAR_REVIEW');
    vi.stubEnv('KHUMS_API_ORIGIN', API);
  };
  const apiAnswers = (status: number, body: unknown) => {
    const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: {
            'content-type': status < 400 ? 'application/json' : 'application/problem+json',
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const session = (mustChangePassword = false) => ({
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
  const location = (response: Response) => {
    const value = response.headers.get('location');
    return value === null ? null : new URL(value);
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends visitors without a session from EVERY page to sign-in, noindex and no-store', async () => {
    privateEnv();
    const fetchMock = apiAnswers(500, {});
    for (const path of ['/en', '/en/start', '/ur/methodology', '/en/privacy', '/en/admin']) {
      const response = await proxy(request(path));
      expect(response.status, path).toBe(307);
      expect(location(response)?.pathname, path).toBe(
        path.startsWith('/ur') ? '/ur/admin/sign-in' : '/en/admin/sign-in',
      );
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    }
    // No API call is needed to refuse a visitor without a cookie.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the sign-in page open', async () => {
    privateEnv();
    const response = await proxy(request('/en/admin/sign-in'));
    expect(location(response)).toBeNull();
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('does not trust a cookie: a session the API does not confirm is sent to sign-in', async () => {
    privateEnv();
    apiAnswers(401, {
      type: 'about:blank',
      title: 'x',
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
    });
    const response = await proxy(request('/en/start', '__Host-khums_staff=forged'));
    expect(location(response)?.pathname).toBe('/en/admin/sign-in');
  });

  it('lets a confirmed session through; a temporary-password session only to the password page', async () => {
    privateEnv();
    const fetchMock = apiAnswers(200, session());
    const ok = await proxy(request('/en/methodology', '__Host-khums_staff=abc'));
    expect(location(ok)).toBeNull();
    expect(ok.headers.get('cache-control')).toBe('no-store');
    const called = fetchMock.mock.calls[0]?.[0];
    expect(
      typeof called === 'string' ? called : called instanceof URL ? called.href : called?.url,
    ).toBe(`${API}/api/v1/admin/session`);

    apiAnswers(200, session(true));
    const forced = await proxy(request('/en/start', '__Host-khums_staff=abc'));
    expect(location(forced)?.pathname).toBe('/en/admin/password');
    const password = await proxy(request('/en/admin/password', '__Host-khums_staff=abc'));
    expect(location(password)).toBeNull();
  });

  it('sends visitors to the sign-in page to wake a sleeping API, then continue', async () => {
    privateEnv();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('timeout'))),
    );
    const response = await proxy(request('/ur/admin/rules?tab=x', '__Host-khums_staff=abc'));
    const target = location(response);
    expect(target?.pathname).toBe('/ur/admin/sign-in');
    expect(target?.searchParams.get('wake')).toBe('1');
    expect(target?.searchParams.get('next')).toBe('/ur/admin/rules?tab=x');
  });

  it('is private on any hosted deployment that is not an explicit public launch', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('KHUMS_OPERATIONAL_STATE', 'PRODUCTION_APPROVED');
    const response = await proxy(request('/en/start'));
    expect(location(response)?.pathname).toBe('/en/admin/sign-in');
  });
});
