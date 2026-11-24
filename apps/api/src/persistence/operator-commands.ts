import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { MongoClient, type Db } from 'mongodb';

import { bootstrapAllowed, bootstrapSuperAdmin } from '../auth/bootstrap';
import { argon2idHasher, type PasswordHasher } from '../auth/password-hasher';
import { mongoStaffStore, type StaffStore } from '../auth/staff-store';
import type { AppConfig, CheckpointSigningConfig } from '../config';
import { appendOnlyGovernanceLedgerStore } from '../governance/governance-ledger.store';
import {
  appendOnlyGovernancePolicyStore,
  seedPolicyRegistry,
} from '../governance/governance-policy.store';
import { initialRegistryFor } from '../governance/governance.module';
import {
  INITIAL_GOVERNANCE_POLICIES,
  INITIAL_GOVERNANCE_POLICY_RECORDED_AT,
  INITIAL_GOVERNANCE_POLICY_SEED_REQUEST_ID,
} from '../governance/initial-governance-policies';
import { readArchiveFile, writeArchiveFile } from '../integrity/checkpoint-archive-file';
import { TRUSTED_CHECKPOINT_KEYS } from '../integrity/checkpoint-keys';
import { ed25519Signer, ed25519Verifier } from '../integrity/ed25519';
import {
  archiveCheckpoints,
  createIntegrityCheckpoints,
  loadVerifiedChains,
  verifyIntegrity,
  type ChainSources,
} from '../integrity/integrity-checkpoints';
import { researchChainStore } from '../research/research-store';
import { COLLECTIONS } from './collections';
import { inventoryDatabase } from './database-inventory';
import { migrationManifest } from './migration-manifest';
import {
  liftMaintenanceFence,
  mongoResetDatabase,
  resetIntegrationTestRun,
  restorePreproductionBackup,
  verifyPreproductionBackup,
} from './preproduction-reset';
import { databaseRoles } from './database-roles';
import { migrateDatabase, migrateResearchCollections } from './migrate';
import { MONGO_CLIENT_OPTIONS, mongoAppendOnlyCollection } from './mongo-append-only-collection';

/**
 * Operator commands (M4.6.3a), run as `node dist/main.js <flag>`, each with its own database
 * user: `--print-database-roles` (no database), `--migrate-database` (`khumsMigrator`),
 * `--create-integrity-checkpoints [--archive <file>]` (`khumsCheckpoint` plus the signing key),
 * `--export-integrity-checkpoints <file>` and `--verify-integrity [checkpoints.json]` (read-only).
 * `<file>` is the independent checkpoint archive on the operator's machine (M4.7). Output: JSON with names, sequences,
 * digests and status codes only. Never the URI, keys, or record contents.
 */

export interface CommandResult {
  readonly exitCode: 0 | 1;
  readonly output: unknown;
}

export const OPERATOR_FLAGS = [
  '--bootstrap-super-admin',
  '--print-database-roles',
  '--print-migration-manifest',
  '--migrate-database',
  '--create-integrity-checkpoints',
  '--export-integrity-checkpoints',
  '--verify-integrity',
  '--inventory-database',
  '--migrate-research-collections',
  '--reset-integration-test-run',
  '--verify-preproduction-backup',
  '--restore-preproduction-backup',
  '--lift-maintenance-fence',
  // Evidence (M5.3.3 hardening; src/research/evidence-commands.ts).
  '--evidence-orphans',
  '--delete-evidence-orphans',
  '--verify-evidence',
  '--backup-evidence',
  '--verify-evidence-backup',
  '--restore-evidence',
  '--rotate-evidence-key',
] as const;

export async function withDatabase<T>(config: AppConfig, run: (db: Db) => Promise<T>): Promise<T> {
  const uri = config.mongodb.uri;
  if (uri === undefined) throw new Error('MONGODB_URI is required for this command');
  const client = new MongoClient(uri, MONGO_CLIENT_OPTIONS);
  try {
    return await run(client.db(config.mongodb.databaseName));
  } finally {
    await client.close();
  }
}

export const chainSourcesOf = (db: Db): ChainSources => ({
  audit: mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents),
  policyRegistry: appendOnlyGovernancePolicyStore(
    mongoAppendOnlyCollection(db, COLLECTIONS.governancePolicyRegistry),
  ),
  ledgers: appendOnlyGovernanceLedgerStore(
    mongoAppendOnlyCollection(db, COLLECTIONS.governanceLedgerRecords),
  ),
  research: [
    researchChainStore(mongoAppendOnlyCollection(db, COLLECTIONS.researchSources), 'SOURCE'),
    researchChainStore(mongoAppendOnlyCollection(db, COLLECTIONS.sourcePassages), 'PASSAGE'),
    researchChainStore(
      mongoAppendOnlyCollection(db, COLLECTIONS.passageTranslations),
      'TRANSLATION',
    ),
    researchChainStore(mongoAppendOnlyCollection(db, COLLECTIONS.researchFindings), 'FINDING'),
    researchChainStore(mongoAppendOnlyCollection(db, COLLECTIONS.religiousRulings), 'RULING'),
  ],
});

/** `--migrate-research-collections`: creates ONLY the missing research collections (additive). */
export async function migrateResearch(config: AppConfig): Promise<CommandResult> {
  return withDatabase(config, async (db) => ({
    exitCode: 0,
    output: await migrateResearchCollections(db),
  }));
}

/**
 * Pre-production reset family (ATLAS_INTEGRATION_TEST_PLAN R5 §1.3–§1.4), operator only. The
 * backup key comes from KHUMS_BACKUP_KEY, entered with `read -rs` (never an argument or a file);
 * the API refuses to start while it is set. Output: ids, counts, states and codes only.
 *
 * `--reset-integration-test-run <runId> --confirm "RESET <runId>" --backup <new> --manifest <new>`
 * `--lift-maintenance-fence --run <runId> --manifest <file>`
 * `--restore-preproduction-backup <backup> --run <runId> --manifest <file> --confirm "RESTORE <runId>"`
 * `--verify-preproduction-backup <backup> --run <runId>` (no database)
 */
export interface ResetCommandInput {
  readonly runId: string | undefined;
  readonly backupFile: string | undefined;
  readonly manifestFile: string | undefined;
  readonly confirmation: string | undefined;
  readonly backupKey: Uint8Array;
}

const absent = (value: string | undefined) => value === undefined || value.startsWith('--');
const argumentsMissing = (names: Record<string, string | undefined>): CommandResult | null => {
  const missing = Object.entries(names)
    .filter(([, v]) => absent(v))
    .map(([k]) => k);
  return missing.length === 0
    ? null
    : { exitCode: 1, output: { error: 'ARGUMENTS_REQUIRED', missing } };
};

const seedDigests = () =>
  initialRegistryFor(
    Date.parse(INITIAL_GOVERNANCE_POLICY_RECORDED_AT),
    INITIAL_GOVERNANCE_POLICIES,
    INITIAL_GOVERNANCE_POLICY_SEED_REQUEST_ID,
  ).records.map((r) => r.recordDigest);

export async function resetIntegrationRun(
  config: AppConfig,
  input: ResetCommandInput,
  now: () => number,
): Promise<CommandResult> {
  const missing = argumentsMissing({
    runId: input.runId,
    backup: input.backupFile,
    manifest: input.manifestFile,
  });
  if (missing !== null) return missing;
  return withDatabase(config, async (db) => {
    const result = await resetIntegrationTestRun({
      db: mongoResetDatabase(db, db.client),
      runId: input.runId ?? '',
      confirmation: input.confirmation ?? '',
      files: { backupFile: input.backupFile ?? '', manifestFile: input.manifestFile ?? '' },
      backupKey: input.backupKey,
      seedRecordDigests: seedDigests(),
      now,
    });
    return { exitCode: result.ok ? 0 : 1, output: result };
  });
}

export async function liftMaintenanceFenceCommand(
  config: AppConfig,
  input: ResetCommandInput,
): Promise<CommandResult> {
  const missing = argumentsMissing({ run: input.runId, manifest: input.manifestFile });
  if (missing !== null) return missing;
  return withDatabase(config, async (db) => {
    const result = await liftMaintenanceFence({
      db: mongoResetDatabase(db, db.client),
      manifestFile: input.manifestFile ?? '',
      runId: input.runId ?? '',
    });
    return { exitCode: result.ok ? 0 : 1, output: result };
  });
}

export async function restorePreproductionBackupCommand(
  config: AppConfig,
  input: ResetCommandInput,
): Promise<CommandResult> {
  const missing = argumentsMissing({
    backup: input.backupFile,
    run: input.runId,
    manifest: input.manifestFile,
  });
  if (missing !== null) return missing;
  return withDatabase(config, async (db) => {
    const result = await restorePreproductionBackup({
      db: mongoResetDatabase(db, db.client),
      files: { backupFile: input.backupFile ?? '', manifestFile: input.manifestFile ?? '' },
      backupKey: input.backupKey,
      runId: input.runId ?? '',
      confirmation: input.confirmation ?? '',
    });
    return { exitCode: result.ok ? 0 : 1, output: result };
  });
}

export async function verifyPreproductionBackupCommand(
  input: ResetCommandInput,
): Promise<CommandResult> {
  const missing = argumentsMissing({ backup: input.backupFile, run: input.runId });
  if (missing !== null) return missing;
  const verified = await verifyPreproductionBackup(
    input.backupFile ?? '',
    input.backupKey,
    input.runId ?? '',
  );
  return verified.ok
    ? {
        exitCode: 0,
        output: {
          runId: verified.content.runId,
          exportedAt: verified.content.exportedAt,
          keyId: verified.keyId,
          collections: Object.fromEntries(
            Object.entries(verified.content.collections).map(([n, c]) => [n, c.count]),
          ),
        },
      }
    : { exitCode: 1, output: { error: verified.error } };
}

/** `--inventory-database`: READ-ONLY (names, counts, indexes, transaction support). */
export async function inventory(config: AppConfig): Promise<CommandResult> {
  return withDatabase(config, async (db) => ({ exitCode: 0, output: await inventoryDatabase(db) }));
}

/** `--print-migration-manifest`: what `--migrate-database` creates and seeds (no database). */
export function printMigrationManifest(): CommandResult {
  const seed = initialRegistryFor(
    Date.parse(INITIAL_GOVERNANCE_POLICY_RECORDED_AT),
    INITIAL_GOVERNANCE_POLICIES,
    INITIAL_GOVERNANCE_POLICY_SEED_REQUEST_ID,
  ).records;
  return { exitCode: 0, output: migrationManifest(seed) };
}

export function printDatabaseRoles(config: AppConfig): CommandResult {
  return { exitCode: 0, output: databaseRoles(config.mongodb.databaseName) };
}

export async function migrate(config: AppConfig): Promise<CommandResult> {
  return withDatabase(config, async (db) => {
    const report = await migrateDatabase(db);
    const seed = await seedPolicyRegistry(
      appendOnlyGovernancePolicyStore(
        mongoAppendOnlyCollection(db, COLLECTIONS.governancePolicyRegistry),
      ),
      initialRegistryFor(
        Date.parse(INITIAL_GOVERNANCE_POLICY_RECORDED_AT),
        INITIAL_GOVERNANCE_POLICIES,
        INITIAL_GOVERNANCE_POLICY_SEED_REQUEST_ID,
      ),
    );
    return {
      exitCode: seed === 'UNAVAILABLE' ? 1 : 0,
      output: { ...report, policyRegistrySeed: seed },
    };
  });
}

export async function createCheckpoints(
  config: AppConfig,
  signing: CheckpointSigningConfig,
  now: () => number,
  archiveFile?: string,
): Promise<CommandResult> {
  const signer = ed25519Signer(signing.keyId, signing.privateKeyPem);
  if (archiveFile !== undefined) {
    // Refuse before writing anything: the archive accepts only trusted keys' checkpoints, and the
    // archive must be readable and well-formed.
    if (!TRUSTED_CHECKPOINT_KEYS.some((k) => k.keyId === signing.keyId)) {
      return { exitCode: 1, output: { error: 'SIGNING_KEY_NOT_TRUSTED' } };
    }
    if ((await readArchiveFile(archiveFile)).kind !== 'READ') {
      return { exitCode: 1, output: { error: 'ARCHIVE_INVALID' } };
    }
  }
  return withDatabase(config, async (db) => {
    const outcomes = await createIntegrityCheckpoints({
      chains: await loadVerifiedChains(chainSourcesOf(db)),
      signer,
      checkpoints: mongoAppendOnlyCollection(db, COLLECTIONS.auditCheckpoints),
      now,
      newId: randomUUID,
    });
    const failed = outcomes.some((o) => o.status.startsWith('NOT_'));
    // The output includes the signed checkpoints so they can be copied to the archive.
    if (archiveFile === undefined) return { exitCode: failed ? 1 : 0, output: outcomes };
    const archived = await archiveInto(
      archiveFile,
      outcomes.flatMap((o) => (o.status === 'CHECKPOINTED' ? [o.checkpoint] : [])),
    );
    return {
      exitCode: failed || archived.status !== 'ARCHIVED' ? 1 : 0,
      output: { outcomes, archive: archived },
    };
  });
}

/** Verifies `additions` against the trusted keys and appends them to the archive file. */
async function archiveInto(archiveFile: string, additions: readonly unknown[]) {
  const existing = await readArchiveFile(archiveFile);
  if (existing.kind !== 'READ') {
    return { status: 'NOT_ARCHIVED', code: 'ARCHIVE_INVALID', checkpointId: null } as const;
  }
  const result = await archiveCheckpoints({
    archive: existing.value,
    additions,
    trustedKeys: TRUSTED_CHECKPOINT_KEYS,
    verifier: ed25519Verifier(TRUSTED_CHECKPOINT_KEYS),
  });
  if (result.archive === null) return result.outcome;
  if (result.outcome.added > 0) await writeArchiveFile(archiveFile, result.archive);
  return result.outcome;
}

/**
 * Copies the database's checkpoints into the archive file (recovery when a creation run could not
 * write the archive). Read-only on the database; only trusted, correctly signed checkpoints enter.
 */
export async function exportCheckpoints(
  config: AppConfig,
  archiveFile: string | undefined,
): Promise<CommandResult> {
  if (archiveFile === undefined || archiveFile.startsWith('--')) {
    return { exitCode: 1, output: { error: 'ARCHIVE_FILE_REQUIRED' } };
  }
  return withDatabase(config, async (db) => {
    const stored = await mongoAppendOnlyCollection(db, COLLECTIONS.auditCheckpoints).find(
      {},
      { sort: { field: 'createdAt', direction: 1 } },
    );
    if (!stored.ok) return { exitCode: 1, output: { error: 'CHECKPOINTS_UNAVAILABLE' } };
    const archived = await archiveInto(archiveFile, stored.value);
    return { exitCode: archived.status === 'ARCHIVED' ? 0 : 1, output: { archive: archived } };
  });
}

export async function verify(
  config: AppConfig,
  archiveFile: string | undefined,
): Promise<CommandResult> {
  return withDatabase(config, async (db) => {
    let checkpoints: readonly unknown[];
    if (archiveFile === undefined) {
      const stored = await mongoAppendOnlyCollection(db, COLLECTIONS.auditCheckpoints).find(
        {},
        { sort: { field: 'createdAt', direction: 1 } },
      );
      if (!stored.ok) return { exitCode: 1, output: { error: 'CHECKPOINTS_UNAVAILABLE' } };
      checkpoints = stored.value;
    } else {
      const parsed: unknown = JSON.parse(await readFile(archiveFile, 'utf8'));
      if (!Array.isArray(parsed)) return { exitCode: 1, output: { error: 'ARCHIVE_NOT_A_LIST' } };
      checkpoints = parsed;
    }
    const outcomes = await verifyIntegrity({
      chains: await loadVerifiedChains(chainSourcesOf(db)),
      checkpoints,
      trustedKeys: TRUSTED_CHECKPOINT_KEYS,
      verifier: ed25519Verifier(TRUSTED_CHECKPOINT_KEYS),
    });
    const ok = outcomes.every((o) => o.status === 'VERIFIED');
    return {
      exitCode: ok && TRUSTED_CHECKPOINT_KEYS.length > 0 ? 0 : 1,
      output: {
        source: archiveFile === undefined ? 'database' : 'archive',
        trustedKeys: TRUSTED_CHECKPOINT_KEYS.length,
        outcomes,
      },
    };
  });
}

/** Reads one line from the terminal without echoing it. Refuses without an interactive TTY. */
export interface SecretPrompt {
  readonly interactive: boolean;
  ask(question: string): Promise<string>;
}

/**
 * `--bootstrap-super-admin <username>` (M4.6.2b): creates the first SUPER_ADMIN. The password is
 * read twice from the hidden prompt (never an argument, environment variable or log line); refused
 * before prompting when bootstrap already happened. Prints the new principal id only.
 */
export async function bootstrap(
  config: AppConfig,
  username: string | undefined,
  prompt: SecretPrompt,
  now: () => number,
): Promise<CommandResult> {
  if (username === undefined || username.startsWith('--')) {
    return { exitCode: 1, output: { error: 'USERNAME_REQUIRED' } };
  }
  if (!prompt.interactive) {
    return { exitCode: 1, output: { error: 'INTERACTIVE_TERMINAL_REQUIRED' } };
  }
  return withDatabase(config, (db) =>
    bootstrapWithStore(mongoStaffStore(db), argon2idHasher(), username, prompt, now),
  );
}

/** The bootstrap dialogue against a given store (tested with an in-memory store). */
export async function bootstrapWithStore(
  store: StaffStore,
  hasher: PasswordHasher,
  username: string,
  prompt: SecretPrompt,
  now: () => number,
): Promise<CommandResult> {
  if (!prompt.interactive) {
    return { exitCode: 1, output: { error: 'INTERACTIVE_TERMINAL_REQUIRED' } };
  }
  // Refuse BEFORE asking for a password when bootstrap already happened.
  const allowed = await bootstrapAllowed(store);
  if (!allowed.ok) return { exitCode: 1, output: { error: allowed.error.kind } };
  const password = await prompt.ask('New SUPER_ADMIN password: ');
  const repeated = await prompt.ask('Repeat the password: ');
  if (password !== repeated) return { exitCode: 1, output: { error: 'PASSWORDS_DO_NOT_MATCH' } };
  const result = await bootstrapSuperAdmin({ store, hasher, now: now() }, { username, password });
  return result.ok
    ? { exitCode: 0, output: { principalId: result.value.principalId, role: 'SUPER_ADMIN' } }
    : {
        exitCode: 1,
        output: {
          error: result.error.kind,
          ...('issue' in result.error ? { issue: result.error.issue } : {}),
        },
      };
}

/** The real terminal prompt: raw mode, no echo, Ctrl-C aborts. */
export const terminalPrompt: SecretPrompt = {
  // `isTTY` is undefined at runtime when the stream is not a terminal (the types say boolean).
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion
  interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  ask: (question) =>
    new Promise((resolve, reject) => {
      const stdin = process.stdin;
      process.stdout.write(question);
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');
      let value = '';
      const onData = (chunk: string) => {
        for (const ch of chunk) {
          if (ch === '\u0003') {
            cleanup();
            reject(new Error('aborted'));
            return;
          }
          if (ch === '\r' || ch === '\n') {
            cleanup();
            process.stdout.write('\n');
            resolve(value);
            return;
          }
          if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
          else value += ch;
        }
      };
      const cleanup = () => {
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
      };
      stdin.on('data', onData);
    }),
};
