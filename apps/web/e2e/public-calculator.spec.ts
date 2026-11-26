import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { listMarjaCatalogue } from '@khums/core';
import { MOCK_CALCULATION_LABEL } from '@khums/ui/components/mock-calculation-notice';
import { PROVISIONAL_CALCULATION_LABEL } from '@khums/ui/components/provisional-calculation-notice';

import { CONTENT } from '../src/content';
import type { Locale } from '../src/i18n/config';
import {
  ensureVerifiedPack,
  PUBLIC,
  PUBLIC_MARJA,
  PUBLIC_PACK_ID,
  PUBLIC_PACK_VERSION,
} from './support/public-verified-pack';
import { AXE_TAGS, label, SCHOLAR, signIn } from './support/staff-session';

/**
 * Decision 65 (one deployment): the PUBLIC web server (PRODUCTION_APPROVED, public access) with
 * the in-memory e2e API. Visitors calculate in their browser with VERIFIED packs only (a TEST pack
 * taken through the governance ledger; arbitrary engineering values, not a ruling); a Marja
 * without one gets a clear message and no figures; results can be kept on the device only; and
 * signed-in staff test provisional packs on the same deployment, never visible to visitors.
 */

const marja = (id: string) => {
  const entry = listMarjaCatalogue().find((e) => e.id === id);
  if (entry === undefined) throw new Error(`catalogue entry ${id} missing`);
  return entry;
};
/**
 * Never given a verified pack in the e2e run: a catalogue Marja outside the research scope, so no
 * builder pack can ever be published for it (Phase 2 step 5 publishes `khamenei-builder` in
 * rule-verification.spec.ts).
 */
const UNVERIFIED_MARJA = marja('hakim');
const VERIFIED_MARJA = marja(PUBLIC_MARJA);

function journey(page: Page, locale: Locale) {
  const o = CONTENT.onboarding[locale];
  const t = CONTENT.facts[locale];
  const r = CONTENT.results[locale];
  const main = page.getByRole('main');
  const form = () =>
    main.locator('form').filter({ has: page.getByRole('button', { name: t.form.cancel }) });

  async function toAnnualDetails(name: string) {
    await page.goto(`${PUBLIC}/${locale}/start/marja`);
    await page.getByRole('radio', { name, exact: true }).check();
    await page.getByRole('button', { name: o.marja.continue }).click();
    await page.getByRole('button', { name: o.review.continue }).click();
    await page.getByRole('radio', { name: o.assessment.types.annual.title }).check();
    await page.getByRole('button', { name: o.assessment.continue }).click();
    await page.getByRole('button', { name: o.summary.continue }).click();
    await main.getByLabel(label(t.frame.currency.label)).selectOption('USD');
    await main.getByLabel(label(t.frame.periodStart)).fill('2025-07-01');
    await main.getByLabel(label(t.frame.periodEnd)).fill('2026-06-30');
  }

  async function addCash(amount: string) {
    await main.getByRole('button', { name: t.actions.add }).click();
    await form().getByRole('radio', { name: t.kinds.BALANCE.label }).check();
    await form()
      .getByLabel(label(t.form.subtype.label))
      .selectOption({ label: t.subtypes.BALANCE.CASH });
    await form().getByLabel(label(t.form.currency.label)).selectOption('USD');
    await form().getByRole('textbox', { name: t.form.amount.label, exact: true }).fill(amount);
    const group = form().getByRole('group', { name: t.form.dates.labels.valuedOn, exact: true });
    await group.getByLabel(label(t.form.dates.statusLabel)).selectOption('KNOWN');
    await group.getByLabel(label(t.form.dates.dateLabel)).fill('2026-01-15');
    await form().getByRole('button', { name: t.form.save }).click();
    await expect(form()).toHaveCount(0);
  }

  async function add(
    kind: keyof typeof t.kinds,
    subtype: string,
    amount: string,
    dateField: keyof typeof t.form.dates.labels,
  ) {
    await main.getByRole('button', { name: t.actions.add }).click();
    await form().getByRole('radio', { name: t.kinds[kind].label }).check();
    await form().getByLabel(label(t.form.subtype.label)).selectOption({ label: subtype });
    await form().getByLabel(label(t.form.currency.label)).selectOption('USD');
    await form().getByRole('textbox', { name: t.form.amount.label, exact: true }).fill(amount);
    const group = form().getByRole('group', { name: t.form.dates.labels[dateField], exact: true });
    await group.getByLabel(label(t.form.dates.statusLabel)).selectOption('KNOWN');
    await group.getByLabel(label(t.form.dates.dateLabel)).fill('2026-01-15');
    await form().getByRole('button', { name: t.form.save }).click();
    await expect(form()).toHaveCount(0);
  }

  /** How the summary names an entry without a label: "Kind · Subtype". */
  const entryName = <K extends keyof typeof t.kinds>(
    kind: K,
    subtype: keyof (typeof t.subtypes)[K],
  ) => `${t.kinds[kind].label} · ${t.subtypes[kind][subtype] as string}`;

  return { main, o, t, r, toAnnualDetails, addCash, add, entryName };
}

test.describe('public calculator (PRODUCTION_APPROVED deployment)', () => {
  test('a Marja without verified rules: a clear message and no figures', async ({ page }) => {
    const h = journey(page, 'en');
    await h.toAnnualDetails(UNVERIFIED_MARJA.name.en);
    const message = h.main.getByTestId('no-verified-rules');
    await expect(message).toContainText(h.r.verified.noRules.title);
    await expect(message).toContainText(h.r.verified.noRules.body);
    await h.addCash('200');
    await h.main.getByRole('button', { name: h.t.review.open }).click();
    // No calculate action, no figures, never a mock or provisional notice.
    await expect(h.main.getByRole('button', { name: h.r.verified.calculate.button })).toHaveCount(
      0,
    );
    await expect(h.main.getByRole('button', { name: h.r.calculate.button })).toHaveCount(0);
    await expect(h.main.getByTestId('no-verified-rules')).toBeVisible();
    await expect(h.main).not.toContainText(MOCK_CALCULATION_LABEL);
    await expect(h.main).not.toContainText(PROVISIONAL_CALCULATION_LABEL);
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
  });

  test('the same message in Urdu (RTL)', async ({ page }) => {
    const h = journey(page, 'ur');
    await h.toAnnualDetails(UNVERIFIED_MARJA.name.ur);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(h.main.getByTestId('no-verified-rules')).toContainText(h.r.verified.noRules.title);
  });

  test('a verified pack: figures in the browser, the pack trace, and save/delete on this device', async ({
    page,
    context,
  }) => {
    await ensureVerifiedPack(page);
    // Visitors are anonymous: drop the staff session used for seeding.
    await context.clearCookies();

    const h = journey(page, 'en');
    await h.toAnnualDetails(VERIFIED_MARJA.name.en);
    await expect(h.main.getByTestId('no-verified-rules')).toHaveCount(0);
    await h.addCash('200');
    await h.main.getByRole('button', { name: h.t.review.open }).click();

    // Facts never leave the browser: no API request is made while calculating.
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/')) apiCalls.push(request.url());
    });
    await h.main.getByRole('button', { name: h.r.verified.calculate.button }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.r.title);

    // Verified notice and trace; never a mock or provisional notice.
    await expect(h.main).toContainText(h.r.verified.noticeTitle);
    const trace = h.main.getByTestId('verified-pack-trace');
    await expect(trace).toContainText(PUBLIC_PACK_ID);
    await expect(trace).toContainText(PUBLIC_PACK_VERSION);
    await expect(trace).toContainText(/[0-9a-f]{64}/);
    await expect(h.main.getByRole('note', { name: h.r.noticeAriaLabel })).toHaveCount(0);
    await expect(h.main).not.toContainText(MOCK_CALCULATION_LABEL);
    await expect(h.main).not.toContainText(PROVISIONAL_CALCULATION_LABEL);

    // The TEST pack's optional sample flag: unanswered first, then answered.
    await expect(h.main.getByRole('status').first()).toHaveText(h.r.status.unresolved);
    const flag = h.main.getByRole('group', { name: /sample flag/ });
    await flag.getByRole('radio', { name: h.r.questions.no, exact: true }).check();
    await expect(h.main.getByRole('status').first()).toHaveText(h.r.status.completed);
    // 200 net; 12.5 % arbitrary TEST rate → 25.00 (engineering values, not a ruling).
    await expect(h.main).toContainText('$200.00');
    await expect(h.main).toContainText('$25.00');
    await expect(h.main.getByTestId('verified-disclaimer')).toHaveText(h.r.verified.disclaimer);
    await expect(h.main).toContainText(h.r.breakdown.heading);
    expect(apiCalls).toEqual([]);
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);

    // Opt-in save, on this device only (no request is sent).
    await h.main.getByRole('button', { name: h.r.verified.save.button }).click();
    await expect(h.main).toContainText(h.r.verified.save.saved);
    expect(apiCalls).toEqual([]);
    const stored = await page.evaluate(() => localStorage.getItem('khums.savedCalculations.v1'));
    expect(stored).toContain(PUBLIC_PACK_ID);
    // Decision 71: tapping Save keeps the entries too (only in this browser), for reopening.
    expect(stored).toContain('2026-01-15');

    // The history page lists it (leaving asks first: the entries are still unsaved in memory).
    const hc = CONTENT.history.en;
    await h.main.getByRole('link', { name: h.r.verified.save.viewHistory }).click();
    await page.getByRole('dialog').getByRole('button', { name: h.t.unsaved.leave.confirm }).click();
    await expect(page).toHaveURL(/\/en\/history$/);
    const entry = page.getByTestId('saved-calculation');
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText(VERIFIED_MARJA.name.en);
    await expect(entry).toContainText(PUBLIC_PACK_VERSION);
    await expect(page.getByRole('main')).toContainText(hc.privacy.title);
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
    await entry.getByRole('button', { name: /^Open / }).click();
    await expect(page.getByTestId('saved-view')).toContainText('$25.00');
    await page
      .getByTestId('saved-view')
      .getByRole('button', { name: /^Delete / })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: hc.deleteConfirm.confirm }).click();
    await expect(page.getByTestId('saved-calculation')).toHaveCount(0);
    await expect(page.getByRole('main')).toContainText(hc.empty.title);
  });

  test('history: delete all, and unreadable data is ignored', async ({ page }) => {
    const hc = CONTENT.history.en;
    await page.goto(`${PUBLIC}/en/history`);
    await expect(page.getByRole('main')).toContainText(hc.empty.title);
    await page.evaluate(() => {
      localStorage.setItem('khums.savedCalculations.v1', '{"schemaVersion":99}');
    });
    await page.reload();
    await expect(page.getByRole('main')).toContainText(hc.discarded);
    await page.getByRole('button', { name: hc.clearAll }).click();
    await page.getByRole('dialog').getByRole('button', { name: hc.clearConfirm.confirm }).click();
    await expect(page.getByRole('main')).toContainText(hc.cleared);
    expect(
      await page.evaluate(() => localStorage.getItem('khums.savedCalculations.v1')),
    ).toBeNull();
  });
});

test.describe('availability and entry guidance from the verified rules (Phase 3 steps 1–2)', () => {
  /** The Marja card (list item) holding the radio with this accessible name. */
  const card = (page: Page, name: string) =>
    page
      .getByRole('main')
      .getByRole('listitem')
      .filter({ has: page.getByRole('radio', { name, exact: true }) });

  for (const locale of ['en', 'ur'] as const) {
    test(`${locale}: each Marja is marked, and only the verified workflows are offered`, async ({
      page,
      context,
    }) => {
      await ensureVerifiedPack(page);
      await context.clearCookies();
      const h = journey(page, locale);
      await page.goto(`${PUBLIC}/${locale}/start/marja`);
      if (locale === 'ur') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      const verifiedCard = card(page, VERIFIED_MARJA.name[locale]);
      await expect(verifiedCard.getByTestId('verified-rules-marker')).toHaveText(
        h.o.marja.verifiedRules.available,
      );
      await expect(
        card(page, UNVERIFIED_MARJA.name[locale]).getByTestId('verified-rules-marker'),
      ).toHaveText(h.o.marja.verifiedRules.none);
      // The marker is part of the radio's description (announced with the choice).
      await expect(
        page.getByRole('radio', { name: VERIFIED_MARJA.name[locale], exact: true }),
      ).toHaveAccessibleDescription(new RegExp(h.o.marja.verifiedRules.available));
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);

      // The TEST pack defines the annual workflow only: the others stay visible but disabled.
      await page.getByRole('radio', { name: VERIFIED_MARJA.name[locale], exact: true }).check();
      await page.getByRole('button', { name: h.o.marja.continue }).click();
      await page.getByRole('button', { name: h.o.review.continue }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.o.assessment.title);
      await expect(
        page.getByRole('radio', { name: h.o.assessment.types.annual.title }),
      ).toBeEnabled();
      for (const workflow of ['first-time', 'missed-year'] as const) {
        const radio = page.getByRole('radio', { name: h.o.assessment.types[workflow].title });
        await expect(radio).toBeDisabled();
        await expect(
          h.main.getByRole('listitem').filter({ has: radio }).getByTestId('workflow-not-offered'),
        ).toHaveText(h.o.assessment.notOffered.replace('{name}', VERIFIED_MARJA.name[locale]));
      }
      await expect(h.main.getByTestId('workflow-not-offered')).toHaveCount(2);
      await expect(h.main.getByTestId('verified-rules-status')).toHaveCount(0);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
    });
  }

  test('a Marja without verified rules is told so before any entry', async ({ page }) => {
    const h = journey(page, 'en');
    await page.goto(`${PUBLIC}/en/start/marja`);
    await page.getByRole('radio', { name: UNVERIFIED_MARJA.name.en, exact: true }).check();
    await page.getByRole('button', { name: h.o.marja.continue }).click();
    await page.getByRole('button', { name: h.o.review.continue }).click();
    const early = h.main.getByTestId('verified-rules-status');
    await expect(early).toContainText(h.r.verified.noRules.title);
    // No types are limited for it (there are no verified rules to read them from).
    for (const workflow of ['annual', 'first-time', 'missed-year'] as const) {
      await expect(
        page.getByRole('radio', { name: h.o.assessment.types[workflow].title }),
      ).toBeEnabled();
    }
    await page.getByRole('radio', { name: h.o.assessment.types.annual.title }).check();
    await page.getByRole('button', { name: h.o.assessment.continue }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.o.summary.title);
    await expect(h.main.getByTestId('verified-rules-status')).toContainText(
      h.r.verified.noRules.title,
    );
  });

  test('the server refuses a workflow the verified pack does not define', async ({
    page,
    context,
  }) => {
    await ensureVerifiedPack(page);
    await context.clearCookies();
    const h = journey(page, 'en');
    await page.goto(`${PUBLIC}/en/start/marja`);
    await page.getByRole('radio', { name: VERIFIED_MARJA.name.en, exact: true }).check();
    await page.getByRole('button', { name: h.o.marja.continue }).click();
    await page.getByRole('button', { name: h.o.review.continue }).click();
    // A tampered page: the disabled type is enabled and submitted anyway.
    const radio = page.getByRole('radio', { name: h.o.assessment.types['missed-year'].title });
    await radio.evaluate((el) => {
      (el as HTMLInputElement).disabled = false;
    });
    await radio.check();
    await page.getByRole('button', { name: h.o.assessment.continue }).click();
    await expect(h.main.getByRole('alert')).toHaveText(h.o.assessment.errors.unsupported);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.o.assessment.title);
  });

  for (const locale of ['en', 'ur'] as const) {
    test(`${locale}: entry types are grouped, and an uncovered type warns before saving`, async ({
      page,
      context,
    }) => {
      await ensureVerifiedPack(page);
      await context.clearCookies();
      const h = journey(page, locale);
      await h.toAnnualDetails(VERIFIED_MARJA.name[locale]);
      const form = () =>
        h.main.locator('form').filter({ has: page.getByRole('button', { name: h.t.form.cancel }) });
      await h.main.getByRole('button', { name: h.t.actions.add }).click();
      await form().getByRole('radio', { name: h.t.kinds.BALANCE.label }).check();
      const select = form().getByLabel(label(h.t.form.subtype.label));
      await expect(select).toHaveAccessibleDescription(h.t.form.coverage.intro);
      const covered = select.locator(`optgroup[label="${h.t.form.coverage.coveredGroup}"]`);
      const uncovered = select.locator(`optgroup[label="${h.t.form.coverage.uncoveredGroup}"]`);
      // From the TEST pack's own mapping: cash is mapped; mixed funds is not (no type is hidden).
      await expect(covered.locator('option', { hasText: h.t.subtypes.BALANCE.CASH })).toHaveCount(
        1,
      );
      await expect(
        uncovered.locator('option', { hasText: h.t.subtypes.BALANCE.MIXED_FUNDS }),
      ).toHaveCount(1);
      // Placeholder + the six balance types (Hajj savings added by decision 82).
      await expect(select.locator('option')).toHaveCount(1 + 6);

      await select.selectOption({ label: h.t.subtypes.BALANCE.MIXED_FUNDS });
      const warning = form().getByTestId('uncovered-entry-warning');
      await expect(warning).toContainText(h.t.form.coverage.uncovered.title);
      await expect(warning).toContainText(h.t.form.coverage.uncovered.body);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);

      await select.selectOption({ label: h.t.subtypes.BALANCE.CASH });
      await expect(form().getByTestId('uncovered-entry-warning')).toHaveCount(0);
      await expect(form().getByTestId('covered-entry-note')).toHaveText(
        h.t.form.coverage.status.CALCULATED,
      );
    });
  }
});

test.describe('result summary and print view (Phase 3 step 4)', () => {
  /**
   * The TEST verified pack is the development sample relabelled TEST (decision 65 fixture):
   * bucket A counts cash, bucket C is only ever subtracted (loans; expenses when "count this item"
   * is answered yes), a "no" leaves the expense out. Arbitrary engineering values, not a ruling.
   */
  for (const locale of ['en', 'ur'] as const) {
    test(`${locale}: a short summary above the breakdown, from the engine's result, and a print view`, async ({
      page,
      context,
    }) => {
      await ensureVerifiedPack(page);
      await context.clearCookies();
      const h = journey(page, locale);
      await h.toAnnualDetails(VERIFIED_MARJA.name[locale]);
      await h.addCash('1000');
      await h.add('LIABILITY', h.t.subtypes.LIABILITY.LOAN, '300', 'valuedOn');
      await h.add('EXPENSE', h.t.subtypes.EXPENSE.HOUSEHOLD, '50', 'paidOn');
      await h.main.getByRole('button', { name: h.t.review.open }).click();
      await h.main.getByRole('button', { name: h.r.verified.calculate.button }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.r.title);
      if (locale === 'ur') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

      // Before the answers: no figure for the expense yet; the summary says what is needed.
      const summary = h.main.getByTestId('result-summary');
      await expect(summary.getByRole('heading', { level: 2 })).toHaveText(h.r.summary.heading);
      await expect(summary.getByTestId('summary-stops')).toContainText(h.r.summary.stops.answer);
      await expect(summary).toContainText(h.r.summary.noFigures);

      await h.main
        .getByRole('group', { name: /count this item/ })
        .getByRole('radio', { name: h.r.questions.no, exact: true })
        .check();
      await h.main
        .getByRole('group', { name: /sample flag/ })
        .getByRole('radio', { name: h.r.questions.no, exact: true })
        .check();
      await expect(h.main.getByRole('status').first()).toHaveText(h.r.status.completed);

      // Figures exactly as the engine returned them: 1000 − 300 = 700; 12.5 % → 87.50 (TEST).
      const figures = summary.getByTestId('summary-figures');
      await expect(figures).toContainText(/700\.00/);
      await expect(figures).toContainText(/87\.50/);
      await expect(summary.getByTestId('summary-counted')).toContainText(
        h.entryName('BALANCE', 'CASH'),
      );
      await expect(summary.getByTestId('summary-deducted')).toContainText(
        h.entryName('LIABILITY', 'LOAN'),
      );
      await expect(summary.getByTestId('summary-excluded')).toContainText(
        h.entryName('EXPENSE', 'HOUSEHOLD'),
      );
      await expect(summary.getByTestId('summary-stops')).toHaveText(h.r.summary.stops.empty);
      const trace = summary.getByTestId('summary-trace');
      await expect(trace).toContainText(PUBLIC_PACK_ID);
      await expect(trace).toContainText(PUBLIC_PACK_VERSION);
      await expect(trace).toContainText(/[0-9a-f]{64}/);
      // A verified result: no mock or provisional label in the summary either.
      await expect(summary.getByTestId('summary-label')).toHaveCount(0);
      await expect(h.main).not.toContainText(MOCK_CALCULATION_LABEL);
      await expect(h.main).not.toContainText(PROVISIONAL_CALCULATION_LABEL);

      // The summary comes after the verified notice and trace, and before the breakdown.
      const breakdown = h.main.getByRole('heading', { name: h.r.breakdown.heading });
      const before = async (a: typeof summary, b: typeof summary) =>
        a.evaluate(
          (x, y) => Boolean(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING),
          await b.elementHandle(),
        );
      expect(await before(h.main.getByTestId('verified-pack-trace'), summary)).toBe(true);
      expect(await before(summary, breakdown)).toBe(true);

      const print = summary.getByTestId('print-results');
      await expect(print).toHaveText(h.r.print.button);
      // The "show it to your Marja's representative" note appears only on the printout.
      const reviewNote = h.main.getByTestId('print-review-note');
      await expect(reviewNote).toBeHidden();
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);

      // Print view: navigation and buttons are removed; notices, disclaimer, trace, summary and
      // breakdown stay, with every rule/source list expanded.
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await page.emulateMedia({ media: 'print' });
      await expect(page.locator('body > header')).toBeHidden();
      await expect(page.locator('body > footer')).toBeHidden();
      await expect(print).toBeHidden();
      await expect(h.main.getByRole('button', { name: h.r.back })).toBeHidden();
      await expect(summary).toBeVisible();
      await expect(h.main.getByTestId('verified-pack-trace')).toBeVisible();
      await expect(h.main.getByTestId('verified-disclaimer')).toBeVisible();
      await expect(breakdown).toBeVisible();
      await expect(reviewNote).toHaveText(h.r.print.reviewNote);
      await expect(h.main.locator('[data-results-print] details:not([open])')).toHaveCount(0);
      await page.emulateMedia({ media: 'screen' });
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      await expect(print).toBeVisible();
      await expect(page.locator('body')).not.toHaveClass(/printing-results/);
    });
  }

  test('an uncovered entry and an unanswered question: no figure, each stop with its reason', async ({
    page,
    context,
  }) => {
    await ensureVerifiedPack(page);
    await context.clearCookies();
    const h = journey(page, 'en');
    await h.toAnnualDetails(VERIFIED_MARJA.name.en);
    await h.addCash('200');
    await h.add('BALANCE', h.t.subtypes.BALANCE.OTHER, '40', 'valuedOn');
    await h.add('EXPENSE', h.t.subtypes.EXPENSE.HOUSEHOLD, '50', 'paidOn');
    await h.main.getByRole('button', { name: h.t.review.open }).click();
    await h.main.getByRole('button', { name: h.r.verified.calculate.button }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.r.title);

    const summary = h.main.getByTestId('result-summary');
    await expect(summary).toContainText(h.r.summary.noFigures);
    // Nothing is listed as counted while nothing could be calculated.
    await expect(summary.getByTestId('summary-counted')).toHaveCount(0);
    const stops = summary.getByTestId('summary-stops').getByRole('listitem');
    await expect(stops).toHaveCount(2);
    await expect(stops.nth(0)).toContainText(h.r.summary.stops.review);
    await expect(stops.nth(0)).toContainText(h.entryName('BALANCE', 'OTHER'));
    await expect(stops.nth(0)).toContainText('sample consultation for one item');
    await expect(stops.nth(1)).toContainText(h.r.summary.stops.answer);
    await expect(stops.nth(1)).toContainText(h.entryName('EXPENSE', 'HOUSEHOLD'));
    await expect(stops.nth(1)).toContainText('count this item');
    await expect(summary.getByTestId('summary-trace')).toContainText(PUBLIC_PACK_ID);
    await expect(summary.getByTestId('print-results')).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
  });
});

test.describe('staff provisional testing on the public deployment (decision 65)', () => {
  test('signed-in staff test the rules; visitors never see or reach them', async ({
    page,
    browser,
  }) => {
    const rv = CONTENT.results.en;
    await signIn(page, SCHOLAR, PUBLIC);
    await page.goto(`${PUBLIC}/en/admin/rules?marja=khamenei`);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: CONTENT.rules.en.test.heading })).toBeVisible();
    await expect(
      main.getByRole('note', { name: rv.provisionalNoticeAriaLabel }).first(),
    ).toContainText(PROVISIONAL_CALCULATION_LABEL);

    // A visitor (no staff session) on the same deployment.
    const visitor = await browser.newContext();
    const anonymous = await visitor.newPage();
    await anonymous.goto(`${PUBLIC}/en/admin/rules`);
    await expect(anonymous).toHaveURL(/\/en\/admin\/sign-in$/);
    const api = await anonymous.evaluate(async () =>
      Promise.all(
        ['/api/v1/admin/rules?marjaId=khamenei', '/api/v1/admin/rules/publications'].map(
          async (path) => (await fetch(path)).status,
        ),
      ),
    );
    expect(api).toEqual([401, 401]);
    await anonymous.goto(`${PUBLIC}/en/start/marja`);
    await expect(anonymous.getByRole('main')).not.toContainText(PROVISIONAL_CALCULATION_LABEL);
    await visitor.close();
  });
});
