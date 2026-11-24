import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MongoClient, type Db, type Document } from 'mongodb';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { formatUuidV7, replayResearchChain, verifyAuditChain } from '@khums/core';
import type { EvidenceArtefact, GovernanceRole } from '@khums/shared-types';

import { readAuditChain } from '../src/audit/audit-event.store';
import { StaffAuthorizationService } from '../src/auth/staff-authorization.service';
import type { ApiProblemException } from '../src/common/errors/api-problem.exception';
import { loadVerifiedChains } from '../src/integrity/integrity-checkpoints';
import { COLLECTIONS } from '../src/persistence/collections';
import { inventoryDatabase } from '../src/persistence/database-inventory';
import {
  MONGO_CLIENT_OPTIONS,
  mongoAppendOnlyCollection,
} from '../src/persistence/mongo-append-only-collection';
import { chainSourcesOf } from '../src/persistence/operator-commands';
import {
  backupLocalEvidence,
  restoreLocalEvidence,
  verifyEvidence,
  verifyLocalEvidenceBackup,
} from '../src/research/evidence-backup';
import { localEncryptedEvidenceStorage, sha256Hex } from '../src/research/evidence-storage';
import { EvidenceService } from '../src/research/evidence.service';
import type { ResearchIdSource } from '../src/research/research-common';
import {
  mongoResearchStore,
  researchChainStore,
  type ResearchStores,
} from '../src/research/research-store';
import { ResearchService } from '../src/research/research.service';
import { atlasItestTargetFromEnv } from './support/atlas-itest-target';
import { staffRequest, type TestScope } from './support/staff-principal';
import { PublicPackCache } from '../src/public/public-pack-cache';

/**
 * EXISTING-DATABASE integration suite for scholar research (M5.3.3;
 * docs/ATLAS_INTEGRATION_TEST_PLAN.md, plan id ATLAS-ITEST-PLAN-M533-R5). Runs ONLY via
 * `pnpm --filter @khums/api test:atlas-itest` with the approved plan id and a fresh run id; skipped
 * everywhere else. It never migrates, drops, updates or deletes: it refuses to start (before any
 * write) unless the database is a replica set and the research collections, unique indexes and
 * validators already exist; it only INSERTS synthetic records through the application's services,
 * every one carrying the run id in its request id (principals are in-memory test principals: no
 * staff account, role or policy is written). It snapshots every pre-existing document of the
 * application's collections first and proves at the end that none changed. Evidence bytes go to a
 * temporary encrypted directory (random key) on this machine, never to Atlas.
 * SYNTHETIC placeholder content only: no real source, excerpt, translation or ruling.
 */
const target = atlasItestTargetFromEnv();
const RUN = target.kind === 'READY' ? target.runId : 'itest-00000000t000000z-000000';
const clock = { now: () => Date.now() };
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
const as = (principalId: string, ...roles: readonly (readonly [GovernanceRole, TestScope])[]) =>
  staffRequest(Date.now(), `${RUN}-${principalId}`, ...roles);
const scholar = () => as('scholar', ['GOVERNING_SCHOLAR', ['sistani']]);
let step = 0;
/** Every record and audit event of this run carries `${RUN}:…` as its request id. */
const req = () => `${RUN}:${String((step += 1))}`;
const randomIds: ResearchIdSource = {
  next: () => formatUuidV7(Date.now(), new Uint8Array(randomBytes(10))),
};

const SOURCE = {
  title: { original: `TEST synthetic source ${RUN}`, translation: null },
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
  notes: `SYNTHETIC integration-test record ${RUN}; not a source. $ . ـ ی`,
};
const create = { marjaId: 'sistani', payload: SOURCE, references: [], aiInvolvement: [] };

/** The application's collections the suite reads or writes. */
const TOUCHED = [
  'auditEvents',
  'researchSources',
  'evidenceArtefacts',
  // Read-only here: the migration's policy seed must be unchanged by the run (plan R3).
  'governancePolicyRegistry',
  'staffAccounts',
  'administrativeControl',
] as const;
const REQUIRED_UNIQUE: Readonly<Record<string, readonly string[]>> = {
  researchSources: ['entity_revision_unique', 'recordId_unique', 'displayRef_revision_unique'],
  sourcePassages: ['entity_revision_unique', 'recordId_unique', 'displayRef_revision_unique'],
  passageTranslations: ['entity_revision_unique', 'recordId_unique', 'displayRef_revision_unique'],
  evidenceArtefacts: ['artefactId_unique', 'marja_digest_unique'],
  auditEvents: ['sequence_unique', 'eventId_unique'],
};

interface Snapshot {
  readonly ids: readonly unknown[];
  readonly digest: string;
}
const digestOf = (docs: readonly Document[]) =>
  createHash('sha256')
    .update(JSON.stringify(docs.map((d) => JSON.stringify(d))))
    .digest('hex');

describe.skipIf(target.kind === 'DISABLED')(
  'existing khums database: research (approved plan)',
  () => {
    let client: MongoClient | undefined;
    let db: Db;
    let evidenceDir = '';
    const evidenceKey = new Uint8Array(randomBytes(32));
    const before = new Map<string, Snapshot>();
    const runCreated: { entityIds: string[]; artefacts: EvidenceArtefact[] } = {
      entityIds: [],
      artefacts: [],
    };

    const services = (wrap?: (s: ResearchStores) => ResearchStores, ids = randomIds) => {
      const store = mongoResearchStore(db, client, wrap);
      const authz = new StaffAuthorizationService(clock);
      const storage = localEncryptedEvidenceStorage(evidenceDir, evidenceKey);
      return {
        research: new ResearchService(store, ids, clock, authz, logger, new PublicPackCache(clock)),
        evidence: new EvidenceService(store, storage, ids, clock, authz, logger),
        storage,
      };
    };
    const runDocs = (collection: string, entityId: string) =>
      db.collection(collection).countDocuments({ entityId });

    beforeAll(async () => {
      if (target.kind !== 'READY') {
        throw new Error(`Refused: ${target.kind === 'REFUSED' ? target.reason : ''}`);
      }
      client = new MongoClient(target.uri, MONGO_CLIENT_OPTIONS);
      db = client.db(target.database);
      // Read-only preflight: refuse BEFORE any write unless everything the plan needs exists.
      const inventory = await inventoryDatabase(db);
      if (!inventory.transactionsSupported) throw new Error('Refused: no replica-set transactions');
      for (const [name, unique] of Object.entries(REQUIRED_UNIQUE)) {
        const found = inventory.collections.find((c) => c.name === name);
        if (found === undefined)
          throw new Error(`Refused: ${name} missing (migration not applied)`);
        const present = found.indexes.filter((i) => i.unique).map((i) => i.name);
        if (!unique.every((u) => present.includes(u))) {
          throw new Error(`Refused: ${name} unique indexes missing (migration not applied)`);
        }
        if (found.validatorRequired === null) throw new Error(`Refused: ${name} has no validator`);
      }
      // Snapshot every pre-existing document of the collections the run touches.
      for (const name of TOUCHED) {
        const docs = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
        before.set(name, { ids: docs.map((d) => d._id), digest: digestOf(docs) });
      }
      evidenceDir = await mkdtemp(join(tmpdir(), `khums-${RUN}-`));
    }, 120_000);

    afterAll(async () => {
      if (evidenceDir !== '') await rm(evidenceDir, { recursive: true, force: true });
      await client?.close();
    });

    it('A1 replica set with transactions; unique indexes and validators exist; the validator rejects malformed revisions', async () => {
      const inventory = await inventoryDatabase(db);
      expect(inventory).toMatchObject({ replicaSet: true, transactionsSupported: true });
      // A malformed revision document (no recordJson) is rejected by the server: nothing is written.
      await expect(
        db.collection('researchSources').insertOne({ entityId: `${RUN}-malformed`, revision: 0 }),
      ).rejects.toMatchObject({ code: 121 });
      expect(await runDocs('researchSources', `${RUN}-malformed`)).toBe(0);
    }, 60_000);

    it('A2 a revision and its audit event commit together', async () => {
      const { research } = services();
      const requestId = req();
      const source = await research.create(scholar(), 'sources', create, requestId);
      runCreated.entityIds.push(source.entityId);
      expect(await runDocs('researchSources', source.entityId)).toBe(1);
      expect(await db.collection('auditEvents').countDocuments({ requestId })).toBe(1);
    }, 60_000);

    it('A3 rollback: when the audit event fails, nothing is stored', async () => {
      const failing = services((s) => ({
        ...s,
        audit: () => Promise.resolve({ ok: false, error: 'AUDIT_STORE_UNAVAILABLE' }),
      }));
      const requestId = req();
      await expect(
        failing.research.create(scholar(), 'sources', create, requestId),
      ).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
      });
      expect(await db.collection('auditEvents').countDocuments({ requestId })).toBe(0);
      expect(
        await db.collection('researchSources').countDocuments({
          recordJson: { $regex: `"requestId":"${requestId}"` },
        }),
      ).toBe(0);
    }, 60_000);

    it('A4 optimistic concurrency: of 3 concurrent revisions exactly one commits; stale commands get 409', async () => {
      const { research } = services();
      const source = await research.create(scholar(), 'sources', create, req());
      runCreated.entityIds.push(source.entityId);
      const revise = () =>
        research.revise(
          scholar(),
          'sources',
          source.entityId,
          { expectedRevision: 1, payload: SOURCE, references: [], aiInvolvement: [] },
          req(),
        );
      const outcomes = await Promise.allSettled([revise(), revise(), revise()]);
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      for (const o of outcomes) {
        if (o.status === 'rejected') {
          expect((o.reason as ApiProblemException).code).toBe('RESEARCH_CONFLICT');
        }
      }
      expect(await runDocs('researchSources', source.entityId)).toBe(2);
      await expect(revise()).rejects.toMatchObject({ code: 'RESEARCH_CONFLICT' });
    }, 120_000);

    it('A5 duplicate keys: a revision-0 id collision aborts and retries with a fresh UUIDv7', async () => {
      const fixed = randomIds.next();
      const queue = [fixed, fixed];
      const { research } = services(undefined, { next: () => queue.shift() ?? randomIds.next() });
      const first = await research.create(scholar(), 'sources', create, req());
      const second = await research.create(scholar(), 'sources', create, req());
      runCreated.entityIds.push(first.entityId, second.entityId);
      expect(first.entityId).toBe(fixed);
      expect(second.entityId).not.toBe(fixed);
    }, 60_000);

    it('A6 chains persist exactly through BSON, replay, and are read by the checkpoint loader', async () => {
      const { research } = services();
      const [id] = runCreated.entityIds;
      if (id === undefined) throw new Error('A2 did not run');
      expect((await research.get(scholar(), 'sources', id)).content.payload).toEqual(SOURCE);
      const loaded = await researchChainStore(
        mongoAppendOnlyCollection(db, COLLECTIONS.researchSources),
        'SOURCE',
      ).load(id);
      expect(loaded.kind === 'FOUND' && replayResearchChain(loaded.value).ok).toBe(true);
      const chains = await loadVerifiedChains(chainSourcesOf(db));
      const mine = chains.filter((c) => runCreated.entityIds.some((e) => c.chainId.endsWith(e)));
      expect(mine.length).toBe(runCreated.entityIds.length);
      expect(mine.every((c) => c.status === 'VERIFIED')).toBe(true);
    }, 120_000);

    it('A7 evidence: metadata and encrypted storage reference commit atomically; idempotent; backup, restore, decrypt and SHA-256 verify', async () => {
      const { research, evidence, storage } = services();
      const source = await research.create(scholar(), 'sources', create, req());
      runCreated.entityIds.push(source.entityId);
      const bytes = new TextEncoder().encode(`TEST synthetic evidence ${RUN}`);
      const body = {
        sourceId: source.entityId,
        mediaType: 'text/plain' as const,
        sha256: sha256Hex(bytes),
        copyright: 'EXCERPTS_ONLY' as const,
        extent: 'EXCERPT' as const,
        description: `TEST ${RUN}`,
        contentBase64: Buffer.from(bytes).toString('base64'),
      };
      const failing = services((s) => ({
        ...s,
        audit: () => Promise.resolve({ ok: false, error: 'AUDIT_STORE_UNAVAILABLE' }),
      }));
      await expect(failing.evidence.upload(scholar(), body, req())).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
      });
      expect(
        await db.collection('evidenceArtefacts').countDocuments({ sourceId: source.entityId }),
      ).toBe(0);
      const results = await Promise.all([0, 1].map(() => evidence.upload(scholar(), body, req())));
      expect(results.filter((r) => r.created)).toHaveLength(1);
      const stored = await db
        .collection('evidenceArtefacts')
        .find({ sourceId: source.entityId }, { projection: { _id: 0 } })
        .toArray();
      expect(stored).toHaveLength(1);
      const artefact = stored[0] as unknown as EvidenceArtefact;
      runCreated.artefacts.push(artefact);
      expect(artefact.storageKey).toBe(`sistani/${sha256Hex(bytes)}`);
      const content = await evidence.content(scholar(), artefact.artefactId);
      expect(Buffer.from(content.contentBase64, 'base64').equals(Buffer.from(bytes))).toBe(true);
      // Backup → verify (hash + decryption + digest) → restore into an empty directory → verify again.
      const backup = join(evidenceDir, 'backup');
      expect((await backupLocalEvidence(evidenceDir, storage, backup)).ok).toBe(true);
      const verified = await verifyLocalEvidenceBackup(backup, evidenceKey);
      expect(verified.ok && verified.value.ok).toBe(true);
      const restoredRoot = join(evidenceDir, 'restored');
      expect((await restoreLocalEvidence(backup, restoredRoot, evidenceKey)).ok).toBe(true);
      const restored = await verifyEvidence(
        localEncryptedEvidenceStorage(restoredRoot, evidenceKey),
        [artefact],
      );
      expect(restored.ok && restored.value).toMatchObject({ verified: 1, ok: true });
    }, 120_000);

    it('A8 Marja scope: other Marjas and other roles cannot read or write', async () => {
      const { research } = services();
      const [id] = runCreated.entityIds;
      if (id === undefined) throw new Error('A2 did not run');
      const outsiders = [
        as('outsider', ['GOVERNING_SCHOLAR', ['khamenei']]),
        as('researcher', ['RELIGIOUS_RESEARCHER', ['sistani']]),
        as('admin', ['SUPER_ADMIN', 'ALL']),
        as('auditor', ['AUDITOR', 'ALL']),
      ];
      for (const who of outsiders) {
        await expect(research.get(who, 'sources', id)).rejects.toMatchObject({
          code: 'RESEARCH_NOT_FOUND',
        });
        await expect(research.create(who, 'sources', create, req())).rejects.toMatchObject({
          code: 'ACCESS_DENIED',
        });
      }
      // Auditors see history metadata only.
      const metadata = await research.recordMetadata(
        as('auditor-2', ['AUDITOR', 'ALL']),
        'sources',
        id,
      );
      expect(JSON.stringify(metadata)).not.toContain('SYNTHETIC integration-test record');
    }, 120_000);

    it('A9 every pre-existing document is unchanged; the audit chain verifies; run records are marked', async () => {
      for (const name of TOUCHED) {
        const snapshot = before.get(name);
        if (snapshot === undefined) throw new Error('snapshot');
        const docs = await db
          .collection(name)
          .find({ _id: { $in: [...snapshot.ids] } } as Document)
          .sort({ _id: 1 })
          .toArray();
        expect(docs.length, name).toBe(snapshot.ids.length);
        expect(digestOf(docs), name).toBe(snapshot.digest);
      }
      const audit = await readAuditChain(mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents));
      expect(audit.ok && verifyAuditChain(audit.value).ok).toBe(true);
      const marked = {
        researchSources: await db
          .collection('researchSources')
          .countDocuments({ recordJson: { $regex: `"requestId":"${RUN}:` } }),
        evidenceArtefacts: await db
          .collection('evidenceArtefacts')
          .countDocuments({ requestId: { $regex: `^${RUN}:` } }),
        auditEvents: await db
          .collection('auditEvents')
          .countDocuments({ requestId: { $regex: `^${RUN}:` } }),
      };
      // Ids, counts and the run id only (no content, no URI).
      process.stdout.write(
        `${JSON.stringify({ run: RUN, entityIds: runCreated.entityIds, artefactIds: runCreated.artefacts.map((a) => a.artefactId), marked })}\n`,
      );
      expect(marked.researchSources).toBeGreaterThan(0);
    }, 120_000);
  },
);
