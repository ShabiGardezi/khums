import { z } from 'zod';

import { err, ok, type Result } from '@khums/utils';

/**
 * Pre-production backup key (M5.3.3 plan R4/R5). Read only by the reset, backup verification
 * and restore commands (lifting a fence needs no key), never by the API server, which refuses to
 * start when it is present. Kept in the owner's password manager; never written into a backup, log or repository.
 */
const schema = z.object({
  /** Secret: base64 of exactly 32 random bytes (AES-256). Never logged. */
  KHUMS_BACKUP_KEY: z.string().regex(/^[A-Za-z0-9+/]{43}=$/, 'must be base64 of exactly 32 bytes'),
});

export function loadBackupKey(
  env: Readonly<Record<string, string | undefined>>,
): Result<Uint8Array, string[]> {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    return err(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  return ok(new Uint8Array(Buffer.from(parsed.data.KHUMS_BACKUP_KEY, 'base64')));
}

/** True when the backup key is present (the API server then refuses to start). */
export function hasBackupKey(env: Readonly<Record<string, string | undefined>>): boolean {
  const value = env.KHUMS_BACKUP_KEY;
  return value !== undefined && value !== '';
}
