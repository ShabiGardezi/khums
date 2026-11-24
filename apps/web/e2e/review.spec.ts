import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { listMarjaCatalogue, parseFactSheetExport } from '@khums/core';
import type { Workflow } from '@khums/shared-types';

import { CONTENT } from '../src/content';
import { LOCALES, type Locale } from '../src/i18n/config';

/** Fact sheet review and local export (M4.3.3). Values are arbitrary test data. */

const found = listMarjaCatalogue().find((e) => e.id === 'sistani');
if (found === undefined) throw new Error('catalogue entry missing');
const SISTANI = found;

const SECRETS = ['1200.50', '28000', '30.125', '4500', 'Private savings note'];
const FORBIDDEN = /liable|deductible|exempt|eligible|khums due|amount due|total|\d+(\.\d+)?\s*%/i;

const label = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*?$`);

function setup(page: Page, locale: Locale) {
  const o = CONTENT.onboarding[locale];
  const t = CONTENT.facts[locale];
  const main = page.getByRole('main');
  const form = () =>
    main.locator('form').filter({ has: page.getByRole('button', { name: t.form.cancel }) });

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

  async function annualFrame() {
    await main.getByLabel(label(t.frame.currency.label)).selectOption('USD');
    await main.getByLabel(label(t.frame.periodStart)).fill('2025-07-01');
    await main.getByLabel(label(t.frame.periodEnd)).fill('2026-06-30');
  }

  async function add(
    kind: keyof typeof t.kinds,
    subtype: string,
    currency: string,
    fill: () => Promise<void>,
  ) {
    await main.getByRole('button', { name: t.actions.add }).click();
    await form().getByRole('radio', { name: t.kinds[kind].label }).check();
    await form().getByLabel(label(t.form.subtype.label)).selectOption({ label: subtype });
    await form().getByLabel(label(t.form.currency.label)).selectOption(currency);
    await fill();
    await form().getByRole('button', { name: t.form.save }).click();
    await expect(form()).toHaveCount(0);
  }

  const amount = (name: string) => form().getByRole('textbox', { name, exact: true });
  const status = (name: string) => form().getByRole('radio', { name });

  async function addFiveKinds() {
    await add('ASSET', t.subtypes.ASSET.PRECIOUS_METAL, 'USD', async () => {
      await amount(t.form.amount.label).fill('1200.50');
      await form().getByLabel(new RegExp(t.form.note.label)).fill('Private savings note');
      const acquired = form().getByRole('group', {
        name: t.form.dates.labels.acquiredOn,
        exact: true,
      });
      await acquired.getByLabel(label(t.form.dates.statusLabel)).selectOption('APPROXIMATE');
      await acquired.getByLabel(label(t.form.dates.dateLabel)).fill('2019-05-01');
    });
    await add('BALANCE', t.subtypes.BALANCE.BANK_ACCOUNT, 'PKR', async () => {
      await status(t.form.amount.status.ESTIMATED).check();
      await amount(t.form.amount.estimateLabel).fill('28000');
    });
    await add('INCOME', t.subtypes.INCOME.GIFT, 'KWD', async () => {
      await status(t.form.amount.status.RANGE).check();
      await amount(t.form.amount.min).fill('30.125');
      await amount(t.form.amount.max).fill('4500');
    });
    await add('EXPENSE', t.subtypes.EXPENSE.HEALTH, 'JPY', async () => {
      await status(t.form.amount.status.UNKNOWN).check();
    });
    await add('LIABILITY', t.subtypes.LIABILITY.LOAN, 'GBP', async () => {
      await status(t.form.amount.status.NOT_PROVIDED).check();
    });
  }

  async function openReview() {
    await main.getByRole('button', { name: t.review.open }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.review.title);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  }

  const exportButton = () => main.getByRole('button', { name: t.export.button });

  return {
    o,
    t,
    main,
    form,
    toDetails,
    annualFrame,
    add,
    amount,
    addFiveKinds,
    openReview,
    exportButton,
  };
}

function recordTraffic(page: Page) {
  const urls: string[] = [];
  const posts: string[] = [];
  page.on('request', (r) => {
    urls.push(r.url());
    if (r.method() !== 'GET') posts.push(r.postData() ?? '');
  });
  page.on('framenavigated', (f) => urls.push(f.url()));
  return { urls, posts };
}

test.describe('fact sheet review and export (en)', () => {
  test('reviews a complete sheet and exports it exactly, only on request, without any server traffic', async ({
    page,
  }) => {
    const traffic = recordTraffic(page);
    const downloads: unknown[] = [];
    page.on('download', (d) => downloads.push(d));
    const h = setup(page, 'en');
    const { t, o } = h;
    await h.toDetails('annual');
    await h.annualFrame();
    await h.addFiveKinds();
    await h.openReview();

    // Summary, uncertainty and every entry, grouped by kind; no result, no totals.
    await expect(h.main).toContainText(t.review.notResult.title);
    await expect(h.main).toContainText(o.assessment.types.annual.title);
    await expect(h.main).toContainText('US Dollar (USD)');
    await expect(h.main).toContainText('Jul 1, 2025 to Jun 30, 2026');
    for (const kind of ['ASSET', 'BALANCE', 'INCOME', 'EXPENSE', 'LIABILITY'] as const) {
      await expect(
        h.main.getByRole('heading', { level: 3, name: new RegExp(t.kinds[kind].label) }),
      ).toBeVisible();
    }
    for (const text of [
      '$1,200.50',
      'Private savings note',
      'about May 1, 2019',
      'Pakistani Rupee (PKR)',
      'Kuwaiti Dinar (KWD)',
      'Japanese Yen (JPY)',
      t.item.unknown,
      t.item.notProvided,
      t.form.amount.status.RANGE,
      t.form.amount.status.ESTIMATED,
      'Estimates: 1',
      'Ranges: 1',
      'Approximate dates: 1',
      t.review.status.ready,
      t.overview.noTotals,
    ]) {
      await expect(h.main).toContainText(text);
    }
    await expect(h.main).not.toContainText(FORBIDDEN);

    // Nothing has been downloaded or sent just by opening the review.
    expect(downloads).toHaveLength(0);
    const postsBefore = traffic.posts.length;

    // Keyboard: focus the export button and press Enter.
    await h.exportButton().focus();
    const downloadPromise = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^khums-financial-facts-\d{4}-\d{2}-\d{2}\.json$/);
    await expect(h.main.getByRole('status').filter({ hasText: 'Export created' })).toContainText(
      download.suggestedFilename(),
    );
    expect(traffic.posts.length).toBe(postsBefore); // no server transmission

    const text = await readFile(await download.path(), 'utf8');
    const parsed = parseFactSheetExport(JSON.parse(text));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const data = parsed.value;
    expect(data).toMatchObject({
      format: 'khums-platform.financial-facts',
      exportVersion: 1,
      contents: 'FINANCIAL_FACTS_ONLY',
      sheet: {
        currency: 'USD',
        context: { workflow: 'annual', period: { start: '2025-07-01', end: '2026-06-30' } },
      },
    });
    expect(Date.parse(data.exportedAt)).not.toBeNaN();
    expect(data.sheet.facts.map((f) => [f.kind, f.currency, f.value])).toEqual([
      ['ASSET', 'USD', { status: 'KNOWN', amount: '1200.50' }],
      ['BALANCE', 'PKR', { status: 'ESTIMATED', amount: '28000' }],
      ['INCOME', 'KWD', { status: 'RANGE', min: '30.125', max: '4500' }],
      ['EXPENSE', 'JPY', { status: 'UNKNOWN' }],
      ['LIABILITY', 'GBP', { status: 'NOT_PROVIDED' }],
    ]);
    expect(data.sheet.facts[0]).toMatchObject({
      note: 'Private savings note',
      acquiredOn: { status: 'APPROXIMATE', date: '2019-05-01' },
    });
    // Original decimal strings, no internals, no Marja, no classification.
    expect(text).toContain('"1200.50"');
    expect(text).not.toMatch(/"amount": \d|"id":|fact-\d|sistani|marja|liable|deductible|total/i);

    for (const url of traffic.urls) {
      for (const secret of SECRETS) expect(url).not.toContain(secret);
    }
    const storage = await page.evaluate(() => [
      window.localStorage.length,
      window.sessionStorage.length,
      document.cookie,
    ]);
    expect(storage[0]).toBe(0);
    expect(storage[1]).toBe(0);
    for (const secret of SECRETS) expect(String(storage[2])).not.toContain(secret);
  });

  test('flags entries that need attention and refuses to export them', async ({ page }) => {
    const downloads: unknown[] = [];
    page.on('download', (d) => downloads.push(d));
    const h = setup(page, 'en');
    const { t } = h;
    await h.toDetails('annual');
    await h.annualFrame();
    await h.add('INCOME', t.subtypes.INCOME.EMPLOYMENT, 'USD', async () => {
      await h.amount(t.form.amount.label).fill('150');
      const received = h
        .form()
        .getByRole('group', { name: t.form.dates.labels.receivedOn, exact: true });
      await received.getByLabel(label(t.form.dates.statusLabel)).selectOption('KNOWN');
      await received.getByLabel(label(t.form.dates.dateLabel)).fill('2026-01-15');
    });
    // Narrow the year so the saved entry no longer fits.
    await h.main.getByLabel(label(t.frame.periodStart)).fill('2026-02-01');
    await h.openReview();
    await expect(h.main).toContainText(t.review.status.issues);
    await expect(h.main).toContainText(t.overview.needsAttention);
    await h.exportButton().click();
    await expect(h.main.getByRole('alert')).toHaveText(t.export.invalid);
    expect(downloads).toHaveLength(0);
  });

  test('edits and removes entries from the review, and returns to the details', async ({
    page,
  }) => {
    const h = setup(page, 'en');
    const { t } = h;
    await h.toDetails('first-time');
    await h.main.getByLabel(label(t.frame.currency.label)).selectOption('USD');
    await h.main.getByLabel(label(t.frame.assessmentDate.label)).fill('2026-06-30');
    for (const value of ['150', '4500']) {
      await h.add('BALANCE', t.subtypes.BALANCE.CASH, 'USD', async () => {
        await h.amount(t.form.amount.label).fill(value);
      });
    }
    await h.openReview();

    // Edit opens the entry form for that fact.
    await h.main.getByRole('button', { name: t.item.edit }).first().click();
    await expect(h.form().getByRole('heading', { name: t.form.editTitle })).toBeFocused();
    await expect(h.amount(t.form.amount.label)).toHaveValue('150');
    await h.amount(t.form.amount.label).fill('175');
    await h.form().getByRole('button', { name: t.form.saveChanges }).click();
    await h.openReview();
    await expect(h.main).toContainText('$175.00');

    // Remove asks first (keyboard: Escape keeps it).
    await h.main.getByRole('button', { name: t.item.remove }).first().click();
    const dialog = page.getByRole('dialog', { name: t.unsaved.removeFact.title });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(h.main.getByRole('button', { name: t.item.remove })).toHaveCount(2);
    await h.main.getByRole('button', { name: t.item.remove }).first().click();
    await dialog.getByRole('button', { name: t.unsaved.removeFact.confirm }).click();
    await expect(h.main.getByRole('button', { name: t.item.remove })).toHaveCount(1);
    await expect(h.main.getByRole('heading', { name: t.review.entriesTitle })).toBeFocused();
    await expect(
      h.main.getByRole('status').filter({ hasText: t.announcements.removed }),
    ).toBeVisible();

    await h.main.getByRole('button', { name: t.review.back }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.title);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(h.main.getByRole('button', { name: t.item.edit })).toHaveCount(1);
  });

  test('shows missed-year periods, and the review has no detectable WCAG violations', async ({
    page,
  }) => {
    const h = setup(page, 'en');
    const { t } = h;
    await h.toDetails('missed-year');
    await h.main.getByLabel(label(t.frame.currency.label)).selectOption('USD');
    await h.main.getByLabel(label(t.frame.assessmentDate.label)).fill('2026-06-30');
    await h.main.getByRole('button', { name: t.frame.periods.add }).click();
    const year = h.main.getByRole('group', { name: 'Year 1', exact: true });
    await year.getByLabel(label(t.frame.periods.start)).fill('2024-01-01');
    await year.getByLabel(label(t.frame.periods.end)).fill('2024-12-31');
    await h.add('EXPENSE', t.subtypes.EXPENSE.HOUSEHOLD, 'USD', async () => {
      await h.amount(t.form.amount.label).fill('150');
      await h.form().getByLabel(label(t.form.period.label)).selectOption({ index: 1 });
    });
    await h.openReview();
    await expect(h.main).toContainText(t.review.fields.periods);
    await expect(h.main).toContainText('Year 1 (Jan 1, 2024 – Dec 31, 2024)');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

for (const locale of LOCALES.filter((l) => l !== 'en')) {
  test(`review and export work in ${locale} (RTL), with values unchanged`, async ({ page }) => {
    const h = setup(page, locale);
    const { t } = h;
    await h.toDetails('annual');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await h.annualFrame();
    await h.add('ASSET', t.subtypes.ASSET.VEHICLE, 'KWD', async () => {
      await h.amount(t.form.amount.label).fill('30.125');
    });
    await h.openReview();
    await expect(h.main).toContainText(t.review.notResult.title);
    await expect(h.main).toContainText(t.review.status.ready);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    const downloadPromise = page.waitForEvent('download');
    await h.exportButton().click();
    const text = await readFile(await (await downloadPromise).path(), 'utf8');
    expect(text).toContain('"30.125"');
    expect(text).toContain('"KWD"');
  });
}
