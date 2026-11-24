import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { checkPublicPackBundle, runVerifiedAssessment } from '@khums/core';
import type { FinancialFactSheet } from '@khums/shared-types';
import {
  problemDetailsSchema,
  publicMarjaListResponseSchema,
  publicVerifiedPackResponseSchema,
  temporaryCredentialResponseSchema,
} from '@khums/validation';

import { AppModule } from '../src/app.module';
import { bootstrapSuperAdmin } from '../src/auth/bootstrap';
import { PASSWORD_HASHER, type PasswordHasher } from '../src/auth/password-hasher';
import { STAFF_STORE, type StaffStore } from '../src/auth/staff-store';
import { loadConfig } from '../src/config';
import { RESEARCH_STORE, type ResearchStore } from '../src/research/research-store';
import { configureApp } from '../src/shared/http/configure-app';
import { publicTestPack } from './support/public-test-pack';
import { seedSourcedRuling } from './support/research-rulings';
import { staffBrowserClass } from './support/staff-browser';

/**
 * The public calculator API (decision 65) over HTTP, and staff provisional testing on the same
 * (PRODUCTION_APPROVED) deployment. In-memory stores; TEST packs and SYNTHETIC rulings only —
 * nothing here is a ruling of any Marja.
 */

const WEB = 'https://web.khums.test';
const EDGE_SECRET = 'integration-edge-secret-0123456789abcdef';
const ADMIN = { username: 'public-admin', password: 'integration admin passphrase 07' };

interface Running {
  app: NestExpressApplication;
  url: string;
  rulingRef: string;
}

async function start(state: string): Promise<Running> {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CORS_ORIGINS: WEB,
    STAFF_AUTH_SECRET: 'integration-test-secret-0123456789abcdef',
    STAFF_EDGE_SECRET: EDGE_SECRET,
    KHUMS_OPERATIONAL_STATE: state,
  });
  if (!config.ok) throw new Error(config.error.join('\n'));
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config.value), {
    logger: false,
  });
  configureApp(app, config.value);
  await app.listen(0, '127.0.0.1');
  const seeded = await bootstrapSuperAdmin(
    {
      store: app.get<StaffStore>(STAFF_STORE),
      hasher: app.get<PasswordHasher>(PASSWORD_HASHER),
      now: Date.now(),
    },
    ADMIN,
  );
  if (!seeded.ok) throw new Error(seeded.error.kind);
  const ruling = await seedSourcedRuling(app.get<ResearchStore>(RESEARCH_STORE), 'sistani');
  return {
    app,
    url: (await app.getUrl()).replace('[::1]', '127.0.0.1'),
    rulingRef: `${ruling.entityId}@1`,
  };
}

let production: Running;
let review: Running;
beforeAll(async () => {
  production = await start('PRODUCTION_APPROVED');
  review = await start('SCHOLAR_REVIEW');
});
afterAll(async () => {
  await production.app.close();
  await review.app.close();
});

const Browser = staffBrowserClass({ url: () => production.url, web: WEB, edgeSecret: EDGE_SECRET });
type Browser = InstanceType<typeof Browser>;
const ReviewBrowser = staffBrowserClass({
  url: () => review.url,
  web: WEB,
  edgeSecret: EDGE_SECRET,
});
const codeOf = (json: unknown) => problemDetailsSchema.parse(json).code;
const evidence = { reference: 'docs/research/reviews/test/public-calculator.REVIEW.md' };

async function sistaniScholar(): Promise<Browser> {
  const admin = new Browser();
  expect((await admin.login(ADMIN.username, ADMIN.password)).status).toBe(200);
  const username = `public-scholar-${String(Date.now())}`;
  const created = await admin.call('POST', '/admin/staff/accounts', {
    body: { username, reason: 'TEST account' },
  });
  const temp = temporaryCredentialResponseSchema.parse(created.json);
  const password = 'a long permanent scholar passphrase 77';
  const first = new Browser();
  await first.login(username, temp.temporaryPassword);
  await first.call('POST', '/staff/auth/password', {
    body: { currentPassword: temp.temporaryPassword, newPassword: password },
  });
  const granted = await admin.call('POST', `/admin/staff/accounts/${temp.principalId}/roles`, {
    body: { role: 'SCHOLAR', scope: { kind: 'MARJA', marjaIds: ['sistani'] }, reason: 'TEST' },
  });
  expect(granted.status).toBe(200);
  const browser = new Browser();
  expect((await browser.login(username, password)).status).toBe(200);
  return browser;
}

/** Takes a TEST pack through the ledger (SINGLE_SCHOLAR_V1 for sistani) up to PUBLISHED. */
async function publish(scholar: Browser, packId: string) {
  const base = `/admin/governance/packs/${packId}/versions/1.0.0`;
  const steps: [string, Record<string, unknown>][] = [
    [
      'submit',
      { expectedSequence: 0, pack: publicTestPack(packId, 'sistani', production.rulingRef) },
    ],
    ['review/start', { expectedSequence: 1 }],
    ['review/complete', { expectedSequence: 2, evidence }],
    ['approve', { expectedSequence: 3, evidence }],
    ['publish', { expectedSequence: 4 }],
  ];
  for (const [path, body] of steps) {
    const response = await scholar.call('POST', `${base}/${path}`, { body });
    expect(response.status, `${path}: ${JSON.stringify(response.json)}`).toBe(200);
  }
  return base;
}

async function publicPack(browser: Browser = new Browser()) {
  const response = await browser.call('GET', '/public/marjas/sistani/pack');
  expect(response.status).toBe(200);
  // Public reads set no cookie (no session, no tracking).
  expect(response.setCookies).toEqual([]);
  return publicVerifiedPackResponseSchema.parse(response.json);
}

const sheet: FinancialFactSheet = {
  schemaVersion: 1,
  currency: 'GBP',
  context: { workflow: 'first-time', assessmentDate: '2026-06-30' },
  facts: [
    {
      id: 'f1',
      kind: 'BALANCE',
      subtype: 'CASH',
      label: null,
      note: null,
      currency: 'GBP',
      value: { status: 'KNOWN', amount: '200.00' },
      periodId: null,
      valuedOn: { status: 'NOT_PROVIDED' },
    },
  ],
};

describe('public calculator (decision 65)', () => {
  it('serves only governed, published, activated and ready packs; never scholar-review or withdrawn ones', async () => {
    const anonymous = new Browser();
    // Nothing verified yet: every catalogue Marja says so.
    const list = publicMarjaListResponseSchema.parse(
      (await anonymous.call('GET', '/public/marjas')).json,
    );
    expect(list.marjas.map((m) => m.marjaId)).toContain('sistani');
    expect(list.marjas.every((m) => m.verifiedPack === null)).toBe(true);
    expect(await publicPack()).toEqual({ status: 'NOT_AVAILABLE', marjaId: 'sistani' });

    const scholar = await sistaniScholar();

    // A scholar-review channel pack cannot even enter governance.
    const reviewSubmit = await scholar.call(
      'POST',
      '/admin/governance/packs/test-public-provisional-gov/versions/1.0.0/submit',
      {
        body: {
          expectedSequence: 0,
          pack: publicTestPack('test-public-provisional-gov', 'sistani', production.rulingRef, {
            channel: 'SCHOLAR_REVIEW',
          }),
        },
      },
    );
    expect(reviewSubmit.status).toBe(422);

    // Published but not activated: not public.
    const first = await publish(scholar, 'test-public-pack-a');
    expect(await publicPack()).toEqual({ status: 'NOT_AVAILABLE', marjaId: 'sistani' });

    // Activated: public, with the trace; the browser re-checks the bundle and calculates.
    expect(
      (await scholar.call('POST', `${first}/activate`, { body: { expectedSequence: 5 } })).status,
    ).toBe(200);
    const available = await publicPack();
    expect(available).toMatchObject({
      status: 'AVAILABLE',
      marjaId: 'sistani',
      summary: { packId: 'test-public-pack-a', version: '1.0.0', workflows: ['first-time'] },
    });
    if (available.status !== 'AVAILABLE') throw new Error('expected a verified pack');
    // Privacy (Phase 2 step 5): no governance ledger and no staff principal id is served.
    expect(available).not.toHaveProperty('ledger');
    const ledgerView = (await scholar.call('GET', first)).json as {
      records: { actor: { subject: string } }[];
    };
    const staffIds = new Set(ledgerView.records.map((r) => r.actor.subject));
    expect(staffIds.size).toBeGreaterThan(0);
    for (const id of staffIds) expect(JSON.stringify(available)).not.toContain(id);
    expect(JSON.stringify(available)).not.toContain('"records"');
    const checked = checkPublicPackBundle(available.pack, available.summary);
    expect(checked.ok).toBe(true);
    if (checked.ok)
      expect(available.summary.contentDigest).toBe(checked.value.activation.integrity.digest);
    const run = runVerifiedAssessment(sheet, available);
    expect(run.kind).toBe('CALCULATED');
    if (run.kind === 'CALCULATED') {
      expect(run.report.meta.guidance).toBe('APPROVED_RULE_PACK');
      expect(run.report.meta.rulePack.packId).toBe('test-public-pack-a');
    }
    const listed = publicMarjaListResponseSchema.parse(
      (await anonymous.call('GET', '/public/marjas')).json,
    );
    expect(listed.marjas.find((m) => m.marjaId === 'sistani')?.verifiedPack?.packId).toBe(
      'test-public-pack-a',
    );
    expect(listed.marjas.find((m) => m.marjaId === 'khamenei')?.verifiedPack).toBeNull();

    // Withdrawn: no longer public.
    const withdrawn = await scholar.call('POST', `${first}/withdraw`, {
      body: { expectedSequence: 6, reason: 'ERROR_FOUND' },
    });
    expect(withdrawn.status, JSON.stringify(withdrawn.json)).toBe(200);
    expect(await publicPack()).toEqual({ status: 'NOT_AVAILABLE', marjaId: 'sistani' });

    // Another version activated later is served.
    const second = await publish(scholar, 'test-public-pack-b');
    await scholar.call('POST', `${second}/activate`, { body: { expectedSequence: 5 } });
    expect(await publicPack()).toMatchObject({
      status: 'AVAILABLE',
      summary: { packId: 'test-public-pack-b' },
    });
  });

  it('answers NOT_AVAILABLE for non-catalogue Marjas and 400 for malformed ids', async () => {
    const anonymous = new Browser();
    const testMarja = await anonymous.call('GET', '/public/marjas/test-marja/pack');
    expect(publicVerifiedPackResponseSchema.parse(testMarja.json)).toEqual({
      status: 'NOT_AVAILABLE',
      marjaId: 'test-marja',
    });
    const bad = await anonymous.call('GET', '/public/marjas/bad%20id/pack');
    expect(bad.status).toBe(400);
    expect(codeOf(bad.json)).toBe('VALIDATION_FAILED');
  });

  it('serves no verified pack outside PRODUCTION_APPROVED', async () => {
    const anonymous = new ReviewBrowser();
    const list = publicMarjaListResponseSchema.parse(
      (await anonymous.call('GET', '/public/marjas')).json,
    );
    expect(list.marjas.every((m) => m.verifiedPack === null)).toBe(true);
    expect(
      publicVerifiedPackResponseSchema.parse(
        (await anonymous.call('GET', '/public/marjas/sistani/pack')).json,
      ),
    ).toEqual({ status: 'NOT_AVAILABLE', marjaId: 'sistani' });
  });
});
