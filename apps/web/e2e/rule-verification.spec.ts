import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { listMarjaCatalogue } from '@khums/core';
import { MOCK_CALCULATION_LABEL } from '@khums/ui/components/mock-calculation-notice';
import { PROVISIONAL_CALCULATION_LABEL } from '@khums/ui/components/provisional-calculation-notice';

import { CONTENT } from '../src/content';
import { PUBLIC } from './support/public-verified-pack';
import { AXE_TAGS, label, signIn, staffFetch } from './support/staff-session';

/**
 * Phase 2 step 5 (decisions 63, 67) on the one PRODUCTION_APPROVED deployment with the in-memory
 * e2e API: a scholar builds a rule on SYNTHETIC TEST research records, cannot verify it while a
 * cited record is unverified, verifies the research, records the source verification (automatic
 * approval and publication), and a visitor's public calculation then uses it, with its trace. A
 * later revision stays unverified and the public keeps the previous version until it is verified
 * again. TEST values only (rates 12.5 and 10, amount 80.00): arbitrary engineering values, never
 * a ruling. Runs on `khamenei` (a research Marja) with a TEST SCHOLAR account; desktop only,
 * because every project shares one API and its builder publications.
 */

const r = CONTENT.rules.en;
const v = r.verification;
const facts = CONTENT.facts.en;
const MARJA = 'khamenei';
const KHA_SCHOLAR = {
  username: 'e2e-scholar-kha',
  password: 'e2e khamenei scholar test passphrase 0006',
};
/** Entry types not used by any other e2e rule of the Marja (one per retry). */
const SUBTYPES = ['EMPLOYMENT', 'GIFT', 'CHARITY_RECEIVED'] as const;
const KHAMENEI = listMarjaCatalogue().find((e) => e.id === MARJA);

interface Created {
  entityType: string;
  entityId: string;
  displayRef: string;
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const sourcePayload = (title: string) => ({
  title: { original: title, translation: null },
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
});

/**
 * SYNTHETIC research: a verified source and passage, a finding and a DRAFT ruling, plus a further
 * TEST source that is still DRAFT (unverified).
 */
async function createResearch(page: Page) {
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
    payload: sourcePayload('TEST e2e verification source'),
    references: [],
    aiInvolvement: [],
  });
  await post(`/sources/${source.entityId}/verify`, step);
  const passage = await post('/passages', {
    marjaId: MARJA,
    payload: {
      locator: {
        volume: null,
        page: '9',
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
  // Decision 69: a finding a source-verified rule rests on is VERIFIED (or APPROVED).
  await post(`/findings/${finding.entityId}/verify`, step);
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
  const unverified = await post('/sources', {
    marjaId: MARJA,
    payload: sourcePayload('TEST e2e source awaiting verification'),
    references: [],
    aiInvolvement: [],
  });
  /** A further VERIFIED TEST passage of the same source, cited only by a rule's sources. */
  const extraPassage = async () => {
    const extra = await post('/passages', {
      marjaId: MARJA,
      payload: {
        locator: {
          volume: null,
          page: '10',
          masalah: null,
          istiftaId: null,
          section: null,
          url: null,
        },
        originalLanguage: 'ar',
        text: 'TEST e2e further synthetic excerpt',
        precautionWording: null,
        notes: null,
      },
      references: [pin(source, 1)],
      aiInvolvement: [],
    });
    await post(`/passages/${extra.entityId}/verify`, step);
    return extra;
  };
  return { ruling, passage, unverified, verifyStep: step, extraPassage };
}

/** A visitor reaches the entries step for the Marja and is told no verified rules are available. */
async function publicHasNoFigures(page: Page) {
  const o = CONTENT.onboarding.en;
  const t = facts;
  const main = page.getByRole('main');
  await page.goto(`${PUBLIC}/en/start/marja`);
  await page.getByRole('radio', { name: KHAMENEI?.name.en ?? '', exact: true }).check();
  await page.getByRole('button', { name: o.marja.continue }).click();
  await page.getByRole('button', { name: o.review.continue }).click();
  await page.getByRole('radio', { name: o.assessment.types.annual.title }).check();
  await page.getByRole('button', { name: o.assessment.continue }).click();
  await page.getByRole('button', { name: o.summary.continue }).click();
  await main.getByLabel(label(t.frame.currency.label)).selectOption('USD');
  await main.getByLabel(label(t.frame.periodStart)).fill('2025-07-01');
  await main.getByLabel(label(t.frame.periodEnd)).fill('2026-06-30');
  await expect(main.getByTestId('no-verified-rules')).toContainText(
    CONTENT.results.en.verified.noRules.title,
  );
}

/**
 * Records a source verification of the rule's current revision through the API (decision 79: the
 * console no longer has the verification panel; the owner verifies in code or by the API).
 */
async function verifyRule(page: Page, ruleId: string, revision: number, reason: string) {
  const response = await staffFetch(page, 'POST', `/admin/rules/${ruleId}/verify`, {
    revision,
    attestations: {
      sourcesAuthentic: true,
      originalTextMatches: true,
      translationAccurate: true,
      attributionCorrect: true,
    },
    notes: 'TEST e2e verification notes',
    reason,
  });
  expect(response.status, JSON.stringify(response.json)).toBeLessThan(300);
}

interface VerificationStatus {
  readonly currentVerified: boolean;
  readonly blockers: readonly { readonly code: string; readonly entityId: string | null }[];
  readonly history: readonly { readonly reason: string }[];
  readonly publicStatus: {
    readonly status: string;
    readonly version: string | null;
    readonly liveRevision: number | null;
    readonly suspendedRules: readonly {
      readonly ruleId: string;
      readonly codes: readonly string[];
    }[];
  };
}
async function verificationStatus(page: Page, ruleId: string): Promise<VerificationStatus> {
  const response = await staffFetch(page, 'GET', `/admin/rules/${ruleId}/verification`);
  expect(response.status).toBe(200);
  return response.json as VerificationStatus;
}

/** A visitor's public annual calculation with one TEST income entry; returns the main region. */
async function publicCalculation(page: Page, subtypeLabel: string) {
  const o = CONTENT.onboarding.en;
  const t = facts;
  const res = CONTENT.results.en;
  const main = page.getByRole('main');
  const form = () =>
    main.locator('form').filter({ has: page.getByRole('button', { name: t.form.cancel }) });
  await page.goto(`${PUBLIC}/en/start/marja`);
  await page.getByRole('radio', { name: KHAMENEI?.name.en ?? '', exact: true }).check();
  await page.getByRole('button', { name: o.marja.continue }).click();
  await page.getByRole('button', { name: o.review.continue }).click();
  await page.getByRole('radio', { name: o.assessment.types.annual.title }).check();
  await page.getByRole('button', { name: o.assessment.continue }).click();
  await page.getByRole('button', { name: o.summary.continue }).click();
  await main.getByLabel(label(t.frame.currency.label)).selectOption('USD');
  await main.getByLabel(label(t.frame.periodStart)).fill('2025-07-01');
  await main.getByLabel(label(t.frame.periodEnd)).fill('2026-06-30');
  await expect(main.getByTestId('no-verified-rules')).toHaveCount(0);
  await main.getByRole('button', { name: t.actions.add }).click();
  await form().getByRole('radio', { name: t.kinds.INCOME.label }).check();
  await form().getByLabel(label(t.form.subtype.label)).selectOption({ label: subtypeLabel });
  await form().getByLabel(label(t.form.currency.label)).selectOption('USD');
  await form().getByRole('textbox', { name: t.form.amount.label, exact: true }).fill('80.00');
  const group = form().getByRole('group', { name: t.form.dates.labels.receivedOn, exact: true });
  await group.getByLabel(label(t.form.dates.statusLabel)).selectOption('KNOWN');
  await group.getByLabel(label(t.form.dates.dateLabel)).fill('2026-01-15');
  await form().getByRole('button', { name: t.form.save }).click();
  await expect(form()).toHaveCount(0);
  await main.getByRole('button', { name: t.review.open }).click();
  await main.getByRole('button', { name: res.verified.calculate.button }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(res.title);
  await expect(main).toContainText(res.verified.noticeTitle);
  await expect(main).not.toContainText(MOCK_CALCULATION_LABEL);
  await expect(main).not.toContainText(PROVISIONAL_CALCULATION_LABEL);
  return main;
}

test.describe('source verification → automatic approval → public calculator', () => {
  // One shared builder publication per API run: the tests below run in order, never at once.
  test.describe.configure({ mode: 'serial' });

  test('a scholar verifies a rule on TEST research; the public calculator uses it; a revision waits for re-verification', async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one shared builder publication per API run');
    test.setTimeout(180_000);
    const subtype = SUBTYPES[testInfo.retry % SUBTYPES.length] ?? 'EMPLOYMENT';
    const subtypeLabel = (facts.subtypes.INCOME as Readonly<Record<string, string>>)[subtype] ?? '';
    await signIn(page, KHA_SCHOLAR, PUBLIC);
    const { ruling, passage, unverified, verifyStep } = await createResearch(page);

    // The rule is created through the API (decision 79: rules are changed in code).
    const ruleContent = (rate: string) => ({
      category: 'ANNUAL_SURPLUS',
      rulingId: ruling.entityId,
      rate,
      includedEntries: [{ kind: 'INCOME', subtype }],
      deductions: [],
      conditions: [],
      exceptions: [],
      threshold: null,
      sourceRefs: [passage.entityId, unverified.entityId],
      requirementFlags: [],
      otherRequirement: null,
      notes: null,
    });
    const created = await staffFetch(page, 'POST', '/admin/rules', {
      marjaId: MARJA,
      content: ruleContent('12.5'),
      reason: 'TEST create',
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const ruleId = (created.json as { ruleId: string }).ruleId;
    const ruleUrl = `${PUBLIC}/en/admin/rules/${ruleId}?marja=${MARJA}`;

    // The console shows the rule read-only: no verification panel.
    await page.goto(ruleUrl);
    const main = page.getByRole('main');
    await expect(main.getByRole('region', { name: r.detail.content })).toBeVisible();
    await expect(main.getByRole('region', { name: v.heading })).toHaveCount(0);
    await axe(page);

    // Cannot verify while a cited research record is unverified: the reason and record are named.
    const blocked = await verificationStatus(page, ruleId);
    expect(blocked.publicStatus.status).toBe('NOT_PUBLIC');
    expect(blocked.blockers).toContainEqual(
      expect.objectContaining({ code: 'SOURCE_NOT_VERIFIED', entityId: unverified.entityId }),
    );
    const early = await staffFetch(page, 'POST', `/admin/rules/${ruleId}/verify`, {
      revision: 0,
      attestations: {
        sourcesAuthentic: true,
        originalTextMatches: true,
        translationAccurate: true,
        attributionCorrect: true,
      },
      notes: null,
      reason: 'TEST too early',
    });
    expect(early.status).toBe(422);

    // The research record is verified; then the rule's four attestations are recorded.
    const verified = await staffFetch(
      page,
      'POST',
      `/admin/research/sources/${unverified.entityId}/verify`,
      verifyStep,
    );
    expect(verified.status).toBeLessThan(300);
    await verifyRule(page, ruleId, 0, 'TEST verification');
    const live = await verificationStatus(page, ruleId);
    expect(live.publicStatus.status).toBe('LIVE');
    expect(live.publicStatus.liveRevision).toBe(0);
    expect(live.currentVerified).toBe(true);
    expect(live.history.map((h) => h.reason)).toContain('TEST verification');
    const firstVersion = live.publicStatus.version ?? '';
    expect(firstVersion).toMatch(/^\d+\.0\.0$/);

    // The staff dashboard shows the Marja's active builder version.
    await page.goto(`${PUBLIC}/en/admin`);
    await expect(page.getByTestId(`builder-publication-${MARJA}`)).toContainText(
      `Version ${firstVersion}`,
    );

    // A visitor's public calculation uses the verified rule, with the trace.
    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    const result = await publicCalculation(visitor, subtypeLabel);
    const trace = result.getByTestId('verified-pack-trace');
    await expect(trace).toContainText(`${MARJA}-builder`);
    await expect(trace).toContainText(firstVersion);
    await expect(trace).toContainText(/[0-9a-f]{64}/);
    // 80.00 × 12.5 ÷ 100 = 10.00 (TEST values).
    await expect(result).toContainText('$10.00');
    await axe(visitor);

    // A revision is unverified: the public keeps the previous version until verified again.
    const revised = await staffFetch(page, 'POST', `/admin/rules/${ruleId}/revise`, {
      expectedRevision: 1,
      content: ruleContent('10'),
      reason: 'TEST revise',
    });
    expect(revised.status).toBe(200);
    const pending = await verificationStatus(page, ruleId);
    expect(pending.currentVerified).toBe(false);
    expect(pending.publicStatus.version).toBe(firstVersion);
    expect(pending.publicStatus.liveRevision).toBe(0);
    const stillFirst = await publicCalculation(visitor, subtypeLabel);
    await expect(stillFirst.getByTestId('verified-pack-trace')).toContainText(firstVersion);
    await expect(stillFirst).toContainText('$10.00');

    // Re-verified: a new version; the public calculation follows it (80.00 × 10 ÷ 100 = 8.00).
    await verifyRule(page, ruleId, 1, 'TEST re-verification');
    const again = await verificationStatus(page, ruleId);
    expect(again.publicStatus.liveRevision).toBe(1);
    const secondVersion = again.publicStatus.version ?? '';
    expect(secondVersion).not.toBe(firstVersion);
    const second = await publicCalculation(visitor, subtypeLabel);
    await expect(second.getByTestId('verified-pack-trace')).toContainText(secondVersion);
    await expect(second).toContainText('$8.00');
    await visitorContext.close();

    // Urdu (RTL) rule page, read-only.
    await page.goto(ruleUrl.replace('/en/', '/ur/'));
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('region', { name: CONTENT.rules.ur.detail.content })).toBeVisible();
    await axe(page);
  });
  test('a live rule whose research is disputed stops public figures until corrected and verified again (BLD-01)', async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one shared builder publication per API run');
    test.setTimeout(180_000);
    const subtype = (['BONUS', 'FREELANCE', 'RENTAL'] as const)[testInfo.retry % 3] ?? 'BONUS';
    const subtypeLabel = (facts.subtypes.INCOME as Readonly<Record<string, string>>)[subtype] ?? '';
    await signIn(page, KHA_SCHOLAR, PUBLIC);
    const { ruling, passage, extraPassage } = await createResearch(page);
    const extra = await extraPassage();
    const ruleContent = (sourceRefs: readonly string[]) => ({
      category: 'ANNUAL_SURPLUS',
      rulingId: ruling.entityId,
      rate: '12.5',
      includedEntries: [{ kind: 'INCOME', subtype }],
      deductions: [],
      conditions: [],
      exceptions: [],
      threshold: null,
      sourceRefs,
      requirementFlags: [],
      otherRequirement: null,
      notes: null,
    });
    const created = await staffFetch(page, 'POST', '/admin/rules', {
      marjaId: MARJA,
      content: ruleContent([extra.entityId]),
      reason: 'TEST create',
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const ruleId = (created.json as { ruleId: string }).ruleId;
    // Verified (the preview names exactly what the next version publishes) → live.
    const before = (await staffFetch(page, 'GET', `/admin/rules/${ruleId}/verification`)).json as {
      preview: unknown;
    };
    expect(JSON.stringify(before.preview)).toContain(ruleId);
    await verifyRule(page, ruleId, 0, 'TEST verification');
    expect((await verificationStatus(page, ruleId)).publicStatus.status).toBe('LIVE');
    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    // 80.00 × 12.5 ÷ 100 = 10.00 (TEST values).
    await expect(await publicCalculation(visitor, subtypeLabel)).toContainText('$10.00');

    // The passage the rule cites is disputed in research: the public gets no figures at all.
    const disputed = await staffFetch(
      page,
      'POST',
      `/admin/research/passages/${extra.entityId}/dispute`,
      {
        expectedRevision: 2,
        reason: 'TEST attribution doubted',
      },
    );
    expect(disputed.status, JSON.stringify(disputed.json)).toBe(200);
    await publicHasNoFigures(visitor);
    const suspended = await verificationStatus(page, ruleId);
    expect(suspended.publicStatus.status).toBe('SUSPENDED');
    expect(suspended.publicStatus.suspendedRules).toContainEqual(
      expect.objectContaining({ ruleId, codes: expect.arrayContaining(['PASSAGE_NOT_VERIFIED']) }),
    );

    // Corrected (the rule cites a verified passage instead) and verified again → live again.
    const revised = await staffFetch(page, 'POST', `/admin/rules/${ruleId}/revise`, {
      expectedRevision: 1,
      content: ruleContent([passage.entityId]),
      reason: 'TEST correction',
    });
    expect(revised.status, JSON.stringify(revised.json)).toBe(200);
    const pending = await verificationStatus(page, ruleId);
    expect(pending.currentVerified).toBe(false);
    expect(pending.publicStatus.liveRevision).toBe(0);
    await verifyRule(page, ruleId, 1, 'TEST re-verification');
    const relive = await verificationStatus(page, ruleId);
    expect(relive.publicStatus.status).toBe('LIVE');
    expect(relive.publicStatus.liveRevision).toBe(1);
    await expect(await publicCalculation(visitor, subtypeLabel)).toContainText('$10.00');
    await visitorContext.close();
  });
});
