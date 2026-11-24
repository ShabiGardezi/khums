import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';

/**
 * The checkpoint archive as a local JSON file on the operator's machine (M4.7, the KMS-free
 * private-review setup; docs/DEPLOYMENT_FREE_TIER.md §6). The file holds signed checkpoints only:
 * chain ids, sequences, digests, times, key ids and signatures (no personal data, no secrets).
 * Copies of it are kept outside the database (an encrypted local copy and a private repository).
 */

export type ArchiveReadResult =
  { readonly kind: 'READ'; readonly value: readonly unknown[] } | { readonly kind: 'INVALID' };

/** Reads the archive; a missing file is an empty archive (the first run). */
export async function readArchiveFile(path: string): Promise<ArchiveReadResult> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') return { kind: 'READ', value: [] };
    return { kind: 'INVALID' };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? { kind: 'READ', value: parsed } : { kind: 'INVALID' };
  } catch {
    return { kind: 'INVALID' };
  }
}

/** Replaces the archive atomically (temporary file, then rename), readable by the owner only. */
export async function writeArchiveFile(path: string, archive: readonly unknown[]): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(archive, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
