import { expect, test } from '@playwright/test';

import { CONTENT } from '../src/content';
import { LOCALES } from '../src/i18n/config';

for (const locale of LOCALES) {
  const landing = CONTENT.landing[locale];
  const site = CONTENT.site[locale];
  const sections = [
    landing.howItWorks.title,
    landing.assessments.title,
    landing.marjaSupport.title,
    landing.privacy.title,
    landing.transparency.title,
    landing.faq.title,
  ];

  test.describe(`landing page (${locale})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/${locale}`);
    });

    test('presents the value proposition and every section as labelled regions', async ({
      page,
    }) => {
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(landing.hero.title);
      for (const title of sections) {
        await expect(page.getByRole('region', { name: title })).toBeVisible();
      }
      await expect(page).toHaveTitle(landing.metadata.title);
    });

    test('primary and closing CTAs lead to the assessment start in the same locale', async ({
      page,
    }) => {
      await page
        .getByRole('region', { name: landing.hero.title })
        .getByRole('link', { name: landing.hero.primaryCta })
        .click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/start$`));
      await page.goto(`/${locale}`);
      await page
        .getByRole('region', { name: landing.finalCta.title })
        .getByRole('link', { name: landing.finalCta.cta })
        .click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/start$`));
    });

    test('secondary CTA scrolls to "How it works"', async ({ page }) => {
      await page.getByRole('link', { name: landing.hero.secondaryCta }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}#how-it-works$`));
      await expect(
        page.getByRole('heading', { level: 2, name: landing.howItWorks.title }),
      ).toBeInViewport();
    });

    test('lists the three assessment types and the four steps', async ({ page }) => {
      const assessments = page.getByRole('region', { name: landing.assessments.title });
      for (const item of landing.assessments.items) {
        await expect(
          assessments.getByRole('heading', { level: 3, name: item.title }),
        ).toBeVisible();
      }
      await expect(
        page.getByRole('region', { name: landing.howItWorks.title }).getByRole('listitem'),
      ).toHaveCount(4);
    });

    test('keeps the honest status and independence statements', async ({ page }) => {
      const marja = page.getByRole('region', { name: landing.marjaSupport.title });
      await expect(marja).toContainText(landing.marjaSupport.status.body);
      await expect(marja).toContainText(landing.marjaSupport.independence);
    });

    test('labels the illustration as mock (canonical English always present) and shows no figures', async ({
      page,
    }) => {
      const figure = page.getByRole('region', { name: landing.hero.title }).locator('figure');
      await expect(figure).toContainText(
        'MOCK CALCULATION — NOT RELIGIOUS GUIDANCE — NOT FOR PRODUCTION',
      );
      await expect(figure).toContainText(site.mockNotice.label);
      await expect(figure).not.toContainText(/\d+\.\d{2}/);
    });

    test('FAQ items open and close with the keyboard', async ({ page }) => {
      const faq = page.getByRole('region', { name: landing.faq.title });
      const answer = faq.getByText(landing.faq.items[0]!.answer[0]!);
      await expect(answer).toBeHidden();
      await faq.locator('summary').first().focus();
      await page.keyboard.press('Enter');
      await expect(answer).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(answer).toBeHidden();
      await expect(faq.locator('details')).toHaveCount(landing.faq.items.length);
    });

    test('shows the disclaimer and grouped footer', async ({ page }) => {
      const disclaimer = page.getByRole('region', { name: landing.disclaimer.title });
      await expect(disclaimer).toContainText(landing.disclaimer.points[0]!);
      const footer = page.getByRole('navigation', { name: site.navigation.footerLabel });
      for (const group of Object.values(site.footer.groups)) {
        await expect(footer.getByRole('heading', { level: 2, name: group })).toBeVisible();
      }
      await disclaimer.getByRole('link', { name: landing.disclaimer.linkLabel }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/disclaimer$`));
    });
  });
}
