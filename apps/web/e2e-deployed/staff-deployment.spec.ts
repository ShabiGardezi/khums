import { expect, test, type Browser, type Page } from '@playwright/test';

import { CONTENT } from '../src/content';

/**
 * Staff authentication on a REAL deployment (M4.6.2b hardening). Verifies, through Vercel's actual
 * rewrite: Set-Cookie attributes, cookie forwarding, Origin / Sec-Fetch-Site / X-CSRF-Token
 * forwarding and enforcement, client-IP spoofing resistance, and the first-scholar workflow.
 * Creates one `verify-*` scholar account and deactivates it at the end.
 */

const BASE = process.env.STAFF_VERIFY_BASE_URL ?? '';
const ADMIN = {
  username: process.env.STAFF_VERIFY_ADMIN_USERNAME ?? '',
  password: process.env.STAFF_VERIFY_ADMIN_PASSWORD ?? '',
};
const a = CONTENT.admin.en;
const label = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*?$`);

test.skip(
  !BASE.startsWith('https://') || ADMIN.username === '' || ADMIN.password === '',
  'Set STAFF_VERIFY_BASE_URL (https) and the verification administrator credentials',
);
test.describe.configure({ mode: 'serial' });

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/en/admin/sign-in');
  await page.getByLabel(label(a.signInPage.username)).fill(username);
  await page.getByLabel(label(a.signInPage.password)).fill(password);
  await page.getByRole('button', { name: a.signInPage.submit }).click();
}

/** A call made by the browser itself, so Origin and Sec-Fetch-Site are genuine. */
async function browserPost(page: Page, path: string, body: unknown, withToken = true) {
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

let adminPage: Page;
let scholar: { principalId: string; username: string } | null = null;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  adminPage = await (await browser.newContext()).newPage();
});

test('the /api/v1 rewrite reaches the API', async ({ request }) => {
  const response = await request.get('/api/v1/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'ok', service: 'khums-api' });
});

test('sign-in sets first-party __Host- cookies through the rewrite', async () => {
  await signIn(adminPage, ADMIN.username, ADMIN.password);
  await expect(adminPage).toHaveURL(/\/en\/admin$/);
  const host = new URL(BASE).hostname;
  const cookies = await adminPage.context().cookies();
  const byName = (n: string) => cookies.find((c) => c.name === n);
  expect(byName('__Host-khums_staff')).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    domain: host,
  });
  expect(byName('__Host-khums_csrf')).toMatchObject({
    httpOnly: false,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    domain: host,
  });
  expect(byName('__Host-khums_device')).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
  });
});

test('cookies are forwarded and Origin, Sec-Fetch-Site and X-CSRF-Token reach the API', async ({
  request,
}) => {
  const session = await adminPage.evaluate(
    async () => (await fetch('/api/v1/admin/session')).status,
  );
  expect(session).toBe(200);
  // Without the token: refused by the CSRF layer.
  expect(await browserPost(adminPage, '/admin/staff/accounts', {}, false)).toMatchObject({
    status: 403,
    json: { code: 'CSRF_REJECTED' },
  });
  // With the token, from the browser: passes every CSRF layer and reaches validation (400, no change).
  expect(await browserPost(adminPage, '/admin/staff/accounts', {})).toMatchObject({
    status: 400,
    json: { code: 'VALIDATION_FAILED' },
  });
  // A cross-site request with the cookies and the token is still refused.
  const cookies = await adminPage.context().cookies();
  const forged = await request.post('/api/v1/admin/staff/accounts', {
    headers: {
      origin: 'https://evil.example',
      'sec-fetch-site': 'cross-site',
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '),
      'x-csrf-token': cookies.find((c) => c.name === '__Host-khums_csrf')?.value ?? '',
    },
    data: {},
  });
  expect(forged.status()).toBe(403);
});

test('a client cannot spoof its IP: forged X-Forwarded-For values all count as one client', async ({
  request,
}) => {
  const username = `verify-nobody-${String(Date.now())}`;
  const attempt = (i: number) =>
    request.post('/api/v1/staff/auth/login', {
      headers: {
        origin: new URL(BASE).origin,
        'sec-fetch-site': 'same-origin',
        'x-forwarded-for': `198.51.100.${String(i)}`,
        'x-real-ip': `198.51.100.${String(i)}`,
        'x-khums-client-ip': `198.51.100.${String(i)}`,
      },
      data: { username, password: 'definitely the wrong password' },
    });
  for (let i = 1; i <= 5; i += 1) expect((await attempt(i)).status()).toBe(401);
  // If any forged header were trusted, each attempt would be a new client and this would be 401.
  expect((await attempt(6)).status()).toBe(429);
});

test('first scholar workflow: create, temporary password handover, forced change', async ({
  browser,
}) => {
  const username = `verify-scholar-${String(Date.now())}`;
  const created = await browserPost(adminPage, '/admin/staff/accounts', {
    username,
    reason: 'Deployment verification',
  });
  expect(created.status).toBe(201);
  const { principalId, temporaryPassword } = created.json as {
    principalId: string;
    temporaryPassword: string;
  };
  scholar = { principalId, username };

  const page = await (await browser.newContext()).newPage();
  await signIn(page, username, temporaryPassword);
  await expect(page).toHaveURL(/\/en\/admin\/password$/);
  const permanent = `deployment verification passphrase ${String(Date.now())}`;
  await page.getByLabel(label(a.passwordPage.current)).fill(temporaryPassword);
  await page.getByLabel(label(a.passwordPage.next)).fill(permanent);
  await page.getByLabel(label(a.passwordPage.confirm)).fill(permanent);
  await page.getByRole('button', { name: a.passwordPage.submit }).click();
  await expect(page).toHaveURL(/\/en\/admin$/);

  // Clean up: deactivate the verification account; its session ends immediately.
  const deactivated = await browserPost(adminPage, `/admin/staff/accounts/${principalId}/status`, {
    status: 'DEACTIVATED',
    reason: 'Deployment verification finished',
  });
  expect(deactivated.status).toBe(200);
  await page.reload();
  await expect(page).toHaveURL(/\/en\/admin\/sign-in$/);
  scholar = null;
});

test.afterAll(async () => {
  if (scholar !== null) {
    await browserPost(adminPage, `/admin/staff/accounts/${scholar.principalId}/status`, {
      status: 'DEACTIVATED',
      reason: 'Deployment verification cleanup',
    });
  }
});
