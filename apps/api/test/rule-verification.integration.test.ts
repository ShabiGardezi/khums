import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { builderTestSheet, checkPublicPackBundle, runVerifiedAssessment } from '@khums/core';
import type { ResearchChain } from '@khums/shared-types';
import {
  auditEventListResponseSchema,
  builderPublicationListResponseSchema,
  problemDetailsSchema,
  publicVerifiedPackResponseSchema,
  ruleVerificationResponseSchema,
  ruleVerificationStatusResponseSchema,
  scholarRuleResponseSchema,
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
import { configureApp } from '../src/shared/http/configure-app';
import {
  advanceRuling,
  seedSource,
  seedSourcedRuling,
  seedSourcedRulingChains,
  verifyStoredSource,
} from './support/research-rulings';
import { staffBrowserClass } from './support/staff-browser';

/**
 * Source verification → automatic approval → public availability (Phase 2 step 5, decisions 63
 * and 67) over HTTP on one PRODUCTION_APPROVED deployment: the real app, staff guard, CSRF,
 * strict contracts, core authorization and in-memory stores. SYNTHETIC research records and TEST
 * values only (rate 12.5, amounts 200.00 …): nothing here is a ruling of any Marja.
 */

const WEB = 'https://web.khums.test';
const EDGE_SECRET = 'integration-edge-secret-0123456789abcdef';
const ADMIN = { username: 'verify-admin', password: 'integration admin passphrase 11' };

let app: NestExpressApplication;
let url: string;
let research: ResearchStore;
const Browser = staffBrowserClass({ url: () => url, web: WEB, edgeSecret: EDGE_SECRET });
type Browser = InstanceType<typeof Browser>;

let ruling: ResearchChain;
let draftSource: ResearchChain;

beforeAll(async () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CORS_ORIGINS: WEB,
    STAFF_AUTH_SECRET: 'integration-test-secret-0123456789abcdef',
    STAFF_EDGE_SECRET: EDGE_SECRET,
    KHUMS_OPERATIONAL_STATE: 'PRODUCTION_APPROVED',
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
  research = app.get<ResearchStore>(RESEARCH_STORE);
  // A DRAFT ruling on VERIFIED evidence, and a further TEST source that is still unverified.
  ruling = await seedSourcedRuling(research, 'sistani', { kinds: [] });
  draftSource = await seedSource(research, 'sistani');
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
  const username = `verify-staff-${String(accounts)}`;
  const created = await admin.call('POST', '/admin/staff/accounts', {
    body: { username, reason: 'TEST account' },
  });
  const temp = temporaryCredentialResponseSchema.parse(created.json);
  const password = 'a long permanent verify passphrase 77';
  const first = new Browser();
  await first.login(username, temp.temporaryPassword);
  await first.call('POST', '/staff/auth/password', {
    body: { currentPassword: temp.temporaryPassword, newPassword: password },
  });
  const granted = await admin.call('POST', `/admin/staff/accounts/${temp.principalId}/roles`, {
    body: { role, scope: { kind: 'MARJA', marjaIds }, reason: 'TEST' },
  });
  expect(granted.status).toBe(200);
  const assignmentId =
    (granted.json as { roles: { assignmentId: string; role: string }[] }).roles.find(
      (r) => r.role === role,
    )?.assignmentId ?? '';
  const browser = new Browser();
  expect((await browser.login(username, password)).status).toBe(200);
  return { browser, principalId: temp.principalId, assignmentId };
}

const content = (overrides: Partial<BuilderRuleContent> = {}): BuilderRuleContent => ({
  category: 'ANNUAL_SURPLUS',
  rulingId: ruling.entityId,
  rate: '12.5',
  includedEntries: [{ kind: 'INCOME', subtype: 'EMPLOYMENT' }],
  deductions: [],
  conditions: [],
  exceptions: [],
  threshold: null,
  sourceRefs: [draftSource.entityId],
  requirementFlags: [],
  otherRequirement: null,
  notes: null,
  ...overrides,
});

const ATTESTED = {
  sourcesAuthentic: true,
  originalTextMatches: true,
  translationAccurate: true,
  attributionCorrect: true,
};
const verifyBody = (revision: number) => ({
  revision,
  attestations: ATTESTED,
  notes: 'TEST notes',
  reason: 'TEST verification',
});

async function publicPack(marjaId = 'sistani') {
  const response = await new Browser().call('GET', `/public/marjas/${marjaId}/pack`);
  expect(response.status).toBe(200);
  return publicVerifiedPackResponseSchema.parse(response.json);
}

/** Every audit event (admin reads the whole chain). */
async function auditEvents(admin: Browser) {
  const events = [];
  let after = -1;
  for (;;) {
    const page = auditEventListResponseSchema.parse(
      (await admin.call('GET', `/admin/audit/events?limit=200&afterSequence=${String(after)}`))
        .json,
    );
    expect(page.chainVerified).toBe(true);
    events.push(...page.events);
    if (page.nextAfterSequence === null) break;
    after = page.nextAfterSequence;
  }
  return events;
}

const sheet = (amount: string) =>
  builderTestSheet({
    marjaId: 'sistani',
    currency: 'USD',
    period: { start: '2025-01-01', end: '2025-12-31' },
    entries: [{ id: 'e1', kind: 'INCOME', subtype: 'EMPLOYMENT', amount, date: '2025-06-01' }],
    answers: {},
    entryAnswers: {},
  });

describe('source verification → automatic approval → public calculator', () => {
  it('runs the whole lifecycle with permissions, binding, versions, privacy and withdrawal', async () => {
    const scholar = await staffWith('SCHOLAR', ['sistani']);
    const other = await staffWith('SCHOLAR', ['khamenei']);
    const admin = await signedInAdmin();
    const anonymous = new Browser();

    const created = await scholar.browser.call('POST', '/admin/rules', {
      body: { marjaId: 'sistani', content: content(), reason: 'TEST create' },
    });
    expect(created.status).toBe(201);
    const rule = scholarRuleResponseSchema.parse(created.json);
    const base = `/admin/rules/${rule.ruleId}`;

    // Staff routes only.
    expect((await anonymous.call('GET', `${base}/verification`)).status).toBe(401);
    expect((await anonymous.call('POST', `${base}/verify`, { body: verifyBody(0) })).status).toBe(
      401,
    );

    // The cited research is not VERIFIED yet: blocked, with the record named.
    const blocked = ruleVerificationStatusResponseSchema.parse(
      (await scholar.browser.call('GET', `${base}/verification`)).json,
    );
    expect(blocked).toMatchObject({
      currentRevision: 0,
      currentVerified: false,
      canVerify: true,
      publicStatus: { status: 'NOT_PUBLIC' },
    });
    expect(blocked.blockers).toEqual([
      {
        code: 'SOURCE_NOT_VERIFIED',
        entityType: 'SOURCE',
        entityId: draftSource.entityId,
        state: 'DRAFT',
      },
    ]);
    const refusedNow = await scholar.browser.call('POST', `${base}/verify`, {
      body: verifyBody(0),
    });
    expect(refusedNow.status).toBe(422);
    expect(codeOf(refusedNow.json)).toBe('RULE_VERIFICATION_REFUSED');
    expect(await publicPack()).toEqual({ status: 'NOT_AVAILABLE', marjaId: 'sistani' });

    // The scholar verifies the research record; the preconditions now pass.
    await verifyStoredSource(research, draftSource);
    const ready = ruleVerificationStatusResponseSchema.parse(
      (await scholar.browser.call('GET', `${base}/verification`)).json,
    );
    expect(ready.blockers).toEqual([]);

    // A scholar of another Marja may read, never verify (audited denial); strict contract.
    const otherStatus = ruleVerificationStatusResponseSchema.parse(
      (await other.browser.call('GET', `${base}/verification`)).json,
    );
    expect(otherStatus.canVerify).toBe(false);
    const denied = await other.browser.call('POST', `${base}/verify`, { body: verifyBody(0) });
    expect(denied.status).toBe(403);
    const unattested = await scholar.browser.call('POST', `${base}/verify`, {
      body: { ...verifyBody(0), attestations: { ...ATTESTED, translationAccurate: false } },
    });
    expect(unattested.status).toBe(400);
    const extra = await scholar.browser.call('POST', `${base}/verify`, {
      body: { ...verifyBody(0), actor: 'ai-assistant' },
    });
    expect(extra.status).toBe(400);
    const stale = await scholar.browser.call('POST', `${base}/verify`, { body: verifyBody(1) });
    expect(stale.status).toBe(409);

    // Verified: approved automatically and live as sistani-builder 1.0.0.
    const verified = await scholar.browser.call('POST', `${base}/verify`, { body: verifyBody(0) });
    expect(verified.status, JSON.stringify(verified.json)).toBe(200);
    const first = ruleVerificationResponseSchema.parse(verified.json);
    expect(first.verification).toMatchObject({
      revision: 0,
      actor: scholar.principalId,
      attestations: ATTESTED,
      publication: { packId: 'sistani-builder', version: '1.0.0' },
    });
    expect(first.status).toMatchObject({
      currentVerified: true,
      publicStatus: { status: 'LIVE', version: '1.0.0', liveRevision: 0 },
    });

    // The existing ledger ran automatically under the builder policy, verifier as actor.
    const ledger = (
      await scholar.browser.call('GET', '/admin/governance/packs/sistani-builder/versions/1.0.0')
    ).json as {
      policy: string;
      activated: boolean;
      records: { type: string; actor: { subject: string } }[];
    };
    expect(ledger.policy).toBe('SOURCE_VERIFIED_AUTO_V1');
    expect(ledger.activated).toBe(true);
    expect(ledger.records.map((r) => r.type)).toEqual([
      'SUBMITTED',
      'REVIEW_STARTED',
      'REVIEW_COMPLETED',
      'APPROVED',
      'PUBLISHED',
      'ACTIVATED',
    ]);
    expect(new Set(ledger.records.map((r) => r.actor.subject))).toEqual(
      new Set([scholar.principalId]),
    );

    // Public: only verified content, no ledger, no staff ids; the browser re-check calculates.
    const available = await publicPack();
    if (available.status !== 'AVAILABLE') throw new Error('expected the builder pack');
    expect(available).not.toHaveProperty('ledger');
    expect(JSON.stringify(available)).not.toContain(scholar.principalId);
    expect(available.summary).toMatchObject({
      packId: 'sistani-builder',
      version: '1.0.0',
      rules: [{ ruleId: `builder:${rule.ruleId}`, verified: true }],
    });
    const checked = checkPublicPackBundle(available.pack, available.summary);
    expect(checked.ok).toBe(true);
    const run = runVerifiedAssessment(sheet('200.00'), available);
    if (run.kind !== 'CALCULATED' || run.report.workflow === 'missed-year') {
      throw new Error(run.kind);
    }
    expect(run.report.meta.guidance).toBe('APPROVED_RULE_PACK');
    expect(run.report.result.outputs[0]?.value?.amount).toBe('25');

    // Audit: the verification and each automatic ledger record.
    const events = [];
    let after = -1;
    for (;;) {
      const page = auditEventListResponseSchema.parse(
        (await admin.call('GET', `/admin/audit/events?limit=200&afterSequence=${String(after)}`))
          .json,
      );
      expect(page.chainVerified).toBe(true);
      events.push(...page.events);
      if (page.nextAfterSequence === null) break;
      after = page.nextAfterSequence;
    }
    const audit = { events };
    const types = audit.events.map((e) => e.type);
    expect(types).toContain('builder.rule.verified');
    expect(types).toContain('builder.action.denied');
    const activated = audit.events.find(
      (e) => e.type === 'governance.pack.activated' && e.details.automatic === true,
    );
    expect(activated?.actor).toBe(scholar.principalId);
    expect(activated?.details.sourceVerification).toBe(first.verification.verificationId);

    // A revision after verification is unverified; the public keeps the previous version.
    const revised = await scholar.browser.call('POST', `${base}/revise`, {
      body: { expectedRevision: 1, content: content({ rate: '10' }), reason: 'TEST revise' },
    });
    expect(revised.status).toBe(200);
    const afterRevision = ruleVerificationStatusResponseSchema.parse(
      (await scholar.browser.call('GET', `${base}/verification`)).json,
    );
    expect(afterRevision).toMatchObject({
      currentRevision: 1,
      currentVerified: false,
      publicStatus: { status: 'LIVE', version: '1.0.0', liveRevision: 0 },
    });
    const stillFirst = await publicPack();
    expect(stillFirst.status === 'AVAILABLE' && stillFirst.summary.version).toBe('1.0.0');
    expect(stillFirst.status === 'AVAILABLE' && stillFirst.summary.contentDigest).toBe(
      available.summary.contentDigest,
    );

    // A SUPER_ADMIN verifies revision 1: version 2.0.0 supersedes 1.0.0.
    const second = await admin.call('POST', `${base}/verify`, { body: verifyBody(1) });
    expect(second.status, JSON.stringify(second.json)).toBe(200);
    expect(ruleVerificationResponseSchema.parse(second.json).verification.publication.version).toBe(
      '2.0.0',
    );
    const v1 = (
      await scholar.browser.call('GET', '/admin/governance/packs/sistani-builder/versions/1.0.0')
    ).json as { state: string };
    expect(v1.state).toBe('SUPERSEDED');
    const nowSecond = await publicPack();
    expect(nowSecond.status === 'AVAILABLE' && nowSecond.summary.version).toBe('2.0.0');
    if (nowSecond.status !== 'AVAILABLE') throw new Error('expected version 2.0.0');
    const secondRun = runVerifiedAssessment(sheet('200.00'), nowSecond);
    expect(
      secondRun.kind === 'CALCULATED' &&
        secondRun.report.workflow !== 'missed-year' &&
        secondRun.report.result.outputs[0]?.value?.amount,
    ).toBe('20');

    // The staff dashboard summary.
    const publications = builderPublicationListResponseSchema.parse(
      (await scholar.browser.call('GET', '/admin/rules/publications')).json,
    );
    expect(publications.marjas.find((m) => m.marjaId === 'sistani')).toMatchObject({
      active: { version: '2.0.0', ruleIds: [rule.ruleId] },
    });

    // Builder packs are never submitted by hand.
    const handSubmitted = await scholar.browser.call(
      'POST',
      '/admin/governance/packs/sistani-builder/versions/9.0.0/submit',
      { body: { expectedSequence: 0, pack: available.pack } },
    );
    expect(handSubmitted.status).toBeGreaterThanOrEqual(400);
    expect(handSubmitted.status).toBeLessThan(500);

    // SUPER_ADMIN emergency withdrawal through the existing ledger command: nothing public.
    const emergency = await admin.call(
      'POST',
      '/admin/governance/packs/sistani-builder/versions/2.0.0/emergency-withdraw',
      { body: { expectedSequence: 6, reason: 'ERROR_FOUND', note: 'TEST emergency withdrawal' } },
    );
    expect(emergency.status, JSON.stringify(emergency.json)).toBe(200);
    expect(await publicPack()).toEqual({ status: 'NOT_AVAILABLE', marjaId: 'sistani' });

    // Re-verification publishes 3.0.0; the scholar's own withdrawal also stops public use.
    const third = await scholar.browser.call('POST', `${base}/verify`, { body: verifyBody(1) });
    expect(third.status, JSON.stringify(third.json)).toBe(200);
    expect(ruleVerificationResponseSchema.parse(third.json).verification.publication.version).toBe(
      '3.0.0',
    );
    expect((await publicPack()).status).toBe('AVAILABLE');
    const withdrawn = await scholar.browser.call(
      'POST',
      '/admin/governance/packs/sistani-builder/versions/3.0.0/withdraw',
      { body: { expectedSequence: 6, reason: 'ERROR_FOUND' } },
    );
    expect(withdrawn.status, JSON.stringify(withdrawn.json)).toBe(200);
    expect(await publicPack()).toEqual({ status: 'NOT_AVAILABLE', marjaId: 'sistani' });
  });

  it('re-checks a live version against current research on every serve; findings, repeats, revoked verifiers, notes and refusals (audit fixes)', async () => {
    const MARJA = 'khamenei';
    const chains = await seedSourcedRulingChains(research, MARJA, { kinds: [] });
    const extra = await seedSource(research, MARJA, true);
    const scholar = await staffWith('SCHOLAR', [MARJA]);
    const colleague = await staffWith('SCHOLAR', [MARJA]);
    const admin = await signedInAdmin();
    const ruleContent = (overrides: Partial<BuilderRuleContent> = {}) =>
      content({
        rulingId: chains.ruling.entityId,
        sourceRefs: [extra.entityId],
        notes: 'TEST-MARKER-RULE-NOTES',
        ...overrides,
      });
    const create = async (by: Browser, overrides: Partial<BuilderRuleContent>) => {
      const made = await by.call('POST', '/admin/rules', {
        body: { marjaId: MARJA, content: ruleContent(overrides), reason: 'TEST create' },
      });
      expect(made.status, JSON.stringify(made.json)).toBe(201);
      return scholarRuleResponseSchema.parse(made.json).ruleId;
    };
    const statusOf = async (ruleId: string) =>
      ruleVerificationStatusResponseSchema.parse(
        (await scholar.browser.call('GET', `/admin/rules/${ruleId}/verification`)).json,
      );
    const versions = async () =>
      builderPublicationListResponseSchema
        .parse((await scholar.browser.call('GET', '/admin/rules/publications')).json)
        .marjas.find((m) => m.marjaId === MARJA);

    // BLD-03: before verifying, a preview of what the next version includes and withholds.
    const a = await create(scholar.browser, {});
    const ready = await statusOf(a);
    expect(ready.blockers).toEqual([]);
    expect(ready.preview).toEqual({
      nextVersion: '1.0.0',
      included: [{ ruleId: a, revision: 0 }],
      withheld: [],
      removedFromPublic: [],
    });
    const first = await scholar.browser.call('POST', `/admin/rules/${a}/verify`, {
      body: verifyBody(0),
    });
    expect(first.status, JSON.stringify(first.json)).toBe(200);
    const live = await publicPack(MARJA);
    if (live.status !== 'AVAILABLE') throw new Error('expected the builder pack');
    // SEC-01: free-text notes never reach public pack content.
    expect(JSON.stringify(live)).not.toContain('TEST-MARKER-RULE-NOTES');

    // SEC-03 + BLD-09: re-verifying the live, identical revision is refused and audited.
    const repeat = await scholar.browser.call('POST', `/admin/rules/${a}/verify`, {
      body: verifyBody(0),
    });
    expect(repeat.status).toBe(422);
    expect(codeOf(repeat.json)).toBe('ALREADY_VERIFIED');
    expect((await versions())?.versions.map((v) => v.version)).toEqual(['1.0.0']);
    const refusedRepeat = (await auditEvents(admin)).find(
      (e) => e.type === 'builder.rule.verification.refused' && e.targets[0]?.id === a,
    );
    expect(refusedRepeat?.details).toMatchObject({ codes: ['ALREADY_VERIFIED'], revision: '0' });

    // BLD-01: research the live rule rests on is disputed → the version is not served.
    const disputed = await admin.call('POST', `/admin/research/sources/${extra.entityId}/dispute`, {
      body: { expectedRevision: 2, reason: 'TEST attribution doubted' },
    });
    expect(disputed.status, JSON.stringify(disputed.json)).toBe(200);
    expect(await publicPack(MARJA)).toEqual({ status: 'NOT_AVAILABLE', marjaId: MARJA });
    const catalogue = (await new Browser().call('GET', '/public/marjas')).json as {
      marjas: { marjaId: string; verifiedPack: unknown }[];
    };
    expect(catalogue.marjas.find((m) => m.marjaId === MARJA)?.verifiedPack).toBeNull();
    const suspended = await statusOf(a);
    expect(suspended.publicStatus).toMatchObject({
      status: 'SUSPENDED',
      version: '1.0.0',
      liveRevision: 0,
    });
    expect(suspended.publicStatus.suspendedRules).toEqual([
      { ruleId: a, codes: ['SOURCE_NOT_VERIFIED'] },
    ]);
    expect(await versions()).toMatchObject({
      active: { version: '1.0.0', suspended: true, suspendedRules: [{ ruleId: a }] },
    });
    const suspensionEvents = (await auditEvents(admin)).filter(
      (e) => e.type === 'builder.pack.suspended' && e.marjaIds.includes(MARJA),
    );
    expect(suspensionEvents).toHaveLength(1);
    expect(suspensionEvents[0]?.details).toMatchObject({
      ruleIds: [`builder:${a}`],
      codes: ['SOURCE_NOT_VERIFIED'],
    });

    // Corrected (the disputed source is no longer cited) and verified again → live again.
    const revised = await scholar.browser.call('POST', `/admin/rules/${a}/revise`, {
      body: {
        expectedRevision: 1,
        content: ruleContent({ sourceRefs: [chains.passage.entityId] }),
        reason: 'TEST correction',
      },
    });
    expect(revised.status).toBe(200);
    const reverified = await scholar.browser.call('POST', `/admin/rules/${a}/verify`, {
      body: verifyBody(1),
    });
    expect(reverified.status, JSON.stringify(reverified.json)).toBe(200);
    const again = await publicPack(MARJA);
    expect(again.status === 'AVAILABLE' && again.summary.version).toBe('2.0.0');
    expect((await statusOf(a)).publicStatus).toMatchObject({ status: 'LIVE', liveRevision: 1 });

    // BLD-02: a ruling resting on a withdrawn finding cannot be verified (refusal audited).
    const otherChains = await seedSourcedRulingChains(research, MARJA, { kinds: [] });
    await advanceRuling(research, otherChains.finding, ['APPROVED', 'WITHDRAWN']);
    const b = await create(scholar.browser, {
      rulingId: otherChains.ruling.entityId,
      sourceRefs: [otherChains.passage.entityId],
      includedEntries: [{ kind: 'INCOME', subtype: 'GIFT' }],
    });
    const blockedB = await statusOf(b);
    expect(blockedB.blockers).toContainEqual({
      code: 'FINDING_NOT_CURRENT',
      entityType: 'FINDING',
      entityId: otherChains.finding.entityId,
      state: 'WITHDRAWN',
    });
    expect(blockedB.preview).toBeNull();
    const refusedB = await scholar.browser.call('POST', `/admin/rules/${b}/verify`, {
      body: verifyBody(0),
    });
    expect(refusedB.status).toBe(422);
    expect(codeOf(refusedB.json)).toBe('RULE_VERIFICATION_REFUSED');
    const refusedEvent = (await auditEvents(admin)).find(
      (e) => e.type === 'builder.rule.verification.refused' && e.targets[0]?.id === b,
    );
    expect(refusedEvent?.details.codes).toContain('FINDING_NOT_CURRENT');
    expect(JSON.stringify(refusedEvent)).not.toContain('TEST-MARKER');

    // BLD-07: a verification whose verifier lost the role stops counting at the next publication.
    const c = await create(colleague.browser, {
      sourceRefs: [chains.passage.entityId],
      includedEntries: [{ kind: 'INCOME', subtype: 'CHARITY_RECEIVED' }],
    });
    const byColleague = await colleague.browser.call('POST', `/admin/rules/${c}/verify`, {
      body: verifyBody(0),
    });
    expect(byColleague.status, JSON.stringify(byColleague.json)).toBe(200);
    const revoked = await admin.call(
      'POST',
      `/admin/staff/accounts/${colleague.principalId}/roles/${colleague.assignmentId}/revoke`,
      { body: { reason: 'TEST role ended' } },
    );
    expect(revoked.status, JSON.stringify(revoked.json)).toBe(200);
    expect((await statusOf(c)).currentVerified).toBe(false);
    const d = await create(scholar.browser, {
      sourceRefs: [chains.passage.entityId],
      includedEntries: [{ kind: 'INCOME', subtype: 'OTHER' }],
    });
    const dPreview = (await statusOf(d)).preview;
    expect(dPreview?.withheld).toContainEqual({
      ruleId: c,
      revision: 0,
      reason: 'VERIFIER_NOT_AUTHORIZED',
    });
    expect(dPreview?.removedFromPublic).toEqual([c]);
    const byScholar = await scholar.browser.call('POST', `/admin/rules/${d}/verify`, {
      body: verifyBody(0),
    });
    expect(byScholar.status, JSON.stringify(byScholar.json)).toBe(200);
    const latest = await publicPack(MARJA);
    if (latest.status !== 'AVAILABLE') throw new Error('expected the builder pack');
    expect(latest.summary.rules.map((r) => r.ruleId).sort()).toEqual(
      [`builder:${a}`, `builder:${d}`].sort(),
    );
  });

  it('declares the verification collection append-only', () => {
    expect(COLLECTIONS.ruleVerificationRecords.access).toBe('APPEND_ONLY');
  });
});
