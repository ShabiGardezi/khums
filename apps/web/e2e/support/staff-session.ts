import { expect, type Page } from '@playwright/test';

import { CONTENT } from '../../src/content';

/** TEST ONLY e2e staff helpers (M4.5.2/M4.6.5): fixed test accounts from e2e-staff.json. */

export const REVIEW = 'http://localhost:3101';
export const ADMIN = { username: 'e2e-admin', password: 'e2e administrator test passphrase 0001' };
/** SCHOLAR on the TEST Marja (decision 64; formerly a GOVERNING_SCHOLAR fixture). */
export const SCHOLAR = {
  username: 'e2e-scholar',
  password: 'e2e governing scholar test passphrase 0002',
};
/** SCHOLAR on ANOTHER TEST Marja: tests the TEST pack read-only (decision 64). */
export const OTHER_SCHOLAR = {
  username: 'e2e-scholar-other',
  password: 'e2e other marja scholar test passphrase 0005',
};
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
export const label = (text: string) =>
  new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*?$`);

export async function signIn(
  page: Page,
  account: { username: string; password: string },
  base = REVIEW,
) {
  const a = CONTENT.admin.en;
  await page.goto(`${base}/en/admin/sign-in`);
  await page.getByLabel(label(a.signInPage.username)).fill(account.username);
  await page.getByLabel(label(a.signInPage.password)).fill(account.password);
  await page.getByRole('button', { name: a.signInPage.submit }).click();
  await expect(page).toHaveURL(/\/en\/admin$/);
}

/** A staff API call made BY THE BROWSER (it sets Origin and Sec-Fetch-Site; CSRF from cookie). */
export async function staffFetch(
  page: Page,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const token =
        document.cookie
          .split(';')
          .map((c) => c.trim().split('='))
          .find(([name]) => name === '__Host-khums_csrf')?.[1] ?? '';
      const response = await fetch(`/api/v1${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-csrf-token': token },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      return { status: response.status, json: text === '' ? null : (JSON.parse(text) as unknown) };
    },
    { method, path, body },
  );
}
