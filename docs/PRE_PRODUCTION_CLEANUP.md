# Pre-production cleanup procedure (prepared, NOT executed)

> Status: **PROPOSED — for owner review.** Prepared in M5.3.3 (2026-11-22). Nothing here has been
> run. Every destructive step needs the owner's explicit, written approval of that step, given after
> reviewing the dry-run inventory it is based on. No tooling for the destructive steps exists yet;
> it is built only after this procedure is approved.

## 1. Principles

1. **Nothing is disposable by inference.** A record is proposed for removal only if it carries an
   explicit synthetic marker defined in §3 (an integration-test run id, a mock-pack flag, or an
   account listed by the owner). Creation during development, a creation date, a test-sounding name
   or an absence of activity is **never** sufficient.
2. **Dry run first, always.** Each removal set is produced by a read-only inventory, reviewed and
   approved, and then executed exactly (ids, not queries), re-checking each id at execution.
3. **No retained record may reference a removed one.** Every removal set is checked against all
   retained data first (§5); any reference blocks the whole set.
4. **Backup first, verified.** A full encrypted backup of the database (DEPLOYMENT_FREE_TIER.md §7)
   and of the evidence directory (§7.1–§7.2) is taken and restore-verified before any removal.
5. **Append-only data and the audit chain** change only through the explicit owner-approved
   retention/reset decision in §6, never as a side effect.
6. **MongoDB and evidence storage are cleaned together** (§7), metadata first, bytes last.

## 2. Always retained (never proposed for removal)

- The initial SUPER_ADMIN account and every account the owner lists as an approved scholar or
  staff member; their role assignments (`staffRoleAssignments`), and the administrative control
  records.
- The governance policy registry (`governancePolicyRegistry`) and every governance ledger and pack
  content bound to a non-mock pack.
- Collections, validators and indexes (migration state). Cleanup removes documents only; it never
  drops a collection or an index.
- Integrity checkpoints and the offline checkpoint archive (see §6 for their relation to a reset).
- Any collection unknown to the application (reported by the inventory, never touched).
- Every research record and evidence artefact without a synthetic marker.

## 3. Synthetic markers (the only grounds for proposing removal)

| Data                                | Marker                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Integration-test research records   | `requestId` (inside `recordJson`) starting `itest-<run>:`, title/notes `TEST synthetic … <run>`                                                                                      |
| Integration-test evidence artefacts | `requestId` starting `itest-<run>:`                                                                                                                                                  |
| Integration-test audit events       | `requestId` starting `itest-<run>:` (see §6: never removed individually)                                                                                                             |
| Test staff accounts                 | usernames starting `itest-`, **or** listed by the owner by principal id. Accounts are never inferred from names alone unless they carry the `itest-` prefix created by test tooling. |
| Mock rule packs                     | `isMock: true` packs (never governed; development fixtures)                                                                                                                          |
| Sessions and login throttles        | expire by TTL; never cleaned manually                                                                                                                                                |

## 4. Step-by-step

1. **Freeze**: stop the API (no writes during cleanup). Record the time.
2. **Backup**: encrypted `mongodump` of `khums` (DEPLOYMENT_FREE_TIER.md §7) and
   `--backup-evidence <empty dir>` (prints a verification report: ciphertext hashes, decryption,
   SHA-256). **Restore drill**: restore both into a scratch location and verify
   (`mongorestore` into a throwaway local instance or inspect the archive listing;
   `--verify-evidence-backup`). Stop on any failure.
3. **Integrity baseline**: `--verify-integrity <archive>` (all chains `VERIFIED`) and
   `--verify-evidence` (every artefact's bytes decrypt and match). Stop on any failure.
4. **Dry-run inventory**: `--inventory-database` (counts, markers) and the marker listing (ids of
   every record matching §3, per collection, with the run ids found). **Read-only.**
5. **Dependency check** (§5) over the proposed ids. Any reference from a retained record blocks.
6. **Owner review and approval** of: the exact id lists, the audit decision (§6), and the evidence
   keys to remove (§7). The approval names counts per collection.
7. **Execute** (tooling to be built after approval): delete the approved ids, re-checking each id's
   marker and dependency status immediately before deleting it; audit the cleanup with ids and
   counts only; then remove evidence bytes (§7).
8. **Verify**: `--inventory-database` (retained data identical to step 4 minus exactly the approved
   ids), `--verify-integrity` and `--verify-evidence` per the §6 decision, staff sign-in for the
   retained accounts.

## 5. Dependency rules

- A research chain is removable only if no retained research record references any of its
  revisions (sources ← passages ← translations; later findings, rulings, rule packs).
- An evidence artefact is removable only if its source chain is also being removed, or the owner
  explicitly approves removing that artefact alone.
- A staff account is removable only if it holds no retained role assignment and is not the actor of
  any retained governance, research or provisional record (actors are kept in history).
- Governance ledgers and policy records are never removed by this procedure.

## 6. Audit history and append-only records: owner decision required

**Integration-test runs before real use (implemented, ATLAS_INTEGRATION_TEST_PLAN.md R5 §1.3–§1.4: chain proof, exact run profile, recovery manifest, maintenance fence, one transaction with uncertain-outcome handling, encrypted verified backup, restore under the fence):**
while the database has no bootstrap and holds only one run's marked records,
`--reset-integration-test-run` is the R3 case below for exactly that run: verified backup, deletion
by exact id, empty (valid) audit chain, policy seed, collections, validators and indexes preserved.
It refuses permanently once a SUPER_ADMIN has been bootstrapped. Everything below applies to any
later cleanup.

`auditEvents` is one hash chain; every event links to the previous one. Removing individual events
breaks verification of every later event and of every checkpoint over them. The owner chooses one:

- **R1 Retain everything** (recommended unless synthetic volume is large): synthetic audit events
  stay; they are identifiable by marker and contain ids and codes only. Research/evidence records
  may still be removed (their audit events then refer to ids that no longer exist; this is recorded
  in the cleanup's own audit event).
- **R2 Archive and restart the chain**: export the complete chain and its checkpoints to the
  encrypted offline archive, verify the export, then start a new chain with a genesis event that
  records the archived head digest, the reason and the approval. Requires new checkpoints and an
  update of the checkpoint archive procedure; this is a governance-level change.
- **R3 Full reset of a not-yet-used database**: only if the owner confirms that nothing in the
  database is to be kept beyond the retained set of §2; equivalent to R2 for every chained
  collection.

The same choice applies to research and provisional chains that the checkpoint job has already
signed: removing a signed chain makes verification report `CHAIN_MISSING` unless the archive is
updated under R2.

## 7. Evidence storage coordination

1. Metadata first: remove approved `evidenceArtefacts` documents (step 7 above).
2. Then bytes: `--evidence-orphans` now lists the removed artefacts' keys as orphans; the owner
   approves the list; `--delete-evidence-orphans <keys.json> --confirm "DELETE <n> EVIDENCE
ORPHANS"` removes them (grace period still applies; use `--grace-days 1` only with approval).
3. Never the reverse (bytes before metadata), and never bytes still referenced (the tool re-checks).
4. Keep the pre-cleanup evidence backup and its key until the owner closes the cleanup.

## 8. What this procedure must never do

Drop a database, collection or index; truncate a collection; remove a document by date range,
pattern or name similarity alone; remove retained accounts, roles, policies, ledgers or migration
state; run without a verified backup; or run any destructive step without the owner's written
approval of that exact step.
