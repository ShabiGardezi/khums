/**
 * Every server collection of the staff, governance and audit model (M4.6.3a;
 * docs/DATABASE_SCHEMA.md §3.8–§3.9). The single source for the migration (collections,
 * validators, indexes), the least-privilege database roles and the in-memory test adapters.
 *
 * `APPEND_ONLY`: the application may only insert and read; history is never changed.
 * `CONTROLLED_UPDATE`: the application may insert, read and update (never remove; expiry is done
 * by TTL indexes on the server).
 */

export type CollectionAccess = 'APPEND_ONLY' | 'CONTROLLED_UPDATE';

export interface IndexSpec {
  readonly name: string;
  readonly key: Readonly<Record<string, 1 | -1>>;
  readonly unique?: true;
  /** TTL index: the server deletes the document this many seconds after the date in the key. */
  readonly expireAfterSeconds?: number;
}

export interface CollectionSpec {
  readonly name: string;
  readonly access: CollectionAccess;
  readonly indexes: readonly IndexSpec[];
  /** Fields the `$jsonSchema` validator requires (full shape is checked with Zod on read). */
  readonly required: readonly string[];
}

const unique = (name: string, key: IndexSpec['key']): IndexSpec => ({ name, key, unique: true });

/** Fields every research revision document carries (the record itself is `recordJson`). */
const RESEARCH_CHAIN_FIELDS = [
  'entityType',
  'entityId',
  'revision',
  'recordId',
  'marjaId',
  'displayRef',
  'kind',
  'recordedAt',
  'recordDigest',
  'recordJson',
] as const;

export const COLLECTIONS = {
  auditEvents: {
    name: 'auditEvents',
    access: 'APPEND_ONLY',
    indexes: [unique('sequence_unique', { sequence: 1 }), unique('eventId_unique', { eventId: 1 })],
    required: ['eventId', 'type', 'sequence', 'previousDigest', 'digest', 'occurredAt'],
  },
  auditCheckpoints: {
    name: 'auditCheckpoints',
    access: 'APPEND_ONLY',
    indexes: [
      unique('checkpointId_unique', { checkpointId: 1 }),
      unique('chain_sequence_key_unique', { chainId: 1, sequence: 1, keyId: 1 }),
    ],
    required: ['checkpointId', 'chainId', 'sequence', 'digest', 'keyId', 'signature'],
  },
  governanceLedgerRecords: {
    name: 'governanceLedgerRecords',
    access: 'APPEND_ONLY',
    indexes: [
      unique('ledger_sequence_unique', { packId: 1, version: 1, sequence: 1 }),
      unique('recordId_unique', { recordId: 1 }),
    ],
    required: ['packId', 'version', 'sequence', 'recordId', 'recordDigest', 'type'],
  },
  governancePolicyRegistry: {
    name: 'governancePolicyRegistry',
    access: 'APPEND_ONLY',
    indexes: [
      unique('sequence_unique', { sequence: 1 }),
      unique('recordId_unique', { recordId: 1 }),
    ],
    required: ['sequence', 'recordId', 'recordDigest', 'kind', 'marjaId'],
  },
  /**
   * Write-once rule-pack content bound by governance records (M4.6.4a, decision D2). One document
   * per binding: the content a SUBMITTED record bound, and the published content a PUBLISHED record
   * produced. `packJson` is the exact canonical JSON; every read re-verifies its digest against
   * `digest` and the ledger. Never updated or deleted, so published content stays immutable.
   */
  rulePackContents: {
    name: 'rulePackContents',
    access: 'APPEND_ONLY',
    indexes: [
      // The binding record (deterministic `packId@version#sequence`) and the content kind.
      unique('record_kind_unique', { recordId: 1, kind: 1 }),
      { name: 'pack_version', key: { packId: 1, version: 1 } },
      { name: 'marjaId', key: { marjaId: 1 } },
    ],
    required: [
      'recordId',
      'kind',
      'packId',
      'version',
      'marjaId',
      'digest',
      'packJson',
      'storedAt',
    ],
  },
  /**
   * Scholar research revision chains (M5.3.3; docs/SCHOLAR_RESEARCH_ARCHITECTURE.md §4.2): one
   * append-only, hash-chained chain per entity, replayed by `@khums/core` on every read. Each
   * document is one revision; `recordJson` is the exact record (verified against `recordDigest`
   * on replay), the other fields are copies for indexing. `{entityId, revision}` is unique, so of
   * two concurrent writers of the same revision exactly one commits. A display-reference or id
   * collision on revision 0 makes the API draw a new UUIDv7.
   */
  researchSources: {
    name: 'researchSources',
    access: 'APPEND_ONLY',
    indexes: [
      unique('entity_revision_unique', { entityId: 1, revision: 1 }),
      unique('recordId_unique', { recordId: 1 }),
      unique('displayRef_revision_unique', { displayRef: 1, revision: 1 }),
      { name: 'marja_revision', key: { marjaId: 1, revision: 1 } },
    ],
    required: RESEARCH_CHAIN_FIELDS,
  },
  sourcePassages: {
    name: 'sourcePassages',
    access: 'APPEND_ONLY',
    indexes: [
      unique('entity_revision_unique', { entityId: 1, revision: 1 }),
      unique('recordId_unique', { recordId: 1 }),
      unique('displayRef_revision_unique', { displayRef: 1, revision: 1 }),
      { name: 'marja_revision', key: { marjaId: 1, revision: 1 } },
      { name: 'sourceId', key: { sourceId: 1 } },
    ],
    required: [...RESEARCH_CHAIN_FIELDS, 'sourceId'],
  },
  /** Translations are separate records from the original passage text (never overriding it). */
  passageTranslations: {
    name: 'passageTranslations',
    access: 'APPEND_ONLY',
    indexes: [
      unique('entity_revision_unique', { entityId: 1, revision: 1 }),
      unique('recordId_unique', { recordId: 1 }),
      unique('displayRef_revision_unique', { displayRef: 1, revision: 1 }),
      { name: 'marja_revision', key: { marjaId: 1, revision: 1 } },
      { name: 'passage_language', key: { passageId: 1, language: 1 } },
    ],
    required: [...RESEARCH_CHAIN_FIELDS, 'passageId', 'language'],
  },
  /**
   * Research findings (M5.3.4; architecture §4.2, D14): layer A, one chain per finding, bound to
   * one catalogue question. `questionId` is an index copy of the record's question binding.
   */
  researchFindings: {
    name: 'researchFindings',
    access: 'APPEND_ONLY',
    indexes: [
      unique('entity_revision_unique', { entityId: 1, revision: 1 }),
      unique('recordId_unique', { recordId: 1 }),
      unique('displayRef_revision_unique', { displayRef: 1, revision: 1 }),
      { name: 'marja_revision', key: { marjaId: 1, revision: 1 } },
      { name: 'marja_question', key: { marjaId: 1, questionId: 1 } },
    ],
    required: [...RESEARCH_CHAIN_FIELDS, 'questionId'],
  },
  /**
   * Religious ruling versions (M5.3.4, M5.3.5; architecture §4.2): layer B, one chain per ruling
   * version; every version of one ruling shares `rulingSeriesId` (version 1's entity id). Of two
   * concurrent corrections creating the same version number exactly one commits
   * (`series_version_revision_unique`).
   */
  religiousRulings: {
    name: 'religiousRulings',
    access: 'APPEND_ONLY',
    indexes: [
      unique('entity_revision_unique', { entityId: 1, revision: 1 }),
      unique('recordId_unique', { recordId: 1 }),
      unique('displayRef_revision_unique', { displayRef: 1, revision: 1 }),
      unique('series_version_revision_unique', {
        rulingSeriesId: 1,
        rulingVersion: 1,
        revision: 1,
      }),
      { name: 'marja_revision', key: { marjaId: 1, revision: 1 } },
    ],
    required: [...RESEARCH_CHAIN_FIELDS, 'rulingVersion', 'rulingSeriesId'],
  },
  /**
   * Write-once evidence metadata (M5.3.3; architecture §4.3): SHA-256, size, media type, copyright
   * and the immutable storage key. The bytes are never in MongoDB: they are in private encrypted
   * storage behind `EvidenceStorage`. One file per digest per Marja (Marja isolation: the same
   * file in another Marja is a separate artefact, and nothing reveals it exists there).
   */
  evidenceArtefacts: {
    name: 'evidenceArtefacts',
    access: 'APPEND_ONLY',
    indexes: [
      unique('artefactId_unique', { artefactId: 1 }),
      unique('marja_digest_unique', { marjaId: 1, digest: 1 }),
      { name: 'sourceId', key: { sourceId: 1 } },
      { name: 'marjaId', key: { marjaId: 1 } },
    ],
    required: [
      'artefactId',
      'marjaId',
      'sourceId',
      'digest',
      'size',
      'mediaType',
      'storageKey',
      'recordedAt',
    ],
  },
  /**
   * Scholar rule builder revisions (Phase 2 step 3; docs/PHASE2_PLAN.md): one document per save,
   * append-only. `recordJson` is the exact revision record (validated on every read); the other
   * fields are index copies. `{ruleId, revision}` is unique, so of two concurrent saves of the
   * same revision exactly one commits. Holds scholar-entered builder fields only, never figures.
   */
  scholarRuleRevisions: {
    name: 'scholarRuleRevisions',
    access: 'APPEND_ONLY',
    indexes: [
      unique('rule_revision_unique', { ruleId: 1, revision: 1 }),
      { name: 'marja_revision', key: { marjaId: 1, revision: 1 } },
    ],
    required: ['ruleId', 'revision', 'marjaId', 'recordJson', 'actor', 'at', 'reason'],
  },
  /**
   * Scholar requests (Phase 4): a missing rule or a calculation change, and its single
   * resolution, one document each, append-only. `recordJson` is the exact record (validated on
   * every read); `{requestId, type}` is unique, so a request is resolved at most once. Holds
   * request text only (never logged or audited), never figures.
   */
  scholarRuleRequests: {
    name: 'scholarRuleRequests',
    access: 'APPEND_ONLY',
    indexes: [
      unique('request_type_unique', { requestId: 1, type: 1 }),
      { name: 'marja_at', key: { marjaId: 1, at: 1 } },
    ],
    required: ['requestId', 'type', 'marjaId', 'recordJson', 'actor', 'at'],
  },
  /**
   * Source verifications of builder rule revisions (Phase 2 step 5, decision 67): one document per
   * verification, append-only, written in the same unit of work as the builder pack version it
   * produced (ledger records, content, audit). `recordJson` is the exact record (validated on
   * every read); the other fields are index copies. Attestations and ids only, never figures.
   */
  ruleVerificationRecords: {
    name: 'ruleVerificationRecords',
    access: 'APPEND_ONLY',
    indexes: [
      unique('verification_unique', { verificationId: 1 }),
      { name: 'rule_revision', key: { ruleId: 1, revision: 1 } },
      { name: 'marja_at', key: { marjaId: 1, at: 1 } },
    ],
    required: [
      'verificationId',
      'ruleId',
      'revision',
      'marjaId',
      'contentHash',
      'recordJson',
      'actor',
      'at',
    ],
  },
  staffRoleAssignments: {
    name: 'staffRoleAssignments',
    access: 'APPEND_ONLY',
    // One GRANTED and at most one REVOKED record per assignment; revocation is a new record.
    indexes: [
      unique('recordId_unique', { recordId: 1 }),
      unique('assignment_kind_unique', { assignmentId: 1, kind: 1 }),
      { name: 'principalId', key: { principalId: 1 } },
    ],
    required: ['recordId', 'kind', 'assignmentId', 'principalId', 'role', 'scope', 'actor', 'at'],
  },
  administrativeControl: {
    name: 'administrativeControl',
    access: 'APPEND_ONLY',
    indexes: [unique('sequence_unique', { sequence: 1 })],
    required: ['sequence', 'kind', 'setting', 'actor', 'recordedAt'],
  },
  staffAccounts: {
    name: 'staffAccounts',
    access: 'CONTROLLED_UPDATE',
    indexes: [
      unique('principalId_unique', { principalId: 1 }),
      unique('usernameKey_unique', { usernameKey: 1 }),
    ],
    required: ['principalId', 'usernameKey', 'passwordHash', 'status', 'sessionEpoch', 'version'],
  },
  staffSessions: {
    name: 'staffSessions',
    access: 'CONTROLLED_UPDATE',
    indexes: [
      unique('sessionIdHash_unique', { sessionIdHash: 1 }),
      { name: 'principalId', key: { principalId: 1 } },
      // `expireAt` is a BSON Date (TTL indexes need dates): the absolute expiry.
      { name: 'expireAt_ttl', key: { expireAt: 1 }, expireAfterSeconds: 0 },
    ],
    required: ['sessionIdHash', 'principalId', 'csrfTokenHash', 'absoluteExpiresAt', 'expireAt'],
  },
  staffLoginThrottles: {
    name: 'staffLoginThrottles',
    access: 'CONTROLLED_UPDATE',
    indexes: [
      unique('key_unique', { key: 1 }),
      { name: 'expireAt_ttl', key: { expireAt: 1 }, expireAfterSeconds: 0 },
    ],
    required: ['key', 'failures', 'expireAt'],
  },
} as const satisfies Record<string, CollectionSpec>;

export type CollectionName = keyof typeof COLLECTIONS;

export const ALL_COLLECTIONS: readonly CollectionSpec[] = Object.values(COLLECTIONS);

export type AppendOnlyCollectionSpec = (typeof COLLECTIONS)[{
  [K in CollectionName]: (typeof COLLECTIONS)[K]['access'] extends 'APPEND_ONLY' ? K : never;
}[CollectionName]];

export type ControlledCollectionSpec = (typeof COLLECTIONS)[{
  [K in CollectionName]: (typeof COLLECTIONS)[K]['access'] extends 'CONTROLLED_UPDATE' ? K : never;
}[CollectionName]];
