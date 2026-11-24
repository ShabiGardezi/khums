import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { ASSESSMENT_WORKFLOWS, listMarjaCatalogue, NOT_LISTED_SELECTION } from '@khums/core';

import { CONTENT } from '../src/content';
import { LOCALES } from '../src/i18n/config';

const CATALOGUE = listMarjaCatalogue();
const entry = (id: string) => {
  const found = CATALOGUE.find((e) => e.id === id);
  if (found === undefined) throw new Error(`catalogue entry ${id} missing`);
  return found;
};
const SISTANI = entry('sistani');
const KHAMENEI = entry('khamenei');
const HAKIM = entry('hakim');
const ALL_IDS = [...CATALOGUE.map((e) => e.id), NOT_LISTED_SELECTION];
const WORKFLOWS = ASSESSMENT_WORKFLOWS;

/** Records every URL the page navigates to or requests, to prove no selection leaks into one. */
function recordUrls(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  page.on('framenavigated', (frame) => urls.push(frame.url()));
  return urls;
}

function expectNoSelectionInUrls(urls: readonly string[]) {
  for (const url of urls) {
    const { pathname, search, hash } = new URL(url);
    for (const id of ALL_IDS) {
      expect(`${pathname}${search}${hash}`, `URL must not contain "${id}"`).not.toContain(id);
    }
  }
}

async function expectNothingPersisted(page: Page) {
  const storage = await page.evaluate(() => ({
    local: Object.keys(window.localStorage),
    session: Object.keys(window.sessionStorage),
  }));
  expect(storage).toEqual({ local: [], session: [] });
  const cookies = await page.context().cookies();
  for (const cookie of cookies) {
    for (const id of ALL_IDS) expect(`${cookie.name}=${cookie.value}`).not.toContain(id);
  }
}

for (const locale of LOCALES) {
  const t = CONTENT.onboarding[locale];
  const dir = locale === 'ur' ? 'rtl' : 'ltr';
  const marjaUrl = new RegExp(`/${locale}/start/marja$`);

  async function choose(page: Page, name: string) {
    await page.goto(`/${locale}/start/marja`);
    await page.getByRole('radio', { name, exact: true }).check();
    await page.getByRole('button', { name: t.marja.continue }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.review.title);
  }

  async function toAssessment(page: Page, name: string) {
    await choose(page, name);
    await page.getByRole('button', { name: t.review.continue }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.assessment.title);
  }

  test.describe(`onboarding (${locale})`, () => {
    test('start screen explains the process, shows the preview status and continues', async ({
      page,
    }) => {
      await page.goto(`/${locale}/start`);
      await expect(page.locator('html')).toHaveAttribute('dir', dir);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.start.title);
      for (const step of t.start.steps) {
        await expect(page.getByRole('heading', { level: 3, name: step.title })).toBeVisible();
      }
      await expect(
        page.getByRole('main').getByText(t.start.preview.title, { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('main')).toContainText(t.start.privacy);
      await page.getByRole('link', { name: t.start.continue }).click();
      await expect(page).toHaveURL(marjaUrl);
    });

    test('nothing is selected automatically and an empty submit shows an accessible error', async ({
      page,
    }) => {
      await page.goto(`/${locale}/start/marja`);
      const radios = page.getByRole('radio');
      await expect(radios).toHaveCount(CATALOGUE.length + 1);
      for (const radio of await radios.all()) await expect(radio).not.toBeChecked();
      await expect(page.getByRole('main')).toContainText(t.marja.temporary);

      await page.getByRole('button', { name: t.marja.continue }).click();
      const alert = page.getByRole('main').getByRole('alert');
      await expect(alert).toHaveText(t.marja.errors.required);
      await expect(page).toHaveURL(marjaUrl);
      await expect(page.getByRole('group')).toHaveAccessibleDescription(t.marja.errors.required);
      await expect(radios.first()).toBeFocused();
    });

    test('keyboard selection shows the review on the same URL, with separate statuses', async ({
      page,
    }) => {
      const urls = recordUrls(page);
      await page.goto(`/${locale}/start/marja`);
      const radio = page.getByRole('radio', { name: SISTANI.name[locale], exact: true });
      await radio.focus();
      await page.keyboard.press('Space');
      await expect(radio).toBeChecked();
      await page.getByRole('button', { name: t.marja.continue }).press('Enter');

      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toHaveText(t.review.title);
      await expect(heading).toBeFocused();
      await expect(page).toHaveURL(marjaUrl);
      await expect(
        page.getByRole('heading', { level: 2, name: SISTANI.name[locale] }),
      ).toBeVisible();
      await expect(
        page.getByRole('main').getByText(t.review.selectedByYou, { exact: true }),
      ).toBeVisible();
      const main = page.getByRole('main');
      // Proposed "living" in the research inventory, but not human-verified: never stated as fact.
      await expect(main).toContainText(t.status.lifecycle.PENDING_VERIFICATION);
      await expect(main).not.toContainText(t.status.lifecycle.LIVING);
      await expect(main).toContainText(t.status.research.NOT_STARTED);
      await expect(main).toContainText(t.status.rulePack.NONE);
      await expect(main).toContainText(t.status.calculation.UNAVAILABLE);
      await expect(main).toContainText(t.review.unavailable.title);
      await expect(main).toContainText(t.review.unavailable.consult);
      await expect(main).toContainText(t.review.temporary);
      await expect(main).not.toContainText(t.review.deceased.title);

      // "Change selection" returns to the form with the user's own choice from this visit.
      await page.getByRole('button', { name: t.review.change }).click();
      await expect(
        page.getByRole('radio', { name: SISTANI.name[locale], exact: true }),
      ).toBeChecked();
      expectNoSelectionInUrls(urls);
    });

    test('unverified lifecycle reports are not presented as fact', async ({ page }) => {
      await choose(page, KHAMENEI.name[locale]);
      const main = page.getByRole('main');
      await expect(main).toContainText(t.status.lifecycle.PENDING_VERIFICATION);
      await expect(main).not.toContainText(t.status.lifecycle.DECEASED);
      // The continued-taqlid notice is shown only for a verified status.
      await expect(main).not.toContainText(t.review.deceased.title);
      await expect(main).toContainText(t.review.unavailable.title);

      await choose(page, HAKIM.name[locale]);
      await expect(page.getByRole('main')).toContainText(t.status.lifecycle.UNKNOWN);
    });

    test('"not listed" explains unavailability', async ({ page }) => {
      await choose(page, t.marja.notListed.label);
      await expect(page).toHaveURL(marjaUrl);
      await expect(page.getByRole('main')).toContainText(t.review.notListed.title);
    });

    test('the server rejects an ID that is not in the catalogue', async ({ page }) => {
      await page.goto(`/${locale}/start/marja`);
      const radio = page.getByRole('radio', { name: SISTANI.name[locale], exact: true });
      await radio.check();
      // Simulate a tampered submission.
      await radio.evaluate((el) => {
        (el as HTMLInputElement).value = 'unknown-person';
      });
      await page.getByRole('button', { name: t.marja.continue }).click();
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(t.marja.errors.invalid);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.marja.title);
      await expect(page).toHaveURL(marjaUrl);
    });

    test('the selection is not persisted anywhere', async ({ page }) => {
      await choose(page, SISTANI.name[locale]);
      await expectNothingPersisted(page);
      // A fresh visit starts empty.
      await page.goto(`/${locale}/start/marja`);
      for (const radio of await page.getByRole('radio').all())
        await expect(radio).not.toBeChecked();
      await expectNothingPersisted(page);
    });

    test('no Marja is presented as calculation-ready', async ({ page }) => {
      await page.goto(`/${locale}/start/marja`);
      const main = page.getByRole('main');
      await expect(main.getByText(t.status.calculation.AVAILABLE, { exact: true })).toHaveCount(0);
      await expect(main.getByText(t.status.calculation.UNAVAILABLE, { exact: true })).toHaveCount(
        CATALOGUE.length,
      );
    });

    test('continues to assessment selection with the Marja carried forward', async ({ page }) => {
      const urls = recordUrls(page);
      await choose(page, KHAMENEI.name[locale]);
      await page.getByRole('button', { name: t.review.continue }).click();

      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toHaveText(t.assessment.title);
      await expect(heading).toBeFocused();
      await expect(page).toHaveURL(marjaUrl);
      const main = page.getByRole('main');
      await expect(main).toContainText(t.assessment.selectedMarja);
      await expect(main).toContainText(KHAMENEI.name[locale]);
      await expect(main).toContainText(t.assessment.unavailable.title);
      await expect(main).toContainText(t.assessment.temporary);
      await expect(
        page
          .getByRole('navigation', { name: CONTENT.onboarding[locale].progress.label })
          .locator('[aria-current="step"]'),
      ).toContainText(t.progress.steps.assessment);

      const radios = page.getByRole('radio');
      await expect(radios).toHaveCount(WORKFLOWS.length);
      for (const workflow of WORKFLOWS) {
        const radio = page.getByRole('radio', { name: t.assessment.types[workflow].title });
        await expect(radio).not.toBeChecked();
        await expect(radio).toHaveAccessibleDescription(t.assessment.types[workflow].description);
      }

      // Back returns to the review of the same Marja.
      await page.getByRole('button', { name: t.assessment.back }).click();
      await expect(
        page.getByRole('heading', { level: 2, name: KHAMENEI.name[locale] }),
      ).toBeVisible();
      expectNoSelectionInUrls(urls);
    });

    test('an empty assessment submit shows an accessible error', async ({ page }) => {
      await toAssessment(page, SISTANI.name[locale]);
      await page.getByRole('button', { name: t.assessment.continue }).click();
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(
        t.assessment.errors.required,
      );
      await expect(page.getByRole('group')).toHaveAccessibleDescription(
        t.assessment.errors.required,
      );
      await expect(page.getByRole('radio').first()).toBeFocused();
    });

    for (const workflow of WORKFLOWS) {
      test(`selecting "${workflow}" shows the summary without calculation`, async ({ page }) => {
        const urls = recordUrls(page);
        await toAssessment(page, SISTANI.name[locale]);
        const radio = page.getByRole('radio', { name: t.assessment.types[workflow].title });
        await radio.focus();
        await page.keyboard.press('Space');
        await page.getByRole('button', { name: t.assessment.continue }).click();

        await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.summary.title);
        const main = page.getByRole('main');
        await expect(main).toContainText(SISTANI.name[locale]);
        await expect(main).toContainText(t.assessment.types[workflow].title);
        await expect(main).toContainText(t.summary.unavailable.title);
        await expect(main).toContainText(t.summary.unavailable.consult);
        await expect(main).toContainText(t.summary.temporary);
        await expect(main.getByText(t.status.calculation.AVAILABLE, { exact: true })).toHaveCount(
          0,
        );
        // No amounts, rates or figures anywhere in the setup.
        await expect(main).not.toContainText(/\d+(\.\d+)?\s*%/);
        await expect(page).toHaveURL(marjaUrl);
        await expectNothingPersisted(page);

        // Change the assessment type: previous choice kept, Marja unchanged.
        await page.getByRole('button', { name: t.summary.changeAssessment }).click();
        await expect(radio).toBeChecked();
        await expect(page.getByRole('main')).toContainText(SISTANI.name[locale]);
        expectNoSelectionInUrls(urls);
        for (const url of urls) {
          for (const w of WORKFLOWS) expect(new URL(url).search).not.toContain(w);
        }
      });
    }

    test('"Change Marja" from the summary returns to the Marja list with the choice kept', async ({
      page,
    }) => {
      await toAssessment(page, t.marja.notListed.label);
      await expect(page.getByRole('main')).toContainText(t.marja.notListed.label);
      await page.getByRole('radio', { name: t.assessment.types.annual.title }).check();
      await page.getByRole('button', { name: t.assessment.continue }).click();
      await expect(page.getByRole('main')).toContainText(t.summary.unavailable.title);
      await page.getByRole('button', { name: t.summary.changeMarja }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.marja.title);
      await expect(page.getByRole('radio', { name: t.marja.notListed.label })).toBeChecked();
    });

    test('a tampered Marja is rejected at the assessment step: the user chooses again', async ({
      page,
    }) => {
      await toAssessment(page, SISTANI.name[locale]);
      await page.locator('input[type="hidden"][name="marja"]').evaluate((el) => {
        (el as HTMLInputElement).value = 'forged-marja';
      });
      await page.getByRole('radio', { name: t.assessment.types.annual.title }).check();
      await page.getByRole('button', { name: t.assessment.continue }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.marja.title);
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(t.marja.errors.lost);
      for (const radio of await page.getByRole('radio').all())
        await expect(radio).not.toBeChecked();
    });

    test('a tampered assessment type is rejected', async ({ page }) => {
      await toAssessment(page, SISTANI.name[locale]);
      const radio = page.getByRole('radio', { name: t.assessment.types.annual.title });
      await radio.check();
      await radio.evaluate((el) => {
        (el as HTMLInputElement).value = 'monthly';
      });
      await page.getByRole('button', { name: t.assessment.continue }).click();
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(
        t.assessment.errors.invalid,
      );
      await expect(page.getByRole('main')).toContainText(SISTANI.name[locale]);
    });

    test('the assessment and summary steps have no detectable WCAG violations', async ({
      page,
    }) => {
      const scan = async () => {
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      };
      await toAssessment(page, SISTANI.name[locale]);
      await expect(page.locator('html')).toHaveAttribute('dir', dir);
      await scan();
      await page.getByRole('radio', { name: t.assessment.types['missed-year'].title }).check();
      await page.getByRole('button', { name: t.assessment.continue }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.summary.title);
      await scan();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('the review has no detectable WCAG violations', async ({ page }) => {
      await choose(page, KHAMENEI.name[locale]);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  });
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const locale of LOCALES) {
    const t = CONTENT.onboarding[locale];

    test(`${locale}: an empty submit is validated by the server`, async ({ page }) => {
      await page.goto(`/${locale}/start/marja`);
      await page.getByRole('button', { name: t.marja.continue }).click();
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(t.marja.errors.required);
      await expect(page).toHaveURL(new RegExp(`/${locale}/start/marja$`));
    });

    test(`${locale}: a selection is submitted by POST and reviewed on the same URL`, async ({
      page,
    }) => {
      const urls = recordUrls(page);
      const methods: string[] = [];
      page.on('request', (request) => {
        if (request.isNavigationRequest()) methods.push(request.method());
      });
      await page.goto(`/${locale}/start/marja`);
      await page.getByRole('radio', { name: SISTANI.name[locale], exact: true }).check();
      await page.getByRole('button', { name: t.marja.continue }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.review.title);
      await expect(
        page.getByRole('heading', { level: 2, name: SISTANI.name[locale] }),
      ).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/${locale}/start/marja$`));
      expect(methods).toEqual(['GET', 'POST']);
      expectNoSelectionInUrls(urls);

      // Without JavaScript, "Change selection" is a server step that keeps the user's choice.
      await page.getByRole('button', { name: t.review.change }).click();
      await expect(
        page.getByRole('radio', { name: SISTANI.name[locale], exact: true }),
      ).toBeChecked();
    });
  }

  for (const locale of LOCALES) {
    const t = CONTENT.onboarding[locale];

    test(`${locale}: the full flow works by POST, with server validation at every step`, async ({
      page,
    }) => {
      const urls = recordUrls(page);
      const methods: string[] = [];
      page.on('request', (request) => {
        if (request.isNavigationRequest()) methods.push(request.method());
      });
      await page.goto(`/${locale}/start/marja`);
      await page.getByRole('radio', { name: KHAMENEI.name[locale], exact: true }).check();
      await page.getByRole('button', { name: t.marja.continue }).click();
      await page.getByRole('button', { name: t.review.continue }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.assessment.title);
      await expect(page.getByRole('main')).toContainText(KHAMENEI.name[locale]);

      // Server-side "required" for the assessment type.
      await page.getByRole('button', { name: t.assessment.continue }).click();
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(
        t.assessment.errors.required,
      );

      await page.getByRole('radio', { name: t.assessment.types['first-time'].title }).check();
      await page.getByRole('button', { name: t.assessment.continue }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.summary.title);
      await expect(page.getByRole('main')).toContainText(t.assessment.types['first-time'].title);
      await expect(page.getByRole('main')).toContainText(KHAMENEI.name[locale]);
      await expect(page).toHaveURL(new RegExp(`/${locale}/start/marja$`));
      expect(methods).toEqual(['GET', 'POST', 'POST', 'POST', 'POST']);
      expectNoSelectionInUrls(urls);
    });
  }
});
