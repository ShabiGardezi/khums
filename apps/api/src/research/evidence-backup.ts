import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { EvidenceArtefact } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';

import {
  decryptEvidence,
  EVIDENCE_KEY,
  evidenceKeyId,
  localEncryptedEvidenceStorage,
  sha256Hex,
  type EvidenceStorage,
} from './evidence-storage';

/**
 * Evidence backup, restore and verification (M5.3.3; architecture §4.3). Backups copy the
 * ENCRYPTED files (the key is never needed or written to make one) with a manifest of ciphertext
 * hashes; a restore re-checks those hashes before copying. A verification run decrypts every
 * artefact's bytes and re-checks the SHA-256 and size recorded in MongoDB, so a restore drill is:
 * back up, restore into an empty directory, verify every artefact against the restored copy.
 * Reports hold ids, keys and codes only (never content).
 */

export interface EvidenceVerificationReport {
  readonly checked: number;
  readonly verified: number;
  /** Artefacts whose bytes are missing from storage. */
  readonly missing: readonly string[];
  /** Artefacts whose stored bytes failed authenticated decryption. */
  readonly integrityFailures: readonly string[];
  /** Artefacts whose decrypted bytes do not match the recorded SHA-256 or size. */
  readonly digestMismatches: readonly string[];
  /** Stored keys no artefact refers to (e.g. bytes stored before a transaction that then failed). */
  readonly unreferencedKeys: readonly string[];
  readonly ok: boolean;
}

export async function verifyEvidence(
  storage: EvidenceStorage,
  artefacts: readonly EvidenceArtefact[],
): Promise<Result<EvidenceVerificationReport, 'UNAVAILABLE'>> {
  const missing: string[] = [];
  const integrityFailures: string[] = [];
  const digestMismatches: string[] = [];
  let verified = 0;
  for (const artefact of artefacts) {
    const bytes = await storage.get(artefact.storageKey);
    if (!bytes.ok) {
      if (bytes.error === 'UNAVAILABLE') return err('UNAVAILABLE');
      (bytes.error === 'NOT_FOUND' ? missing : integrityFailures).push(artefact.artefactId);
      continue;
    }
    if (sha256Hex(bytes.value) !== artefact.digest || bytes.value.length !== artefact.size) {
      digestMismatches.push(artefact.artefactId);
      continue;
    }
    verified += 1;
  }
  const keys = await storage.keys();
  if (!keys.ok) return err('UNAVAILABLE');
  const referenced = new Set(artefacts.map((a) => a.storageKey));
  const unreferencedKeys = keys.value.filter((key) => !referenced.has(key));
  return ok({
    checked: artefacts.length,
    verified,
    missing,
    integrityFailures,
    digestMismatches,
    unreferencedKeys,
    ok: missing.length === 0 && integrityFailures.length === 0 && digestMismatches.length === 0,
  });
}

const MANIFEST = 'manifest.json';
const FORMAT = 'khums-evidence-backup/v1';
const EXTENSION = '.kev';

interface ManifestEntry {
  readonly key: string;
  readonly ciphertextSha256: string;
  readonly size: number;
  /** Which key encrypted the file (a non-secret id; the key itself is never in a backup). */
  readonly keyId: string;
}

/** The key id recorded in an encrypted file's header (after the 4-byte magic). */
const keyIdOf = (file: Uint8Array) => Buffer.from(file.subarray(4, 20)).toString('ascii');

const fileHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function isEmptyOrMissing(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length === 0;
  } catch (error) {
    return (error as { code?: unknown }).code === 'ENOENT';
  }
}

/** Copies every encrypted file under `root` to the EMPTY directory `target`, with a manifest. */
export async function backupLocalEvidence(
  root: string,
  storage: EvidenceStorage,
  target: string,
): Promise<Result<{ readonly files: number }, 'TARGET_NOT_EMPTY' | 'UNAVAILABLE'>> {
  if (!(await isEmptyOrMissing(target))) return err('TARGET_NOT_EMPTY');
  const keys = await storage.keys();
  if (!keys.ok) return err('UNAVAILABLE');
  const entries: ManifestEntry[] = [];
  try {
    for (const key of keys.value) {
      const [marja] = key.split('/');
      await mkdir(join(target, marja ?? ''), { recursive: true, mode: 0o700 });
      const from = join(root, `${key}${EXTENSION}`);
      const to = join(target, `${key}${EXTENSION}`);
      await copyFile(from, to);
      const copied = await readFile(to);
      if (fileHash(copied) !== fileHash(await readFile(from))) return err('UNAVAILABLE');
      entries.push({
        key,
        ciphertextSha256: fileHash(copied),
        size: copied.length,
        keyId: keyIdOf(copied),
      });
    }
    await writeFile(
      join(target, MANIFEST),
      `${JSON.stringify({ format: FORMAT, files: entries }, null, 2)}\n`,
      { mode: 0o600 },
    );
    return ok({ files: entries.length });
  } catch {
    return err('UNAVAILABLE');
  }
}

export interface BackupVerificationReport {
  readonly files: number;
  readonly verified: number;
  /** Missing, or ciphertext different from the manifest. */
  readonly corrupt: readonly string[];
  /** Ciphertext intact but authenticated decryption failed (wrong key, or a moved file). */
  readonly undecryptable: readonly string[];
  /** Decrypted, but the plaintext's SHA-256 is not the digest in its storage key. */
  readonly digestMismatches: readonly string[];
  readonly ok: boolean;
}

async function readManifest(
  backup: string,
): Promise<Result<readonly ManifestEntry[], 'MANIFEST_INVALID'>> {
  let manifest: { format?: unknown; files?: unknown };
  try {
    manifest = JSON.parse(await readFile(join(backup, MANIFEST), 'utf8')) as typeof manifest;
  } catch {
    return err('MANIFEST_INVALID');
  }
  if (manifest.format !== FORMAT || !Array.isArray(manifest.files)) return err('MANIFEST_INVALID');
  const entries: ManifestEntry[] = [];
  for (const raw of manifest.files as unknown[]) {
    const entry = raw as Partial<ManifestEntry> | null;
    if (
      typeof entry?.key !== 'string' ||
      !EVIDENCE_KEY.test(entry.key) ||
      typeof entry.ciphertextSha256 !== 'string'
    ) {
      return err('MANIFEST_INVALID');
    }
    entries.push(entry as ManifestEntry);
  }
  return ok(entries);
}

/**
 * Verifies a backup WITHOUT restoring it: every file is present with the manifest's ciphertext
 * hash, decrypts with `key` (authenticated, bound to its storage key), and its plaintext hashes to
 * the digest in its storage key. Run it on every new backup and before every restore.
 */
export async function verifyLocalEvidenceBackup(
  backup: string,
  key: Uint8Array,
): Promise<Result<BackupVerificationReport, 'MANIFEST_INVALID'>> {
  const entries = await readManifest(backup);
  if (!entries.ok) return entries;
  const corrupt: string[] = [];
  const undecryptable: string[] = [];
  const digestMismatches: string[] = [];
  for (const entry of entries.value) {
    let bytes: Buffer;
    try {
      bytes = await readFile(join(backup, `${entry.key}${EXTENSION}`));
    } catch {
      corrupt.push(entry.key);
      continue;
    }
    if (fileHash(bytes) !== entry.ciphertextSha256) {
      corrupt.push(entry.key);
      continue;
    }
    const plaintext = decryptEvidence(key, entry.key, bytes);
    if (plaintext === null) {
      undecryptable.push(entry.key);
      continue;
    }
    if (sha256Hex(plaintext) !== entry.key.split('/')[1]) digestMismatches.push(entry.key);
  }
  const bad = corrupt.length + undecryptable.length + digestMismatches.length;
  return ok({
    files: entries.value.length,
    verified: entries.value.length - bad,
    corrupt,
    undecryptable,
    digestMismatches,
    ok: bad === 0,
  });
}

export type RestoreError =
  /** The manifest is missing or not a valid evidence backup manifest. */
  | 'MANIFEST_INVALID'
  /** A backed-up file is missing, altered, undecryptable with the key, or not its digest. */
  | 'BACKUP_INVALID'
  /** The target already holds different bytes under a key (never overwritten). */
  | 'TARGET_CONFLICT'
  | 'UNAVAILABLE';

/**
 * Restores a backup into `root` after verifying ALL of it with `key` (ciphertext hashes,
 * authenticated decryption and plaintext digests); nothing is written unless everything verifies.
 * Files that already exist must be identical; nothing is overwritten.
 */
export async function restoreLocalEvidence(
  backup: string,
  root: string,
  key: Uint8Array,
): Promise<Result<{ readonly files: number }, RestoreError>> {
  const verified = await verifyLocalEvidenceBackup(backup, key);
  if (!verified.ok) return err('MANIFEST_INVALID');
  if (!verified.value.ok) return err('BACKUP_INVALID');
  const entries = await readManifest(backup);
  if (!entries.ok) return err('MANIFEST_INVALID');
  try {
    for (const entry of entries.value) {
      const bytes = await readFile(join(backup, `${entry.key}${EXTENSION}`));
      const path = join(root, `${entry.key}${EXTENSION}`);
      let existing: Buffer | null = null;
      try {
        existing = await readFile(path);
      } catch {
        existing = null;
      }
      if (existing !== null) {
        if (!existing.equals(bytes)) return err('TARGET_CONFLICT');
        continue;
      }
      await mkdir(join(root, entry.key.split('/')[0] ?? ''), { recursive: true, mode: 0o700 });
      await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
    }
    return ok({ files: entries.value.length });
  } catch {
    return err('UNAVAILABLE');
  }
}

export type RotationError =
  | 'TARGET_NOT_EMPTY'
  | 'SAME_KEY'
  /** A source file failed authenticated decryption with the old key, or its digest: nothing usable was produced. */
  | 'SOURCE_INVALID'
  /** A re-encrypted file did not verify with the new key. */
  | 'VERIFICATION_FAILED'
  | 'UNAVAILABLE';

/**
 * Key rotation (no new infrastructure): decrypts every file under `sourceRoot` with `oldKey`,
 * checks its plaintext digest, re-encrypts it with `newKey` into the EMPTY directory `targetRoot`,
 * then verifies every new file with `newKey`. The source directory is never modified; the operator
 * switches `KHUMS_EVIDENCE_DIR`/`KHUMS_EVIDENCE_KEY` only after this succeeds, and keeps the old
 * directory and key until a verified backup of the new directory exists.
 */
export async function reencryptLocalEvidence(
  sourceRoot: string,
  oldKey: Uint8Array,
  targetRoot: string,
  newKey: Uint8Array,
): Promise<Result<{ readonly files: number; readonly keyId: string }, RotationError>> {
  if (evidenceKeyId(oldKey) === evidenceKeyId(newKey)) return err('SAME_KEY');
  if (!(await isEmptyOrMissing(targetRoot))) return err('TARGET_NOT_EMPTY');
  const source = localEncryptedEvidenceStorage(sourceRoot, oldKey);
  const target = localEncryptedEvidenceStorage(targetRoot, newKey);
  const keys = await source.keys();
  if (!keys.ok) return err('UNAVAILABLE');
  for (const key of keys.value) {
    const bytes = await source.get(key);
    if (!bytes.ok) return err(bytes.error === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'SOURCE_INVALID');
    if (sha256Hex(bytes.value) !== key.split('/')[1]) return err('SOURCE_INVALID');
    const stored = await target.put(key, bytes.value);
    if (!stored.ok) return err('UNAVAILABLE');
  }
  for (const key of keys.value) {
    const check = await target.get(key);
    if (!check.ok || sha256Hex(check.value) !== key.split('/')[1]) {
      return err('VERIFICATION_FAILED');
    }
  }
  return ok({ files: keys.value.length, keyId: evidenceKeyId(newKey) });
}
