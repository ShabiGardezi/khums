/**
 * Append-only, hash-chained audit events and signed integrity checkpoints (M4.6.3a;
 * docs/DATABASE_SCHEMA.md §3.8–§3.9, docs/AUTH_ARCHITECTURE.md §4.11).
 *
 * Audit events never contain passwords, session ids, CSRF tokens, secrets, personal data beyond
 * opaque principal ids, or financial values. Detail values are deliberately limited to short
 * strings, booleans and string lists.
 */

/** A value in `AuditEventDraft.details`. Numbers are excluded on purpose (no amounts). */
export type AuditDetailValue = string | boolean | null | readonly string[];

/** What an event is about, by opaque id only (for example `{ kind: 'staffAccount', id }`). */
export interface AuditTarget {
  readonly kind: string;
  readonly id: string;
}

/** An event as the caller describes it, before it is placed in the chain. */
export interface AuditEventDraft {
  /** Caller-generated UUID; the idempotency key for retries (unique). */
  readonly eventId: string;
  /** Dotted name such as `staff.signin.failed` or `governance.policy.changed`. */
  readonly type: string;
  /** The acting principal id, or null (for example an anonymous failed sign-in). */
  readonly actor: string | null;
  readonly targets: readonly AuditTarget[];
  readonly marjaIds: readonly string[];
  readonly details: Readonly<Record<string, AuditDetailValue>>;
  /** Server correlation id of the request, when there is one. */
  readonly requestId: string | null;
  /** ISO 8601 UTC with milliseconds, from the injected clock. */
  readonly occurredAt: string;
}

/** An event in the chain. */
export interface AuditEvent extends AuditEventDraft {
  /** 0-based, contiguous, unique. */
  readonly sequence: number;
  /** `digest` of the event at `sequence - 1`, or null for the first. */
  readonly previousDigest: string | null;
  /** SHA-256 (64 lowercase hex) of the canonical event without `digest`. */
  readonly digest: string;
}

/** The last record of a chain. Always derived from the records, never stored as a document. */
export interface ChainHead {
  readonly sequence: number;
  readonly digest: string;
}

/**
 * Identifies a chain: `audit`, `governance-policy-registry`, or `governance-ledger:{packId}@{version}`.
 */
export type IntegrityChainId = string;

/** A signed statement that a chain's record at `sequence` had exactly `digest`. No personal data. */
export interface IntegrityCheckpoint {
  readonly checkpointId: string;
  readonly chainId: IntegrityChainId;
  readonly sequence: number;
  readonly digest: string;
  /** Always `sequence + 1`. */
  readonly recordCount: number;
  readonly createdAt: string;
  /** The signing key's id in the version-controlled trusted key list. */
  readonly keyId: string;
  /** Ed25519 signature (base64url) over `checkpointSigningPayload`. */
  readonly signature: string;
}

export type UnsignedIntegrityCheckpoint = Omit<IntegrityCheckpoint, 'signature'>;
