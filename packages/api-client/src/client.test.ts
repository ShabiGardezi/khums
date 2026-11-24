import { describe, expect, it, vi } from 'vitest';

import { createApiClient, type FetchLike, type ResponseLike } from './index';

const response = (status: number, body: unknown): ResponseLike => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: () => Promise.resolve(body),
});

const healthy = {
  status: 'ok',
  service: 'khums-api',
  uptimeSeconds: 3,
  timestamp: '2026-11-19T10:00:00.000Z',
};

describe('createApiClient', () => {
  it('calls the versioned base URL and returns parsed data', async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(response(200, healthy)));
    const client = createApiClient({ baseUrl: 'http://localhost:4000/api/v1/', fetch });

    const result = await client.health.check();

    expect(result).toEqual({ ok: true, value: healthy });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('adds custom headers', async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(response(200, healthy)));
    const client = createApiClient({
      baseUrl: 'http://x/api/v1',
      fetch,
      headers: () => ({ 'x-client': 'web' }),
    });
    await client.health.check();
    expect(fetch.mock.calls[0]![1].headers).toMatchObject({ 'x-client': 'web' });
  });

  it('maps RFC 9457 problem responses to http errors', async () => {
    const problem = { type: 'about:blank', title: 'Not Found', status: 404, code: 'NOT_FOUND' };
    const client = createApiClient({
      baseUrl: 'http://x/api/v1',
      fetch: () => Promise.resolve(response(404, problem)),
    });
    expect(await client.health.check()).toEqual({
      ok: false,
      error: { kind: 'http', status: 404, problem },
    });
  });

  it('reports contract drift as invalid_response', async () => {
    const client = createApiClient({
      baseUrl: 'http://x/api/v1',
      fetch: () => Promise.resolve(response(200, { status: 'ok' })),
    });
    const result = await client.health.check();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_response');
  });

  it('reports network failures without throwing', async () => {
    const client = createApiClient({
      baseUrl: 'http://x/api/v1',
      fetch: () => Promise.reject(new Error('offline')),
    });
    const result = await client.health.check();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('network');
  });

  it('calls the staff session endpoint with the supplied authorization header', async () => {
    const body = {
      principalId: 'auditor-1',
      accountStatus: 'ACTIVE',
      username: 'auditor-1',
      roles: [{ role: 'AUDITOR', scope: { kind: 'ALL', marjaIds: [] } }],
      permissions: ['audit.log.read'],
      authentication: {
        assurance: 'AAL1',
        methods: ['PASSWORD'],
        authenticatedAt: '2026-11-20T10:00:00.000Z',
      },
      mustChangePassword: false,
      sessionExpiresAt: '2026-11-20T10:15:00.000Z',
    };
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(response(200, body)));
    const client = createApiClient({
      baseUrl: 'http://x/api/v1',
      fetch,
      headers: () => ({ cookie: '__Host-khums_staff=test-session' }),
    });
    expect(await client.admin.session()).toEqual({ ok: true, value: body });
    expect(fetch.mock.calls[0]![0]).toBe('http://x/api/v1/admin/session');
    expect(fetch.mock.calls[0]![1].headers).toMatchObject({
      cookie: '__Host-khums_staff=test-session',
    });
  });

  it('signs in, changes the password and signs out (204 has no body)', async () => {
    const fetch = vi.fn<FetchLike>((url) =>
      Promise.resolve(
        url.endsWith('/logout')
          ? ({ ok: true, status: 204, json: () => Promise.reject(new Error('no body')) } as never)
          : response(200, {
              mustChangePassword: true,
              sessionExpiresAt: '2026-11-20T10:30:00.000Z',
            }),
      ),
    );
    const client = createApiClient({
      baseUrl: '/api/v1',
      fetch,
      headers: () => ({ 'x-csrf-token': 't' }),
    });
    expect(await client.staff.login({ username: 'a', password: 'b' })).toMatchObject({
      ok: true,
      value: { mustChangePassword: true },
    });
    expect(fetch.mock.calls[0]![0]).toBe('/api/v1/staff/auth/login');
    expect(fetch.mock.calls[0]![1].method).toBe('POST');
    expect((await client.staff.changePassword({ currentPassword: 'a', newPassword: 'b' })).ok).toBe(
      true,
    );
    expect(await client.staff.logout()).toEqual({ ok: true, value: null });
    expect(fetch.mock.calls[2]![1].headers).toMatchObject({ 'x-csrf-token': 't' });
  });
});

describe('admin console client (M4.6.5)', () => {
  const calls = () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(response(500, {})));
    return { fetch, client: createApiClient({ baseUrl: 'http://x/api/v1', fetch }) };
  };
  it('targets the staff, governance and audit endpoints', async () => {
    const { fetch, client } = calls();
    await client.staffAccounts.grantRole('p-1', {
      role: 'SCHOLAR',
      scope: { kind: 'MARJA', marjaIds: ['sistani'] },
      reason: 'TEST',
    });
    await client.staffAccounts.revokeRole('p-1', 'a/1', 'TEST');
    await client.staffAccounts.replaceRole('p-1', 'a/1', {
      role: 'SCHOLAR',
      scope: { kind: 'MARJA', marjaIds: ['sistani', 'khamenei'] },
      reason: 'TEST change',
    });
    await client.governance.command('pack', '1.0.0', 'review/start', { expectedSequence: 1 });
    await client.governance.auditEvents({ afterSequence: 10, limit: 25 });
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      'http://x/api/v1/admin/staff/accounts/p-1/roles',
      'http://x/api/v1/admin/staff/accounts/p-1/roles/a%2F1/revoke',
      'http://x/api/v1/admin/staff/accounts/p-1/roles/a%2F1/replace',
      'http://x/api/v1/admin/governance/packs/pack/versions/1.0.0/review/start',
      'http://x/api/v1/admin/audit/events?afterSequence=10&limit=25',
    ]);
    expect(fetch.mock.calls[1]![1]).toMatchObject({ body: JSON.stringify({ reason: 'TEST' }) });
    expect(fetch.mock.calls[2]![1]).toMatchObject({ method: 'POST' });
  });
});

describe('research client (M5.3.3–M5.3.5)', () => {
  const ID = '01936b2e-7c4a-7d3e-9f10-1a2b3c4d5e6f';
  const record = {
    entityType: 'SOURCE',
    entityId: ID,
    displayRef: 'S-sistani-7K3QX9MZ',
    marjaId: 'sistani',
    state: 'DRAFT',
    questionId: null,
    rulingVersion: null,
    rulingSeriesId: null,
    expectedRevision: 1,
    content: {
      revision: 0,
      payload: {},
      payloadDigest: 'a'.repeat(64),
      references: [],
      aiInvolvement: [],
    },
    records: [],
    aiProvenance: [],
  };

  it('calls every research endpoint with encoded paths, queries and bodies', async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(response(500, { bad: true })));
    const client = createApiClient({ baseUrl: 'http://x/api/v1', fetch });
    const urls = () => fetch.mock.calls.map((call) => [call[1].method, call[0]]);
    await client.research.marjas();
    await client.research.list('sources', { marjaId: 'sistani', state: 'DRAFT', limit: 5 });
    await client.research.metadata('passages', { marjaId: 'khamenei' });
    await client.research.get('translations', ID);
    await client.research.recordMetadata('sources', ID);
    await client.research.revision('sources', ID, 2);
    await client.research.create('sources', {
      marjaId: 'sistani',
      payload: {},
      references: [],
      aiInvolvement: [],
    });
    await client.research.revise('passages', ID, {
      expectedRevision: 1,
      payload: {},
      references: [],
      aiInvolvement: [],
    });
    await client.research.transition('translations', ID, 'review', {
      expectedRevision: 2,
      reason: null,
    });
    await client.research.list('findings', { questionId: 'INC-01' });
    await client.research.transition('rulings', ID, 'approve', {
      expectedRevision: 1,
      reason: null,
    });
    await client.research.createRulingVersion(ID, {
      expectedRevision: 2,
      payload: {},
      references: [],
      aiInvolvement: [],
    });
    await client.research.rulingVersions(ID);
    await client.research.listEvidence(ID);
    await client.research.getEvidence(ID);
    await client.research.evidenceContent(ID);
    expect(urls()).toEqual([
      ['GET', 'http://x/api/v1/admin/research/marjas'],
      ['GET', 'http://x/api/v1/admin/research/sources?marjaId=sistani&state=DRAFT&limit=5'],
      ['GET', 'http://x/api/v1/admin/research/passages/metadata?marjaId=khamenei'],
      ['GET', `http://x/api/v1/admin/research/translations/${ID}`],
      ['GET', `http://x/api/v1/admin/research/sources/${ID}/metadata`],
      ['GET', `http://x/api/v1/admin/research/sources/${ID}/revisions/2`],
      ['POST', 'http://x/api/v1/admin/research/sources'],
      ['POST', `http://x/api/v1/admin/research/passages/${ID}/revise`],
      ['POST', `http://x/api/v1/admin/research/translations/${ID}/review`],
      ['GET', 'http://x/api/v1/admin/research/findings?questionId=INC-01'],
      ['POST', `http://x/api/v1/admin/research/rulings/${ID}/approve`],
      ['POST', `http://x/api/v1/admin/research/rulings/${ID}/versions`],
      ['GET', `http://x/api/v1/admin/research/rulings/${ID}/versions`],
      ['GET', `http://x/api/v1/admin/research/evidence?sourceId=${ID}`],
      ['GET', `http://x/api/v1/admin/research/evidence/${ID}`],
      ['GET', `http://x/api/v1/admin/research/evidence/${ID}/content`],
    ]);
  });

  it('parses a research record and rejects contract drift', async () => {
    const good = createApiClient({
      baseUrl: 'http://x/api/v1',
      fetch: () => Promise.resolve(response(200, record)),
    });
    expect((await good.research.get('sources', ID)).ok).toBe(true);
    const drifted = createApiClient({
      baseUrl: 'http://x/api/v1',
      fetch: () => Promise.resolve(response(200, { ...record, state: 'PUBLISHED' })),
    });
    const result = await drifted.research.get('sources', ID);
    expect(result.ok ? null : result.error.kind).toBe('invalid_response');
  });
});

describe('public calculator (decision 65)', () => {
  it('lists Marjas and fetches a verified pack with an encoded path, without credentials', async () => {
    const fetch = vi.fn<FetchLike>((url) =>
      Promise.resolve(
        url.endsWith('/public/marjas')
          ? response(200, { marjas: [{ marjaId: 'sistani', verifiedPack: null }] })
          : response(200, { status: 'NOT_AVAILABLE', marjaId: 'a b' }),
      ),
    );
    const client = createApiClient({ baseUrl: 'http://x/api/v1', fetch });
    expect(await client.public.marjas()).toEqual({
      ok: true,
      value: { marjas: [{ marjaId: 'sistani', verifiedPack: null }] },
    });
    expect(await client.public.verifiedPack('a b')).toEqual({
      ok: true,
      value: { status: 'NOT_AVAILABLE', marjaId: 'a b' },
    });
    expect(fetch.mock.calls[1]?.[0]).toBe('http://x/api/v1/public/marjas/a%20b/pack');
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({ method: 'GET' });
  });

  it('reports an AVAILABLE answer without its pack as contract drift', async () => {
    const client = createApiClient({
      baseUrl: 'http://x/api/v1',
      fetch: () => Promise.resolve(response(200, { status: 'AVAILABLE', marjaId: 'sistani' })),
    });
    expect(await client.public.verifiedPack('sistani')).toMatchObject({
      ok: false,
      error: { kind: 'invalid_response' },
    });
  });
});

describe('rule builder endpoints (Phase 2 steps 3–4)', () => {
  const RULE = '01890000-0000-7000-8000-000000000001';
  const content = {
    category: 'ANNUAL_SURPLUS' as const,
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
  };

  it('calls every rule builder endpoint with encoded paths and queries', async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(response(500, { bad: true })));
    const client = createApiClient({ baseUrl: 'http://x/api/v1', fetch });
    await client.rules.list('sistani');
    await client.rules.get(RULE);
    await client.rules.create({ marjaId: 'sistani', content, reason: 'TEST' });
    await client.rules.revise(RULE, { expectedRevision: 1, content, reason: 'TEST' });
    await client.rules.check({ marjaId: 'sistani', content });
    await client.rules.test({
      marjaId: 'sistani',
      currency: 'USD',
      period: { start: '2025-01-01', end: '2025-12-31' },
      entries: [],
      answers: {},
      entryAnswers: {},
    });
    await client.rules.verification(RULE);
    await client.rules.verify(RULE, {
      revision: 0,
      attestations: {
        sourcesAuthentic: true,
        originalTextMatches: true,
        translationAccurate: true,
        attributionCorrect: true,
      },
      notes: null,
      reason: 'TEST',
    });
    await client.rules.publications();
    await client.rules.requests('sistani');
    await client.rules.createRequest({
      marjaId: 'sistani',
      kind: 'MISSING_RULE',
      ruleId: null,
      message: 'TEST request',
    });
    await client.rules.resolveRequest(RULE, { note: 'TEST note' });
    expect(fetch.mock.calls.map((call) => [call[1].method, call[0]])).toEqual([
      ['GET', 'http://x/api/v1/admin/rules?marjaId=sistani'],
      ['GET', `http://x/api/v1/admin/rules/${RULE}`],
      ['POST', 'http://x/api/v1/admin/rules'],
      ['POST', `http://x/api/v1/admin/rules/${RULE}/revise`],
      ['POST', 'http://x/api/v1/admin/rules/check'],
      ['POST', 'http://x/api/v1/admin/rules/test'],
      ['GET', `http://x/api/v1/admin/rules/${RULE}/verification`],
      ['POST', `http://x/api/v1/admin/rules/${RULE}/verify`],
      ['GET', 'http://x/api/v1/admin/rules/publications'],
      ['GET', 'http://x/api/v1/admin/rules/requests?marjaId=sistani'],
      ['POST', 'http://x/api/v1/admin/rules/requests'],
      ['POST', `http://x/api/v1/admin/rules/requests/${RULE}/resolve`],
    ]);
  });

  it('parses a rule list and rejects contract drift', async () => {
    const list = { marjaId: 'sistani', canEdit: true, canTest: true, rules: [] };
    const good = createApiClient({
      baseUrl: 'http://x/api/v1',
      fetch: () => Promise.resolve(response(200, list)),
    });
    expect((await good.rules.list('sistani')).ok).toBe(true);
    const drifted = createApiClient({
      baseUrl: 'http://x/api/v1',
      fetch: () => Promise.resolve(response(200, { ...list, canEdit: 'yes' })),
    });
    expect((await drifted.rules.list('sistani')).ok).toBe(false);
  });
});
