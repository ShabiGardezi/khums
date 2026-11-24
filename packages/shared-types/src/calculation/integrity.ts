/**
 * Rule-pack content integrity (M4.4.2, FR-1). docs/research/RULE_PACK_STRUCTURE.md §5.8.
 *
 * The digest is ALWAYS recomputed from the pack's actual content at every verification point;
 * a declared value is only ever compared, never trusted.
 */

/** Hash algorithm. */
export type IntegrityAlgorithm = 'SHA-256';

/**
 * Canonicalization version: how content becomes bytes. `khums-jcs-1` is the RFC 8785 (JCS)
 * profile documented in §5.8 (safe integers only, no undefined, well-formed UTF-16, UTF-8 output).
 * Independent of the pack `schemaVersion`.
 */
export type CanonicalizationVersion = 'khums-jcs-1';

/**
 * Content scope: which fields are hashed. `rule-pack-content-1` = the whole pack except
 * `metadata.integrity`, `metadata.contentHash`, `metadata.approvals` and `metadata.status`.
 */
export type IntegrityScope = 'rule-pack-content-1';

/** A content digest bound to its algorithm, canonicalization and scope. */
export interface ContentIntegrity {
  readonly algorithm: IntegrityAlgorithm;
  readonly canonicalization: CanonicalizationVersion;
  readonly scope: IntegrityScope;
  /** SHA-256 of the canonical bytes, 64 lowercase hexadecimal characters. */
  readonly digest: string;
}
