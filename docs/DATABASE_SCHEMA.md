# Database Schema (Proposed)

> Status: **Design proposal**, except §3.8–§3.9 (staff identity, governance, audit, concurrency and
> permissions): accepted design (2026-11-21). The persistence foundation of §3.9 (append-only
> collections, audit chain, checkpoints, governance stores) is implemented in M4.6.3a; staff
> account, session, throttle, role and administrative-control collections are used by staff
> authentication since M4.6.2b. The server
> database is introduced in Milestone 6 with optional cloud sync. Anonymous users never create
> server records containing financial data.

## 1. Technology

- **MongoDB Atlas** (managed, encryption at rest, backups, region selection).
- **Driver (M4.6.3a decision, ARCHITECTURE decision 38): the official `mongodb` Node.js driver**,
  with `$jsonSchema` collection validators and Zod validation of every document read. Mongoose was
  the earlier proposal (below, kept on record); append-only, hash-chained collections need only
  `insertOne`/`find` plus unique indexes, which the driver expresses directly.
- _Earlier proposal:_ **ODM: Mongoose** (not adopted). Rationale: schema enforcement at the database
  layer, middleware for audit fields, mature NestJS integration (`@nestjs/mongoose`).
  The API contract remains the Zod schemas in `@khums/validation`; Mongoose schemas are a
  persistence detail inside `apps/api` and are never imported by shared packages.
  _Alternative:_ native `mongodb` driver + Zod validation + `$jsonSchema` collection validators —
  fewer abstractions, but more hand-written plumbing.

## 2. Conventions

- Collection names: plural, `camelCase` (`ruleSets`, `assessments`).
- Primary keys: client-generated **UUIDv7** strings in `_id` for user-owned, syncable documents
  (allows offline creation and idempotent sync); ObjectId for server-only documents.
- Every document: `createdAt`, `updatedAt` (UTC `Date`), `schemaVersion` (int) for migrations.
- Syncable documents: `version` (int, optimistic concurrency), `deletedAt` (soft delete, tombstone
  for sync), `deviceId` of last writer.
- **Money:** stored as `Decimal128` _or_ decimal string + `currency` (ISO 4217). Never `double`.
  Decision recorded in Milestone 6; both preserve exactness.
- Sensitive financial fields are encrypted client-side or with field-level encryption before
  storage (see `SECURITY.md`); the schema marks them with 🔒.

## 3. Collections

### 3.1 `users`

| Field                 | Type     | Notes                                                                  |
| --------------------- | -------- | ---------------------------------------------------------------------- |
| `_id`                 | ObjectId |                                                                        |
| `authProviderId`      | string   | Subject from identity provider; unique index.                          |
| `email`               | string?  | Optional, only if provider supplies it; unique sparse.                 |
| `displayName`         | string?  |                                                                        |
| `locale`              | string   | BCP-47, e.g. `en`, `ur`, `fa`.                                         |
| `preferences`         | object   | `{ marjaId, currency, khumsYearStart: { month, day } }`                |
| `encryptionKeyMeta`   | object?  | Wrapped-key metadata for client-side encryption; never the key itself. |
| `createdAt/updatedAt` | Date     |                                                                        |

### 3.2 `maraje`

Public reference data (also bundled in the client).

| Field              | Type     | Notes                                    |
| ------------------ | -------- | ---------------------------------------- |
| `_id`              | string   | Stable slug id.                          |
| `names`            | object   | Localized names `{ en, ar, fa, ur, … }`. |
| `status`           | enum     | `active`, `inactive`, `deceased`.        |
| `officialUrls`     | string[] |                                          |
| `currentRuleSetId` | string?  | Points at latest **published** version.  |

### 3.3 `ruleSets`

Immutable once `status = published`. Mirrors the files in `@khums/marja-rules`.

| Field           | Type     | Notes                                                        |
| --------------- | -------- | ------------------------------------------------------------ |
| `_id`           | string   | `<marjaId>@<semver>`                                         |
| `marjaId`       | string   | Index.                                                       |
| `version`       | string   | SemVer.                                                      |
| `status`        | enum     | `draft`, `in_review`, `approved`, `published`, `superseded`. |
| `contentHash`   | string   | SHA-256 of canonical JSON.                                   |
| `rules`         | object[] | Validated against the rule-set schema.                       |
| `sources`       | object[] | Citation records.                                            |
| `testCases`     | object[] | Reviewer-verified examples.                                  |
| `effectiveFrom` | Date     |                                                              |
| `review`        | object   | `{ authorId, reviewerIds[], approverId, approvedAt }`.       |

Indexes: `{ marjaId: 1, version: -1 }` unique.

### 3.4 `assessments` (syncable, user-owned)

| Field                                          | Type     | Notes                                                  |
| ---------------------------------------------- | -------- | ------------------------------------------------------ |
| `_id`                                          | string   | UUIDv7 (client-generated).                             |
| `userId`                                       | ObjectId | Index.                                                 |
| `type`                                         | enum     | `first_time`, `annual`, `missed_year`.                 |
| `khumsYear`                                    | object   | `{ start: Date, end: Date }`.                          |
| `ruleSetRef`                                   | object   | `{ id, version, contentHash }` — the exact rules used. |
| `engineVersion`                                | string   |                                                        |
| `inputs` 🔒                                    | object   | Validated user inputs (decimal strings).               |
| `result` 🔒                                    | object   | `{ totalLiable, khumsDue, currency, breakdown[] }`.    |
| `trace` 🔒                                     | object   | Step-by-step trace with source refs.                   |
| `status`                                       | enum     | `draft`, `finalized`.                                  |
| `version`, `deletedAt`, `deviceId`, timestamps |          | Sync metadata.                                         |

Indexes: `{ userId: 1, 'khumsYear.start': -1 }`, `{ userId: 1, updatedAt: 1 }` (sync pull).

### 3.5 `payments` (syncable, user-owned)

Records of Khums payments the user made elsewhere. The platform does not process them.

| Field          | Type     | Notes                                    |
| -------------- | -------- | ---------------------------------------- |
| `_id`          | string   | UUIDv7.                                  |
| `userId`       | ObjectId | Index.                                   |
| `assessmentId` | string?  |                                          |
| `amount` 🔒    | decimal  | + `currency`.                            |
| `share`        | enum?    | Category labels defined by the rule set. |
| `recipient` 🔒 | string?  | Office / representative name.            |
| `reference` 🔒 | string?  | Receipt number.                          |
| `paidAt`       | Date     |                                          |
| sync metadata  |          |                                          |

### 3.6 `auditLogs` (server-only, append-only)

> **Superseded for staff and governance events by §3.8 `auditEvents`** (2026-11-21, decision 37),
> which adds the hash chain and integrity checkpoints. This table stays as the original proposal.

| Field      | Type     | Notes                                                    |
| ---------- | -------- | -------------------------------------------------------- |
| `_id`      | ObjectId |                                                          |
| `actorId`  | ObjectId |                                                          |
| `action`   | string   | e.g. `ruleSet.approve`, `user.delete`.                   |
| `target`   | object   | `{ collection, id }`.                                    |
| `at`       | Date     | TTL policy per retention rules (not for rule approvals). |
| `metadata` | object   | Never contains financial values.                         |

### 3.8 Staff identity, governance and audit (accepted design 2026-11-21; implemented in M4.6.3a, M4.6.2b and M4.6.4a)

Server-only, `apps/api` only (`AUTH_ARCHITECTURE.md` §4.10; decisions 36–37). Collections marked
**append-only** grant the application's database user `insert` and `find` only (no update, delete or
drop); every other change goes through a new record.

**`staffAccounts`**

| Field                        | Type         | Notes                                                 |
| ---------------------------- | ------------ | ----------------------------------------------------- |
| `principalId`                | string       | UUID (opaque; never an email or name). Unique index.  |
| `username`, `usernameKey`    | string       | NFKC case-folded name; unique index on `usernameKey`. |
| `passwordHash`               | string       | Argon2id encoded hash only. Never returned or logged. |
| `passwordChangedAt`          | Date         |                                                       |
| `mustChangePassword`         | boolean      | True after creation or reset (temporary password).    |
| `temporaryPasswordExpiresAt` | Date?        | 72 h after creation or reset.                         |
| `status`                     | string       | `ACTIVE` / `SUSPENDED` / `DEACTIVATED`.               |
| `createdBy`, `createdAt`     | string, Date |                                                       |
| `sessionEpoch`               | number       | +1 on password/status/role change: ends old sessions. |
| `version`                    | number       | Optimistic concurrency for account updates.           |

**`scholarRuleRevisions`** (Phase 2 step 3; append-only: one document per save of a scholar rule
builder rule, never updated or deleted; additive — production needs `--migrate-database`)

| Field        | Type   | Notes                                                                                          |
| ------------ | ------ | ---------------------------------------------------------------------------------------------- |
| `ruleId`     | string | UUIDv7 of the rule; unique `(ruleId, revision)` (of two concurrent saves exactly one commits). |
| `revision`   | number | 0-based, contiguous per rule.                                                                  |
| `marjaId`    | string | Research Marja of the rule; index `(marjaId, revision)`.                                       |
| `recordJson` | string | The exact revision record (predefined builder fields, server-resolved ruling version).         |
| `actor`      | string | Principal id of the scholar or administrator who saved it.                                     |
| `at`         | string | ISO 8601 UTC time of the save (injected clock).                                                |
| `reason`     | string | The saver's reason (3–500 characters); also in the audit event.                                |

Phase 4 (decision 76): `recordJson` may also carry `aiPreparation` (`stage` DRAFT or
APPROVED_FOR_SCHOLAR_TESTING, `tool`, `tests`) and `rejected: true`. Both are optional, so earlier
revisions stay valid and their content hashes are unchanged.

**`scholarRuleRequests`** (Phase 4; append-only: a scholar's request for a missing rule or a
calculation change, and its single resolution; additive — production needs `--migrate-database`)

| Field        | Type   | Notes                                                                              |
| ------------ | ------ | ---------------------------------------------------------------------------------- |
| `requestId`  | string | UUIDv7 of the request; unique `(requestId, type)` (resolved at most once).         |
| `type`       | string | `REQUEST` or `RESOLUTION`.                                                         |
| `marjaId`    | string | Research Marja; index `(marjaId, at)`.                                             |
| `recordJson` | string | The exact record (kind, optional rule id, message or note). Text is never audited. |
| `actor`      | string | Principal id of the staff member.                                                  |
| `at`         | string | ISO 8601 UTC time (injected clock).                                                |

Holds only what a scholar entered (category, ruling, rate, entry types, deductions, yes/no
confirmations, exceptions, minimum amount, source ids, requirement flags, notes): never figures or
personal data. Every save also appends `builder.rule.created` / `builder.rule.revised` to
`auditEvents` in the same unit of work.

**`ruleVerificationRecords`** (Phase 2 step 5, ARCHITECTURE §11 #67; append-only: one document per
source verification of one builder rule revision, never updated or deleted; written in the same
transaction as the builder pack version it produced; additive — production needs
`--migrate-database`)

| Field            | Type   | Notes                                                                                     |
| ---------------- | ------ | ----------------------------------------------------------------------------------------- |
| `verificationId` | string | UUIDv7; unique.                                                                           |
| `ruleId`         | string | The verified rule; index `(ruleId, revision)`.                                            |
| `revision`       | number | The verified revision.                                                                    |
| `marjaId`        | string | Research Marja of the rule; index `(marjaId, at)`.                                        |
| `contentHash`    | string | SHA-256 of the verified revision; a later revision is unverified.                         |
| `recordJson`     | string | The exact record (four attestations, notes, ruling ref and content digest, pack version). |
| `actor`          | string | Principal id of the verifying scholar or administrator (never a system actor).            |
| `at`             | string | Server time (ISO 8601 UTC).                                                               |

Audit fixes (ARCHITECTURE §11 #69) add **no** collection, field or index: whether a live builder
version is suspended (its research changed), whether a verification still counts (its verifier
still holds `builder.rule.verify`) and the publication preview are computed on read. The only new
writes are audit events (`builder.pack.suspended`, `builder.rule.verification.refused`; ids and
codes only) in `auditEvents`.

**`staffRoleAssignments`** (append-only history; revocation is a new record)

| Field          | Type   | Notes                                                                                                      |
| -------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| `recordId`     | string | Unique.                                                                                                    |
| `kind`         | string | `GRANTED` or `REVOKED`; unique `(assignmentId, kind)` (granted once, revoked at most once).                |
| `assignmentId` | string | The assignment both records refer to.                                                                      |
| `principalId`  | string | Index.                                                                                                     |
| `role`         | string | Grantable: `SUPER_ADMIN`, `SCHOLAR`. Legacy (readable, not grantable; decision 64): the six earlier roles. |
| `scope`        | object | `{ kind: 'ALL' }` or `{ kind: 'MARJA', marjaIds: [...] }`.                                                 |
| `actor`, `at`  | string | Administrator (or `system:bootstrap`) and time. With the audit event's reason.                             |
| `reason`       | string | Mandatory.                                                                                                 |

**`staffSessions`**

| Field                                | Type           | Notes                                               |
| ------------------------------------ | -------------- | --------------------------------------------------- |
| `sessionIdHash`                      | string         | SHA-256 of the cookie value; unique index.          |
| `principalId`                        | string         | Index (revoke all sessions of an account).          |
| `csrfTokenHash`                      | string         | SHA-256 of the readable CSRF cookie value.          |
| `sessionEpoch`, `passwordChangeOnly` | number, bool   | Account epoch at issue; temporary-password session. |
| `createdAt`, `lastSeenAt`            | Date           |                                                     |
| `idleExpiresAt`, `absoluteExpiresAt` | string         | ISO timestamps.                                     |
| `expireAt`                           | Date           | TTL index (the absolute expiry).                    |
| `revokedAt`, `revokedReason`         | Date?, string? |                                                     |

**`staffLoginThrottles`**: `key` (HMAC of username+client, username, or client IP), `failures`,
`throttledUntil` (bounded to 15 minutes, never permanent), `lastFailureAt`, `expireAt` (TTL, 24 h).

**`auditEvents`** (append-only, hash-chained)

| Field                           | Type         | Notes                                                                          |
| ------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| `sequence`                      | number       | Unique, contiguous.                                                            |
| `type`                          | string       | e.g. `staff.signin.failed`, `staff.role.granted`, `governance.policy.changed`. |
| `actor`                         | string?      | principalId; null for anonymous sign-in failures.                              |
| `target`, `marjaIds`, `details` | object       | Ids, roles, scopes, reason. Never passwords, session ids or financial values.  |
| `requestId`, `at`               | string, Date |                                                                                |
| `previousDigest`, `digest`      | string       | SHA-256 chain over the canonical record.                                       |

**`auditCheckpoints`** (append-only): signed `{ checkpointId, chainId, sequence, digest,
recordCount, createdAt, keyId, signature }` for each chain head (`AUTH_ARCHITECTURE.md` §4.11).
Unique `checkpointId` and `(chainId, sequence, keyId)`. The database copy is a convenience; trust
comes from the signature and the independent WORM archive. A consistent rewrite of a whole chain is
detectable only against these checkpoints.

**`governanceLedgerRecords`** and **`governancePolicyRegistry`** (append-only): one document per
record, exactly the `@khums/shared-types` record plus `_id`; unique `(packId, version, sequence)` /
`sequence` and unique `recordId`. Appends follow §3.9 (no forks, no mutable head). **`administrativeControl`** (append-only): `{ sequence, kind, setting, actor, recordedAt, reason }`,
the `SINGLE_ADMIN_V1` / `DUAL_ADMIN_V1` setting history; record `sequence: 0` (`kind: BOOTSTRAP`) is
written once by the SUPER_ADMIN bootstrap and is the lock that prevents a second bootstrap. Provisional and feedback collections: see below (M4.5a).

Ledger record `actor` (M4.6.4a, decision D3): `{ kind: 'STAFF_PRINCIPAL', subject: principalId }` for
records written by the governance API (the principal of the authenticated session), or
`{ kind: 'UNVERIFIED_REFERENCE', subject }` for earlier records. Both stay valid; no stored record is
rewritten or re-hashed.

**`rulePackContents`** (append-only, M4.6.4a, decision D2): the write-once content bound by
governance records. Only the submission request carries content; every later command loads it here.

| Field      | Type   | Notes                                                                                            |
| ---------- | ------ | ------------------------------------------------------------------------------------------------ |
| `recordId` | string | The binding ledger record (`packId@version#n`). Unique `(recordId, kind)`.                       |
| `kind`     | string | `SUBMITTED` (bound by a SUBMITTED record) or `PUBLISHED` (the published copy, status PUBLISHED). |
| `packId`   | string | Index `(packId, version)`. Every version of a pack id has the same `marjaId`.                    |
| `version`  | string |                                                                                                  |
| `marjaId`  | string | From the content. Index (listing per Marja).                                                     |
| `digest`   | string | The content digest (`rule-pack-content-1`), equal to the ledger record's `integrity.digest`.     |
| `packJson` | string | The exact validated pack JSON. Re-parsed and re-hashed on every read; a mismatch fails closed.   |
| `storedAt` | string | The binding record's `recordedAt`.                                                               |

**Provisional scholar-review track** (append-only, M4.5a; `AUTH_ARCHITECTURE.md` §5.8):

- **`provisionalPackRecords`**: one document per `ProvisionalPackRecord` (`REGISTERED`, `ENABLED`,
  `DISABLED` with `disableKind` `SCHOLAR`/`EMERGENCY`), hash-chained per pack version and replayed by
  `@khums/core`. Unique `(packId, version, sequence)` and `recordId`
  (`provisional:{packId}@{version}#{n}`); index `marjaId`.
- **`rulePackContents`** kind **`PROVISIONAL`**: the registered scholar-review content, bound by the
  version's `REGISTERED` record (sequence 0); it must be on the `SCHOLAR_REVIEW` channel, and
  governance kinds (`SUBMITTED`, `PUBLISHED`) never may be.
- **`provisionalCalculations`**: `ProvisionalCalculationRecord` (calculation id, pack version, digest,
  the `ENABLED` record relied on, workflow, engine version, provisional guidance and disclaimer,
  outcome, refusal reason, who, when, request). **No input or result figures.** Unique
  `calculationId`; index `calculatedBy` (each scholar's own history, M4.5.2).
- **`feedbackReports`** (unique `feedbackId`) and **`feedbackStatusRecords`** (unique
  `(feedbackId, sequence)`; `ACKNOWLEDGED`, `RESOLVED`): write-once feedback and its status changes.
  Feedback text is stored but never logged or audited.

A governance command writes its ledger record, its content (if any) and its audit event in one
MongoDB transaction (`AUTH_ARCHITECTURE.md` §5.7); a duplicate on `ledger_sequence_unique`,
`record_kind_unique` or the audit `sequence_unique` index aborts and retries the whole unit of work.

### 3.9 Concurrency, idempotency and database permissions (owner requirements 2026-11-21)

**Append-only writes without a mutable head.** No collection stores a "current head" document that
writers update. The head of a chain is always _derived_: the record with the highest `sequence`
(index-backed `find().sort({sequence:-1}).limit(1)`). An append is:

1. read the head `(sequence n, digest d)` (or none);
2. build the record in `@khums/core` with `sequence n+1` and `previousDigest d`, and compute its
   digest;
3. `insertOne`. The **unique index on the sequence key** (`sequence`, `(packId, version, sequence)`
   ) is the atomic conflict check: of two writers racing for `n+1`, exactly
   one insert succeeds; the other gets duplicate-key error `11000`, reported as `CONFLICT`;
4. on `CONFLICT`, the caller re-reads and re-decides. Governance and policy commands re-run the
   domain decision against the new state (a proposal may no longer be pending); audit events retry
   automatically a bounded number of times (default 5) and then fail with
   `AUDIT_APPEND_CONTENDED`, never silently drop.

**Idempotent retries.** A network failure can leave the outcome unknown. Retries are safe because
every record has a stable identity:

- audit events carry a caller-generated `eventId` (UUID) with a unique index. Re-sending the same
  event after an unknown outcome finds the stored one: identical content → success (returns the
  stored record, whatever its sequence); different content under the same id →
  `AUDIT_EVENT_ID_REUSED` (refused, investigated).
- ledger and registry records are identified by position: a duplicate at the same sequence whose
  stored `recordDigest` equals the one being written is the same write (success); a different
  digest is a `CONFLICT`.

**Verification on every read.** Stores return records only after Zod validation; `@khums/core`
replays and verifies the hash chain (contiguous sequences from 0, `previousDigest` links,
recomputed digests) before any decision uses them. A broken chain fails closed
(`*_INVALID`/`CHAIN_BROKEN`) and is an integrity incident. Stores also check, before inserting, that
the new record links to the stored record before it.

**Least-privilege database users** (`apps/api/src/persistence/database-roles.ts`, tested). MongoDB
Atlas custom roles, created through the Atlas UI or Admin API from the generated definition
(`node dist/main.js --print-database-roles`):

| Role              | Used by                         | Privileges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `khumsApp`        | API runtime                     | **Append-only** (`auditEvents`, `auditCheckpoints`, `governanceLedgerRecords`, `governancePolicyRegistry`, `rulePackContents`, `provisionalPackRecords`, `provisionalCalculations`, `feedbackReports`, `feedbackStatusRecords`, `scholarRuleRevisions`, `scholarRuleRequests`, `ruleVerificationRecords`, `staffRoleAssignments`, `administrativeControl`): `find`, `insert` only. **Controlled update** (`staffAccounts`, `staffSessions`, `staffLoginThrottles`): `find`, `insert`, `update`; no `remove`. No database-level actions. |
| `khumsCheckpoint` | checkpoint job                  | `find` on the chained collections (audit, policy registry, governance ledgers, and `provisionalPackRecords` since M4.7); `find`, `insert` on `auditCheckpoints`.                                                                                                                                                                                                                                                                                                                                                                        |
| `khumsMigrator`   | operator, during migration only | `createCollection`, `createIndex`, `collMod`, `listCollections`, `listIndexes`, and `find`/`insert` on `governancePolicyRegistry` (initial seed). No `update`/`remove`/`drop*` on append-only collections.                                                                                                                                                                                                                                                                                                                              |

No role the application holds can `update`, `remove`, `drop` or `collMod` an append-only collection.
Expiry of sessions and throttles is done by **TTL indexes** (the server deletes them), so the
application needs no `remove`. Controlled-update collections are changed only through
version-checked updates (`staffAccounts.version`) or single-purpose updates (revoke a session,
record a failure). Database owners keep full rights (required by Atlas); their changes are the
residual risk that signed checkpoints and protected backups address.

### 3.10 Scholar research collections (designed M5.3.1; created from M5.3.3)

`researchSources`, `evidenceArtefacts`, `sourcePassages`, `passageTranslations`,
`researchFindings`, `religiousRulings`: all `APPEND_ONLY`, one hash-chained revision record per
document, keyed by UUIDv7 entity id and revision. Design, indexes and lifecycle:
[SCHOLAR_RESEARCH_ARCHITECTURE.md §4](SCHOLAR_RESEARCH_ARCHITECTURE.md).

**Created from M5.3.3** (`apps/api/src/persistence/collections.ts`; the migration creates validators
and indexes; `khumsApp` may only `FIND`/`INSERT`; `khumsCheckpoint` reads the chains):

| Collection            | Unique indexes                                                 | Other indexes                                  | Required fields (validator)                                                                               |
| --------------------- | -------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `researchSources`     | `{entityId, revision}`, `{recordId}`, `{displayRef, revision}` | `{marjaId, revision}`                          | entityType, entityId, revision, recordId, marjaId, displayRef, kind, recordedAt, recordDigest, recordJson |
| `sourcePassages`      | as sources                                                     | `{marjaId, revision}`, `{sourceId}`            | as sources + `sourceId`                                                                                   |
| `passageTranslations` | as sources                                                     | `{marjaId, revision}`, `{passageId, language}` | as sources + `passageId`, `language`                                                                      |
| `evidenceArtefacts`   | `{artefactId}`, `{marjaId, digest}`                            | `{sourceId}`, `{marjaId}`                      | artefactId, marjaId, sourceId, digest, size, mediaType, storageKey, recordedAt                            |
| `researchFindings`    | as sources                                                     | `{marjaId, revision}`, `{marjaId, questionId}` | as sources + `questionId` (M5.3.4)                                                                        |
| `religiousRulings`    | as sources + `{rulingSeriesId, rulingVersion, revision}`       | `{marjaId, revision}`                          | as sources + `rulingVersion`, `rulingSeriesId` (M5.3.4–M5.3.5; one chain per ruling version)              |

Evidence bytes are never stored in MongoDB. The `khums` Atlas database was migrated before M5.3.4,
so `researchFindings` and `religiousRulings` exist only after the additive, owner-approved
`--migrate-research-collections` (creates the missing research collections, changes nothing else).

### 3.7 `donations` (later)

Only provider references (`providerPaymentId`, amount, currency, status). No card data.

## 4. Data lifecycle

- **Account deletion:** hard-deletes all user-owned documents within 30 days; audit entry kept
  without personal data.
- **Export:** user can export all their data as JSON at any time.
- **Migrations:** `schemaVersion` + idempotent migration scripts; lazy migration on read where safe.
