import type { TrustedCheckpointKey } from '@khums/core';

import type { PublicCheckpointKey } from './ed25519';

/**
 * TRUSTED checkpoint verification keys (M4.6.3a; docs/AUTH_ARCHITECTURE.md §4.11).
 *
 * Version-controlled on purpose: a database administrator cannot add or replace a key, because
 * changing this list is a reviewed code change. Only PUBLIC keys belong here (SPKI PEM). The
 * matching private keys live only in the checkpoint job's KMS key or protected secret store.
 *
 * Empty until the maintainer provisions the first production signing key (an M4.7 entry
 * criterion). Rotation: add a new entry with a new `keyId` and set `validUntil` on the old one.
 * Compromise: set `revokedAt`; checkpoints created at or after it are rejected.
 */
export const TRUSTED_CHECKPOINT_KEYS: readonly (TrustedCheckpointKey & PublicCheckpointKey)[] = [];
