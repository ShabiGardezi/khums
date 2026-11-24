import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appendAuditEvent,
  appendResearchRevision,
  formatUuidV7,
  researchDisplayRef,
  type TrustedCheckpointKey,
} from '@khums/core';
import type { ResearchChain } from '@khums/shared-types';

import { twoRecordLedger } from '../../test/support/governance-ledgers';
import { appendOnlyAuditEventStore } from '../audit/audit-event.store';
import { hasCheckpointSigningKey, loadCheckpointSigningConfig } from '../config';
import { appendOnlyGovernanceLedgerStore } from '../governance/governance-ledger.store';
import {
  appendOnlyGovernancePolicyStore,
  seedPolicyRegistry,
} from '../governance/governance-policy.store';
import { initialRegistryFor } from '../governance/governance.module';
import {
  inMemoryAppendOnlyCollection,
  type AppendOnlyCollection,
} from '../persistence/append-only-collection';
import { COLLECTIONS } from '../persistence/collections';
import { researchChainStore } from '../research/research-store';
import { readArchiveFile, writeArchiveFile } from './checkpoint-archive-file';
import { TRUSTED_CHECKPOINT_KEYS } from './checkpoint-keys';
import { ed25519Signer, ed25519Verifier } from './ed25519';
import {
  archiveCheckpoints,
  createIntegrityCheckpoints,
  loadVerifiedChains,
  verifyIntegrity,
  type ChainSources,
} from './integrity-checkpoints';

/** Signed integrity checkpoints with real Ed25519 keys (M4.6.3a; AUTH_ARCHITECTURE §4.11). */

function keyPair(keyId: string) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    keyId,
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
  };
}

const KEY = keyPair('test-key-1');
const trusted: (TrustedCheckpointKey & { publicKeyPem: string })[] = [
  {
    keyId: KEY.keyId,
    publicKeyPem: KEY.publicKeyPem,
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
    revokedAt: null,
  },
];
const NOW = Date.parse('2026-11-21T10:00:00.000Z');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A two-revision research source chain (CREATED, VERIFIED), placeholder content only. */
const RESEARCH_ID = formatUuidV7(
  Date.parse('2026-11-22T10:00:00.000Z'),
  new Uint8Array(10).fill(7),
);
function researchSourceChain(): ResearchChain {
  const draft = (kind: 'CREATED' | 'VERIFIED', at: string) => ({
    kind,
    payload: kind === 'CREATED' ? { placeholder: 'TEST' } : null,
    references: [],
    aiInvolvement: [],
    actor: { kind: 'STAFF_PRINCIPAL' as const, subject: 'principal-scholar' },
    recordedAt: at,
    reason: null,
    decisionId: `d-${kind}`,
    requestId: `r-${kind}`,
  });
  const first = appendResearchRevision(
    null,
    {
      entityType: 'SOURCE',
      entityId: RESEARCH_ID,
      displayRef: researchDisplayRef('SOURCE', 'sistani', RESEARCH_ID, null),
      marjaId: 'sistani',
      rulingVersion: null,
      question: null,
    },
    draft('CREATED', '2026-11-22T10:00:00.000Z'),
  );
  if (!first.ok) throw new Error('fixture');
  const second = appendResearchRevision(
    first.value.chain,
    null,
    draft('VERIFIED', '2026-11-22T10:01:00.000Z'),
  );
  if (!second.ok) throw new Error('fixture');
  return second.value.chain;
}

async function populatedSources() {
  const collections = {
    audit: inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents),
    policy: inMemoryAppendOnlyCollection(COLLECTIONS.governancePolicyRegistry),
    ledgers: inMemoryAppendOnlyCollection(COLLECTIONS.governanceLedgerRecords),
    research: inMemoryAppendOnlyCollection(COLLECTIONS.researchSources),
  };
  const auditStore = appendOnlyAuditEventStore(collections.audit);
  for (const n of [1, 2, 3]) {
    await appendAuditEvent(auditStore, {
      eventId: uuid(n),
      type: 'governance.policy.changed',
      actor: 'principal-admin',
      targets: [],
      marjaIds: ['sistani'],
      details: { reason: 'TEST' },
      requestId: null,
      occurredAt: '2026-11-21T09:00:00.000Z',
    });
  }
  const policyStore = appendOnlyGovernancePolicyStore(collections.policy);
  await seedPolicyRegistry(policyStore, initialRegistryFor(NOW));
  const ledgerStore = appendOnlyGovernanceLedgerStore(collections.ledgers);
  const { one, two } = twoRecordLedger();
  await ledgerStore.append(0, one);
  await ledgerStore.append(1, two);
  const researchStore = researchChainStore(collections.research, 'SOURCE');
  const research = researchSourceChain();
  await researchStore.append(0, { ...research, records: research.records.slice(0, 1) }, {});
  await researchStore.append(1, research, {});
  const sources: ChainSources = {
    audit: collections.audit,
    policyRegistry: policyStore,
    ledgers: ledgerStore,
    research: [researchStore],
  };
  return { sources, collections };
}

async function checkpointAll(sources: ChainSources, checkpoints: AppendOnlyCollection) {
  return createIntegrityCheckpoints({
    chains: await loadVerifiedChains(sources),
    signer: ed25519Signer(KEY.keyId, KEY.privateKeyPem),
    checkpoints,
    now: () => NOW,
    newId: randomUUID,
  });
}

describe('Ed25519 signer and verifier', () => {
  it('verifies its own signatures and nothing else', async () => {
    const signer = ed25519Signer(KEY.keyId, KEY.privateKeyPem);
    const verifier = ed25519Verifier(trusted);
    const signature = await signer.sign('payload');
    expect(signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(await verifier.verify(KEY.keyId, 'payload', signature)).toBe(true);
    expect(await verifier.verify(KEY.keyId, 'payload!', signature)).toBe(false);
    expect(await verifier.verify('unknown-key', 'payload', signature)).toBe(false);
    expect(await verifier.verify(KEY.keyId, 'payload', 'not-a-signature')).toBe(false);
    const other = keyPair('test-key-1');
    expect(await ed25519Verifier([{ ...other }]).verify(KEY.keyId, 'payload', signature)).toBe(
      false,
    );
  });

  it('accepts only Ed25519 keys of the right kind', () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(() =>
      ed25519Signer('k', rsa.privateKey.export({ type: 'pkcs8', format: 'pem' })),
    ).toThrow(/Ed25519 private key/);
    expect(() => ed25519Verifier([{ keyId: 'k', publicKeyPem: KEY.privateKeyPem }])).toThrow(
      /Ed25519 public key/,
    );
  });

  it('ships no trusted key until the maintainer provisions one (and never a private key)', () => {
    expect(TRUSTED_CHECKPOINT_KEYS).toEqual([]);
  });
});

describe('checkpoint job', () => {
  it('checkpoints every verified chain once, and verifies them', async () => {
    const { sources } = await populatedSources();
    const checkpoints = inMemoryAppendOnlyCollection(COLLECTIONS.auditCheckpoints);
    const outcomes = await checkpointAll(sources, checkpoints);
    expect(outcomes.map((o) => [o.chainId, o.status])).toEqual([
      ['audit', 'CHECKPOINTED'],
      ['governance-policy-registry', 'CHECKPOINTED'],
      [expect.stringMatching(/^governance-ledger:/), 'CHECKPOINTED'],
      [`research:source:${RESEARCH_ID}`, 'CHECKPOINTED'],
    ]);
    // Re-running at the same heads stores nothing new.
    expect((await checkpointAll(sources, checkpoints)).map((o) => o.status)).toEqual([
      'ALREADY_CHECKPOINTED',
      'ALREADY_CHECKPOINTED',
      'ALREADY_CHECKPOINTED',
      'ALREADY_CHECKPOINTED',
    ]);
    const stored = await checkpoints.find({}, { sort: { field: 'createdAt', direction: 1 } });
    if (!stored.ok) throw new Error('fixture');
    const verified = await verifyIntegrity({
      chains: await loadVerifiedChains(sources),
      checkpoints: stored.value,
      trustedKeys: trusted,
      verifier: ed25519Verifier(trusted),
    });
    expect(verified.map((o) => o.status)).toEqual(['VERIFIED', 'VERIFIED', 'VERIFIED', 'VERIFIED']);
    // Checkpoints carry no personal data: only ids, sequences, digests, times and the signature.
    for (const cp of stored.value) {
      expect(Object.keys(cp as object).sort()).toEqual([
        'chainId',
        'checkpointId',
        'createdAt',
        'digest',
        'keyId',
        'recordCount',
        'sequence',
        'signature',
      ]);
    }
  });

  it('never signs a broken chain', async () => {
    const { sources, collections } = await populatedSources();
    const tampered: AppendOnlyCollection = {
      ...collections.audit,
      find: async (filter, options) => {
        const found = await collections.audit.find(filter, options);
        if (!found.ok) return found;
        return {
          ok: true,
          value: found.value.map((e, i) =>
            i === 1 ? { ...(e as object), details: { reason: 'EDITED' } } : e,
          ),
        };
      },
    };
    const outcomes = await checkpointAll(
      { ...sources, audit: tampered },
      inMemoryAppendOnlyCollection(COLLECTIONS.auditCheckpoints),
    );
    expect(outcomes[0]).toEqual({ chainId: 'audit', status: 'NOT_SIGNED_CHAIN_INVALID' });
  });

  it('detects a consistent rewrite, truncation and a deleted ledger against stored checkpoints', async () => {
    const { sources } = await populatedSources();
    const checkpoints = inMemoryAppendOnlyCollection(COLLECTIONS.auditCheckpoints);
    await checkpointAll(sources, checkpoints);
    const stored = await checkpoints.find({}, { sort: { field: 'createdAt', direction: 1 } });
    if (!stored.ok) throw new Error('fixture');

    // A database administrator rebuilds the audit chain consistently with different content.
    const rewritten = inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents);
    const rewrittenStore = appendOnlyAuditEventStore(rewritten);
    for (const n of [1, 2, 3]) {
      await appendAuditEvent(rewrittenStore, {
        eventId: uuid(n),
        type: 'governance.policy.changed',
        actor: 'someone-else',
        targets: [],
        marjaIds: ['sistani'],
        details: { reason: 'TEST' },
        requestId: null,
        occurredAt: '2026-11-21T09:00:00.000Z',
      });
    }
    // … and removes the last record of a second copy (truncation), and deletes the ledger.
    const truncated = inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents);
    const truncatedStore = appendOnlyAuditEventStore(truncated);
    await appendAuditEvent(truncatedStore, {
      eventId: uuid(1),
      type: 'governance.policy.changed',
      actor: 'principal-admin',
      targets: [],
      marjaIds: ['sistani'],
      details: { reason: 'TEST' },
      requestId: null,
      occurredAt: '2026-11-21T09:00:00.000Z',
    });
    const noLedgers = appendOnlyGovernanceLedgerStore(
      inMemoryAppendOnlyCollection(COLLECTIONS.governanceLedgerRecords),
    );

    const check = async (patch: Partial<ChainSources>) =>
      verifyIntegrity({
        chains: await loadVerifiedChains({ ...sources, ...patch }),
        checkpoints: stored.value,
        trustedKeys: trusted,
        verifier: ed25519Verifier(trusted),
      });
    expect((await check({ audit: rewritten }))[0]).toEqual({
      chainId: 'audit',
      status: 'CHECKPOINT_FAILED',
      code: 'CHECKPOINT_DIGEST_MISMATCH',
    });
    expect((await check({ audit: truncated }))[0]).toEqual({
      chainId: 'audit',
      status: 'CHECKPOINT_FAILED',
      code: 'CHAIN_TRUNCATED',
    });
    expect((await check({ ledgers: noLedgers })).at(-1)).toMatchObject({ status: 'CHAIN_MISSING' });
  });

  it('rejects checkpoints edited in the database or signed with an untrusted key', async () => {
    const { sources } = await populatedSources();
    const checkpoints = inMemoryAppendOnlyCollection(COLLECTIONS.auditCheckpoints);
    await checkpointAll(sources, checkpoints);
    const stored = await checkpoints.find(
      { chainId: 'audit' },
      { sort: { field: 'createdAt', direction: 1 } },
    );
    if (!stored.ok) throw new Error('fixture');
    const edited = stored.value.map((cp) => ({ ...(cp as object), sequence: 1, recordCount: 2 }));
    const verify = async (cps: readonly unknown[], keys = trusted) =>
      (
        await verifyIntegrity({
          chains: await loadVerifiedChains(sources),
          checkpoints: cps,
          trustedKeys: keys,
          verifier: ed25519Verifier(keys),
        })
      )[0];
    expect(await verify(edited)).toMatchObject({ code: 'CHECKPOINT_SIGNATURE_INVALID' });
    expect(await verify(stored.value, [])).toMatchObject({ code: 'CHECKPOINT_KEY_UNTRUSTED' });
  });
});

describe('research chains in the checkpoint job (M5.3.3)', () => {
  const RESEARCH_CHAIN_ID = `research:source:${RESEARCH_ID}`;

  it('never signs a tampered research chain, and detects a rewritten or truncated one', async () => {
    const { sources } = await populatedSources();
    const checkpoints = inMemoryAppendOnlyCollection(COLLECTIONS.auditCheckpoints);
    await checkpointAll(sources, checkpoints);
    const stored = await checkpoints.find({}, { sort: { field: 'createdAt', direction: 1 } });
    if (!stored.ok) throw new Error('fixture');

    // A stored revision whose record no longer matches its digest.
    const chain = researchSourceChain();
    const [first, second] = chain.records;
    if (first === undefined || second === undefined) throw new Error('fixture');
    const tampered = inMemoryAppendOnlyCollection(COLLECTIONS.researchSources);
    const tamperedStore = researchChainStore(tampered, 'SOURCE');
    await tamperedStore.append(
      0,
      { ...chain, records: [{ ...first, decisionId: 'd-EDITED' }] },
      {},
    );
    const outcomes = await checkpointAll({ ...sources, research: [tamperedStore] }, checkpoints);
    expect(outcomes.find((o) => o.chainId === RESEARCH_CHAIN_ID)).toEqual({
      chainId: RESEARCH_CHAIN_ID,
      status: 'NOT_SIGNED_CHAIN_INVALID',
    });

    // Truncated to its (still valid) first revision: the checkpoint of revision 1 detects it.
    const truncated = inMemoryAppendOnlyCollection(COLLECTIONS.researchSources);
    const truncatedStore = researchChainStore(truncated, 'SOURCE');
    await truncatedStore.append(0, { ...chain, records: [first] }, {});
    const verified = await verifyIntegrity({
      chains: await loadVerifiedChains({ ...sources, research: [truncatedStore] }),
      checkpoints: stored.value,
      trustedKeys: trusted,
      verifier: ed25519Verifier(trusted),
    });
    expect(verified.find((o) => o.chainId === RESEARCH_CHAIN_ID)).toEqual({
      chainId: RESEARCH_CHAIN_ID,
      status: 'CHECKPOINT_FAILED',
      code: 'CHAIN_TRUNCATED',
    });
    // Removed entirely: reported as missing.
    const removed = researchChainStore(
      inMemoryAppendOnlyCollection(COLLECTIONS.researchSources),
      'SOURCE',
    );
    const missing = await verifyIntegrity({
      chains: await loadVerifiedChains({ ...sources, research: [removed] }),
      checkpoints: stored.value,
      trustedKeys: trusted,
      verifier: ed25519Verifier(trusted),
    });
    expect(missing.find((o) => o.chainId === RESEARCH_CHAIN_ID)).toEqual({
      chainId: RESEARCH_CHAIN_ID,
      status: 'CHAIN_MISSING',
    });
  });

  it('reports an unreadable research collection as a whole, never skipping it', async () => {
    const { sources } = await populatedSources();
    const broken = inMemoryAppendOnlyCollection(COLLECTIONS.researchSources);
    await broken.insert({ entityId: 'x', revision: 0, recordJson: '{' });
    const chains = await loadVerifiedChains({
      ...sources,
      research: [researchChainStore(broken, 'SOURCE')],
    });
    expect(chains.find((c) => c.chainId.startsWith('research:'))).toEqual({
      chainId: 'research:source:*',
      status: 'UNAVAILABLE',
    });
  });
});

describe('independent checkpoint archive (M4.7)', () => {
  async function signedCheckpoints() {
    const { sources } = await populatedSources();
    const checkpoints = inMemoryAppendOnlyCollection(COLLECTIONS.auditCheckpoints);
    await checkpointAll(sources, checkpoints);
    const stored = await checkpoints.find({}, { sort: { field: 'createdAt', direction: 1 } });
    if (!stored.ok) throw new Error('fixture');
    return { sources, stored: stored.value };
  }

  it('archives trusted checkpoints, and the archive alone detects a rewrite', async () => {
    const { sources, stored } = await signedCheckpoints();
    const result = await archiveCheckpoints({
      archive: [],
      additions: stored,
      trustedKeys: trusted,
      verifier: ed25519Verifier(trusted),
    });
    expect(result.outcome).toEqual({ status: 'ARCHIVED', added: 4, total: 4 });
    // The database copy of the checkpoints could be deleted with the chain: the archive is not.
    const emptied = researchChainStore(
      inMemoryAppendOnlyCollection(COLLECTIONS.researchSources),
      'SOURCE',
    );
    const outcomes = await verifyIntegrity({
      chains: await loadVerifiedChains({ ...sources, research: [emptied] }),
      checkpoints: result.archive ?? [],
      trustedKeys: trusted,
      verifier: ed25519Verifier(trusted),
    });
    expect(outcomes).toContainEqual({
      chainId: `research:source:${RESEARCH_ID}`,
      status: 'CHAIN_MISSING',
    });
  });

  it('refuses forged and untrusted checkpoints, leaving the archive unchanged', async () => {
    const { stored } = await signedCheckpoints();
    const [first] = stored;
    const forged = { ...(first as object), sequence: 0, recordCount: 1 };
    const archive = async (additions: readonly unknown[], keys = trusted) =>
      archiveCheckpoints({
        archive: [],
        additions,
        trustedKeys: keys,
        verifier: ed25519Verifier(keys),
      });
    expect((await archive([forged])).outcome).toMatchObject({
      status: 'NOT_ARCHIVED',
      code: 'CHECKPOINT_SIGNATURE_INVALID',
    });
    expect((await archive(stored, [])).outcome).toMatchObject({
      status: 'NOT_ARCHIVED',
      code: 'CHECKPOINT_KEY_UNTRUSTED',
    });
    expect((await archive(stored, [])).archive).toBeNull();
  });

  it('stores the archive file atomically, owner-readable only; missing means empty', async () => {
    const { stored } = await signedCheckpoints();
    const dir = await mkdtemp(join(tmpdir(), 'khums-archive-'));
    try {
      const file = join(dir, 'checkpoints.json');
      expect(await readArchiveFile(file)).toEqual({ kind: 'READ', value: [] });
      await writeArchiveFile(file, stored);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect(await readArchiveFile(file)).toEqual({ kind: 'READ', value: stored });
      expect(JSON.parse(await readFile(file, 'utf8'))).toHaveLength(4);
      await writeFile(file, '{"not":"a list"}');
      expect(await readArchiveFile(file)).toEqual({ kind: 'INVALID' });
      await writeFile(file, 'not json');
      expect(await readArchiveFile(file)).toEqual({ kind: 'INVALID' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('checkpoint signing configuration', () => {
  const pem = KEY.privateKeyPem;
  it('reads the key id and base64 PEM, and reports names only on error', () => {
    const loaded = loadCheckpointSigningConfig({
      AUDIT_CHECKPOINT_KEY_ID: 'test-key-1',
      AUDIT_CHECKPOINT_SIGNING_KEY: Buffer.from(pem).toString('base64'),
    });
    expect(loaded.ok && loaded.value).toEqual({ keyId: 'test-key-1', privateKeyPem: pem });
    const bad = loadCheckpointSigningConfig({
      AUDIT_CHECKPOINT_KEY_ID: 'Bad Id!',
      AUDIT_CHECKPOINT_SIGNING_KEY: 'secret-value',
    });
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toContain('secret-value');
  });

  it('detects a signing key in the environment (the API server refuses to start)', () => {
    expect(hasCheckpointSigningKey({ AUDIT_CHECKPOINT_SIGNING_KEY: 'x' })).toBe(true);
    expect(hasCheckpointSigningKey({ AUDIT_CHECKPOINT_SIGNING_KEY: '' })).toBe(false);
    expect(hasCheckpointSigningKey({})).toBe(false);
  });
});
