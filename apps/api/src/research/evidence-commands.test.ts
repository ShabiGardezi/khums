import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig, loadEvidenceRotationKey, type AppConfig } from '../config';
import {
  backupEvidenceCommand,
  deleteEvidenceOrphansCommand,
  evidenceOrphansCommand,
  graceFromArgs,
  restoreEvidenceCommand,
  rotateEvidenceKeyCommand,
  verifyEvidenceBackupCommand,
} from './evidence-commands';
import { localEncryptedEvidenceStorage, sha256Hex } from './evidence-storage';

/**
 * Evidence operator commands (M5.3.3 hardening) without a database: argument checks, the
 * production refusal, and the local backup → verify → restore and rotation commands. Commands
 * that need the database are covered through their functions in research.service.test.ts.
 */

const dirs: string[] = [];
async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'khums-evidence-cmd-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

const KEY = randomBytes(32).toString('base64');
function configFor(dir: string): AppConfig {
  const config = loadConfig({
    NODE_ENV: 'development',
    LOG_LEVEL: 'silent',
    KHUMS_EVIDENCE_DIR: dir,
    KHUMS_EVIDENCE_KEY: KEY,
  });
  if (!config.ok) throw new Error(config.error.join());
  return config.value;
}
const noDatabase = () => Promise.reject(new Error('no database in this test'));

describe('evidence operator commands', () => {
  it('parse the grace period (default 7 days, at least 1, at most 365)', () => {
    expect(graceFromArgs([])).toBe(7 * 86_400_000);
    expect(graceFromArgs(['--grace-days', '2'])).toBe(2 * 86_400_000);
    for (const bad of ['0', '-1', '1.5', 'x', '366']) {
      expect(graceFromArgs(['--grace-days', bad]), bad).toBeNull();
    }
  });

  it('refuse to run without local evidence storage (production has none)', async () => {
    const production = loadConfig({ NODE_ENV: 'production', LOG_LEVEL: 'silent' });
    if (!production.ok) throw new Error('config');
    for (const result of [
      await evidenceOrphansCommand(production.value, noDatabase, Date.now, 7 * 86_400_000),
      await backupEvidenceCommand(production.value, '/tmp/x'),
      await restoreEvidenceCommand(production.value, '/tmp/x'),
    ]) {
      expect(result).toEqual({ exitCode: 1, output: { error: 'EVIDENCE_STORAGE_NOT_CONFIGURED' } });
    }
  });

  it('validate the keys file before touching the database', async () => {
    const config = configFor(await tempDir());
    const run = (file: string | undefined) =>
      deleteEvidenceOrphansCommand(config, noDatabase, Date.now, 7 * 86_400_000, file, 'x');
    expect(await run(undefined)).toMatchObject({ output: { error: 'KEYS_FILE_REQUIRED' } });
    expect(await run('--confirm')).toMatchObject({ output: { error: 'KEYS_FILE_REQUIRED' } });
    const dir = await tempDir();
    await writeFile(join(dir, 'bad.json'), '{"not":"a list"}');
    expect(await run(join(dir, 'bad.json'))).toMatchObject({
      output: { error: 'KEYS_FILE_INVALID' },
    });
  });

  it('back up (verified), verify and restore; rotate into a new directory', async () => {
    const root = await tempDir();
    const config = configFor(root);
    const bytes = new TextEncoder().encode('TEST synthetic evidence for the command drill');
    const key = `sistani/${sha256Hex(bytes)}`;
    if (config.evidence === null) throw new Error('config');
    await localEncryptedEvidenceStorage(root, config.evidence.key).put(key, bytes);

    const backup = join(await tempDir(), 'backup');
    const made = await backupEvidenceCommand(config, backup);
    expect(made).toMatchObject({ exitCode: 0, output: { files: 1, verification: { ok: true } } });
    expect(await verifyEvidenceBackupCommand(config, backup)).toMatchObject({
      exitCode: 0,
      output: { verified: 1, ok: true },
    });
    const restoredRoot = await tempDir();
    expect(await restoreEvidenceCommand(configFor(restoredRoot), backup)).toEqual({
      exitCode: 0,
      output: { files: 1 },
    });
    // The output never contains the key.
    expect(JSON.stringify(made)).not.toContain(KEY);

    const newKey = loadEvidenceRotationKey({
      KHUMS_EVIDENCE_NEW_KEY: randomBytes(32).toString('base64'),
    });
    if (!newKey.ok) throw new Error('key');
    const rotatedRoot = await tempDir();
    expect(await rotateEvidenceKeyCommand(config, rotatedRoot, newKey.value)).toMatchObject({
      exitCode: 0,
      output: { files: 1 },
    });
    expect(loadEvidenceRotationKey({ KHUMS_EVIDENCE_NEW_KEY: 'short' }).ok).toBe(false);
  });
});
