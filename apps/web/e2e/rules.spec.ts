import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { CONTENT } from '../src/content';
import { AXE_TAGS, label, REVIEW, signIn, staffFetch } from './support/staff-session';

/**
 * Scholar rule builder (Phase 2 steps 3–4) against the in-memory e2e API. TEST ONLY accounts and
 * SYNTHETIC research records; the rate (12.5) and amounts are arbitrary engineering values, never
 * a ruling. The builder runs on `khamenei` (research Marja) with the fixture's legacy
 * GOVERNING_SCHOLAR account, which acts exactly as SCHOLAR; the sistani scholar views it
 * read-only. Projects (and retries) use their own category and entry type, because every rule of
 * the Marja is compiled together and one entry type may belong to only one rule.
 */

const r = CONTENT.rules.en;
const facts = CONTENT.facts.en;
const MARJA = 'khamenei';
const KHA_SCHOLAR = {
  username: 'e2e-research-kha',
  password: 'e2e research scholar khamenei test passphrase 0004',
};
const SISTANI_SCHOLAR = {
  username: 'e2e-research',
  password: 'e2e research scholar test passphrase 0003',
};
const CATEGORY = { desktop: 'MINED_PRODUCT', tablet: 'TREASURE', mobile: 'DIVING_GEMS' } as const;
/** Phase 4: entry types of the AI-prepared TEST rule, per project and retry (never shared). */
const AI_SUBTYPES = {
  desktop: ['GIFT', 'OTHER'],
  tablet: ['INHERITANCE', 'BUSINESS'],
  mobile: ['CHARITY_RECEIVED', 'EMPLOYMENT'],
} as const;
/** Entry types of the date and needed-answer TEST rule, per project and retry (never shared). */
const DATE_SUBTYPES = {
  desktop: ['SCHOLARSHIP', 'INCOME_SUPPORT'],
  tablet: ['GRATUITY', 'DEATH_BENEFIT'],
  mobile: ['LEAVE_ENCASHMENT', 'PROVIDENT_FUND'],
} as const;
const SUBTYPES = {
  desktop: ['MINED_PRODUCT', 'BONUS', 'SALE'],
  tablet: ['TREASURE', 'FREELANCE', 'RENTAL'],
  mobile: ['DIVING_GEMS', 'PENSION_OR_BENEFIT', 'INVESTMENT_RETURN'],
} as const;

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function choose(page: Page, fieldLabel: string | RegExp, text: string) {
  const select = page.getByLabel(typeof fieldLabel === 'string' ? label(fieldLabel) : fieldLabel);
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  await select.selectOption(value ?? '');
}

interface Created {
  entityType: string;
  entityId: string;
  displayRef: string;
}

/** SYNTHETIC research of the TEST Marja run: a verified source and passage and a DRAFT ruling. */
async function createResearch(page: Page): Promise<{ ruling: Created; passage: Created }> {
  const step = { expectedRevision: 1, reason: null };
  const post = async (path: string, body: unknown): Promise<Created> => {
    const response = await staffFetch(page, 'POST', `/admin/research${path}`, body);
    expect(response.status, `${path}: ${JSON.stringify(response.json)}`).toBeLessThan(300);
    return response.json as Created;
  };
  const pin = (c: Created, revision: number) => ({
    entityType: c.entityType,
    entityId: c.entityId,
    revision,
    rulingVersion: null,
    marjaId: MARJA,
  });
  const source = await post('/sources', {
    marjaId: MARJA,
    payload: {
      title: { original: 'TEST e2e rule builder source', translation: null },
      originalLanguage: 'ar',
      sourceClass: 'REFERENCE',
      sourceTier: 4,
      publisher: null,
      edition: null,
      publicationDate: { original: null, gregorian: null },
      url: null,
      authorship: { statedAuthor: null, establishedBy: null, status: 'UNVERIFIED' },
      authenticity: { status: 'UNVERIFIED', compareWith: [] },
      accessStatus: 'NOT_YET_ACCESSED',
      copyright: 'EXCERPTS_ONLY',
      canonicalForMarja: 'UNDECIDED',
      notes: null,
    },
    references: [],
    aiInvolvement: [],
  });
  await post(`/sources/${source.entityId}/verify`, step);
  const passage = await post('/passages', {
    marjaId: MARJA,
    payload: {
      locator: {
        volume: null,
        page: '7',
        masalah: null,
        istiftaId: null,
        section: null,
        url: null,
      },
      originalLanguage: 'ar',
      text: 'TEST e2e synthetic excerpt',
      precautionWording: null,
      notes: null,
    },
    references: [pin(source, 1)],
    aiInvolvement: [],
  });
  await post(`/passages/${passage.entityId}/verify`, step);
  const finding = await post('/findings', {
    marjaId: MARJA,
    questionId: 'CTQ-01',
    payload: {
      language: 'en',
      scenario: null,
      conclusion: 'TEST e2e synthetic conclusion',
      explanation: 'TEST e2e synthetic explanation',
      precaution: 'UNDETERMINED',
      conditions: [],
      exceptions: [],
      qualifications: [],
      unresolvedIssues: [],
      notes: null,
    },
    references: [pin(passage, 1)],
    aiInvolvement: [],
  });
  const ruling = await post('/rulings', {
    marjaId: MARJA,
    payload: {
      language: 'en',
      conclusion: 'TEST e2e synthetic ruling conclusion',
      explanation: 'TEST e2e synthetic explanation',
      precaution: 'UNDETERMINED',
      conditions: [],
      exceptions: [],
      notes: null,
    },
    references: [pin(finding, 0), pin(passage, 1)],
    aiInvolvement: [],
  });
  return { ruling, passage };
}

test.describe('scholar rule builder', () => {
  test('rules are changed through the API (in code); the page shows each rule read-only and tests it', async ({
    page,
  }, testInfo) => {
    const project = testInfo.project.name as keyof typeof CATEGORY;
    const category = CATEGORY[project];
    const subtype = SUBTYPES[project][testInfo.retry % 3] ?? SUBTYPES[project][0];
    const subtypeLabel = (facts.subtypes.INCOME as Readonly<Record<string, string>>)[subtype] ?? '';
    await signIn(page, KHA_SCHOLAR);
    const { ruling, passage } = await createResearch(page);
    const content = (flags: readonly string[]) => ({
      category,
      rulingId: ruling.entityId,
      rate: '12.5',
      includedEntries: [{ kind: 'INCOME', subtype }],
      deductions: [],
      conditions: [],
      exceptions: [],
      threshold: null,
      sourceRefs: [passage.entityId],
      requirementFlags: flags,
      otherRequirement: null,
      notes: null,
    });
    // A new rule with a need the engine lacks (decision 79: rules are changed in code).
    const created = await staffFetch(page, 'POST', '/admin/rules', {
      marjaId: MARJA,
      content: content(['CARRY_OVER']),
      reason: 'TEST create',
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const ruleId = (created.json as { ruleId: string }).ruleId;

    await page.goto(`${REVIEW}/en/admin/rules/${ruleId}?marja=${MARJA}`);
    const main = page.getByRole('main');
    await expect(main.getByText(r.notice)).toBeVisible();
    await expect(main.getByRole('heading', { name: r.categories[category] })).toBeVisible();
    await expect(
      main.getByText(r.statuses.DEVELOPER_IMPLEMENTATION_REQUIRED).first(),
    ).toBeVisible();
    await expect(main.getByText(r.check.capabilities.FLAG_CARRY_OVER)).toBeVisible();
    // Read-only: the rule's content is shown; no form to edit, reject or verify it.
    const shown = main.getByRole('region', { name: r.detail.content });
    await expect(shown.getByText(`${facts.kinds.INCOME.label}: ${subtypeLabel}`)).toBeVisible();
    await expect(shown.getByText(/12\.5%/)).toBeVisible();
    await expect(main.getByRole('heading', { name: r.form.reviseHeading })).toHaveCount(0);
    await expect(main.getByRole('button', { name: r.form.revise })).toHaveCount(0);
    await axe(page);

    // Remove the need: a new revision the template supports.
    const revised = await staffFetch(page, 'POST', `/admin/rules/${ruleId}/revise`, {
      expectedRevision: 1,
      content: content([]),
      reason: 'TEST supported',
    });
    expect(revised.status, JSON.stringify(revised.json)).toBe(200);
    await page.reload();
    await expect(main.getByText(r.statuses.READY_FOR_VERIFICATION).first()).toBeVisible();
    await expect(main.getByText(r.check.supported)).toBeVisible();
    const history = main.getByRole('region', { name: r.detail.history });
    await expect(history.getByText('TEST create')).toBeVisible();
    await expect(history.getByText('TEST supported')).toBeVisible();

    // Test it: PROVISIONAL, exact decimals (80.00 × 12.5 ÷ 100 = 10, TEST values).
    await page.getByRole('link', { name: r.detail.back }).click();
    await expect(main.getByRole('heading', { name: r.form.createHeading })).toHaveCount(0);
    await expect(main.getByRole('heading', { name: r.test.heading })).toBeVisible();
    const panel = main.getByRole('region', { name: r.test.heading });
    await panel.getByLabel(label(r.test.currency)).fill('USD');
    await panel.getByLabel(label(r.test.periodStart)).fill('2025-01-01');
    await panel.getByLabel(label(r.test.periodEnd)).fill('2025-12-31');
    await choose(page, r.test.entryType, `${facts.kinds.INCOME.label}: ${subtypeLabel}`);
    await panel.getByLabel(label(r.test.amount)).fill('80.00');
    await panel.getByLabel(label(r.test.date)).fill('2025-06-01');
    await panel.getByRole('button', { name: r.test.run }).click();
    await expect(panel.getByText(r.test.outcome.CALCULATED)).toBeVisible();
    await expect(panel.getByText('PROVISIONAL — FOR SCHOLAR REVIEW ONLY').first()).toBeVisible();
    await expect(panel.getByText('10 USD')).toBeVisible();
    await axe(page);
  });

  test('another Marja’s rules are read-only (view and test only)', async ({ page }) => {
    await signIn(page, SISTANI_SCHOLAR);
    await page.goto(`${REVIEW}/en/admin/rules?marja=${MARJA}`);
    const main = page.getByRole('main');
    await expect(main.getByRole('button', { name: r.form.create })).toHaveCount(0);
    await expect(main.getByRole('heading', { name: r.test.heading })).toBeVisible();
    await axe(page);
    const create = await staffFetch(page, 'POST', '/admin/rules', {
      marjaId: MARJA,
      content: {
        category: 'MIXED_FUNDS',
        rulingId: null,
        rate: null,
        includedEntries: [],
        deductions: [],
        conditions: [],
        exceptions: [],
        threshold: null,
        sourceRefs: [],
        requirementFlags: [],
        otherRequirement: null,
        notes: null,
      },
      reason: 'TEST cross-Marja create',
    });
    expect(create.status).toBe(403);
    // Urdu (RTL) rule builder page.
    await page.goto(`${REVIEW}/ur/admin/rules?marja=${MARJA}`);
    await expect(
      page.getByRole('main').getByRole('heading', { name: CONTENT.rules.ur.test.heading }),
    ).toBeVisible();
    await axe(page);
  });

  test('Phase 4: an AI-approved rule is labelled as not verified; a rejected rule is shown as rejected', async ({
    page,
  }, testInfo) => {
    const project = testInfo.project.name as keyof typeof AI_SUBTYPES;
    const subtype = AI_SUBTYPES[project][testInfo.retry % 2] ?? AI_SUBTYPES[project][0];
    await signIn(page, KHA_SCHOLAR);
    const { ruling, passage } = await createResearch(page);
    const created = await staffFetch(page, 'POST', '/admin/rules', {
      marjaId: MARJA,
      content: {
        category: 'ANNUAL_SURPLUS',
        rulingId: ruling.entityId,
        rate: '12.5',
        includedEntries: [{ kind: 'INCOME', subtype }],
        deductions: [],
        conditions: [],
        exceptions: [],
        threshold: null,
        sourceRefs: [passage.entityId],
        requirementFlags: [],
        otherRequirement: null,
        notes: 'TEST AI-prepared rule',
      },
      reason: 'TEST AI preparation',
      aiPreparation: { stage: 'APPROVED_FOR_SCHOLAR_TESTING', tool: 'TEST tool', tests: 'TEST-1' },
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const ruleId = (created.json as { ruleId: string }).ruleId;

    await page.goto(`${REVIEW}/en/admin/rules/${ruleId}?marja=${MARJA}`);
    const main = page.getByRole('main');
    await expect(main.getByText(r.preparation.aiApproved).first()).toBeVisible();
    await expect(main.getByText(r.preparation.aiExplain)).toBeVisible();
    await axe(page);

    // Reject (in code, decision 79): a new revision that leaves the rule out of every calculation.
    const rejected = await staffFetch(page, 'POST', `/admin/rules/${ruleId}/revise`, {
      expectedRevision: 1,
      content: (created.json as { current: { content: unknown } }).current.content,
      reason: 'TEST reject',
      rejected: true,
    });
    expect(rejected.status, JSON.stringify(rejected.json)).toBe(200);
    await page.reload();
    await expect(main.getByText(r.preparation.rejectedExplain)).toBeVisible();
    await expect(main.getByRole('region', { name: r.preparation.rejectHeading })).toHaveCount(0);

    // Feedback is given to the owner directly: no request box in the console.
    await page.goto(`${REVIEW}/en/admin/rules?marja=${MARJA}`);
    await expect(main.getByRole('region', { name: r.requests.heading })).toHaveCount(0);
    await axe(page);
  });

  test('dates are checked before a run, and answers the calculation needs are highlighted', async ({
    page,
  }, testInfo) => {
    const project = testInfo.project.name as keyof typeof DATE_SUBTYPES;
    const subtype = DATE_SUBTYPES[project][testInfo.retry % 2] ?? DATE_SUBTYPES[project][0];
    const subtypeLabel = (facts.subtypes.INCOME as Readonly<Record<string, string>>)[subtype] ?? '';
    await signIn(page, KHA_SCHOLAR);
    const { ruling, passage } = await createResearch(page);
    const created = await staffFetch(page, 'POST', '/admin/rules', {
      marjaId: MARJA,
      content: {
        category: 'ANNUAL_SURPLUS',
        rulingId: ruling.entityId,
        rate: '12.5',
        includedEntries: [{ kind: 'INCOME', subtype }],
        deductions: [],
        conditions: [
          {
            scope: 'ENTRY',
            label: `TEST: is this ${subtype} counted?`,
            effect: 'INCLUDE',
            entries: [{ kind: 'INCOME', subtype }],
          },
        ],
        exceptions: [],
        threshold: null,
        sourceRefs: [passage.entityId],
        requirementFlags: [],
        otherRequirement: null,
        notes: null,
      },
      reason: 'TEST dates and answers',
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);

    await page.goto(`${REVIEW}/en/admin/rules?marja=${MARJA}`);
    const panel = page.getByRole('main').getByRole('region', { name: r.test.heading });
    await panel.getByLabel(label(r.test.currency)).fill('USD');
    await panel.getByLabel(label(r.test.periodStart)).fill('2025-01-01');
    // More than one year, and an entry far after the year end: blocked before anything is sent.
    await panel.getByLabel(label(r.test.periodEnd)).fill('2026-01-02');
    await choose(page, r.test.entryType, `${facts.kinds.INCOME.label}: ${subtypeLabel}`);
    await expect(panel.getByText(r.test.dateMeaning.INCOME)).toBeVisible();
    await panel.getByLabel(label(r.test.amount)).fill('80.00');
    await panel.getByLabel(label(r.test.date)).fill('2026-10-01');
    await panel.getByRole('button', { name: r.test.run }).click();
    await expect(panel.getByText(r.test.fixDatesFirst)).toBeVisible();
    await expect(
      panel.getByText(r.test.dateIssues.PERIOD_LONGER_THAN_A_YEAR?.replace('{days}', '367') ?? ''),
    ).toBeVisible();
    await expect(panel.getByText(r.test.outcome.CALCULATED)).toHaveCount(0);
    await axe(page);

    // Fixed dates: the run asks for the confirmation, which is highlighted until answered.
    await panel.getByLabel(label(r.test.periodEnd)).fill('2025-12-31');
    await panel.getByLabel(label(r.test.date)).fill('2025-06-01');
    await expect(panel.getByText(r.test.fixDatesFirst)).toHaveCount(0);
    await panel.getByRole('button', { name: r.test.run }).click();
    await expect(panel.getByText(r.test.runAgainAfterAnswers)).toBeVisible();
    await expect(panel.locator('[data-needed="true"]')).toHaveCount(1);
    await expect(panel.getByText(r.test.neededBadge)).toBeVisible();
    await axe(page);

    await panel
      .getByRole('combobox', { name: new RegExp(`is this ${subtype} counted`) })
      .selectOption('yes');
    await expect(panel.locator('[data-needed="true"]')).toHaveCount(0);
    await panel.getByRole('button', { name: r.test.run }).click();
    await expect(panel.getByText(r.test.outcome.CALCULATED)).toBeVisible();
    // 80.00 × 12.5 ÷ 100 = 10 (TEST values).
    await expect(panel.getByText('10 USD')).toBeVisible();
  });
});
