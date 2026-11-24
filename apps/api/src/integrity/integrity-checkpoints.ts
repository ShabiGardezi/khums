import {
  AUDIT_CHAIN_ID,
  POLICY_REGISTRY_CHAIN_ID,
  appendToCheckpointArchive,
  createCheckpoint,
  ledgerChainId,
  liveChainOf,
  replayResearchChain,
  researchChainId,
  replayLedger,
  replayPolicyRegistry,
  verifyAuditChain,
  verifyChainAgainstCheckpoints,
  verifyCheckpointSignature,
  type CheckpointArchiveIssueCode,
  type CheckpointIssueCode,
  type CheckpointSignatureVerifier,
  type CheckpointSigner,
  type TrustedCheckpointKey,
} from '@khums/core';
import type { IntegrityCheckpoint } from '@khums/shared-types';

import { readAuditChain } from '../audit/audit-event.store';
import type { GovernanceLedgerStore } from '../governance/governance-ledger.store';
import type { GovernancePolicyStore } from '../governance/governance-policy.store';
import type { AppendOnlyCollection } from '../persistence/append-only-collection';
import type { ResearchChainStore } from '../research/research-store';

/**
 * The checkpoint job's logic (M4.6.3a; docs/AUTH_ARCHITECTURE.md §4.11): load and fully verify
 * every chain, sign the verified heads, and verify chains against trusted checkpoints. Reports
 * contain chain ids, sequences, digests and codes only (no personal data, no secrets).
 */

export interface ChainSources {
  readonly audit: AppendOnlyCollection;
  readonly policyRegistry: GovernancePolicyStore;
  readonly ledgers: GovernanceLedgerStore;
  /** Research revision chains, one per entity (M5.3.3: sources, passages, translations). */
  readonly research: readonly ResearchChainStore[];
}

interface ChainRecord {
  readonly sequence: number;
  readonly digest: string;
}

export type LoadedChain =
  | {
      readonly chainId: string;
      readonly status: 'VERIFIED';
      readonly records: readonly ChainRecord[];
    }
  | { readonly chainId: string; readonly status: 'INVALID' | 'UNAVAILABLE' };

/** Every chain, each fully verified by `@khums/core` (a broken chain is never signed). */
export async function loadVerifiedChains(sources: ChainSources): Promise<readonly LoadedChain[]> {
  const chains: LoadedChain[] = [];

  const audit = await readAuditChain(sources.audit);
  if (!audit.ok) chains.push({ chainId: AUDIT_CHAIN_ID, status: 'UNAVAILABLE' });
  else {
    const verified = verifyAuditChain(audit.value);
    chains.push(
      verified.ok
        ? {
            chainId: AUDIT_CHAIN_ID,
            status: 'VERIFIED',
            records: (audit.value as ChainRecord[]).map(({ sequence, digest }) => ({
              sequence,
              digest,
            })),
          }
        : { chainId: AUDIT_CHAIN_ID, status: 'INVALID' },
    );
  }

  const registry = await sources.policyRegistry.load();
  if (registry.kind !== 'FOUND')
    chains.push({ chainId: POLICY_REGISTRY_CHAIN_ID, status: 'UNAVAILABLE' });
  else {
    chains.push(
      replayPolicyRegistry(registry.value).ok
        ? {
            chainId: POLICY_REGISTRY_CHAIN_ID,
            status: 'VERIFIED',
            records: registry.value.records.map((r) => ({
              sequence: r.sequence,
              digest: r.recordDigest,
            })),
          }
        : { chainId: POLICY_REGISTRY_CHAIN_ID, status: 'INVALID' },
    );
  }

  const ledgers = await sources.ledgers.loadAll();
  if (!ledgers.ok) chains.push({ chainId: 'governance-ledger:*', status: 'UNAVAILABLE' });
  else {
    for (const ledger of ledgers.value) {
      const chainId = ledgerChainId(ledger.packId, ledger.version);
      chains.push(
        replayLedger(ledger).ok
          ? {
              chainId,
              status: 'VERIFIED',
              records: ledger.records.map((r) => ({
                sequence: r.sequence,
                digest: r.recordDigest,
              })),
            }
          : { chainId, status: 'INVALID' },
      );
    }
  }
  for (const store of sources.research) chains.push(...(await loadResearchChains(store)));
  return chains;
}

/**
 * Every research chain of one collection, each replayed by `@khums/core`. An unreadable collection
 * is reported as a whole (`research:<type>:*`), never silently skipped.
 */
async function loadResearchChains(store: ResearchChainStore): Promise<readonly LoadedChain[]> {
  const wildcard = `research:${store.entityType.toLowerCase()}:*`;
  const refs = await store.entities();
  if (!refs.ok) return [{ chainId: wildcard, status: 'UNAVAILABLE' }];
  const chains: LoadedChain[] = [];
  for (const { entityId } of [...refs.value].sort((a, b) => a.entityId.localeCompare(b.entityId))) {
    const chainId = researchChainId(store.entityType, entityId);
    const loaded = await store.load(entityId);
    if (loaded.kind !== 'FOUND') {
      chains.push({ chainId, status: loaded.kind === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'INVALID' });
      continue;
    }
    chains.push(
      replayResearchChain(loaded.value).ok
        ? {
            chainId,
            status: 'VERIFIED',
            records: loaded.value.records.map((r) => ({
              sequence: r.revision,
              digest: r.recordDigest,
            })),
          }
        : { chainId, status: 'INVALID' },
    );
  }
  return chains;
}

export type CheckpointOutcome =
  | {
      readonly chainId: string;
      readonly status: 'CHECKPOINTED';
      readonly checkpoint: IntegrityCheckpoint;
    }
  | {
      readonly chainId: string;
      readonly status:
        | 'ALREADY_CHECKPOINTED'
        | 'EMPTY'
        | 'NOT_SIGNED_CHAIN_INVALID'
        | 'NOT_SIGNED_CHAIN_UNAVAILABLE'
        | 'NOT_STORED';
    };

/** Signs the head of every verified, non-empty chain and stores the checkpoint. */
export async function createIntegrityCheckpoints(deps: {
  readonly chains: readonly LoadedChain[];
  readonly signer: CheckpointSigner;
  readonly checkpoints: AppendOnlyCollection;
  readonly now: () => number;
  readonly newId: () => string;
}): Promise<readonly CheckpointOutcome[]> {
  const outcomes: CheckpointOutcome[] = [];
  for (const chain of deps.chains) {
    if (chain.status !== 'VERIFIED') {
      outcomes.push({
        chainId: chain.chainId,
        status:
          chain.status === 'INVALID' ? 'NOT_SIGNED_CHAIN_INVALID' : 'NOT_SIGNED_CHAIN_UNAVAILABLE',
      });
      continue;
    }
    const head = chain.records.at(-1);
    if (head === undefined) {
      outcomes.push({ chainId: chain.chainId, status: 'EMPTY' });
      continue;
    }
    const created = await createCheckpoint(
      {
        checkpointId: deps.newId(),
        chainId: chain.chainId,
        head,
        createdAt: new Date(deps.now()).toISOString(),
      },
      deps.signer,
    );
    if (!created.ok) {
      outcomes.push({ chainId: chain.chainId, status: 'NOT_STORED' });
      continue;
    }
    const stored = await deps.checkpoints.insert(created.value);
    if (stored.kind === 'INSERTED') {
      outcomes.push({ chainId: chain.chainId, status: 'CHECKPOINTED', checkpoint: created.value });
    } else if (stored.kind === 'DUPLICATE' && stored.index === 'chain_sequence_key_unique') {
      outcomes.push({ chainId: chain.chainId, status: 'ALREADY_CHECKPOINTED' });
    } else {
      outcomes.push({ chainId: chain.chainId, status: 'NOT_STORED' });
    }
  }
  return outcomes;
}

export type VerificationOutcome =
  | {
      readonly chainId: string;
      readonly status: 'VERIFIED';
      readonly checkpoints: number;
      readonly latestSequence: number | null;
    }
  | {
      readonly chainId: string;
      readonly status: 'CHAIN_INVALID' | 'CHAIN_UNAVAILABLE' | 'CHAIN_MISSING';
    }
  | {
      readonly chainId: string;
      readonly status: 'CHECKPOINT_FAILED';
      readonly code: CheckpointIssueCode;
    };

const chainIdOf = (raw: unknown): string | null => {
  const value = (raw as { chainId?: unknown } | null)?.chainId;
  return typeof value === 'string' ? value : null;
};

/**
 * Verifies every chain against the given checkpoints (from the independent archive, or the
 * database copy). A checkpoint for a chain that no longer exists (a deleted ledger) is reported as
 * `CHAIN_MISSING`. Any status other than `VERIFIED` is an integrity incident.
 */
export async function verifyIntegrity(deps: {
  readonly chains: readonly LoadedChain[];
  readonly checkpoints: readonly unknown[];
  readonly trustedKeys: readonly TrustedCheckpointKey[];
  readonly verifier: CheckpointSignatureVerifier;
}): Promise<readonly VerificationOutcome[]> {
  const outcomes: VerificationOutcome[] = [];
  const known = new Set(deps.chains.map((c) => c.chainId));
  for (const chain of deps.chains) {
    if (chain.status !== 'VERIFIED') {
      outcomes.push({
        chainId: chain.chainId,
        status: chain.status === 'INVALID' ? 'CHAIN_INVALID' : 'CHAIN_UNAVAILABLE',
      });
      continue;
    }
    const result = await verifyChainAgainstCheckpoints(
      liveChainOf(chain.chainId, chain.records),
      deps.checkpoints.filter((cp) => chainIdOf(cp) === chain.chainId),
      deps.trustedKeys,
      deps.verifier,
    );
    outcomes.push(
      result.ok
        ? {
            chainId: chain.chainId,
            status: 'VERIFIED',
            checkpoints: result.value.verified,
            latestSequence: result.value.latest?.sequence ?? null,
          }
        : { chainId: chain.chainId, status: 'CHECKPOINT_FAILED', code: result.error.code },
    );
  }
  const missing = new Set(
    deps.checkpoints.map(chainIdOf).filter((id): id is string => id !== null && !known.has(id)),
  );
  for (const chainId of [...missing].sort()) outcomes.push({ chainId, status: 'CHAIN_MISSING' });
  return outcomes;
}

export type ArchiveOutcome =
  | { readonly status: 'ARCHIVED'; readonly added: number; readonly total: number }
  | {
      readonly status: 'NOT_ARCHIVED';
      readonly code: CheckpointArchiveIssueCode | CheckpointIssueCode;
      readonly checkpointId: string | null;
    };

/**
 * Copies checkpoints into the independent archive (M4.7, the KMS-free private-review setup;
 * docs/DEPLOYMENT_FREE_TIER.md §6). Every addition must carry a valid signature by a key in the
 * version-controlled trusted list, so neither a forged database checkpoint nor one signed with an
 * unregistered key ever enters the archive. All-or-nothing: on any issue the archive is unchanged.
 */
export async function archiveCheckpoints(deps: {
  readonly archive: readonly unknown[];
  readonly additions: readonly unknown[];
  readonly trustedKeys: readonly TrustedCheckpointKey[];
  readonly verifier: CheckpointSignatureVerifier;
}): Promise<
  | {
      readonly outcome: ArchiveOutcome & { status: 'ARCHIVED' };
      readonly archive: readonly IntegrityCheckpoint[];
    }
  | { readonly outcome: ArchiveOutcome & { status: 'NOT_ARCHIVED' }; readonly archive: null }
> {
  const verified: IntegrityCheckpoint[] = [];
  for (const raw of deps.additions) {
    const checked = await verifyCheckpointSignature(raw, deps.trustedKeys, deps.verifier);
    if (!checked.ok) {
      const id = (raw as { checkpointId?: unknown } | null)?.checkpointId;
      return {
        outcome: {
          status: 'NOT_ARCHIVED',
          code: checked.error,
          checkpointId: typeof id === 'string' ? id : null,
        },
        archive: null,
      };
    }
    verified.push(checked.value);
  }
  const merged = appendToCheckpointArchive(deps.archive, verified);
  if (!merged.ok) {
    return {
      outcome: { status: 'NOT_ARCHIVED', code: merged.error, checkpointId: null },
      archive: null,
    };
  }
  return {
    outcome: {
      status: 'ARCHIVED',
      added: merged.value.added,
      total: merged.value.archive.length,
    },
    archive: merged.value.archive,
  };
}
