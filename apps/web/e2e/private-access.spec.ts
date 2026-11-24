import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { CONTENT } from '../src/content';
import { AXE_TAGS, REVIEW, SCHOLAR, signIn } from './support/staff-session';

/**
 * Whole-application private gate (M4.7) on the SCHOLAR_REVIEW web server, and edge-signature
 * enforcement on the API (KHUMS_REQUIRE_EDGE_SIGNATURE in playwright.config.ts).
 */

const API = 'http://127.0.0.1:4100';
const a = CONTENT.admin.en;
const PAGES = [
  '/en',
  '/en/start',
  '/en/methodology',
  '/ur/privacy',
  '/en/admin/rules',
  // M5.3.7: the research workspace is staff-only, never public.
  '/en/admin/research',
  '/ur/admin/research/sources',
];

test.describe('private access gate', () => {
  test('every page sends anonymous visitors to sign-in, noindex and no-store', async ({
    request,
  }) => {
    for (const path of PAGES) {
      const response = await request.get(`${REVIEW}${path}`, { maxRedirects: 0 });
      expect(response.status(), path).toBe(307);
      const target = new URL(response.headers().location ?? '', REVIEW).pathname;
      expect(target, path).toBe(path.startsWith('/ur') ? '/ur/admin/sign-in' : '/en/admin/sign-in');
      expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
      expect(response.headers()['cache-control']).toBe('no-store');
    }
    const robots = await request.get(`${REVIEW}/robots.txt`);
    expect(await robots.text()).toMatch(/Disallow: \//);
  });

  test('a forged session cookie opens no page', async ({ page }) => {
    await page.setExtraHTTPHeaders({
      cookie: '__Host-khums_staff=forged-session-value-0123456789abcdef',
    });
    await page.goto(`${REVIEW}/en/methodology`);
    await expect(page).toHaveURL(/\/en\/admin\/sign-in$/);
  });

  test('after sign-in every page is available', async ({ page }) => {
    await signIn(page, SCHOLAR);
    await page.goto(`${REVIEW}/en/methodology`);
    await expect(page).toHaveURL(/\/en\/methodology$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('the wake step continues once the API answers, and the gate checks again', async ({
    page,
  }) => {
    await page.goto(`${REVIEW}/en/admin/sign-in?wake=1&next=${encodeURIComponent('/en/start')}`);
    // Anonymous: continuing to /en/start brings the visitor back to plain sign-in (no loop).
    await expect(page).toHaveURL(/\/en\/admin\/sign-in$/);
    await expect(page.getByRole('heading', { level: 1, name: a.signInPage.title })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test('an unsafe continue target is ignored', async ({ page }) => {
    await page.goto(
      `${REVIEW}/en/admin/sign-in?wake=1&next=${encodeURIComponent('//evil.example/en')}`,
    );
    await expect(page.getByRole('heading', { level: 1, name: a.signInPage.title })).toBeVisible();
    await page.waitForTimeout(500);
    expect(new URL(page.url()).host).toBe(new URL(REVIEW).host);
  });
});

test.describe('API edge-signature enforcement', () => {
  test('the API host refuses direct requests; only the health check answers', async ({
    request,
  }) => {
    expect((await request.get(`${API}/api/v1/health`)).status()).toBe(200);
    for (const [method, path] of [
      ['GET', '/api/v1/admin/session'],
      ['POST', '/api/v1/staff/auth/login'],
      ['GET', '/api/v1/admin/rules?marjaId=sistani'],
    ] as const) {
      const response = await request.fetch(`${API}${path}`, {
        method,
        ...(method === 'POST'
          ? { data: { username: SCHOLAR.username, password: SCHOLAR.password } }
          : {}),
      });
      expect(response.status(), path).toBe(403);
      expect(((await response.json()) as { code: string }).code).toBe('EDGE_SIGNATURE_REQUIRED');
    }
  });

  test('forged client-IP headers are refused too', async ({ request }) => {
    const response = await request.get(`${API}/api/v1/admin/session`, {
      headers: {
        'x-khums-client-ip': '203.0.113.5',
        'x-khums-client-ip-at': String(Date.now()),
        'x-khums-client-ip-sig': 'A'.repeat(43),
      },
    });
    expect(response.status()).toBe(403);
  });
});
