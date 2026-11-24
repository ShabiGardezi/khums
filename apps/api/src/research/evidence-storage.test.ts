import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { EvidenceArtefact } from '@khums/shared-types';

import { loadConfig } from '../config';
import {
  backupLocalEvidence,
  reencryptLocalEvidence,
  restoreLocalEvidence,
  verifyEvidence,
  verifyLocalEvidenceBackup,
} from './evidence-backup';
import {
  decryptEvidence,
  encryptEvidence,
  evidenceKeyId,
  localEncryptedEvidenceStorage,
  memoryEvidenceStorage,
  sha256Hex,
  unavailableEvidenceStorage,
} from './evidence-storage';
import { selectEvidenceStorage } from './evidence-tokens';

/**
 * Evidence storage (M5.3.3): AES-256-GCM files, tamper detection, idempotence, and a full backup →
 * restore → verify drill. SYNTHETIC bytes only; every file lives in a temporary directory.
 */

const KEY = new Uint8Array(randomBytes(32));
const BYTES = new TextEncoder().encode('TEST evidence bytes — synthetic, not a real source');
const KEY_OF = (bytes: Uint8Array, marja = 'sistani') => `${marja}/${sha256Hex(bytes)}`;

const dirs: string[] = [];
async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'khums-evidence-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

const artefactFor = (bytes: Uint8Array, id: string, marja = 'sistani'): EvidenceArtefact => ({
  artefactId: id,
  marjaId: marja,
  sourceId: '01936b2e-7c4a-7d3e-9f10-1a2b3c4d5e6f',
  sourceRevision: 0,
  digest: sha256Hex(bytes),
  size: bytes.length,
  mediaType: 'text/plain',
  storageKey: KEY_OF(bytes, marja),
  copyright: 'EXCERPTS_ONLY',
  extent: 'EXCERPT',
  description: 'TEST',
  recordedBy: 'test-scholar',
  recordedAt: '2026-11-22T10:00:00.000Z',
  decisionId: 'd',
  requestId: 'r',
});

describe('AES-256-GCM evidence encryption', () => {
  it('round-trips, never stores the plaintext, and binds the file to its key and storage key', () => {
    const storageKey = KEY_OF(BYTES);
    const file = encryptEvidence(KEY, storageKey, BYTES);
    expect(file.includes(Buffer.from(BYTES))).toBe(false);
    expect(decryptEvidence(KEY, storageKey, file)?.equals(Buffer.from(BYTES))).toBe(true);
    // Fresh nonce: encrypting twice gives different files.
    expect(encryptEvidence(KEY, storageKey, BYTES).equals(file)).toBe(false);
    // Wrong key, another storage key (a swapped file), or one flipped bit: refused.
    expect(decryptEvidence(new Uint8Array(randomBytes(32)), storageKey, file)).toBeNull();
    expect(decryptEvidence(KEY, KEY_OF(BYTES, 'khamenei'), file)).toBeNull();
    const flipped = Buffer.from(file);
    flipped[flipped.length - 1] = (flipped[flipped.length - 1] ?? 0) ^ 1;
    expect(decryptEvidence(KEY, storageKey, flipped)).toBeNull();
    expect(decryptEvidence(KEY, storageKey, file.subarray(0, 10))).toBeNull();
  });
});

describe('local encrypted provider', () => {
  it('stores owner-only encrypted files, idempotently, and lists keys', async () => {
    const root = await tempDir();
    const storage = localEncryptedEvidenceStorage(root, KEY);
    const key = KEY_OF(BYTES);
    expect((await storage.put(key, BYTES)).ok).toBe(true);
    expect((await storage.put(key, BYTES)).ok).toBe(true);
    const got = await storage.get(key);
    expect(got.ok && Buffer.from(got.value).equals(Buffer.from(BYTES))).toBe(true);
    const path = join(root, `${key}.kev`);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(root, 'sistani'))).mode & 0o777).toBe(0o700);
    expect((await readFile(path)).includes(Buffer.from(BYTES))).toBe(false);
    expect(await storage.keys()).toEqual({ ok: true, value: [key] });
    // No temporary files left behind.
    expect(await readdir(join(root, 'sistani'))).toEqual([`${sha256Hex(BYTES)}.kev`]);
  });

  it('refuses different bytes under an existing key, unknown keys and traversal', async () => {
    const root = await tempDir();
    const storage = localEncryptedEvidenceStorage(root, KEY);
    const key = KEY_OF(BYTES);
    await storage.put(key, BYTES);
    expect(await storage.put(key, new TextEncoder().encode('other'))).toEqual({
      ok: false,
      error: 'KEY_CONFLICT',
    });
    expect(await storage.get(KEY_OF(new TextEncoder().encode('missing')))).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect((await storage.put('../escape/x', BYTES)).ok).toBe(false);
    expect(await storage.get(`../${key}`)).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(() => localEncryptedEvidenceStorage(root, new Uint8Array(16))).toThrow();
  });

  it('reports tampered, swapped or wrong-key files as integrity failures', async () => {
    const root = await tempDir();
    const storage = localEncryptedEvidenceStorage(root, KEY);
    const a = KEY_OF(BYTES);
    const otherBytes = new TextEncoder().encode('TEST other synthetic file');
    const b = KEY_OF(otherBytes);
    await storage.put(a, BYTES);
    await storage.put(b, otherBytes);
    // Swap the two files on disk.
    const fileA = await readFile(join(root, `${a}.kev`));
    await writeFile(join(root, `${b}.kev`), fileA);
    expect(await storage.get(b)).toEqual({ ok: false, error: 'INTEGRITY' });
    expect(
      await localEncryptedEvidenceStorage(root, new Uint8Array(randomBytes(32))).get(a),
    ).toEqual({
      ok: false,
      error: 'INTEGRITY',
    });
  });
});

describe('verification, backup and restore drill', () => {
  it('backs up encrypted files, restores them into an empty directory, and verifies every digest', async () => {
    const root = await tempDir();
    const storage = localEncryptedEvidenceStorage(root, KEY);
    const second = new TextEncoder().encode('TEST second synthetic file');
    const artefacts = [
      artefactFor(BYTES, '01936b2e-7c4a-7d3e-9f10-000000000001'),
      artefactFor(second, '01936b2e-7c4a-7d3e-9f10-000000000002', 'khamenei'),
    ];
    await storage.put(artefacts[0]?.storageKey ?? '', BYTES);
    await storage.put(artefacts[1]?.storageKey ?? '', second);
    const verified = await verifyEvidence(storage, artefacts);
    expect(verified.ok && verified.value).toMatchObject({ checked: 2, verified: 2, ok: true });

    const backup = await tempDir();
    expect(await backupLocalEvidence(root, storage, backup)).toEqual({
      ok: true,
      value: { files: 2 },
    });
    // The backup holds ciphertext only.
    const manifest = await readFile(join(backup, 'manifest.json'), 'utf8');
    expect(manifest).toContain('khums-evidence-backup/v1');
    expect(
      (await readFile(join(backup, `${artefacts[0]?.storageKey ?? ''}.kev`))).includes(
        Buffer.from(BYTES),
      ),
    ).toBe(false);
    expect(await backupLocalEvidence(root, storage, backup)).toEqual({
      ok: false,
      error: 'TARGET_NOT_EMPTY',
    });

    const restoredRoot = await tempDir();
    expect(await restoreLocalEvidence(backup, restoredRoot, KEY)).toEqual({
      ok: true,
      value: { files: 2 },
    });
    const restored = await verifyEvidence(
      localEncryptedEvidenceStorage(restoredRoot, KEY),
      artefacts,
    );
    expect(restored.ok && restored.value).toMatchObject({
      verified: 2,
      ok: true,
      unreferencedKeys: [],
    });
    // Restoring again is a no-op (identical files are kept, nothing is overwritten).
    expect(await restoreLocalEvidence(backup, restoredRoot, KEY)).toEqual({
      ok: true,
      value: { files: 2 },
    });
  });

  it('refuses corrupt backups and conflicting targets', async () => {
    const root = await tempDir();
    const storage = localEncryptedEvidenceStorage(root, KEY);
    const key = KEY_OF(BYTES);
    await storage.put(key, BYTES);
    const backup = await tempDir();
    await backupLocalEvidence(root, storage, backup);
    await writeFile(join(backup, `${key}.kev`), 'corrupted');
    expect(await restoreLocalEvidence(backup, await tempDir(), KEY)).toEqual({
      ok: false,
      error: 'BACKUP_INVALID',
    });
    expect(await restoreLocalEvidence(await tempDir(), await tempDir(), KEY)).toEqual({
      ok: false,
      error: 'MANIFEST_INVALID',
    });

    const fresh = await tempDir();
    await backupLocalEvidence(root, storage, fresh);
    const conflicting = await tempDir();
    const other = localEncryptedEvidenceStorage(conflicting, KEY);
    await other.put(key, BYTES); // a different ciphertext (fresh nonce) under the same key
    expect(await restoreLocalEvidence(fresh, conflicting, KEY)).toEqual({
      ok: false,
      error: 'TARGET_CONFLICT',
    });
  });

  it('reports missing, tampered and mismatched evidence, and unreferenced bytes', async () => {
    const storage = memoryEvidenceStorage();
    const good = artefactFor(BYTES, '01936b2e-7c4a-7d3e-9f10-000000000001');
    const missing = artefactFor(
      new TextEncoder().encode('never stored'),
      '01936b2e-7c4a-7d3e-9f10-000000000002',
    );
    const tampered = artefactFor(
      new TextEncoder().encode('to be tampered'),
      '01936b2e-7c4a-7d3e-9f10-000000000003',
    );
    await storage.put(good.storageKey, BYTES);
    await storage.put(tampered.storageKey, new TextEncoder().encode('to be tampered'));
    storage.tamper(tampered.storageKey, new TextEncoder().encode('changed bytes'));
    const orphan = KEY_OF(new TextEncoder().encode('orphan'));
    await storage.put(orphan, new TextEncoder().encode('orphan'));
    const report = await verifyEvidence(storage, [good, missing, tampered]);
    expect(report.ok && report.value).toMatchObject({
      checked: 3,
      verified: 1,
      missing: [missing.artefactId],
      digestMismatches: [tampered.artefactId],
      unreferencedKeys: [orphan],
      ok: false,
    });
    expect(await verifyEvidence(unavailableEvidenceStorage(), [good])).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    });
  });
});

describe('key recovery: decrypt-verified backups, restore with the right key only, rotation', () => {
  it('verifies backups by ciphertext hash, authenticated decryption and digest; keys never in a backup', async () => {
    const root = await tempDir();
    const storage = localEncryptedEvidenceStorage(root, KEY);
    const key = KEY_OF(BYTES);
    await storage.put(key, BYTES);
    const backup = await tempDir();
    await backupLocalEvidence(root, storage, backup);
    expect(await verifyLocalEvidenceBackup(backup, KEY)).toEqual({
      ok: true,
      value: {
        files: 1,
        verified: 1,
        corrupt: [],
        undecryptable: [],
        digestMismatches: [],
        ok: true,
      },
    });
    // The manifest names the (non-secret) key id; no file in the backup contains the key.
    const manifest = JSON.parse(await readFile(join(backup, 'manifest.json'), 'utf8')) as {
      files: { keyId: string }[];
    };
    expect(manifest.files[0]?.keyId).toBe(evidenceKeyId(KEY));
    const keyBase64 = Buffer.from(KEY).toString('base64');
    for (const file of [join(backup, 'manifest.json'), join(backup, `${key}.kev`)]) {
      const content = await readFile(file);
      expect(content.includes(Buffer.from(KEY))).toBe(false);
      expect(content.toString('latin1')).not.toContain(keyBase64);
    }
    // Wrong key: reported as undecryptable, and a restore writes nothing.
    const wrong = new Uint8Array(randomBytes(32));
    const report = await verifyLocalEvidenceBackup(backup, wrong);
    expect(report.ok && report.value).toMatchObject({ undecryptable: [key], ok: false });
    const target = await tempDir();
    expect(await restoreLocalEvidence(backup, target, wrong)).toEqual({
      ok: false,
      error: 'BACKUP_INVALID',
    });
    expect(await readdir(target)).toEqual([]);
  });

  it('rotates the key by re-encrypting into a new directory, verified; the old one is untouched', async () => {
    const root = await tempDir();
    const storage = localEncryptedEvidenceStorage(root, KEY);
    const second = new TextEncoder().encode('TEST second synthetic file');
    await storage.put(KEY_OF(BYTES), BYTES);
    await storage.put(KEY_OF(second, 'khamenei'), second);
    const newKey = new Uint8Array(randomBytes(32));
    const target = await tempDir();
    expect(await reencryptLocalEvidence(root, KEY, target, newKey)).toEqual({
      ok: true,
      value: { files: 2, keyId: evidenceKeyId(newKey) },
    });
    const rotated = localEncryptedEvidenceStorage(target, newKey);
    const got = await rotated.get(KEY_OF(second, 'khamenei'));
    expect(got.ok && Buffer.from(got.value).equals(Buffer.from(second))).toBe(true);
    // The old key cannot read the new files; the old directory still reads with the old key.
    expect(await localEncryptedEvidenceStorage(target, KEY).get(KEY_OF(BYTES))).toEqual({
      ok: false,
      error: 'INTEGRITY',
    });
    expect((await storage.get(KEY_OF(BYTES))).ok).toBe(true);
    expect(await reencryptLocalEvidence(root, KEY, target, newKey)).toEqual({
      ok: false,
      error: 'TARGET_NOT_EMPTY',
    });
    expect(await reencryptLocalEvidence(root, KEY, await tempDir(), KEY)).toEqual({
      ok: false,
      error: 'SAME_KEY',
    });
    expect(await reencryptLocalEvidence(root, newKey, await tempDir(), KEY)).toEqual({
      ok: false,
      error: 'SOURCE_INVALID',
    });
  });

  it('refreshes the stored time when the same bytes are stored again (grace period restart)', async () => {
    let now = Date.parse('2026-11-01T00:00:00.000Z');
    const root = await tempDir();
    const storage = localEncryptedEvidenceStorage(root, KEY, () => now);
    const key = KEY_OF(BYTES);
    await storage.put(key, BYTES);
    const first = await storage.stat(key);
    now += 10 * 24 * 60 * 60 * 1000;
    await storage.put(key, BYTES);
    const second = await storage.stat(key);
    expect(first.ok && second.ok && second.value.storedAt - first.value.storedAt).toBeGreaterThan(
      0,
    );
    expect(second.ok && Math.abs(second.value.storedAt - now)).toBeLessThan(1000);
    expect((await storage.remove(key)).ok).toBe(true);
    expect(await storage.remove(key)).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await storage.stat(key)).toEqual({ ok: false, error: 'NOT_FOUND' });
  });
});

describe('provider selection and configuration', () => {
  const base = { NODE_ENV: 'development', LOG_LEVEL: 'silent' };
  const key = randomBytes(32).toString('base64');

  it('uses memory by default and the local encrypted provider when configured', () => {
    const memory = loadConfig(base);
    expect(memory.ok && selectEvidenceStorage(memory.value).kind).toBe('MEMORY');
    const local = loadConfig({
      ...base,
      KHUMS_EVIDENCE_DIR: '/tmp/khums-evidence-test',
      KHUMS_EVIDENCE_KEY: key,
    });
    expect(local.ok && selectEvidenceStorage(local.value).kind).toBe('LOCAL_ENCRYPTED');
  });

  it('refuses partial, malformed or production local storage (never claims durability on Render)', () => {
    for (const env of [
      { ...base, KHUMS_EVIDENCE_DIR: '/tmp/x' },
      { ...base, KHUMS_EVIDENCE_KEY: key },
      { ...base, KHUMS_EVIDENCE_DIR: 'relative/dir', KHUMS_EVIDENCE_KEY: key },
      {
        ...base,
        KHUMS_EVIDENCE_DIR: '/tmp/x',
        KHUMS_EVIDENCE_KEY: randomBytes(16).toString('base64'),
      },
    ]) {
      expect(loadConfig(env).ok).toBe(false);
    }
    const production = loadConfig({
      NODE_ENV: 'production',
      LOG_LEVEL: 'silent',
      KHUMS_EVIDENCE_DIR: '/var/evidence',
      KHUMS_EVIDENCE_KEY: key,
    });
    expect(production.ok).toBe(false);
    if (!production.ok) {
      expect(production.error.join('\n')).toContain('not allowed in production');
      // The key is never echoed in configuration errors.
      expect(production.error.join('\n')).not.toContain(key);
    }
    const plainProduction = loadConfig({ NODE_ENV: 'production', LOG_LEVEL: 'silent' });
    expect(plainProduction.ok && selectEvidenceStorage(plainProduction.value).kind).toBe(
      'UNAVAILABLE',
    );
  });
});
