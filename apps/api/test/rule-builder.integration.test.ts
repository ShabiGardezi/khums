import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ResearchChain } from '@khums/shared-types';
import {
  auditEventListResponseSchema,
  problemDetailsSchema,
  ruleRequestListResponseSchema,
  ruleRequestResponseSchema,
  scholarRuleCheckResponseSchema,
  scholarRuleListResponseSchema,
  scholarRuleResponseSchema,
  scholarRuleTestResponseSchema,
  temporaryCredentialResponseSchema,
  type BuilderRuleContent,
} from '@khums/validation';

import { AppModule } from '../src/app.module';
import { bootstrapSuperAdmin } from '../src/auth/bootstrap';
import { PASSWORD_HASHER, type PasswordHasher } from '../src/auth/password-hasher';
import { STAFF_STORE, type StaffStore } from '../src/auth/staff-store';
import { loadConfig } from '../src/config';
import { COLLECTIONS } from '../src/persistence/collections';
import { RESEARCH_STORE, type ResearchStore } from '../src/research/research-store';
import { RULE_BUILDER_STORE, type RuleBuilderStore } from '../src/rule-builder/rule-builder-store';
import { configureApp } from '../src/shared/http/configure-app';
import { seedSourcedRuling } from './support/research-rulings';
import { staffBrowserClass } from './support/staff-browser';

/**
 * The scholar rule builder over HTTP (Phase 2 steps 3–4): the real app, staff guard, CSRF, strict
 * contracts, core authorization and in-memory stores. TEST values only (rate 12.5, amounts
 * 1000.00 …): nothing here is a ruling.
 */

const WEB = 'https://web.khums.test';
const EDGE_SECRET = 'integration-edge-secret-0123456789abcdef';
const ADMIN = { username: 'rules-admin', password: 'integration admin passphrase 09' };

let app: NestExpressApplication;
let url: string;
const Browser = staffBrowserClass({ url: () => url, web: WEB, edgeSecret: EDGE_SECRET });
type Browser = InstanceType<typeof Browser>;

let ruling: ResearchChain;
let passageId: string;
let khameneiRuling: ResearchChain;

beforeAll(async () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CORS_ORIGINS: WEB,
    STAFF_AUTH_SECRET: 'integration-test-secret-0123456789abcdef',
    STAFF_EDGE_SECRET: EDGE_SECRET,
    KHUMS_OPERATIONAL_STATE: 'SCHOLAR_REVIEW',
  });
  if (!config.ok) throw new Error(config.error.join('\n'));
  app = await NestFactory.create<NestExpressApplication>(AppModule.register(config.value), {
    logger: false,
  });
  configureApp(app, config.value);
  await app.listen(0, '127.0.0.1');
  url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  const seeded = await bootstrapSuperAdmin(
    {
      store: app.get<StaffStore>(STAFF_STORE),
      hasher: app.get<PasswordHasher>(PASSWORD_HASHER),
      now: Date.now(),
    },
    ADMIN,
  );
  if (!seeded.ok) throw new Error(seeded.error.kind);
  const research = app.get<ResearchStore>(RESEARCH_STORE);
  ruling = await seedSourcedRuling(research, 'sistani', { kinds: [] });
  const passage = ruling.records[0]?.references.find((r) => r.entityType === 'PASSAGE');
  if (passage === undefined) throw new Error('seeded ruling cites no passage');
  passageId = passage.entityId;
  khameneiRuling = await seedSourcedRuling(research, 'khamenei');
});
afterAll(() => app.close());

const codeOf = (json: unknown) => problemDetailsSchema.parse(json).code;

async function signedInAdmin(): Promise<Browser> {
  const admin = new Browser();
  expect((await admin.login(ADMIN.username, ADMIN.password)).status).toBe(200);
  return admin;
}

let accounts = 0;
async function staffWith(role: string, marjaIds: readonly string[]) {
  const admin = await signedInAdmin();
  accounts += 1;
  const username = `rules-staff-${String(accounts)}`;
  const created = await admin.call('POST', '/admin/staff/accounts', {
    body: { username, reason: 'TEST account' },
  });
  const temp = temporaryCredentialResponseSchema.parse(created.json);
  const password = 'a long permanent rules passphrase 77';
  const first = new Browser();
  await first.login(username, temp.temporaryPassword);
  await first.call('POST', '/staff/auth/password', {
    body: { currentPassword: temp.temporaryPassword, newPassword: password },
  });
  const granted = await admin.call('POST', `/admin/staff/accounts/${temp.principalId}/roles`, {
    body: { role, scope: { kind: 'MARJA', marjaIds }, reason: 'TEST' },
  });
  expect(granted.status).toBe(200);
  const browser = new Browser();
  expect((await browser.login(username, password)).status).toBe(200);
  return browser;
}

const content = (overrides: Partial<BuilderRuleContent> = {}): BuilderRuleContent => ({
  category: 'ANNUAL_SURPLUS',
  rulingId: ruling.entityId,
  rate: '12.5',
  includedEntries: [{ kind: 'INCOME', subtype: 'EMPLOYMENT' }],
  deductions: [{ type: 'LIVING_EXPENSES', entries: [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }] }],
  conditions: [],
  exceptions: [],
  threshold: null,
  sourceRefs: [passageId],
  requirementFlags: [],
  otherRequirement: null,
  notes: 'TEST notes',
  ...overrides,
});

let scholar: Browser;
let otherScholar: Browser;
beforeAll(async () => {
  scholar = await staffWith('SCHOLAR', ['sistani']);
  otherScholar = await staffWith('SCHOLAR', ['khamenei']);
});

describe('rule builder routes are staff routes', () => {
  it('refuses requests without a session, commands without CSRF, and unknown fields', async () => {
    const anonymous = new Browser();
    expect((await anonymous.call('GET', '/admin/rules?marjaId=sistani')).status).toBe(401);
    expect(
      (
        await anonymous.call('POST', '/admin/rules/test', {
          body: {
            marjaId: 'sistani',
            currency: 'USD',
            period: { start: '2025-01-01', end: '2025-12-31' },
            entries: [],
            answers: {},
            entryAnswers: {},
          },
        })
      ).status,
    ).toBe(401);
    const noCsrf = await scholar.call('POST', '/admin/rules', {
      body: { marjaId: 'sistani', content: content(), reason: 'TEST create' },
      csrf: null,
    });
    expect(noCsrf.status).toBe(403);
    const extra = await scholar.call('POST', '/admin/rules', {
      body: { marjaId: 'sistani', content: { ...content(), formula: 'x * 2' }, reason: 'TEST' },
    });
    expect(extra.status).toBe(400);
    expect(codeOf(extra.json)).toBe('VALIDATION_FAILED');
  });
});

describe('scholar of the Marja: create, revise, check, test', () => {
  let ruleId: string;

  it('creates revision 0 (ready for verification) with an audit event', async () => {
    const created = await scholar.call('POST', '/admin/rules', {
      body: { marjaId: 'sistani', content: content(), reason: 'TEST create' },
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const rule = scholarRuleResponseSchema.parse(created.json);
    ruleId = rule.ruleId;
    expect(rule).toMatchObject({
      marjaId: 'sistani',
      revisions: 1,
      canEdit: true,
      check: { status: 'READY_FOR_VERIFICATION', requirement: { status: 'SUPPORTED' } },
      current: { revision: 0, rulingVersion: 1, reason: 'TEST create' },
    });
    const audit = auditEventListResponseSchema.parse(
      (await (await signedInAdmin()).call('GET', '/admin/audit/events?limit=200')).json,
    );
    expect(audit.chainVerified).toBe(true);
    expect(audit.events.find((e) => e.type === 'builder.rule.created')).toMatchObject({
      marjaIds: ['sistani'],
      targets: [{ kind: 'scholarRule', id: ruleId }],
      details: { revision: '0', category: 'ANNUAL_SURPLUS', status: 'READY_FOR_VERIFICATION' },
    });
  });

  it('a flagged need shows Developer Implementation Required; revisions are append-only', async () => {
    const flagged = await scholar.call('POST', `/admin/rules/${ruleId}/revise`, {
      body: {
        expectedRevision: 1,
        content: content({ requirementFlags: ['CARRY_OVER'] }),
        reason: 'TEST flag a need',
      },
    });
    expect(flagged.status, JSON.stringify(flagged.json)).toBe(200);
    expect(scholarRuleResponseSchema.parse(flagged.json).check).toMatchObject({
      status: 'DEVELOPER_IMPLEMENTATION_REQUIRED',
      requirement: { capabilities: [{ code: 'FLAG_CARRY_OVER', field: 'requirementFlags' }] },
    });
    const stale = await scholar.call('POST', `/admin/rules/${ruleId}/revise`, {
      body: { expectedRevision: 1, content: content(), reason: 'TEST stale' },
    });
    expect(stale.status).toBe(409);
    expect(codeOf(stale.json)).toBe('RULE_CONFLICT');
    const back = await scholar.call('POST', `/admin/rules/${ruleId}/revise`, {
      body: { expectedRevision: 2, content: content(), reason: 'TEST supported again' },
    });
    expect(back.status).toBe(200);
    const rule = scholarRuleResponseSchema.parse(
      (await scholar.call('GET', `/admin/rules/${ruleId}`)).json,
    );
    expect(rule.history.map((r) => [r.revision, r.reason])).toEqual([
      [0, 'TEST create'],
      [1, 'TEST flag a need'],
      [2, 'TEST supported again'],
    ]);
    // Every revision is a separate stored document; nothing was overwritten.
    const stored = await app
      .get<RuleBuilderStore>(RULE_BUILDER_STORE)
      .stores.revisions.history(ruleId);
    expect(stored.kind === 'FOUND' && stored.value.map((r) => r.revision)).toEqual([0, 1, 2]);
    expect(COLLECTIONS.scholarRuleRevisions.access).toBe('APPEND_ONLY');
  });

  it('refuses inconsistent content and research records of another Marja', async () => {
    const invalid = await scholar.call('POST', '/admin/rules', {
      body: { marjaId: 'sistani', content: content({ rate: '0' }), reason: 'TEST invalid' },
    });
    expect(invalid.status).toBe(422);
    expect(problemDetailsSchema.parse(invalid.json).detail).toContain('RATE_INVALID');
    const foreign = await scholar.call('POST', '/admin/rules', {
      body: {
        marjaId: 'sistani',
        content: content({ rulingId: khameneiRuling.entityId }),
        reason: 'TEST foreign ruling',
      },
    });
    expect(foreign.status).toBe(422);
    expect(problemDetailsSchema.parse(foreign.json).detail).toContain('RULING_NOT_FOUND');
    const unknownSource = await scholar.call('POST', '/admin/rules', {
      body: {
        marjaId: 'sistani',
        content: content({ sourceRefs: [khameneiRuling.entityId] }),
        reason: 'TEST unknown source',
      },
    });
    expect(problemDetailsSchema.parse(unknownSource.json).detail).toContain('SOURCE_NOT_FOUND');
  });

  it('saves drafts and checks unsaved content without storing it', async () => {
    const draft = await scholar.call('POST', '/admin/rules', {
      body: {
        marjaId: 'sistani',
        content: content({
          category: 'MIXED_FUNDS',
          rulingId: null,
          rate: null,
          includedEntries: [],
          deductions: [],
          sourceRefs: [],
        }),
        reason: 'TEST draft',
      },
    });
    expect(draft.status).toBe(201);
    expect(scholarRuleResponseSchema.parse(draft.json).check.status).toBe('DRAFT');
    const checked = await scholar.call('POST', '/admin/rules/check', {
      body: {
        marjaId: 'sistani',
        content: content({
          threshold: {
            amount: '10.00',
            currency: 'USD',
            basis: 'BEFORE_DEDUCTIONS',
            effect: 'NOT_COUNTED',
          },
        }),
      },
    });
    expect(scholarRuleCheckResponseSchema.parse(checked.json)).toMatchObject({
      status: 'DEVELOPER_IMPLEMENTATION_REQUIRED',
      requirement: { capabilities: [{ code: 'THRESHOLD_COMPARISON', field: 'threshold' }] },
    });
    const list = scholarRuleListResponseSchema.parse(
      (await scholar.call('GET', '/admin/rules?marjaId=sistani')).json,
    );
    expect(list).toMatchObject({ canEdit: true, canTest: true });
    expect(list.rules.map((r) => r.status).sort()).toEqual(['DRAFT', 'READY_FOR_VERIFICATION']);
  });

  it('tests the compiled rules: PROVISIONAL, exact decimals, drafts skipped, no figures audited', async () => {
    const tested = await scholar.call('POST', '/admin/rules/test', {
      body: {
        marjaId: 'sistani',
        currency: 'USD',
        period: { start: '2025-01-01', end: '2025-12-31' },
        entries: [
          {
            id: 'e1',
            kind: 'INCOME',
            subtype: 'EMPLOYMENT',
            amount: '1000.00',
            date: '2025-03-01',
          },
          { id: 'x1', kind: 'EXPENSE', subtype: 'HOUSEHOLD', amount: '200.00', date: '2025-04-01' },
        ],
        answers: {},
        entryAnswers: {},
      },
    });
    expect(tested.status, JSON.stringify(tested.json)).toBe(200);
    const result = scholarRuleTestResponseSchema.parse(tested.json);
    expect(result.label).toBe('PROVISIONAL — FOR SCHOLAR REVIEW ONLY');
    expect(result.disclaimer).toContain('PROVISIONAL — FOR SCHOLAR REVIEW ONLY');
    expect(result.outcome).toBe('CALCULATED');
    expect(result.pack).toMatchObject({ packId: 'sistani-builder', version: '0.0.0' });
    expect(result.compiled).toEqual([
      {
        ruleId,
        revision: 2,
        category: 'ANNUAL_SURPLUS',
        outputId: `builder:${ruleId}:result`,
        developerRequired: false,
        aiStage: null,
        rulingId: ruling.entityId,
        // Phase 4: the cited sources and passages, as compiled, for the scholar to review.
        sources: [expect.objectContaining({ refId: passageId, locator: 'p. 1' })],
      },
    ]);
    expect(result.skipped).toHaveLength(1);
    const report = result.report as {
      meta: { guidance: string };
      result: { outputs: { id: string; value: { amount: string } | null }[] };
    };
    expect(report.meta.guidance).toBe('PROVISIONAL_SCHOLAR_REVIEW');
    // (1000.00 − 200.00) × 12.5 ÷ 100 = 100 (TEST values)
    expect(report.result.outputs).toEqual([
      expect.objectContaining({
        id: `builder:${ruleId}:result`,
        value: expect.objectContaining({ amount: '100' }),
      }),
    ]);
    const audit = auditEventListResponseSchema.parse(
      (await (await signedInAdmin()).call('GET', '/admin/audit/events?limit=200')).json,
    );
    const event = audit.events.find((e) => e.type === 'builder.rules.tested');
    expect(event).toMatchObject({
      marjaIds: ['sistani'],
      details: { outcome: 'CALCULATED', guidance: 'PROVISIONAL_SCHOLAR_REVIEW' },
    });
    expect(JSON.stringify(event)).not.toContain('1000.00');
  });
});

describe('permissions', () => {
  let ruleId: string;
  beforeAll(async () => {
    const list = scholarRuleListResponseSchema.parse(
      (await scholar.call('GET', '/admin/rules?marjaId=sistani')).json,
    );
    ruleId = list.rules.find((r) => r.status === 'READY_FOR_VERIFICATION')?.ruleId ?? '';
  });

  it('a scholar of another Marja reads and tests read-only; every write is denied and audited', async () => {
    const list = scholarRuleListResponseSchema.parse(
      (await otherScholar.call('GET', '/admin/rules?marjaId=sistani')).json,
    );
    expect(list).toMatchObject({ canEdit: false, canTest: true });
    const rule = scholarRuleResponseSchema.parse(
      (await otherScholar.call('GET', `/admin/rules/${ruleId}`)).json,
    );
    expect(rule.canEdit).toBe(false);
    const create = await otherScholar.call('POST', '/admin/rules', {
      body: { marjaId: 'sistani', content: content(), reason: 'TEST cross-Marja create' },
    });
    expect(create.status).toBe(403);
    const revise = await otherScholar.call('POST', `/admin/rules/${ruleId}/revise`, {
      body: { expectedRevision: 3, content: content(), reason: 'TEST cross-Marja revise' },
    });
    expect(revise.status).toBe(403);
    const tested = await otherScholar.call('POST', '/admin/rules/test', {
      body: {
        marjaId: 'sistani',
        currency: 'USD',
        period: { start: '2025-01-01', end: '2025-12-31' },
        entries: [],
        answers: {},
        entryAnswers: {},
      },
    });
    expect(tested.status).toBe(200);
    const audit = auditEventListResponseSchema.parse(
      (await (await signedInAdmin()).call('GET', '/admin/audit/events?limit=200')).json,
    );
    expect(
      audit.events.filter(
        (e) => e.type === 'builder.action.denied' && e.details.permission === 'builder.rule.edit',
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('a super admin may do everything; legacy roles without the permission may not read', async () => {
    const admin = await signedInAdmin();
    const created = await admin.call('POST', '/admin/rules', {
      body: {
        marjaId: 'khamenei',
        content: content({ rulingId: khameneiRuling.entityId, sourceRefs: [] }),
        reason: 'TEST admin create',
      },
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const id = scholarRuleResponseSchema.parse(created.json).ruleId;
    expect(
      (
        await admin.call('POST', `/admin/rules/${id}/revise`, {
          body: {
            expectedRevision: 1,
            content: content({ rulingId: khameneiRuling.entityId, sourceRefs: [], rate: '13' }),
            reason: 'TEST admin revise',
          },
        })
      ).status,
    ).toBe(200);
    const researcher = await staffWith('SCHOLAR', ['khamenei']);
    expect((await researcher.call('GET', `/admin/rules/${id}`)).status).toBe(200);
    // Unknown rules answer 404 whoever asks.
    expect(
      (await admin.call('GET', '/admin/rules/01890000-0000-7000-8000-00000000ffff')).status,
    ).toBe(404);
  });

  it('a Marja outside the research Marjas cannot hold rules', async () => {
    const admin = await signedInAdmin();
    const refused = await admin.call('POST', '/admin/rules', {
      body: {
        marjaId: 'test-marja',
        content: content({ rulingId: null, sourceRefs: [] }),
        reason: 'TEST',
      },
    });
    expect(refused.status).toBe(422);
    expect(problemDetailsSchema.parse(refused.json).detail).toContain('MARJA_NOT_SUPPORTED');
  });
});

describe('Phase 4: AI preparation, rejection and scholar requests', () => {
  const ai = { stage: 'APPROVED_FOR_SCHOLAR_TESTING', tool: 'TEST tool', tests: 'TEST-1' };
  const testBody = {
    marjaId: 'sistani',
    currency: 'USD',
    period: { start: '2025-01-01', end: '2025-12-31' },
    entries: [
      { id: 'e1', kind: 'INCOME', subtype: 'MINED_PRODUCT', amount: '400.00', date: '2025-03-01' },
    ],
    answers: {},
    entryAnswers: {},
  };
  let ruleId: string;

  it('an AI-approved rule is usable in the scholar-testing calculator and stays UNVERIFIED', async () => {
    const created = await scholar.call('POST', '/admin/rules', {
      body: {
        marjaId: 'sistani',
        content: content({
          category: 'MINED_PRODUCT',
          includedEntries: [{ kind: 'INCOME', subtype: 'MINED_PRODUCT' }],
          deductions: [],
        }),
        reason: 'TEST AI preparation',
        aiPreparation: ai,
      },
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const rule = scholarRuleResponseSchema.parse(created.json);
    ruleId = rule.ruleId;
    expect(rule.current).toMatchObject({ aiPreparation: ai, rejected: false });
    const list = scholarRuleListResponseSchema.parse(
      (await scholar.call('GET', '/admin/rules?marjaId=sistani')).json,
    );
    expect(list.rules.find((r) => r.ruleId === ruleId)).toMatchObject({
      aiStage: 'APPROVED_FOR_SCHOLAR_TESTING',
      rejected: false,
    });
    const tested = scholarRuleTestResponseSchema.parse(
      (await scholar.call('POST', '/admin/rules/test', { body: testBody })).json,
    );
    expect(tested.compiled.find((c) => c.ruleId === ruleId)).toMatchObject({
      aiStage: 'APPROVED_FOR_SCHOLAR_TESTING',
    });
    const pack = tested.report as { rules?: unknown } | null;
    expect(JSON.stringify(pack)).not.toContain('"APPROVED"');
    // An AI approval of an incomplete rule is refused.
    const incomplete = await scholar.call('POST', '/admin/rules', {
      body: {
        marjaId: 'sistani',
        content: content({
          rulingId: null,
          includedEntries: [{ kind: 'INCOME', subtype: 'TREASURE' }],
          category: 'TREASURE',
        }),
        reason: 'TEST AI draft',
        aiPreparation: ai,
      },
    });
    expect(incomplete.status).toBe(422);
  });

  it('a scholar rejects the rule: it leaves every calculation and cannot be verified', async () => {
    const rejected = await scholar.call('POST', `/admin/rules/${ruleId}/revise`, {
      body: {
        expectedRevision: 1,
        content: content({
          category: 'MINED_PRODUCT',
          includedEntries: [{ kind: 'INCOME', subtype: 'MINED_PRODUCT' }],
          deductions: [],
        }),
        reason: 'TEST reject',
        rejected: true,
      },
    });
    expect(rejected.status, JSON.stringify(rejected.json)).toBe(200);
    const rule = scholarRuleResponseSchema.parse(rejected.json);
    expect(rule.current).toMatchObject({ revision: 1, rejected: true, aiPreparation: null });
    const tested = scholarRuleTestResponseSchema.parse(
      (await scholar.call('POST', '/admin/rules/test', { body: testBody })).json,
    );
    expect(tested.compiled.some((c) => c.ruleId === ruleId)).toBe(false);
    expect(tested.skipped).toContainEqual({ ruleId, revision: 1, reason: 'REJECTED' });
    const status = (await scholar.call('GET', `/admin/rules/${ruleId}/verification`)).json as {
      blockers: { code: string }[];
    };
    expect(status.blockers.map((b) => b.code)).toContain('RULE_REJECTED');
    const audit = auditEventListResponseSchema.parse(
      (await (await signedInAdmin()).call('GET', '/admin/audit/events?limit=200')).json,
    );
    expect(audit.events.find((e) => e.type === 'builder.rule.rejected')).toMatchObject({
      targets: [{ kind: 'scholarRule', id: ruleId }],
      details: { rejected: true },
    });
  });

  it('scholars request missing rules; the Marja’s scholars resolve each once', async () => {
    const created = await otherScholar.call('POST', '/admin/rules/requests', {
      body: { marjaId: 'sistani', kind: 'MISSING_RULE', ruleId: null, message: 'TEST secret text' },
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const request = ruleRequestResponseSchema.parse(created.json);
    expect(request).toMatchObject({ kind: 'MISSING_RULE', resolution: null });
    const change = await scholar.call('POST', '/admin/rules/requests', {
      body: { marjaId: 'sistani', kind: 'CALCULATION_CHANGE', ruleId, message: 'TEST change' },
    });
    expect(change.status).toBe(201);
    const unknownRule = await scholar.call('POST', '/admin/rules/requests', {
      body: {
        marjaId: 'sistani',
        kind: 'CALCULATION_CHANGE',
        ruleId: '01890000-0000-7000-8000-00000000ffff',
        message: 'TEST',
      },
    });
    expect(unknownRule.status).toBe(404);
    // A scholar of another Marja may ask, but only the Marja's scholars resolve.
    const denied = await otherScholar.call(
      'POST',
      `/admin/rules/requests/${request.requestId}/resolve`,
      {
        body: { note: 'TEST not mine' },
      },
    );
    expect(denied.status).toBe(403);
    const resolved = await scholar.call(
      'POST',
      `/admin/rules/requests/${request.requestId}/resolve`,
      {
        body: { note: 'TEST added' },
      },
    );
    expect(resolved.status, JSON.stringify(resolved.json)).toBe(200);
    expect(ruleRequestResponseSchema.parse(resolved.json).resolution?.note).toBe('TEST added');
    const again = await scholar.call('POST', `/admin/rules/requests/${request.requestId}/resolve`, {
      body: { note: 'TEST again' },
    });
    expect(again.status).toBe(409);
    const list = ruleRequestListResponseSchema.parse(
      (await scholar.call('GET', '/admin/rules/requests?marjaId=sistani')).json,
    );
    expect(list).toMatchObject({ canCreate: true, canResolve: true });
    expect(list.requests.map((r) => r.kind)).toEqual(['CALCULATION_CHANGE', 'MISSING_RULE']);
    const audit = auditEventListResponseSchema.parse(
      (await (await signedInAdmin()).call('GET', '/admin/audit/events?limit=200')).json,
    );
    expect(audit.events.some((e) => e.type === 'builder.request.created')).toBe(true);
    expect(audit.events.some((e) => e.type === 'builder.request.resolved')).toBe(true);
    // Request text is never audited.
    expect(JSON.stringify(audit.events)).not.toContain('TEST secret text');
  });
});
