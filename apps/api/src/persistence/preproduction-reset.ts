import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { link, open, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { BSON, type ClientSession, type Db, type Document, type MongoClient } from 'mongodb';

import { replayResearchChain, verifyAuditChain } from '@khums/core';
import type { ResearchRevisionRecord } from '@khums/shared-types';

import { openBytes, sealBytes, sealedKeyId } from '../research/evidence-storage';
import { ALL_COLLECTIONS } from './collections';
import { mongoUnitOfWork, Rollback } from './unit-of-work';

/**
 * ONE-TIME pre-production reset of an integration-test run (M5.3.3; ATLAS_INTEGRATION_TEST_PLAN
 * R5 §1.3). Operator command only: no API endpoint, no general deletion path.
 *
 *   1. read-only proof: no maintenance fence of ANY run exists; the database is pre-production
 *      and holds EXACTLY the expected run (production `verifyAuditChain`, run profile, markers,
 *      replayed research chains, relationships);
 *   2. a small owner-only RECOVERY MANIFEST of the original validators is written atomically
 *      BEFORE the first `collMod`, so validators can always be restored (`liftMaintenanceFence`);
 *   3. the maintenance fence: every application collection rejects inserts and updates;
 *   4. the proof again behind the fence; the data must be byte-identical to step 1;
 *   5. encrypted backup (AES-256-GCM, operator key), re-read and verified;
 *   6. one MongoDB transaction deleting the run's documents by exact `_id`;
 *   7. verification after commit; 8. lift the fence from the manifest; verify the validators.
 * After step 3 every failure goes through one handler: the fence is lifted automatically only
 * when no deletion can have happened; otherwise it stays (writes keep failing) and the result
 * names the observed state and the next operator command. Never silently fenced.
 */

/** Collections a test run writes and this reset empties. */
export const RESET_COLLECTIONS = [
  'auditEvents',
  'researchSources',
  'sourcePassages',
  'passageTranslations',
  'evidenceArtefacts',
] as const;

/** Collections that must be empty (no real use has started). */
export const MUST_BE_EMPTY = [
  'auditCheckpoints',
  'governanceLedgerRecords',
  'rulePackContents',
  'staffRoleAssignments',
  'administrativeControl',
  'staffAccounts',
  'staffSessions',
  'staffLoginThrottles',
  'researchFindings',
  'religiousRulings',
] as const;

/** Exactly what one approved integration run (plan §4.3) leaves behind. */
export const ITEST_RUN_PROFILE = {
  counts: {
    auditEvents: 14,
    researchSources: 6,
    sourcePassages: 0,
    passageTranslations: 0,
    evidenceArtefacts: 1,
  },
  researchEntities: 5,
  auditTypes: {
    'research.record.appended': 6,
    'research.evidence.attached': 1,
    'research.action.refused': 3,
    'research.action.denied': 4,
  },
} as const;

const RUN_ID = /^itest-\d{8}t\d{6}z-[a-z0-9]{6}$/;
const FENCE_MARKER = 'khumsMaintenanceFence';
const MANIFEST_FORMAT = 'khums-fence-manifest/v1';

export const resetConfirmation = (runId: string) => `RESET ${runId}`;
export const restoreConfirmation = (runId: string) => `RESTORE ${runId}`;
const backupAad = (runId: string) => `khums-preproduction-backup:v2:${runId}`;

// ---- Database port (MongoDB adapter below; tests use a fake with real staging) ----

export interface CollectionInfo {
  readonly name: string;
  readonly options: Document;
}

export interface ResetTransaction {
  find(name: string): Promise<Document[]>;
  deleteByIds(name: string, ids: readonly unknown[]): Promise<number>;
  /** `bypassValidation` only for the controlled restore under this run's fence. */
  insertMany(name: string, docs: readonly Document[], bypassValidation?: boolean): Promise<number>;
}

export interface ResetDatabase {
  listCollections(): Promise<CollectionInfo[]>;
  indexes(name: string): Promise<Document[]>;
  find(name: string): Promise<Document[]>;
  /** `collMod` (not transactional; DDL). */
  setValidator(name: string, options: Document): Promise<void>;
  /** One multi-document transaction; `Rollback(value)` aborts and returns `value`. */
  transaction<T>(work: (tx: ResetTransaction) => Promise<T>): Promise<T>;
}

const sorted = (docs: Document[]) =>
  docs.sort((a, b) => String(a._id).localeCompare(String(b._id)));

export function mongoResetDatabase(db: Db, client: MongoClient): ResetDatabase {
  const findAll = async (name: string, session?: ClientSession) =>
    sorted(
      await db
        .collection(name)
        .find({}, session === undefined ? {} : { session })
        .toArray(),
    );
  return {
    listCollections: async () =>
      (await db.listCollections({}, { nameOnly: false }).toArray()).map((c) => ({
        name: c.name,
        options: (c as { options?: Document }).options ?? {},
      })),
    indexes: (name) => db.collection(name).listIndexes().toArray(),
    find: (name) => findAll(name),
    setValidator: async (name, options) => {
      await db.command({ collMod: name, ...options });
    },
    transaction: (work) =>
      mongoUnitOfWork(client, (session) => ({
        find: (name: string) => findAll(name, session),
        deleteByIds: async (name: string, ids: readonly unknown[]) =>
          ids.length === 0
            ? 0
            : (
                await db
                  .collection(name)
                  .deleteMany({ _id: { $in: [...ids] } } as Document, { session })
              ).deletedCount,
        insertMany: async (name: string, docs: readonly Document[], bypassValidation = false) =>
          docs.length === 0
            ? 0
            : (
                await db
                  .collection(name)
                  .insertMany([...docs], { session, bypassDocumentValidation: bypassValidation })
              ).insertedCount,
      }))(work),
  };
}

// ---- Snapshots, structure and the fence ----

type Snapshot = ReadonlyMap<string, Document[]>;
const APP = ALL_COLLECTIONS.map((s) => s.name);
const ejson = (docs: readonly Document[]) => BSON.EJSON.stringify(docs, { relaxed: false });
const sha = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');
const snapshotDigest = (s: Snapshot) =>
  sha(APP.map((n) => `${n}:${ejson(s.get(n) ?? [])}`).join('\n'));

async function snapshotOf(read: (name: string) => Promise<Document[]>): Promise<Snapshot> {
  const out = new Map<string, Document[]>();
  for (const name of APP) out.set(name, sorted(await read(name)));
  return out;
}

/**
 * JSON with object keys sorted (arrays keep their order): MongoDB may return collection options
 * with keys in a different order after `collMod`, which must not count as a change.
 */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

type Structure = Record<string, { options: string; indexes: string[] }>;

const validatorOptions = (options: Document): Document => ({
  validator: (options.validator as Document | undefined) ?? {},
  validationLevel: (options.validationLevel as string | undefined) ?? 'strict',
  validationAction: (options.validationAction as string | undefined) ?? 'error',
});

/** Validator options and indexes of every application collection. */
async function structureOf(db: ResetDatabase): Promise<Structure> {
  const byName = new Map((await db.listCollections()).map((c) => [c.name, c.options]));
  const out: Structure = {};
  for (const name of APP) {
    const indexes = (await db.indexes(name)).map((i) => JSON.stringify(i)).sort();
    out[name] = { options: stableJson(validatorOptions(byName.get(name) ?? {})), indexes };
  }
  return out;
}

/** Rejects every insert and update; deletes are not validated. Names the run. */
const fenceValidator = (runId: string): Document => ({
  validator: { $and: [{ $expr: { $eq: [1, 0] } }, { [FENCE_MARKER]: runId }] },
  validationLevel: 'strict',
  validationAction: 'error',
});
const isFencedBy = (options: Document, runId: string) =>
  stableJson(validatorOptions(options)) === stableJson(fenceValidator(runId));
/** Any maintenance fence, whatever its run id. */
const hasAnyFence = (options: Document) =>
  JSON.stringify(options.validator ?? {}).includes(FENCE_MARKER);

export type FenceState = 'NONE' | 'ACTIVE' | 'PARTIAL' | 'UNKNOWN';

/** How many application collections carry this run's fence (UNKNOWN if unreadable). */
async function fenceStateOf(db: ResetDatabase, runId: string): Promise<FenceState> {
  try {
    const options = new Map((await db.listCollections()).map((c) => [c.name, c.options]));
    const fenced = APP.filter((n) => isFencedBy(options.get(n) ?? {}, runId)).length;
    if (fenced === 0) return 'NONE';
    return fenced === APP.length ? 'ACTIVE' : 'PARTIAL';
  } catch {
    return 'UNKNOWN';
  }
}

// ---- Recovery manifest (original validators, written before the first collMod) ----

interface FenceManifest {
  readonly format: typeof MANIFEST_FORMAT;
  readonly runId: string;
  readonly createdAt: string;
  /** Collection name → stableJson of { validator, validationLevel, validationAction }. */
  readonly validators: Record<string, string>;
  /** SHA-256 of the fields above (detects corruption and editing mistakes). */
  readonly sha256: string;
}

const manifestDigest = (m: Omit<FenceManifest, 'sha256'>) =>
  sha(
    stableJson({
      format: m.format,
      runId: m.runId,
      createdAt: m.createdAt,
      validators: m.validators,
    }),
  );

/** Creates `path` atomically, owner-only (0600), never overwriting an existing file. */
async function writeNewFileAtomically(path: string, bytes: Uint8Array): Promise<void> {
  const temporary = join(dirname(path), `.tmp-${randomBytes(8).toString('hex')}`);
  const handle = await open(
    temporary,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, path); // EEXIST: an existing file is never replaced
  } finally {
    await unlink(temporary);
  }
}

/** Reads and checks the manifest of `runId`; null when missing, edited, incomplete or another run's. */
async function readManifest(file: string, runId: string): Promise<FenceManifest | null> {
  try {
    const manifest = JSON.parse(await readFile(file, 'utf8')) as Partial<FenceManifest> & {
      validators?: Record<string, unknown>;
    };
    const complete = APP.every((n) => typeof manifest.validators?.[n] === 'string');
    return manifest.format === MANIFEST_FORMAT &&
      manifest.runId === runId &&
      complete &&
      manifestDigest(manifest as FenceManifest) === manifest.sha256
      ? (manifest as FenceManifest)
      : null;
  } catch {
    return null;
  }
}

export type LiftResult =
  | { readonly ok: true; readonly lifted: readonly string[] }
  | {
      readonly ok: false;
      readonly error:
        'MANIFEST_INVALID' | 'OTHER_FENCE_OR_CHANGED' | 'UNAVAILABLE' | 'VERIFICATION_FAILED';
      readonly detail: string | null;
    };

/**
 * Restores the original validators from the run's recovery manifest on every collection that
 * carries this run's fence; then verifies every collection equals its original. Refuses, changing
 * nothing, when the manifest does not check out, or a collection carries another run's fence or a
 * validator that is neither this run's fence nor its original.
 */
export async function liftMaintenanceFence(deps: {
  readonly db: ResetDatabase;
  readonly manifestFile: string;
  readonly runId: string;
}): Promise<LiftResult> {
  const manifest = await readManifest(deps.manifestFile, deps.runId);
  if (manifest === null) return { ok: false, error: 'MANIFEST_INVALID', detail: null };
  try {
    const options = new Map((await deps.db.listCollections()).map((c) => [c.name, c.options]));
    const toLift: string[] = [];
    for (const name of APP) {
      const current = options.get(name) ?? {};
      if (isFencedBy(current, deps.runId)) toLift.push(name);
      else if (stableJson(validatorOptions(current)) !== manifest.validators[name]) {
        return { ok: false, error: 'OTHER_FENCE_OR_CHANGED', detail: name };
      }
    }
    for (const name of toLift) {
      await deps.db.setValidator(name, JSON.parse(manifest.validators[name] ?? '{}') as Document);
    }
    const after = new Map((await deps.db.listCollections()).map((c) => [c.name, c.options]));
    const wrong = APP.find(
      (n) => stableJson(validatorOptions(after.get(n) ?? {})) !== manifest.validators[n],
    );
    if (wrong !== undefined) return { ok: false, error: 'VERIFICATION_FAILED', detail: wrong };
    return { ok: true, lifted: toLift };
  } catch {
    return { ok: false, error: 'UNAVAILABLE', detail: null };
  }
}

// ---- Proof ----

export type ResetRefusal =
  | 'CONFIRMATION_REQUIRED'
  | 'RUN_ID_INVALID'
  | 'BACKUP_KEY_INVALID'
  | 'COLLECTION_MISSING'
  | 'NOT_PRE_PRODUCTION'
  | 'AUDIT_CHAIN_INVALID'
  | 'UNMARKED_RECORD'
  | 'RUN_PROFILE_MISMATCH'
  | 'POLICY_REGISTRY_CHANGED'
  /** A maintenance fence of ANY run exists: recover that run first. */
  | 'FENCE_ALREADY_ACTIVE'
  | 'MANIFEST_FAILED'
  | 'FENCE_FAILED'
  | 'CONCURRENT_CHANGE'
  | 'BACKUP_FAILED'
  /** The transaction was aborted and the data was verified unchanged. */
  | 'TRANSACTION_ABORTED'
  /** The transaction may or may not have committed: fence kept; follow `next`. */
  | 'TRANSACTION_UNCERTAIN'
  | 'VERIFICATION_FAILED'
  | 'FENCE_LIFT_FAILED'
  | 'OPERATION_FAILED';

const marked = (requestId: unknown, runId: string) =>
  typeof requestId === 'string' && requestId.startsWith(`${runId}:`);
const withoutId = (doc: Document): Document => {
  const { _id: _ignored, ...rest } = doc;
  return rest;
};
const targetsOf = (event: Document) =>
  (event.targets as { kind: string; id: string }[] | undefined) ?? [];

/** The read-only proof (before the fence, behind it, and inside the transaction). */
export function proveResettable(
  present: ReadonlySet<string>,
  snapshot: Snapshot,
  runId: string,
  seedRecordDigests: readonly string[],
): { refusal: ResetRefusal; detail: string } | null {
  const missing = APP.filter((n) => !present.has(n));
  if (missing.length > 0) return { refusal: 'COLLECTION_MISSING', detail: missing.join(',') };
  const docs = (name: string) => snapshot.get(name) ?? [];
  for (const name of MUST_BE_EMPTY) {
    if (docs(name).length > 0) return { refusal: 'NOT_PRE_PRODUCTION', detail: name };
  }
  const registry = docs('governancePolicyRegistry').map((d) => String(d.recordDigest));
  if (
    registry.length !== seedRecordDigests.length ||
    !seedRecordDigests.every((digest) => registry.includes(digest))
  ) {
    return { refusal: 'POLICY_REGISTRY_CHANGED', detail: 'governancePolicyRegistry' };
  }
  const audit = [...docs('auditEvents')].sort((a, b) => Number(a.sequence) - Number(b.sequence));
  const chain = verifyAuditChain(audit.map(withoutId));
  if (!chain.ok) return { refusal: 'AUDIT_CHAIN_INVALID', detail: chain.error.code };
  const sequences = audit.map((e) => e.sequence as unknown);
  if (sequences.some((s, i) => s !== i) || new Set(sequences).size !== sequences.length) {
    return { refusal: 'AUDIT_CHAIN_INVALID', detail: 'sequences' };
  }
  for (const name of RESET_COLLECTIONS) {
    for (const doc of docs(name)) {
      let requestId: unknown = doc.requestId;
      if (name !== 'auditEvents' && name !== 'evidenceArtefacts') {
        try {
          requestId = (JSON.parse(String(doc.recordJson)) as { requestId?: unknown }).requestId;
        } catch {
          requestId = null;
        }
      }
      if (!marked(requestId, runId)) return { refusal: 'UNMARKED_RECORD', detail: name };
    }
  }
  for (const [name, count] of Object.entries(ITEST_RUN_PROFILE.counts)) {
    if (docs(name).length !== count) {
      return { refusal: 'RUN_PROFILE_MISMATCH', detail: `${name}=${String(docs(name).length)}` };
    }
  }
  const types = new Map<string, number>();
  for (const event of audit) {
    types.set(String(event.type), (types.get(String(event.type)) ?? 0) + 1);
  }
  const expectedTypes = Object.entries(ITEST_RUN_PROFILE.auditTypes);
  if (
    types.size !== expectedTypes.length ||
    !expectedTypes.every(([type, count]) => types.get(type) === count)
  ) {
    return { refusal: 'RUN_PROFILE_MISMATCH', detail: 'audit event types' };
  }
  const records = docs('researchSources').map(
    (d) => JSON.parse(String(d.recordJson)) as ResearchRevisionRecord,
  );
  const entities = new Map<string, ResearchRevisionRecord[]>();
  for (const r of records) entities.set(r.entityId, [...(entities.get(r.entityId) ?? []), r]);
  if (entities.size !== ITEST_RUN_PROFILE.researchEntities) {
    return { refusal: 'RUN_PROFILE_MISMATCH', detail: `researchEntities=${String(entities.size)}` };
  }
  for (const [entityId, revisions] of entities) {
    const chainRecords = [...revisions].sort((a, b) => a.revision - b.revision);
    if (!replayResearchChain({ entityType: 'SOURCE', entityId, records: chainRecords }).ok) {
      return { refusal: 'RUN_PROFILE_MISMATCH', detail: `research chain ${entityId}` };
    }
  }
  const appended = new Map(
    audit
      .filter((e) => e.type === 'research.record.appended')
      .map((e) => {
        const revision = (e.details as { revision?: unknown } | undefined)?.revision;
        return [`${targetsOf(e)[0]?.id ?? ''}#${String(revision)}`, String(e.requestId)] as const;
      }),
  );
  if (
    appended.size !== records.length ||
    !records.every((r) => appended.get(`${r.entityId}#${String(r.revision)}`) === r.requestId)
  ) {
    return { refusal: 'RUN_PROFILE_MISMATCH', detail: 'record/audit relationship' };
  }
  for (const artefact of docs('evidenceArtefacts')) {
    const attached = audit.filter(
      (e) =>
        e.type === 'research.evidence.attached' &&
        targetsOf(e).some((t) => t.kind === 'evidenceArtefact' && t.id === artefact.artefactId),
    );
    if (
      !entities.has(String(artefact.sourceId)) ||
      artefact.storageKey !== `${String(artefact.marjaId)}/${String(artefact.digest)}` ||
      attached.length !== 1 ||
      attached[0]?.requestId !== artefact.requestId
    ) {
      return { refusal: 'RUN_PROFILE_MISMATCH', detail: 'evidence relationship' };
    }
  }
  return null;
}

// ---- Encrypted backup ----

interface BackupContent {
  readonly format: 'khums-preproduction-backup/v2';
  readonly runId: string;
  readonly exportedAt: string;
  readonly structure: Structure;
  readonly collections: Record<string, { count: number; sha256: string; documents: string }>;
}

export type BackupVerification =
  | { readonly ok: true; readonly content: BackupContent; readonly keyId: string }
  | {
      readonly ok: false;
      readonly error: 'UNREADABLE' | 'DECRYPTION_FAILED' | 'INVALID' | 'INCOMPLETE';
    };

/** Independent verification: authenticated decryption, format, completeness and digests. */
export async function verifyPreproductionBackup(
  file: string,
  key: Uint8Array,
  runId: string,
): Promise<BackupVerification> {
  let sealed: Buffer;
  try {
    sealed = await readFile(file);
  } catch {
    return { ok: false, error: 'UNREADABLE' };
  }
  const plaintext = openBytes(key, backupAad(runId), sealed);
  if (plaintext === null) return { ok: false, error: 'DECRYPTION_FAILED' };
  let raw: { format?: unknown; runId?: unknown };
  try {
    raw = JSON.parse(plaintext.toString('utf8')) as { format?: unknown; runId?: unknown };
  } catch {
    return { ok: false, error: 'INVALID' };
  }
  if (raw.format !== 'khums-preproduction-backup/v2' || raw.runId !== runId) {
    return { ok: false, error: 'INVALID' };
  }
  const content = raw as BackupContent;
  for (const name of APP) {
    const entry = content.collections[name];
    if (entry === undefined || content.structure[name] === undefined) {
      return { ok: false, error: 'INCOMPLETE' };
    }
    if (sha(entry.documents) !== entry.sha256) return { ok: false, error: 'INVALID' };
    const parsed = BSON.EJSON.parse(entry.documents, { relaxed: true }) as Document[];
    if (parsed.length !== entry.count) return { ok: false, error: 'INVALID' };
  }
  return { ok: true, content, keyId: sealedKeyId(sealed) ?? '' };
}

// ---- Reset ----

/** Where the data stands compared with the pre-reset state. */
type DataState = 'UNCHANGED' | 'RESET_COMMITTED' | 'OTHER';

function compareData(live: Snapshot, pre: Snapshot): DataState {
  const reset = new Set<string>(RESET_COLLECTIONS);
  const same = (n: string) => ejson(live.get(n) ?? []) === ejson(pre.get(n) ?? []);
  if (APP.every(same)) return 'UNCHANGED';
  if (APP.every((n) => (reset.has(n) ? (live.get(n) ?? []).length === 0 : same(n)))) {
    return 'RESET_COMMITTED';
  }
  return 'OTHER';
}

export interface ResetFiles {
  readonly backupFile: string;
  readonly manifestFile: string;
}

export interface ResetReport {
  readonly runId: string;
  readonly backupFile: string;
  readonly manifestFile: string;
  readonly backupSha256: string;
  readonly backupKeyId: string;
  readonly removed: Readonly<Record<string, number>>;
  readonly retained: Readonly<Record<string, number>>;
}

export type ResetResult =
  | { readonly ok: true; readonly report: ResetReport }
  | {
      readonly ok: false;
      readonly refusal: ResetRefusal;
      readonly detail: string | null;
      /** The observed fence state when the command stopped. */
      readonly fence: FenceState;
      /** Whether the run's documents were deleted: NO, YES, or UNKNOWN. */
      readonly deleted: 'NO' | 'YES' | 'UNKNOWN';
      /** The next safe operator action (plan R5 §1.4). Empty when nothing changed. */
      readonly next: string;
    };

const NEXT = {
  LIFT: 'Restore the original validators: --lift-maintenance-fence (plan R5 §1.4).',
  RESTORE:
    'Deleted, but not fully verified. Keep the fence. Check with --inventory-database, then restore with --restore-preproduction-backup, or lift if the state is the expected clean state (plan R5 §1.4).',
  UNCERTAIN:
    'Outcome unknown. Keep the fence. Wait 2 minutes, run --inventory-database: if the five reset collections are empty, or still hold exactly the run (14/6/1), lift with --lift-maintenance-fence; otherwise restore with --restore-preproduction-backup (plan R5 §1.4).',
  OTHER_FENCE:
    'Another reset run left a fence. Recover it first with its own manifest: --lift-maintenance-fence (plan R5 §1.4).',
} as const;

export async function resetIntegrationTestRun(deps: {
  readonly db: ResetDatabase;
  readonly runId: string;
  readonly confirmation: string;
  readonly files: ResetFiles;
  readonly backupKey: Uint8Array;
  /** Record digests of the deterministic migration seed of the policy registry. */
  readonly seedRecordDigests: readonly string[];
  readonly now: () => number;
}): Promise<ResetResult> {
  const { db, runId, files } = deps;
  const stop = (
    refusal: ResetRefusal,
    detail: string | null = null,
    state: { fence?: FenceState; deleted?: 'NO' | 'YES' | 'UNKNOWN'; next?: string } = {},
  ): ResetResult => ({
    ok: false,
    refusal,
    detail,
    fence: state.fence ?? 'NONE',
    deleted: state.deleted ?? 'NO',
    next: state.next ?? '',
  });
  if (!RUN_ID.test(runId)) return stop('RUN_ID_INVALID');
  if (deps.confirmation !== resetConfirmation(runId)) return stop('CONFIRMATION_REQUIRED');
  if (deps.backupKey.length !== 32) return stop('BACKUP_KEY_INVALID');

  // 1. Read-only: no fence of ANY run, then the proof.
  const listed = await db.listCollections();
  const fenced = listed.filter((c) => hasAnyFence(c.options)).map((c) => c.name);
  if (fenced.length > 0) {
    return stop('FENCE_ALREADY_ACTIVE', fenced.join(','), {
      fence: 'UNKNOWN',
      next: NEXT.OTHER_FENCE,
    });
  }
  const present = new Set(listed.map((c) => c.name));
  const first = await snapshotOf((n) => db.find(n));
  const proof = proveResettable(present, first, runId, deps.seedRecordDigests);
  if (proof !== null) return stop(proof.refusal, proof.detail);
  const structure = await structureOf(db);

  // 2. Recovery manifest of the original validators, before any collMod.
  const validators = Object.fromEntries(APP.map((n) => [n, structure[n]?.options ?? '{}']));
  const unsealed = {
    format: MANIFEST_FORMAT,
    runId,
    createdAt: new Date(deps.now()).toISOString(),
    validators,
  } as const;
  try {
    await writeNewFileAtomically(
      files.manifestFile,
      Buffer.from(JSON.stringify({ ...unsealed, sha256: manifestDigest(unsealed) })),
    );
  } catch {
    return stop('MANIFEST_FAILED', 'manifest not created (exists or not writable)');
  }

  /** Lifts (no deletion can have happened) and reports what is left. */
  const stopAndLift = async (refusal: ResetRefusal, detail: string | null) => {
    const lifted = await liftMaintenanceFence({ db, manifestFile: files.manifestFile, runId });
    if (lifted.ok) return stop(refusal, detail);
    return stop(refusal, `${detail ?? ''}; lift failed: ${lifted.error}`, {
      fence: await fenceStateOf(db, runId),
      next: NEXT.LIFT,
    });
  };
  /** Keeps the fence (data deleted or outcome uncertain). */
  const stopFenced = async (
    refusal: ResetRefusal,
    detail: string | null,
    deleted: 'YES' | 'UNKNOWN',
  ) =>
    stop(refusal, detail, {
      fence: await fenceStateOf(db, runId),
      deleted,
      next: deleted === 'YES' ? NEXT.RESTORE : NEXT.UNCERTAIN,
    });

  // 3. Maintenance fence.
  try {
    for (const name of APP) await db.setValidator(name, fenceValidator(runId));
  } catch {
    return stopAndLift('FENCE_FAILED', null);
  }

  // 4–8: one handler. `deleted` tracks what may have happened to the data.
  let deleted: 'NO' | 'YES' | 'UNKNOWN' = 'NO';
  let stage = 'proof behind the fence';
  try {
    const fencedSnapshot = await snapshotOf((n) => db.find(n));
    const again = proveResettable(present, fencedSnapshot, runId, deps.seedRecordDigests);
    if (again !== null) return await stopAndLift(again.refusal, again.detail);
    if (snapshotDigest(fencedSnapshot) !== snapshotDigest(first)) {
      return await stopAndLift('CONCURRENT_CHANGE', 'before the fence');
    }

    stage = 'backup';
    const content: BackupContent = {
      format: 'khums-preproduction-backup/v2',
      runId,
      exportedAt: new Date(deps.now()).toISOString(),
      structure,
      collections: Object.fromEntries(
        APP.map((name) => {
          const docs = fencedSnapshot.get(name) ?? [];
          const text = ejson(docs);
          return [name, { count: docs.length, sha256: sha(text), documents: text }];
        }),
      ),
    };
    const sealed = sealBytes(
      deps.backupKey,
      backupAad(runId),
      Buffer.from(JSON.stringify(content)),
    );
    try {
      await writeNewFileAtomically(files.backupFile, sealed);
    } catch {
      return await stopAndLift('BACKUP_FAILED', 'file not created (exists or not writable)');
    }
    const verified = await verifyPreproductionBackup(files.backupFile, deps.backupKey, runId);
    if (!verified.ok) return await stopAndLift('BACKUP_FAILED', verified.error);
    for (const name of APP) {
      if (
        verified.content.collections[name]?.sha256 !== sha(ejson(fencedSnapshot.get(name) ?? []))
      ) {
        return await stopAndLift('BACKUP_FAILED', `differs from live data: ${name}`);
      }
    }

    // 6. One transaction. `attempt.completed` tells whether a failure came from inside the
    // callback (the driver then aborts: nothing committed) or from the commit (uncertain).
    stage = 'transaction';
    deleted = 'UNKNOWN';
    interface Abort {
      readonly refusal: ResetRefusal;
      readonly detail: string;
    }
    const removed: Record<string, number> = {};
    const attempt = { completed: false };
    let outcome: true | Abort | undefined;
    try {
      outcome = await db.transaction(async (tx): Promise<true | Abort> => {
        attempt.completed = false;
        const inside = await snapshotOf((n) => tx.find(n));
        if (snapshotDigest(inside) !== snapshotDigest(fencedSnapshot)) {
          throw new Rollback<Abort>({
            refusal: 'CONCURRENT_CHANGE',
            detail: 'inside the transaction',
          });
        }
        const recheck = proveResettable(present, inside, runId, deps.seedRecordDigests);
        if (recheck !== null) throw new Rollback<Abort>(recheck);
        for (const name of RESET_COLLECTIONS) {
          const ids = (inside.get(name) ?? []).map((d) => d._id as unknown);
          const count = await tx.deleteByIds(name, ids);
          if (count !== ids.length) {
            throw new Rollback<Abort>({
              refusal: 'TRANSACTION_ABORTED',
              detail: `deleted count: ${name}`,
            });
          }
          removed[name] = count;
        }
        for (const name of RESET_COLLECTIONS) {
          if ((await tx.find(name)).length !== 0) {
            throw new Rollback<Abort>({
              refusal: 'TRANSACTION_ABORTED',
              detail: `not empty: ${name}`,
            });
          }
        }
        attempt.completed = true;
        return true;
      });
    } catch {
      outcome = undefined;
    }
    if (outcome !== true) {
      // Aborted by us, or failed: re-read and decide. Only a proven abort lifts the fence.
      const observed = compareData(await snapshotOf((n) => db.find(n)), fencedSnapshot);
      const abortedBeforeCommit = outcome !== undefined || !attempt.completed;
      if (abortedBeforeCommit && observed === 'UNCHANGED') {
        deleted = 'NO';
        return await stopAndLift(
          outcome?.refusal ?? 'TRANSACTION_ABORTED',
          outcome?.detail ?? 'transaction error',
        );
      }
      if (observed !== 'RESET_COMMITTED') {
        return await stopFenced('TRANSACTION_UNCERTAIN', `data ${observed}`, 'UNKNOWN');
      }
      for (const name of RESET_COLLECTIONS) removed[name] = (fencedSnapshot.get(name) ?? []).length;
    }
    deleted = 'YES';

    stage = 'verification after commit';
    const after = await snapshotOf((n) => db.find(n));
    if (compareData(after, fencedSnapshot) !== 'RESET_COMMITTED') {
      return await stopFenced('VERIFICATION_FAILED', 'data after commit', 'YES');
    }

    stage = 'lifting the fence';
    const lifted = await liftMaintenanceFence({ db, manifestFile: files.manifestFile, runId });
    if (!lifted.ok) {
      return stop('FENCE_LIFT_FAILED', lifted.error, {
        fence: await fenceStateOf(db, runId),
        deleted: 'YES',
        next: NEXT.LIFT,
      });
    }
    if (JSON.stringify(await structureOf(db)) !== JSON.stringify(structure)) {
      return await stopFenced('VERIFICATION_FAILED', 'structure after lifting', 'YES');
    }
    return {
      ok: true,
      report: {
        runId,
        backupFile: files.backupFile,
        manifestFile: files.manifestFile,
        backupSha256: sha(sealed),
        backupKeyId: verified.keyId,
        removed,
        retained: Object.fromEntries(APP.map((n) => [n, (after.get(n) ?? []).length])),
      },
    };
  } catch {
    // Unexpected error after the fence (database or file system).
    if (deleted === 'NO') return stopAndLift('OPERATION_FAILED', stage);
    return stopFenced('OPERATION_FAILED', stage, deleted);
  }
}

// ---- Controlled restore under this run's fence ----

export type RestoreError =
  | 'CONFIRMATION_REQUIRED'
  | 'MANIFEST_INVALID'
  | 'BACKUP_INVALID'
  /** Every application collection must carry this run's fence. */
  | 'FENCE_NOT_ACTIVE'
  | 'STRUCTURE_CHANGED'
  /** A collection holds data that differs from the backup: nothing is overwritten. */
  | 'TARGET_NOT_EMPTY_OR_CHANGED'
  | 'TRANSACTION_FAILED'
  | 'VERIFICATION_FAILED'
  | 'FENCE_LIFT_FAILED';

export type RestoreResult =
  | { readonly ok: true; readonly inserted: Readonly<Record<string, number>> }
  | {
      readonly ok: false;
      readonly error: RestoreError;
      readonly detail: string | null;
      readonly fence: FenceState;
      readonly next: string;
    };

/**
 * Restores a verified backup WHILE this run's fence is active (inserts bypass the fence; nothing
 * else can write). Refuses, writing nothing, unless the manifest and backup check out, every
 * collection carries this run's fence, the indexes and the manifest's original validators equal
 * the backup's, and every collection is empty or already identical. Inserts in one transaction;
 * data verified BEFORE the fence is lifted; the fence stays on any failure.
 */
export async function restorePreproductionBackup(deps: {
  readonly db: ResetDatabase;
  readonly files: ResetFiles;
  readonly backupKey: Uint8Array;
  readonly runId: string;
  readonly confirmation: string;
}): Promise<RestoreResult> {
  const { db, files, runId } = deps;
  const fail = async (
    error: RestoreError,
    detail: string | null = null,
    next = '',
  ): Promise<RestoreResult> => ({
    ok: false,
    error,
    detail,
    fence: await fenceStateOf(db, runId),
    next,
  });
  if (deps.confirmation !== restoreConfirmation(runId)) return fail('CONFIRMATION_REQUIRED');
  const manifest = await readManifest(files.manifestFile, runId);
  if (manifest === null) return fail('MANIFEST_INVALID');
  const backup = await verifyPreproductionBackup(files.backupFile, deps.backupKey, runId);
  if (!backup.ok) return fail('BACKUP_INVALID', backup.error);
  if ((await fenceStateOf(db, runId)) !== 'ACTIVE') return fail('FENCE_NOT_ACTIVE');
  for (const name of APP) {
    const indexes = (await db.indexes(name)).map((i) => JSON.stringify(i)).sort();
    if (
      JSON.stringify(indexes) !== JSON.stringify(backup.content.structure[name]?.indexes) ||
      manifest.validators[name] !== backup.content.structure[name]?.options
    ) {
      return fail('STRUCTURE_CHANGED', name);
    }
  }
  const wanted = new Map(
    APP.map((n) => [
      n,
      // Relaxed parsing gives the JavaScript values the driver returns (numbers, ObjectId, Date).
      BSON.EJSON.parse(backup.content.collections[n]?.documents ?? '[]', {
        relaxed: true,
      }) as Document[],
    ]),
  );
  const keepFence =
    'Fence kept. Check with --inventory-database, fix the cause, and re-run --restore-preproduction-backup (identical collections are skipped) (plan R5 §1.4).';

  type Outcome = { counts: Record<string, number> } | { conflict: string };
  let outcome: Outcome;
  try {
    outcome = await db.transaction(async (tx): Promise<Outcome> => {
      const counts: Record<string, number> = {};
      for (const name of APP) {
        const live = sorted(await tx.find(name));
        const target = sorted([...(wanted.get(name) ?? [])]);
        if (live.length === 0) counts[name] = await tx.insertMany(name, target, true);
        else if (ejson(live) === ejson(target)) counts[name] = 0;
        else throw new Rollback<Outcome>({ conflict: name });
      }
      return { counts };
    });
  } catch {
    return fail('TRANSACTION_FAILED', null, keepFence);
  }
  if ('conflict' in outcome)
    return fail('TARGET_NOT_EMPTY_OR_CHANGED', outcome.conflict, keepFence);
  try {
    for (const name of APP) {
      const live = ejson(sorted(await db.find(name)));
      if (live !== ejson(sorted([...(wanted.get(name) ?? [])]))) {
        return await fail('VERIFICATION_FAILED', name, keepFence);
      }
    }
  } catch {
    return fail('VERIFICATION_FAILED', 'read failed', keepFence);
  }
  const lifted = await liftMaintenanceFence({ db, manifestFile: files.manifestFile, runId });
  if (!lifted.ok) return fail('FENCE_LIFT_FAILED', lifted.error, NEXT.LIFT);
  return { ok: true, inserted: outcome.counts };
}
