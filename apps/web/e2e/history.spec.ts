import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { listMarjaCatalogue } from '@khums/core';

import { CONTENT } from '../src/content';
import type { Locale } from '../src/i18n/config';
import { formatMessage } from '../src/i18n/format';
import {
  ensureVerifiedPack,
  PUBLIC,
  PUBLIC_MARJA,
  PUBLIC_PACK_ID,
  PUBLIC_PACK_VERSION,
} from './support/public-verified-pack';
import { AXE_TAGS, label } from './support/staff-session';

/**
 * Decision 71 (Phase 3 step 3): yearly history on this device. A verified calculation is saved
 * only when the person taps Save (with a name, its entries and answers), then reopened as
 * historical figures, renamed, edited and recalculated with the CURRENT verified pack (its version
 * shown, and flagged when it differs from the saved one), copied to a new year and deleted.
 * Results saved by version 1 (figures only) stay readable. Nothing is ever sent to a server.
 * The TEST verified pack (arbitrary engineering values, not a ruling) comes from
 * `support/public-verified-pack.ts`.
 */

const KEY = 'khums.savedCalculations.v1';
const catalogueEntry = listMarjaCatalogue().find((e) => e.id === PUBLIC_MARJA);
if (catalogueEntry === undefined) throw new Error('catalogue entry missing');
const MARJA = catalogueEntry;
const OLD_DIGEST = 'a'.repeat(64);

async function axe(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
}

function journey(page: Page, locale: Locale) {
  const o = CONTENT.onboarding[locale];
  const t = CONTENT.facts[locale];
  const r = CONTENT.results[locale];
  const hc = CONTENT.history[locale];
  const main = page.getByRole('main');
  const form = () =>
    main.locator('form').filter({ has: page.getByRole('button', { name: t.form.cancel }) });

  async function toAnnualDetails() {
    await page.goto(`${PUBLIC}/${locale}/start/marja`);
    await page.getByRole('radio', { name: MARJA.name[locale], exact: true }).check();
    await page.getByRole('button', { name: o.marja.continue }).click();
    await page.getByRole('button', { name: o.review.continue }).click();
    await page.getByRole('radio', { name: o.assessment.types.annual.title }).check();
    await page.getByRole('button', { name: o.assessment.continue }).click();
    await page.getByRole('button', { name: o.summary.continue }).click();
    await main.getByLabel(label(t.frame.currency.label)).selectOption('USD');
    await setDates('2025-07-01', '2026-06-30');
  }

  async function setDates(start: string, end: string) {
    await main.getByLabel(label(t.frame.periodStart)).fill(start);
    await main.getByLabel(label(t.frame.periodEnd)).fill(end);
  }

  async function fillCash(amount: string, date: string, submit = t.form.save) {
    await form().getByRole('textbox', { name: t.form.amount.label, exact: true }).fill(amount);
    const group = form().getByRole('group', { name: t.form.dates.labels.valuedOn, exact: true });
    await group.getByLabel(label(t.form.dates.statusLabel)).selectOption('KNOWN');
    await group.getByLabel(label(t.form.dates.dateLabel)).fill(date);
    await form().getByRole('button', { name: submit }).click();
    await expect(form()).toHaveCount(0);
  }

  async function addCash(amount: string) {
    await main.getByRole('button', { name: t.actions.add }).click();
    await form().getByRole('radio', { name: t.kinds.BALANCE.label }).check();
    await form()
      .getByLabel(label(t.form.subtype.label))
      .selectOption({ label: t.subtypes.BALANCE.CASH });
    await form().getByLabel(label(t.form.currency.label)).selectOption('USD');
    await fillCash(amount, '2026-01-15');
  }

  async function editCash(amount: string, date: string) {
    await main.getByRole('button', { name: t.item.edit }).first().click();
    await fillCash(amount, date, t.form.saveChanges);
  }

  async function calculate() {
    await main.getByRole('button', { name: t.review.open }).click();
    await main.getByRole('button', { name: r.verified.calculate.button }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(r.title);
  }

  const saveBox = () => main.getByRole('region', { name: r.verified.save.heading });

  async function save(name: string | null) {
    if (name !== null) await saveBox().getByLabel(label(r.verified.save.name.label)).fill(name);
    await saveBox().getByRole('button', { name: r.verified.save.button }).click();
    await expect(saveBox().getByRole('status')).toContainText(r.verified.save.saved);
  }

  /** Leaves the calculator for the history page (leaving asks first: entries are in memory). */
  async function toHistory() {
    await main.getByRole('link', { name: r.verified.save.viewHistory }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: t.unsaved.leave.confirm }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/history$`));
  }

  const rows = () => page.getByTestId('saved-calculation');
  const row = (name: string) =>
    rows().filter({ has: page.getByRole('heading', { name, exact: true }) });
  const view = () => page.getByTestId('saved-view');
  async function open(name: string) {
    await row(name)
      .getByRole('button', { name: formatMessage(hc.openLabel, { label: name }) })
      .click();
    await expect(view().getByRole('heading', { level: 2, name })).toBeFocused();
  }

  return {
    main,
    o,
    t,
    r,
    hc,
    toAnnualDetails,
    setDates,
    addCash,
    editCash,
    calculate,
    save,
    saveBox,
    toHistory,
    rows,
    row,
    view,
    open,
  };
}

/** A version 2 entry as the calculator saves it (TEST values), for seeding the storage. */
function savedEntry(overrides: {
  id: string;
  label: string;
  version: string;
  digest: string;
  answers?: Record<string, boolean>;
}) {
  return {
    id: overrides.id,
    savedAt: '2026-01-20T10:00:00.000Z',
    marjaId: PUBLIC_MARJA,
    workflow: 'annual',
    rulePack: {
      packId: PUBLIC_PACK_ID,
      version: overrides.version,
      contentDigest: overrides.digest,
    },
    engineVersion: '0.1.0',
    currency: 'USD',
    sections: [
      {
        period: null,
        status: 'COMPLETED',
        figures: [{ id: 'test-out', label: 'TEST share', amount: '30' }],
      },
    ],
    label: overrides.label,
    sheet: {
      schemaVersion: 1,
      currency: 'USD',
      context: { workflow: 'annual', period: { start: '2025-07-01', end: '2026-06-30' } },
      facts: [
        {
          id: 'fact-1',
          kind: 'BALANCE',
          subtype: 'CASH',
          label: null,
          note: null,
          currency: 'USD',
          value: { status: 'KNOWN', amount: '240' },
          periodId: null,
          valuedOn: { status: 'KNOWN', date: '2026-01-15' },
        },
      ],
    },
    answers: overrides.answers ?? {},
    yearAnswers: {},
    factAnswers: {},
  };
}

/** What version 1 stored: figures and trace only. */
const LEGACY = {
  id: '0f0e0d0c-0b0a-4908-8706-050403020100',
  savedAt: '2026-01-10T10:00:00.000Z',
  marjaId: PUBLIC_MARJA,
  workflow: 'annual',
  rulePack: { packId: PUBLIC_PACK_ID, version: '0.9.0', contentDigest: OLD_DIGEST },
  engineVersion: '0.1.0',
  currency: 'USD',
  sections: [
    {
      period: null,
      status: 'COMPLETED',
      figures: [{ id: 'test-out', label: 'TEST share', amount: '12.5' }],
    },
  ],
};

async function seed(page: Page, locale: Locale, value: unknown) {
  await page.goto(`${PUBLIC}/${locale}/history`);
  await page.evaluate(
    ([key, text]) => {
      localStorage.setItem(key, text);
    },
    [KEY, JSON.stringify(value)] as const,
  );
  await page.reload();
}

test.describe('yearly history on this device (decision 71)', () => {
  test('save with a name, reopen as saved, rename, edit and recalculate, copy to a new year, delete', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await ensureVerifiedPack(page);
    await context.clearCookies();
    const h = journey(page, 'en');
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/')) apiCalls.push(request.url());
    });

    // Calculate and save with a name (nothing is saved before Save is tapped).
    await h.toAnnualDetails();
    await h.addCash('200');
    await h.calculate();
    await h.main
      .getByRole('group', { name: /sample flag/ })
      .getByRole('radio', { name: h.r.questions.no, exact: true })
      .check();
    await expect(h.main).toContainText('$25.00');
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull();
    await expect(h.saveBox()).toContainText(h.r.verified.save.privacy);
    const name = h.saveBox().getByLabel(label(h.r.verified.save.name.label));
    await expect(name).toHaveValue('Khums year 2025-07-01 to 2026-06-30');
    // A name is required.
    await name.fill('  ');
    await h.saveBox().getByRole('button', { name: h.r.verified.save.button }).click();
    await expect(h.saveBox()).toContainText(h.r.verified.save.name.required);
    await expect(name).toBeFocused();
    await h.save('Khums year 1446');
    const stored = JSON.parse(
      (await page.evaluate((key) => localStorage.getItem(key), KEY)) ?? '{}',
    ) as { schemaVersion: number; entries: { label: string; sheet: unknown; answers: unknown }[] };
    expect(stored.schemaVersion).toBe(2);
    expect(stored.entries).toHaveLength(1);
    expect(stored.entries[0]?.label).toBe('Khums year 1446');
    expect(JSON.stringify(stored.entries[0]?.sheet)).toContain('2026-01-15');
    expect(Object.values(stored.entries[0]?.answers ?? {})).toEqual([false]);
    await axe(page);

    // The history page lists it; "Open" shows the figures as saved, with their pack version.
    await h.toHistory();
    await expect(h.rows()).toHaveCount(1);
    await expect(h.row('Khums year 1446')).toContainText(PUBLIC_PACK_VERSION);
    await axe(page);
    await h.open('Khums year 1446');
    const notice = h.view().getByTestId('historical-notice');
    await expect(notice).toContainText(h.hc.historical.title);
    await expect(notice).toContainText(PUBLIC_PACK_ID);
    await expect(notice).toContainText(`version ${PUBLIC_PACK_VERSION}`);
    await expect(h.view()).toContainText('$25.00');
    await expect(h.view()).toContainText('2025-07-01 to 2026-06-30');
    await axe(page);

    // Rename.
    await h.view().getByRole('button', { name: h.hc.rename.button }).click();
    const rename = h.view().getByLabel(label(h.hc.rename.label));
    await expect(rename).toBeFocused();
    await rename.fill('Khums year 1446 (cash)');
    await h.view().getByRole('button', { name: h.hc.rename.save }).click();
    await expect(page.getByRole('main')).toContainText(h.hc.rename.done);
    await expect(h.view().getByRole('heading', { level: 2 })).toHaveText('Khums year 1446 (cash)');

    // Edit and recalculate: the entries and answers come back; only Marja and type are submitted.
    await h.view().getByRole('button', { name: h.hc.edit.button }).click();
    await expect(page).toHaveURL(/\/en\/start\/marja$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.t.title);
    await expect(h.main.getByTestId('reopened-notice')).toContainText(
      formatMessage(h.t.reopened.editTitle, { label: 'Khums year 1446 (cash)' }),
    );
    await axe(page);
    await h.editCash('400', '2026-01-15');
    await h.calculate();
    const version = h.main.getByTestId('pack-version-notice');
    await expect(version).toHaveAttribute('data-changed', 'false');
    await expect(version).toContainText(PUBLIC_PACK_VERSION);
    // The saved answer is used again (same pack version): the result is complete without asking.
    await expect(h.main.getByRole('status').first()).toHaveText(h.r.status.completed);
    await expect(h.main).toContainText('$50.00');
    // Audit M-2: a changed answer survives leaving and returning to the results.
    const flag = h.main.getByRole('group', { name: /sample flag/ });
    await expect(flag.getByRole('radio', { name: h.r.questions.no, exact: true })).toBeChecked();
    await flag.getByRole('radio', { name: h.r.questions.yes, exact: true }).check();
    await expect(h.main).not.toContainText('$50.00');
    await h.main.getByRole('button', { name: h.r.back }).click();
    await h.main.getByRole('button', { name: h.r.verified.calculate.button }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.r.title);
    await expect(flag.getByRole('radio', { name: h.r.questions.yes, exact: true })).toBeChecked();
    await expect(h.main).not.toContainText('$50.00');
    await flag.getByRole('radio', { name: h.r.questions.no, exact: true }).check();
    await expect(h.main).toContainText('$50.00');
    await expect(h.saveBox().getByLabel(label(h.r.verified.save.name.label))).toHaveValue(
      'Khums year 1446 (cash)',
    );
    await h.save('Khums year 1446 v2');
    await expect(h.saveBox()).toContainText(h.r.verified.save.editNote);
    await axe(page);

    // Both are kept: saving never overwrites the reopened calculation.
    await h.toHistory();
    await expect(h.rows()).toHaveCount(2);
    await expect(h.rows().first()).toContainText('Khums year 1446 v2');

    // Copy to a new year: entries copied, dates cleared, nothing saved until Save.
    await h.open('Khums year 1446 v2');
    await h.view().getByRole('button', { name: h.hc.copy.button }).click();
    await expect(h.main.getByTestId('reopened-notice')).toContainText(
      formatMessage(h.t.reopened.copyTitle, { label: 'Khums year 1446 v2' }),
    );
    await expect(h.main.getByLabel(label(h.t.frame.periodStart))).toHaveValue('');
    await h.setDates('2026-07-01', '2027-06-30');
    // Entry dates are never shifted: the person updates the copied balance for the new year.
    await expect(h.main).toContainText('Jan 15, 2026');
    await h.editCash('500', '2027-01-15');
    await h.calculate();
    // Audit M-1: a copy never carries last year's answers; the question is asked again.
    const copyFlag = h.main.getByRole('group', { name: /sample flag/ });
    await expect(
      copyFlag.getByRole('radio', { name: h.r.questions.no, exact: true }),
    ).not.toBeChecked();
    await expect(
      copyFlag.getByRole('radio', { name: h.r.questions.yes, exact: true }),
    ).not.toBeChecked();
    await copyFlag.getByRole('radio', { name: h.r.questions.no, exact: true }).check();
    await expect(h.main).toContainText('$62.50');
    await expect(h.saveBox().getByLabel(label(h.r.verified.save.name.label))).toHaveValue(
      'Khums year 2026-07-01 to 2027-06-30',
    );
    await h.save(null);
    await h.toHistory();
    await expect(h.rows()).toHaveCount(3);

    // Delete one (confirmed), then all (confirmed).
    await h
      .row('Khums year 1446 (cash)')
      .getByRole('button', {
        name: formatMessage(h.hc.deleteOneLabel, { label: 'Khums year 1446 (cash)' }),
      })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: h.hc.deleteConfirm.confirm })
      .click();
    await expect(h.rows()).toHaveCount(2);
    await page.getByRole('button', { name: h.hc.clearAll }).click();
    await page.getByRole('dialog').getByRole('button', { name: h.hc.clearConfirm.confirm }).click();
    await expect(page.getByRole('main')).toContainText(h.hc.cleared);
    await expect(h.rows()).toHaveCount(0);

    // Saved data never left the browser.
    expect(apiCalls).toEqual([]);
  });

  test('results saved by version 1 stay readable; a changed pack version is flagged', async ({
    page,
    context,
  }) => {
    await ensureVerifiedPack(page);
    await context.clearCookies();
    const h = journey(page, 'en');
    await seed(page, 'en', { schemaVersion: 1, entries: [LEGACY] });
    await expect(h.rows()).toHaveCount(1);
    await h.open(h.hc.legacyLabel);
    await expect(h.view()).toContainText('$12.50');
    await expect(h.view()).toContainText(h.hc.legacyNote);
    await expect(h.view().getByRole('button', { name: h.hc.edit.button })).toHaveCount(0);
    await expect(h.view().getByRole('button', { name: h.hc.copy.button })).toHaveCount(0);
    await axe(page);

    // Saved with an older pack version: recalculated with the current one, and told so.
    await seed(page, 'en', {
      schemaVersion: 2,
      entries: [
        savedEntry({
          id: '1f0e0d0c-0b0a-4908-8706-050403020100',
          label: 'Older year',
          version: '0.9.0',
          digest: OLD_DIGEST,
          answers: { 'mock-flag': false },
        }),
        LEGACY,
      ],
    });
    await expect(h.rows()).toHaveCount(2);
    await h.open('Older year');
    await expect(h.view().getByTestId('historical-notice')).toContainText('version 0.9.0');
    await expect(h.view()).toContainText('$30.00');
    await h.view().getByRole('button', { name: h.hc.edit.button }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.t.title);
    await h.calculate();
    const version = h.main.getByTestId('pack-version-notice');
    await expect(version).toHaveAttribute('data-changed', 'true');
    await expect(version).toContainText(h.r.verified.reopened.changedTitle);
    await expect(version).toContainText('0.9.0');
    await expect(version).toContainText(PUBLIC_PACK_VERSION);
    // Audit H-1: answers saved with another pack version are never reused; asked again.
    await expect(version).toContainText(h.r.verified.reopened.answersCleared);
    const flag = h.main.getByRole('group', { name: /sample flag/ });
    await expect(
      flag.getByRole('radio', { name: h.r.questions.no, exact: true }),
    ).not.toBeChecked();
    await expect(h.main.getByRole('status').first()).not.toHaveText(h.r.status.completed);
    await axe(page);
  });

  test('one unreadable saved item never hides the others; Save warns before removing it', async ({
    page,
    context,
  }) => {
    await ensureVerifiedPack(page);
    await context.clearCookies();
    const h = journey(page, 'en');
    await seed(page, 'en', {
      schemaVersion: 2,
      entries: [
        savedEntry({
          id: '4f0e0d0c-0b0a-4908-8706-050403020100',
          label: 'Readable year',
          version: PUBLIC_PACK_VERSION,
          digest: OLD_DIGEST,
        }),
        { id: 'damaged' },
      ],
    });
    await expect(h.rows()).toHaveCount(1);
    const unreadable = page.getByTestId('history-unreadable');
    await expect(unreadable).toContainText(h.hc.discarded);
    await expect(unreadable).toContainText(formatMessage(h.hc.unreadableCount, { count: '1' }));
    await axe(page);
    await h.toAnnualDetails();
    await h.addCash('200');
    await h.calculate();
    await expect(h.saveBox().getByTestId('save-unreadable-warning')).toHaveText(
      h.r.verified.save.unreadableWarning,
    );
    await h.save('New year');
    await expect(h.saveBox().getByTestId('save-unreadable-warning')).toHaveCount(0);
    await h.toHistory();
    await expect(h.rows()).toHaveCount(2);
    await expect(page.getByTestId('history-unreadable')).toHaveCount(0);
  });

  test('Urdu (RTL): open, rename and edit a saved calculation', async ({ page, context }) => {
    await ensureVerifiedPack(page);
    await context.clearCookies();
    const h = journey(page, 'ur');
    await seed(page, 'ur', {
      schemaVersion: 2,
      entries: [
        savedEntry({
          id: '2f0e0d0c-0b0a-4908-8706-050403020100',
          label: 'خمس کا سال 1446',
          version: PUBLIC_PACK_VERSION,
          digest: OLD_DIGEST,
        }),
      ],
    });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('main')).toContainText(h.hc.privacy.title);
    await h.open('خمس کا سال 1446');
    await expect(h.view().getByTestId('historical-notice')).toContainText(h.hc.historical.title);
    await axe(page);
    await h.view().getByRole('button', { name: h.hc.rename.button }).click();
    await h.view().getByLabel(label(h.hc.rename.label)).fill('خمس کا سال 1446 (نقد)');
    await h.view().getByRole('button', { name: h.hc.rename.save }).click();
    await expect(page.getByRole('main')).toContainText(h.hc.rename.done);
    await h.view().getByRole('button', { name: h.hc.edit.button }).click();
    await expect(h.main.getByTestId('reopened-notice')).toContainText(
      formatMessage(h.t.reopened.editTitle, { label: 'خمس کا سال 1446 (نقد)' }),
    );
    await axe(page);
  });

  test('warnings before saving: another currency, and the oldest removed at the limit', async ({
    page,
    context,
  }) => {
    await ensureVerifiedPack(page);
    await context.clearCookies();
    const h = journey(page, 'en');
    await seed(page, 'en', {
      schemaVersion: 2,
      entries: Array.from({ length: 50 }, (_, i) =>
        savedEntry({
          id: `${i.toString(16).padStart(8, '0')}-0b0a-4908-8706-050403020100`,
          label: `Year ${String(i)}`,
          version: PUBLIC_PACK_VERSION,
          digest: OLD_DIGEST,
        }),
      ),
    });
    await expect(h.rows()).toHaveCount(50);
    await h.toAnnualDetails();
    // Audit L-4: an entry in another currency stops the calculation; said before saving.
    await h.main.getByRole('button', { name: h.t.actions.add }).click();
    const form = h.main
      .locator('form')
      .filter({ has: page.getByRole('button', { name: h.t.form.cancel }) });
    await form.getByRole('radio', { name: h.t.kinds.BALANCE.label }).check();
    await form.getByLabel(label(h.t.form.currency.label)).selectOption('EUR');
    await expect(form.getByTestId('currency-entry-warning')).toContainText(
      h.t.form.coverage.currency.title,
    );
    await axe(page);
    await form.getByLabel(label(h.t.form.currency.label)).selectOption('USD');
    await expect(form.getByTestId('currency-entry-warning')).toHaveCount(0);
    await form.getByRole('button', { name: h.t.form.cancel }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: h.t.unsaved.discardEntry.confirm })
      .click();
    await expect(form).toHaveCount(0);
    await h.addCash('200');
    await h.calculate();
    // Audit L-5: at the limit, Save says the oldest saved calculation will be removed.
    await expect(h.saveBox().getByTestId('save-cap-warning')).toContainText('50');
    await expect(h.saveBox().getByTestId('save-cap-warning')).toContainText('Jan 20, 2026');
  });

  test('storage that is blocked or full gives a clear message, never a crash', async ({
    page,
    context,
  }) => {
    await ensureVerifiedPack(page);
    await context.clearCookies();
    const h = journey(page, 'en');
    // Full: the history key cannot be written (the availability probe still works).
    await page.addInitScript((key) => {
      const original = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')?.value as (
        this: Storage,
        name: string,
        value: string,
      ) => void;
      Storage.prototype.setItem = function (this: Storage, name: string, value: string) {
        if (name === key) throw new DOMException('full', 'QuotaExceededError');
        original.call(this, name, value);
      };
    }, KEY);
    await h.toAnnualDetails();
    await h.addCash('200');
    await h.calculate();
    await h.saveBox().getByRole('button', { name: h.r.verified.save.button }).click();
    await expect(h.saveBox().getByRole('status')).toHaveText(h.r.verified.save.full);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.r.title);

    // Blocked: nothing can be shown or saved, and the page says so.
    const blocked = await context.newPage();
    await blocked.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
    await blocked.goto(`${PUBLIC}/en/history`);
    await expect(blocked.getByRole('main')).toContainText(h.hc.unavailable.title);
  });
});
