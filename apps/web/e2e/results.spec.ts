import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { listMarjaCatalogue } from '@khums/core';
import { MOCK_CALCULATION_LABEL } from '@khums/ui/components/mock-calculation-notice';

import { CONTENT } from '../src/content';
import { LOCALES, type Locale } from '../src/i18n/config';

/**
 * Results dashboard (M4.5.1) with the DEVELOPMENT-only, non-religious mock pack. The e2e server
 * runs with KHUMS_OPERATIONAL_STATE=DEVELOPMENT (playwright.config.ts). Values are arbitrary test
 * data; the "sample rate" is an arbitrary engineering value.
 */

const found = listMarjaCatalogue().find((e) => e.id === 'sistani');
if (found === undefined) throw new Error('catalogue entry missing');
const MARJA = found;

const label = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*?$`);

function setup(page: Page, locale: Locale) {
  const o = CONTENT.onboarding[locale];
  const t = CONTENT.facts[locale];
  const r = CONTENT.results[locale];
  const main = page.getByRole('main');
  const form = () =>
    main.locator('form').filter({ has: page.getByRole('button', { name: t.form.cancel }) });

  async function toAnnualDetails() {
    await page.goto(`/${locale}/start/marja`);
    await page.getByRole('radio', { name: MARJA.name[locale], exact: true }).check();
    await page.getByRole('button', { name: o.marja.continue }).click();
    await page.getByRole('button', { name: o.review.continue }).click();
    await page.getByRole('radio', { name: o.assessment.types.annual.title }).check();
    await page.getByRole('button', { name: o.assessment.continue }).click();
    await page.getByRole('button', { name: o.summary.continue }).click();
    await main.getByLabel(label(t.frame.currency.label)).selectOption('USD');
    await main.getByLabel(label(t.frame.periodStart)).fill('2025-07-01');
    await main.getByLabel(label(t.frame.periodEnd)).fill('2026-06-30');
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

  async function showResults() {
    await main.getByRole('button', { name: t.review.open }).click();
    await main.getByRole('button', { name: r.calculate.button }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(r.title);
  }

  return { main, t, r, toAnnualDetails, add, showResults };
}

test.describe('results dashboard (development mock pack)', () => {
  test('shows MOCK labelling, figures, steps with rules and sources, and resolves answers', async ({
    page,
  }) => {
    const h = setup(page, 'en');
    await h.toAnnualDetails();
    await h.add('BALANCE', h.t.subtypes.BALANCE.CASH, '200', 'valuedOn');
    await h.add('LIABILITY', h.t.subtypes.LIABILITY.LOAN, '50', 'valuedOn');
    await h.showResults();

    // The mock notice is present and comes before any figure.
    const notice = h.main.getByRole('note', { name: h.r.noticeAriaLabel });
    await expect(notice).toContainText(MOCK_CALCULATION_LABEL);
    await expect(notice).toContainText(h.r.mockExplanation);

    // Phase 3 step 4: the summary repeats the MOCK label (never reads as approved) and comes
    // after the notice.
    const summary = h.main.getByTestId('result-summary');
    await expect(summary.getByTestId('summary-label')).toHaveText(h.r.mockLabel);
    await expect(summary.getByTestId('summary-deducted')).toContainText(
      `${h.t.kinds.LIABILITY.label} · ${h.t.subtypes.LIABILITY.LOAN}`,
    );
    await expect(summary.getByTestId('print-results')).toBeVisible();

    // The optional sample flag is unanswered: the sample share needs an answer.
    await expect(h.main.getByRole('status')).toHaveText(h.r.status.unresolved);
    await expect(h.main).toContainText(h.r.unresolved.missingAnswer);

    const flag = h.main.getByRole('group', { name: /sample flag/ });
    await flag.getByRole('radio', { name: h.r.questions.no, exact: true }).check();
    await expect(h.main.getByRole('status')).toHaveText(h.r.status.completed);
    // 200 − 50 = 150 net; 12.5 % arbitrary sample rate → 18.75.
    await expect(h.main).toContainText('$150.00');
    await expect(h.main).toContainText('$18.75');

    // Steps cite rules and sources from the pack.
    await h.main
      .getByText(/^Rules \(1\) · Sources \(1\)/)
      .first()
      .click();
    await expect(h.main).toContainText('engineering sample source 1');

    // Yes stops with a sample consultation.
    await flag.getByRole('radio', { name: h.r.questions.yes, exact: true }).check();
    await expect(h.main).toContainText(h.r.unresolved.consultation);
    await expect(h.main).toContainText(h.r.unresolved.consultationHelp);

    // The mapping trace explains each entry.
    await expect(h.main.getByRole('table')).toContainText(h.r.mapping.outcomes.ENTRY);

    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations).toEqual([]);

    await h.main.getByRole('button', { name: h.r.back }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.t.review.title);
  });

  test('asks per-entry questions and lists consultations before calculating', async ({ page }) => {
    const h = setup(page, 'en');
    await h.toAnnualDetails();
    await h.add('EXPENSE', h.t.subtypes.EXPENSE.TRAVEL, '30', 'paidOn');
    await h.add('ASSET', h.t.subtypes.ASSET.OTHER, '10', 'valuedOn');
    await h.showResults();

    await expect(h.main.getByRole('status')).toHaveText(h.r.status.needsInput);
    await expect(h.main).toContainText(h.r.consultations.heading);
    const question = h.main.getByRole('group', { name: /count this item/ });
    await question.getByRole('radio', { name: h.r.questions.yes, exact: true }).check();
    // The answer stays visible and editable; the trace now counts the entry.
    await expect(
      question.getByRole('radio', { name: h.r.questions.yes, exact: true }),
    ).toBeChecked();
    // The consultation for the "other" asset still blocks the calculation.
    await expect(h.main.getByRole('status')).toHaveText(h.r.status.needsInput);
    await expect(h.main.getByRole('note', { name: h.r.noticeAriaLabel })).toBeVisible();
  });

  for (const locale of LOCALES.filter((l) => l !== 'en')) {
    test(`is localized and keeps the canonical English MOCK label (${locale})`, async ({
      page,
    }) => {
      const h = setup(page, locale);
      await h.toAnnualDetails();
      await h.add('BALANCE', h.t.subtypes.BALANCE.CASH, '200', 'valuedOn');
      await h.showResults();
      const notice = h.main.getByRole('note', { name: h.r.noticeAriaLabel });
      await expect(notice).toContainText(h.r.mockLabel);
      await expect(notice).toContainText(MOCK_CALCULATION_LABEL);
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(axe.violations).toEqual([]);
    });
  }
});
