import { expect, test, type Page } from '@playwright/test';

import { listMarjaCatalogue } from '@khums/core';
import type { Workflow } from '@khums/shared-types';

import { CONTENT } from '../src/content';
import { LOCALES, type Locale } from '../src/i18n/config';

/** Unsaved financial data protection. Values are arbitrary test data with no religious meaning. */

const found = listMarjaCatalogue().find((e) => e.id === 'sistani');
if (found === undefined) throw new Error('catalogue entry missing');
const SISTANI = found;

const label = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*?$`);

function setup(page: Page, locale: Locale) {
  const o = CONTENT.onboarding[locale];
  const t = CONTENT.facts[locale];
  const u = t.unsaved;
  const main = page.getByRole('main');
  const form = () =>
    main.locator('form').filter({ has: page.getByRole('button', { name: t.form.cancel }) });
  const items = () =>
    main.getByRole('listitem').filter({ has: page.getByRole('button', { name: t.item.edit }) });
  const dialog = (title: string) => page.getByRole('dialog', { name: title });

  async function toDetails(workflow: Workflow) {
    await page.goto(`/${locale}/start/marja`);
    await page.getByRole('radio', { name: SISTANI.name[locale], exact: true }).check();
    await page.getByRole('button', { name: o.marja.continue }).click();
    await page.getByRole('button', { name: o.review.continue }).click();
    await page.getByRole('radio', { name: o.assessment.types[workflow].title }).check();
    await page.getByRole('button', { name: o.assessment.continue }).click();
    await page.getByRole('button', { name: o.summary.continue }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.title);
    await main.getByLabel(label(t.frame.currency.label)).selectOption('USD');
    if (workflow === 'annual') {
      await main.getByLabel(label(t.frame.periodStart)).fill('2025-07-01');
      await main.getByLabel(label(t.frame.periodEnd)).fill('2026-06-30');
    } else {
      await main.getByLabel(label(t.frame.assessmentDate.label)).fill('2026-06-30');
    }
  }

  async function openAddWithKind() {
    await main.getByRole('button', { name: t.actions.add }).click();
    await form().getByRole('radio', { name: t.kinds.BALANCE.label }).check();
  }

  async function addFact(amount = '150') {
    await openAddWithKind();
    await form()
      .getByLabel(label(t.form.subtype.label))
      .selectOption({ label: t.subtypes.BALANCE.CASH });
    await form().getByRole('textbox', { name: t.form.amount.label, exact: true }).fill(amount);
    await form().getByRole('button', { name: t.form.save }).click();
  }

  return { o, t, u, main, form, items, dialog, toDetails, openAddWithKind, addFact };
}

test.describe('unsaved financial data (en)', () => {
  test('1. a new entry being typed: Cancel asks first; Escape keeps it; keyboard confirm discards', async ({
    page,
  }) => {
    const h = setup(page, 'en');
    await h.toDetails('first-time');

    // No changes: no warning.
    await h.main.getByRole('button', { name: h.t.actions.add }).click();
    await h.form().getByRole('button', { name: h.t.form.cancel }).click();
    await expect(h.dialog(h.u.discardEntry.title)).toHaveCount(0);
    await expect(h.form()).toHaveCount(0);

    await h.openAddWithKind();
    const cancel = h.form().getByRole('button', { name: h.t.form.cancel });
    await cancel.click();
    const dialog = h.dialog(h.u.discardEntry.title);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription(h.u.discardEntry.body);
    // The safe option has focus; Escape keeps the entry and returns focus.
    await expect(dialog.getByRole('button', { name: h.u.discardEntry.cancel })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(h.form().getByRole('radio', { name: h.t.kinds.BALANCE.label })).toBeChecked();
    await expect(cancel).toBeFocused();

    // Keyboard only: open again, move to "Discard entry" and confirm.
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: h.u.discardEntry.confirm })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(h.form()).toHaveCount(0);
    await expect(h.main.getByRole('button', { name: h.t.actions.add })).toBeFocused();
    await expect(h.items()).toHaveCount(0);
  });

  test('2. changes to a saved entry: Cancel and Back ask first; unchanged edits do not', async ({
    page,
  }) => {
    const h = setup(page, 'en');
    await h.toDetails('first-time');
    await h.addFact('150');

    // Edit without changing anything: no warning on Back.
    await h.items().first().getByRole('button', { name: h.t.item.edit }).click();
    const amount = h.form().getByRole('textbox', { name: h.t.form.amount.label, exact: true });
    await amount.fill('999');
    await amount.fill('150'); // back to the saved value: not dirty
    await h.main.getByRole('button', { name: h.t.actions.back }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.o.summary.title);
    await page.getByRole('button', { name: h.o.summary.continue }).click();

    await h.items().first().getByRole('button', { name: h.t.item.edit }).click();
    await amount.fill('999');
    // Back to setup with unsaved changes.
    await h.main.getByRole('button', { name: h.t.actions.back }).click();
    const back = h.dialog(h.u.backWithDraft.title);
    await expect(back).toBeVisible();
    await back.getByRole('button', { name: h.u.backWithDraft.cancel }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.t.title);
    await expect(amount).toHaveValue('999');

    // Cancel discards the changes; the saved entry is unchanged.
    await h.form().getByRole('button', { name: h.t.form.cancel }).click();
    const discard = h.dialog(h.u.discardChanges.title);
    await discard.getByRole('button', { name: h.u.discardChanges.confirm }).click();
    await expect(h.items().first()).toContainText('$150.00');

    // Confirming Back discards the draft but keeps saved entries.
    await h.items().first().getByRole('button', { name: h.t.item.edit }).click();
    await amount.fill('777');
    await h.main.getByRole('button', { name: h.t.actions.back }).click();
    await back.getByRole('button', { name: h.u.backWithDraft.confirm }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.o.summary.title);
    await page.getByRole('button', { name: h.o.summary.continue }).click();
    await expect(h.items()).toHaveCount(1);
    await expect(h.items().first()).toContainText('$150.00');
  });

  test('3. changing the assessment type asks before discarding saved entries', async ({ page }) => {
    const h = setup(page, 'en');
    await h.toDetails('annual');
    await h.addFact('150');
    await h.main.getByRole('button', { name: h.t.actions.back }).click();
    await page.getByRole('button', { name: h.o.summary.changeAssessment }).click();

    const continueButton = page.getByRole('button', { name: h.o.assessment.continue });
    await page.getByRole('radio', { name: h.o.assessment.types['first-time'].title }).check();
    await continueButton.click();
    const dialog = h.dialog(h.u.changeType.title);
    await expect(dialog).toContainText(h.o.assessment.types.annual.title);
    await expect(dialog).toContainText('(1)');
    await dialog.getByRole('button', { name: h.u.changeType.cancel }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.o.assessment.title);

    // Same type again: no warning, entries kept.
    await page.getByRole('radio', { name: h.o.assessment.types.annual.title }).check();
    await continueButton.click();
    await page.getByRole('button', { name: h.o.summary.continue }).click();
    await expect(h.items()).toHaveCount(1);

    // A different type, confirmed: entries discarded.
    await h.main.getByRole('button', { name: h.t.actions.back }).click();
    await page.getByRole('button', { name: h.o.summary.changeAssessment }).click();
    await page.getByRole('radio', { name: h.o.assessment.types['missed-year'].title }).check();
    await continueButton.click();
    await dialog.getByRole('button', { name: h.u.changeType.confirm }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.o.summary.title);
    await page.getByRole('button', { name: h.o.summary.continue }).click();
    await expect(h.main).toContainText(h.t.overview.empty.title);
  });

  test('restarting or leaving via in-app links asks first; nothing to lose means no prompt', async ({
    page,
  }) => {
    const h = setup(page, 'en');
    await h.toDetails('first-time');
    const home = page.getByRole('banner').getByRole('link').first();

    // Unsaved draft only (no saved entries) is also protected.
    await h.openAddWithKind();
    await home.click();
    const leave = h.dialog(h.u.leave.title);
    await expect(leave).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/en\/start\/marja$/);
    await h.form().getByRole('button', { name: h.t.form.cancel }).click();
    await h
      .dialog(h.u.discardEntry.title)
      .getByRole('button', { name: h.u.discardEntry.confirm })
      .click();

    await h.addFact('150');
    // Language switch would also restart: asked, kept.
    await page.getByRole('banner').locator('a[href="/ur/start/marja"]').first().click();
    await expect(leave).toBeVisible();
    await leave.getByRole('button', { name: h.u.leave.cancel }).click();
    await expect(h.items()).toHaveCount(1);

    // Confirmed: leaves (full navigation), data gone.
    await home.click();
    await leave.getByRole('button', { name: h.u.leave.confirm }).click();
    await expect(page).toHaveURL(/\/en$/);

    // Nothing unsaved: links navigate without a prompt.
    await page.goto('/en/start/marja');
    await page.getByRole('banner').getByRole('link').first().click();
    await expect(page).toHaveURL(/\/en$/);
  });

  test('the browser prompts before reload only when there is something to lose', async ({
    page,
  }) => {
    const h = setup(page, 'en');
    // Nothing to lose: the reload completes without any prompt.
    await h.toDetails('first-time');
    await page.reload({ timeout: 10_000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.o.marja.title);

    await h.toDetails('first-time');
    await h.addFact('150');
    const prompt = page.waitForEvent('dialog');
    void page.reload().catch(() => undefined);
    const dialog = await prompt;
    expect(dialog.type()).toBe('beforeunload');
    // Choosing to stay keeps the page and the entry.
    await dialog.dismiss();
    await expect(h.items()).toHaveCount(1);
  });
});

for (const locale of LOCALES.filter((l) => l !== 'en')) {
  test(`unsaved changes are confirmed in ${locale} (RTL)`, async ({ page }) => {
    const h = setup(page, locale);
    await h.toDetails('first-time');
    await h.openAddWithKind();
    await h.form().getByRole('button', { name: h.t.form.cancel }).click();
    const dialog = h.dialog(h.u.discardEntry.title);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(h.u.discardEntry.body);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await dialog.getByRole('button', { name: h.u.discardEntry.cancel }).click();
    await expect(h.form()).toHaveCount(1);
  });
}
