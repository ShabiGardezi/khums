# Phase 2 plan — three-role system and scholar rule builder (draft for approval)

Status: **proposal, nothing implemented.** Based on a read-only inspection of the code (2026-11-23).

## Conflicts found (existing code and decisions)

1. **Seven stored roles.** Role grants are append-only records validated against the role enum on
   every read; removing old role names would make existing records unreadable. Old names must stay
   readable.
2. **SUPER_ADMIN has no religious authority today** (decisions 37, 56, 57; incompatibility rule in
   `catalogue.ts`). Your brief gives it full access — this supersedes those decisions.
3. **Cross-Marja read-only testing** cannot be expressed: test calculations are scoped to the pack's
   Marja.
4. **Approval is whole-pack and ledger-based** (PRODUCTION channel, SUBMIT→REVIEW→APPROVE→PUBLISH→
   ACTIVATE, every rule `APPROVED` in hashed content). There is no per-rule source-verification
   record and no rule store outside code-built packs.
5. **No public calculation path exists**, and operational states are deployment-wide: staff-only
   testing (SCHOLAR_REVIEW) makes the whole site private; PRODUCTION_APPROVED refuses staff testing.
6. **No USER accounts exist**; server-side history conflicts with decisions 23, 27, 48 and CLAUDE
   rule 5 (no financial values stored or sent).
7. Rule builder: no draft storage; the engine evaluates fixed programs, so builder rules must fill a
   fixed calculation template rather than free composition.

## Plan (small steps, tests after each)

| Step | Change                                                                                                                                                                                                                                                                                                                                                                               | Database                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 1    | Roles: `SUPER_ADMIN`, `SCHOLAR` (Marja scope) are the only grantable staff roles; `USER` = public (no staff account). Legacy roles stay readable, cannot be granted; `GOVERNING_SCHOLAR` is treated exactly as `SCHOLAR` (same permissions); the other five legacy roles keep only their current permissions until a SUPER_ADMIN converts or revokes them in the admin UI            | None (no data rewritten)                                                        |
| 2    | Permissions: SUPER_ADMIN all permissions (scope ALL); SCHOLAR = today's governing-scholar permissions on its Marjas plus read-only test calculations on any Marja; assignment UI: assign / change / remove Marjas (revoke + grant in one audited action)                                                                                                                             | Append-only role records, as today                                              |
| 3    | Rule builder: predefined fields (Marja, Khums category, ruling, rate where supported, conditions, deductions, exceptions, thresholds, source references) filling a fixed calculation template; every save is a new audited revision                                                                                                                                                  | New append-only collection `scholarRuleRevisions` (additive)                    |
| 4    | Developer-requirement check: each field maps to a capability table of the existing engine; anything else shows **Developer Implementation Required** with the missing capability and blocks activation                                                                                                                                                                               | None                                                                            |
| 5    | Source verification → automatic approval: a scholar records the four checks (sources, original text, translation, attribution) against VERIFIED research records; the system then builds a new PRODUCTION pack version containing only verified rules and runs the existing ledger automatically under a new policy (no separate approval step); readiness and integrity checks stay | New append-only `ruleVerificationRecords` (additive); new policy version seeded |
| 6    | Public calculator uses the active verified pack (new public read endpoint); staff testing of unverified rules stays authenticated and staff-only on the same deployment                                                                                                                                                                                                              | None                                                                            |
| 7    | USER history (see question below)                                                                                                                                                                                                                                                                                                                                                    | Depends on the decision                                                         |
| 8    | Docs, decision log, OpenAPI, unit/integration/permission/E2E tests                                                                                                                                                                                                                                                                                                                   | —                                                                               |

**Destructive changes: none planned.** No existing record is updated or deleted; historical packs,
research data and audit records are untouched. Production Atlas is changed only when you approve
running `--migrate-database` (additive collections and indexes, policy seed).

## Owner decisions (2026-11-23)

| Question                                        | Decision                                                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who records source verification (auto-approval) | An authorized SCHOLAR assigned to the Marja, **or a SUPER_ADMIN**. AI or automated tests never can.                                                                                                                             |
| USER history                                    | Browser-only history now (on the user's device, opt-in); user accounts and synced history later                                                                                                                                 |
| Old roles                                       | Mapped in code, converted by hand: no database rewrite. `GOVERNING_SCHOLAR` acts as `SCHOLAR`; the other five legacy roles keep only their current permissions, cannot be granted, until a SUPER_ADMIN converts or revokes them |
| Deployment                                      | One deployment: public calculator uses only verified rules; signed-in staff test unverified rules there, never visible to the public                                                                                            |

**Note (2026-11-24, Phase 2 P2-5 audit fixes; ARCHITECTURE §11 #69):** a finding cited by a ruling that backs a source-verified builder rule must be
`VERIFIED` or `APPROVED`; a DRAFT finding (including one revised after verification) blocks
verification, and a deleted, withdrawn or superseded finding blocks it and suspends a live version.
**Confirmed by the owner as final Phase 2 policy (2026-11-24; ARCHITECTURE §11 #70):** a DRAFT
research ruling is allowed when the evidence, original text, translation, attribution and the exact
rule revision have been verified by an authorized scholar or a SUPER_ADMIN; DRAFT findings are never
allowed to support a verified public rule and must first be verified in the Research Workspace. A
rule whose evidence is verified is approved automatically, with no separate production approval
step.

## Rule builder design (binding for implementation)

- **Scope of a builder rule set:** one Marja, annual workflow. Builder packs are separate from the
  code-built 0.x scholar-review packs (which stay as they are, staff-only).
- **A builder rule** (one Khums category per rule) has predefined fields only:
  `marjaId`; `category` (from a fixed list: annual surplus of income, mined products, treasure, gems
  from diving, …); `rulingId` (an existing research ruling of the same Marja); `rate` (decimal
  percentage, only for categories whose template takes a rate); `includedEntries` (fact subtypes
  counted); `deductions` (predefined deduction types mapped to expense/liability subtypes);
  `conditions` (predefined yes/no confirmations with the scholar's own label, per entry or for the
  whole calculation, each with a fixed effect: include, exclude, or stop for review); `exceptions`
  (subtypes excluded); `threshold` (minimum amount, with a fixed effect below it: not counted or stop
  for review); `sourceRefs` (research sources/passages).
- **Compilation:** each rule fills a fixed program template made only of existing engine operations
  (sum of categories, subtract, max with zero, compare, when, percentage, consult). No code, scripts
  or expressions are entered.
- **Developer requirement check:** every field value is checked against a capability table of the
  engine. Anything outside it (e.g. date-based conditions, per-item valuation or inflation, linking
  entries, splitting, carry-over between years, currency conversion, first-time or missed-year
  workflows) is shown as **Developer Implementation Required** with the missing capability, and the
  rule cannot be verified or activated until a developer adds the capability (a code change with
  tests) — then the scholar can configure and test it.
- **Versions and audit:** every save is a new append-only revision (actor, time, reason); nothing is
  overwritten.
- **Source verification → automatic approval:** a SCHOLAR of that Marja or a SUPER_ADMIN records the
  four checks (sources, original text, translation, attribution) for a rule revision; cited research
  sources/passages must be VERIFIED. The system then builds a new `PRODUCTION` pack version and runs
  the existing governance ledger automatically under a new policy (no separate approval step);
  technical readiness and integrity checks stay.
- **No misleading public figures:** a public pack includes a category only when its rule and every
  deduction/condition it uses are source-verified; any unverified or developer-required part becomes
  a review stop with the total withheld. Unverified rules are testable by staff only.
