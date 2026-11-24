import { z } from 'zod';

import { err, ok, type Result } from '@khums/utils';

/**
 * Checkpoint-job-only configuration (M4.6.3a; docs/AUTH_ARCHITECTURE.md §4.11). Read only by
 * `--create-integrity-checkpoints`, never by the API server, which refuses to start when the
 * signing key is present in its environment (the key must not live in the API runtime).
 */
const schema = z.object({
  AUDIT_CHECKPOINT_KEY_ID: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'must be a key id'),
  /** Base64 of a PKCS#8 PEM Ed25519 private key. Secret: never logged. */
  AUDIT_CHECKPOINT_SIGNING_KEY: z.string().min(1, 'is required'),
});

export interface CheckpointSigningConfig {
  readonly keyId: string;
  readonly privateKeyPem: string;
}

export function loadCheckpointSigningConfig(
  env: Readonly<Record<string, string | undefined>>,
): Result<CheckpointSigningConfig, string[]> {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // Names and rules only, never values.
    return err(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  return ok({
    keyId: parsed.data.AUDIT_CHECKPOINT_KEY_ID,
    privateKeyPem: Buffer.from(parsed.data.AUDIT_CHECKPOINT_SIGNING_KEY, 'base64').toString('utf8'),
  });
}

/** True when the checkpoint signing key is present (the API server then refuses to start). */
export function hasCheckpointSigningKey(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const value = env.AUDIT_CHECKPOINT_SIGNING_KEY;
  return value !== undefined && value !== '';
}
