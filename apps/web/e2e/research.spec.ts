import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { CONTENT } from '../src/content';
import { ADMIN, AXE_TAGS, label, REVIEW, signIn, staffFetch } from './support/staff-session';

/**
 * Scholar research workspace (M5.3.7) against the in-memory API. TEST ONLY account scoped to
 * `sistani` (research is created only for the two research Marjas); every record is SYNTHETIC
 * placeholder text, never research content.
 */

const r = CONTENT.research.en;
const c = CONTENT.console.en;
const RESEARCHER = {
  username: 'e2e-research',
  password: 'e2e research scholar test passphrase 0003',
};

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function choose(page: Page, fieldLabel: string, text: string) {
  const select = page.getByLabel(label(fieldLabel));
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  await select.selectOption(value ?? '');
}

async function verify(page: Page) {
  await page.getByRole('button', { name: r.actions.VERIFIED }).click();
  await expect(page.getByRole('main').getByText(r.states.VERIFIED).first()).toBeVisible();
}

test.describe('scholar research workspace', () => {
  test('a governing scholar records a source, a passage and a finding; the dashboard shows progress', async ({
    page,
  }, testInfo) => {
    const tag = `${testInfo.project.name}-${String(Date.now())}`;
    const question = testInfo.project.name.includes('tablet') ? 'EXP-01' : 'INC-01';
    await signIn(page, RESEARCHER);
    await page.goto(`${REVIEW}/en/admin/research`);
    const main = page.getByRole('main');
    await expect(main.getByText(r.notice)).toBeVisible();
    await expect(main.getByText(r.marja.names.sistani).first()).toBeVisible();
    await expect(main.getByText('INC-01', { exact: true })).toBeVisible();
    await expect(main.getByText('CTQ-08', { exact: true })).toBeVisible();
    await axe(page);

    // Source → verify.
    await page.goto(`${REVIEW}/en/admin/research/sources?marja=sistani`);
    await page.getByLabel(label(r.fields.titleOriginal)).fill(`TEST synthetic source ${tag}`);
    await page.getByLabel(label(r.fields.originalLanguage)).fill('ar');
    await page.getByLabel(label(r.fields.sourceTier)).fill('1');
    await axe(page);
    await page.getByRole('button', { name: r.list.create }).click();
    await expect(page).toHaveURL(/\/en\/admin\/research\/sources\/[0-9a-f-]{36}\?marja=sistani$/);
    await expect(main.getByRole('heading', { level: 2 })).toHaveText(/^S-sistani-/);
    await axe(page);
    await verify(page);

    // Passage of that verified source → verify.
    await page.goto(`${REVIEW}/en/admin/research/passages?marja=sistani`);
    await choose(page, r.fields.source, `TEST synthetic source ${tag}`);
    await page.getByLabel(label(`${r.fields.page} ${r.fields.optional}`)).fill('1');
    await page.getByLabel(label(`${r.fields.paragraph} ${r.fields.optional}`)).fill('2');
    await page.getByLabel(label(r.fields.originalLanguage)).fill('ar');
    await page.getByLabel(label(r.fields.text)).fill(`TEST synthetic excerpt ${tag}`);
    await page.getByRole('button', { name: r.list.create }).click();
    await expect(page).toHaveURL(/\/en\/admin\/research\/passages\/[0-9a-f-]{36}/);
    const passageRef = (await main.getByRole('heading', { level: 2 }).textContent()) ?? '';
    expect(passageRef).toMatch(/^P-sistani-/);
    await verify(page);

    // Finding for one catalogue question, citing the verified passage.
    await page.goto(`${REVIEW}/en/admin/research/findings?marja=sistani`);
    await page.getByLabel(label(r.fields.question)).selectOption(question);
    await page.getByRole('checkbox', { name: new RegExp(passageRef) }).check();
    await page.getByLabel(label(r.fields.writtenIn)).fill('en');
    await page.getByLabel(label(r.fields.conclusion)).fill(`TEST synthetic conclusion ${tag}`);
    await page.getByLabel(label(r.fields.explanation)).fill('TEST synthetic explanation');
    await page.getByRole('button', { name: r.list.create }).click();
    await expect(page).toHaveURL(/\/en\/admin\/research\/findings\/[0-9a-f-]{36}/);
    await expect(main.getByText(question, { exact: true })).toBeVisible();
    await expect(main.getByRole('table')).toContainText('CREATED');

    // The dashboard counts the question as in progress; history shows the scholar's actions.
    await page.goto(`${REVIEW}/en/admin/research?marja=sistani`);
    const row = main.getByRole('listitem').filter({ hasText: question });
    await expect(
      row.getByText(r.states.DRAFT).or(row.getByText(r.states.VERIFIED)).first(),
    ).toBeVisible();
    await page.goto(`${REVIEW}/en/admin/research/history?marja=sistani`);
    await expect(main.getByRole('table')).toContainText('VERIFIED');
    await axe(page);
  });

  test('the workspace reads right to left in Urdu and stays accessible', async ({ page }) => {
    const u = CONTENT.research.ur;
    await signIn(page, RESEARCHER);
    await page.goto(`${REVIEW}/ur/admin/research`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('main').getByText(u.notice)).toBeVisible();
    await axe(page);
    await page.goto(`${REVIEW}/ur/admin/research/findings?marja=sistani`);
    await expect(page.getByRole('main').getByText(u.list.createHeading)).toBeVisible();
    await axe(page);
  });

  test('Marja scope and permissions are enforced by the API', async ({ page }) => {
    await signIn(page, RESEARCHER);
    // Another Marja (decision 64): readable, never writable. Formerly nothing was listed.
    const list = await staffFetch(page, 'GET', '/admin/research/sources?marjaId=khamenei');
    expect(list.status).toBe(200);
    for (const item of (list.json as { items: { marjaId: string }[] }).items) {
      expect(item.marjaId).toBe('khamenei');
    }
    const create = await staffFetch(page, 'POST', '/admin/research/sources', {
      marjaId: 'khamenei',
      payload: {},
      references: [],
      aiInvolvement: [],
    });
    expect(create.status).toBe(403);
    const marjas = await staffFetch(page, 'GET', '/admin/research/marjas');
    const listed = (marjas.json as { marjas: { marjaId: string; permissions: string[] }[] }).marjas;
    expect(listed.map((m) => m.marjaId)).toEqual(['sistani', 'khamenei']);
    // The other Marja is read-only: research.read and nothing else.
    expect(listed[1]?.permissions).toEqual(['research.read']);
    expect(listed[0]?.permissions).toContain('research.finding.edit');
  });

  test('SUPER_ADMIN has full research access (decision 64); anonymous visitors are sent to sign-in', async ({
    page,
    context,
  }) => {
    await signIn(page, ADMIN);
    await page.goto(`${REVIEW}/en/admin/research`);
    // Formerly "no permission"; the owner decision of 2026-11-23 gives SUPER_ADMIN every Marja.
    await expect(page.getByRole('main').getByText(c.common.noPermission)).toHaveCount(0);
    const marjas = (
      (await staffFetch(page, 'GET', '/admin/research/marjas')).json as {
        marjas: { marjaId: string; permissions: string[] }[];
      }
    ).marjas;
    expect(marjas.map((m) => m.marjaId)).toEqual(['sistani', 'khamenei']);
    for (const m of marjas) expect(m.permissions).toHaveLength(12);
    expect((await staffFetch(page, 'GET', '/admin/research/sources')).status).toBe(200);
    await context.clearCookies();
    await page.goto(`${REVIEW}/en/admin/research`);
    await expect(page).toHaveURL(/\/en\/admin\/sign-in$/);
  });
});
