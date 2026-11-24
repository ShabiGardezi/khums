import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { formatUuidV7, verifyAuditChain } from '@khums/core';
import type { AiInvolvement, GovernanceRole, ResearchReference } from '@khums/shared-types';

import { staged } from '../../test/support/staged-collection';
import { staffRequest, type TestScope } from '../../test/support/staff-principal';
import { readAuditChain } from '../audit/audit-event.store';
import { StaffAuthorizationService } from '../auth/staff-authorization.service';
import { ApiProblemException } from '../common/errors/api-problem.exception';
import {
  inMemoryAppendOnlyCollection,
  type AppendOnlyCollection,
} from '../persistence/append-only-collection';
import { COLLECTIONS } from '../persistence/collections';
import { Rollback } from '../persistence/unit-of-work';
import {
  memoryEvidenceStorage,
  sha256Hex,
  unavailableEvidenceStorage,
  type EvidenceStorage,
} from './evidence-storage';
import {
  deleteEvidenceOrphans,
  evidenceOrphanInventory,
  orphanConfirmation,
} from './evidence-orphans';
import { EvidenceService } from './evidence.service';
import type { ResearchIdSource } from './research-common';
import {
  inMemoryResearchCollections,
  researchStoresOver,
  type ResearchCollections,
  type ResearchStore,
  type ResearchStores,
} from './research-store';
import { ResearchService } from './research.service';
import { PublicPackCache } from '../public/public-pack-cache';

/**
 * Scholar research API use cases (M5.3.3) over in-memory stores with REAL rollback (staged
 * collections, one unit of work at a time). TEST identities and SYNTHETIC placeholder content only:
 * no real source, excerpt, translation or ruling.
 */

let now = Date.parse('2026-11-22T10:00:00.000Z');
const clock = { now: () => (now += 250) };
const as = (principalId: string, ...roles: readonly (readonly [GovernanceRole, TestScope])[]) =>
  staffRequest(now, principalId, ...roles);
const scholar = () => as('test-scholar', ['GOVERNING_SCHOLAR', ['sistani']]);
const twoMarjas = () => as('test-two-marjas', ['GOVERNING_SCHOLAR', ['sistani', 'khamenei']]);
const outsider = () => as('test-outsider', ['GOVERNING_SCHOLAR', ['khamenei']]);
const researcher = () => as('test-researcher', ['RELIGIOUS_RESEARCHER', ['sistani']]);
const admin = () => as('test-admin', ['SUPER_ADMIN', 'ALL']);
const auditor = () => as('test-auditor', ['AUDITOR', 'ALL']);
/** Decision 64: the grantable scholar role, scoped to another Marja (read-only for Sistani). */
const otherScholar = () => as('test-other-scholar', ['SCHOLAR', ['khamenei']]);

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
const SECRET_TEXT = 'TEST excerpt placeholder that must never reach logs or audit';
const PASSAGE = {
  locator: { volume: 2, page: '41', masalah: null, istiftaId: null, section: null, url: null },
  originalLanguage: 'ar',
  text: SECRET_TEXT,
  precautionWording: null,
  notes: null,
};
const TRANSLATION = {
  language: 'en',
  text: 'TEST translation',
  translator: 'test-translator',
  notes: null,
};

interface Harness {
  readonly research: ResearchService;
  readonly evidence: EvidenceService;
  readonly base: ResearchCollections;
  readonly storage: EvidenceStorage & { tamper?(key: string, bytes: Uint8Array): void };
  readonly logger: { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  wrap(next: (s: ResearchStores) => ResearchStores): void;
}

let idCounter = 0;
const nextId = () => {
  idCounter += 1;
  const random = new Uint8Array(10);
  random[9] = idCounter;
  random[8] = idCounter >> 8;
  return formatUuidV7(Date.parse('2026-11-22T09:00:00.000Z') + idCounter, random);
};

function harness(options: { ids?: ResearchIdSource; storage?: EvidenceStorage } = {}): Harness {
  const base = inMemoryResearchCollections(inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents));
  let wrap: (s: ResearchStores) => ResearchStores = (s) => s;
  let queue: Promise<unknown> = Promise.resolve();
  const store: ResearchStore = {
    stores: researchStoresOver(base),
    durable: false,
    atomically: <T>(work: (s: ResearchStores) => Promise<T>): Promise<T> => {
      const run = async () => {
        const parts = Object.fromEntries(
          Object.entries(base).map(([k, c]) => [k, staged(c as AppendOnlyCollection)]),
        ) as Record<keyof ResearchCollections, ReturnType<typeof staged>>;
        const collections = Object.fromEntries(
          Object.entries(parts).map(([k, p]) => [k, p.collection]),
        ) as unknown as ResearchCollections;
        try {
          const result = await work(wrap(researchStoresOver(collections)));
          for (const p of Object.values(parts)) await p.commit();
          return result;
        } catch (error) {
          if (error instanceof Rollback) return error.value as T;
          throw error;
        }
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    },
  };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  const ids = options.ids ?? { next: nextId };
  const storage = options.storage ?? memoryEvidenceStorage();
  const authz = new StaffAuthorizationService(clock);
  return {
    research: new ResearchService(
      store,
      ids,
      clock,
      authz,
      logger as unknown as PinoLogger,
      new PublicPackCache(clock),
    ),
    evidence: new EvidenceService(
      store,
      storage,
      ids,
      clock,
      authz,
      logger as unknown as PinoLogger,
    ),
    base,
    storage,
    logger,
    wrap: (next) => (wrap = next),
  };
}

async function problemOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiProblemException) {
      return { status: error.getStatus(), code: error.code, detail: error.detail };
    }
    throw error;
  }
  throw new Error('expected a problem');
}

async function count(collection: AppendOnlyCollection) {
  const found = await collection.find({}, { sort: { field: '_', direction: 1 } });
  return found.ok ? found.value.length : -1;
}

async function auditEvents(h: Harness) {
  const chain = await readAuditChain(h.base.audit);
  if (!chain.ok) throw new Error('audit');
  expect(verifyAuditChain(chain.value).ok).toBe(true);
  return chain.value as { type: string; details: Record<string, unknown> }[];
}

let h: Harness;
beforeEach(() => {
  h = harness();
});

const content = { references: [] as ResearchReference[], aiInvolvement: [] as AiInvolvement[] };
const createSource = (who = scholar(), marjaId = 'sistani') =>
  h.research.create(who, 'sources', { marjaId, payload: SOURCE, ...content }, 'req-test');
const ref = (record: { entityType: string; entityId: string; marjaId: string }, revision: number) =>
  ({
    entityType: record.entityType,
    entityId: record.entityId,
    revision,
    rulingVersion: null,
    marjaId: record.marjaId,
  }) as ResearchReference;
const transition = (
  who: object,
  type: 'sources' | 'passages' | 'translations' | 'findings' | 'rulings',
  id: string,
  action: 'verify' | 'review' | 'dispute' | 'supersede' | 'delete-draft' | 'approve' | 'withdraw',
  expectedRevision: number,
  reason: string | null = null,
) => h.research.transition(who, type, id, action, { expectedRevision, reason }, 'req-test');

async function verifiedSourceAndPassage() {
  const source = await createSource();
  const verified = await transition(scholar(), 'sources', source.entityId, 'verify', 1);
  const passage = await h.research.create(
    scholar(),
    'passages',
    { marjaId: 'sistani', payload: PASSAGE, references: [ref(verified, 1)], aiInvolvement: [] },
    'req-test',
  );
  const verifiedPassage = await transition(scholar(), 'passages', passage.entityId, 'verify', 1);
  return { source: verified, passage: verifiedPassage };
}

describe('one governing scholar records, verifies and reviews the evidence layer', () => {
  it('runs source → passage → en and ur translations, each revision audited, content never audited', async () => {
    const { passage } = await verifiedSourceAndPassage();
    expect(passage).toMatchObject({ state: 'VERIFIED', expectedRevision: 2 });
    for (const language of ['en', 'ur']) {
      const translation = await h.research.create(
        scholar(),
        'translations',
        {
          marjaId: 'sistani',
          payload: { ...TRANSLATION, language },
          references: [ref(passage, 1)],
          aiInvolvement: [],
        },
        'req-test',
      );
      const reviewed = await transition(
        scholar(),
        'translations',
        translation.entityId,
        'review',
        1,
      );
      expect(reviewed.state).toBe('REVIEWED');
      expect(reviewed.displayRef).toMatch(/^T-sistani-[0-9A-HJKMNP-TV-Z]{8}$/);
    }
    expect(await count(h.base.sources)).toBe(2);
    expect(await count(h.base.passages)).toBe(2);
    expect(await count(h.base.translations)).toBe(4);
    const events = await auditEvents(h);
    expect(events.map((e) => e.type)).toEqual(Array(8).fill('research.record.appended'));
    expect(JSON.stringify(events)).not.toContain(SECRET_TEXT);
    expect(JSON.stringify(h.logger.error.mock.calls)).not.toContain(SECRET_TEXT);
  });

  it('serves the record, an exact revision, lists and auditor metadata without content', async () => {
    const { source, passage } = await verifiedSourceAndPassage();
    const got = await h.research.get(scholar(), 'passages', passage.entityId);
    expect(got.content.payload).toEqual(PASSAGE);
    expect(got.records.map((r) => r.kind)).toEqual(['CREATED', 'VERIFIED']);
    // Revision 1 (VERIFIED) pins the content of revision 0.
    const pinned = await h.research.revision(scholar(), 'passages', passage.entityId, 1);
    expect(pinned).toMatchObject({ stateAtRevision: 'VERIFIED', content: { revision: 0 } });
    const list = await h.research.list(scholar(), 'sources', { marjaId: 'sistani' });
    expect(list.items.map((i) => [i.entityId, i.state, i.label])).toEqual([
      [source.entityId, 'VERIFIED', 'TEST source title'],
    ]);
    const passages = await h.research.list(scholar(), 'passages', {});
    expect(passages.items[0]?.label).toBe('vol. 2, p. 41');
    expect(JSON.stringify(passages)).not.toContain(SECRET_TEXT);
    const metadata = await h.research.metadata(auditor(), 'passages', {});
    expect(metadata.items).toHaveLength(1);
    expect(JSON.stringify(metadata)).not.toContain(SECRET_TEXT);
    expect(metadata.items[0]?.records[0]).toMatchObject({ kind: 'CREATED', hasReason: false });
    expect((await h.research.recordMetadata(auditor(), 'passages', passage.entityId)).state).toBe(
      'VERIFIED',
    );
  });
});

describe('Marja scope and roles are enforced in the backend', () => {
  it('only an in-scope governing scholar may create; others are refused and audited', async () => {
    for (const who of [researcher(), auditor(), outsider(), otherScholar()]) {
      expect(await problemOf(createSource(who))).toMatchObject({
        status: 403,
        code: 'ACCESS_DENIED',
      });
    }
    expect(await count(h.base.sources)).toBe(0);
    const types = (await auditEvents(h)).map((e) => e.type);
    expect(types).toEqual(Array(4).fill('research.action.denied'));
    // Decision 64: SUPER_ADMIN holds every research permission (formerly 403).
    await createSource(admin());
    expect(await count(h.base.sources)).toBe(1);
  });

  it('hides records outside your Marjas (404) and lets auditors see metadata only', async () => {
    const source = await createSource();
    for (const who of [researcher(), auditor()]) {
      expect(await problemOf(h.research.get(who, 'sources', source.entityId))).toMatchObject({
        status: 404,
        code: 'RESEARCH_NOT_FOUND',
      });
      expect(
        await problemOf(transition(who, 'sources', source.entityId, 'verify', 1)),
      ).toMatchObject({ status: 404 });
    }
    // Decision 64: scholars of another Marja (SCHOLAR or legacy GOVERNING_SCHOLAR) read research
    // of every Marja read-only (formerly 404); writes stay refused, now as 403 (the record is
    // readable, so refusing it as unknown would be inconsistent). SUPER_ADMIN reads everything.
    for (const who of [outsider(), otherScholar(), admin()]) {
      expect((await h.research.get(who, 'sources', source.entityId)).entityId).toBe(
        source.entityId,
      );
    }
    for (const who of [outsider(), otherScholar()]) {
      expect(
        await problemOf(transition(who, 'sources', source.entityId, 'verify', 1)),
      ).toMatchObject({ status: 403, code: 'ACCESS_DENIED' });
      expect((await h.research.list(who, 'sources', {})).items).toHaveLength(1);
      // research.audit.read stays within the scholar's own Marjas.
      expect((await h.research.metadata(who, 'sources', {})).items).toEqual([]);
      // Record metadata follows content access (read-only, allowed).
      expect((await h.research.recordMetadata(who, 'sources', source.entityId)).entityId).toBe(
        source.entityId,
      );
    }
    expect((await h.research.list(auditor(), 'sources', {})).items).toEqual([]);
    // The governing scholar of the Marja also holds research.audit.read.
    expect((await h.research.metadata(scholar(), 'sources', {})).items).toHaveLength(1);
    // Decision 64: other initial-scope Marjas are listed with `research.read` only (formerly
    // only the scholar's own Marjas); SUPER_ADMIN gets every research permission everywhere
    // (formerly none).
    expect(h.research.marjas(scholar()).marjas).toEqual([
      expect.objectContaining({ marjaId: 'sistani' }),
      { marjaId: 'khamenei', permissions: ['research.read'] },
    ]);
    expect(h.research.marjas(scholar()).marjas[0]?.permissions).toContain(
      'research.ruling.approve',
    );
    expect(h.research.marjas(twoMarjas()).marjas.map((m) => m.marjaId)).toEqual([
      'sistani',
      'khamenei',
    ]);
    expect(h.research.marjas(admin()).marjas.map((m) => m.permissions.length)).toEqual([12, 12]);
    expect(
      h.research
        .marjas(auditor())
        .marjas.every((m) => m.permissions.join() === 'research.audit.read'),
    ).toBe(true);
  });

  it('refuses creation outside the initial research scope, even for an in-scope scholar', async () => {
    const other = as('test-other-marja', ['GOVERNING_SCHOLAR', ['makarem-shirazi']]);
    expect(await problemOf(createSource(other, 'makarem-shirazi'))).toMatchObject({
      status: 422,
      detail: expect.stringContaining('MARJA_NOT_IN_RESEARCH_SCOPE'),
    });
  });

  it('a scholar of two Marjas keeps them separate; references never cross Marjas', async () => {
    const khamenei = await createSource(twoMarjas(), 'khamenei');
    expect(
      await problemOf(
        h.research.create(
          twoMarjas(),
          'passages',
          {
            marjaId: 'sistani',
            payload: PASSAGE,
            references: [ref(khamenei, 0)],
            aiInvolvement: [],
          },
          'req-test',
        ),
      ),
    ).toMatchObject({ status: 422, detail: expect.stringContaining('REFERENCE_OTHER_MARJA') });
  });
});

const FINDING = {
  language: 'en',
  scenario: null,
  conclusion: SECRET_TEXT,
  explanation: 'TEST explanation placeholder',
  precaution: 'UNDETERMINED',
  conditions: ['TEST condition'],
  exceptions: [],
  qualifications: [],
  unresolvedIssues: [],
  notes: null,
};
const RULING = {
  language: 'en',
  conclusion: SECRET_TEXT,
  explanation: 'TEST ruling explanation placeholder',
  precaution: 'UNDETERMINED',
  conditions: [],
  exceptions: [],
  notes: null,
};

describe('findings and first-version rulings (M5.3.4)', () => {
  const createFinding = (
    who: object,
    references: ResearchReference[],
    extra: { marjaId?: string; questionId?: string } = {},
  ) =>
    h.research.create(
      who,
      'findings',
      {
        marjaId: 'sistani',
        questionId: 'INC-01',
        payload: FINDING,
        references,
        aiInvolvement: [],
        ...extra,
      },
      'req-test',
    );
  const createRuling = (who: object, references: ResearchReference[]) =>
    h.research.create(
      who,
      'rulings',
      { marjaId: 'sistani', payload: RULING, references, aiInvolvement: [] },
      'req-test',
    );
  async function reviewedTranslation(passage: {
    entityId: string;
    marjaId: string;
    entityType: string;
  }) {
    const t = await h.research.create(
      scholar(),
      'translations',
      {
        marjaId: 'sistani',
        payload: TRANSLATION,
        references: [ref(passage, 1)],
        aiInvolvement: [],
      },
      'req-test',
    );
    return transition(scholar(), 'translations', t.entityId, 'review', 1);
  }

  it('one scholar takes a finding and a ruling from draft to approved; every revision is kept and audited', async () => {
    const { passage } = await verifiedSourceAndPassage();
    const translation = await reviewedTranslation(passage);
    const finding = await createFinding(scholar(), [ref(passage, 1), ref(translation, 1)]);
    expect(finding).toMatchObject({
      entityType: 'FINDING',
      state: 'DRAFT',
      questionId: 'INC-01',
      rulingVersion: null,
    });
    expect(finding.displayRef).toMatch(/^F-sistani-INC-01-/);
    await transition(scholar(), 'findings', finding.entityId, 'verify', 1);
    const approved = await transition(scholar(), 'findings', finding.entityId, 'approve', 2);
    expect(approved.state).toBe('APPROVED');
    expect(approved.records.map((r) => [r.kind, r.actor.subject])).toEqual([
      ['CREATED', expect.stringContaining('test-scholar')],
      ['VERIFIED', expect.stringContaining('test-scholar')],
      ['APPROVED', expect.stringContaining('test-scholar')],
    ]);
    const ruling = await createRuling(scholar(), [ref(approved, 2), ref(passage, 1)]);
    expect(ruling).toMatchObject({
      entityType: 'RULING',
      state: 'DRAFT',
      rulingVersion: 1,
      questionId: null,
    });
    const approvedRuling = await transition(scholar(), 'rulings', ruling.entityId, 'approve', 1);
    expect(approvedRuling.state).toBe('APPROVED');
    // Approved content is never overwritten or deleted.
    expect(
      await problemOf(
        transition(scholar(), 'rulings', ruling.entityId, 'delete-draft', 2, 'TEST reason'),
      ),
    ).toMatchObject({ status: 422, detail: expect.stringContaining('INVALID_TRANSITION') });
    expect(
      await problemOf(
        h.research.revise(
          scholar(),
          'findings',
          finding.entityId,
          {
            expectedRevision: 3,
            payload: FINDING,
            references: [ref(passage, 1)],
            aiInvolvement: [],
          },
          'req-test',
        ),
      ),
    ).toMatchObject({ status: 422 });
    expect(await count(h.base.findings)).toBe(3);
    expect(await count(h.base.rulings)).toBe(2);
    const events = await auditEvents(h);
    expect(events.filter((e) => e.type === 'research.record.appended')).toHaveLength(11);
    expect(JSON.stringify(events)).not.toContain(SECRET_TEXT);
    // Lists filter by question and never show the conclusion.
    const listed = await h.research.list(scholar(), 'findings', { questionId: 'INC-01' });
    expect(listed.items.map((i) => i.entityId)).toEqual([finding.entityId]);
    expect((await h.research.list(scholar(), 'findings', { questionId: 'INC-02' })).items).toEqual(
      [],
    );
    expect(JSON.stringify(listed)).not.toContain(SECRET_TEXT);
  });

  it('enforces D14 and the 70-question catalogue through the API', async () => {
    const { source, passage } = await verifiedSourceAndPassage();
    const other = await verifiedSourceAndPassage();
    const foreignTranslation = await reviewedTranslation(other.passage);
    const refused = async (promise: Promise<unknown>, code: string) => {
      expect(await problemOf(promise)).toMatchObject({
        status: 422,
        detail: expect.stringContaining(code),
      });
    };
    await refused(createFinding(scholar(), []), 'PASSAGE_REFERENCE_REQUIRED');
    await refused(
      createFinding(scholar(), [ref(source, 1), ref(passage, 1)]),
      'REFERENCE_TYPE_INVALID',
    );
    await refused(
      createFinding(scholar(), [ref(passage, 1), ref(foreignTranslation, 1)]),
      'TRANSLATION_PASSAGE_NOT_CITED',
    );
    await refused(
      createFinding(scholar(), [ref(passage, 1)], { questionId: 'ADJ-01' }),
      'QUESTION_UNKNOWN',
    );
    await refused(
      h.research.create(
        scholar(),
        'findings',
        { marjaId: 'sistani', payload: FINDING, references: [ref(passage, 1)], aiInvolvement: [] },
        'req-test',
      ),
      'QUESTION_UNKNOWN',
    );
    await refused(
      h.research.create(
        scholar(),
        'sources',
        { marjaId: 'sistani', questionId: 'INC-01', payload: SOURCE, ...content },
        'req-test',
      ),
      'QUESTION_NOT_ALLOWED',
    );
    await refused(createRuling(scholar(), [ref(passage, 1)]), 'FINDING_REFERENCE_REQUIRED');
    expect(await count(h.base.findings)).toBe(0);
    expect(await count(h.base.rulings)).toBe(0);
    const refusals = (await auditEvents(h)).filter((e) => e.type === 'research.action.refused');
    expect(refusals).toHaveLength(7);
  });

  it('refuses other roles and other Marjas; never reveals another Marja’s findings', async () => {
    const { passage } = await verifiedSourceAndPassage();
    // Decision 64: SUPER_ADMIN is no longer refused here (it holds every research permission).
    for (const who of [researcher(), auditor(), outsider(), otherScholar()]) {
      expect(await problemOf(createFinding(who, [ref(passage, 1)]))).toMatchObject({ status: 403 });
      expect(await problemOf(createRuling(who, [ref(passage, 1)]))).toMatchObject({ status: 403 });
    }
    const finding = await createFinding(scholar(), [ref(passage, 1)]);
    for (const who of [researcher(), auditor()]) {
      expect(
        await problemOf(transition(who, 'findings', finding.entityId, 'verify', 1)),
      ).toMatchObject({
        status: 404,
      });
      expect(await problemOf(h.research.get(who, 'findings', finding.entityId))).toMatchObject({
        status: 404,
      });
    }
    // Decision 64: another Marja's scholars read the finding (formerly 404) but cannot verify it.
    for (const who of [outsider(), otherScholar()]) {
      expect((await h.research.get(who, 'findings', finding.entityId)).entityId).toBe(
        finding.entityId,
      );
      expect(
        await problemOf(transition(who, 'findings', finding.entityId, 'verify', 1)),
      ).toMatchObject({ status: 403, code: 'ACCESS_DENIED' });
    }
    // A Khamenei scholar cannot cite Sistani research: refused exactly like an unknown record.
    const khamenei = await problemOf(
      createFinding(outsider(), [{ ...ref(passage, 1), marjaId: 'khamenei' }], {
        marjaId: 'khamenei',
      }),
    );
    expect(khamenei).toMatchObject({
      status: 422,
      detail: expect.stringContaining('REFERENCE_NOT_FOUND'),
    });
    expect(h.research.marjas(scholar()).marjas[0]?.permissions).toEqual(
      expect.arrayContaining(['research.finding.approve', 'research.ruling.approve']),
    );
    expect(h.research.marjas(researcher()).marjas).toEqual([]);
    // Decision 64: SUPER_ADMIN holds every research permission in every Marja (formerly none).
    expect(h.research.marjas(admin()).marjas.map((m) => m.marjaId)).toEqual([
      'sistani',
      'khamenei',
    ]);
  });
});

describe('ruling versions and supersession (M5.3.5)', () => {
  async function approvedRuling() {
    const { passage } = await verifiedSourceAndPassage();
    const finding = await h.research.create(
      scholar(),
      'findings',
      {
        marjaId: 'sistani',
        questionId: 'INC-02',
        payload: FINDING,
        references: [ref(passage, 1)],
        aiInvolvement: [],
      },
      'req-test',
    );
    await transition(scholar(), 'findings', finding.entityId, 'verify', 1);
    const approvedFinding = await transition(scholar(), 'findings', finding.entityId, 'approve', 2);
    const references = [ref(approvedFinding, 2), ref(passage, 1)];
    const draft = await h.research.create(
      scholar(),
      'rulings',
      { marjaId: 'sistani', payload: RULING, references, aiInvolvement: [] },
      'req-test',
    );
    const v1 = await transition(scholar(), 'rulings', draft.entityId, 'approve', 1);
    return { v1, references };
  }
  const correct = (
    who: object,
    id: string,
    expectedRevision: number,
    references: ResearchReference[],
  ) =>
    h.research.createVersion(
      who,
      id,
      {
        expectedRevision,
        payload: { ...RULING, explanation: 'TEST corrected explanation' },
        references,
        aiInvolvement: [],
      },
      'req-test',
    );

  it('corrects, approves and supersedes; the original version and its history stay intact', async () => {
    const { v1, references } = await approvedRuling();
    expect(v1).toMatchObject({ rulingVersion: 1, rulingSeriesId: v1.entityId, state: 'APPROVED' });
    const v2 = await correct(scholar(), v1.entityId, 2, references);
    expect(v2).toMatchObject({ state: 'DRAFT', rulingVersion: 2, rulingSeriesId: v1.entityId });
    expect(await h.research.get(scholar(), 'rulings', v1.entityId)).toEqual(v1);
    let series = await h.research.versions(scholar(), v2.entityId);
    expect(series.current?.entityId).toBe(v1.entityId);
    const before = (await auditEvents(h)).length;
    const approved = await transition(scholar(), 'rulings', v2.entityId, 'approve', 1);
    expect(approved.state).toBe('APPROVED');
    const old = await h.research.get(scholar(), 'rulings', v1.entityId);
    expect(old.state).toBe('SUPERSEDED');
    expect(old.records.slice(0, 2)).toEqual(v1.records);
    expect(old.content).toEqual(v1.content);
    series = await h.research.versions(scholar(), v1.entityId);
    expect(series).toMatchObject({
      rulingSeriesId: v1.entityId,
      current: { entityId: v2.entityId, rulingVersion: 2 },
    });
    expect(series.versions.map((v) => [v.rulingVersion, v.state, v.current])).toEqual([
      [1, 'SUPERSEDED', false],
      [2, 'APPROVED', true],
    ]);
    // One approval, two appended revisions, both audited in the same unit of work.
    const events = (await auditEvents(h)).slice(before);
    expect(events.map((e) => [e.type, e.details.kind])).toEqual([
      ['research.record.appended', 'APPROVED'],
      ['research.record.appended', 'SUPERSEDED'],
    ]);
  });

  it('never allows two current versions, a second open correction, or direct supersession', async () => {
    const { v1, references } = await approvedRuling();
    const refused = async (promise: Promise<unknown>, code: string) => {
      expect(await problemOf(promise)).toMatchObject({
        status: 422,
        detail: expect.stringContaining(code),
      });
    };
    const v2 = await correct(scholar(), v1.entityId, 2, references);
    await refused(correct(scholar(), v1.entityId, 2, references), 'RULING_CORRECTION_NOT_ALLOWED');
    await refused(
      transition(scholar(), 'rulings', v1.entityId, 'supersede', 2),
      'RULING_SUPERSEDED_BY_APPROVAL',
    );
    await transition(scholar(), 'rulings', v2.entityId, 'approve', 1);
    await refused(correct(scholar(), v1.entityId, 3, references), 'RULING_CORRECTION_NOT_ALLOWED');
    const series = await h.research.versions(scholar(), v1.entityId);
    expect(series.versions.filter((v) => v.state === 'APPROVED')).toHaveLength(1);
    // Concurrent corrections of the current version: exactly one becomes the draft.
    const results = await Promise.allSettled([
      correct(scholar(), v2.entityId, 2, references),
      correct(scholar(), v2.entityId, 2, references),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await h.research.versions(scholar(), v1.entityId)).versions).toHaveLength(3);
  });

  it('refuses stale commands with 409 and changes nothing', async () => {
    const { v1, references } = await approvedRuling();
    expect(await problemOf(correct(scholar(), v1.entityId, 1, references))).toMatchObject({
      status: 409,
    });
    const v2 = await correct(scholar(), v1.entityId, 2, references);
    expect(
      await problemOf(transition(scholar(), 'rulings', v2.entityId, 'approve', 2)),
    ).toMatchObject({
      status: 409,
      code: 'RESEARCH_CONFLICT',
    });
    expect((await h.research.get(scholar(), 'rulings', v1.entityId)).state).toBe('APPROVED');
  });

  it('refuses to approve a correction after the corrected version is withdrawn (regression)', async () => {
    const { v1, references } = await approvedRuling();
    const v2 = await correct(scholar(), v1.entityId, 2, references);
    const withdrawn = await transition(
      scholar(),
      'rulings',
      v1.entityId,
      'withdraw',
      2,
      'TEST reason',
    );
    expect(
      await problemOf(transition(scholar(), 'rulings', v2.entityId, 'approve', 1)),
    ).toMatchObject({
      status: 422,
      detail: expect.stringContaining('RULING_CORRECTION_NOT_ALLOWED'),
    });
    expect(await h.research.get(scholar(), 'rulings', v1.entityId)).toEqual(withdrawn);
    expect(await h.research.get(scholar(), 'rulings', v2.entityId)).toEqual(v2);
    const series = await h.research.versions(scholar(), v1.entityId);
    expect(series.current).toBeNull();
    expect(series.versions.map((v) => v.state)).toEqual(['WITHDRAWN', 'DRAFT']);
    expect((await auditEvents(h)).at(-1)).toMatchObject({
      type: 'research.action.refused',
      marjaIds: ['sistani'],
      details: { action: 'APPROVED', issues: ['RULING_CORRECTION_NOT_ALLOWED'] },
    });
  });

  it('withdraws only with a reason and keeps the withdrawn version', async () => {
    const { v1 } = await approvedRuling();
    expect(
      await problemOf(transition(scholar(), 'rulings', v1.entityId, 'withdraw', 2)),
    ).toMatchObject({
      status: 422,
      detail: expect.stringContaining('REASON_REQUIRED'),
    });
    const withdrawn = await transition(
      scholar(),
      'rulings',
      v1.entityId,
      'withdraw',
      2,
      'TEST reason',
    );
    expect(withdrawn.records.map((r) => r.kind)).toEqual(['CREATED', 'APPROVED', 'WITHDRAWN']);
    expect((await h.research.versions(scholar(), v1.entityId)).current).toBeNull();
  });

  it('gives versioning to the Marja’s governing scholar only; others see 404 and are audited', async () => {
    const { v1, references } = await approvedRuling();
    // Decision 64: SUPER_ADMIN is no longer refused (every research permission).
    for (const who of [researcher(), auditor()]) {
      expect(await problemOf(correct(who, v1.entityId, 2, references))).toMatchObject({
        status: 404,
      });
      expect(await problemOf(h.research.versions(who, v1.entityId))).toMatchObject({ status: 404 });
    }
    // Decision 64: another Marja's scholars read the versions (formerly 404) but cannot correct.
    for (const who of [outsider(), otherScholar()]) {
      expect(await problemOf(correct(who, v1.entityId, 2, references))).toMatchObject({
        status: 403,
      });
      expect((await h.research.versions(who, v1.entityId)).current).not.toBeNull();
    }
    const denied = (await auditEvents(h)).filter((e) => e.type === 'research.action.denied');
    expect(denied).toHaveLength(4);
    expect(await count(h.base.rulings)).toBe(2);
  });
});

describe('no existence leaks across Marjas (M5.3 acceptance audit)', () => {
  it('pages through records created in the same millisecond without skipping any', async () => {
    // Ids in DESCENDING order, all created at the same instant: insertion order != key order.
    let n = 9;
    h = harness({
      ids: {
        next: () =>
          formatUuidV7(Date.parse('2026-11-22T09:00:00.000Z'), new Uint8Array(10).fill((n -= 1))),
      },
    });
    const fixed = clock.now();
    const spy = vi.spyOn(clock, 'now').mockReturnValue(fixed);
    const created = [await createSource(), await createSource(), await createSource()];
    spy.mockRestore();
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await h.research.list(scholar(), 'sources', { limit: 1, cursor });
      seen.push(...page.items.map((i) => i.entityId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    expect(seen.sort()).toEqual(created.map((c) => c.entityId).sort());
    const meta: string[] = [];
    cursor = undefined;
    do {
      const page = await h.research.metadata(scholar(), 'sources', { limit: 1, cursor });
      meta.push(...page.items.map((i) => i.entityId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    expect(meta).toHaveLength(3);
  });

  it("a reference to another Marja's record is refused exactly like an unknown id", async () => {
    const khamenei = await createSource(twoMarjas(), 'khamenei');
    const unknown = { ...ref(khamenei, 0), entityId: nextId() };
    const attempt = (reference: ResearchReference) =>
      problemOf(
        h.research.create(
          scholar(),
          'passages',
          {
            marjaId: 'sistani',
            payload: PASSAGE,
            references: [{ ...reference, marjaId: 'sistani' }],
            aiInvolvement: [],
          },
          'req-test',
        ),
      );
    const foreign = await attempt(ref(khamenei, 0));
    expect(foreign).toMatchObject({
      status: 422,
      detail: expect.stringContaining('REFERENCE_NOT_FOUND'),
    });
    expect(await attempt(unknown)).toEqual(foreign);
    // A wrong ruling version reveals nothing either.
    expect(await attempt({ ...ref(khamenei, 0), rulingVersion: 1 })).toEqual(foreign);
    const refusals = (await auditEvents(h)).filter((e) => e.type === 'research.action.refused');
    expect(refusals.map((e) => (e as unknown as { marjaIds: string[] }).marjaIds)).toEqual([
      ['sistani'],
      ['sistani'],
      ['sistani'],
    ]);
  });

  it('commands on records outside your Marjas answer 404 and are audited as denials', async () => {
    const source = await createSource();
    for (const who of [researcher(), auditor()]) {
      expect(
        await problemOf(transition(who, 'sources', source.entityId, 'verify', 1)),
      ).toMatchObject({ status: 404, code: 'RESEARCH_NOT_FOUND' });
    }
    // Decision 64: another Marja's scholars may READ the record, so their commands are refused as
    // 403 (formerly 404: the record's existence is no longer hidden from them). Still audited.
    for (const who of [outsider(), otherScholar()]) {
      expect(
        await problemOf(transition(who, 'sources', source.entityId, 'verify', 1)),
      ).toMatchObject({ status: 403, code: 'ACCESS_DENIED' });
    }
    const denied = (await auditEvents(h)).filter((e) => e.type === 'research.action.denied');
    expect(denied).toHaveLength(4);
    for (const event of denied) {
      expect(event).toMatchObject({ marjaIds: ['sistani'], details: { action: 'VERIFIED' } });
    }
    expect(await count(h.base.sources)).toBe(1);
  });
});

describe('expectedRevision, concurrency and atomicity', () => {
  it('refuses a stale command with 409, stores nothing, and audits the refusal', async () => {
    const source = await createSource();
    await h.research.revise(
      scholar(),
      'sources',
      source.entityId,
      { expectedRevision: 1, payload: SOURCE, ...content },
      'r',
    );
    expect(
      await problemOf(
        h.research.revise(
          scholar(),
          'sources',
          source.entityId,
          { expectedRevision: 1, payload: SOURCE, ...content },
          'r',
        ),
      ),
    ).toMatchObject({ status: 409, code: 'RESEARCH_CONFLICT' });
    expect(await count(h.base.sources)).toBe(2);
    expect((await auditEvents(h)).at(-1)?.type).toBe('research.action.refused');
  });

  it('of two concurrent commands built from the same revision, exactly one commits', async () => {
    const source = await createSource();
    const results = await Promise.allSettled([
      transition(scholar(), 'sources', source.entityId, 'verify', 1),
      h.research.revise(
        scholar(),
        'sources',
        source.entityId,
        { expectedRevision: 1, payload: SOURCE, ...content },
        'r',
      ),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(
      rejected?.status === 'rejected' && (rejected.reason as ApiProblemException).getStatus(),
    ).toBe(409);
    expect(await count(h.base.sources)).toBe(2);
  });

  it('rolls back the revision when its audit event cannot be stored', async () => {
    const source = await createSource();
    h.wrap((s) => ({
      ...s,
      audit: () => Promise.resolve({ ok: false, error: 'AUDIT_STORE_UNAVAILABLE' as const }),
    }));
    expect(
      await problemOf(transition(scholar(), 'sources', source.entityId, 'verify', 1)),
    ).toMatchObject({
      status: 503,
    });
    expect(await count(h.base.sources)).toBe(1);
  });

  it('rolls back when another writer took the revision between read and insert', async () => {
    const source = await createSource();
    h.wrap((s) => ({
      ...s,
      sources: { ...s.sources, append: () => Promise.resolve('CONFLICT' as const) },
    }));
    expect(
      await problemOf(transition(scholar(), 'sources', source.entityId, 'verify', 1)),
    ).toMatchObject({
      status: 409,
      code: 'RESEARCH_CONFLICT',
    });
    expect((await auditEvents(h)).map((e) => e.type)).toEqual(['research.record.appended']);
  });

  it('draws a new UUIDv7 on an id collision, and gives up after repeated collisions', async () => {
    const fixed = nextId();
    const sequence = [fixed, fixed, nextId()];
    h = harness({ ids: { next: () => sequence.shift() ?? nextId() } });
    const first = await createSource();
    const second = await createSource();
    expect(first.entityId).toBe(fixed);
    expect(second.entityId).not.toBe(fixed);
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'research.id.collision' }),
      expect.any(String),
    );
    h = harness({ ids: { next: () => fixed } });
    await createSource();
    expect(await problemOf(createSource())).toMatchObject({ status: 503 });
  });
});

describe('history, tombstones, AI provenance and references', () => {
  it('deletes a draft by tombstone with a reason; history stays readable', async () => {
    const source = await createSource();
    expect(
      await problemOf(transition(scholar(), 'sources', source.entityId, 'delete-draft', 1)),
    ).toMatchObject({
      status: 422,
      detail: expect.stringContaining('REASON_REQUIRED'),
    });
    const deleted = await transition(
      scholar(),
      'sources',
      source.entityId,
      'delete-draft',
      1,
      'TEST duplicate',
    );
    expect(deleted).toMatchObject({ state: 'DELETED', expectedRevision: 2 });
    expect(deleted.content.payload).toEqual(SOURCE);
    expect(
      await problemOf(transition(scholar(), 'sources', source.entityId, 'verify', 2)),
    ).toMatchObject({
      status: 422,
      detail: expect.stringContaining('CHAIN_TERMINAL'),
    });
  });

  it('keeps AI declarations cumulative, takes append-only corrections and gates review on them', async () => {
    const { passage } = await verifiedSourceAndPassage();
    const declared: AiInvolvement = {
      assistance: 'TRANSLATION_DRAFT',
      field: 'payload.text',
      generation: 'AI_GENERATED',
      tool: 'test-tool-misnamed',
      occurredAt: '2026-11-22T08:00:00.000Z',
      scholarReview: 'NOT_REVIEWED',
    };
    const translation = await h.research.create(
      scholar(),
      'translations',
      {
        marjaId: 'sistani',
        payload: TRANSLATION,
        references: [ref(passage, 1)],
        aiInvolvement: [declared],
      },
      'req-test',
    );
    expect(
      await problemOf(transition(scholar(), 'translations', translation.entityId, 'review', 1)),
    ).toMatchObject({ status: 422, detail: expect.stringContaining('AI_REVIEW_REQUIRED') });
    const revise = (aiInvolvement: AiInvolvement[], expectedRevision: number) =>
      h.research.revise(
        scholar(),
        'translations',
        translation.entityId,
        { expectedRevision, payload: TRANSLATION, references: [ref(passage, 1)], aiInvolvement },
        'r',
      );
    expect(await problemOf(revise([], 1))).toMatchObject({
      status: 422,
      detail: expect.stringContaining('AI_DECLARATION_REMOVED'),
    });
    const correction: AiInvolvement = {
      ...declared,
      tool: 'test-tool',
      correctionOf: {
        assistance: declared.assistance,
        field: declared.field,
        generation: declared.generation,
        tool: declared.tool,
        occurredAt: declared.occurredAt,
      },
      correctionReason: 'TEST tool recorded incorrectly',
    };
    await revise([declared, correction], 1);
    expect(
      await problemOf(transition(scholar(), 'translations', translation.entityId, 'review', 2)),
    ).toMatchObject({ status: 422 });
    const reviewed = await revise(
      [declared, { ...correction, scholarReview: 'REVIEWED_CORRECTED' }],
      2,
    );
    expect(reviewed.aiProvenance).toEqual([
      expect.objectContaining({
        effective: false,
        correctedIn: expect.objectContaining({ revision: 1 }),
      }),
      expect.objectContaining({
        effective: true,
        reviewedIn: expect.objectContaining({
          revision: 2,
          actor: { kind: 'STAFF_PRINCIPAL', subject: 'test-scholar' },
        }),
      }),
    ]);
    expect(
      (await transition(scholar(), 'translations', translation.entityId, 'review', 3)).state,
    ).toBe('REVIEWED');
  });

  it('resolves exact references while drafting and again on verification', async () => {
    const source = await createSource();
    const missing = { ...ref(source, 0), entityId: nextId() };
    expect(
      await problemOf(
        h.research.create(
          scholar(),
          'passages',
          { marjaId: 'sistani', payload: PASSAGE, references: [missing], aiInvolvement: [] },
          'r',
        ),
      ),
    ).toMatchObject({ status: 422, detail: expect.stringContaining('REFERENCE_NOT_FOUND') });
    expect(
      await problemOf(
        h.research.create(
          scholar(),
          'passages',
          { marjaId: 'sistani', payload: PASSAGE, references: [ref(source, 4)], aiInvolvement: [] },
          'r',
        ),
      ),
    ).toMatchObject({ detail: expect.stringContaining('REFERENCE_REVISION_INVALID') });
    // Citing the DRAFT source revision: allowed while drafting, refused at verification.
    const passage = await h.research.create(
      scholar(),
      'passages',
      { marjaId: 'sistani', payload: PASSAGE, references: [ref(source, 0)], aiInvolvement: [] },
      'r',
    );
    await transition(scholar(), 'sources', source.entityId, 'verify', 1);
    expect(
      await problemOf(transition(scholar(), 'passages', passage.entityId, 'verify', 1)),
    ).toMatchObject({
      detail: expect.stringContaining('REFERENCE_STATE_INVALID'),
    });
    // A passage may not move to another source.
    const other = await createSource();
    expect(
      await problemOf(
        h.research.revise(
          scholar(),
          'passages',
          passage.entityId,
          { expectedRevision: 1, payload: PASSAGE, references: [ref(other, 0)], aiInvolvement: [] },
          'r',
        ),
      ),
    ).toMatchObject({ detail: expect.stringContaining('BINDING_CHANGED') });
  });

  it('answers 503 and logs an integrity incident (ids only) for a tampered chain', async () => {
    const source = await createSource();
    await h.base.sources.insert({
      entityType: 'SOURCE',
      entityId: source.entityId,
      revision: 1,
      recordId: `${source.entityId}#1`,
      marjaId: 'sistani',
      displayRef: source.displayRef,
      kind: 'VERIFIED',
      recordedAt: '2026-11-22T11:00:00.000Z',
      recordDigest: 'f'.repeat(64),
      recordJson: '{"forged":true}',
    });
    expect(await problemOf(h.research.get(scholar(), 'sources', source.entityId))).toMatchObject({
      status: 503,
    });
    expect(h.logger.error).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: expect.stringContaining('TEST') }),
      expect.any(String),
    );
  });
});

describe('evidence artefacts', () => {
  const bytes = new TextEncoder().encode('TEST synthetic evidence note');
  const upload = async (who: object, sourceId: string, overrides: Record<string, unknown> = {}) =>
    (await uploadRaw(who, sourceId, overrides)).artefact;
  const uploadRaw = (who: object, sourceId: string, overrides: Record<string, unknown> = {}) =>
    h.evidence.upload(
      who,
      {
        sourceId,
        mediaType: 'text/plain',
        sha256: sha256Hex(bytes),
        copyright: 'EXCERPTS_ONLY',
        extent: 'EXCERPT',
        description: 'TEST note',
        contentBase64: Buffer.from(bytes).toString('base64'),
        ...overrides,
      },
      'req-test',
    );

  it('stores encrypted bytes and write-once metadata with its audit event; retrieval re-verifies', async () => {
    const source = await createSource();
    const artefact = await upload(scholar(), source.entityId);
    expect(artefact).toMatchObject({
      marjaId: 'sistani',
      sourceId: source.entityId,
      digest: sha256Hex(bytes),
    });
    expect(await count(h.base.evidence)).toBe(1);
    expect((await auditEvents(h)).at(-1)?.type).toBe('research.evidence.attached');
    const got = await h.evidence.content(scholar(), artefact.artefactId);
    expect(Buffer.from(got.contentBase64, 'base64').equals(Buffer.from(bytes))).toBe(true);
    expect((await h.evidence.list(scholar(), source.entityId)).map((a) => a.artefactId)).toEqual([
      artefact.artefactId,
    ]);
  });

  it('is idempotent for the same file and source, and refuses the same file for another source', async () => {
    const source = await createSource();
    const first = await uploadRaw(scholar(), source.entityId);
    expect(first.created).toBe(true);
    const events = (await auditEvents(h)).length;
    const replay = await uploadRaw(scholar(), source.entityId);
    expect(replay).toEqual({ artefact: first.artefact, created: false });
    expect(await count(h.base.evidence)).toBe(1);
    expect((await auditEvents(h)).length).toBe(events);
    const other = await createSource();
    expect(await problemOf(upload(scholar(), other.entityId))).toMatchObject({
      status: 409,
      detail: expect.stringContaining(
        `EVIDENCE_DUPLICATE: already attached as ${first.artefact.artefactId}`,
      ),
    });
    // The same bytes in another Marja are a separate artefact (per-Marja uniqueness).
    const elsewhere = await createSource(twoMarjas(), 'khamenei');
    const separate = await uploadRaw(twoMarjas(), elsewhere.entityId);
    expect(separate.created).toBe(true);
    expect(separate.artefact.artefactId).not.toBe(first.artefact.artefactId);
    expect(await count(h.base.evidence)).toBe(2);
  });

  it('repairs missing bytes on an idempotent re-upload', async () => {
    const storage = memoryEvidenceStorage();
    h = harness({ storage });
    const source = await createSource();
    const first = await upload(scholar(), source.entityId);
    await storage.remove(`sistani/${first.digest}`);
    expect(await problemOf(h.evidence.content(scholar(), first.artefactId))).toMatchObject({
      status: 503,
    });
    expect((await uploadRaw(scholar(), source.entityId)).created).toBe(false);
    expect((await h.evidence.content(scholar(), first.artefactId)).artefact.artefactId).toBe(
      first.artefactId,
    );
  });

  it('resolves a concurrent duplicate upload to the committed artefact', async () => {
    const source = await createSource();
    const results = await Promise.all([
      uploadRaw(scholar(), source.entityId),
      uploadRaw(scholar(), source.entityId),
    ]);
    expect(results.map((r) => r.created).sort()).toEqual([false, true]);
    const [one, two] = results;
    expect(one.artefact.artefactId).toBe(two.artefact.artefactId);
    expect(await count(h.base.evidence)).toBe(1);
  });

  it('refuses a digest mismatch, a mislabelled file and complete documents without permission', async () => {
    const source = await createSource();
    expect(
      await problemOf(upload(scholar(), source.entityId, { sha256: 'a'.repeat(64) })),
    ).toMatchObject({
      status: 422,
      detail: expect.stringContaining('EVIDENCE_DIGEST_MISMATCH'),
    });
    expect(
      await problemOf(upload(scholar(), source.entityId, { mediaType: 'application/pdf' })),
    ).toMatchObject({
      detail: expect.stringContaining('MEDIA_TYPE_MISMATCH'),
    });
    expect(
      await problemOf(
        upload(scholar(), source.entityId, { extent: 'COMPLETE', copyright: 'PERMITTED' }),
      ),
    ).toMatchObject({ detail: expect.stringContaining('COPYRIGHT_FORBIDS_COMPLETE') });
    expect(await count(h.base.evidence)).toBe(0);
  });

  it('hides sources outside your Marjas and refuses other roles', async () => {
    const source = await createSource();
    for (const who of [researcher(), auditor()]) {
      expect(await problemOf(upload(who, source.entityId))).toMatchObject({ status: 404 });
    }
    // Decision 64: another Marja's scholars see the source (read-only), so an upload is refused
    // as 403 (formerly 404); SUPER_ADMIN is no longer refused (removed from this list).
    for (const who of [outsider(), otherScholar()]) {
      expect(await problemOf(upload(who, source.entityId))).toMatchObject({ status: 403 });
    }
    const artefact = await upload(scholar(), source.entityId);
    expect(await problemOf(h.evidence.content(auditor(), artefact.artefactId))).toMatchObject({
      status: 404,
      code: 'EVIDENCE_NOT_FOUND',
    });
    // Decision 64: evidence follows `research.read`, so other-Marja scholars may read it
    // (formerly 404).
    for (const who of [outsider(), otherScholar(), admin()]) {
      await h.evidence.content(who, artefact.artefactId);
    }
  });

  it('never returns bytes that fail verification (integrity incident, logged with ids only)', async () => {
    const storage = memoryEvidenceStorage();
    h = harness({ storage });
    const source = await createSource();
    const artefact = await upload(scholar(), source.entityId);
    storage.tamper(`sistani/${artefact.digest}`, new TextEncoder().encode('TEST tampered'));
    expect(await problemOf(h.evidence.content(scholar(), artefact.artefactId))).toMatchObject({
      status: 503,
    });
    expect(h.logger.error).toHaveBeenCalledWith(
      {
        event: 'evidence.integrity.failure',
        artefactId: artefact.artefactId,
        code: 'EVIDENCE_DIGEST_MISMATCH',
      },
      expect.any(String),
    );
    expect((await auditEvents(h)).at(-1)).toMatchObject({
      type: 'research.evidence.integrity.failure',
      details: { code: 'EVIDENCE_DIGEST_MISMATCH' },
    });
  });

  it('audits an integrity incident found while re-uploading over tampered bytes', async () => {
    const storage = memoryEvidenceStorage();
    h = harness({ storage });
    const source = await createSource();
    const artefact = await upload(scholar(), source.entityId);
    storage.tamper(`sistani/${artefact.digest}`, new TextEncoder().encode('TEST tampered'));
    expect(await problemOf(upload(scholar(), source.entityId))).toMatchObject({ status: 503 });
    expect((await auditEvents(h)).at(-1)).toMatchObject({
      type: 'research.evidence.integrity.failure',
      marjaIds: ['sistani'],
      details: { code: 'STORAGE_KEY_CONFLICT' },
    });
  });

  it('attributes evidence refusals to the source Marja', async () => {
    const source = await createSource();
    const reader = as('test-reader', ['AUDITOR', 'ALL'], ['GOVERNING_SCHOLAR', ['sistani']]);
    await upload(reader, source.entityId);
    await problemOf(
      upload(scholar(), source.entityId, { extent: 'COMPLETE', copyright: 'PERMITTED' }),
    );
    expect((await auditEvents(h)).at(-1)).toMatchObject({
      type: 'research.action.refused',
      marjaIds: ['sistani'],
      details: { action: 'ATTACH_EVIDENCE' },
    });
  });

  it('leaves no metadata when the audit event fails (bytes may remain, unreferenced)', async () => {
    const source = await createSource();
    h.wrap((s) => ({
      ...s,
      audit: () => Promise.resolve({ ok: false, error: 'AUDIT_STORE_UNAVAILABLE' as const }),
    }));
    expect(await problemOf(upload(scholar(), source.entityId))).toMatchObject({ status: 503 });
    expect(await count(h.base.evidence)).toBe(0);
    expect(await h.storage.keys()).toEqual({ ok: true, value: [`sistani/${sha256Hex(bytes)}`] });
  });

  it('answers 503 EVIDENCE_STORAGE_UNAVAILABLE without durable storage (production)', async () => {
    h = harness({ storage: unavailableEvidenceStorage() });
    const source = await createSource();
    expect(await problemOf(upload(scholar(), source.entityId))).toMatchObject({
      status: 503,
      code: 'EVIDENCE_STORAGE_UNAVAILABLE',
    });
    expect(await count(h.base.evidence)).toBe(0);
  });
});

describe('evidence orphans: failure injection, inventory and confirmed cleanup', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const bytes = new TextEncoder().encode('TEST synthetic orphan candidate');
  const key = `sistani/${sha256Hex(bytes)}`;
  let wall = Date.parse('2026-11-22T12:00:00.000Z');
  const storageNow = () => wall;
  const body = (sourceId: string) =>
    ({
      sourceId,
      mediaType: 'text/plain',
      sha256: sha256Hex(bytes),
      copyright: 'EXCERPTS_ONLY',
      extent: 'EXCERPT',
      description: 'TEST note',
      contentBase64: Buffer.from(bytes).toString('base64'),
    }) as Parameters<EvidenceService['upload']>[1];
  const inventory = () =>
    evidenceOrphanInventory({
      storage: h.storage,
      artefacts: researchStoresOver(h.base).evidence,
      now: storageNow,
    });
  const cleanup = (keys: string[], confirmation = orphanConfirmation(keys.length)) =>
    deleteEvidenceOrphans({
      storage: h.storage,
      artefacts: researchStoresOver(h.base).evidence,
      audit: (draft) => researchStoresOver(h.base).audit(draft),
      now: storageNow,
      keys,
      confirmation,
    });

  beforeEach(() => {
    wall = Date.parse('2026-11-22T12:00:00.000Z');
    h = harness({ storage: memoryEvidenceStorage(storageNow) });
  });

  for (const [failure, inject] of [
    [
      'the audit event',
      (s: ResearchStores): ResearchStores => ({
        ...s,
        audit: () => Promise.resolve({ ok: false, error: 'AUDIT_STORE_UNAVAILABLE' as const }),
      }),
    ],
    [
      'the metadata insert',
      (s: ResearchStores): ResearchStores => ({
        ...s,
        evidence: { ...s.evidence, insert: () => Promise.resolve('UNAVAILABLE' as const) },
      }),
    ],
  ] as const) {
    it(`a failed commit (${failure}) leaves only unreferenced bytes, which a retry recovers`, async () => {
      const source = await createSource();
      h.wrap(inject);
      expect(
        await problemOf(h.evidence.upload(scholar(), body(source.entityId), 'r')),
      ).toMatchObject({
        status: 503,
      });
      expect(await count(h.base.evidence)).toBe(0);
      const orphaned = await inventory();
      expect(orphaned.ok && orphaned.value.orphans).toEqual([
        expect.objectContaining({ key, eligible: false }),
      ]);
      // Recovery: the client retries after the store is back; the orphan becomes referenced.
      h.wrap((s) => s);
      const retried = await h.evidence.upload(scholar(), body(source.entityId), 'r');
      expect(retried.created).toBe(true);
      const after = await inventory();
      expect(after.ok && after.value).toMatchObject({ orphans: [], referencedKeys: 1 });
    });
  }

  it('lists orphans only after the grace period, and deletes them only with the typed confirmation', async () => {
    const source = await createSource();
    h.wrap((s) => ({
      ...s,
      audit: () => Promise.resolve({ ok: false, error: 'AUDIT_STORE_UNAVAILABLE' as const }),
    }));
    await problemOf(h.evidence.upload(scholar(), body(source.entityId), 'r'));
    h.wrap((s) => s);
    // Still in the grace period: not eligible, and a cleanup skips it.
    const early = await inventory();
    expect(early.ok && early.value.eligible).toEqual([]);
    const tooEarly = await cleanup([key]);
    expect(tooEarly.ok && tooEarly.value.skipped).toEqual([{ key, reason: 'IN_GRACE_PERIOD' }]);
    wall += 8 * DAY;
    const late = await inventory();
    expect(late.ok && late.value.eligible).toEqual([key]);
    expect(await cleanup([key], 'yes')).toEqual({ ok: false, error: 'CONFIRMATION_REQUIRED' });
    expect(await h.storage.keys()).toEqual({ ok: true, value: [key] });
    const done = await cleanup([key]);
    expect(done.ok && done.value).toMatchObject({ deleted: [key], skipped: [] });
    expect(await h.storage.keys()).toEqual({ ok: true, value: [] });
    const events = await auditEvents(h);
    const cleanupEvents = events.filter((e) => e.type.startsWith('research.evidence.orphans'));
    expect(cleanupEvents.map((e) => e.type)).toEqual([
      'research.evidence.orphans.cleanup.started',
      'research.evidence.orphans.cleanup.completed',
      'research.evidence.orphans.cleanup.started',
      'research.evidence.orphans.cleanup.completed',
    ]);
    // Keys (Marja + SHA-256), counts and codes only: never the bytes.
    expect(JSON.stringify(cleanupEvents)).not.toContain('TEST synthetic orphan candidate');
  });

  it('never deletes referenced evidence, even when it is passed in explicitly', async () => {
    const source = await createSource();
    const { artefact } = await h.evidence.upload(scholar(), body(source.entityId), 'r');
    wall += 30 * DAY;
    const result = await cleanup([artefact.marjaId + '/' + artefact.digest]);
    expect(result.ok && result.value).toMatchObject({
      deleted: [],
      skipped: [{ reason: 'REFERENCED' }],
    });
    expect((await h.evidence.content(scholar(), artefact.artefactId)).artefact.digest).toBe(
      artefact.digest,
    );
  });

  it('skips a key that was re-uploaded or committed after the inventory', async () => {
    const source = await createSource();
    h.wrap((s) => ({
      ...s,
      audit: () => Promise.resolve({ ok: false, error: 'AUDIT_STORE_UNAVAILABLE' as const }),
    }));
    await problemOf(h.evidence.upload(scholar(), body(source.entityId), 'r'));
    wall += 8 * DAY;
    const listed = await inventory();
    expect(listed.ok && listed.value.eligible).toEqual([key]);
    // A retry is in flight: it re-stores the bytes (restarting the grace period) and then commits.
    await h.storage.put(key, bytes);
    const result = await cleanup([key]);
    expect(result.ok && result.value.skipped).toEqual([{ key, reason: 'IN_GRACE_PERIOD' }]);
    h.wrap((s) => s);
    expect((await h.evidence.upload(scholar(), body(source.entityId), 'r')).created).toBe(true);
    wall += 30 * DAY;
    const later = await cleanup([key]);
    expect(later.ok && later.value.skipped).toEqual([{ key, reason: 'REFERENCED' }]);
  });

  it('deletes nothing when the intent cannot be audited, and refuses unsafe requests', async () => {
    const source = await createSource();
    h.wrap((s) => ({
      ...s,
      audit: () => Promise.resolve({ ok: false, error: 'AUDIT_STORE_UNAVAILABLE' as const }),
    }));
    await problemOf(h.evidence.upload(scholar(), body(source.entityId), 'r'));
    wall += 8 * DAY;
    const failing = await deleteEvidenceOrphans({
      storage: h.storage,
      artefacts: researchStoresOver(h.base).evidence,
      audit: () => Promise.resolve({ ok: false, error: 'AUDIT_STORE_UNAVAILABLE' }),
      now: storageNow,
      keys: [key],
      confirmation: orphanConfirmation(1),
    });
    expect(failing).toEqual({ ok: false, error: 'AUDIT_UNAVAILABLE' });
    expect(await h.storage.keys()).toEqual({ ok: true, value: [key] });
    expect(await cleanup([])).toEqual({ ok: false, error: 'NO_KEYS' });
    expect(await cleanup([key, key])).toEqual({ ok: false, error: 'DUPLICATE_KEYS' });
    const many = Array.from({ length: 51 }, (_, i) => `sistani/${String(i).padStart(64, '0')}`);
    expect(await cleanup(many)).toEqual({ ok: false, error: 'TOO_MANY_KEYS' });
    expect(
      await evidenceOrphanInventory({
        storage: h.storage,
        artefacts: researchStoresOver(h.base).evidence,
        now: storageNow,
        graceMs: 60_000,
      }),
    ).toEqual({ ok: false, error: 'GRACE_TOO_SHORT' });
    const invalid = await cleanup(['../etc/passwd']);
    expect(invalid.ok && invalid.value.skipped).toEqual([
      { key: '../etc/passwd', reason: 'INVALID_KEY' },
    ]);
  });
});
