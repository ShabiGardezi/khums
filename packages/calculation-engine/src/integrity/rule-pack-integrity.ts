import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type {
  CalculationIssue,
  CanonicalizationVersion,
  ContentIntegrity,
  IntegrityScope,
  RulePack,
} from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';

import { issue } from '../issues';
import { canonicalize, utf8Bytes, type CanonicalizationError } from './canonical';

/**
 * Rule-pack content integrity (FR-1; RULE_PACK_STRUCTURE §5.8).
 *
 * The digest is SHA-256 over the UTF-8 bytes of the `khums-jcs-1` canonical form of
 *   { "canonicalization": "khums-jcs-1", "scope": "rule-pack-content-1", "content": <content> }
 * where <content> is the whole pack except the fields listed in `EXCLUDED_METADATA_FIELDS`.
 * Including the versions in the hashed bytes binds every digest to how it was produced.
 *
 * Nothing here caches: every call recomputes from the pack object it is given.
 */

export const RULE_PACK_CANONICALIZATION: CanonicalizationVersion = 'khums-jcs-1';
export const RULE_PACK_INTEGRITY_SCOPE: IntegrityScope = 'rule-pack-content-1';

/**
 * Metadata fields outside the hashed content, and why:
 * - `integrity`, `contentHash`: the declared digest itself (would be circular);
 * - `approvals`: approval records sign the digest (circular); each approval carries the
 *   integrity it covers, which is verified against the recomputed digest;
 * - `status`: lifecycle state (DRAFT → IN_REVIEW → APPROVED → PUBLISHED) that must change after
 *   approval without changing the approved content.
 * Every other field, at every level, is hashed, including fields this code does not know about.
 */
export const EXCLUDED_METADATA_FIELDS = [
  'integrity',
  'contentHash',
  'approvals',
  'status',
] as const;

const DIGEST = /^[0-9a-f]{64}$/;

export type IntegrityComputationError =
  | { readonly code: 'MALFORMED_PACK'; readonly path: string }
  | (CanonicalizationError & { readonly kind?: never });

/** The hashed content: the pack without the excluded metadata fields (nothing else removed). */
function hashedContent(pack: unknown): Result<Record<string, unknown>, IntegrityComputationError> {
  if (typeof pack !== 'object' || pack === null || Array.isArray(pack)) {
    return err({ code: 'MALFORMED_PACK', path: '$' });
  }
  const { metadata, ...rest } = pack as Record<string, unknown>;
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return err({ code: 'MALFORMED_PACK', path: '$.metadata' });
  }
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!(EXCLUDED_METADATA_FIELDS as readonly string[]).includes(key)) content[key] = value;
  }
  return ok({ ...rest, metadata: content });
}

/** Canonical text that is hashed (exposed for inspection and tests). */
export function canonicalRulePackContent(pack: unknown): Result<string, IntegrityComputationError> {
  const content = hashedContent(pack);
  if (!content.ok) return content;
  return canonicalize({
    canonicalization: RULE_PACK_CANONICALIZATION,
    scope: RULE_PACK_INTEGRITY_SCOPE,
    content: content.value,
  });
}

/** Independently computes the pack's content integrity from its actual content. */
export function computeRulePackIntegrity(
  pack: unknown,
): Result<ContentIntegrity, IntegrityComputationError> {
  const canonical = canonicalRulePackContent(pack);
  if (!canonical.ok) return canonical;
  return ok({
    algorithm: 'SHA-256',
    canonicalization: RULE_PACK_CANONICALIZATION,
    scope: RULE_PACK_INTEGRITY_SCOPE,
    digest: bytesToHex(sha256(utf8Bytes(canonical.value))),
  });
}

/** Whether a value is a well-formed `ContentIntegrity` of a supported kind. */
export function isSupportedIntegrity(value: unknown): value is ContentIntegrity {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).length === 4 &&
    v.algorithm === 'SHA-256' &&
    v.canonicalization === RULE_PACK_CANONICALIZATION &&
    v.scope === RULE_PACK_INTEGRITY_SCOPE &&
    typeof v.digest === 'string' &&
    DIGEST.test(v.digest)
  );
}

/** Whether a value has the integrity shape at all (any versions), for structure validation. */
export function isWellShapedIntegrity(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).sort().join(',') === 'algorithm,canonicalization,digest,scope' &&
    typeof v.algorithm === 'string' &&
    typeof v.canonicalization === 'string' &&
    typeof v.scope === 'string' &&
    typeof v.digest === 'string' &&
    DIGEST.test(v.digest)
  );
}

const INTEGRITY_FIELDS = ['algorithm', 'canonicalization', 'scope', 'digest'] as const;

/** Exact equality of two integrity records (all four fields), as untrusted runtime values. */
export function sameIntegrity(
  a: ContentIntegrity | undefined | null,
  b: ContentIntegrity,
): boolean {
  if (a === undefined || a === null) return false;
  const left = a as unknown as Readonly<Record<string, unknown>>;
  const right = b as unknown as Readonly<Record<string, unknown>>;
  return INTEGRITY_FIELDS.every((field) => left[field] === right[field]);
}

/** Structural integrity issues (errors in every mode): unhashable content or malformed records. */
export function integrityStructureIssues(pack: RulePack): CalculationIssue[] {
  const issues: CalculationIssue[] = [];
  const computed = computeRulePackIntegrity(pack);
  if (!computed.ok) {
    issues.push(
      issue(
        'PACK_NOT_CANONICALIZABLE',
        `Pack content cannot be canonicalized (${computed.error.code})`,
        computed.error.path,
      ),
    );
  }
  const { integrity } = pack.metadata;
  if (integrity !== undefined && !isWellShapedIntegrity(integrity)) {
    issues.push(
      issue('PACK_INTEGRITY_MALFORMED', 'Declared integrity is malformed', 'metadata.integrity'),
    );
  }
  pack.metadata.approvals.forEach((approval, index) => {
    if (approval.integrity !== undefined && !isWellShapedIntegrity(approval.integrity)) {
      issues.push(
        issue(
          'PACK_INTEGRITY_MALFORMED',
          'Approval integrity is malformed',
          `metadata.approvals.${String(index)}.integrity`,
        ),
      );
    }
  });
  return issues;
}

/**
 * Declared-integrity verification: recomputes the digest and compares. Returns the recomputed
 * integrity (or null) and the blocking issues. Callers decide severity by mode.
 */
export function verifyDeclaredIntegrity(pack: RulePack): {
  readonly computed: ContentIntegrity | null;
  readonly issues: CalculationIssue[];
} {
  const issues: CalculationIssue[] = [];
  const computed = computeRulePackIntegrity(pack);
  const { metadata } = pack;
  if (metadata.contentHash !== null) {
    issues.push(
      issue(
        'READINESS_LEGACY_CONTENT_HASH',
        'Legacy contentHash cannot be verified (no canonicalization); use metadata.integrity',
        'metadata.contentHash',
      ),
    );
  }
  if (!computed.ok) {
    issues.push(
      issue(
        'PACK_NOT_CANONICALIZABLE',
        'Pack content cannot be canonicalized',
        computed.error.path,
      ),
    );
    return { computed: null, issues };
  }
  const declared = metadata.integrity;
  if (declared === undefined) {
    issues.push(
      issue(
        'READINESS_MISSING_CONTENT_HASH',
        'Rule pack declares no content integrity',
        'metadata.integrity',
      ),
    );
  } else if (!isSupportedIntegrity(declared)) {
    issues.push(
      issue(
        'READINESS_INTEGRITY_UNSUPPORTED',
        'Declared integrity uses an unsupported algorithm, canonicalization or scope, or is malformed',
        'metadata.integrity',
      ),
    );
  } else if (declared.digest !== computed.value.digest) {
    issues.push(
      issue(
        'READINESS_INTEGRITY_MISMATCH',
        'Declared digest does not match the digest recomputed from the pack content',
        'metadata.integrity',
      ),
    );
  }
  return { computed: computed.value, issues };
}

/** Returns a copy of the pack with `metadata.integrity` set to its recomputed value (tooling). */
export function sealRulePack(pack: RulePack): Result<RulePack, IntegrityComputationError> {
  const computed = computeRulePackIntegrity(pack);
  if (!computed.ok) return computed;
  return ok({ ...pack, metadata: { ...pack.metadata, integrity: computed.value } });
}

/** Digest recomputed from the pack content, or null when it cannot be canonicalized. */
export function recomputedDigest(pack: RulePack): string | null {
  const computed = computeRulePackIntegrity(pack);
  return computed.ok ? computed.value.digest : null;
}

/**
 * SHA-256 (lowercase hex) of the `khums-jcs-1` canonical form of any value. Shared by the
 * governance ledger's hash chain so canonicalization and hashing exist in exactly one place.
 */
export function canonicalDigest(value: unknown): Result<string, CanonicalizationError> {
  const canonical = canonicalize(value);
  if (!canonical.ok) return canonical;
  return ok(bytesToHex(sha256(utf8Bytes(canonical.value))));
}
