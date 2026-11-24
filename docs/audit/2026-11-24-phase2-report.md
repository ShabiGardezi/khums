# Phase 2 report — three-role system and scholar rule builder (2026-11-24)

Plan and owner decisions: [../PHASE2_PLAN.md](../PHASE2_PLAN.md). Decisions recorded in
ARCHITECTURE §11 #64–#70. Nothing committed, pushed or deployed; production Atlas untouched.

## 1. Role and permission matrix

| Role            | Scope                         | Access                                                                                                                                                                                                                                                                                         |
| --------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SUPER_ADMIN** | All Marjas                    | Every permission: users, roles, scholar accounts and Marja assignments, policies, audit, all research ("fatwas"), rules, governance, packs, calculations, feedback; may record source verification (owner decision). Cannot administer its own account; the last SUPER_ADMIN cannot be removed |
| **SCHOLAR**     | Assigned Marjas (one or more) | Own Marjas: research lifecycle, rule builder (create, revise, check, test), source verification, packs and governance, staff testing, feedback. Other Marjas: read and read-only test calculations only                                                                                        |
| **USER**        | Public, no account            | Public calculator: choose a Marja, enter figures, calculate with publicly available verified rules, see the breakdown, optional history saved on the device only                                                                                                                               |
| Legacy roles    | As stored                     | Readable, never grantable. `GOVERNING_SCHOLAR` acts exactly as SCHOLAR; the other five keep exactly their old permissions until a SUPER_ADMIN converts or revokes them                                                                                                                         |

All checks run on the backend through `@khums/core` `authorize`. An independent audit checked all 72
API operations (401 without a session, 403 without CSRF, scholar isolation) and found no broadened
legacy permission.

## 2. Scholar Marja assignment workflow

SUPER_ADMIN creates the account (temporary password, forced change), grants SCHOLAR with one or more
catalogue Marjas, changes Marjas or converts a legacy role in one audited action
(`POST admin/staff/accounts/:id/roles/:assignmentId/replace` → revoke + grant + `staff.role.replaced`),
and removes an assignment. Records are append-only; sessions are revoked on every change.

## 3. Rule Builder

Per-Marja staff page with predefined fields only: Marja, Khums category, related ruling (research
record), rate where the template takes one (never filled in by the system), counted entry types,
deductions, conditions (per entry or per calculation; effect include, exclude or stop for review),
exceptions, threshold, source references, notes. No code, scripts or expressions. Every save is a
new append-only revision with audit history; staff test calculations are labelled **PROVISIONAL —
FOR SCHOLAR REVIEW ONLY**. Results are per category, labelled "separate, not added together", at
full precision ("exact amount, not rounded").

## 4. Automatic developer-requirement detection

A capability table of the existing engine (annual workflow; supported categories, deductions,
conditions) is checked on every save. Requirement flags (dates/timing, market value or inflation,
linking entries, proportional splits, carry-over, currency conversion, first-time or missed-year,
other) and unsupported fields show **Developer Implementation Required** with an explanation (en and
ur). Such a rule cannot be verified or activated and compiles only to a review stop; once a
developer adds the capability, the scholar can configure and test it.

## 5. Source verification and automatic approval

1. A SCHOLAR of the Marja or a SUPER_ADMIN records the four attestations (sources, original text,
   translation, attribution) for one exact rule revision. AI, system actors and automated tests
   cannot verify.
2. Preconditions: cited sources and passages VERIFIED, translations REVIEWED, findings VERIFIED or
   APPROVED, ruling current, no developer requirement; otherwise refused with a stable code. Final
   evidence policy (owner decision 2026-11-24, #70): a DRAFT ruling is allowed once its evidence and
   the exact rule revision are verified; a DRAFT finding never is.
3. On verification the server publishes a new `PRODUCTION` builder version containing only verified
   rules, through the existing governance ledger under `SOURCE_VERIFIED_AUTO_V1` (no separate
   approval step; integrity and readiness checks unchanged). Unverified parts are review stops.
4. The public calculator serves that version (sealed pack plus a public summary, no staff ids or
   notes) and re-checks it against current research on every serve: if cited research is disputed,
   withdrawn, superseded, deleted or changed, the Marja's figures stop and staff see the rule as
   suspended.
5. A correction is a new revision, verified again, then a new pack version; old versions and the
   audit history are kept. Re-verifying an identical live revision is refused.

## 6. Database changes

- Additive only: new append-only collections `scholarRuleRevisions` and `ruleVerificationRecords`
  (validators, indexes, least-privilege roles, in-memory adapters). Production needs
  `--migrate-database` (**not run**; needs your approval).
- No existing record updated or deleted; no data migration (legacy roles mapped in code). The
  `SOURCE_VERIFIED_AUTO_V1` policy is bound in code for builder packs; the policy registry and
  existing ledgers are unchanged. Historical packs (0.3.0–0.9.0) byte-identical.

## 7. Test results (final state)

| Step                                                                         | Result                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------- |
| `pnpm check` (format, boundaries, lint, typecheck, tests, production builds) | Exit 0; lint 11/11, typecheck 11/11, builds 2/2     |
| Unit and integration tests                                                   | 2,402 passed, 1 skipped by design                   |
| Playwright e2e (desktop, tablet, mobile; in-memory API)                      | 530 passed, 7 skipped (viewport-specific), 0 failed |

Independent audits: security (0 CRITICAL, 0 HIGH; 1 MEDIUM, 2 LOW) and builder/verification
(0 CRITICAL; 2 HIGH, 1 MEDIUM, 5 LOW) — all fixed and re-tested.

## 8. Remaining limitations

- **No real rule is live yet:** every Marja shows "no verified rules" until scholars enter, verify
  and publish rules (the code-built 0.10.0 packs stay staff-only).
- **Builder coverage:** annual workflow only; thresholds always need a developer (the engine cannot
  hold a fixed money amount); no combined total across categories; no rule retirement yet; rules
  only for the research Marjas (sistani, khamenei); builder packs use a fixed effective date.
- **USER accounts:** not built; history stays on the device (owner decision).
- **Operations:** public reads are cached 30 s per process with no rate limit; suspension audit
  events are written once per process; `--migrate-database` must be run on production before use.
- **Hand-built packs** keep the earlier governance workflow.
- One existing flaky assertion in `provisional.service.test` (random id may contain "4321") —
  unrelated, passed on rerun.
