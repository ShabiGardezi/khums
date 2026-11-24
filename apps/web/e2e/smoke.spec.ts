import { expect, test } from '@playwright/test';

test('home page renders the application shell', async ({ page }) => {
  await page.goto('/en');
  await expect(page).toHaveTitle(/Khums Platform/);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('skip link moves focus to main content', async ({ page }) => {
  await page.goto('/en');
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});
