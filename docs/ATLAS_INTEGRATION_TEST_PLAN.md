# Existing-database integration test plan (M5.3.3)

> **Plan id: `ATLAS-ITEST-PLAN-M533-R5`** · Status: **PROPOSED — awaiting owner review and explicit
> approval.** Supersedes R1–R4 (2026-11-22). R4 hardened the one-time reset (audit-chain proof, exact
> run profile, maintenance fence, single transaction, encrypted verified backup with restore) and
> local-development safety. R5 fixes the R4 audit findings: uncertain transaction outcomes are
> decided by re-reading the data; every failure after the fence reports the fence state, whether
> anything was deleted and the next safe action; a small recovery manifest of the original
> validators is written before the fence; any existing fence of any run blocks a new reset; restore
> runs under the active fence; the backup key is entered hidden (§1.4). Step 0 (read-only inventory) was executed under R1; nothing else has been
> executed. The integration suite refuses to run unless
> `KHUMS_ATLAS_ITEST_APPROVED_PLAN=ATLAS-ITEST-PLAN-M533-R5`.

## 0. Step 0 result (executed 2026-11-22 under R1, read-only)

`node dist/main.js --inventory-database`, after `chmod 600 apps/api/.env` and a credential-exposure
check (no commits exist; `.env` ignored and untracked; the real password and username appear in no
committable file). Operations sent: `hello`, `buildInfo`, `listCollections`. Nothing was written.

| Finding                               | Result                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| Cluster / database                    | `khums.4rwn7ov.mongodb.net` / `khums`                                                  |
| Replica set / sessions / transactions | yes / yes / **supported**; MongoDB major version 8                                     |
| Collections in `khums`                | **none** (empty database)                                                              |
| Migration state                       | not migrated: all 18 application collections missing                                   |
| Staff, roles, governance              | none                                                                                   |
| Research collections                  | none                                                                                   |
| Conflicting records                   | none                                                                                   |
| Other databases                       | not inspected (not approved); the existing data referred to earlier is outside `khums` |

## 1. Decisions (resolved in R3, reset hardened in R4 and R5)

### 1.1 Governance policy seeding: Sistani and Khamenei only

Investigation: the policy registry is used **only** by rule-pack governance. A submission resolves
its Marja's active policy (`activeGovernancePolicy`); a Marja without a policy is **refused** with
`POLICY_NOT_CONFIGURED` (fail closed). Research never consults policies (separation `NONE`), and
research creation is limited to `INITIAL_RESEARCH_MARJAS` independently (D12). Nothing requires all
six. Change made: `INITIAL_GOVERNANCE_POLICIES` (the single version-controlled seed used by the
migration and by development/test stores) is now `sistani` and `khamenei` only (owner decision
2026-11-22), with a test that it equals the initial research scope and that the four other
catalogue Marjas (`makarem-shirazi`, `wahid-khorasani`, `najafi`, `fayyadh`) are unconfigured. They
stay inactive for governance (submissions refused) and for research (creation refused) until two
administrators configure a policy through the audited registry and, separately, the research scope
is extended in a reviewed change. The seed time was set to `2026-11-22T00:00:00.000Z` (the earlier
six-Marja seed was never applied to any database).

### 1.2 Initial SUPER_ADMIN bootstrap (after the test reset; §5)

Existing, reviewed mechanism (`node dist/main.js --bootstrap-super-admin <username>`,
AUTH_ARCHITECTURE.md §4.10), no changes needed:

- **No default credentials**: the password is typed at an interactive terminal prompt (twice); it
  is never an argument, environment variable, file or log line. Non-interactive runs are refused.
- **Password**: checked against the password policy (`checkPasswordPolicy`, including the username)
  and stored only as an argon2id hash.
- **Once only, race-safe**: the first write is administrative-control record `sequence 0`
  (unique index). Bootstrap refuses before prompting if that record or any SUPER_ADMIN exists.
- **Atomic and audited**: the account, its role assignment and the `staff.bootstrap.completed`
  audit event commit in one transaction (the first real audit event, sequence 0 after the reset).
- **No religious authority**: the role is `SUPER_ADMIN` with scope ALL. SUPER_ADMIN holds no
  research, verification, approval or activation permission (authorization catalogue,
  M5.2.1/M5.3.2); scholars receive `GOVERNING_SCHOLAR` per Marja through the audited role-grant
  flow.
- **Sessions**: bootstrap creates no session; the administrator then signs in normally
  (server-side session, CSRF, idle/absolute expiry; grants end the target's sessions).
- Output: the new principal id and the role only.

### 1.3 Integration-test audit history: one-time reset (§3 step 4) — hardened in R4 and R5

The migration writes no audit event (the policy seed lives in its own registry chain), so after
migration `auditEvents` is empty. If the run's 14 events are the only events and no checkpoint
exists, removing all of them returns the audit chain to **empty, which is valid**: nothing real
ever chained onto them. This is a one-time pre-production initialization, not a rewrite of history.
Operator command only (`--reset-integration-test-run`, `src/persistence/preproduction-reset.ts`);
there is no API endpoint and no general deletion path.

**Preconditions (all re-proved three times: before the fence, behind the fence, and inside the
transaction; any failure refuses):**

1. All 18 application collections exist.
2. Empty: `auditCheckpoints`, `governanceLedgerRecords`, `rulePackContents`,
   `provisionalPackRecords`, `provisionalCalculations`, `feedbackReports`, `feedbackStatusRecords`,
   `staffRoleAssignments`, `administrativeControl`, `staffAccounts`, `staffSessions`,
   `staffLoginThrottles` (no bootstrap, no real use, no checkpoint).
3. `governancePolicyRegistry` holds exactly the two seed records (record digests of §4.2).
4. **Audit chain**: the production `verifyAuditChain` (schema, sequence, previous-digest link and
   digest of every event) passes over the whole chain; sequences are exactly `0..13`, contiguous,
   no duplicates.
5. **Every** document of `auditEvents`, `researchSources`, `sourcePassages`,
   `passageTranslations` and `evidenceArtefacts` carries the run marker (`requestId` =
   `<runId>:…`, inside `recordJson` for research records).
6. **Exact run profile** (`ITEST_RUN_PROFILE`): `auditEvents` 14 (`research.record.appended` 6,
   `research.evidence.attached` 1, `research.action.refused` 3, `research.action.denied` 4),
   `researchSources` 6 in 5 chains, `sourcePassages` 0, `passageTranslations` 0,
   `evidenceArtefacts` 1. More, fewer or different → refused (a partial run needs a new decision).
7. **Relationships**: every research chain replays with the production `replayResearchChain`;
   exactly one `research.record.appended` event per research revision (same entity, revision and
   request id); the artefact belongs to one of the run's sources, its storage key is
   `<marja>/<digest>`, and exactly one `research.evidence.attached` event names it with the same
   request id.
8. The typed confirmation `RESET <runId>`; a valid run id; `KHUMS_BACKUP_KEY` (32 bytes).
9. **No maintenance fence of any run** on any collection (`FENCE_ALREADY_ACTIVE`, detected by the
   fence marker regardless of run id). A fence is never mistaken for an original validator.

**Sequence and transaction semantics:**

| #   | Step                                                                                                                                                                                                                                   | Writes               | On failure (`fence` / `deleted` in the result)                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Proof (read-only), including "no fence of any run"                                                                                                                                                                                     | none                 | refuse; nothing changed (`NONE` / `NO`)                                                    |
| 2   | Record every collection's validator options and indexes                                                                                                                                                                                | none                 | —                                                                                          |
| 3   | **Recovery manifest**: write the 18 original validator options (no data, no key) to `--manifest <file>`: JSON with run id, format and SHA-256 checksum, created atomically, mode 0600, never overwrites                                | 1 local file         | refuse (`MANIFEST_FAILED`; `NONE` / `NO`)                                                  |
| 4   | **Maintenance fence**: `collMod` each of the 18 collections to a validator that rejects every insert and update (`$expr` false, tagged with the run id). Deletes are not validated. Any writer fails closed until the fence is lifted. | 18 × `collMod`       | try to lift; `FENCE_FAILED` with the real state (`NONE` or `PARTIAL` / `NO`)               |
| 5   | Proof again behind the fence; the data must be byte-identical to step 1                                                                                                                                                                | none                 | lift; refuse (`CONCURRENT_CHANGE`, the precondition, or `OPERATION_FAILED`; `NONE` / `NO`) |
| 6   | **Encrypted backup** of all 18 collections and their structure (AES-256-GCM, AAD bound to the run id, key never written, atomic, mode 0600, never overwrites); then re-read, decrypted, verified and compared with the live data       | 1 local file         | lift; refuse (`BACKUP_FAILED`; `NONE` / `NO`)                                              |
| 7   | **One MongoDB transaction** (existing `mongoUnitOfWork`): re-read and require identical to step 5; re-run the proof; delete by exact `_id` in the 5 collections; require the counts; commit                                            | 21 deletions, atomic | see "Transaction outcome" below                                                            |
| 8   | Read-only verification after commit: the 5 empty, the other 13 byte-identical                                                                                                                                                          | none                 | **fence kept**; `ACTIVE` / `YES`; next: restore or lift (§1.4 case C)                      |
| 9   | Lift: restore the manifest's validators on the collections fenced by this run, then verify all 18 equal the manifest and the indexes equal step 2                                                                                      | 18 × `collMod`       | `FENCE_LIFT_FAILED`; `ACTIVE` or `PARTIAL` / `YES`; next: lift (§1.4 case B)               |

**Transaction outcome (R5).** A driver error does not prove what happened at commit. When the
transaction does not return success, the command re-reads all 18 collections and compares them
with the backed-up state:

- **unchanged** and the transaction is known to have aborted before commit (our own rollback, or
  the error happened before the commit was sent) → nothing deleted; lift; `TRANSACTION_ABORTED`,
  `NONE` / `NO`;
- **exactly the reset state** (the 5 empty, the other 13 identical) → it committed; continue with
  steps 8 and 9;
- anything else, including "unchanged" after the commit was sent (a later retry could still apply
  it), or a read failure → `TRANSACTION_UNCERTAIN`, **fence kept**, `ACTIVE` / `UNKNOWN`; the
  command assumes neither deletion nor preservation (§1.4 case D).

**Errors after the fence (R5).** One handler covers steps 5–9. Before any deletion was attempted it
lifts the fence and reports `NONE` / `NO` (or, if that lift fails, `ACTIVE`/`PARTIAL` / `NO` and
the lift command). From the transaction onward it never lifts on error: it keeps the fence and
reports `deleted: YES` or `UNKNOWN` with the next safe action. The fence is never left active
without the result saying so.

**Recovery commands** are in §1.4. Restore runs only **under the matching active fence** (R5): it
requires a valid manifest of the same run, a verified backup, every collection fenced by this run,
indexes equal to the backup and the manifest's validators equal to the backup's structure; it
inserts (bypassing only the fence validator) exactly the backed-up documents into empty
collections, skips collections already identical, aborts on any other content
(`TARGET_NOT_EMPTY_OR_CHANGED`), verifies every collection equals the backup, and only then lifts
the fence. If verification fails the fence is kept (`VERIFICATION_FAILED`) and the result says so.

Tested (`preproduction-reset.test.ts`, 29 tests, against a fake database with real transaction
staging and validator semantics, using documents produced by the application's own services
replaying the run profile): success preserving the 2 policy records and the exact validators, with
an owner-only manifest; writes rejected while fenced; altered event, chain gap, incomplete chain,
missing record, unmarked record, checkpoint, staff account and changed registry refused with
nothing changed and no file written; another run's fence refused; a crash after each of 1–17
fencing steps recovered from the manifest alone (no backup) to the exact original validators; lift
refuses another run's fence and a tampered or wrong-run manifest; a read failure behind the fence
lifts it; a failed lift is reported with the lift command; an existing backup never overwritten;
an abort at each deletion stage deletes nothing and lifts; a post-commit failure keeps the fence
(`deleted: YES`); an uncertain commit with unchanged data keeps the fence (`UNKNOWN`) and is
recoverable; an uncertain commit that did commit is recognised from the data; restore under the
fence reproduces the pre-reset state and validators; a failed restore verification keeps the
fence; restore refuses without the fence, with changed data and with a tampered manifest;
tampered, wrong-key and wrong-run backups rejected; reordered option keys do not cause false
failures.

**Not verified on MongoDB (R5 limitation).** The fake database cannot prove MongoDB semantics:
that Atlas accepts the fence validator, rejects inserts and updates under it, does not validate
deletes, how `collMod` interacts with in-flight transactions, `bypassDocumentValidation` under the
fence, and real commit-error behaviour. These stay **unverified** until an owner-approved
replica-set rehearsal (§9, separate item; on a disposable local replica set, never on `khums`).

### 1.4 Recovery commands (R5)

Run from `apps/api` after `pnpm build`. Keep the run id, the manifest file and the backup file
together, outside the repository, mode 600. The key is entered **hidden**: it never appears in an
argument, shell history, log or output, and the API refuses to start while it is set. Lifting a
fence needs no key.

```bash
read -rs KHUMS_BACKUP_KEY && export KHUMS_BACKUP_KEY
```

After the command, always:

```bash
unset KHUMS_BACKUP_KEY
```

Read the result's `fence`, `deleted` and `next` fields first, then:

- **A. Refused before the fence** (`fence: NONE`, `deleted: NO`): nothing changed. Fix the cause
  or stop.
- **B. Fence left active or partial, nothing deleted** (`FENCE_FAILED`, a failed lift, or a crash
  before the backup existed): restore the original validators from the manifest:

  ```bash
  node dist/main.js --lift-maintenance-fence --run <runId> --manifest <manifest file>
  ```

  It restores only collections fenced by this run, refuses (`OTHER_FENCE_OR_CHANGED`) if any
  collection carries another run's fence or a validator that is neither this run's fence nor the
  original, and verifies all 18 afterwards. Migration is never used as recovery.

- **C. Deleted but not verified** (`deleted: YES`, fence active): run `--inventory-database`. If
  the 5 reset collections are empty and the rest matches step 1a, lift (case B). Otherwise restore
  under the fence:

  ```bash
  node dist/main.js --restore-preproduction-backup <backup file> --run <runId> --manifest <manifest file> --confirm "RESTORE <runId>"
  ```

- **D. Outcome unknown** (`TRANSACTION_UNCERTAIN`, `deleted: UNKNOWN`, fence active): wait two
  minutes, run `--inventory-database`. Exactly the run still present (14/6/1) or the 5 reset
  collections empty, with everything else unchanged → lift (case B). Anything else → restore (case
  C); if restore refuses, keep the fence and contact the maintainer.
- **E. Another run's fence** (`FENCE_ALREADY_ACTIVE`): recover that run with its own manifest (case
  B, its run id). Never edit validators by hand.
- **Verify a backup** (no database):

  ```bash
  node dist/main.js --verify-preproduction-backup <backup file> --run <runId>
  ```

Generate the key once straight into the clipboard (macOS), paste it into the password manager,
then clear the clipboard; it is never shown:
`node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" | pbcopy`.

**Alternatives** if the owner prefers not to delete anything: (a) keep the 14 marked synthetic
events as the permanent start of the chain; (b) a separate database (rejected by the owner).

## 2. Target and credentials

| Item        | Value                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------- |
| Database    | `khums` on `khums.4rwn7ov.mongodb.net` (Atlas M0, replica set)                                     |
| Credentials | the existing Atlas user (owner-approved temporary arrangement; administrative privileges — see §8) |
| Local files | `apps/api/.env` 600, ignored, untracked; `apps/web/.env.local` 600, ignored, untracked (§7)        |

## 3. Steps, commands and exact database operations

Run from `apps/api` after `pnpm build`. Each step needs its own approval.

| Step | Command                                                                                                                                                                                                                                                             | Database operations                                                                                                                                                 | Documents after the step       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 0    | `node dist/main.js --inventory-database`                                                                                                                                                                                                                            | read-only (**done**)                                                                                                                                                | 0                              |
| 1    | `node dist/main.js --migrate-database`                                                                                                                                                                                                                              | 18 × `createCollection` (validator, strict, error); 18 × `createIndexes` (49 declared indexes, §4.1); policy seed: 2 inserts into `governancePolicyRegistry`        | 2 (`governancePolicyRegistry`) |
| 1a   | `node dist/main.js --inventory-database`                                                                                                                                                                                                                            | read-only: confirm 18 collections, 49 indexes + `_id`, validators, 2 policy records                                                                                 | 2                              |
| 2    | `pnpm --filter @khums/api test:atlas-itest` with `KHUMS_ATLAS_ITEST_DATABASE=khums`, `KHUMS_ATLAS_ITEST_APPROVED_PLAN=ATLAS-ITEST-PLAN-M533-R5`, a fresh `KHUMS_ATLAS_ITEST_RUN_ID` (`itest-YYYYMMDDTHHMMSSZ-xxxxxx`), URI entered silently                         | inserts only, through the application's stores (§4.3); one validator-rejected raw insert (A1)                                                                       | 2 + 6 + 1 + 14 = 23            |
| 3    | `node dist/main.js --inventory-database`                                                                                                                                                                                                                            | read-only: 2 policy records unchanged; exactly the run's marked records                                                                                             | 23                             |
| 4    | `read -rs KHUMS_BACKUP_KEY && export KHUMS_BACKUP_KEY`, then `node dist/main.js --reset-integration-test-run <runId> --confirm "RESET <runId>" --backup <new file> --manifest <new file>` (both outside the repository), then `unset KHUMS_BACKUP_KEY` (§1.3, §1.4) | reads; local manifest; 18 × `collMod` (fence); encrypted local backup; one transaction deleting 21 documents by exact `_id`; reads to verify; 18 × `collMod` (lift) | 2                              |
| 4a   | `node dist/main.js --inventory-database`                                                                                                                                                                                                                            | read-only: back to the step 1a state                                                                                                                                | 2                              |
| 5    | `node dist/main.js --bootstrap-super-admin <username>` (interactive, owner at the terminal)                                                                                                                                                                         | 1 transaction: 1 `administrativeControl`, 1 `staffAccounts`, 1 `staffRoleAssignments`, 1 `auditEvents`                                                              | 6                              |

Step 5 is listed for completeness; it is the start of real use and needs its own approval (it can
only run after step 4, which refuses once a bootstrap exists).

## 4. Migration manifest

### 4.1 Collections, validators and indexes created by step 1

Every collection gets `validator: { $jsonSchema: { bsonType: 'object', required: [...] } }`,
`validationLevel: 'strict'`, `validationAction: 'error'`, plus MongoDB's automatic `_id_` index.
Generated from the code (`node dist/main.js --print-migration-manifest`, no database).

| Collection                 | Access            | Validator `required`                                                                                                           | Indexes                                                                                                                                                                                                                                                 |
| -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auditEvents`              | APPEND_ONLY       | eventId, type, sequence, previousDigest, digest, occurredAt                                                                    | `sequence_unique` {sequence:1} unique; `eventId_unique` {eventId:1} unique                                                                                                                                                                              |
| `auditCheckpoints`         | APPEND_ONLY       | checkpointId, chainId, sequence, digest, keyId, signature                                                                      | `checkpointId_unique` {checkpointId:1} unique; `chain_sequence_key_unique` {chainId:1, sequence:1, keyId:1} unique                                                                                                                                      |
| `governanceLedgerRecords`  | APPEND_ONLY       | packId, version, sequence, recordId, recordDigest, type                                                                        | `ledger_sequence_unique` {packId:1, version:1, sequence:1} unique; `recordId_unique` {recordId:1} unique                                                                                                                                                |
| `governancePolicyRegistry` | APPEND_ONLY       | sequence, recordId, recordDigest, kind, marjaId                                                                                | `sequence_unique` {sequence:1} unique; `recordId_unique` {recordId:1} unique                                                                                                                                                                            |
| `rulePackContents`         | APPEND_ONLY       | recordId, kind, packId, version, marjaId, digest, packJson, storedAt                                                           | `record_kind_unique` {recordId:1, kind:1} unique; `pack_version` {packId:1, version:1}; `marjaId` {marjaId:1}                                                                                                                                           |
| `provisionalPackRecords`   | APPEND_ONLY       | packId, version, sequence, recordId, kind, recordDigest                                                                        | `provisional_sequence_unique` {packId:1, version:1, sequence:1} unique; `recordId_unique` {recordId:1} unique; `marjaId` {marjaId:1}                                                                                                                    |
| `provisionalCalculations`  | APPEND_ONLY       | calculationId, packId, version, contentDigest, guidance, calculatedAt                                                          | `calculationId_unique` {calculationId:1} unique; `pack_version` {packId:1, version:1}; `calculatedBy` {calculatedBy:1}                                                                                                                                  |
| `feedbackReports`          | APPEND_ONLY       | feedbackId, packId, version, contentDigest, category, submittedAt                                                              | `feedbackId_unique` {feedbackId:1} unique; `pack_version` {packId:1, version:1}                                                                                                                                                                         |
| `feedbackStatusRecords`    | APPEND_ONLY       | feedbackId, sequence, status, actor, recordedAt                                                                                | `feedback_sequence_unique` {feedbackId:1, sequence:1} unique                                                                                                                                                                                            |
| `researchSources`          | APPEND_ONLY       | entityType, entityId, revision, recordId, marjaId, displayRef, kind, recordedAt, recordDigest, recordJson                      | `entity_revision_unique` {entityId:1, revision:1} unique; `recordId_unique` {recordId:1} unique; `displayRef_revision_unique` {displayRef:1, revision:1} unique; `marja_revision` {marjaId:1, revision:1}                                               |
| `sourcePassages`           | APPEND_ONLY       | entityType, entityId, revision, recordId, marjaId, displayRef, kind, recordedAt, recordDigest, recordJson, sourceId            | `entity_revision_unique` {entityId:1, revision:1} unique; `recordId_unique` {recordId:1} unique; `displayRef_revision_unique` {displayRef:1, revision:1} unique; `marja_revision` {marjaId:1, revision:1}; `sourceId` {sourceId:1}                      |
| `passageTranslations`      | APPEND_ONLY       | entityType, entityId, revision, recordId, marjaId, displayRef, kind, recordedAt, recordDigest, recordJson, passageId, language | `entity_revision_unique` {entityId:1, revision:1} unique; `recordId_unique` {recordId:1} unique; `displayRef_revision_unique` {displayRef:1, revision:1} unique; `marja_revision` {marjaId:1, revision:1}; `passage_language` {passageId:1, language:1} |
| `evidenceArtefacts`        | APPEND_ONLY       | artefactId, marjaId, sourceId, digest, size, mediaType, storageKey, recordedAt                                                 | `artefactId_unique` {artefactId:1} unique; `marja_digest_unique` {marjaId:1, digest:1} unique; `sourceId` {sourceId:1}; `marjaId` {marjaId:1}                                                                                                           |
| `staffRoleAssignments`     | APPEND_ONLY       | recordId, kind, assignmentId, principalId, role, scope, actor, at                                                              | `recordId_unique` {recordId:1} unique; `assignment_kind_unique` {assignmentId:1, kind:1} unique; `principalId` {principalId:1}                                                                                                                          |
| `administrativeControl`    | APPEND_ONLY       | sequence, kind, setting, actor, recordedAt                                                                                     | `sequence_unique` {sequence:1} unique                                                                                                                                                                                                                   |
| `staffAccounts`            | CONTROLLED_UPDATE | principalId, usernameKey, passwordHash, status, sessionEpoch, version                                                          | `principalId_unique` {principalId:1} unique; `usernameKey_unique` {usernameKey:1} unique                                                                                                                                                                |
| `staffSessions`            | CONTROLLED_UPDATE | sessionIdHash, principalId, csrfTokenHash, absoluteExpiresAt, expireAt                                                         | `sessionIdHash_unique` {sessionIdHash:1} unique; `principalId` {principalId:1}; `expireAt_ttl` {expireAt:1} TTL 0s                                                                                                                                      |
| `staffLoginThrottles`      | CONTROLLED_UPDATE | key, failures, expireAt                                                                                                        | `key_unique` {key:1} unique; `expireAt_ttl` {expireAt:1} TTL 0s                                                                                                                                                                                         |

### 4.2 Policy records seeded by step 1 (retained configuration)

| sequence | recordId   | kind                  | marjaId    | policy            | recordedAt               | requestId                         | recordDigest                                                       |
| -------- | ---------- | --------------------- | ---------- | ----------------- | ------------------------ | --------------------------------- | ------------------------------------------------------------------ |
| 0        | `policy#0` | INITIAL_CONFIGURATION | `sistani`  | SINGLE_SCHOLAR_V1 | 2026-11-22T00:00:00.000Z | `migration:initial-configuration` | `600771186422fcc398d54a087d8d954445e19edfbb255cc4154949e1eb1ed963` |
| 1        | `policy#1` | INITIAL_CONFIGURATION | `khamenei` | SINGLE_SCHOLAR_V1 | 2026-11-22T00:00:00.000Z | `migration:initial-configuration` | `60ca8f497da4de46368dc39042cfe335468dd6d9b6ea57ca49fda23fe236a7dc` |

Actor `system:initial-configuration`, reason "Initial configuration: single-scholar governance for
the initial research scope (owner decision 2026-11-22)." Deterministic: re-running the migration
changes nothing; a different stored registry is reported, never overwritten.

### 4.2a Staff or bootstrap records

None in steps 1–4. Step 5 (separate approval) writes the four bootstrap documents listed in §3.

### 4.3 Integration suite writes (step 2)

| Test | Proves                                                                                                                                                          | Writes (all carry `requestId` `<runId>:n`) |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| A1   | transactions; indexes; validator rejects a malformed revision (raw insert, error 121)                                                                           | none                                       |
| A2   | revision + audit event commit together                                                                                                                          | 1 research, 1 audit                        |
| A3   | rollback on audit failure                                                                                                                                       | none                                       |
| A4   | 3 concurrent revisions: one commits, others 409; stale command 409                                                                                              | 2 research, 5 audit                        |
| A5   | revision-0 id collision retries the transaction with a fresh UUIDv7                                                                                             | 2 research, 2 audit                        |
| A6   | BSON round-trip, replay, checkpoint loader reads research chains                                                                                                | none                                       |
| A7   | evidence metadata + audit atomic; idempotent; storage reference; backup/restore/decrypt/SHA-256 (bytes only in a temporary encrypted directory on this machine) | 1 research, 1 evidence, 2 audit            |
| A8   | Marja scope and roles (outsider scholar, researcher, SUPER_ADMIN, auditor)                                                                                      | 4 audit (denials)                          |
| A9   | pre-existing documents (policy seed, staff collections) unchanged; audit chain verifies                                                                         | none                                       |

Total: `researchSources` 6, `evidenceArtefacts` 1, `auditEvents` 14. Principals are in-memory test
principals: no staff account, role, session or policy is written.

### 4.4 Preserved and not touched

- Preserved by every step: the 2 policy records, all 18 collections, their validators and indexes.
- Never touched: any database other than `khums`; `sourcePassages` and `passageTranslations` (empty
  throughout); governance ledgers, pack contents, provisional, feedback, checkpoint and staff
  collections (empty until step 5).
- Step 4 removes only the run's 21 marked documents; it refuses if anything else is present.

## 5. Order and why

1 migrate → 1a verify → 2 test → 3 verify → **4 reset** → 4a verify → 5 bootstrap (real use
begins). The reset must precede the bootstrap: afterwards it refuses permanently.

## 6. Evidence storage in the run

Bytes are written only to a temporary AES-256-GCM directory with a random key on the machine running
the suite and deleted afterwards; Atlas holds only the artefact metadata (digest, size, storage key),
which step 4 removes. Production evidence storage stays unavailable (fail closed).

## 7. Environment security

- `apps/api/.env`: 600 (was 644), git-ignored, untracked; credentials not found in any committable
  file.
- `apps/web/.env.local`: contains secrets (`AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` are set); now 600
  (was 644); git-ignored, untracked; the values appear in no committable file. These Auth0
  variables are no longer used by the web code (staff authentication moved to the API in M4.6.2b);
  recommendation for the owner: remove them from the file and revoke the Auth0 application secret if
  that application is no longer used (not done here; no credential was changed).

### 7.1 Local development safety (R4, unchanged in R5)

`apps/api/.env` holds the real Atlas URI, and any API command run from `apps/api` loads it:

- `--generate-openapi`, `--print-migration-manifest` and `--print-database-roles` no longer load
  `.env` and drop any exported `MONGODB_URI` before configuration is parsed (tested), so OpenAPI
  generation (`pnpm --filter @khums/api openapi`) never configures a MongoDB client.
- For local development against memory, never against `khums`, start the API with
  `MONGODB_URI= pnpm dev` (an empty value counts as unset and `.env` never overrides an existing
  variable). Do not run the local API with the real `.env` while this plan is in progress; the
  maintenance fence would reject its writes during step 4, and any write before step 4 makes the
  reset refuse.
- Values are never printed by any of these commands.

## 8. Risks

- **Administrative database user**: only the code limits what the commands do. Every write path is
  listed above; the suite never drops, updates or deletes; the reset deletes only by exact `_id`
  after its preconditions and backup. Least-privilege users remain recommended (deferred by the
  owner).
- The backup file of step 4 contains the run's synthetic data and the 2 policy records only (staff
  collections are empty by precondition); keep it outside the repository, mode 600. The manifest
  holds validator definitions only; keep it with the backup until the run is closed.
- Fence, `collMod` and commit-uncertainty behaviour are tested only against a fake (§1.3); they are
  unverified on MongoDB until the rehearsal in §9 is approved and run.
- If step 2 fails midway, the records written so far are still marked; step 4 removes them (the
  run id is printed and also visible in step 3's inventory).
- Atlas M0 rate limits may slow the concurrency tests (generous timeouts).

## 9. Approval checklist (each item separately)

- [x] §1 decisions; Step 1 (+1a) migration; Step 2 (+3) suite (9/9); fence behaviour verified on
      Atlas with aborted transactions; Step 4 (+4a) reset; Step 5 SUPER_ADMIN bootstrap — all
      executed and verified 2026-11-22 (the reset now refuses permanently).
- [x] §10: additive migration of the two M5.3.4 research collections (executed and verified
      2026-11-22).

## 10. Additive migration of the M5.3.4–M5.3.5 research collections (EXECUTED 2026-11-22)

**Result (owner-approved, executed and verified 2026-11-22):** `--migrate-research-collections`
reported `created: ["researchFindings", "religiousRulings"]`, `alreadyPresent: ["researchSources",
"sourcePassages", "passageTranslations", "evidenceArtefacts"]`. Read-only verification: 20
collections, 59 declared indexes (79 with `_id`), every validator and index equal to the manifest,
no missing indexes, no unknown collections; both new collections empty; the 18 existing collections
byte-identical before and after (documents, options and indexes compared by SHA-256), both policy
record digests unchanged; the application's own research store reads all research collections
(all empty). Nothing else was run.

**State of `khums` (verified read-only 2026-11-22):** 18 collections, 49 declared indexes plus
`_id`, validators equal to the manifest, 2 governance policies, the SUPER_ADMIN bootstrap records
(1 `administrativeControl`, 1 `staffAccounts`, 1 `staffRoleAssignments`, 1 `auditEvents`). The
application now declares 20 collections; `researchFindings` and `religiousRulings` are missing, so
findings and rulings cannot be stored on Atlas until this step runs (the API fails closed: 503).

**Command (owner approval required; from `apps/api` after `pnpm build`):**

```bash
node dist/main.js --migrate-research-collections
```

Not `--migrate-database`, which re-applies every validator (`collMod`) and re-checks the policy seed.
`--migrate-research-collections` (`migrateResearchCollections`, `src/persistence/migrate.ts`):
lists collection **names** only; for each of the six research collections that is **missing**,
creates it with its validator and creates its indexes; leaves every present collection exactly as it
is (no `collMod`, no index change, no read of documents); seeds nothing; touches no collection
outside the research set; writes no document. Tested (`persistence.test.ts`: creates only the
missing research collections, no `collMod`, nothing outside the set).

**Exactly what it creates** (from `--print-migration-manifest`, offline):

| Collection         | Validator (`$jsonSchema`, `validationLevel: strict`, `validationAction: error`)                                                                                          | Indexes                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `researchFindings` | `bsonType: object`; required `entityType`, `entityId`, `revision`, `recordId`, `marjaId`, `displayRef`, `kind`, `recordedAt`, `recordDigest`, `recordJson`, `questionId` | unique `entity_revision_unique` {entityId, revision}; unique `recordId_unique` {recordId}; unique `displayRef_revision_unique` {displayRef, revision}; `marja_revision` {marjaId, revision}; `marja_question` {marjaId, questionId} |
| `religiousRulings` | as findings, but `rulingVersion`, `rulingSeriesId` instead of `questionId`                                                                                               | unique `entity_revision_unique`; unique `recordId_unique`; unique `displayRef_revision_unique`; unique `series_version_revision_unique` {rulingSeriesId, rulingVersion, revision}; `marja_revision` {marjaId, revision}             |

Expected report: `{"created": ["researchFindings", "religiousRulings"], "alreadyPresent":
["researchSources", "sourcePassages", "passageTranslations", "evidenceArtefacts"]}`.

**Preserved:** all 18 existing collections, their validators, indexes and documents (the 2 policies,
the bootstrap account, role, control record and audit event); no other database.

**Verification after (read-only):** `node dist/main.js --inventory-database` and the structure check
used on 2026-11-22: 20 collections, 59 declared indexes (+20 `_id`), all validators equal to the
manifest, no missing indexes, no unknown collections; the same documents as before (2 policies and
the 4 bootstrap records), both new collections empty; audit chain unchanged.

**Risks:** low. Creating two empty collections and their indexes is additive and idempotent (a
second run reports both as `alreadyPresent`). The command runs with the current administrative
Atlas user (the accepted temporary risk); only the code limits it. If it stops midway (for example
after creating `researchFindings`), rerunning creates only what is still missing; a collection
created without all its indexes would show as `missingIndexes` in the inventory and needs a
maintainer decision (never a drop). Checkpoint coverage: the integrity checkpoint job reads the new
chains automatically (no checkpoints exist yet).
