import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { CONTENT } from '../src/content';
import { LOCALES } from '../src/i18n/config';

const PAGES = [
  '',
  '/start',
  '/start/marja',
  '/history',
  '/methodology',
  '/privacy',
  '/terms',
  '/disclaimer',
] as const;

/** Only the desktop project shows the full header navigation (≥ lg); tablet and phone use the menu. */
const hasDesktopNav = (projectName: string) => projectName === 'desktop';

async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, 'page must not scroll horizontally').toBeLessThanOrEqual(innerWidth);
}

for (const locale of LOCALES) {
  const site = CONTENT.site[locale];
  for (const path of PAGES) {
    const route = `/${locale}${path}`;
    test.describe(`shell on ${route}`, () => {
      test('has landmarks, one h1, the preview notice and no horizontal overflow', async ({
        page,
      }) => {
        const response = await page.goto(route);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole('banner')).toBeVisible();
        await expect(page.getByRole('main')).toBeVisible();
        await expect(page.getByRole('contentinfo')).toBeVisible();
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(page.getByRole('note', { name: site.previewNotice.ariaLabel })).toContainText(
          site.previewNotice.text,
        );
        await expectNoHorizontalOverflow(page);
      });

      test('has no detectable WCAG 2.x A/AA violations', async ({ page }) => {
        await page.goto(route);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
      });
    });
  }
}

test.describe('navigation', () => {
  const site = CONTENT.site.en;

  test('desktop shows the main navigation with the current page marked', async ({
    page,
  }, testInfo) => {
    test.skip(!hasDesktopNav(testInfo.project.name), 'desktop only');
    await page.goto('/en/history');
    const nav = page.getByRole('navigation', { name: site.navigation.mainLabel });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: site.links.history })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('button', { name: site.navigation.menuOpen })).toBeHidden();
    await expect(
      page.getByRole('banner').getByRole('link', { name: site.links.start }),
    ).toBeVisible();
    await nav.getByRole('link', { name: site.links.howItWorks }).click();
    await expect(page).toHaveURL(/\/en#how-it-works$/);
    await expect(
      page.getByRole('heading', { level: 2, name: CONTENT.landing.en.howItWorks.title }),
    ).toBeInViewport();
  });

  test('tablet and phone use an accessible disclosure menu', async ({ page }, testInfo) => {
    test.skip(hasDesktopNav(testInfo.project.name), 'tablet/phone only');
    await page.goto('/en');
    const toggle = page.getByRole('button', { name: site.navigation.menuOpen });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const header = page.getByRole('banner');
    if (testInfo.project.name === 'mobile') {
      // On phones the primary action lives in the menu, keeping the header on one line.
      await expect(header.getByRole('link', { name: site.links.start })).toBeHidden();
    }
    const brandBox = await header.getByRole('link', { name: site.name }).boundingBox();
    expect(brandBox?.height ?? 0).toBeLessThanOrEqual(40);
    await expect(page.getByRole('navigation', { name: site.navigation.mainLabel })).toBeHidden();

    await toggle.click();
    await expect(page.getByRole('button', { name: site.navigation.menuClose })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const nav = page.getByRole('navigation', { name: site.navigation.mainLabel });
    await expect(nav.getByRole('link', { name: site.links.history })).toBeVisible();
    await expect(nav.getByRole('link', { name: site.links.start })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await expect(page.getByRole('button', { name: site.navigation.menuOpen })).toBeFocused();

    await page.getByRole('button', { name: site.navigation.menuOpen }).click();
    await nav.getByRole('link', { name: site.links.history }).click();
    await expect(page).toHaveURL(/\/en\/history$/);
    await expect(page.getByRole('navigation', { name: site.navigation.mainLabel })).toBeHidden();
  });

  test('footer links reach the legal pages', async ({ page }) => {
    await page.goto('/en');
    const footer = page.getByRole('navigation', { name: site.navigation.footerLabel });
    await footer.getByRole('link', { name: site.links.disclaimer }).click();
    await expect(page).toHaveURL(/\/en\/disclaimer$/);
    await expect(page.getByRole('note', { name: site.mockNotice.ariaLabel })).toContainText(
      'MOCK CALCULATION — NOT RELIGIOUS GUIDANCE — NOT FOR PRODUCTION',
    );
  });
});

test.describe('error states', () => {
  for (const locale of LOCALES) {
    test(`unknown routes return a localized 404 (${locale})`, async ({ page }) => {
      const response = await page.goto(`/${locale}/this-page-does-not-exist`);
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole('heading', { level: 2, name: CONTENT.site[locale].notFound.title }),
      ).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
    });
  }

  test('the internal design-system preview is not available in production builds', async ({
    page,
  }) => {
    const response = await page.goto('/en/design-system');
    expect(response?.status()).toBe(404);
  });
});
