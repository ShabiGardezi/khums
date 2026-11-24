import { canonicalize } from '@khums/calculation-engine';
import type {
  ChainHead,
  IntegrityChainId,
  IntegrityCheckpoint,
  UnsignedIntegrityCheckpoint,
} from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import { integrityCheckpointSchema } from '@khums/validation';

import { deepFreeze } from '../governance/ledger';

/**
 * Signed integrity checkpoints (M4.6.3a; docs/AUTH_ARCHITECTURE.md §4.11).
 *
 * Core defines the payload, the creation and the verification rules; signing and signature checks
 * are platform cryptography behind the `CheckpointSigner` / `CheckpointSignatureVerifier` ports
 * (Ed25519 in the API's checkpoint job). The private key never reaches this package.
 */

export const CHECKPOINT_PAYLOAD_DOMAIN = 'khums-integrity-checkpoint/v1';

/** Signs payloads with one key (a sign-only KMS key or the job's protected secret). */
export interface CheckpointSigner {
  readonly keyId: string;
  sign(payload: string): Promise<string>;
}

/** Checks a signature with the public key of `keyId` from the trusted, version-controlled list. */
export interface CheckpointSignatureVerifier {
  verify(keyId: string, payload: string, signature: string): Promise<boolean>;
}

/** A trusted verification key's validity, from the version-controlled key list. */
export interface TrustedCheckpointKey {
  readonly keyId: string;
  readonly validFrom: string;
  /** Retired keys stop signing new checkpoints; older ones stay verifiable. */
  readonly validUntil: string | null;
  /** Compromised keys: checkpoints created at or after this instant are rejected. */
  readonly revokedAt: string | null;
}

export type CheckpointIssueCode =
  | 'CHECKPOINT_INVALID'
  /** Unknown key id, or the checkpoint's time is outside the key's validity or after revocation. */
  | 'CHECKPOINT_KEY_UNTRUSTED'
  | 'CHECKPOINT_SIGNATURE_INVALID'
  /** The checkpoint belongs to another chain. */
  | 'CHECKPOINT_CHAIN_MISMATCH'
  /** The live chain has a different record at the checkpointed sequence (rewrite or fork). */
  | 'CHECKPOINT_DIGEST_MISMATCH'
  /** The live chain is shorter than a checkpoint says it was (records removed). */
  | 'CHAIN_TRUNCATED'
  /** A later checkpoint names an earlier sequence (the chain went backwards). */
  | 'CHECKPOINT_ORDER_INVALID';

export interface CheckpointIssue {
  readonly code: CheckpointIssueCode;
  readonly checkpointId: string | null;
}

/** The exact bytes signed: a domain line, then the canonical JSON of every field but `signature`. */
export function checkpointSigningPayload(
  unsigned: UnsignedIntegrityCheckpoint,
): Result<string, 'CHECKPOINT_INVALID'> {
  const canonical = canonicalize({
    checkpointId: unsigned.checkpointId,
    chainId: unsigned.chainId,
    sequence: unsigned.sequence,
    digest: unsigned.digest,
    recordCount: unsigned.recordCount,
    createdAt: unsigned.createdAt,
    keyId: unsigned.keyId,
  });
  return canonical.ok
    ? ok(`${CHECKPOINT_PAYLOAD_DOMAIN}\n${canonical.value}`)
    : err('CHECKPOINT_INVALID');
}

/** Creates and signs a checkpoint of a verified chain head. The caller verifies the chain first. */
export async function createCheckpoint(
  input: {
    readonly checkpointId: string;
    readonly chainId: IntegrityChainId;
    readonly head: ChainHead;
    readonly createdAt: string;
  },
  signer: CheckpointSigner,
): Promise<Result<IntegrityCheckpoint, 'CHECKPOINT_INVALID'>> {
  const unsigned: UnsignedIntegrityCheckpoint = {
    checkpointId: input.checkpointId,
    chainId: input.chainId,
    sequence: input.head.sequence,
    digest: input.head.digest,
    recordCount: input.head.sequence + 1,
    createdAt: input.createdAt,
    keyId: signer.keyId,
  };
  const payload = checkpointSigningPayload(unsigned);
  if (!payload.ok) return payload;
  const checkpoint = { ...unsigned, signature: await signer.sign(payload.value) };
  return integrityCheckpointSchema.safeParse(checkpoint).success
    ? ok(deepFreeze(checkpoint))
    : err('CHECKPOINT_INVALID');
}

/** The live chain as the verifier sees it: its length and the digest stored at each sequence. */
export interface LiveChain {
  readonly chainId: IntegrityChainId;
  readonly recordCount: number;
  digestAt(sequence: number): string | null;
}

const keyTrustedAt = (key: TrustedCheckpointKey, at: string): boolean =>
  at >= key.validFrom &&
  (key.validUntil === null || at < key.validUntil) &&
  (key.revokedAt === null || at < key.revokedAt);

async function checkSignature(
  checkpoint: IntegrityCheckpoint,
  trustedKeys: readonly TrustedCheckpointKey[],
  verifier: CheckpointSignatureVerifier,
): Promise<CheckpointIssueCode | null> {
  const key = trustedKeys.find((k) => k.keyId === checkpoint.keyId);
  if (key === undefined || !keyTrustedAt(key, checkpoint.createdAt)) {
    return 'CHECKPOINT_KEY_UNTRUSTED';
  }
  const { signature, ...unsigned } = checkpoint;
  const payload = checkpointSigningPayload(unsigned);
  if (!payload.ok) return 'CHECKPOINT_INVALID';
  return (await verifier.verify(checkpoint.keyId, payload.value, signature))
    ? null
    : 'CHECKPOINT_SIGNATURE_INVALID';
}

/**
 * Checks one checkpoint on its own (schema, trusted key at `createdAt`, signature), without a live
 * chain: used before a checkpoint is copied into the independent archive, so a forged or
 * untrusted checkpoint never enters it.
 */
export async function verifyCheckpointSignature(
  raw: unknown,
  trustedKeys: readonly TrustedCheckpointKey[],
  verifier: CheckpointSignatureVerifier,
): Promise<Result<IntegrityCheckpoint, CheckpointIssueCode>> {
  const parsed = integrityCheckpointSchema.safeParse(raw);
  if (!parsed.success || parsed.data.recordCount !== parsed.data.sequence + 1) {
    return err('CHECKPOINT_INVALID');
  }
  const issue = await checkSignature(parsed.data, trustedKeys, verifier);
  return issue === null ? ok(parsed.data) : err(issue);
}

/**
 * Verifies a (fully verified) live chain against every given checkpoint of that chain: schema,
 * trusted key at `createdAt`, signature, matching digest at the sequence, no truncation, and
 * sequences never decreasing over time. Returns the latest checkpoint that passed.
 */
export async function verifyChainAgainstCheckpoints(
  chain: LiveChain,
  checkpoints: readonly unknown[],
  trustedKeys: readonly TrustedCheckpointKey[],
  verifier: CheckpointSignatureVerifier,
): Promise<
  Result<
    { readonly verified: number; readonly latest: IntegrityCheckpoint | null },
    CheckpointIssue
  >
> {
  const parsed: IntegrityCheckpoint[] = [];
  for (const raw of checkpoints) {
    const result = integrityCheckpointSchema.safeParse(raw);
    if (!result.success || result.data.recordCount !== result.data.sequence + 1) {
      return err({ code: 'CHECKPOINT_INVALID', checkpointId: null });
    }
    parsed.push(result.data);
  }
  parsed.sort((a, b) =>
    a.createdAt === b.createdAt ? a.sequence - b.sequence : a.createdAt < b.createdAt ? -1 : 1,
  );

  let latest: IntegrityCheckpoint | null = null;
  for (const checkpoint of parsed) {
    const fail = (code: CheckpointIssueCode) =>
      err({ code, checkpointId: checkpoint.checkpointId });
    if (checkpoint.chainId !== chain.chainId) return fail('CHECKPOINT_CHAIN_MISMATCH');
    const signed = await checkSignature(checkpoint, trustedKeys, verifier);
    if (signed !== null) return fail(signed);
    if (latest !== null && checkpoint.sequence < latest.sequence) {
      return fail('CHECKPOINT_ORDER_INVALID');
    }
    if (chain.recordCount < checkpoint.recordCount) return fail('CHAIN_TRUNCATED');
    if (chain.digestAt(checkpoint.sequence) !== checkpoint.digest) {
      return fail('CHECKPOINT_DIGEST_MISMATCH');
    }
    latest = checkpoint;
  }
  return ok({ verified: parsed.length, latest });
}

/** A `LiveChain` over records that carry a sequence and a digest (any of the chained kinds). */
export function liveChainOf(
  chainId: IntegrityChainId,
  records: readonly { readonly sequence: number; readonly digest: string }[],
): LiveChain {
  const bySequence = new Map(records.map((r) => [r.sequence, r.digest]));
  return {
    chainId,
    recordCount: records.length,
    digestAt: (sequence) => bySequence.get(sequence) ?? null,
  };
}

export const AUDIT_CHAIN_ID: IntegrityChainId = 'audit';
export const POLICY_REGISTRY_CHAIN_ID: IntegrityChainId = 'governance-policy-registry';
export const ledgerChainId = (packId: string, version: string): IntegrityChainId =>
  `governance-ledger:${packId}@${version}`;
/** The revision chain of one research entity (M5.3.3), e.g. `research:source:<uuidv7>`. */
export const researchChainId = (
  entityType: 'SOURCE' | 'PASSAGE' | 'TRANSLATION' | 'FINDING' | 'RULING',
  entityId: string,
): IntegrityChainId => `research:${entityType.toLowerCase()}:${entityId}`;

export type CheckpointArchiveIssueCode =
  /** The archive is not a list of well-formed checkpoints with unique ids. */
  | 'ARCHIVE_INVALID'
  /** An addition has the id of an archived checkpoint but different content. */
  | 'ARCHIVE_CONFLICT'
  /** An addition is not a well-formed checkpoint. */
  | 'ADDITION_INVALID';

const sameCheckpoint = (a: IntegrityCheckpoint, b: IntegrityCheckpoint): boolean => {
  const left = canonicalize(a);
  const right = canonicalize(b);
  return left.ok && right.ok && left.value === right.value;
};

/**
 * The independent checkpoint archive (M4.7; docs/DEPLOYMENT_FREE_TIER.md): kept OUTSIDE the
 * database, so a database administrator who rewrites a chain and its stored checkpoints is still
 * detected by `--verify-integrity <archive>`. The archive only grows: existing entries are kept
 * exactly, in order; an addition already archived (same id, same content) is skipped; the same id
 * with different content is refused. The caller checks additions' signatures before merging.
 */
export function appendToCheckpointArchive(
  archive: unknown,
  additions: readonly unknown[],
): Result<
  { readonly archive: readonly IntegrityCheckpoint[]; readonly added: number },
  CheckpointArchiveIssueCode
> {
  if (!Array.isArray(archive)) return err('ARCHIVE_INVALID');
  const kept: IntegrityCheckpoint[] = [];
  const byId = new Map<string, IntegrityCheckpoint>();
  for (const raw of archive as readonly unknown[]) {
    const parsed = integrityCheckpointSchema.safeParse(raw);
    if (!parsed.success || byId.has(parsed.data.checkpointId)) return err('ARCHIVE_INVALID');
    kept.push(parsed.data);
    byId.set(parsed.data.checkpointId, parsed.data);
  }
  let added = 0;
  for (const raw of additions) {
    const parsed = integrityCheckpointSchema.safeParse(raw);
    if (!parsed.success) return err('ADDITION_INVALID');
    const existing = byId.get(parsed.data.checkpointId);
    if (existing !== undefined) {
      if (!sameCheckpoint(existing, parsed.data)) return err('ARCHIVE_CONFLICT');
      continue;
    }
    kept.push(parsed.data);
    byId.set(parsed.data.checkpointId, parsed.data);
    added += 1;
  }
  return ok({ archive: kept, added });
}
