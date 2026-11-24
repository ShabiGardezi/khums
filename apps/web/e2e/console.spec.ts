import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { CONTENT } from '../src/content';
import { ADMIN, AXE_TAGS, label, REVIEW, signIn, staffFetch } from './support/staff-session';

/**
 * Staff console (M4.6.5; decision 79–80) through the real rewrite and API: staff, roles and Marja
 * scopes, governance policies (two administrators) and the audit log. TEST accounts only. Each
 * viewport project uses its own usernames (one shared API).
 */

const c = CONTENT.console.en;

test.describe('staff console', () => {
  test('an administrator creates a scholar, assigns two Marjas, changes them and removes the assignment', async ({
    page,
  }, testInfo) => {
    await signIn(page, ADMIN);
    const sections = page.getByRole('navigation', { name: c.overview.heading });
    await expect(sections.getByRole('link', { name: c.nav.staff })).toBeVisible();
    await expect(sections.getByRole('link', { name: c.nav.audit })).toBeVisible();
    // Decision 79: the console shows only the rule builder, staff and the audit log.
    await expect(sections.getByRole('link', { name: c.nav.rules })).toBeVisible();
    await expect(sections.getByRole('link', { name: 'Feedback' })).toHaveCount(0);
    await expect(sections.getByRole('link', { name: c.nav.research })).toHaveCount(0);

    await page.goto(`${REVIEW}/en/admin/staff`);
    const main = page.getByRole('main');
    const username = `e2e-staff-${testInfo.project.name}`;
    const create = main
      .locator('form')
      .filter({ has: page.getByRole('button', { name: c.staff.create.submit }) });
    await create.getByLabel(label(c.staff.create.username)).fill(username);
    await create.getByLabel(label(c.common.reason)).fill('TEST new scholar');
    await create.getByRole('button', { name: c.staff.create.submit }).click();
    await expect(main.getByText(c.staff.credential.body)).toBeVisible();
    await expect(main.getByText(username).first()).toBeVisible();

    const card = () => page.getByRole('main').locator('li').filter({ hasText: username }).first();
    const marja = (form: ReturnType<typeof card>, id: string) =>
      form.locator(`input[name="marja"][value="${id}"]`);
    await card().locator('summary').click();
    // Only the two grantable roles are offered.
    const grant = card()
      .locator('form')
      .filter({ has: page.getByRole('button', { name: c.staff.roles.grant }) });
    const roleSelect = grant.getByLabel(c.staff.roles.role);
    await expect(roleSelect.locator('option')).toHaveText([
      c.staff.roles.names.SUPER_ADMIN,
      c.staff.roles.names.SCHOLAR,
    ]);
    await expect(roleSelect).toHaveValue('SCHOLAR');
    // Assign two Marjas.
    await marja(grant, 'sistani').check();
    await marja(grant, 'khamenei').check();
    await grant.getByLabel(label(c.common.reason)).fill('TEST assign two Marjas');
    await grant.getByRole('button', { name: c.staff.roles.grant }).click();
    const assignment = () =>
      card()
        .locator('li')
        .filter({ hasText: c.staff.roles.names.SCHOLAR })
        .filter({ has: page.getByRole('button', { name: c.staff.roles.changeMarjas }) });
    await expect(assignment()).toHaveCount(1);
    await expect(marja(assignment(), 'sistani')).toBeChecked();
    await expect(marja(assignment(), 'khamenei')).toBeChecked();

    // Change the Marjas in one audited step (revoke + grant).
    await marja(assignment(), 'khamenei').uncheck();
    await assignment().getByLabel(label(c.common.reason)).first().fill('TEST change Marjas');
    await assignment().getByRole('button', { name: c.staff.roles.changeMarjas }).click();
    await expect(marja(assignment(), 'khamenei')).not.toBeChecked();
    await expect(marja(assignment(), 'sistani')).toBeChecked();
    const accounts = await staffFetch(page, 'GET', '/admin/staff/accounts');
    const account = (
      accounts.json as {
        accounts: {
          username: string;
          roles: { role: string; scope: { marjaIds: string[] } }[];
        }[];
      }
    ).accounts.find((a) => a.username === username);
    expect(account?.roles).toEqual([
      expect.objectContaining({ role: 'SCHOLAR', scope: { kind: 'MARJA', marjaIds: ['sistani'] } }),
    ]);
    const audit = await staffFetch(page, 'GET', '/admin/audit/events?limit=200');
    expect(JSON.stringify(audit.json)).toContain('staff.role.replaced');
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);

    // Remove the assignment.
    const revoke = assignment()
      .locator('form')
      .filter({ has: page.getByRole('button', { name: c.staff.roles.revoke }) });
    await revoke.getByLabel(label(c.common.reason)).fill('TEST remove assignment');
    await revoke.getByRole('button', { name: c.staff.roles.revoke }).click();
    await expect(card().getByText(c.staff.list.noRoles).first()).toBeVisible();
  });

  test('legacy roles are marked legacy and can be converted to Scholar', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`${REVIEW}/en/admin/staff`);
    // The fixture keeps one legacy GOVERNING_SCHOLAR account (e2e-research-kha) on purpose.
    const card = page
      .getByRole('main')
      .locator('li')
      .filter({ hasText: 'e2e-research-kha' })
      .first();
    await card.locator('summary').click();
    const legacy = card.locator('li').filter({ hasText: c.staff.roles.names.GOVERNING_SCHOLAR });
    await expect(legacy.getByText(c.staff.roles.legacy, { exact: true })).toBeVisible();
    await expect(legacy.getByText(c.staff.roles.legacyActsAsScholar)).toBeVisible();
    await expect(legacy.getByRole('button', { name: c.staff.roles.convert })).toBeVisible();
    await expect(legacy.getByRole('button', { name: c.staff.roles.revoke })).toBeVisible();
    // Not converted here: other journeys rely on this legacy account.
  });

  test('an administrator cannot administer their own account (refused with its code)', async ({
    page,
  }) => {
    await signIn(page, ADMIN);
    await page.goto(`${REVIEW}/en/admin/staff`);
    const card = page.getByRole('main').locator('li').filter({ hasText: ADMIN.username }).first();
    await card.locator('summary').click();
    const form = card
      .locator('form')
      .filter({ has: page.getByRole('button', { name: c.staff.actions.setStatus }) });
    await form.getByLabel(c.staff.actions.newStatus).selectOption('SUSPENDED');
    await form.getByLabel(label(c.common.reason)).fill('TEST self suspension');
    await form.getByRole('button', { name: c.staff.actions.setStatus }).click();
    // The evaluator refuses self-administration (NOT_SELF) before the domain rule; the API
    // reports authorization denials as ACCESS_DENIED without the reason.
    await expect(form).toContainText(c.common.errors.accessDenied);
    await expect(form).toContainText('ACCESS_DENIED');
  });

  test('a policy change needs a different administrator to confirm it', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`${REVIEW}/en/admin/policies`);
    const main = page.getByRole('main');
    const propose = main
      .locator('form')
      .filter({ has: page.getByRole('button', { name: c.policies.propose.submit }) });
    await propose.getByLabel(c.policies.propose.newPolicy).selectOption('INDEPENDENT_REVIEW_V1');
    await propose.getByLabel(label(c.common.reason)).fill('TEST second scholar');
    await propose.getByRole('button', { name: c.policies.propose.submit }).click();
    const confirm = main.getByRole('button', { name: c.policies.pending.confirm });
    await expect(confirm).toBeVisible();
    await confirm.click();
    await expect(main).toContainText(c.common.errors.refused);
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
  });

  test('the audit log shows a verified chain', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`${REVIEW}/en/admin/audit`);
    await expect(page.getByRole('main')).toContainText(c.audit.verified);
    await expect(page.getByRole('main').getByRole('table')).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
  });

  test('Urdu console pages are right to left', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`${REVIEW}/ur/admin/staff`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      CONTENT.console.ur.staff.title,
    );
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
  });
});
