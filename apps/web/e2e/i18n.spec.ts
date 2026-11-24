import { expect, test } from '@playwright/test';

import { CONTENT } from '../src/content';
import { LOCALE_COOKIE } from '../src/i18n/config';

test.describe('locale resolution for unprefixed URLs', () => {
  test('defaults to English', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ locale: 'en-US', baseURL: baseURL ?? '' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/en$/);
    await context.close();
  });

  test('follows an Urdu browser language', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ locale: 'ur-PK', baseURL: baseURL ?? '' });
    const page = await context.newPage();
    await page.goto('/history');
    await expect(page).toHaveURL(/\/ur\/history$/);
    await context.close();
  });

  test('an explicit language choice (cookie) wins over the browser language', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ locale: 'en-US', baseURL: baseURL ?? '' });
    await context.addCookies([{ name: LOCALE_COOKIE, value: 'ur', url: baseURL ?? '' }]);
    const page = await context.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/ur$/);
    await context.close();
  });

  test('an unsupported first segment is treated as a path in the preferred locale (404)', async ({
    page,
  }) => {
    const response = await page.goto('/fr/history');
    expect(page.url()).toMatch(/\/en\/fr\/history$/);
    expect(response?.status()).toBe(404);
  });
});

test.describe('document language and direction', () => {
  test('English is lang="en" dir="ltr"', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('Urdu is lang="ur" dir="rtl"', async ({ page }) => {
    await page.goto('/ur/privacy');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    // English-only legal body is marked as an English, left-to-right island.
    await expect(page.getByRole('main').locator('[lang="en"][dir="ltr"]')).toHaveCount(1);
  });
});

test.describe('language switching and preservation', () => {
  test('switching keeps the current page, updates the document and remembers the choice', async ({
    page,
    context,
  }) => {
    await page.goto('/en/history');
    const switcher = page.getByRole('navigation', { name: CONTENT.site.en.language.label });
    await expect(switcher.locator('[aria-current="true"]')).toHaveText('English');
    await switcher.getByRole('link', { name: 'اردو' }).click();

    await expect(page).toHaveURL(/\/ur\/history$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(CONTENT.history.ur.title);
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === LOCALE_COOKIE)?.value).toBe('ur');

    await page.goto('/');
    await expect(page).toHaveURL(/\/ur$/);

    await page
      .getByRole('navigation', { name: CONTENT.site.ur.language.label })
      .getByRole('link', { name: 'English' })
      .click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('every internal link on an Urdu page stays in Urdu', async ({ page }) => {
    await page.goto('/ur');
    const hrefs = await page
      .locator('a[href^="/"]')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
    expect(hrefs.length).toBeGreaterThan(10);
    const outsideUrdu = hrefs.filter(
      (href) => !/^\/ur([/#?]|$)/.test(href) && !href.startsWith('/en'),
    );
    expect(outsideUrdu).toEqual([]);
    // The only English-locale link is the language switcher's.
    expect(hrefs.filter((href) => href.startsWith('/en'))).toEqual(['/en']);
  });

  test('navigating within Urdu keeps the locale', async ({ page }) => {
    await page.goto('/ur');
    const footer = page.getByRole('navigation', { name: CONTENT.site.ur.navigation.footerLabel });
    await footer.getByRole('link', { name: CONTENT.site.ur.links.terms }).click();
    await expect(page).toHaveURL(/\/ur\/terms$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
  });
});

test.describe('RTL layout', () => {
  test('Urdu mirrors the layout: brand on the right, arrows flipped, no overflow', async ({
    page,
  }) => {
    await page.goto('/ur');
    const viewport = page.viewportSize();
    const brand = await page
      .getByRole('banner')
      .getByRole('link', { name: CONTENT.site.ur.name })
      .boundingBox();
    expect(brand && viewport ? brand.x + brand.width / 2 : 0).toBeGreaterThan(
      (viewport?.width ?? 0) / 2,
    );

    const arrow = page
      .getByRole('region', { name: CONTENT.landing.ur.hero.title })
      .getByRole('link', { name: CONTENT.landing.ur.hero.primaryCta })
      .locator('svg');
    // Tailwind v4 implements `rtl:-scale-x-100` with the CSS `scale` property.
    const scale = await arrow.evaluate((el) => getComputedStyle(el).scale);
    expect(scale).toMatch(/^-1/);

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });

  test('English keeps the brand on the left and arrows unflipped', async ({ page }) => {
    await page.goto('/en');
    const viewport = page.viewportSize();
    const brand = await page
      .getByRole('banner')
      .getByRole('link', { name: CONTENT.site.en.name })
      .boundingBox();
    expect(brand ? brand.x + brand.width / 2 : 0).toBeLessThan((viewport?.width ?? 0) / 2);
    const arrow = page
      .getByRole('region', { name: CONTENT.landing.en.hero.title })
      .getByRole('link', { name: CONTENT.landing.en.hero.primaryCta })
      .locator('svg');
    expect(await arrow.evaluate((el) => getComputedStyle(el).scale)).toBe('none');
  });

  test('Urdu text uses the Urdu font stack and no letter-spacing', async ({ page }) => {
    await page.goto('/ur');
    const h1 = page.getByRole('heading', { level: 1 });
    const style = await h1.evaluate((el) => {
      const computed = getComputedStyle(el);
      return { font: computed.fontFamily, spacing: computed.letterSpacing };
    });
    expect(style.font).toContain('Nastaliq');
    expect(['normal', '0px']).toContain(style.spacing);
  });
});
