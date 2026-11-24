import { describe, expect, it } from 'vitest';

import { canonicalDigest } from '@khums/calculation-engine';
import type { IntegrityCheckpoint } from '@khums/shared-types';
import { err } from '@khums/utils';

import {
  CHECKPOINT_PAYLOAD_DOMAIN,
  appendToCheckpointArchive,
  checkpointSigningPayload,
  createCheckpoint,
  ledgerChainId,
  liveChainOf,
  verifyChainAgainstCheckpoints,
  verifyCheckpointSignature,
  type CheckpointSignatureVerifier,
  type CheckpointSigner,
  type TrustedCheckpointKey,
} from './checkpoint';

/**
 * Deterministic stand-in for Ed25519 (core is pure; the real signer lives in the API and is tested
 * there). The "signature" is a keyed digest padded to the 86-char base64url length.
 */
const fakeSignature = (keyId: string, payload: string) => {
  const digest = canonicalDigest(`${keyId}|${payload}`);
  if (!digest.ok) throw new Error('digest');
  return `${digest.value}${'A'.repeat(22)}`;
};
const signer = (keyId: string): CheckpointSigner => ({
  keyId,
  sign: (payload) => Promise.resolve(fakeSignature(keyId, payload)),
});
const verifier: CheckpointSignatureVerifier = {
  verify: (keyId, payload, signature) =>
    Promise.resolve(fakeSignature(keyId, payload) === signature),
};

const KEYS: TrustedCheckpointKey[] = [
  { keyId: 'key-2026a', validFrom: '2026-01-01T00:00:00.000Z', validUntil: null, revokedAt: null },
];
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hex = (c: string) => c.repeat(64);
const records = ['a', 'b', 'c', 'd'].map((c, sequence) => ({ sequence, digest: hex(c) }));
const chain = (count = 4) => liveChainOf('audit', records.slice(0, count));

async function checkpoint(n: number, sequence: number, createdAt: string, keyId = 'key-2026a') {
  const created = await createCheckpoint(
    {
      checkpointId: uuid(n),
      chainId: 'audit',
      head: { sequence, digest: records[sequence]?.digest ?? '' },
      createdAt,
    },
    signer(keyId),
  );
  if (!created.ok) throw new Error(created.error);
  return created.value;
}

describe('checkpoint payload and creation', () => {
  it('signs a domain-separated canonical payload of every field but the signature', async () => {
    const cp = await checkpoint(1, 1, '2026-11-21T10:00:00.000Z');
    expect(cp).toMatchObject({ sequence: 1, recordCount: 2, keyId: 'key-2026a' });
    const { signature, ...unsigned } = cp;
    const payload = checkpointSigningPayload(unsigned);
    expect(payload.ok && payload.value.startsWith(`${CHECKPOINT_PAYLOAD_DOMAIN}\n{`)).toBe(true);
    expect(payload.ok && payload.value).not.toContain(signature);
    expect(Object.isFrozen(cp)).toBe(true);
  });

  it('names ledger chains by pack and version', () => {
    expect(ledgerChainId('pack-a', '1.2.3')).toBe('governance-ledger:pack-a@1.2.3');
  });
});

describe('verifying a live chain against checkpoints', () => {
  it('accepts matching checkpoints and returns the latest', async () => {
    const cps = [
      await checkpoint(1, 1, '2026-11-21T10:00:00.000Z'),
      await checkpoint(2, 3, '2026-11-21T11:00:00.000Z'),
    ];
    const result = await verifyChainAgainstCheckpoints(chain(), cps, KEYS, verifier);
    expect(result.ok && result.value.verified).toBe(2);
    expect(result.ok && result.value.latest?.checkpointId).toBe(uuid(2));
  });

  it('detects a rewritten chain (consistent rewrite included)', async () => {
    const cp = await checkpoint(1, 2, '2026-11-21T10:00:00.000Z');
    const rewritten = liveChainOf(
      'audit',
      records.map((r) => (r.sequence >= 1 ? { ...r, digest: hex('f') } : r)),
    );
    expect(await verifyChainAgainstCheckpoints(rewritten, [cp], KEYS, verifier)).toEqual(
      err({ code: 'CHECKPOINT_DIGEST_MISMATCH', checkpointId: uuid(1) }),
    );
  });

  it('detects truncation (trailing records removed)', async () => {
    const cp = await checkpoint(1, 3, '2026-11-21T10:00:00.000Z');
    expect(await verifyChainAgainstCheckpoints(chain(2), [cp], KEYS, verifier)).toEqual(
      err({ code: 'CHAIN_TRUNCATED', checkpointId: uuid(1) }),
    );
  });

  it('rejects forged, re-pointed and untrusted checkpoints', async () => {
    const cp = await checkpoint(1, 1, '2026-11-21T10:00:00.000Z');
    // A database administrator edits the digest to match a rewrite: the signature no longer holds.
    const forged: IntegrityCheckpoint = { ...cp, digest: hex('f') };
    expect(await verifyChainAgainstCheckpoints(chain(), [forged], KEYS, verifier)).toEqual(
      err({ code: 'CHECKPOINT_SIGNATURE_INVALID', checkpointId: uuid(1) }),
    );
    // Signed with a key that is not in the version-controlled list.
    const rogue = await checkpoint(2, 1, '2026-11-21T10:00:00.000Z', 'rogue-key');
    expect(await verifyChainAgainstCheckpoints(chain(), [rogue], KEYS, verifier)).toEqual(
      err({ code: 'CHECKPOINT_KEY_UNTRUSTED', checkpointId: uuid(2) }),
    );
    // Another chain's checkpoint.
    const other = liveChainOf('governance-policy-registry', records);
    expect(await verifyChainAgainstCheckpoints(other, [cp], KEYS, verifier)).toEqual(
      err({ code: 'CHECKPOINT_CHAIN_MISMATCH', checkpointId: uuid(1) }),
    );
    // recordCount must equal sequence + 1, and unknown fields are refused.
    expect(
      await verifyChainAgainstCheckpoints(chain(), [{ ...cp, recordCount: 9 }], KEYS, verifier),
    ).toEqual(err({ code: 'CHECKPOINT_INVALID', checkpointId: null }));
  });

  it('honours key validity windows and revocation', async () => {
    const before = await checkpoint(1, 1, '2026-11-01T00:00:00.000Z');
    const after = await checkpoint(2, 2, '2026-11-21T00:00:00.000Z');
    const revoked: TrustedCheckpointKey[] = [
      {
        ...KEYS[0],
        keyId: 'key-2026a',
        revokedAt: '2026-11-10T00:00:00.000Z',
      } as TrustedCheckpointKey,
    ];
    expect((await verifyChainAgainstCheckpoints(chain(), [before], revoked, verifier)).ok).toBe(
      true,
    );
    expect(await verifyChainAgainstCheckpoints(chain(), [after], revoked, verifier)).toEqual(
      err({ code: 'CHECKPOINT_KEY_UNTRUSTED', checkpointId: uuid(2) }),
    );
    const notYet = await checkpoint(3, 1, '2025-06-01T00:00:00.000Z');
    expect(await verifyChainAgainstCheckpoints(chain(), [notYet], KEYS, verifier)).toEqual(
      err({ code: 'CHECKPOINT_KEY_UNTRUSTED', checkpointId: uuid(3) }),
    );
  });

  it('rejects a chain that went backwards between checkpoints', async () => {
    const cps = [
      await checkpoint(1, 3, '2026-11-21T10:00:00.000Z'),
      await checkpoint(2, 1, '2026-11-21T11:00:00.000Z'),
    ];
    expect(await verifyChainAgainstCheckpoints(chain(), cps, KEYS, verifier)).toEqual(
      err({ code: 'CHECKPOINT_ORDER_INVALID', checkpointId: uuid(2) }),
    );
  });

  it('with no checkpoints verifies nothing (the caller reports that explicitly)', async () => {
    const result = await verifyChainAgainstCheckpoints(chain(), [], KEYS, verifier);
    expect(result.ok && result.value).toEqual({ verified: 0, latest: null });
  });
});

describe('checking one checkpoint before archiving it', () => {
  it('accepts a trusted, correctly signed checkpoint', async () => {
    const cp = await checkpoint(1, 1, '2026-11-21T10:00:00.000Z');
    const result = await verifyCheckpointSignature(cp, KEYS, verifier);
    expect(result.ok && result.value.checkpointId).toBe(cp.checkpointId);
  });

  it('refuses malformed, forged, untrusted and inconsistent checkpoints', async () => {
    const cp = await checkpoint(1, 1, '2026-11-21T10:00:00.000Z');
    const check = (raw: unknown) => verifyCheckpointSignature(raw, KEYS, verifier);
    expect(await check({ ...cp, extra: true })).toEqual(err('CHECKPOINT_INVALID'));
    expect(await check({ ...cp, recordCount: 5 })).toEqual(err('CHECKPOINT_INVALID'));
    expect(await check({ ...cp, digest: hex('f') })).toEqual(err('CHECKPOINT_SIGNATURE_INVALID'));
    const untrusted = await checkpoint(2, 1, '2026-11-21T10:00:00.000Z', 'key-other');
    expect(await check(untrusted)).toEqual(err('CHECKPOINT_KEY_UNTRUSTED'));
    const early = await checkpoint(3, 1, '2025-12-31T23:59:59.999Z');
    expect(await check(early)).toEqual(err('CHECKPOINT_KEY_UNTRUSTED'));
  });
});

describe('the independent checkpoint archive', () => {
  it('only grows: keeps every entry in order and appends new ones', async () => {
    const a = await checkpoint(1, 1, '2026-11-21T10:00:00.000Z');
    const b = await checkpoint(2, 2, '2026-11-21T11:00:00.000Z');
    const c = await checkpoint(3, 3, '2026-11-21T12:00:00.000Z');
    const first = appendToCheckpointArchive([], [a, b]);
    expect(first.ok && first.value.added).toBe(2);
    const second = appendToCheckpointArchive(first.ok ? first.value.archive : [], [b, c]);
    expect(second.ok && second.value.added).toBe(1);
    expect(second.ok && second.value.archive.map((x) => x.checkpointId)).toEqual([
      a.checkpointId,
      b.checkpointId,
      c.checkpointId,
    ]);
  });

  it('refuses a changed entry, a malformed archive and malformed additions', async () => {
    const a = await checkpoint(1, 1, '2026-11-21T10:00:00.000Z');
    const changed = { ...a, digest: hex('e') };
    expect(appendToCheckpointArchive([a], [changed])).toEqual(err('ARCHIVE_CONFLICT'));
    expect(appendToCheckpointArchive({ list: [a] }, [])).toEqual(err('ARCHIVE_INVALID'));
    expect(appendToCheckpointArchive([a, a], [])).toEqual(err('ARCHIVE_INVALID'));
    expect(appendToCheckpointArchive([{ ...a, extra: 1 }], [])).toEqual(err('ARCHIVE_INVALID'));
    expect(appendToCheckpointArchive([a], [{ nope: true }])).toEqual(err('ADDITION_INVALID'));
  });
});
