import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readdir, readFile, rename, rm, stat, unlink, utimes } from 'node:fs/promises';
import { join } from 'node:path';

import { err, ok, type Result } from '@khums/utils';

/**
 * Private evidence storage (M5.3.3; docs/SCHOLAR_RESEARCH_ARCHITECTURE.md §4.3). Provider
 * independent: MongoDB holds only metadata, the SHA-256 and the immutable storage key
 * (`${marjaId}/${digest}`); the bytes live behind this interface. Callers re-verify SHA-256 on
 * EVERY retrieval (`EvidenceService`); a provider never decides integrity on its own.
 *
 * Providers:
 * - `LOCAL_ENCRYPTED`: AES-256-GCM files in an operator-managed directory (development and
 *   maintainer machines). Durable only if that directory is on persistent, backed-up storage; it
 *   is refused in production (Render's filesystem is ephemeral), see `selectEvidenceStorage`.
 * - `MEMORY`: development/test only; lost on restart.
 * - `UNAVAILABLE`: every call fails closed (production until an approved durable provider exists).
 */

export type EvidenceStorageKind = 'LOCAL_ENCRYPTED' | 'MEMORY' | 'UNAVAILABLE';

export type EvidenceGetError =
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  /** Stored bytes failed authenticated decryption (tampered, swapped or wrong key). */
  | 'INTEGRITY';

export interface EvidenceStorage {
  readonly kind: EvidenceStorageKind;
  /** Stores the bytes under `key`. Idempotent: the same bytes again succeed; different bytes are `KEY_CONFLICT`. */
  put(key: string, bytes: Uint8Array): Promise<Result<void, 'UNAVAILABLE' | 'KEY_CONFLICT'>>;
  get(key: string): Promise<Result<Uint8Array, EvidenceGetError>>;
  /** Every stored key (verification, backup drills and the orphan inventory). */
  keys(): Promise<Result<readonly string[], 'UNAVAILABLE'>>;
  /**
   * When the bytes under `key` were last written or re-stored (ms). `put` of bytes that are already
   * stored refreshes it, so a re-upload of an orphaned file restarts its grace period.
   */
  stat(key: string): Promise<Result<{ readonly storedAt: number }, 'NOT_FOUND' | 'UNAVAILABLE'>>;
  /**
   * Removes the bytes under `key`. Used ONLY by the operator-confirmed orphan cleanup
   * (`deleteEvidenceOrphans`), which re-checks that no artefact refers to the key first.
   */
  remove(key: string): Promise<Result<void, 'NOT_FOUND' | 'UNAVAILABLE'>>;
}

/** `${marjaId}/${sha256}`: also what keeps file paths inside the storage root. */
export const EVIDENCE_KEY = /^[a-z][a-z0-9-]{0,62}\/[0-9a-f]{64}$/;

export const sha256Hex = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

const sameBytes = (a: Uint8Array, b: Uint8Array) => sha256Hex(a) === sha256Hex(b);

/** DEVELOPMENT/TEST ONLY: process memory (copies in and out). Lost on restart. */
export function memoryEvidenceStorage(now: () => number = Date.now): EvidenceStorage & {
  /** TEST ONLY: replaces stored bytes (tamper simulation). */
  tamper(key: string, bytes: Uint8Array): void;
} {
  const blobs = new Map<string, { bytes: Uint8Array; storedAt: number }>();
  return {
    kind: 'MEMORY',
    put: (key, bytes) => {
      if (!EVIDENCE_KEY.test(key)) return Promise.resolve(err('UNAVAILABLE'));
      const existing = blobs.get(key);
      if (existing !== undefined) {
        if (!sameBytes(existing.bytes, bytes)) return Promise.resolve(err('KEY_CONFLICT'));
        existing.storedAt = now();
        return Promise.resolve(ok(undefined));
      }
      blobs.set(key, { bytes: Uint8Array.from(bytes), storedAt: now() });
      return Promise.resolve(ok(undefined));
    },
    get: (key) => {
      const found = blobs.get(key);
      return Promise.resolve(
        found === undefined ? err('NOT_FOUND') : ok(Uint8Array.from(found.bytes)),
      );
    },
    keys: () => Promise.resolve(ok([...blobs.keys()].sort())),
    stat: (key) => {
      const found = blobs.get(key);
      return Promise.resolve(
        found === undefined ? err('NOT_FOUND') : ok({ storedAt: found.storedAt }),
      );
    },
    remove: (key) => Promise.resolve(blobs.delete(key) ? ok(undefined) : err('NOT_FOUND')),
    tamper: (key, bytes) => {
      const found = blobs.get(key);
      blobs.set(key, { bytes: Uint8Array.from(bytes), storedAt: found?.storedAt ?? now() });
    },
  };
}

/** No storage configured: nothing is accepted, returned or removed. */
export function unavailableEvidenceStorage(): EvidenceStorage {
  return {
    kind: 'UNAVAILABLE',
    put: () => Promise.resolve(err('UNAVAILABLE')),
    get: () => Promise.resolve(err('UNAVAILABLE')),
    keys: () => Promise.resolve(err('UNAVAILABLE')),
    stat: () => Promise.resolve(err('UNAVAILABLE')),
    remove: () => Promise.resolve(err('UNAVAILABLE')),
  };
}

// ---- Local encrypted provider ----

const MAGIC = Buffer.from('KEV1', 'ascii');
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const EXTENSION = '.kev';

/** A non-secret identifier of the key (which key encrypted a file), never the key itself. */
export const evidenceKeyId = (key: Uint8Array): string =>
  createHash('sha256').update('khums-evidence-key-id:v1').update(key).digest('hex').slice(0, 16);

/** Binds the ciphertext to its storage key: a file moved to another key fails to decrypt. */
const aadFor = (storageKey: string) => `khums-evidence:v1:${storageKey}`;

/**
 * Sealed format shared by evidence files and pre-production backups: `KEV1` | key id (16 ASCII) |
 * nonce (12) | tag (16) | ciphertext. AES-256-GCM with a fresh random nonce and caller-supplied
 * additional authenticated data (`aad`), which binds the ciphertext to its purpose and name.
 */
export function sealBytes(key: Uint8Array, aad: string, plaintext: Uint8Array): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([
    MAGIC,
    Buffer.from(evidenceKeyId(key), 'ascii'),
    nonce,
    cipher.getAuthTag(),
    ciphertext,
  ]);
}

/** Opens and authenticates a sealed blob; null on any mismatch (format, key id, tag, aad). */
export function openBytes(key: Uint8Array, aad: string, file: Uint8Array): Buffer | null {
  const data = Buffer.from(file);
  const header = MAGIC.length + 16 + NONCE_BYTES + TAG_BYTES;
  if (data.length < header || !data.subarray(0, MAGIC.length).equals(MAGIC)) return null;
  const keyId = data.subarray(MAGIC.length, MAGIC.length + 16).toString('ascii');
  if (keyId !== evidenceKeyId(key)) return null;
  const nonceStart = MAGIC.length + 16;
  const nonce = data.subarray(nonceStart, nonceStart + NONCE_BYTES);
  const tag = data.subarray(nonceStart + NONCE_BYTES, header);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data.subarray(header)), decipher.final()]);
  } catch {
    return null;
  }
}

/** The key id recorded in a sealed blob's header (non-secret), or null. */
export const sealedKeyId = (file: Uint8Array): string | null =>
  file.length >= MAGIC.length + 16 && Buffer.from(file.subarray(0, 4)).equals(MAGIC)
    ? Buffer.from(file.subarray(4, 20)).toString('ascii')
    : null;

/** Encrypts an evidence file under its storage key. */
export function encryptEvidence(
  key: Uint8Array,
  storageKey: string,
  plaintext: Uint8Array,
): Buffer {
  return sealBytes(key, aadFor(storageKey), plaintext);
}

/** Decrypts and authenticates an evidence file; null on any mismatch. */
export function decryptEvidence(
  key: Uint8Array,
  storageKey: string,
  file: Uint8Array,
): Buffer | null {
  return openBytes(key, aadFor(storageKey), file);
}

const isNotFound = (error: unknown) => (error as { code?: unknown } | null)?.code === 'ENOENT';

/** Writes a file atomically (temporary file, fsync, rename), readable by the owner only. */
async function writeAtomically(path: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${path}.tmp-${randomBytes(8).toString('hex')}`;
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
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/**
 * AES-256-GCM files under `root` (`<root>/<marjaId>/<sha256>.kev`, directories 0700, files 0600).
 * The key comes from the validated configuration and is never logged or written to disk.
 */
export function localEncryptedEvidenceStorage(
  root: string,
  key: Uint8Array,
  now: () => number = Date.now,
): EvidenceStorage {
  if (key.length !== 32) throw new RangeError('the evidence key must be 32 bytes');
  const pathOf = (storageKey: string) => join(root, `${storageKey}${EXTENSION}`);
  const read = async (storageKey: string): Promise<Result<Uint8Array, EvidenceGetError>> => {
    if (!EVIDENCE_KEY.test(storageKey)) return err('NOT_FOUND');
    let file: Buffer;
    try {
      file = await readFile(pathOf(storageKey));
    } catch (error) {
      return err(isNotFound(error) ? 'NOT_FOUND' : 'UNAVAILABLE');
    }
    const plaintext = decryptEvidence(key, storageKey, file);
    return plaintext === null ? err('INTEGRITY') : ok(new Uint8Array(plaintext));
  };
  return {
    kind: 'LOCAL_ENCRYPTED',
    put: async (storageKey, bytes) => {
      if (!EVIDENCE_KEY.test(storageKey)) return err('UNAVAILABLE');
      const existing = await read(storageKey);
      if (existing.ok) {
        if (!sameBytes(existing.value, bytes)) return err('KEY_CONFLICT');
        // Re-stored: refresh the time so an orphan's grace period restarts (cleanup race guard).
        try {
          const at = new Date(now());
          await utimes(pathOf(storageKey), at, at);
          return ok(undefined);
        } catch {
          return err('UNAVAILABLE');
        }
      }
      if (existing.error === 'INTEGRITY') return err('KEY_CONFLICT');
      if (existing.error === 'UNAVAILABLE') return err('UNAVAILABLE');
      try {
        await mkdir(join(root, storageKey.split('/')[0] ?? ''), { recursive: true, mode: 0o700 });
        await writeAtomically(pathOf(storageKey), encryptEvidence(key, storageKey, bytes));
        // The stored time follows the provider's clock (grace periods are measured on it).
        const at = new Date(now());
        await utimes(pathOf(storageKey), at, at);
        return ok(undefined);
      } catch {
        return err('UNAVAILABLE');
      }
    },
    get: read,
    stat: async (storageKey) => {
      if (!EVIDENCE_KEY.test(storageKey)) return err('NOT_FOUND');
      try {
        return ok({ storedAt: (await stat(pathOf(storageKey))).mtimeMs });
      } catch (error) {
        return err(isNotFound(error) ? 'NOT_FOUND' : 'UNAVAILABLE');
      }
    },
    remove: async (storageKey) => {
      if (!EVIDENCE_KEY.test(storageKey)) return err('NOT_FOUND');
      try {
        await unlink(pathOf(storageKey));
        return ok(undefined);
      } catch (error) {
        return err(isNotFound(error) ? 'NOT_FOUND' : 'UNAVAILABLE');
      }
    },
    keys: async () => {
      try {
        const keys: string[] = [];
        for (const marja of await readdir(root, { withFileTypes: true })) {
          if (!marja.isDirectory()) continue;
          for (const file of await readdir(join(root, marja.name))) {
            if (!file.endsWith(EXTENSION)) continue;
            const storageKey = `${marja.name}/${file.slice(0, -EXTENSION.length)}`;
            if (EVIDENCE_KEY.test(storageKey)) keys.push(storageKey);
          }
        }
        return ok(keys.sort());
      } catch (error) {
        return isNotFound(error) ? ok([]) : err('UNAVAILABLE');
      }
    },
  };
}
