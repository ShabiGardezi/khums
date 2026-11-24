# Implementer A1: notes (pack 0.10.0, shared annual program + Sistani SA-1 … SA-23 + X1/X2/X6)

Files changed: `packages/marja-rules/src/review-packs/annual.ts`, `scenarios.ts`;
`packages/core/src/provisional/{comprehensive-annual.test.ts (new), re-audit-regressions.test.ts,
per-year-answers.test.ts, review-packs.test.ts}`; `apps/web/e2e/review-packs.spec.ts` (tests only).
Originals backed up in `scratchpad/a1-orig/`. Nothing in `history/` touched. No commits.

Checks: marja-rules test 121/121; core test all green except the 4 history pin tests (2 tests × 2
Marjas); core + marja-rules lint and typecheck clean; prettier applied. Web build / Playwright not run.

## Per item

| Item       | Result                 | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SA-1       | DONE                   | Sistani-only `sistaniHoldingTargets` (Khamenei still uses the old `holdingTargets`). New choice `holding-source` (export `SISTANI_HOLDING_SOURCE`: paid / inherited / other-or-not-sure), new `holding-inh-unexpected`, `holding-inh-valid`; `holding-paid` removed from the Sistani pack. `holding-inherited-unpaid` kept (same meaning; also used by Sistani first-time).                                                             |
| SA-2       | DONE                   | `inh-deceased-unpaid` → `inh-deceased-unpaid-due` (Sistani). Khamenei keeps its own `inh-deceased-unpaid`.                                                                                                                                                                                                                                                                                                                              |
| SA-3       | DONE                   | Program question `living-598-conditions`; new `consult-living-conditions`. Gates `living` and (Sistani) `debts-deducted`.                                                                                                                                                                                                                                                                                                               |
| SA-4       | DONE                   | RELIGIOUS_DUTY → `religious-duty-598` (yes living, no pending-expense).                                                                                                                                                                                                                                                                                                                                                                 |
| SA-5       | DONE (small deviation) | `business-costs-capital`, `consult-business-capital`. Asked only when business costs are entered (reviewer: whenever business present).                                                                                                                                                                                                                                                                                                 |
| SA-6       | DONE                   | Sistani `work-earnings` category (FREELANCE, RENTAL); `earnings` step now sums `earnings`+`work-earnings` for both Marjas. `business-costs-own-only` asked only when work-earnings AND business costs present; Sistani `consult-work-costs`.                                                                                                                                                                                            |
| SA-7       | DONE                   | `debt-personal-item` → `debt-personal-item-use`; new `debt-item-bought-earlier`, `debt-item-first-surplus`. Over-stop recorded in sis-1803 issues.                                                                                                                                                                                                                                                                                      |
| SA-8       | DONE                   | `capital-loss-paid`. Over-stop (685 ب tools) recorded in sis-1801 issues.                                                                                                                                                                                                                                                                                                                                                               |
| SA-9 / X1  | DONE (both Marjas)     | Surplus gated by holdings, pending-mixed, mixed-over-fifth (Khamenei: consult-mixed-over-fifth), mixed remainder, pending-special, special remainder, and (Sistani) khums-paid-other. Gates sit AFTER the existing pending/inheritance/debts gates and each also evaluates the profit figure, so stops inside the profit (e.g. unsold stock) are still reported. Category parts (mined/treasure/diving/mixed/inheritance) stay visible. |
| SA-10 / X2 | DONE (both Marjas)     | New shared `consult-special-remainder`; gate in `khums-total` and surplus. No Khamenei excerpt settles the remainder (kha-mined/treasure/diving speak of the niṣāb and «بدون لحاظ سال خمسی», i.e. timing). Over-stop recorded in sis-1816 and kha-mined issues.                                                                                                                                                                         |
| SA-11      | DONE                   | Status question renamed for Sistani: `living-within-status-all` (new `AnnualDefinition.statusQuestionId`; Khamenei stays `living-within-status`). `debt-living-this-year` → `debt-living-this-year-spent` (Sistani).                                                                                                                                                                                                                    |
| SA-12      | DONE                   | KHUMS_PAID → `khums-paid-this-year` (yes khums-paid, no new category `khums-paid-other` → `consult-khums-paid-other`).                                                                                                                                                                                                                                                                                                                  |
| SA-13      | DONE                   | ASSET:RECEIVABLE → holdings (Sistani).                                                                                                                                                                                                                                                                                                                                                                                                  |
| SA-14      | DONE (decision)        | INVESTMENT_RETURN → pending-income (Sistani).                                                                                                                                                                                                                                                                                                                                                                                           |
| SA-15      | DONE                   | LIABILITY:BUSINESS_DEBT → debts (Sistani).                                                                                                                                                                                                                                                                                                                                                                                              |
| SA-16 / X6 | DONE (both Marjas)     | Output labels: total "…before any khums already paid (PROVISIONAL)", halves "…half of the total, before khums already paid"; step labels too (annual program only; first-time labels untouched).                                                                                                                                                                                                                                        |
| SA-17      | DONE (Sistani only)    | `living`/`debts-deducted` return zero when nothing of that kind is entered. Not applied to Khamenei (A2 may adopt).                                                                                                                                                                                                                                                                                                                     |
| SA-18      | DONE                   | `treasure-nisab` → `treasure-nisab-together` (Sistani), sis(1827) added to sis-1825 sources.                                                                                                                                                                                                                                                                                                                                            |
| SA-19      | NOT DONE (decision)    | Over-stop kept, recorded in sis-1803 issues.                                                                                                                                                                                                                                                                                                                                                                                            |
| SA-20      | NOT DONE (decision)    | Behaviour kept.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| SA-21      | DONE (both)            | `khums-remaining` label says earlier unpaid khums is shown separately.                                                                                                                                                                                                                                                                                                                                                                  |
| SA-22      | DONE-AS-NOTE           | Did NOT add "enter the value as received" (that picks a valuation reading). Added a `TODO(rules)` comment + issue in sis-1772.                                                                                                                                                                                                                                                                                                          |
| SA-23      | NOT DONE               | Nothing to change.                                                                                                                                                                                                                                                                                                                                                                                                                      |

All changed transcriptions have "Since 0.10.0 (comprehensive review, <ID>) …" text: sis-1769, 1771,
1772, 1790, 1791, 1792, 1795, 1803, 1816, 1825, 1836, 1830, 1851, 737 (issues), 598, 1801, 1783;
kha-mined, kha-treasure, kha-diving (X2), kha-mixed (X1), kha-distribution (X6). All UNVERIFIED.

## Ids now taken (Sistani pack unless noted)

Questions: `holding-source` (choice), `holding-inh-unexpected`, `holding-inh-valid`,
`inh-deceased-unpaid-due`, `living-within-status-all`, `living-598-conditions`, `religious-duty-598`,
`khums-paid-this-year`, `capital-loss-paid`, `business-costs-capital`, `business-costs-own-only`,
`debt-living-this-year-spent`, `debt-personal-item-use`, `debt-item-bought-earlier`,
`debt-item-first-surplus`, `treasure-nisab-together`. Removed from Sistani: `holding-paid`,
`inh-deceased-unpaid`, `living-within-status`, `debt-living-this-year`, `debt-personal-item`,
`treasure-nisab`.
Consultations: shared `consult-special-remainder`; Sistani `consult-living-conditions`,
`consult-business-capital`, `consult-work-costs`, `consult-khums-paid-other`.
Categories: Sistani `work-earnings`, `khums-paid-other`.

## Scenario expectations changed (purpose texts updated)

- X1 (both): annual-family, annual-family-debts (Sistani), annual-inheritance-gift,
  annual-pension-religious, annual-special-situations, annual-treasure-below, all mixed cases
  (`MIXED_WITHHELD` is now `NONE`), annual-mixed-over-fifth → profit figures null.
- X2 (both): annual-mined, annual-treasure, annual-diving → `consult-special-remainder`, total null,
  part visible.
- Sistani: annual-investor (+consult-pending), annual-bank-profit (→ consult-pending).
- New scenario `annual-family-income` (both; replaces the isolation check that used annual-family's
  khums-due 6,660 / 5,760, now withheld). New Sistani-only list `sistaniComprehensive` (10 scenarios:
  SA-1 ×2, SA-3, SA-4, SA-5, SA-6, SA-7, SA-8, SA-12, SA-13).
- Scenario plumbing: `sistaniStatus()` maps the shared status answer to `living-within-status-all`;
  Sistani defaults add `living-598-conditions: true`, `business-costs-capital: false`;
  `withHoldingDefaults(marjaId, …)` uses `holding-source: other` for Sistani.

## For A2 / B / C

- `holdingTargets` is now Khamenei-only; `withHoldingDefaults` / `holdingDefault` in scenarios
  branch per Marja (change the Khamenei branch for KA-03).
- `profitWithheld` list in `annualParts` is the single place for X1 gates (add KA-08 period review
  etc. there). Khamenei missed-year `khums-known-years` conditions were NOT extended: a year with
  mined/treasure/diving or pending-special now gives an unresolved `khums-total`, so the aggregate
  is unresolved rather than 0 for that year — A2 should decide (add `present('mined','treasure',
'diving','pending-special')` to the zero list, or keep).
- X3/X4/X8 Khamenei counterparts (business capital, receivables, RELIGIOUS_DUTY, BUSINESS_DEBT) not done.
- Khamenei `consult-work-costs` id is the same as Sistani's (separate packs; fine).
- Pack size: sealed Sistani pack + reason ≈ 237 KB; the API test requires < 262 KB (half of
  512 KB). Little headroom for B/C — keep labels/summaries tight.
- API test `apps/api/src/provisional/provisional.service.test.ts` uses scenario answers (adapts
  automatically) — not run here (API not started).
