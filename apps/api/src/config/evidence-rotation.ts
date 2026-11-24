import { z } from 'zod';

import { err, ok, type Result } from '@khums/utils';

/**
 * Key-rotation-only configuration (M5.3.3 hardening). Read only by `--rotate-evidence-key`, never
 * by the API server, which refuses to start when the new key is present in its environment.
 */
const schema = z.object({
  /** Secret: base64 of exactly 32 random bytes. Never logged. */
  KHUMS_EVIDENCE_NEW_KEY: z
    .string()
    .regex(/^[A-Za-z0-9+/]{43}=$/, 'must be base64 of exactly 32 bytes'),
});

export function loadEvidenceRotationKey(
  env: Readonly<Record<string, string | undefined>>,
): Result<Uint8Array, string[]> {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    return err(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  return ok(new Uint8Array(Buffer.from(parsed.data.KHUMS_EVIDENCE_NEW_KEY, 'base64')));
}

/** True when a rotation key is present (the API server then refuses to start). */
export function hasEvidenceRotationKey(env: Readonly<Record<string, string | undefined>>): boolean {
  const value = env.KHUMS_EVIDENCE_NEW_KEY;
  return value !== undefined && value !== '';
}
