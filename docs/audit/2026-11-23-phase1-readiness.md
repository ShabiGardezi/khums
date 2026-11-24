# Phase 1 readiness report (2026-11-23)

Follows [2026-11-23-comprehensive-review-0.10.0.md](2026-11-23-comprehensive-review-0.10.0.md).
Results stay **PROVISIONAL — FOR SCHOLAR REVIEW ONLY**. Roles, permissions, database and
infrastructure were not touched; nothing committed or deployed; Phase 2 not started.

## 1. Independent verification of the test-only corrections

A fresh auditor (not involved in the work) verified the corrections that had been checked only by
tests ([comprehensive-0.10.0/verify-prephase2.md](comprehensive-0.10.0/verify-prephase2.md)):

| Correction                                     | Verdict             | Evidence                                                                                                                                                                        |
| ---------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VF-01 annual year not the latest (both Marjas) | Verified            | Required in annual only; "no" withholds every figure in 4,000 sheets per Marja; "yes" is byte-identical to the pack without the question; missed-year and first-time unaffected |
| VF-03 Sistani missed-year value loss           | Verified            | All category parts withheld with the year's figures; 0 escapes in 1,984 year results                                                                                            |
| Sistani first-time price ↔ asset (below)       | Verified, no escape | All 708 answer endpoints and 7,000 multi-entry sheets; every shown total equals the sum of its single-entry totals                                                              |

Result: 0 CRITICAL, 0 HIGH, 0 MEDIUM, 4 LOW (recorded in §4).

## 2. Sistani first-time: prices that cannot be linked to their items

A purchase price cannot be linked to the asset it bought (no engine feature). The pack no longer
relies on the person's pairing answers: every ordinary purchase from year-old income (khums on its
price, Jami' 737 ج), every purchase price paid from year-old income, and any spending on something
still owned now **stops the calculation for scholar review** (`consult-ft-link`), whatever the
amounts or answers. Risen merchandise and specific-money purchases (khums on current value, no price
entry) still calculate. The earlier residual cases (two items with one price showing 4,000; one item
with two prices showing 7,000; the 18,000 case) now stop. An engine link from a price to its item
would let these cases be calculated later.

## 3. Approval policy aligned (documents only)

Recorded in CLAUDE.md (rule 1 approval policy), docs/RELIGIOUS_RULES.md §5, research/REVIEW_PROCESS.md
§17 (revision 7) and ARCHITECTURE §11 #63. Previous texts are archived byte-for-byte
(`docs/archive/CLAUDE.2026-11-23-before-approval-policy.md`,
`docs/archive/RELIGIOUS_RULES.2026-11-23-before-approval-policy.md`,
`docs/research/archive/REVIEW_PROCESS.rev6.md`).

- **Source-verified** = the authorized scholar for the Marja has verified the rule's sources,
  original text, translation and attribution and recorded it.
- Source-verified rules are **approved automatically** and available for scholar testing and public
  calculation; **no separate approval step or production approval gate**.
- Scholars improve rules only within their assigned Marja permissions (new, audited, re-verified
  versions).
- Rules without adequate source verification stay **`UNVERIFIED`**, staff-only and provisional.
- AI or tool checks never count as source verification (so AI transcriptions cannot reach public
  calculation without a scholar).
- **Not yet in code:** the software still enforces governance approval, the `PRODUCTION` channel and
  the readiness gate. Changing them touches governance and role/permission code and is left for
  Phase 2 with your approval. Today **no rule is source-verified** (all 0.10.0 rules are
  `UNVERIFIED` transcriptions or placeholders), so nothing is approved or public yet.

## 4. Remaining items (none critical or high)

- LOW (verification): Sistani VF-01 label cites 737 note 5, which states value loss only for a price
  (wording); a latest year whose khums is long overdue can itself carry value loss; Sistani
  `earlier-unpaid` stays visible when the year is not the latest; a first-time review entry of
  amount 0 does not withhold the total (existing, no figure effect).
- Engineering limitations, recorded scholar-review stops and over-stops: as listed in the
  comprehensive review §4 (period length, UI items, empty year = 0, source checks by tools only).

## 5. Verification (final state)

| Step                                                                                        | Result                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `pnpm check` (format, boundaries, lint, typecheck, tests, production builds of API and web) | Exit 0; lint 11/11, typecheck 11/11, builds 2/2     |
| Unit and integration tests                                                                  | 2,223 passed, 1 skipped by design                   |
| Playwright e2e (desktop, tablet, mobile; in-memory test API, no database)                   | 501 passed, 3 skipped (viewport-specific), 0 failed |
| Frozen snapshots 0.3.0–0.9.0 (14 files)                                                     | SHA-256 unchanged                                   |

Pack 0.10.0 digests (pinned in `history.test.ts`): Sistani
`8d49a9ceb73078d602187ce6cdd71177021ebf1858382319d3b6fd83da57f585`, Khamenei
`bb5db6e2f923861724bfdee803b9e362649345c5acf520f51a1509bce324b20d`.

## 6. Verdict

**READY FOR PHASE 2**, subject to your approval: no critical or high finding is known in either
calculation system, all historical versions and audit records are preserved, and the approval
policy is documented. Phase 2 must implement the policy in code (governance, channels, readiness)
and the role system; until then the existing gates stay in force.
