# Independent verification: scholar-review packs 0.10.0 (pre-Phase-2 corrections)

Auditor: fresh, read-only. Date: 2026-11-23. Packs: `sealedReviewPack('sistani' | 'khamenei')`, version 0.10.0.
Method: one temp test (`packages/core/src/provisional/zz-verify-prephase2.tmp.test.ts`, now deleted). It used
`prepareAssessmentInput` and `calculate(..., { mode: 'scholar-review' })`. No other file was changed, nothing was
committed, and the API, dev servers and Playwright were not started.

## How the checks were run

1. **Exhaustive per-fact answer trees.** For every workflow (annual, first-time, missed-year) × Marja × every fact kind
   and subtype (`FINANCIAL_FACT_SUBTYPES`), a depth-first search answered every per-fact question with each of its
   choices until mapping ended. That gave 2,597 leaves: Sistani 240 / 708 / 240 and Khamenei 211 / 857 / 341.
2. **Unwrapped reference pack.** For the annual workflow, a reference pack was built from the sealed pack. Each
   `when(period-is-latest-year)` wrapper was replaced by its `then` branch and the pack was re-sealed with
   `sealRulePack`. This is "the behaviour before VF-01". Results were compared byte for byte (every output value and
   every unresolved id).
3. **Random multi-entry sheets.** Sheets of 1–9 entries were drawn from the mapped leaves, with amounts 0, 0.01, 12.34,
   1000, 4000, 20000, 30000 and 42000. Program answers were either random over every program question or sensible
   defaults.

## Verdicts

### VF-01: `period-is-latest-year` (both Marjas, annual only). **Verified.**

- **Where it is required.** The question is referenced only by `workflows.annual`, through `annualOnlyProgram` in
  build.ts:405. The first-time and missed-year programs never reference it, in either Marja.
  - Annual with the question unanswered: the engine refuses (`INPUT_MISSING_REQUIRED_ANSWER`), 200 of 200 runs per Marja.
  - An invalid value (`'yes'`) is refused.
  - Missed-year runs with no answer are never refused, and their results are identical with or without the answer
    (1,500 sheets per Marja). First-time does not require it.
- **"No".** In 2,500 random sheets plus 1,500 default-answer sheets per Marja, every one of these was null:
  `surplus`, `khums-due`, `khums-total`, `sahm-imam`, `sahm-sadat`, `khums-remaining`, `khums-inheritance`,
  `khums-mined`, `khums-treasure`, `khums-diving` and `khums-mixed`. `consult-earlier-year` was always unresolved and
  the status was never COMPLETED. That held in all 112 Sistani and 147 Khamenei sheets where "yes" shows a surplus.
  - Still shown on "no": the `review-*` indicators, and `earlier-unpaid`. For Sistani, `earlier-unpaid` is the amount
    the person entered, labelled "as entered … not adjusted"; for Khamenei it is 0 or a consult. See L-3.
- **"Yes".** Identical to the unwrapped reference in 4,000 of 4,000 sheets per Marja (0 differences).
- **Sources.**
  - Khamenei: checked against the office PDF extraction (kha215). Q260 says late khums carries no penalty but
    «… شخص، ضامن تورّم نیز هست», and Q265 says the remaining debt is paid «به ارزش روز». The consult label quotes Q260
    exactly. The condition is stated.
  - Sistani: checked against sistani.org Jami' vol. 2, pages /6550/ (masʾalah 736) and /6551/ (masʾalah 737).
    - 736 states the year-by-year method (find the khums year, pay on what remained at each year's end).
    - 737 note 5 states the extraordinary loss of money value (e.g. 20 times or more → settle for more, by obligatory
      precaution), but for the money paid as a purchase price.
    - Neither page states a loss-of-value rule for an unpaid year's surplus as such. See L-1.

### VF-03: Sistani missed years, value-loss stop withholds the category parts. **Verified.**

- **Targeted sheet.** One missed year held inheritance (1772), mined, treasure, diving, all four mixed variants and
  earnings, each 10,000.
  - With `missed-money-value-loss` = no, the parts show (2,000 each) and the total is withheld for the mixed stops.
  - With yes or not sure, every part, the profit, the total, the halves and the remainder are null.
    `consult-missed-value-loss` is reported, and the aggregate is UNRESOLVED.
- **Random sheets.** 1,500 two-year sheets with random per-year answers gave 1,984 year results with loss ≠ no. None
  showed any withheld output.

### Sistani first-time: purchase price ↔ asset. **Verified. No escape found.**

- **Exhaustive leaves (708).**
  - Every ASSET leaf answered "Income a khums year had passed over" + "ordinary purchase" stops at mapping with
    `consult-ft-link`, unless it takes the risen-merchandise path (`ft-trade-risen` = true → `ft-assets-old`, current
    value). Only `ft-assets-old` leaves (risen merchandise or specific money, 26) calculate from year-old income.
  - `EXPENSE:ASSET_PURCHASE` paid from year-old income → `consult-ft-link`. Paid from inherited (valid, no unpaid
    khums), khums-paid or same-year income → excluded. Paid from mixed, unknown, gift or other inherited sources →
    `ft-pending` (stop).
  - Every other expense subtype paid from year-old income (HOUSEHOLD, HOUSING, EDUCATION, HEALTH, TRAVEL, BUSINESS,
    DONATION, RELIGIOUS_DUTY) asks `ft-spent-not-present`.
    - Still owned → `consult-ft-link`.
    - Not present → value-loss question → negligence → `ft-old-spent` or a stop.
    - OTHER, SOLD_ITEM_COST, CAPITAL_LOSS and KHUMS_PAID → `ft-pending`.
  - JOINT_OWNERSHIP and MIXED_FUNDS → `ft-pending`. A mixed-source asset → `ft-split` (stop). A mixed balance →
    `ft-cash-parts` (stop). Unknown source → settlement, pending, or `ft-assets` only through the 740 ب
    "specific money" answer.
  - The `consult-ft-link` stop does not depend on the amount: an amount of 0 still stops.
- **Combinations.**
  - 4,000 random sheets of 2–7 entries from all leaves, and 3,000 targeted sheets (60% total-producing leaves, plus
    link leaves, price leaves and withheld leaves; amounts include 0 and 0.01): 0 escapes.
    - No sheet with a link leaf mapped.
    - No total appeared beside a year-old ASSET_PURCHASE.
    - No total appeared while a withheld entry had a non-zero amount.
    - Every shown total equals the sum of its entries' single totals (0 non-additive cases, so nothing is double
      counted or dropped by interaction).
  - Risen merchandise (30,000) plus each year-old expense subtype (20,000): the total shows only when the person
    answers that the purchase is no longer present (10,000 = one-fifth of both). Still owned, or ASSET_PURCHASE,
    stops the sheet.

### Regression check

- `pnpm --filter @khums/marja-rules exec vitest run`: 121 passed.
- `pnpm --filter @khums/core exec vitest run` (temp file excluded): 1,051 passed, 1 skipped.
- The broad multi-entry annual and missed-year sheets above showed no difference from the reference in either Marja.
- The full `pnpm check` (format, lint, typecheck, build) was not run; this audit was read-only.

## Findings

Counts: CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 4.

### L-1 (LOW): the Sistani VF-01 citation is stretched

- **Problem.** The `consult-earlier-year` label and the question cite "Tawdih Jami' 736; 737 note 5" for loss of money
  value in an earlier unpaid year. Note 5 (sistani.org /6551/) states the extraordinary loss for the money paid as a
  price («… اگر ارزش آن پول، هنگام پرداخت خمس، کاهش فوق‌العاده … پیدا کرده»), not for an unpaid year's surplus. 736
  states only the year-by-year method. The pack's own FS-03 note already says «note 5 is stated for a price».
- **Effect.** The stop is conservative, so no figure is wrong, but a reviewer could read the label as a stated rule.
- **Fix.** Reword it, e.g. "the missed-years assessment asks about an extraordinary loss of money value (737 note 5
  states this for money paid as a price; whether it applies to an unpaid year's surplus is for scholar review)".

### L-2 (LOW): the latest year can itself be late

- **Problem.** VF-01 relies on the person's answer and has no date check. This is acknowledged in sis-736 issues as
  "VF-01 (limitation)". It also does not cover the latest year when its khums was delayed long after the year-end
  although the person could pay:
  - Khamenei Q258 (pay immediately) and Q260 make inflation owed on any late khums, not only on earlier years.
  - Sistani note 5 likewise speaks of the time of payment.
- **Effect.** An annual figure for a long-overdue latest year is shown without the value-loss review.
- **Fix.** Record it as a limitation. Optionally ask "was this year's khums due date passed with ability to pay?" →
  the same stop, or add the engine/UI date check already listed under FS-06.

### L-3 (LOW): Sistani `earlier-unpaid` stays visible on "no"

- **Problem.** On "no", Sistani annual still shows `earlier-unpaid` (the sum of the UNPAID_KHUMS entries, as entered).
- **Effect.** It is labelled "as entered … not adjusted for any extraordinary loss of money value", so it is not a
  calculation. But it is a money figure shown on a sheet the person has just said is a late year.
- **Fix.** Optional. Withhold it under `consult-earlier-year` too, by adding `earlier-unpaid` to `LATE_YEAR_STEP_IDS`
  for Sistani, or leave it as is and record the decision.

### L-4 (LOW, pre-existing, not price-related): zero-amount review entries do not stop the total

- **Problem.** In Sistani first-time, `present()` is `sum > 0`. An entry mapped to `ft-pending`, `ft-settle`,
  `ft-split`, `ft-cash-parts` or `ft-debts` with amount 0 therefore does not withhold the total, which then shows
  (e.g. 0, or the other entries' total). This occurred in 455 such leaves.
- **Repro.** One BALANCE with `ft-cash-funds` = "I do not know" and amount 0 → COMPLETED, total 0. The same entry with
  amount 1000 → `consult-ft-pending`.
- **Effect.** It does not touch the price ↔ asset rule, because `consult-ft-link` is a mapping stop and does not depend
  on the amount. A zero-valued debt (`ft-debts`) or pending item is arguably harmless.
- **Fix.** If an entry under review should stop the sheet whatever its amount, use an entry-count condition (an engine
  feature) or a mapping-level consult. Otherwise document that zero-amount entries are ignored.
