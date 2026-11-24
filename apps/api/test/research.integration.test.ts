import 'reflect-metadata';

import { createHash } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  evidenceArtefactResponseSchema,
  evidenceContentResponseSchema,
  evidenceListResponseSchema,
  problemDetailsSchema,
  researchMarjasResponseSchema,
  researchRecordResponseSchema,
  rulingVersionsResponseSchema,
  temporaryCredentialResponseSchema,
} from '@khums/validation';

import { AppModule } from '../src/app.module';
import { bootstrapSuperAdmin } from '../src/auth/bootstrap';
import { PASSWORD_HASHER, type PasswordHasher } from '../src/auth/password-hasher';
import { STAFF_STORE, type StaffStore } from '../src/auth/staff-store';
import { loadConfig } from '../src/config';
import { configureApp } from '../src/shared/http/configure-app';
import { createOpenApiDocument } from '../src/shared/openapi/create-openapi-document';
import { staffBrowserClass } from './support/staff-browser';

/**
 * The research API over HTTP (M5.3.3): the real app, staff guard, CSRF, strict contracts, the
 * route-specific evidence body limit and in-memory stores. Lifecycle, scope, concurrency and
 * rollback are covered in `src/research/research.service.test.ts`; this suite proves the HTTP
 * boundary. SYNTHETIC placeholder content only.
 */

const WEB = 'https://web.khums.test';
const EDGE_SECRET = 'integration-edge-secret-0123456789abcdef';
const ADMIN = { username: 'research-admin', password: 'integration admin passphrase 05' };

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
});
afterAll(() => app.close());

const codeOf = (json: unknown) => problemDetailsSchema.parse(json).code;

async function signedInAdmin(): Promise<Browser> {
  const admin = new Browser();
  expect((await admin.login(ADMIN.username, ADMIN.password)).status).toBe(200);
  return admin;
}

let accounts = 0;
/** A signed-in account holding `role` for `marjaIds` (a scope, not content). */
async function staffWith(admin: Browser, role: string, marjaIds: readonly string[] | 'ALL') {
  accounts += 1;
  const username = `research-staff-${String(accounts)}`;
  const created = await admin.call('POST', '/admin/staff/accounts', {
    body: { username, reason: 'TEST account' },
  });
  const temp = temporaryCredentialResponseSchema.parse(created.json);
  const password = 'a long permanent research passphrase 51';
  const first = new Browser();
  await first.login(username, temp.temporaryPassword);
  await first.call('POST', '/staff/auth/password', {
    body: { currentPassword: temp.temporaryPassword, newPassword: password },
  });
  const granted = await admin.call('POST', `/admin/staff/accounts/${temp.principalId}/roles`, {
    body: {
      role,
      scope: marjaIds === 'ALL' ? { kind: 'ALL', marjaIds: [] } : { kind: 'MARJA', marjaIds },
      reason: 'TEST',
    },
  });
  expect(granted.status).toBe(200);
  const browser = new Browser();
  expect((await browser.login(username, password)).status).toBe(200);
  return browser;
}

const SOURCE = {
  title: { original: 'TEST source title', translation: null },
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
};
const createBody = { marjaId: 'sistani', payload: SOURCE, references: [], aiInvolvement: [] };

let scholar: Browser;
beforeAll(async () => {
  scholar = await staffWith(await signedInAdmin(), 'SCHOLAR', ['sistani']);
});

describe('research routes are staff routes', () => {
  it('refuses requests without a session, and commands without CSRF', async () => {
    const anonymous = new Browser();
    for (const path of [
      '/admin/research/marjas',
      '/admin/research/sources',
      '/admin/research/sources/metadata',
      '/admin/research/evidence/01936b2e-7c4a-7d3e-9f10-1a2b3c4d5e6f',
    ]) {
      expect((await anonymous.call('GET', path)).status, path).toBe(401);
    }
    expect(
      (await anonymous.call('POST', '/admin/research/sources', { body: createBody })).status,
    ).toBe(401);
    const noCsrf = await scholar.call('POST', '/admin/research/sources', {
      body: createBody,
      csrf: null,
    });
    expect(noCsrf.status).toBe(403);
    expect(codeOf(noCsrf.json)).toBe('CSRF_REJECTED');
  });

  it('exposes nothing outside the staff API (no public research routes)', async () => {
    const anonymous = new Browser();
    for (const path of ['/research/sources', '/sources', '/public/research']) {
      expect((await anonymous.call('GET', path)).status, path).toBe(404);
    }
    const document = createOpenApiDocument(app) as { paths: Record<string, unknown> };
    const research = Object.keys(document.paths).filter((p) => p.includes('research'));
    expect(research.length).toBeGreaterThan(0);
    expect(research.every((p) => p.startsWith('/api/v1/admin/research'))).toBe(true);
  });
});

describe('strict contracts: the server derives actor, time, id, digest and Marja', () => {
  it('rejects client-supplied server fields and unknown record types with 400', async () => {
    for (const extra of [
      { actor: { kind: 'STAFF_PRINCIPAL', subject: 'someone-else' } },
      { recordedAt: '2000-01-01T00:00:00.000Z' },
      { entityId: '01936b2e-7c4a-7d3e-9f10-1a2b3c4d5e6f' },
      { displayRef: 'S-sistani-7K3QX9MZ' },
      { recordDigest: 'a'.repeat(64) },
    ]) {
      const response = await scholar.call('POST', '/admin/research/sources', {
        body: { ...createBody, ...extra },
      });
      expect(response.status, Object.keys(extra)[0]).toBe(400);
      expect(codeOf(response.json)).toBe('VALIDATION_FAILED');
    }
    expect(
      (await scholar.call('POST', '/admin/research/opinions', { body: createBody })).status,
    ).toBe(400);
    expect((await scholar.call('GET', '/admin/research/sources/not-a-uuid')).status).toBe(400);
  });
});

describe('the scholar workflow over HTTP', () => {
  it('creates, verifies and reads a source; stale commands are 409; other Marjas read only', async () => {
    const created = await scholar.call('POST', '/admin/research/sources', { body: createBody });
    expect(created.status).toBe(201);
    const source = researchRecordResponseSchema.parse(created.json);
    expect(source).toMatchObject({ state: 'DRAFT', expectedRevision: 1, marjaId: 'sistani' });
    const verified = await scholar.call(
      'POST',
      `/admin/research/sources/${source.entityId}/verify`,
      {
        body: { expectedRevision: 1, reason: null },
      },
    );
    expect(verified.status).toBe(200);
    expect(researchRecordResponseSchema.parse(verified.json).state).toBe('VERIFIED');
    const stale = await scholar.call('POST', `/admin/research/sources/${source.entityId}/dispute`, {
      body: { expectedRevision: 1, reason: 'TEST dispute' },
    });
    expect(stale.status).toBe(409);
    expect(codeOf(stale.json)).toBe('RESEARCH_CONFLICT');
    expect(
      (await scholar.call('GET', `/admin/research/sources/${source.entityId}/revisions/0`)).status,
    ).toBe(200);
    const marjas = researchMarjasResponseSchema.parse(
      (await scholar.call('GET', '/admin/research/marjas')).json,
    );
    // Decision 64: the other initial-scope Marja is listed with read-only access (formerly absent).
    expect(marjas.marjas.map((m) => m.marjaId)).toEqual(['sistani', 'khamenei']);
    expect(marjas.marjas[1]?.permissions).toEqual(['research.read']);

    const admin = await signedInAdmin();
    // Decision 64: a SCHOLAR of another Marja reads the record read-only (formerly 404) but can
    // neither revise nor transition it (403); nothing is written.
    const outsider = await staffWith(admin, 'SCHOLAR', ['khamenei']);
    const read = await outsider.call('GET', `/admin/research/sources/${source.entityId}`);
    expect(read.status).toBe(200);
    const current = researchRecordResponseSchema.parse(read.json);
    const revise = await outsider.call(
      'POST',
      `/admin/research/sources/${source.entityId}/revise`,
      {
        body: {
          expectedRevision: current.expectedRevision,
          payload: SOURCE,
          references: [],
          aiInvolvement: [],
        },
      },
    );
    expect(revise.status).toBe(403);
    expect(codeOf(revise.json)).toBe('ACCESS_DENIED');
    const transition = await outsider.call(
      'POST',
      `/admin/research/sources/${source.entityId}/dispute`,
      { body: { expectedRevision: current.expectedRevision, reason: 'TEST must be refused' } },
    );
    expect(transition.status).toBe(403);
    const after = researchRecordResponseSchema.parse(
      (await scholar.call('GET', `/admin/research/sources/${source.entityId}`)).json,
    );
    expect(after.expectedRevision).toBe(current.expectedRevision);
    // Decision 64: SUPER_ADMIN may create research (formerly 403).
    const byAdmin = await admin.call('POST', '/admin/research/sources', { body: createBody });
    expect(byAdmin.status).toBe(201);
  });
});

describe('findings and rulings over HTTP (M5.3.4)', () => {
  it('creates a finding on a verified passage, verifies and approves it, then a ruling on it', async () => {
    const post = async (path: string, body: unknown) => {
      const response = await scholar.call('POST', `/admin/research${path}`, { body });
      return {
        status: response.status,
        record: researchRecordResponseSchema.safeParse(response.json),
      };
    };
    const record = async (path: string, body: unknown, status = 200) => {
      const result = await post(path, body);
      expect(result.status, path).toBe(status);
      if (!result.record.success) throw new Error(path);
      return result.record.data;
    };
    const step = { expectedRevision: 1, reason: null };
    const source = await record('/sources', createBody, 201);
    await record(`/sources/${source.entityId}/verify`, step);
    const pin = (r: { entityType: string; entityId: string }, revision: number) => ({
      entityType: r.entityType,
      entityId: r.entityId,
      revision,
      rulingVersion: null,
      marjaId: 'sistani',
    });
    const passage = await record(
      '/passages',
      {
        marjaId: 'sistani',
        payload: {
          locator: {
            volume: null,
            page: '1',
            masalah: null,
            istiftaId: null,
            section: null,
            url: null,
          },
          originalLanguage: 'ar',
          text: 'TEST synthetic excerpt',
          precautionWording: null,
          notes: null,
        },
        references: [pin(source, 1)],
        aiInvolvement: [],
      },
      201,
    );
    await record(`/passages/${passage.entityId}/verify`, step);
    const findingPayload = {
      language: 'en',
      scenario: null,
      conclusion: 'TEST synthetic conclusion',
      explanation: 'TEST synthetic explanation',
      precaution: 'UNDETERMINED',
      conditions: [],
      exceptions: [],
      qualifications: [],
      unresolvedIssues: [],
      notes: null,
    };
    const finding = await record(
      '/findings',
      {
        marjaId: 'sistani',
        questionId: 'CTQ-01',
        payload: findingPayload,
        references: [pin(passage, 1)],
        aiInvolvement: [],
      },
      201,
    );
    expect(finding).toMatchObject({ questionId: 'CTQ-01', state: 'DRAFT' });
    await record(`/findings/${finding.entityId}/verify`, step);
    const approved = await record(`/findings/${finding.entityId}/approve`, {
      expectedRevision: 2,
      reason: null,
    });
    expect(approved.state).toBe('APPROVED');
    const ruling = await record(
      '/rulings',
      {
        marjaId: 'sistani',
        payload: {
          language: 'en',
          conclusion: 'TEST synthetic ruling conclusion',
          explanation: 'TEST synthetic explanation',
          precaution: 'UNDETERMINED',
          conditions: [],
          exceptions: [],
          notes: null,
        },
        references: [pin(approved, 2), pin(passage, 1)],
        aiInvolvement: [],
      },
      201,
    );
    expect(ruling).toMatchObject({ rulingVersion: 1, state: 'DRAFT' });
    expect((await record(`/rulings/${ruling.entityId}/approve`, step)).state).toBe('APPROVED');
    // M5.3.5: a correction version, approved, supersedes version 1 (routes ahead of `:action`).
    const correction = await record(
      `/rulings/${ruling.entityId}/versions`,
      {
        expectedRevision: 2,
        payload: {
          language: 'en',
          conclusion: 'TEST synthetic corrected conclusion',
          explanation: 'TEST synthetic explanation',
          precaution: 'UNDETERMINED',
          conditions: [],
          exceptions: [],
          notes: null,
        },
        references: [pin(approved, 2), pin(passage, 1)],
        aiInvolvement: [],
      },
      201,
    );
    expect(correction).toMatchObject({ rulingVersion: 2, rulingSeriesId: ruling.entityId });
    await record(`/rulings/${correction.entityId}/approve`, step);
    const series = rulingVersionsResponseSchema.parse(
      (await scholar.call('GET', `/admin/research/rulings/${ruling.entityId}/versions`)).json,
    );
    expect(series.current?.entityId).toBe(correction.entityId);
    expect(series.versions.map((v) => v.state)).toEqual(['SUPERSEDED', 'APPROVED']);
    // A source citation is refused (D14), and unknown body fields are rejected by the strict contract.
    expect(
      (
        await post('/findings', {
          marjaId: 'sistani',
          questionId: 'CTQ-01',
          payload: findingPayload,
          references: [pin(source, 1)],
          aiInvolvement: [],
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await post('/findings', {
          marjaId: 'sistani',
          questionId: 'CTQ-01',
          rulingVersion: 2,
          payload: findingPayload,
          references: [],
          aiInvolvement: [],
        })
      ).status,
    ).toBe(400);
    const list = await scholar.call('GET', '/admin/research/findings?questionId=CTQ-01');
    expect(list.status).toBe(200);
  });
});

describe('evidence uploads', () => {
  const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const uploadBody = (sourceId: string, bytes: Buffer) => ({
    sourceId,
    mediaType: 'text/plain',
    sha256: sha(bytes),
    copyright: 'EXCERPTS_ONLY',
    extent: 'EXCERPT',
    description: 'TEST synthetic note',
    contentBase64: bytes.toString('base64'),
  });

  it('accepts files above the general 100 kB limit on the upload route only, and verifies content', async () => {
    const source = researchRecordResponseSchema.parse(
      (await scholar.call('POST', '/admin/research/sources', { body: createBody })).json,
    );
    // ~600 kB of synthetic text: over the general limit, under the evidence limit.
    const bytes = Buffer.from(`TEST ${'x'.repeat(600_000)}`);
    const uploaded = await scholar.call('POST', '/admin/research/evidence', {
      body: uploadBody(source.entityId, bytes),
    });
    expect(uploaded.status).toBe(201);
    const artefact = evidenceArtefactResponseSchema.parse(uploaded.json);
    expect(artefact).toMatchObject({ digest: sha(bytes), size: bytes.length, marjaId: 'sistani' });
    expect(uploaded.json).not.toHaveProperty('storageKey');

    const listed = await scholar.call(
      'GET',
      `/admin/research/evidence?sourceId=${source.entityId}`,
    );
    expect(listed.status).toBe(200);
    expect(evidenceListResponseSchema.parse(listed.json).items).toHaveLength(1);
    const content = evidenceContentResponseSchema.parse(
      (await scholar.call('GET', `/admin/research/evidence/${artefact.artefactId}/content`)).json,
    );
    expect(Buffer.from(content.contentBase64, 'base64').equals(bytes)).toBe(true);

    // Every other route keeps the 100 kB limit.
    const big = await scholar.call('POST', '/admin/research/sources', {
      body: { ...createBody, payload: { ...SOURCE, notes: 'x'.repeat(150_000) } },
    });
    expect(big.status).toBe(413);
  });

  it('refuses uploads over the evidence limit and with a wrong digest', async () => {
    const source = researchRecordResponseSchema.parse(
      (await scholar.call('POST', '/admin/research/sources', { body: createBody })).json,
    );
    const tooBig = Buffer.alloc(3 * 1024 * 1024, 0x41);
    expect(
      (
        await scholar.call('POST', '/admin/research/evidence', {
          body: uploadBody(source.entityId, tooBig),
        })
      ).status,
    ).toBe(413);
    const bytes = Buffer.from('TEST small note');
    const wrong = await scholar.call('POST', '/admin/research/evidence', {
      body: { ...uploadBody(source.entityId, bytes), sha256: 'a'.repeat(64) },
    });
    expect(wrong.status).toBe(422);
    expect(codeOf(wrong.json)).toBe('EVIDENCE_REFUSED');
  });
});
