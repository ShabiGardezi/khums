# Atlas migration and pre-deployment report: annual assessment (P4-3)

Date: 2026-11-24. Scope: annual assessment only; P4-4 and P4-5 not started. Nothing committed,
pushed or deployed. Nothing is religiously verified: every research record is DRAFT and every rule
is **"Approved for scholar testing by AI — not verified by a scholar"**. Coverage matrix:
`docs/audit/2026-11-24-annual-coverage.md`. Rules and tests: `docs/audit/2026-11-24-p4-3-report.md`.

## 1. What was done against the Atlas database

| Step             | What happened                                                                                                                                                                                  | Result                                                                                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Connectivity     | TLS to the three shard hosts failed until the owner added this machine's IP to the Atlas access list                                                                                           | TCP and TLS 1.3 OK; read-only inventory succeeds                                                                                                                                                                                                 |
| Inventory before | Read-only (`--inventory-database`)                                                                                                                                                             | Only bootstrap data: 1 administrative-control record, 1 audit event, 2 policy-registry records, 1 staff account, 1 role assignment; research collections empty; `scholarRuleRevisions`, `scholarRuleRequests`, `ruleVerificationRecords` missing |
| Migration        | `node dist/main.js --migrate-database` (additive, idempotent)                                                                                                                                  | Created the 3 missing collections with validators and indexes; re-applied validators and indexes to the 20 existing ones; no document changed; no index missing afterwards                                                                       |
| Office text      | `scripts/fetch-office-passages.mjs`, run by the owner's terminal                                                                                                                               | 378 Sistani and 181 Khamenei passages found (git-ignored cache, never committed)                                                                                                                                                                 |
| Import           | `scripts/import-research-bundle.mjs` through a local web tier and API pointed at Atlas, signed in with the owner's own SUPER_ADMIN account (password typed by the owner, never seen or stored) | Sistani: 453 research records, 5 rules. Khamenei: 257 research records, 5 rules. 0 reused, 0 revised                                                                                                                                             |

The local stack ran the built code with `KHUMS_OPERATIONAL_STATE=SCHOLAR_REVIEW`, edge signatures
required, and one-off random signing secrets held in a private scratch file (never printed or
committed). The import script gained `KHUMS_LOCAL_CLIENT_IP=1` (localhost only) so a local web tier
can sign its requests; no security check was weakened.

## 2. Verified database contents (read-only checks after the import)

| Collection                                                            | Before  | After   | Expected                                                                                                                                          |
| --------------------------------------------------------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| researchSources                                                       | 0       | 6       | 4 Sistani + 2 Khamenei                                                                                                                            |
| sourcePassages                                                        | 0       | 559     | 378 + 181                                                                                                                                         |
| passageTranslations                                                   | 0       | 0       | none in the bundles (sources are read in the original; the office's English edition is a source of its own)                                       |
| researchFindings                                                      | 0       | 135     | 66 + 69                                                                                                                                           |
| religiousRulings                                                      | 0       | 10      | 5 + 5                                                                                                                                             |
| scholarRuleRevisions                                                  | missing | 10      | 5 + 5                                                                                                                                             |
| ruleVerificationRecords                                               | missing | 0       | 0: nothing verified                                                                                                                               |
| scholarRuleRequests                                                   | missing | 0       | 0                                                                                                                                                 |
| rulePackContents, governanceLedgerRecords                             | 0       | 0       | 0: nothing published                                                                                                                              |
| administrativeControl, governancePolicyRegistry, staffRoleAssignments | 1, 2, 1 | 1, 2, 1 | unchanged                                                                                                                                         |
| staffAccounts                                                         | 1       | 2       | a second account was created through the admin console at 12:53 UTC (not by the import or by AI); it has **no role** and must change its password |

Audit trail: 710 `research.record.appended` (= 453 + 257) and 10 `builder.rule.created` events, plus
sign-in events. There is no verification, approval, publication or activation event.

Every research record carries an AI-involvement declaration; none has been reviewed or verified.

## 3. Rule versions, AI status and scholar-testing availability

An offline check of the 10 revisions read from Atlas (with the application's own schema, validator
and compiler) confirmed:

- 5 rules per Marja, each at **revision 0**, AI stage **`APPROVED_FOR_SCHOLAR_TESTING`**, none rejected.
- The stored content equals the reviewed `rules.json` content exactly, with every `@key` reference
  resolved to the ruling and source records the import created in Atlas (all exist, all of the
  right Marja).
- Every rule is complete (no validation errors, nothing missing) and all five compile into the
  scholar-testing pack: Sistani ANNUAL_SURPLUS, MINED_PRODUCT, TREASURE, DIVING_GEMS, MIXED_FUNDS
  (30 questions); Khamenei the same five (21 questions).
- The same content passes the 48 calculator scenarios of `apps/api/test/annual-rules.integration.test.ts`
  through the HTTP test endpoint (in-memory database).

**Not done by AI:** a signed-in run of the scholar-testing calculator against Atlas (it needs the
owner's sign-in). To do it: sign in at the local web tier, open Admin → Rules, choose a Marja and
run a test; every result must show the provisional notice and the AI badge.

## 4. Checks

`pnpm check` (format, boundaries, lint, typecheck, unit and integration tests, build): pass.
Playwright: 578 passed, 7 skipped. Lint and format of the changed import script: pass.

## 5. What remains before deployment

1. **Owner review and commit approval.** The repository has no commits yet; nothing is committed
   or pushed.
2. **Deploy the code before (or together with) using this data.** The records use values only the
   new code reads (`aiPreparation`, `rejected`, deduction types `HOLDINGS_PURCHASES` and
   `COST_OF_ITEMS_SOLD`, AI assistance types `TEXT_TRANSCRIPTION` and `FINDING_DRAFT`). An older
   deployment pointed at this database would fail to read the research and rule screens.
3. **Deployment configuration** (Render API, Vercel web): `KHUMS_OPERATIONAL_STATE=SCHOLAR_REVIEW`,
   `KHUMS_REQUIRE_EDGE_SIGNATURE=true`, a shared `STAFF_EDGE_SECRET`, `STAFF_AUTH_SECRET`,
   `KHUMS_CLIENT_IP_HEADER`, the Atlas URI as a secret; the Atlas access list must admit the
   hosted API.
4. **Signed-in scholar-testing run** against Atlas (section 3).
5. **Staff accounts.** Give the second account its role (for example SCHOLAR for one Marja) or
   deactivate it. Verification should be done by a scholar of the Marja (or a SUPER_ADMIN).
6. **Scholar verification before any public calculation.** Research stays DRAFT and rules stay
   `UNVERIFIED` until an authorised scholar verifies the evidence and the exact rule revision;
   only then does a `PRODUCTION` builder version exist. Until then the rules are staff-only.
7. **Known annual gaps** (coverage matrix §5): inflation-adjusted values, carry-over between
   years, date logic, receivables and balances, khums paid during the year need developer work
   (planned for P4-4/P4-5, not started); obligatory precautions and personal circumstances stay
   scholar review; digital assets need research.
8. **Housekeeping:** stop the local Atlas stack; the access-list entry for this machine can be
   removed if no longer needed.

## 6. Annual update in Atlas (decisions 77–78), 2026-11-24

Run by the owner with their own sign-in (`scripts/import-research-bundle.mjs --revise-drafts`):

| Marja    | Research records      | Draft rulings revised     | Rules revised                      | Rules created |
| -------- | --------------------- | ------------------------- | ---------------------------------- | ------------- |
| Sistani  | 452 reused, 0 created | 1 (annual surplus ruling) | 1 (annual surplus, revision 0 → 1) | 0             |
| Khamenei | 256 reused, 0 created | 1 (annual surplus ruling) | 1 (annual surplus, revision 0 → 1) | 0             |

Verified read-only afterwards: 12 rule revisions (each annual surplus rule keeps revision 0 and
gains revision 1; the other eight rules are unchanged at revision 0), all "Approved for scholar
testing by AI", none rejected; the latest revisions equal `rules.json` exactly, cite existing
records, are complete, and compile into the scholar-testing pack (5 rules per Marja); 12 ruling
records (2 revisions added, still DRAFT); 0 verification records, 0 published packs. No other
collection changed. Before deployment, the deployed code must include decisions 77–78, since the
new revisions use fields only that code reads.

## 7. P4-3 final update in Atlas, 2026-11-24

Run by the owner with their own sign-in (`--revise-drafts`): Sistani 452 records reused, 1 draft
ruling revised, annual surplus rule revision 1 → 2 (34 confirmations, 42 sources); Khamenei 256
reused, 1 draft ruling revised, annual surplus revision 1 → 2 (34 confirmations, 45 sources).
Verified read-only: 14 rule revisions (earlier revisions kept), every current revision complete,
equal to `rules.json`, "Approved for scholar testing by AI", compiling into the scholar-testing
pack (5 rules per Marja); 14 ruling records (still DRAFT); 0 verification records; 0 published
packs; no other collection changed.
