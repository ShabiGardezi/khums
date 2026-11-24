import { readFile } from 'node:fs/promises';

import { appendAuditEvent } from '@khums/core';
import type { Db } from 'mongodb';

import { appendOnlyAuditEventStore } from '../audit/audit-event.store';
import type { AppConfig } from '../config';
import { COLLECTIONS } from '../persistence/collections';
import { mongoAppendOnlyCollection } from '../persistence/mongo-append-only-collection';
import type { CommandResult } from '../persistence/operator-commands';
import {
  backupLocalEvidence,
  reencryptLocalEvidence,
  restoreLocalEvidence,
  verifyEvidence,
  verifyLocalEvidenceBackup,
} from './evidence-backup';
import {
  DEFAULT_ORPHAN_GRACE_MS,
  deleteEvidenceOrphans,
  evidenceOrphanInventory,
  MIN_ORPHAN_GRACE_MS,
} from './evidence-orphans';
import { localEncryptedEvidenceStorage } from './evidence-storage';
import { researchStoresOver } from './research-store';

/**
 * Evidence operator commands (M5.3.3 hardening), run on the maintainer machine that holds the
 * evidence directory (`KHUMS_EVIDENCE_DIR`, `KHUMS_EVIDENCE_KEY`; never production, where no
 * evidence storage exists). Output: keys (Marja + SHA-256), counts and codes only; never bytes,
 * keys or the database URI.
 *
 * - `--evidence-orphans [--grace-days N]`: read-only inventory.
 * - `--delete-evidence-orphans <keys.json> --confirm "DELETE <n> EVIDENCE ORPHANS" [--grace-days N]`
 * - `--verify-evidence`: every artefact's bytes decrypt and match its SHA-256 and size.
 * - `--backup-evidence <empty dir>` · `--verify-evidence-backup <dir>` · `--restore-evidence <dir>`
 * - `--rotate-evidence-key <empty dir>` (new key in `KHUMS_EVIDENCE_NEW_KEY`, command only).
 */

type WithDatabase = <T>(config: AppConfig, run: (db: Db) => Promise<T>) => Promise<T>;

const notConfigured: CommandResult = {
  exitCode: 1,
  output: { error: 'EVIDENCE_STORAGE_NOT_CONFIGURED' },
};

/** `--grace-days N` (default 7, at least 1). */
export function graceFromArgs(argv: readonly string[]): number | null {
  const flag = argv.indexOf('--grace-days');
  if (flag === -1) return DEFAULT_ORPHAN_GRACE_MS;
  const days = Number(argv[flag + 1]);
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days * MIN_ORPHAN_GRACE_MS : null;
}

function localStorageOf(config: AppConfig) {
  return config.env === 'production' || config.evidence === null
    ? null
    : {
        root: config.evidence.dir,
        key: config.evidence.key,
        storage: localEncryptedEvidenceStorage(config.evidence.dir, config.evidence.key),
      };
}

const artefactsOf = (db: Db) =>
  researchStoresOver({
    sources: mongoAppendOnlyCollection(db, COLLECTIONS.researchSources),
    passages: mongoAppendOnlyCollection(db, COLLECTIONS.sourcePassages),
    translations: mongoAppendOnlyCollection(db, COLLECTIONS.passageTranslations),
    findings: mongoAppendOnlyCollection(db, COLLECTIONS.researchFindings),
    rulings: mongoAppendOnlyCollection(db, COLLECTIONS.religiousRulings),
    evidence: mongoAppendOnlyCollection(db, COLLECTIONS.evidenceArtefacts),
    audit: mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents),
  }).evidence;

export async function evidenceOrphansCommand(
  config: AppConfig,
  withDatabase: WithDatabase,
  now: () => number,
  graceMs: number,
): Promise<CommandResult> {
  const local = localStorageOf(config);
  if (local === null) return notConfigured;
  return withDatabase(config, async (db) => {
    const inventory = await evidenceOrphanInventory({
      storage: local.storage,
      artefacts: artefactsOf(db),
      now,
      graceMs,
    });
    return inventory.ok
      ? { exitCode: 0, output: inventory.value }
      : { exitCode: 1, output: { error: inventory.error } };
  });
}

export async function deleteEvidenceOrphansCommand(
  config: AppConfig,
  withDatabase: WithDatabase,
  now: () => number,
  graceMs: number,
  keysFile: string | undefined,
  confirmation: string | undefined,
): Promise<CommandResult> {
  const local = localStorageOf(config);
  if (local === null) return notConfigured;
  if (keysFile === undefined || keysFile.startsWith('--')) {
    return { exitCode: 1, output: { error: 'KEYS_FILE_REQUIRED' } };
  }
  let keys: unknown;
  try {
    keys = JSON.parse(await readFile(keysFile, 'utf8'));
  } catch {
    return { exitCode: 1, output: { error: 'KEYS_FILE_INVALID' } };
  }
  if (!Array.isArray(keys) || !keys.every((k): k is string => typeof k === 'string')) {
    return { exitCode: 1, output: { error: 'KEYS_FILE_INVALID' } };
  }
  return withDatabase(config, async (db) => {
    const auditStore = appendOnlyAuditEventStore(
      mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents),
    );
    const result = await deleteEvidenceOrphans({
      storage: local.storage,
      artefacts: artefactsOf(db),
      audit: (draft) => appendAuditEvent(auditStore, draft),
      now,
      keys,
      confirmation: confirmation ?? '',
      graceMs,
    });
    return result.ok
      ? { exitCode: 0, output: result.value }
      : { exitCode: 1, output: { error: result.error } };
  });
}

export async function verifyEvidenceCommand(
  config: AppConfig,
  withDatabase: WithDatabase,
): Promise<CommandResult> {
  const local = localStorageOf(config);
  if (local === null) return notConfigured;
  return withDatabase(config, async (db) => {
    const artefacts = await artefactsOf(db).all();
    if (!artefacts.ok) return { exitCode: 1, output: { error: 'DATABASE_UNAVAILABLE' } };
    const report = await verifyEvidence(local.storage, artefacts.value);
    if (!report.ok) return { exitCode: 1, output: { error: report.error } };
    return { exitCode: report.value.ok ? 0 : 1, output: report.value };
  });
}

export async function backupEvidenceCommand(
  config: AppConfig,
  target: string | undefined,
): Promise<CommandResult> {
  const local = localStorageOf(config);
  if (local === null) return notConfigured;
  if (target === undefined || target.startsWith('--')) {
    return { exitCode: 1, output: { error: 'TARGET_REQUIRED' } };
  }
  const backup = await backupLocalEvidence(local.root, local.storage, target);
  if (!backup.ok) return { exitCode: 1, output: { error: backup.error } };
  // A backup is reported only after it verifies (hashes, decryption, digests).
  const verified = await verifyLocalEvidenceBackup(target, local.key);
  if (!verified.ok) return { exitCode: 1, output: { error: verified.error } };
  return {
    exitCode: verified.value.ok ? 0 : 1,
    output: { ...backup.value, verification: verified.value },
  };
}

export async function verifyEvidenceBackupCommand(
  config: AppConfig,
  backup: string | undefined,
): Promise<CommandResult> {
  const local = localStorageOf(config);
  if (local === null) return notConfigured;
  if (backup === undefined || backup.startsWith('--')) {
    return { exitCode: 1, output: { error: 'BACKUP_REQUIRED' } };
  }
  const verified = await verifyLocalEvidenceBackup(backup, local.key);
  if (!verified.ok) return { exitCode: 1, output: { error: verified.error } };
  return { exitCode: verified.value.ok ? 0 : 1, output: verified.value };
}

export async function restoreEvidenceCommand(
  config: AppConfig,
  backup: string | undefined,
): Promise<CommandResult> {
  const local = localStorageOf(config);
  if (local === null) return notConfigured;
  if (backup === undefined || backup.startsWith('--')) {
    return { exitCode: 1, output: { error: 'BACKUP_REQUIRED' } };
  }
  const restored = await restoreLocalEvidence(backup, local.root, local.key);
  return restored.ok
    ? { exitCode: 0, output: restored.value }
    : { exitCode: 1, output: { error: restored.error } };
}

export async function rotateEvidenceKeyCommand(
  config: AppConfig,
  target: string | undefined,
  newKey: Uint8Array,
): Promise<CommandResult> {
  const local = localStorageOf(config);
  if (local === null) return notConfigured;
  if (target === undefined || target.startsWith('--')) {
    return { exitCode: 1, output: { error: 'TARGET_REQUIRED' } };
  }
  const rotated = await reencryptLocalEvidence(local.root, local.key, target, newKey);
  return rotated.ok
    ? { exitCode: 0, output: rotated.value }
    : { exitCode: 1, output: { error: rotated.error } };
}
