# Implementer E: notes (pack 0.10.0, final verification audit FS-01…FS-07, FK-01…FK-05)

Files changed:

- Pack: `packages/marja-rules/src/review-packs/annual.ts`, `build.ts` (Sistani missed-year program now built by the new `sistaniMissedYearParts`, which is pack content), `scenarios.ts`.
- Tests: `packages/core/src/provisional/{comprehensive-annual, comprehensive-khamenei-annual, comprehensive-sistani-first-time, per-year-answers, re-audit-regressions}.test.ts`, `apps/api/src/provisional/provisional.service.test.ts` (one test now passes the scenario's fact answers), and `apps/web/e2e/review-packs.spec.ts` (new regexes and required answers; not run).
- Originals are backed up in `scratchpad/e-orig/`.
- Nothing in `history/` was touched. No engine, schema, API, UI, role, governance or database change. Nothing committed. The API, dev servers and Playwright were not started.

Checks:

| Check                                   | Result                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| marja-rules test                        | 121/121                                                                                                    |
| core test                               | 1043 passed, 1 skipped, 2 failed. The 2 failures are only the history pin tests "is pinned…" (× 2 Marjas). |
| api test                                | 410/410, including the pack-size test                                                                      |
| web test                                | 128/128                                                                                                    |
| eslint and tsc, core and marja-rules    | clean                                                                                                      |
| api tsc                                 | clean                                                                                                      |
| eslint on the e2e spec and the api test | clean                                                                                                      |
| prettier on changed files               | clean                                                                                                      |

Pack size (JSON of the sealed pack, UTF-8; limit < 393,216):

| Marja    | Size (bytes) |
| -------- | ------------ |
| Sistani  | 320,719      |
| Khamenei | 346,263      |

## Per item

| Item                | Result                 | What was done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FS-01 HIGH          | DONE (stop)            | New required program question `leftover-not-converted`, one definition shared by annual and missed years. The label cites 737 الف, ج and 738. `no` → new `consult-leftover-converted`. It sits inside `periodChecked` (after the period check) and wraps `surplus`, so the surplus, khums-due, total, halves, still to pay and the missed aggregate are withheld. Unanswered → INPUT_MISSING_REQUIRED_ANSWER.                                                                                                             |
| FS-02 MED           | DONE (stop)            | Same question, because the annual and missed-year programs share it. The wording works for both: "…including any left over and used later… now in something you still own…".                                                                                                                                                                                                                                                                                                                                              |
| FS-03 MED           | DONE (stop + label)    | **First-time:** `ft-spent-value-loss` (a choice using the `SISTANI_FT.valueLoss` values) comes after `ft-spent-not-present` on the 738 living/business path. no → negligent question as before; yes or not sure → `ft-pending`. **Missed years:** new required per-year choice `missed-money-value-loss` (Sistani missed program only); yes or not sure → `consult-missed-value-loss` on `surplus`. **Annual:** the `earlier-unpaid` label now says "not adjusted for any extraordinary loss of money value, 737 note 5". |
| FS-04 MED           | DONE (stop)            | Sistani EMPLOYMENT and BONUS ask the choice `pay-withheld-626` (`SISTANI_PAY_WITHHELD`: none → earnings; some / not sure → pending-income). This covers annual and missed years.                                                                                                                                                                                                                                                                                                                                          |
| FS-05 LOW           | DONE                   | New id `diving-gems-1836` (replaces `diving-nisab` in Sistani): gems taken by diving into the sea, plus how dives are counted (checked against the 1836 page text). A great river (1841) is not in the label because 1841 states no niṣāb, so it stops (over-stop).                                                                                                                                                                                                                                                       |
| FS-06 LOW           | NOT DONE (limitation)  | The engine/UI cannot check the period's length. The period label already says "exactly one of your khums years, from its first day to its last". Recorded in the sis-736 issues.                                                                                                                                                                                                                                                                                                                                          |
| FS-07 LOW           | NOT DONE (record only) | = AS-8 (UI/engine).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FK-01 HIGH          | DONE                   | New id `religious-duty-used-this-year` (Q46, Q47, Q247); no → pending-expense; old id → clarification. Issue added to kha-current-expenses.                                                                                                                                                                                                                                                                                                                                                                               |
| FK-01 ↔ Sistani     | DONE (stop)            | New id `religious-duty-done-598`: not a deposit for a hajj or ziyarah still to come. Whether a deposit is "spent «در آن سال»" (1795) is not stated, so it stops.                                                                                                                                                                                                                                                                                                                                                          |
| FK-02 MED           | DONE                   | `bonus-kind` gets new values. gift = "…given without any right to demand it (Q187; Q198)". New `entitled` → pending-income. Old values → clarification. kha-bonus summary and issue (Q197/Q198 vs Q187). Choices are kept at ≤ 100 characters (schema).                                                                                                                                                                                                                                                                   |
| FK-03 MED           | DONE                   | Khamenei status question `living-status-all` and source question `living-after-first-income-all` (new ids). The optional widening of `living-leftover` was NOT done (optional; it would need yet another new id).                                                                                                                                                                                                                                                                                                         |
| FK-03 ↔ Sistani     | DONE                   | New ids `living-status-all-598`, `living-from-year-income-all`, `living-598-conditions-all`, naming gifts, charity and religious spending (598 places them under the same conditions).                                                                                                                                                                                                                                                                                                                                    |
| FK-04 LOW           | DONE                   | `khums-known-years` label: "…nothing awaiting review…; 0 for a year under review…".                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FK-05 LOW           | DONE                   | The missed-year `khums-due` label refers to "khums of this year". The annual label is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| FS-01/02 ↔ Khamenei | DONE (stop)            | Same required `leftover-not-converted` question, citing p.5, Q4 and Q126. Khamenei consultation `consult-leftover-converted` (p.5 year-end value; Q4 first year-end value with inflation). A Khamenei missed year that stops makes the known-years aggregate UNRESOLVED (fail-closed).                                                                                                                                                                                                                                    |
| FS-03 ↔ Khamenei    | not needed             | Khamenei already sends all late-khums inflation to review (KF-12, AK-06, consult-missed-inflation).                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FS-04 ↔ Khamenei    | already                | Done by AK-08.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| FS-05 ↔ Khamenei    | already                | Done by AK-13.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

"Encoded:" texts now say "Since 0.10.0 (final audit, …)" for:

- Sistani: sis-736, 737, 738, 620, 1836, 1795, 598, 1792
- Khamenei: kha-current-expenses, kha-bonus, kha-expenses, kha-missed-years

Every rule stays UNVERIFIED.

## Ids

**Added, Sistani.**

- Questions: `leftover-not-converted` (required), `missed-money-value-loss` (required, missed years only), `pay-withheld-626` (choice), `diving-gems-1836`, `religious-duty-done-598`, `living-status-all-598` (required status), `living-from-year-income-all`, `living-598-conditions-all`, `ft-spent-value-loss` (choice).
- Consultations: `consult-leftover-converted`, `consult-missed-value-loss`.
- Export: `SISTANI_PAY_WITHHELD`. Function: `sistaniMissedYearParts`.

**Removed, Sistani.** `diving-nisab`, `religious-duty-598`, `living-within-status-all`, `living-from-year-income`, `living-598-conditions`.

**Added, Khamenei.**

- Questions: `leftover-not-converted` (required), `religious-duty-used-this-year`, `living-status-all` (required status), `living-after-first-income-all`.
- Consultation: `consult-leftover-converted`.
- New `bonus-kind` values: gift (reworded) and `entitled`.

**Removed, Khamenei.** `religious-duty-this-year`, `living-status-with-debts`, `living-paid-after-first-income`.

## Tests

**Defect replayed on frozen 0.9.0, then the 0.10.0 fix pinned with yes / no / unanswered:**

- FS-01: missed years, 2,400 COMPLETE
- FS-02: annual, 2,400
- FS-03: missed years, 4,400; first-time travel, 2,000
- FS-04: gross salary, 2,400
- FS-05: shore gems, part 2,000
- FK-01: 400; the Sistani counterpart, 1,200
- FK-02: 2,400
- FS-01 for Khamenei: 2,400

**Pinned only, no frozen replay:**

- FK-03, both Marjas (old 0.10.0 ids refused with INPUT_UNKNOWN_QUESTION)
- FK-04 and FK-05 labels

**Unanswered required questions:** checked through a helper that runs the pack without the new defaults; the input is refused with INPUT_MISSING_REQUIRED_ANSWER.

**Cross-scenarios** (Sistani annual + missed; Khamenei annual; Sistani first-time):

- Sistani annual: salary + bonus + donation + hajj (+ gems) → 2,400. Each new answer stops in its own way.
- Sistani missed years: 2,000 + 1,200 = 3,200, or UNRESOLVED when one year is "not sure".
- Khamenei annual: gift bonus + donation + hajj → 1,200, and each stop.
- Sistani first-time: old cash + trip → 3,000, or pending.

**Test plumbing (no assertion weakened):**

- `withFinalAuditAnswers` / `withFinalAuditYears` in the three annual test files answer the two new required questions, only on the current pack and only when the test does not answer them.
- The `withAudit10Defaults` helpers add `pay-withheld-626: none` for Sistani salary and bonus.
- Scenarios: `SIS_STATUS_YES` and `KHA_DEFAULTS` answer the new required questions; `sistaniStatus` and `khameneiStatus` map to the new ids; `entryDefaults`, `sisAnnualPay` and `sisMissedPay` answer the pay question.
- No scenario expectation changed.

## Over-stops (for the scholar)

- FS-01/02: the leftover was used for an ordinary purchase (737 ج, price basis), which gives the same figure; or property is worth exactly what was paid (Khamenei). It also stops whenever "no" is answered while the year has no surplus.
- FS-03: a "yes" with no actual effect on the amount.
- FS-04: pay entered net of what was withheld.
- FS-05: gems from a great river (1841) or taken with a tool (1837, by precaution); gems taken from the shore (a gain under 1837).
- Sistani religious duty: a deposit the scholar treats as spent in that year (1795).
- FK-02: an entitled bonus (the text says it is income; stopped because of the Q187 tension).

## Limitations

- FS-06: the period's length is not checked.
- FS-07 / AS-8: the status question is required even when nothing is deducted.
- AF-03: price↔asset link (unchanged).
- AF-05: stale answers off the path (unchanged).
- The Sistani missed-year question `missed-money-value-loss` is required in every year, even a year with no surplus.
- e2e not run.
- Urdu/UI not touched (no pack text lives in the web content).
