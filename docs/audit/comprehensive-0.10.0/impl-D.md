# Implementer D: notes (pack 0.10.0, fresh audit of 0.10.0: AS-1…AS-9, AF-01…AF-05, AK-01…AK-13, AT-01…AT-07)

Files changed: `packages/marja-rules/src/review-packs/annual.ts`, `scenarios.ts`;
`packages/core/src/provisional/{comprehensive-annual, comprehensive-khamenei-annual,
comprehensive-sistani-first-time, comprehensive-khamenei-first-time, re-audit-regressions,
per-year-answers}.test.ts`; `apps/web/e2e/review-packs.spec.ts` (tests only). Originals backed up in
`scratchpad/d-orig/`. Nothing in `history/` touched. No engine/schema/API/UI change. No commits. API,
dev servers and Playwright not started.

Checks: marja-rules test 121/121; core 1013 passed, 1 skipped, 2 failed (only the two history pin tests
"is pinned…", × 2 Marjas; "never reuses…" passes); api 410/410 (incl. pack-size test); web 128/128;
core + marja-rules eslint and tsc clean; eslint clean on the e2e spec; prettier clean on changed files.

Pack size (sealed pack + reason, UTF-8; limit < 393,216): **Sistani 310,423**, **Khamenei 341,307**.

## Per item

| Item              | Result                        | Notes                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AS-1 HIGH         | DONE                          | Sistani required `period-is-one-khums-year` (ruleIds sis-736, sis-1799; same id as Khamenei, per pack), `consult-period` (Sistani). `periodChecked` now wraps `surplus` for both Marjas (Khamenei's approach), so surplus, khums-due, total, halves, remaining and the missed-year aggregate stop; unanswered → INPUT_MISSING_REQUIRED_ANSWER. Not asked in first-time (not referenced). |
| AS-2 MED          | DONE-AS-STOP                  | `consult-inheritance-value` gates `khums-total` (Sistani) while `inheritance-khums` > 0; `khums-inheritance` relabelled "Part: one-fifth … as entered (valuation to be confirmed)"; profit figures stay. SA-22 issue updated (TODO(rules) kept).                                                                                                                                         |
| AS-3 MED          | DONE-AS-STOP                  | ASSET:JOINT_OWNERSHIP → holdings (Sistani annual/missed). Also applied to Khamenei annual (X consistency). Over-stop co-owned house recorded (sis-737, kha-paid).                                                                                                                                                                                                                        |
| AS-4 MED          | DONE                          | `gain-is-money` on Sistani GIFT, the inheritance→gains leaves and CHARITY_RECEIVED→gains; no → pending-income. Over-stop (gift in kind plainly left over) recorded in sis-1770.                                                                                                                                                                                                          |
| AS-5 LOW          | DONE                          | New id `treasure-nisab-1827` (time-unambiguous wording); `treasure-nisab-together` removed.                                                                                                                                                                                                                                                                                              |
| AS-6 LOW          | DONE                          | Sistani DONATION → `donation-598` (no → pending-expense). Khamenei counterpart `donation-not-owed` (Q247).                                                                                                                                                                                                                                                                               |
| AS-7 LOW          | DONE-AS-STOP                  | `capital-loss-in-costs` after capital-loss-paid (Sistani) / capital-loss-business (Khamenei); yes → pending-expense (fail-safe stop, not exclusion).                                                                                                                                                                                                                                     |
| AS-8 LOW          | NOT DONE                      | Status question stays required when nothing is deducted (needs UI/engine conditional required; no figure risk).                                                                                                                                                                                                                                                                          |
| AS-9 LOW          | NOT DONE (decision)           | Empty year = 0 kept.                                                                                                                                                                                                                                                                                                                                                                     |
| AF-01 HIGH        | DONE                          | `ft-spent-not-present` before `ft-spent-negligent` on the year-old-income living/business path; no → mapping `consult-ft-link`.                                                                                                                                                                                                                                                          |
| AF-02 HIGH        | DONE                          | Choice `ft-bought-for-trade` (trade / not / later) replaces `ft-for-trade` (removed); later → ft-pending. `SISTANI_FT.trade`.                                                                                                                                                                                                                                                            |
| AF-03 MED         | NOT DONE (limitation)         | Engine feature (price→asset fact link or entry count). Case (c) added to the sis-737 limitation issue.                                                                                                                                                                                                                                                                                   |
| AF-04 LOW         | DONE                          | `ft-assets` / `ft-old-spent` output labels.                                                                                                                                                                                                                                                                                                                                              |
| AF-05 LOW         | NOT DONE (UI)                 | Clear stale answers off the path.                                                                                                                                                                                                                                                                                                                                                        |
| AK-01 HIGH        | DONE                          | `khums-remaining` hidden in Khamenei missed years.                                                                                                                                                                                                                                                                                                                                       |
| AK-02 HIGH        | DONE                          | New choice values: doubtGift "…and my records cannot settle it (Q250)"; unpaid "…not calculated (Q250)…". Old values → clarification.                                                                                                                                                                                                                                                    |
| AK-03 HIGH        | DONE                          | Khamenei living-source question new id `living-paid-after-first-income` (Q151, Q155; p.40); `living-from-year-income` removed from Khamenei; `consult-living-source` label adds the time condition. New `AnnualDefinition.livingSourceQuestionId`.                                                                                                                                       |
| AK-04 MED         | DONE                          | `business-debt-in-costs` after `debt-business-cost`=yes (BUSINESS_DEBT and the general tree): yes → exclude kha-debts, no → business-debts.                                                                                                                                                                                                                                              |
| AK-05 MED         | DONE                          | New id `work-costs-or-losses-in-business` (replaces `work-costs-in-business`), condition includes capital-losses. Sistani counterpart: program question `capital-loss-own-business` (only with work-earnings + capital-losses) → consult-work-costs.                                                                                                                                     |
| AK-06 MED         | DONE-AS-STOP                  | Khamenei annual/missed `earlier-unpaid` → `consult-ftk-unpaid-inflation` when present (label updated). Total unaffected.                                                                                                                                                                                                                                                                 |
| AK-07 MED         | DONE                          | Khamenei status question new id `living-status-with-debts` (covers loan/credit/earlier-debt spending).                                                                                                                                                                                                                                                                                   |
| AK-08 MED         | DONE                          | EMPLOYMENT choice `pay-withheld` (`KHAMENEI_PAY_WITHHELD`): none / without choice & net → earnings; agreed or not sure → pending-income; without choice & gross → consult-entry. Over-stop: agreed withholding (Q72 states a year-end liability, not calculated).                                                                                                                        |
| AK-09 LOW         | DONE                          | Label of `debt-earlier-paid-in-time` (same id).                                                                                                                                                                                                                                                                                                                                          |
| AK-10 / AK-13 LOW | DONE                          | New id `diving-gems-nisab` ("taken from the sea by diving"; "Enter the value after those costs"); no → consult-special.                                                                                                                                                                                                                                                                  |
| AK-11 LOW         | DONE                          | Missed-year `surplus` → consult-khums-paid when khums paid (so khums-due too).                                                                                                                                                                                                                                                                                                           |
| AK-12 LOW         | NOT DONE (decision, as SA-20) | Empty year.                                                                                                                                                                                                                                                                                                                                                                              |
| AT-01 HIGH        | DONE                          | `ftk-amount-is-year-end-value` wraps both `ftk-current` leaves; no → consult-entry.                                                                                                                                                                                                                                                                                                      |
| AT-02 MED         | DONE                          | `otherIncome` choice → review; `earnings` new value.                                                                                                                                                                                                                                                                                                                                     |
| AT-03 MED         | DONE-AS-STOP                  | Label split instruction + `KHAMENEI_FUNDS.mixed` → review on all three trees (necessity too: over-stop, Q252 may give a settlement; recorded).                                                                                                                                                                                                                                           |
| AT-04 / AT-05 LOW | DONE                          | Labels.                                                                                                                                                                                                                                                                                                                                                                                  |
| AT-06 LOW         | DONE                          | New id `ftk-capital-hardship-all` ("ALL your capital").                                                                                                                                                                                                                                                                                                                                  |
| AT-07 LOW         | DONE-AS-NOTE                  | Issue in kha-ftk-capital.                                                                                                                                                                                                                                                                                                                                                                |

All changed transcriptions say "Since 0.10.0 (fresh audit of 0.10.0, <ID>) …": sis-736, 1799, 1772, 1770,
1771, 1776, 1825, 598, 1801, 1790, 737 (issues), 738, 739; kha-income, expenses, current-expenses, debts,
old-debts, capital-loss, business-lines, business-cost, ftk-doubt, paid, diving, ftk-unpaid,
missed-years, ftk-capital, ftk-cash, ftk-hardship. All UNVERIFIED.

## Ids

Sistani added: `period-is-one-khums-year` (required), `gain-is-money`, `donation-598`,
`capital-loss-in-costs`, `capital-loss-own-business`, `treasure-nisab-1827`, `ft-bought-for-trade`
(choice), `ft-spent-not-present`; consultations `consult-period`, `consult-inheritance-value`. Removed:
`treasure-nisab-together`, `ft-for-trade`.
Khamenei added: `living-status-with-debts` (required status), `living-paid-after-first-income`,
`pay-withheld` (choice), `donation-not-owed`, `capital-loss-in-costs`, `business-debt-in-costs`,
`work-costs-or-losses-in-business`, `diving-gems-nisab`, `ftk-amount-is-year-end-value`,
`ftk-capital-hardship-all`. Removed: `living-within-status`, `living-from-year-income`,
`work-costs-in-business`, `diving-nisab`, `ftk-capital-hardship`. Changed choice values:
`holding-source` (doubtGift, unpaid), `ftk-money-kind` (earnings; + otherIncome), `ftk-money-source`
(+ mixed).

## Scenarios / tests

- Scenario plumbing: `SIS_STATUS_YES` and Sistani defaults answer the period; `khameneiStatus()` maps
  the shared status/source answers to the new Khamenei ids; `entryDefaults()` (via
  `withHoldingDefaults`, now also used by the Khamenei comprehensive drafts) answers the new entry
  questions (gain is money, donation is a gift, capital loss not in costs, nothing withheld from pay,
  business debt not in costs); `missedKnown` adds pay-withheld; first-time helpers use the new ids.
- Expectations changed: sistani-annual-inheritance-khums-unpaid (total withheld,
  consult-inheritance-value), khamenei-annual-special-situations (earlier-unpaid null +
  consult-ftk-unpaid-inflation); purposes updated.
- Test files: a `withAudit10Defaults` helper (current pack only, never frozen) in the annual-type test
  files; new describe blocks per item with frozen-0.9.0 replays where the defect existed (AS-1, AS-2,
  AS-3, AS-4, AS-6, AS-7, AF-01, AF-02, AK-01, AK-03, AK-04, AK-05, AK-06, AK-08, AK-11, AT-01 and the
  Khamenei counterparts) and pinned corrected behaviour for 0.10.0-only defects (AK-02, AT-02, AT-03,
  AT-06), each with yes/no/unanswered (and invalid where relevant).
- e2e (not run): Sistani journeys answer the required period question Yes (annual ×2, missed per year);
  Khamenei journey regexes for the renamed status, living-source and work-costs questions.

## Over-stops (for the scholar)

AS-3 co-owned house (both Marjas); AS-4 gift in kind plainly left over; AS-7 a loss whose price is in
costs stops instead of being excluded; AF-02 items later held for sale; AK-08 agreed withholding;
AK-13 gems taken by tool or from the shore; AT-03 necessity from an inseparable mix (Q252).

## Limitations

AF-03 (engine price→asset link); AS-8 (conditional required status question: UI/engine); AF-05 (UI
stale answers); AS-9 / AK-12 empty year (decision). No Sistani counterpart for AK-03 (first-income
timing) or AK-08 (Q72): no Sistani transcription states them.
