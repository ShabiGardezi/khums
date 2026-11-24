import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sealRulePack } from '@khums/core';
import type { RulePack } from '@khums/shared-types';
import {
  auditEventListResponseSchema,
  governancePackListResponseSchema,
  governancePackVersionSchema,
  governancePolicyRegistryResponseSchema,
  problemDetailsSchema,
  temporaryCredentialResponseSchema,
} from '@khums/validation';

import { AppModule } from '../src/app.module';
import { bootstrapSuperAdmin } from '../src/auth/bootstrap';
import { PASSWORD_HASHER, type PasswordHasher } from '../src/auth/password-hasher';
import { STAFF_STORE, type StaffStore } from '../src/auth/staff-store';
import { loadConfig } from '../src/config';
import { configureApp } from '../src/shared/http/configure-app';
import { RESEARCH_STORE, type ResearchStore } from '../src/research/research-store';
import { TEST_PACK } from './support/governance-ledgers';
import { seedSourcedRuling, testRulingIdFor } from './support/research-rulings';
import { staffBrowserClass } from './support/staff-browser';

/**
 * The governance API over HTTP (M4.6.4a): the real app, staff guard, CSRF layers, strict
 * contracts, body limit and in-memory stores. Lifecycle, scope, concurrency and rollback rules are
 * covered in `src/governance/governance.service.test.ts`; this suite proves the HTTP boundary.
 */

const WEB = 'https://web.khums.test';
const EDGE_SECRET = 'integration-edge-secret-0123456789abcdef';
const ADMIN = { username: 'gov-admin', password: 'integration admin passphrase 02' };

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: WEB,
  STAFF_AUTH_SECRET: 'integration-test-secret-0123456789abcdef',
  STAFF_EDGE_SECRET: EDGE_SECRET,
});
if (!config.ok) throw new Error(config.error.join('\n'));
const CONFIG = config.value;

let app: NestExpressApplication;
let url: string;
const Browser = staffBrowserClass({ url: () => url, web: WEB, edgeSecret: EDGE_SECRET });
type Browser = InstanceType<typeof Browser>;

beforeAll(async () => {
  app = await NestFactory.create<NestExpressApplication>(AppModule.register(CONFIG), {
    logger: false,
  });
  configureApp(app, CONFIG);
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
  // M5.3.6: the packs' rules cite a synthetic, approved ruling version of their own Marja.
  const research = app.get<ResearchStore>(RESEARCH_STORE);
  for (const marjaId of ['test-marja', 'sistani']) {
    await seedSourcedRuling(research, marjaId, { rulingId: testRulingIdFor(marjaId) });
  }
});
afterAll(() => app.close());

const codeOf = (json: unknown) => problemDetailsSchema.parse(json).code;
const SUBMIT = `/admin/governance/packs/${TEST_PACK.metadata.packId}/versions/1.0.0/submit`;

async function signedInAdmin(): Promise<Browser> {
  const admin = new Browser();
  expect((await admin.login(ADMIN.username, ADMIN.password)).status).toBe(200);
  return admin;
}

/** A scholar with SCHOLAR for one Marja (a scope, not content), signed in (decision 64). */
async function scopedScholar(admin: Browser, username: string, marjaId: string) {
  const created = await admin.call('POST', '/admin/staff/accounts', {
    body: { username, reason: 'TEST account' },
  });
  const temp = temporaryCredentialResponseSchema.parse(created.json);
  const password = 'a long permanent scholar passphrase 43';
  const first = new Browser();
  await first.login(username, temp.temporaryPassword);
  await first.call('POST', '/staff/auth/password', {
    body: { currentPassword: temp.temporaryPassword, newPassword: password },
  });
  const granted = await admin.call('POST', `/admin/staff/accounts/${temp.principalId}/roles`, {
    body: {
      role: 'SCHOLAR',
      scope: { kind: 'MARJA', marjaIds: [marjaId] },
      reason: 'TEST',
    },
  });
  expect(granted.status).toBe(200);
  const browser = new Browser();
  expect((await browser.login(username, password)).status).toBe(200);
  return browser;
}

describe('governance routes are staff routes', () => {
  it('refuses requests without a session', async () => {
    const anonymous = new Browser();
    for (const path of [
      '/admin/governance/packs',
      '/admin/governance/policies',
      '/admin/audit/events',
    ]) {
      const response = await anonymous.call('GET', path);
      expect(response.status, path).toBe(401);
    }
    expect(
      (await anonymous.call('POST', SUBMIT, { body: { expectedSequence: 0, pack: TEST_PACK } }))
        .status,
    ).toBe(401);
  });

  it('needs the CSRF token on every command', async () => {
    const admin = await signedInAdmin();
    const response = await admin.call('POST', SUBMIT, {
      body: { expectedSequence: 0, pack: TEST_PACK },
      csrf: null,
    });
    expect(response.status).toBe(403);
    expect(codeOf(response.json)).toBe('CSRF_REJECTED');
  });
});

describe('strict contracts: the server derives actor, time, Marja and policy', () => {
  it('rejects a client-supplied actor, time, Marja, policy or resource with 400', async () => {
    const admin = await signedInAdmin();
    for (const extra of [
      { actor: { kind: 'STAFF_PRINCIPAL', subject: 'someone-else' } },
      { recordedAt: '2000-01-01T00:00:00.000Z' },
      { marjaId: 'test-marja' },
      { governancePolicy: 'SINGLE_SCHOLAR_V1' },
      { resource: { type: 'RULE_PACK_VERSION' } },
    ]) {
      const submit = await admin.call('POST', SUBMIT, {
        body: { expectedSequence: 0, pack: TEST_PACK, ...extra },
      });
      expect(submit.status, JSON.stringify(extra)).toBe(400);
      expect(codeOf(submit.json)).toBe('VALIDATION_FAILED');
      const approve = await admin.call(
        'POST',
        `/admin/governance/packs/${TEST_PACK.metadata.packId}/versions/1.0.0/approve`,
        { body: { expectedSequence: 0, evidence: { reference: 'docs/x.md' }, ...extra } },
      );
      expect(approve.status, JSON.stringify(extra)).toBe(400);
    }
    // Content can only be sent with SUBMIT; other commands have no content field at all.
    const withContent = await admin.call(
      'POST',
      `/admin/governance/packs/${TEST_PACK.metadata.packId}/versions/1.0.0/publish`,
      { body: { expectedSequence: 0, pack: TEST_PACK } },
    );
    expect(withContent.status).toBe(400);
  });

  it('validates path parameters and caps the request size', async () => {
    const admin = await signedInAdmin();
    expect(
      (await admin.call('GET', '/admin/governance/packs/test-governed-pack/versions/latest'))
        .status,
    ).toBe(400);
    const huge = await admin.call('POST', SUBMIT, {
      body: { expectedSequence: 0, pack: { ...TEST_PACK, padding: 'x'.repeat(150_000) } },
    });
    expect(huge.status).toBe(413);
    expect(codeOf(huge.json)).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('authorization over HTTP', () => {
  it('authorizes SUPER_ADMIN (decision 64); denies an out-of-scope scholar and audits it without content', async () => {
    const admin = await signedInAdmin();
    // Decision 64: SUPER_ADMIN holds governance.submit (formerly 403 ACCESS_DENIED). The command
    // passes authorization; whatever the domain then decides, it is not an access denial.
    const submitted = await admin.call('POST', SUBMIT, {
      body: { expectedSequence: 0, pack: TEST_PACK },
    });
    expect(submitted.status).not.toBe(403);
    expect(codeOf(submitted.json)).not.toBe('ACCESS_DENIED');
    const scholar = await scopedScholar(admin, 'gov-denied-scholar', 'sistani');
    const denied = await scholar.call('POST', SUBMIT, {
      body: { expectedSequence: 0, pack: TEST_PACK },
    });
    expect(denied.status).toBe(403);
    expect(codeOf(denied.json)).toBe('ACCESS_DENIED');
    const audit = auditEventListResponseSchema.parse(
      (await admin.call('GET', '/admin/audit/events?limit=200')).json,
    );
    expect(audit.chainVerified).toBe(true);
    const event = audit.events.find((e) => e.type === 'governance.command.denied');
    expect(event).toMatchObject({
      details: {
        command: 'SUBMIT',
        permission: 'governance.submit',
        denyReason: 'OUT_OF_SCOPE',
      },
    });
    expect(JSON.stringify(audit)).not.toContain('TEST category');
  });

  it('denies a scholar outside the pack’s Marja, and hides versions they cannot read', async () => {
    const admin = await signedInAdmin();
    const scholar = await scopedScholar(admin, 'gov-other-scholar', 'sistani');
    const submit = await scholar.call('POST', SUBMIT, {
      body: { expectedSequence: 0, pack: TEST_PACK },
    });
    expect(submit.status).toBe(403);
    expect(
      governancePackListResponseSchema.parse(
        (await scholar.call('GET', '/admin/governance/packs')).json,
      ).packs,
    ).toEqual([]);
    const missing = await scholar.call(
      'GET',
      `/admin/governance/packs/${TEST_PACK.metadata.packId}/versions/1.0.0`,
    );
    expect(missing.status).toBe(404);
    expect(codeOf(missing.json)).toBe('PACK_VERSION_NOT_FOUND');
    // No audit permission for a scholar.
    expect((await scholar.call('GET', '/admin/audit/events')).status).toBe(403);
    // Policy configuration is administrative only.
    expect((await scholar.call('GET', '/admin/governance/policies')).status).toBe(403);
  });
});

describe('governance policies over HTTP', () => {
  it('lists policies, records a proposal, refuses self-confirmation; both steps are audited', async () => {
    const admin = await signedInAdmin();
    const before = governancePolicyRegistryResponseSchema.parse(
      (await admin.call('GET', '/admin/governance/policies')).json,
    );
    expect(before.policies.length).toBeGreaterThan(0);
    const target = before.policies[0];
    if (target === undefined) throw new Error('fixture');
    const newPolicy =
      target.policy === 'SINGLE_SCHOLAR_V1' ? 'INDEPENDENT_REVIEW_V1' : 'SINGLE_SCHOLAR_V1';
    const proposed = await admin.call('POST', '/admin/governance/policies/proposals', {
      body: { marjaId: target.marjaId, newPolicy, reason: 'TEST second scholar joined' },
    });
    expect(proposed.status).toBe(201);
    expect(proposed.json).toMatchObject({ kind: 'CHANGE_PROPOSED', marjaId: target.marjaId });
    const view = governancePolicyRegistryResponseSchema.parse(
      (await admin.call('GET', '/admin/governance/policies')).json,
    );
    if (view.pending === null) throw new Error('nothing pending');
    const { proposedBy: _proposedBy, ...expected } = view.pending;
    const self = await admin.call('POST', '/admin/governance/policies/proposals/confirm', {
      body: expected,
    });
    expect(self.status).toBe(409);
    expect(codeOf(self.json)).toBe('GOVERNANCE_REFUSED');
    const audit = auditEventListResponseSchema.parse(
      (await admin.call('GET', '/admin/audit/events?limit=200')).json,
    );
    expect(audit.events.some((e) => e.type === 'governance.policy.changeProposed')).toBe(true);
    // The policy did not change.
    const after = governancePolicyRegistryResponseSchema.parse(
      (await admin.call('GET', '/admin/governance/policies')).json,
    );
    expect(after.policies.find((p) => p.marjaId === target.marjaId)?.policy).toBe(target.policy);
  });
});

/**
 * M5.2.1: a complete single-scholar lifecycle over HTTP. TEST content only. The Marja id is a
 * catalogue id because HTTP role grants accept only catalogue Marjas; `sistani` is configured with
 * SINGLE_SCHOLAR_V1 in the version-controlled development configuration. Nothing here is a ruling.
 */
function sealedTestPack(packId: string, marjaId: string): RulePack {
  const base = structuredClone<RulePack>(TEST_PACK);
  const rules = base.rules.map((r) => ({ ...r, rulingRefs: [`${testRulingIdFor(marjaId)}@1`] }));
  const sealed = sealRulePack({
    ...base,
    rules,
    metadata: { ...base.metadata, packId, marjaId },
  });
  if (!sealed.ok) throw new Error('seal failed');
  return sealed.value;
}

describe('independent scholar lifecycle over HTTP (M5.2.1)', () => {
  const evidenceBody = { reference: 'docs/research/reviews/test/http-solo.REVIEW.md' };

  async function soloToPublished(scholar: Browser, packId: string) {
    const base = `/admin/governance/packs/${packId}/versions/1.0.0`;
    const steps: [string, Record<string, unknown>][] = [
      ['submit', { expectedSequence: 0, pack: sealedTestPack(packId, 'sistani') }],
      ['review/start', { expectedSequence: 1 }],
      ['review/complete', { expectedSequence: 2, evidence: evidenceBody }],
      ['approve', { expectedSequence: 3, evidence: evidenceBody }],
      ['publish', { expectedSequence: 4 }],
    ];
    let last: unknown = null;
    for (const [path, body] of steps) {
      const response = await scholar.call('POST', `${base}/${path}`, { body });
      expect(response.status, `${path}: ${JSON.stringify(response.json)}`).toBe(200);
      last = response.json;
    }
    return governancePackVersionSchema.parse(last);
  }

  it('one governing scholar submits, reviews, approves, publishes and activates alone; audit names them throughout', async () => {
    const admin = await signedInAdmin();
    const scholar = await scopedScholar(admin, 'gov-solo-scholar', 'sistani');
    const packId = 'test-http-solo-pack';
    const published = await soloToPublished(scholar, packId);
    expect(published).toMatchObject({
      state: 'PUBLISHED',
      policy: 'SINGLE_SCHOLAR_V1',
      policySource: 'RECORDED',
      marjaId: 'sistani',
    });
    const base = `/admin/governance/packs/${packId}/versions/1.0.0`;
    // Decision 64: SUPER_ADMIN may activate now (formerly 403), so the denied attempt comes from a
    // scholar of another Marja (cross-Marja access is read-only); the pack's scholar activates.
    const outsider = await scopedScholar(admin, 'gov-solo-outsider', 'khamenei');
    const outsiderActivate = await outsider.call('POST', `${base}/activate`, {
      body: { expectedSequence: 5 },
    });
    // Out of scope looks exactly like a missing version (no ledger read across Marjas).
    expect(outsiderActivate.status).toBe(404);
    expect(codeOf(outsiderActivate.json)).toBe('PACK_VERSION_NOT_FOUND');
    const activated = governancePackVersionSchema.parse(
      (await scholar.call('POST', `${base}/activate`, { body: { expectedSequence: 5 } })).json,
    );
    expect(activated).toMatchObject({ state: 'PUBLISHED', activated: true, expectedSequence: 6 });
    const scholarId = activated.records[0]?.actor.subject;
    expect(activated.records.map((r) => [r.type, r.actor.subject])).toEqual(
      ['SUBMITTED', 'REVIEW_STARTED', 'REVIEW_COMPLETED', 'APPROVED', 'PUBLISHED', 'ACTIVATED'].map(
        (type) => [type, scholarId],
      ),
    );
    const audit = auditEventListResponseSchema.parse(
      (await admin.call('GET', '/admin/audit/events?limit=200')).json,
    );
    expect(audit.chainVerified).toBe(true);
    const events = audit.events.filter(
      (e) =>
        e.type.startsWith('governance.pack.') && e.targets.some((t) => t.id === `${packId}@1.0.0`),
    );
    expect(events.map((e) => [e.type, e.details.command])).toEqual([
      ['governance.pack.submitted', 'SUBMIT'],
      ['governance.pack.reviewStarted', 'START_REVIEW'],
      ['governance.pack.reviewCompleted', 'COMPLETE_REVIEW'],
      ['governance.pack.approved', 'APPROVE'],
      ['governance.pack.published', 'PUBLISH'],
      ['governance.pack.activated', 'ACTIVATE'],
    ]);
    for (const e of events) {
      expect(e.actor).toBe(scholarId);
      expect(e.marjaIds).toEqual(['sistani']);
      expect(e.targets).toEqual([{ kind: 'rulePackVersion', id: `${packId}@1.0.0` }]);
    }
  });

  it('an administrator withdraws a published version in an emergency, with a reason', async () => {
    const admin = await signedInAdmin();
    const scholar = await scopedScholar(admin, 'gov-solo-scholar-2', 'sistani');
    const packId = 'test-http-emergency-pack';
    await soloToPublished(scholar, packId);
    const base = `/admin/governance/packs/${packId}/versions/1.0.0`;
    // Decision 64: SUPER_ADMIN may also withdraw normally now (formerly 403); not exercised here so
    // the emergency path below stays covered. A scholar of another Marja may not withdraw.
    const outsider = await scopedScholar(admin, 'gov-emergency-outsider', 'khamenei');
    expect(
      (
        await outsider.call('POST', `${base}/withdraw`, {
          body: { expectedSequence: 5, reason: 'OTHER' },
        })
      ).status,
    ).toBe(404);
    const noReason = await admin.call('POST', `${base}/emergency-withdraw`, {
      body: { expectedSequence: 5, reason: 'ERROR_FOUND' },
    });
    expect(noReason.status).toBe(400);
    const withdrawn = await admin.call('POST', `${base}/emergency-withdraw`, {
      body: { expectedSequence: 5, reason: 'ERROR_FOUND', note: 'TEST emergency over HTTP' },
    });
    expect(withdrawn.status).toBe(200);
    expect(governancePackVersionSchema.parse(withdrawn.json).state).toBe('WITHDRAWN');
    // Scholars hold no emergency permission (only SUPER_ADMIN holds it).
    expect(
      (
        await scholar.call('POST', `${base}/emergency-withdraw`, {
          body: { expectedSequence: 6, reason: 'OTHER', note: 'TEST' },
        })
      ).status,
    ).toBe(403);
  });

  it('binding over HTTP: administrators only, a reason required, no policy accepted, recorded versions refused', async () => {
    const admin = await signedInAdmin();
    const scholar = await scopedScholar(admin, 'gov-solo-scholar-3', 'sistani');
    const packId = 'test-http-bind-pack';
    await soloToPublished(scholar, packId);
    const bind = `/admin/governance/packs/${packId}/versions/1.0.0/bind-policy`;
    for (const body of [
      { expectedSequence: 5 },
      { expectedSequence: 5, reason: 'TEST', policy: 'SINGLE_SCHOLAR_V1' },
      { expectedSequence: 5, reason: 'TEST', governancePolicy: 'INDEPENDENT_REVIEW_V1' },
    ]) {
      const response = await admin.call('POST', bind, { body });
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(codeOf(response.json)).toBe('VALIDATION_FAILED');
    }
    // A scholar holds no binding permission.
    expect(
      (await scholar.call('POST', bind, { body: { expectedSequence: 5, reason: 'TEST binding' } }))
        .status,
    ).toBe(403);
    // A version whose policy is recorded cannot be (re)bound.
    const recorded = await admin.call('POST', bind, {
      body: { expectedSequence: 5, reason: 'TEST binding' },
    });
    expect(recorded.status).toBe(409);
    expect(codeOf(recorded.json)).toBe('GOVERNANCE_REFUSED');
    expect(problemDetailsSchema.parse(recorded.json).detail).toContain('POLICY_ALREADY_BOUND');
    // An unknown emergency reason code is rejected by the contract.
    const badCode = await admin.call(
      'POST',
      `/admin/governance/packs/${packId}/versions/1.0.0/emergency-withdraw`,
      { body: { expectedSequence: 5, reason: 'BECAUSE', note: 'TEST emergency note' } },
    );
    expect(badCode.status).toBe(400);
  });
});
