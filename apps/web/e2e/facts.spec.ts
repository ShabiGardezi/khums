import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { listMarjaCatalogue } from '@khums/core';
import type { Workflow } from '@khums/shared-types';

import { CONTENT } from '../src/content';
import { LOCALES, type Locale } from '../src/i18n/config';

/**
 * Financial fact entry (M4.3.2). Values below are arbitrary test data with no religious meaning.
 */

const found = listMarjaCatalogue().find((e) => e.id === 'sistani');
if (found === undefined) throw new Error('catalogue entry missing');
const SISTANI = found;

/** Values typed in these tests; none may ever appear in a URL, storage or cookie. */
const SECRETS = ['1200.50', '28000', '30.125', '4500', '150', '987', 'Private savings note'];

/** Words that would classify a fact religiously or imply a calculation. */
const FORBIDDEN = /liable|deductible|exempt|eligible|khums due|amount due|total|\d+(\.\d+)?\s*%/i;

function recordUrls(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  page.on('framenavigated', (f) => urls.push(f.url()));
  return urls;
}

function expectNoSecretsIn(values: readonly string[]) {
  for (const value of values) {
    for (const secret of SECRETS)
      expect(value, 'must not contain an entered value').not.toContain(secret);
  }
}

async function expectNothingStored(page: Page) {
  const storage = await page.evaluate(() => ({
    local: Object.keys(window.localStorage).length,
    session: Object.keys(window.sessionStorage).length,
  }));
  expect(storage).toEqual({ local: 0, session: 0 });
  const cookies = await page.context().cookies();
  expectNoSecretsIn(cookies.map((c) => `${c.name}=${c.value}`));
}

function helpers(page: Page, locale: Locale) {
  const o = CONTENT.onboarding[locale];
  const t = CONTENT.facts[locale];
  const main = page.getByRole('main');

  async function toDetails(workflow: Workflow) {
    await page.goto(`/${locale}/start/marja`);
    await page.getByRole('radio', { name: SISTANI.name[locale], exact: true }).check();
    await page.getByRole('button', { name: o.marja.continue }).click();
    await page.getByRole('button', { name: o.review.continue }).click();
    await page.getByRole('radio', { name: o.assessment.types[workflow].title }).check();
    await page.getByRole('button', { name: o.assessment.continue }).click();
    await page.getByRole('button', { name: o.summary.continue }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.title);
  }

  const preferredCurrency = () => main.getByLabel(label(t.frame.currency.label));

  async function annualFrame(currency = 'USD') {
    await preferredCurrency().selectOption(currency);
    await main.getByLabel(label(t.frame.periodStart)).fill('2025-07-01');
    await main.getByLabel(label(t.frame.periodEnd)).fill('2026-06-30');
  }

  const form = () =>
    main.locator('form').filter({ has: page.getByRole('button', { name: t.form.cancel }) });

  async function openAdd() {
    await main.getByRole('button', { name: t.actions.add }).click();
    await expect(form().getByRole('heading', { name: t.form.addTitle })).toBeFocused();
  }

  async function chooseKind(kind: keyof typeof t.kinds) {
    await form().getByRole('radio', { name: t.kinds[kind].label }).check();
  }

  const amountBox = (name: string) => form().getByRole('textbox', { name, exact: true });

  async function setDate(group: string, status: string, date?: string) {
    const fieldset = form().getByRole('group', { name: group, exact: true });
    await fieldset.getByLabel(label(t.form.dates.statusLabel)).selectOption(status);
    if (date !== undefined) await fieldset.getByLabel(label(t.form.dates.dateLabel)).fill(date);
  }

  async function save() {
    await form().getByRole('button', { name: t.form.save }).click();
  }

  const items = () =>
    main.getByRole('listitem').filter({ has: page.getByRole('button', { name: t.item.edit }) });

  return {
    o,
    t,
    main,
    toDetails,
    annualFrame,
    preferredCurrency,
    form,
    openAdd,
    chooseKind,
    amountBox,
    setDate,
    save,
    items,
  };
}

/** Matches a field label exactly; required fields render a trailing (hidden) asterisk. */
const label = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*?$`);

const select = (locator: Locator, label: string) => locator.selectOption({ label });

test.describe('financial details (en)', () => {
  test('records all five kinds with every amount state and mixed currencies, without totals', async ({
    page,
  }) => {
    const urls = recordUrls(page);
    const h = helpers(page, 'en');
    const { t } = h;
    await h.toDetails('annual');
    await expect(h.main).toContainText(t.temporary.title);
    await expect(h.main).toContainText(t.neutral.body);
    await expect(h.main).toContainText(t.overview.empty.title);
    await h.annualFrame('USD');

    // ASSET · known · USD
    await h.openAdd();
    await h.chooseKind('ASSET');
    await select(h.form().getByLabel(label(t.form.subtype.label)), t.subtypes.ASSET.PRECIOUS_METAL);
    await h.amountBox(t.form.amount.label).fill('1200.50');
    await h.setDate(t.form.dates.labels.acquiredOn, 'UNKNOWN');
    await h.form().getByLabel(new RegExp(t.form.note.label)).fill('Private savings note');
    await h.save();
    await expect(page.getByRole('status')).toHaveText(t.announcements.added);

    // BALANCE · estimated · PKR
    await h.openAdd();
    await h.chooseKind('BALANCE');
    await select(h.form().getByLabel(label(t.form.subtype.label)), t.subtypes.BALANCE.BANK_ACCOUNT);
    await h.form().getByLabel(label(t.form.currency.label)).selectOption('PKR');
    await h.form().getByRole('radio', { name: t.form.amount.status.ESTIMATED }).check();
    await h.amountBox(t.form.amount.estimateLabel).fill('28000');
    await h.save();

    // INCOME · range · KWD
    await h.openAdd();
    await h.chooseKind('INCOME');
    await select(h.form().getByLabel(label(t.form.subtype.label)), t.subtypes.INCOME.GIFT);
    await h.form().getByLabel(label(t.form.currency.label)).selectOption('KWD');
    await h.form().getByRole('radio', { name: t.form.amount.status.RANGE }).check();
    await h.amountBox(t.form.amount.min).fill('30.125');
    await h.amountBox(t.form.amount.max).fill('4500');
    await h.setDate(t.form.dates.labels.receivedOn, 'KNOWN', '2026-01-15');
    await h.save();

    // EXPENSE · unknown · JPY
    await h.openAdd();
    await h.chooseKind('EXPENSE');
    await select(h.form().getByLabel(label(t.form.subtype.label)), t.subtypes.EXPENSE.HEALTH);
    await h.form().getByLabel(label(t.form.currency.label)).selectOption('JPY');
    await h.form().getByRole('radio', { name: t.form.amount.status.UNKNOWN }).check();
    await h.save();

    // LIABILITY · not provided · GBP
    await h.openAdd();
    await h.chooseKind('LIABILITY');
    await select(h.form().getByLabel(label(t.form.subtype.label)), t.subtypes.LIABILITY.LOAN);
    await h.form().getByLabel(label(t.form.currency.label)).selectOption('GBP');
    await h.form().getByRole('radio', { name: t.form.amount.status.NOT_PROVIDED }).check();
    await h.setDate(t.form.dates.labels.dueOn, 'KNOWN', '2030-01-01');
    await h.save();

    const items = h.items();
    await expect(items).toHaveCount(5);
    await expect(items.nth(0)).toContainText('$1,200.50');
    await expect(items.nth(0)).toContainText('Private savings note');
    await expect(items.nth(1)).toContainText('PKR');
    await expect(items.nth(1)).toContainText('(estimate)');
    await expect(items.nth(2)).toContainText('30.125');
    await expect(items.nth(2)).toContainText('4,500.000');
    await expect(items.nth(3)).toContainText(t.item.unknown);
    await expect(items.nth(4)).toContainText(t.item.notProvided);
    // Each amount stays in its own currency: nothing converted, nothing added up.
    await expect(h.main).toContainText(t.overview.noTotals);
    await expect(h.main).not.toContainText(FORBIDDEN);
    await expect(h.main.getByText(/1,?228|5,?728|29,?2/)).toHaveCount(0);

    expectNoSecretsIn(urls);
    await expectNothingStored(page);
  });

  test('validates locally with accessible, value-free errors and focus on the first invalid field', async ({
    page,
  }) => {
    const h = helpers(page, 'en');
    const { t } = h;
    await h.toDetails('annual');

    // Dates first.
    await h.main.getByRole('button', { name: t.actions.add }).click();
    await expect(h.main.getByText(t.frame.incomplete)).toBeFocused();
    await expect(h.main).toContainText(t.errors.REQUIRED);
    await h.annualFrame();

    await h.openAdd();
    await h.save();
    await expect(h.form().getByRole('alert')).toHaveText(t.form.errorSummary);
    await expect(h.form().getByRole('radio', { name: t.kinds.ASSET.label })).toBeFocused();

    await h.chooseKind('BALANCE');
    await select(h.form().getByLabel(label(t.form.subtype.label)), t.subtypes.BALANCE.CASH);
    const amount = h.amountBox(t.form.amount.label);
    const cases: [string, string][] = [
      ['1,000', t.errors.INVALID_AMOUNT],
      ['-5', t.errors.AMOUNT_NEGATIVE],
      ['1000000000000000', t.errors.AMOUNT_TOO_LARGE],
      ['1.005', t.errors.AMOUNT_TOO_PRECISE.replace('{places}', '2')],
    ];
    for (const [value, message] of cases) {
      await amount.fill(value);
      await h.save();
      await expect(amount).toBeFocused();
      await expect(amount).toHaveAttribute('aria-invalid', 'true');
      await expect(amount).toHaveAccessibleDescription(
        new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
      await expect(h.form().getByRole('alert')).not.toContainText(value);
    }
    // KWD allows three decimals; JPY none.
    await h.form().getByLabel(label(t.form.currency.label)).selectOption('KWD');
    await amount.fill('1.005');
    await h.save();
    await expect(h.items()).toHaveCount(1);
    await expect(h.items().first()).toContainText('1.005');

    await h.openAdd();
    await h.chooseKind('INCOME');
    await select(h.form().getByLabel(label(t.form.subtype.label)), t.subtypes.INCOME.OTHER);
    await h.form().getByRole('radio', { name: t.form.amount.status.RANGE }).check();
    await h.amountBox(t.form.amount.min).fill('9');
    await h.amountBox(t.form.amount.max).fill('1');
    await h.save();
    await expect(h.amountBox(t.form.amount.min)).toHaveAccessibleDescription(
      new RegExp(t.errors.RANGE_MIN_GREATER_THAN_MAX.replace(/[“”]/g, '.')),
    );
  });

  test('keeps approximate dates approximate and outside period checks', async ({ page }) => {
    const h = helpers(page, 'en');
    const { t } = h;
    await h.toDetails('annual');
    await h.annualFrame();
    await h.openAdd();
    await h.chooseKind('INCOME');
    await select(h.form().getByLabel(label(t.form.subtype.label)), t.subtypes.INCOME.EMPLOYMENT);
    await h.amountBox(t.form.amount.label).fill('150');
    // An exact date outside the year is rejected …
    await h.setDate(t.form.dates.labels.receivedOn, 'KNOWN', '2020-03-01');
    await h.save();
    await expect(h.form()).toContainText(t.errors.DATE_OUTSIDE_PERIOD);
    // … but the same date marked approximate is kept, as approximate.
    await h.setDate(t.form.dates.labels.receivedOn, 'APPROXIMATE', '2020-03-01');
    await expect(h.form()).toContainText(t.form.dates.approximateHint);
    await h.save();
    await expect(h.items().first()).toContainText('about Mar 1, 2020');
  });

  test('edits and removes entries with focus management', async ({ page }) => {
    const h = helpers(page, 'en');
    const { t } = h;
    await h.toDetails('first-time');
    await h.preferredCurrency().selectOption('USD');
    await h.main.getByLabel(label(t.frame.assessmentDate.label)).fill('2026-06-30');

    await h.openAdd();
    await h.chooseKind('ASSET');
    await select(h.form().getByLabel(label(t.form.subtype.label)), t.subtypes.ASSET.VEHICLE);
    await h.amountBox(t.form.amount.label).fill('4500');
    await h.save();
    const item = h.items().first();
    await expect(item.getByRole('heading', { name: t.subtypes.ASSET.VEHICLE })).toBeFocused();

    await item.getByRole('button', { name: t.item.edit }).click();
    await expect(h.form().getByRole('heading', { name: t.form.editTitle })).toBeFocused();
    await expect(h.amountBox(t.form.amount.label)).toHaveValue('4500');
    await h.amountBox(t.form.amount.label).fill('987');
    await h.form().getByRole('button', { name: t.form.saveChanges }).click();
    await expect(page.getByRole('status')).toHaveText(t.announcements.updated);
    await expect(h.items()).toHaveCount(1);
    await expect(h.items().first()).toContainText('$987.00');

    // Cancel returns focus to the opener.
    await h.items().first().getByRole('button', { name: t.item.edit }).click();
    await h.form().getByRole('button', { name: t.form.cancel }).click();
    await expect(h.items().first().getByRole('button', { name: t.item.edit })).toBeFocused();

    await h.items().first().getByRole('button', { name: t.item.remove }).click();
    await expect(h.main.getByText(t.item.confirmRemove)).toBeFocused();
    await h.main.getByRole('button', { name: t.item.cancel }).click();
    await expect(h.items()).toHaveCount(1);
    await h.items().first().getByRole('button', { name: t.item.remove }).click();
    await h.main.getByRole('button', { name: t.item.confirm }).click();
    await expect(h.items()).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText(t.announcements.removed);
    await expect(h.main.getByRole('heading', { name: t.overview.title })).toBeFocused();
    await expect(h.main).toContainText(t.overview.empty.title);
  });

  test('missed-year entries belong to a past year; changing the years flags entries', async ({
    page,
  }) => {
    const h = helpers(page, 'en');
    const { t } = h;
    await h.toDetails('missed-year');
    await h.preferredCurrency().selectOption('USD');
    await h.main.getByLabel(label(t.frame.assessmentDate.label)).fill('2026-06-30');
    await h.main.getByRole('button', { name: t.frame.periods.add }).click();
    const year = h.main.getByRole('group', { name: 'Year 1', exact: true });
    await year.getByLabel(label(t.frame.periods.start)).fill('2024-01-01');
    await year.getByLabel(label(t.frame.periods.end)).fill('2024-12-31');

    await h.openAdd();
    await h.chooseKind('EXPENSE');
    await select(h.form().getByLabel(label(t.form.subtype.label)), t.subtypes.EXPENSE.HOUSEHOLD);
    await h.amountBox(t.form.amount.label).fill('150');
    await h.setDate(t.form.dates.labels.paidOn, 'KNOWN', '2024-03-01');
    await h.save();
    await expect(h.form().getByLabel(label(t.form.period.label))).toBeFocused();
    await h.form().getByLabel(label(t.form.period.label)).selectOption({ index: 1 });
    await h.save();
    await expect(h.items()).toHaveCount(1);

    await year.getByLabel(label(t.frame.periods.start)).fill('2024-06-01');
    await expect(h.items().first()).toContainText(t.overview.needsAttention);
  });

  test('entries survive going back to the setup, and are lost on reload', async ({ page }) => {
    const h = helpers(page, 'en');
    const { t, o } = h;
    await h.toDetails('first-time');
    await h.preferredCurrency().selectOption('USD');
    await h.main.getByLabel(label(t.frame.assessmentDate.label)).fill('2026-06-30');
    await h.openAdd();
    await h.chooseKind('BALANCE');
    await select(h.form().getByLabel(label(t.form.subtype.label)), t.subtypes.BALANCE.CASH);
    await h.amountBox(t.form.amount.label).fill('150');
    await h.save();

    await h.main.getByRole('button', { name: t.actions.back }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(o.summary.title);
    await page.getByRole('button', { name: o.summary.continue }).click();
    await expect(h.items()).toHaveCount(1);

    page.on('dialog', (dialog) => void dialog.accept());
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(o.marja.title);
    await expect(page.getByText('$150.00')).toHaveCount(0);
  });

  test('the details step has no detectable WCAG violations', async ({ page }) => {
    const h = helpers(page, 'en');
    const scan = async () => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    };
    await h.toDetails('missed-year');
    await scan();
    await h.preferredCurrency().selectOption('USD');
    await h.main.getByLabel(label(h.t.frame.assessmentDate.label)).fill('2026-06-30');
    await h.main.getByRole('button', { name: h.t.frame.periods.add }).click();
    const year = h.main.getByRole('group', { name: 'Year 1', exact: true });
    await year.getByLabel(label(h.t.frame.periods.start)).fill('2024-01-01');
    await year.getByLabel(label(h.t.frame.periods.end)).fill('2024-12-31');
    await h.openAdd();
    await h.chooseKind('LIABILITY');
    await h.save();
    await scan();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

for (const locale of LOCALES.filter((l) => l !== 'en')) {
  test.describe(`financial details (${locale})`, () => {
    test('works in Urdu, right to left, with amounts kept left to right', async ({ page }) => {
      const urls = recordUrls(page);
      const h = helpers(page, locale);
      const { t } = h;
      await h.toDetails('annual');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await h.annualFrame('PKR');
      await h.openAdd();
      await h.chooseKind('INCOME');
      await select(h.form().getByLabel(label(t.form.subtype.label)), t.subtypes.INCOME.EMPLOYMENT);
      const amount = h.amountBox(t.form.amount.label);
      await expect(amount).toHaveAttribute('dir', 'ltr');
      await amount.fill('28000');
      await h.save();
      await expect(h.items()).toHaveCount(1);
      await expect(h.items().first()).toContainText(t.subtypes.INCOME.EMPLOYMENT);
      await expect(h.main).toContainText(t.overview.noTotals);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expectNoSecretsIn(urls);
      await expectNothingStored(page);
    });
  });
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the details step explains that it needs JavaScript and shows no inputs', async ({
    page,
  }) => {
    const o = CONTENT.onboarding.en;
    const t = CONTENT.facts.en;
    await page.goto('/en/start/marja');
    await page.getByRole('radio', { name: SISTANI.name.en, exact: true }).check();
    await page.getByRole('button', { name: o.marja.continue }).click();
    await page.getByRole('button', { name: o.review.continue }).click();
    await page.getByRole('radio', { name: o.assessment.types.annual.title }).check();
    await page.getByRole('button', { name: o.assessment.continue }).click();
    await page.getByRole('button', { name: o.summary.continue }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.title);
    await expect(page.getByRole('main')).toContainText(t.jsRequired.title);
    await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('main').locator('input[type="date"], select')).toHaveCount(0);
  });
});
