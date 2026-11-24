import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BSON, ObjectId, type Document } from 'mongodb';
import type { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GovernanceRole } from '@khums/shared-types';

import { staffRequest, type TestScope } from '../../test/support/staff-principal';
import { StaffAuthorizationService } from '../auth/staff-authorization.service';
import { initialRegistryFor } from '../governance/governance.module';
import {
  INITIAL_GOVERNANCE_POLICIES,
  INITIAL_GOVERNANCE_POLICY_RECORDED_AT,
  INITIAL_GOVERNANCE_POLICY_SEED_REQUEST_ID,
} from '../governance/initial-governance-policies';
import { memoryEvidenceStorage, sha256Hex } from '../research/evidence-storage';
import { EvidenceService } from '../research/evidence.service';
import { inMemoryResearchCollections, researchStoresOver } from '../research/research-store';
import { ResearchService } from '../research/research.service';
import { inMemoryAppendOnlyCollection } from './append-only-collection';
import { ALL_COLLECTIONS, COLLECTIONS } from './collections';
import { validatorOf } from './migrate';
import {
  liftMaintenanceFence,
  resetConfirmation,
  resetIntegrationTestRun,
  restoreConfirmation,
  restorePreproductionBackup,
  stableJson,
  verifyPreproductionBackup,
  type CollectionInfo,
  type ResetDatabase,
  type ResetFiles,
  type ResetTransaction,
} from './preproduction-reset';
import { Rollback, sequentialUnitOfWork } from './unit-of-work';
import { PublicPackCache } from '../public/public-pack-cache';

/**
 * The one-time pre-production reset (M5.3.3 plan R5), adversarially, against a fake database with
 * REAL transaction staging and validator semantics. The run's documents are produced by the
 * application's own services (in memory) following the plan's run profile, so the proof is tested
 * against genuine audit chains, research chains and relationships. SYNTHETIC content only.
 */

const RUN = 'itest-20261122t120000z-ab12cd';
const KEY = new Uint8Array(randomBytes(32));
const SEED = initialRegistryFor(
  Date.parse(INITIAL_GOVERNANCE_POLICY_RECORDED_AT),
  INITIAL_GOVERNANCE_POLICIES,
  INITIAL_GOVERNANCE_POLICY_SEED_REQUEST_ID,
).records;
const SEED_DIGESTS = SEED.map((r) => r.recordDigest);

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
  notes: `SYNTHETIC ${RUN}`,
};

/** Replays the plan's run profile with the real services; returns every document written. */
async function simulateRun(): Promise<Map<string, Document[]>> {
  let now = Date.parse('2026-11-22T12:00:00.000Z');
  const clock = { now: () => (now += 100) };
  const audit = inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents);
  const collections = inMemoryResearchCollections(audit);
  const stores = researchStoresOver(collections);
  const store = { stores, durable: false, atomically: sequentialUnitOfWork(stores) };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
  const authz = new StaffAuthorizationService(clock);
  let id = 0;
  const ids = {
    next: () =>
      `0193${String(++id).padStart(4, '0')}-0000-7000-8000-${String(id).padStart(12, '0')}`,
  };
  const research = new ResearchService(
    store,
    ids,
    clock,
    authz,
    logger,
    new PublicPackCache(clock),
  );
  const evidence = new EvidenceService(store, memoryEvidenceStorage(), ids, clock, authz, logger);
  let step = 0;
  const req = () => `${RUN}:${String((step += 1))}`;
  const as = (p: string, ...roles: readonly (readonly [GovernanceRole, TestScope])[]) =>
    staffRequest(now, `${RUN}-${p}`, ...roles);
  const scholar = () => as('scholar', ['GOVERNING_SCHOLAR', ['sistani']]);
  const create = { marjaId: 'sistani', payload: SOURCE, references: [], aiInvolvement: [] };

  await research.create(scholar(), 'sources', create, req()); // A2
  const s2 = await research.create(scholar(), 'sources', create, req()); // A4
  const revise = () =>
    research.revise(
      scholar(),
      'sources',
      s2.entityId,
      { expectedRevision: 1, payload: SOURCE, references: [], aiInvolvement: [] },
      req(),
    );
  await revise();
  for (let i = 0; i < 3; i += 1) await revise().catch(() => undefined); // 2 losers + 1 stale
  await research.create(scholar(), 'sources', create, req()); // A5
  await research.create(scholar(), 'sources', create, req());
  const s5 = await research.create(scholar(), 'sources', create, req()); // A7
  const bytes = new TextEncoder().encode(`TEST synthetic evidence ${RUN}`);
  await evidence.upload(
    scholar(),
    {
      sourceId: s5.entityId,
      mediaType: 'text/plain',
      sha256: sha256Hex(bytes),
      copyright: 'EXCERPTS_ONLY',
      extent: 'EXCERPT',
      description: `TEST ${RUN}`,
      contentBase64: Buffer.from(bytes).toString('base64'),
    },
    req(),
  );
  for (const who of [
    as('outsider', ['GOVERNING_SCHOLAR', ['khamenei']]),
    as('researcher', ['RELIGIOUS_RESEARCHER', ['sistani']]),
    // Decision 64: SUPER_ADMIN may create research now, so a legacy author stands in for the
    // fourth denied attempt (the plan profile of the simulated run stays unchanged).
    as('author', ['RULE_PACK_AUTHOR', ['sistani']]),
    as('auditor', ['AUDITOR', 'ALL']),
  ]) {
    await research.create(who, 'sources', create, req()).catch(() => undefined); // A8 denied
  }
  const out = new Map<string, Document[]>();
  const all = async (c: (typeof collections)[keyof typeof collections]) => {
    const found = await c.find({}, { sort: { field: '_none', direction: 1 } });
    return found.ok ? (found.value as Document[]) : [];
  };
  out.set('auditEvents', await all(collections.audit));
  out.set('researchSources', await all(collections.sources));
  out.set('evidenceArtefacts', await all(collections.evidence));
  return out;
}

const clone = (docs: readonly Document[]): Document[] =>
  BSON.EJSON.parse(BSON.EJSON.stringify(docs, { relaxed: false }), {
    relaxed: true,
  }) as Document[];

interface Hooks {
  /** Called before each setValidator (index = call number from 0); may throw. */
  beforeSetValidator?: (index: number, name: string) => void;
  /** Throw on the n-th `find` outside transactions (0-based). */
  failFindAt?: number;
  failDeleteAt?: string;
  /** The commit fails WITHOUT applying (an uncertain outcome that did not commit). */
  failCommit?: boolean;
  /** The commit APPLIES, then the driver reports an error (uncertain outcome that committed). */
  commitThenThrow?: boolean;
  /** Drop the first document inserted into this collection (a faulty restore). */
  dropOnRestore?: string;
  /** Store options with keys in reverse order (as MongoDB may return them after collMod). */
  reorderOnSet?: boolean;
}

const OTHER_RUN = 'itest-20261122t110000z-zz99yy';
const otherFence = {
  validator: { $and: [{ $expr: { $eq: [1, 0] } }, { khumsMaintenanceFence: OTHER_RUN }] },
  validationLevel: 'strict',
  validationAction: 'error',
};
const isFenced = (options: Document | undefined) =>
  JSON.stringify(options?.validator ?? {}).includes('khumsMaintenanceFence');

/** A fake database: real transaction staging, validators that reject writes when fenced. */
class FakeDatabase implements ResetDatabase {
  data = new Map<string, Document[]>();
  options = new Map<string, Document>();
  hooks: Hooks = {};
  validatorCalls = 0;
  findCalls = 0;

  constructor(run: Map<string, Document[]>) {
    for (const spec of ALL_COLLECTIONS) {
      this.data.set(spec.name, []);
      this.options.set(spec.name, {
        validator: validatorOf(spec),
        validationLevel: 'strict',
        validationAction: 'error',
      });
    }
    this.data.set(
      'governancePolicyRegistry',
      SEED.map((r) => ({ _id: new ObjectId(), ...r })),
    );
    for (const [name, docs] of run)
      this.data.set(
        name,
        docs.map((d) => ({ _id: new ObjectId(), ...d })),
      );
  }

  listCollections(): Promise<CollectionInfo[]> {
    return Promise.resolve(
      [...this.options].map(([name, options]) => ({ name, options: structuredClone(options) })),
    );
  }
  indexes(name: string): Promise<Document[]> {
    const spec = ALL_COLLECTIONS.find((s) => s.name === name);
    return Promise.resolve([
      { v: 2, key: { _id: 1 }, name: '_id_' },
      ...(spec?.indexes ?? []).map((i) => ({ ...i })),
    ]);
  }
  find(name: string): Promise<Document[]> {
    if (this.findCalls++ === this.hooks.failFindAt) return Promise.reject(new Error('read failed'));
    return Promise.resolve(clone(this.data.get(name) ?? []));
  }
  setValidator(name: string, options: Document): Promise<void> {
    try {
      this.hooks.beforeSetValidator?.(this.validatorCalls++, name);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error('collMod failed'));
    }
    const stored = this.hooks.reorderOnSet
      ? Object.fromEntries(Object.entries(options).reverse())
      : structuredClone(options);
    this.options.set(name, stored);
    return Promise.resolve();
  }
  /** An application write: rejected while the collection is fenced. */
  appWrite(name: string, doc: Document): void {
    if (isFenced(this.options.get(name))) throw new Error('Document failed validation');
    this.data.get(name)?.push({ _id: new ObjectId(), ...doc });
  }
  async transaction<T>(work: (tx: ResetTransaction) => Promise<T>): Promise<T> {
    const staged = new Map([...this.data].map(([n, d]) => [n, clone(d)]));
    const tx: ResetTransaction = {
      find: (name) => Promise.resolve(clone(staged.get(name) ?? [])),
      deleteByIds: (name, ids) => {
        if (this.hooks.failDeleteAt === name) return Promise.reject(new Error('simulated abort'));
        const wanted = new Set(ids.map(String));
        const before = staged.get(name) ?? [];
        staged.set(
          name,
          before.filter((d) => !wanted.has(String(d._id))),
        );
        return Promise.resolve(before.length - (staged.get(name) ?? []).length);
      },
      insertMany: (name, docs, bypassValidation = false) => {
        if (!bypassValidation && isFenced(this.options.get(name))) {
          return Promise.reject(new Error('Document failed validation'));
        }
        const kept = this.hooks.dropOnRestore === name ? docs.slice(1) : docs;
        staged.set(name, [...(staged.get(name) ?? []), ...clone(kept)]);
        return Promise.resolve(docs.length);
      },
    };
    try {
      const result = await work(tx);
      if (this.hooks.failCommit) throw new Error('commit outcome unknown');
      this.data = staged; // commit
      if (this.hooks.commitThenThrow) throw new Error('commit outcome unknown');
      return result;
    } catch (error) {
      if (error instanceof Rollback) return error.value as T;
      throw error;
    }
  }
}

let RUN_DOCS: Map<string, Document[]>;
beforeEach(async () => {
  RUN_DOCS = await simulateRun();
});
const dirs: string[] = [];
async function filesFor(): Promise<ResetFiles> {
  const dir = await mkdtemp(join(tmpdir(), 'khums-reset-'));
  dirs.push(dir);
  return {
    backupFile: join(dir, 'khums-reset.backup'),
    manifestFile: join(dir, 'khums-reset.fence.json'),
  };
}
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

const reset = async (db: FakeDatabase, files?: ResetFiles) =>
  resetIntegrationTestRun({
    db,
    runId: RUN,
    confirmation: resetConfirmation(RUN),
    files: files ?? (await filesFor()),
    backupKey: KEY,
    seedRecordDigests: SEED_DIGESTS,
    now: () => Date.parse('2026-11-22T13:00:00.000Z'),
  });
const lift = (db: FakeDatabase, files: ResetFiles, runId = RUN) =>
  liftMaintenanceFence({ db, manifestFile: files.manifestFile, runId });
const restore = (db: FakeDatabase, files: ResetFiles, confirmation = restoreConfirmation(RUN)) =>
  restorePreproductionBackup({ db, files, backupKey: KEY, runId: RUN, confirmation });
const snapshot = (db: FakeDatabase) => BSON.EJSON.stringify([...db.data], { relaxed: false });
const structure = (db: FakeDatabase) => stableJson([...db.options]);
const exists = async (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );
/** Every `find` the reset makes: one read per collection before the fence, behind it, after commit. */
const N = ALL_COLLECTIONS.length;
const FIRST_READ_BEHIND_FENCE = N;
const FIRST_READ_AFTER_COMMIT = 2 * N;

/** A committed reset whose post-commit check failed: the fence stays, data deleted. */
async function committedButFenced(db: FakeDatabase, files: ResetFiles) {
  db.hooks.failFindAt = FIRST_READ_AFTER_COMMIT;
  const result = await reset(db, files);
  expect(result).toMatchObject({
    ok: false,
    refusal: 'OPERATION_FAILED',
    fence: 'ACTIVE',
    deleted: 'YES',
  });
  db.hooks = {};
}

describe('the simulated run matches the plan profile', () => {
  it('has 14 audit events, 6 research records and 1 evidence artefact', () => {
    expect(RUN_DOCS.get('auditEvents')).toHaveLength(14);
    expect(RUN_DOCS.get('researchSources')).toHaveLength(6);
    expect(RUN_DOCS.get('evidenceArtefacts')).toHaveLength(1);
  });
});

describe('successful reset', () => {
  it('writes the recovery manifest first, removes exactly the run, restores the exact validators', async () => {
    const db = new FakeDatabase(RUN_DOCS);
    const before = structure(db);
    const policies = BSON.EJSON.stringify(db.data.get('governancePolicyRegistry'), {
      relaxed: false,
    });
    const files = await filesFor();
    expect(await reset(db, files)).toMatchObject({
      ok: true,
      report: {
        removed: {
          auditEvents: 14,
          researchSources: 6,
          sourcePassages: 0,
          passageTranslations: 0,
          evidenceArtefacts: 1,
        },
        retained: { governancePolicyRegistry: 2, auditEvents: 0 },
      },
    });
    for (const name of ['auditEvents', 'researchSources', 'evidenceArtefacts'])
      expect(db.data.get(name)).toEqual([]);
    expect(BSON.EJSON.stringify(db.data.get('governancePolicyRegistry'), { relaxed: false })).toBe(
      policies,
    );
    expect(structure(db)).toBe(before);
    // The manifest: owner-only, every collection's original validator, a checksum, no secrets.
    expect((await stat(files.manifestFile)).mode & 0o777).toBe(0o600);
    const manifest = JSON.parse(await readFile(files.manifestFile, 'utf8')) as {
      runId: string;
      validators: Record<string, string>;
    };
    expect(manifest.runId).toBe(RUN);
    expect(Object.keys(manifest.validators)).toHaveLength(N);
    expect(await readFile(files.manifestFile, 'utf8')).not.toContain(
      Buffer.from(KEY).toString('base64'),
    );
    // The backup: encrypted, owner-only, no plaintext and no key.
    expect((await stat(files.backupFile)).mode & 0o777).toBe(0o600);
    const sealed = await readFile(files.backupFile);
    expect(sealed.includes(Buffer.from('TEST synthetic'))).toBe(false);
    expect(sealed.includes(Buffer.from(KEY))).toBe(false);
  });

  it('rejects application writes while fenced (fail closed)', async () => {
    const db = new FakeDatabase(RUN_DOCS);
    const attempts: string[] = [];
    db.hooks.beforeSetValidator = (index) => {
      if (index !== N) return; // every collection is fenced
      try {
        db.appWrite('auditEvents', { type: 'staff.login.failed' });
        attempts.push('accepted');
      } catch {
        attempts.push('rejected');
      }
    };
    expect((await reset(db)).ok).toBe(true);
    expect(attempts).toEqual(['rejected']);
  });

  it('does not treat reordered option keys as a change', async () => {
    const db = new FakeDatabase(RUN_DOCS);
    db.hooks.reorderOnSet = true;
    expect(await reset(db)).toMatchObject({ ok: true });
  });
});

describe('refusals before anything changes', () => {
  const cases: [string, (run: Map<string, Document[]>) => void, string][] = [
    [
      'an audit event was altered',
      (r) => {
        const e = r.get('auditEvents')?.[3];
        if (e) e.occurredAt = '2000-01-01T00:00:00.000Z';
      },
      'AUDIT_CHAIN_INVALID',
    ],
    [
      'an audit event is missing in the middle',
      (r) => {
        r.get('auditEvents')?.splice(5, 1);
      },
      'AUDIT_CHAIN_INVALID',
    ],
    [
      'the chain is incomplete',
      (r) => {
        r.get('auditEvents')?.pop();
      },
      'RUN_PROFILE_MISMATCH',
    ],
    [
      'a research record is missing',
      (r) => {
        r.get('researchSources')?.pop();
      },
      'RUN_PROFILE_MISMATCH',
    ],
    [
      'an unmarked research record exists',
      (r) => {
        const d = r.get('researchSources')?.[0];
        if (d)
          r.get('researchSources')?.push({
            ...d,
            recordJson: String(d.recordJson).replace(`${RUN}:`, 'real-request:'),
          });
      },
      'UNMARKED_RECORD',
    ],
  ];
  for (const [label, mutate, refusal] of cases) {
    it(`refuses when ${label}`, async () => {
      const run = new Map([...RUN_DOCS].map(([n, d]) => [n, clone(d)]));
      mutate(run);
      const db = new FakeDatabase(run);
      const before = snapshot(db);
      const files = await filesFor();
      expect(await reset(db, files)).toMatchObject({
        ok: false,
        refusal,
        fence: 'NONE',
        deleted: 'NO',
      });
      expect(snapshot(db)).toBe(before);
      expect(await exists(files.manifestFile)).toBe(false);
      expect(await exists(files.backupFile)).toBe(false);
    });
  }

  it('refuses with a checkpoint, a staff account or a changed policy registry', async () => {
    for (const [name, doc, refusal] of [
      ['auditCheckpoints', { checkpointId: 'c' }, 'NOT_PRE_PRODUCTION'],
      ['staffAccounts', { principalId: 'p' }, 'NOT_PRE_PRODUCTION'],
      ['governancePolicyRegistry', { recordDigest: 'x' }, 'POLICY_REGISTRY_CHANGED'],
    ] as const) {
      const db = new FakeDatabase(RUN_DOCS);
      db.data.get(name)?.push({ _id: new ObjectId(), ...doc });
      expect(await reset(db), name).toMatchObject({ ok: false, refusal });
    }
  });

  it("refuses when another run's fence exists, and never treats it as an original validator", async () => {
    const db = new FakeDatabase(RUN_DOCS);
    db.options.set('staffAccounts', structuredClone(otherFence));
    const before = structure(db);
    const files = await filesFor();
    expect(await reset(db, files)).toMatchObject({
      ok: false,
      refusal: 'FENCE_ALREADY_ACTIVE',
      detail: 'staffAccounts',
    });
    expect(structure(db)).toBe(before);
    expect(await exists(files.manifestFile)).toBe(false);
  });
});

describe('partial fencing and recovery before any backup exists', () => {
  it('recovers the exact original validators after a crash at every fencing step', async () => {
    for (let fencedBeforeCrash = 1; fencedBeforeCrash < N; fencedBeforeCrash += 1) {
      const db = new FakeDatabase(RUN_DOCS);
      const original = structure(db);
      const data = snapshot(db);
      // The database becomes unreachable after k collMods: no automatic cleanup is possible.
      db.hooks.beforeSetValidator = (index) => {
        if (index >= fencedBeforeCrash) throw new Error('connection lost');
      };
      const files = await filesFor();
      expect(await reset(db, files)).toMatchObject({
        ok: false,
        refusal: 'FENCE_FAILED',
        fence: 'PARTIAL',
        deleted: 'NO',
      });
      expect(await exists(files.backupFile)).toBe(false);
      db.hooks = {};
      const recovered = await lift(db, files);
      expect(recovered.ok && recovered.lifted).toHaveLength(fencedBeforeCrash);
      expect(structure(db)).toBe(original);
      expect(snapshot(db)).toBe(data);
    }
  });

  it("lift refuses another run's fence and a tampered or wrong-run manifest", async () => {
    const db = new FakeDatabase(RUN_DOCS);
    db.hooks.beforeSetValidator = (index) => {
      if (index >= 3) throw new Error('connection lost');
    };
    const files = await filesFor();
    await reset(db, files);
    db.hooks = {};
    const partial = structure(db);
    const staffOriginal = structuredClone(db.options.get('staffAccounts'));
    db.options.set('staffAccounts', structuredClone(otherFence));
    expect(await lift(db, files)).toMatchObject({
      ok: false,
      error: 'OTHER_FENCE_OR_CHANGED',
      detail: 'staffAccounts',
    });
    db.options.set('staffAccounts', staffOriginal ?? {});
    expect(await lift(db, files, 'itest-20261122t120000z-other1')).toMatchObject({
      ok: false,
      error: 'MANIFEST_INVALID',
    });
    const text = await readFile(files.manifestFile, 'utf8');
    await rm(files.manifestFile);
    await writeFile(files.manifestFile, text.replace('strict', 'moderate'));
    expect(await lift(db, files)).toMatchObject({ ok: false, error: 'MANIFEST_INVALID' });
    expect(structure(db)).toBe(partial);
  });
});

describe('failures after the fence: reported, never silently fenced', () => {
  it('a read failure behind the fence lifts the fence (nothing deleted)', async () => {
    const db = new FakeDatabase(RUN_DOCS);
    const before = structure(db);
    db.hooks.failFindAt = FIRST_READ_BEHIND_FENCE;
    expect(await reset(db)).toMatchObject({
      ok: false,
      refusal: 'OPERATION_FAILED',
      fence: 'NONE',
      deleted: 'NO',
    });
    expect(structure(db)).toBe(before);
    expect(db.data.get('auditEvents')).toHaveLength(14);
  });

  it('if that lift also fails, the result says the fence is active and how to lift it', async () => {
    const db = new FakeDatabase(RUN_DOCS);
    db.hooks.failFindAt = FIRST_READ_BEHIND_FENCE;
    db.hooks.beforeSetValidator = (index) => {
      if (index >= N) throw new Error('connection lost');
    };
    const result = await reset(db);
    expect(result).toMatchObject({ ok: false, fence: 'ACTIVE', deleted: 'NO' });
    expect(!result.ok && result.next).toContain('--lift-maintenance-fence');
  });

  it('an existing backup file is never overwritten, and the fence is lifted', async () => {
    const db = new FakeDatabase(RUN_DOCS);
    const files = await filesFor();
    await writeFile(files.backupFile, 'an older file is never overwritten');
    expect(await reset(db, files)).toMatchObject({
      ok: false,
      refusal: 'BACKUP_FAILED',
      fence: 'NONE',
      deleted: 'NO',
    });
    expect(await readFile(files.backupFile, 'utf8')).toBe('an older file is never overwritten');
  });

  for (const stage of [
    'auditEvents',
    'researchSources',
    'sourcePassages',
    'passageTranslations',
    'evidenceArtefacts',
  ]) {
    it(`a failure inside the transaction while deleting ${stage} aborts it: nothing deleted, fence lifted`, async () => {
      const db = new FakeDatabase(RUN_DOCS);
      db.hooks.failDeleteAt = stage;
      const before = snapshot(db);
      expect(await reset(db)).toMatchObject({
        ok: false,
        refusal: 'TRANSACTION_ABORTED',
        fence: 'NONE',
        deleted: 'NO',
      });
      expect(snapshot(db)).toBe(before);
    });
  }

  it('a failure after commit keeps the fence and names the restore', async () => {
    const db = new FakeDatabase(RUN_DOCS);
    db.hooks.failFindAt = FIRST_READ_AFTER_COMMIT;
    const result = await reset(db);
    expect(result).toMatchObject({
      ok: false,
      refusal: 'OPERATION_FAILED',
      fence: 'ACTIVE',
      deleted: 'YES',
    });
    expect(!result.ok && result.next).toContain('--restore-preproduction-backup');
  });

  it('a lift failure after commit keeps the fence; lifting later restores the exact validators', async () => {
    const db = new FakeDatabase(RUN_DOCS);
    const original = structure(db);
    db.hooks.beforeSetValidator = (index) => {
      if (index >= N) throw new Error('connection lost');
    };
    const files = await filesFor();
    expect(await reset(db, files)).toMatchObject({
      ok: false,
      refusal: 'FENCE_LIFT_FAILED',
      fence: 'ACTIVE',
      deleted: 'YES',
    });
    expect(() => {
      db.appWrite('auditEvents', { type: 'x' });
    }).toThrow();
    db.hooks = {};
    expect(await lift(db, files)).toMatchObject({ ok: true });
    expect(structure(db)).toBe(original);
  });
});

describe('uncertain transaction outcomes', () => {
  it('an uncertain commit with unchanged data keeps the fence and reports UNKNOWN', async () => {
    const db = new FakeDatabase(RUN_DOCS);
    db.hooks.failCommit = true;
    const before = snapshot(db);
    const files = await filesFor();
    const result = await reset(db, files);
    expect(result).toMatchObject({
      ok: false,
      refusal: 'TRANSACTION_UNCERTAIN',
      fence: 'ACTIVE',
      deleted: 'UNKNOWN',
    });
    expect(!result.ok && result.next).toContain('Outcome unknown');
    expect(snapshot(db)).toBe(before);
    db.hooks = {};
    expect(await lift(db, files)).toMatchObject({ ok: true });
  });

  it('an uncertain commit that did commit is verified from the data and completes', async () => {
    const db = new FakeDatabase(RUN_DOCS);
    db.hooks.commitThenThrow = true;
    expect(await reset(db)).toMatchObject({ ok: true, report: { removed: { auditEvents: 14 } } });
    expect(db.data.get('auditEvents')).toEqual([]);
  });
});

describe('restore while fenced', () => {
  it('restores the exact records and validators, verified, then lifts the fence', async () => {
    const db = new FakeDatabase(RUN_DOCS);
    const original = snapshot(db);
    const originalStructure = structure(db);
    const files = await filesFor();
    await committedButFenced(db, files);
    expect(await restore(db, files, 'yes')).toMatchObject({
      ok: false,
      error: 'CONFIRMATION_REQUIRED',
    });
    expect(await restore(db, files)).toMatchObject({
      ok: true,
      inserted: {
        auditEvents: 14,
        researchSources: 6,
        evidenceArtefacts: 1,
        governancePolicyRegistry: 0,
      },
    });
    expect(snapshot(db)).toBe(original);
    expect(structure(db)).toBe(originalStructure);
  });

  it('a failed verification keeps the fence and explains the next step', async () => {
    const db = new FakeDatabase(RUN_DOCS);
    const files = await filesFor();
    await committedButFenced(db, files);
    db.hooks.dropOnRestore = 'auditEvents';
    const result = await restore(db, files);
    expect(result).toMatchObject({ ok: false, error: 'VERIFICATION_FAILED', fence: 'ACTIVE' });
    expect(!result.ok && result.next).toContain('Fence kept');
  });

  it('refuses without the fence, with changed data, or with a tampered manifest', async () => {
    const done = new FakeDatabase(RUN_DOCS);
    const doneFiles = await filesFor();
    await reset(done, doneFiles);
    expect(await restore(done, doneFiles)).toMatchObject({ ok: false, error: 'FENCE_NOT_ACTIVE' });

    const db = new FakeDatabase(RUN_DOCS);
    const files = await filesFor();
    await committedButFenced(db, files);
    db.data.get('staffAccounts')?.push({ _id: new ObjectId(), principalId: 'p' });
    expect(await restore(db, files)).toMatchObject({
      ok: false,
      error: 'TARGET_NOT_EMPTY_OR_CHANGED',
      fence: 'ACTIVE',
    });
    db.data.set('staffAccounts', []);
    const text = await readFile(files.manifestFile, 'utf8');
    await rm(files.manifestFile);
    await writeFile(files.manifestFile, text.replace(RUN, OTHER_RUN));
    expect(await restore(db, files)).toMatchObject({
      ok: false,
      error: 'MANIFEST_INVALID',
      fence: 'ACTIVE',
    });
  });
});

describe('backup verification', () => {
  it('detects tampering, a wrong key and the wrong run', async () => {
    const db = new FakeDatabase(RUN_DOCS);
    const files = await filesFor();
    await reset(db, files);
    expect(
      await verifyPreproductionBackup(files.backupFile, new Uint8Array(randomBytes(32)), RUN),
    ).toEqual({ ok: false, error: 'DECRYPTION_FAILED' });
    expect(await verifyPreproductionBackup(files.backupFile, KEY, OTHER_RUN)).toEqual({
      ok: false,
      error: 'DECRYPTION_FAILED',
    });
    const bytes = await readFile(files.backupFile);
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
    const tampered = `${files.backupFile}.tampered`;
    await writeFile(tampered, bytes);
    expect(await verifyPreproductionBackup(tampered, KEY, RUN)).toEqual({
      ok: false,
      error: 'DECRYPTION_FAILED',
    });
  });
});
