import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

import { CONTENT } from '../src/content';

/**
 * Staff username/password authentication end to end (M4.6.2b), through the REAL Next.js rewrite
 * of /api/v1 to the REAL API (in-memory stores, TEST ONLY fixture). Verifies that Set-Cookie,
 * Cookie, Origin, Sec-Fetch-Site and X-CSRF-Token cross the rewrite unchanged, and the sign-in,
 * temporary-password, revocation and sign-out journeys.
 */

const FIXTURE = JSON.parse(
  readFileSync(new URL('../../api/test/fixtures/e2e-staff.json', import.meta.url), 'utf8'),
) as { superAdmin: { username: string; password: string } };
const ADMIN = FIXTURE.superAdmin;
const a = CONTENT.admin.en;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const PUBLIC_PATHS = ['/en', '/ur', '/en/start', '/en/privacy', '/en/disclaimer'];
/** Field labels may carry a required marker. */
const label = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*?$`);

/**
 * Unique per test run: project, worker, repeat and time. `Date.now()` alone collides when parallel
 * workers create accounts in the same millisecond (USERNAME_TAKEN).
 */
const uniqueSuffix = (testInfo: TestInfo) =>
  `${testInfo.project.name}-${String(testInfo.workerIndex)}-${String(testInfo.repeatEachIndex)}-${String(Date.now())}`;

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/en/admin/sign-in');
  await page.getByLabel(label(a.signInPage.username)).fill(username);
  await page.getByLabel(label(a.signInPage.password)).fill(password);
  await page.getByRole('button', { name: a.signInPage.submit }).click();
}

/** A staff API call made BY THE BROWSER (it sets Origin and Sec-Fetch-Site itself). */
async function browserCall(page: Page, path: string, body: unknown, withToken = true) {
  return page.evaluate(
    async ({ path, body, withToken }) => {
      const token = document.cookie
        .split(';')
        .map((c) => c.trim().split('='))
        .find(([name]) => name === '__Host-khums_csrf')?.[1];
      const response = await fetch(`/api/v1${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(withToken && token !== undefined ? { 'x-csrf-token': token } : {}),
        },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        json: (await response.json().catch(() => null)) as unknown,
      };
    },
    { path, body, withToken },
  );
}

test.describe('staff authentication boundary', () => {
  test('public calculator pages need no sign-in and set no cookies', async ({ request }) => {
    for (const path of PUBLIC_PATHS) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
      expect(response.headers()['set-cookie'], path).toBeUndefined();
    }
  });

  test('admin pages without a session redirect to sign-in; no Auth0 routes remain', async ({
    request,
  }) => {
    for (const [path, target] of [
      ['/en/admin', '/en/admin/sign-in'],
      ['/ur/admin', '/ur/admin/sign-in'],
    ] as const) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(307);
      expect(new URL(response.headers().location ?? '', 'http://x').pathname).toBe(target);
      expect(response.headers()['cache-control']).toBe('no-store');
    }
    for (const path of ['/auth/login', '/auth/callback', '/auth/logout']) {
      expect((await request.get(path, { maxRedirects: 0 })).status(), path).not.toBe(302);
    }
  });

  test('a forged session cookie does not open the console', async ({ page }) => {
    await page.setExtraHTTPHeaders({
      cookie: '__Host-khums_staff=forged-session-value-0123456789abcdef',
    });
    await page.goto('/en/admin');
    await expect(page).toHaveURL(/\/en\/admin\/sign-in$/);
  });

  test('sign-in page is accessible and reports wrong credentials generically', async ({ page }) => {
    for (const locale of ['en', 'ur'] as const) {
      await page.goto(`/${locale}/admin/sign-in`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        CONTENT.admin[locale].signInPage.title,
      );
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
    }
    await signIn(page, 'no-such-user-e2e', 'definitely the wrong password');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      a.signInPage.invalidCredentials,
    );
  });
});

test.describe('before hydration (M5.2.1 verification)', () => {
  // The server HTML exactly as a browser shows it before React takes over.
  test.use({ javaScriptEnabled: false });

  test('credentials can never be submitted natively into the URL', async ({ page }) => {
    await page.goto('/en/admin/sign-in');
    const form = page.getByRole('main').locator('form');
    await expect(form).toHaveAttribute('method', 'post');
    const submit = page.getByRole('button', { name: a.signInPage.submit });
    await expect(submit).toBeDisabled();
    await page.getByLabel(label(a.signInPage.username)).fill('someone');
    await page.getByLabel(label(a.signInPage.password)).fill('not a real password 0000');
    await page.getByLabel(label(a.signInPage.password)).press('Enter');
    await page.waitForTimeout(300);
    expect(page.url()).not.toContain('password');
    expect(page.url()).not.toContain('someone');
    expect(new URL(page.url()).search).toBe('');
  });
});

test.describe('staff journeys through the real rewrite', () => {
  test('administrator signs in: cookies cross the rewrite, console shows complete access', async ({
    page,
    context,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page).toHaveURL(/\/en\/admin$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(a.title);
    await expect(page.getByText('SUPER_ADMIN')).toBeVisible();
    // Decision 64: SUPER_ADMIN holds every permission (formerly no governance.approve).
    await expect(page.getByText('governance.approve', { exact: true })).toBeVisible();

    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === '__Host-khums_staff');
    const csrf = cookies.find((c) => c.name === '__Host-khums_csrf');
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/' });
    expect(csrf).toMatchObject({ httpOnly: false, secure: true, sameSite: 'Strict', path: '/' });
    expect(session?.domain).toBe('localhost');
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
  });

  test('CSRF: the browser’s Origin/Sec-Fetch-Site and the token reach the API; missing token or foreign origin is refused', async ({
    page,
    request,
  }, testInfo) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page).toHaveURL(/\/en\/admin$/);
    const username = `csrf-${uniqueSuffix(testInfo)}`;
    const noToken = await browserCall(
      page,
      '/admin/staff/accounts',
      { username, reason: 'E2E TEST' },
      false,
    );
    expect(noToken).toMatchObject({ status: 403, json: { code: 'CSRF_REJECTED' } });
    const ok = await browserCall(page, '/admin/staff/accounts', { username, reason: 'E2E TEST' });
    expect(ok.status).toBe(201);
    // A cross-site request (another origin) is refused even with the cookies and the token.
    const cookies = await page.context().cookies();
    const forged = await request.post('/api/v1/admin/staff/accounts', {
      headers: {
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
        cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '),
        'x-csrf-token': cookies.find((c) => c.name === '__Host-khums_csrf')?.value ?? '',
      },
      data: { username: `${username}-x`, reason: 'E2E TEST' },
    });
    expect(forged.status()).toBe(403);
  });

  test('scholar: temporary password → forced change → console; role grant and revocation end the session; sign-out', async ({
    browser,
  }, testInfo) => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signIn(admin, ADMIN.username, ADMIN.password);
    await expect(admin).toHaveURL(/\/en\/admin$/);
    const username = `scholar-${uniqueSuffix(testInfo)}`;
    const created = await browserCall(admin, '/admin/staff/accounts', {
      username,
      reason: 'E2E TEST scholar',
    });
    expect(created.status).toBe(201);
    const { principalId, temporaryPassword } = created.json as {
      principalId: string;
      temporaryPassword: string;
    };

    const scholarContext = await browser.newContext();
    const scholar = await scholarContext.newPage();
    await signIn(scholar, username, temporaryPassword);
    await expect(scholar).toHaveURL(/\/en\/admin\/password$/);
    await expect(scholar.getByText(a.passwordPage.temporaryNotice)).toBeVisible();
    expect(
      (await new AxeBuilder({ page: scholar }).withTags(AXE_TAGS).analyze()).violations,
    ).toEqual([]);
    // The temporary password can never become the permanent one.
    await scholar.getByLabel(label(a.passwordPage.current)).fill(temporaryPassword);
    await scholar.getByLabel(label(a.passwordPage.next)).fill(temporaryPassword);
    await scholar.getByLabel(label(a.passwordPage.confirm)).fill(temporaryPassword);
    await scholar.getByRole('button', { name: a.passwordPage.submit }).click();
    await expect(scholar.getByRole('main').getByRole('alert')).toHaveText(a.passwordPage.reused);
    const permanent = 'an e2e scholar passphrase that is long';
    await scholar.getByLabel(label(a.passwordPage.next)).fill(permanent);
    await scholar.getByLabel(label(a.passwordPage.confirm)).fill(permanent);
    await scholar.getByRole('button', { name: a.passwordPage.submit }).click();
    await expect(scholar).toHaveURL(/\/en\/admin$/);
    await expect(scholar.getByText(a.noRoles)).toBeVisible();

    // Granting a Marja-scoped role ends the scholar's current session immediately.
    const granted = await browserCall(admin, `/admin/staff/accounts/${principalId}/roles`, {
      role: 'SCHOLAR',
      scope: { kind: 'MARJA', marjaIds: ['sistani'] },
      reason: 'E2E TEST first scholar',
    });
    expect(granted.status).toBe(200);
    await scholar.reload();
    await expect(scholar).toHaveURL(/\/en\/admin\/sign-in$/);
    await signIn(scholar, username, permanent);
    await expect(scholar.getByText('SCHOLAR', { exact: true })).toBeVisible();
    // Within the roles section (the dashboard also names the Marja in its public builder versions).
    await expect(
      scholar.getByRole('region', { name: a.rolesHeading }).getByText('sistani'),
    ).toBeVisible();

    // An administrator revoking every session signs the scholar out at once.
    expect(
      (
        await browserCall(admin, `/admin/staff/accounts/${principalId}/sessions/revoke`, {
          reason: 'E2E TEST',
        })
      ).status,
    ).toBe(200);
    await scholar.reload();
    await expect(scholar).toHaveURL(/\/en\/admin\/sign-in$/);

    // Sign-out revokes the session and returns to sign-in.
    await signIn(scholar, username, permanent);
    await expect(scholar).toHaveURL(/\/en\/admin$/);
    await scholar.getByRole('button', { name: a.signOut }).click();
    await expect(scholar).toHaveURL(/\/en\/admin\/sign-in$/);
    await scholar.goto('/en/admin');
    await expect(scholar).toHaveURL(/\/en\/admin\/sign-in$/);
    await adminContext.close();
    await scholarContext.close();
  });
});

test.describe('client IP through the real rewrite (M4.6.2b hardening)', () => {
  const login = (
    request: APIRequestContext,
    username: string,
    edgeIp: string,
    extra: Record<string, string> = {},
  ) =>
    request.post('/api/v1/staff/auth/login', {
      headers: {
        origin: 'http://localhost:3100',
        'sec-fetch-site': 'same-origin',
        // Stands in for Vercel's edge, which sets (overwrites) this header on every request.
        'x-forwarded-for': edgeIp,
        ...extra,
      },
      data: { username, password: 'definitely the wrong password' },
    });

  test('the API throttles on the edge address signed by the web tier; forged client headers change nothing', async ({
    request,
  }, testInfo) => {
    const username = `ip-${testInfo.project.name}-${String(Date.now())}`;
    for (let i = 0; i < 5; i += 1) {
      expect((await login(request, username, '192.0.2.71')).status()).toBe(401);
    }
    expect((await login(request, username, '192.0.2.71')).status()).toBe(429);
    // A client forging the internal headers cannot move itself to another bucket: proxy.ts strips
    // them and signs the edge address instead.
    const forged = await login(request, username, '192.0.2.71', {
      'x-khums-client-ip': '192.0.2.72',
      'x-khums-client-ip-at': String(Date.now()),
      'x-khums-client-ip-sig': 'forged-signature',
    });
    expect(forged.status()).toBe(429);
    // A different (edge-attested) client is not affected by the first one's failures.
    expect((await login(request, username, '192.0.2.73')).status()).toBe(401);
  });
});
