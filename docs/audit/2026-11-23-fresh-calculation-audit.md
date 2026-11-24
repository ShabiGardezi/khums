# Fresh independent calculation audit — scholar-review packs 0.4.0 (2026-11-23)

> **Scope.** Read-only audit of `packages/marja-rules/src/review-packs/*` (Sistani and Khamenei
> 0.4.0) run through `prepareAssessmentInput` → `calculate` in `scholar-review` mode (engine 0.2.0).
> No code, pack, role, permission, database or governance file was changed. Findings are
> **technical**: they compare what the encoding does with what the quoted excerpt states. None is
> a religious answer; resolving each one is the governing scholar's decision (CLAUDE.md rule 1).
> Results stay PROVISIONAL — FOR SCHOLAR REVIEW ONLY.

**Method.** Two reviewers, one per Marja, read each transcription's excerpt against its encoding,
recomputed every scenario by hand from the program, and ran adversarial inputs from scratch tests
outside the repo. Separately, 26 cross-cutting inputs were run against both packs. Findings were
compared with `2026-11-23-frozen-calculation-audit.md` only after they were found. Every CRITICAL
and HIGH item below was re-run and reproduced by the lead auditor.

**Baseline.** `@khums/marja-rules` 121/121 tests pass; core provisional tests 206 pass, 1 skipped
by design (a Khamenei-only test). All scenario expectations (≈ 65 Sistani, ≈ 67 Khamenei) match
the programs: the scenarios are consistent with the code, so the defects below are untested paths
or scenarios that assert the defective behaviour.

Severity: CRITICAL = a wrong figure is shown; HIGH = a figure is shown where the text requires a
stop, or interpretation is encoded; MEDIUM; LOW.

## Khamenei

| #   | Sev      | Finding                                                                                                                                                                                                                                                                                                       | Reproduction (actual)                                                                                          | Earlier audit                      |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| K1  | CRITICAL | Missed years: a year going to settlement (Q255, an amount unknown) still shows `khums-due`, `surplus` and `khums-remaining` ("Still to pay … PROVISIONAL"), computed as if the unknown entry did not exist. Only `khums-year`/`khums-known-years` check `missed-uncertain` (`annual.ts` ~3019–3092).          | Salary 10,000 known, household 9,000 `missed-amount-known: false` → `khums-due` 2,000, `khums-remaining` 2,000 | NEW (C5/T2 fixed only the total)   |
| K2  | HIGH     | A `CAPITAL_LOSS` entry is subtracted from all profit (`profit` step ~1781), so it reduces salary with no shared-account question and bypasses the `business-loss-one-account` gate (C2). Excerpt «از درآمد کسر می شود» does not say which income; Q245 says a loss in one line is not offset by another.      | Salary 50,000, capital loss 20,000, household 10,000 → 4,000; with a separate break-even business → 6,000      | NEW                                |
| K3  | HIGH     | Goods bought for resale (`EXPENSE:BUSINESS`) are deducted as business costs, and unsold stock (`ASSET:BUSINESS_STOCK`) only goes to the non-blocking holdings list. kha-business-cost lists transport, wages, rent, utilities, tax — not stock. Scenario `annual-business-stock-unsold` asserts 1,000.        | Business income 50,000, stock bought 45,000 → 1,000                                                            | NEW (Sistani counterpart C6 fixed) |
| K4  | HIGH     | An inheritance is excluded without asking whether the deceased owed khums on it; the excerpt is about the heir's own khums only. An inherited asset held for sale is also excluded via `holding-paid`, against the excerpt's exception «مگر اینکه آن را سرمایه (در معرض فروش) قرار دهد».                      | `annual-inheritance-unpaid` → 0                                                                                | NEW (second part overlaps C14)     |
| K5  | HIGH     | First-time: the Q120 emergency-savings exemption is asked before the funding source, so savings over which a khums year has passed are excluded too, although Q39 says such money «متعلّق خمس است». Choosing Q120 over Q39 is a choice between readings (`annual.ts` ~2905).                                   | `first-time-savings-emergency` → 0                                                                             | NEW (C8 fix over-reaches)          |
| K6  | MEDIUM   | First-time: necessities bought from current-year income are excluded without the status condition kha-expenses attaches (the annual workflow asks it).                                                                                                                                                        | `first-time-wealth`: home 250,000 excluded                                                                     | NEW                                |
| K7  | MEDIUM   | kha-ftk-doubt ("doubt whether paid = not paid") is not enforced: `ftk-paid-or-exempt` / `holding-paid` are plain yes/no with no "not sure".                                                                                                                                                                   | "Probably paid" → yes → excluded                                                                               | NEW                                |
| K8  | MEDIUM   | Q245 (unconditional) vs the p.60 note (account-dependent) are reconciled by following the note; listed in the pack's open issues but still a choice between readings.                                                                                                                                         | —                                                                                                              | Partly raised (C2)                 |
| K9  | MEDIUM   | Still open: every `BONUS` excluded, including a contractual performance bonus, wider than «عیدی و پاداش» may cover (C15); mined product below niṣāb excluded from profit (C16); first-time current-year items charged at any assessment date (C18); Q247 gross-up and Q260–265 inflation basis not reflected. | Bonus 30,000 → 0                                                                                               | ALREADY RAISED, open               |
| K10 | LOW      | Missed years: ESTIMATED/RANGE stops the whole mapping (`consult-entry`) instead of Q255 settlement (safe); an unpaid business-cost debt with no business profit is dropped without being listed; a year with holdings/mixed reviews still counts in `khums-known-years` (total is PARTIAL anyway).            | —                                                                                                              | NEW                                |

## Sistani

| #   | Sev      | Finding                                                                                                                                                                                                                           | Reproduction (actual)                                                                                           | Earlier audit                         |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| S1  | CRITICAL | Sales are netted across entries (`sale-gain` compares summed proceeds with summed costs), so a loss on one sale hides inside another sale's gain; the pack's own rule stops on a sale loss (sis-1787).                            | Salary 42,000, household 30,000, sale A 50,000/35,000, sale B 10,000/20,000 → COMPLETED, 3,400 (expected: stop) | ALREADY RAISED C9, not fixed          |
| S2  | HIGH     | Inheritance with `inh-deceased-unpaid` = yes never asks `inh-deceased-owed` (khums the deceased owed on other property, payable from the estate), which the pack's own summary says stops.                                        | Inheritance 30,000 → COMPLETED, `khums-inheritance` 6,000                                                       | NEW                                   |
| S3  | HIGH     | Capital losses bypass the business-loss stop: the loss check uses business income − costs only; `capital-losses` are subtracted later from total profit, so a net business loss offsets salary with no Ruling 1790 check.         | Business 10,000−2,000, capital loss 20,000, salary 42,000, household 30,000 → COMPLETED, 0                      | NEW (related C10)                     |
| S4  | HIGH     | `CAPITAL_LOSS` is deducted with no question, but Jami’ 685 limits it to business stock, capital and tools and excludes a home or personal car.                                                                                    | Salary 42,000, household 30,000, capital loss 10,000 → 400                                                      | ALREADY RAISED C10, not fixed         |
| S5  | HIGH     | Living expenses are deducted whatever money paid for them; 1792 speaks of what is spent from the year's profits and 598 lists five conditions; only status is asked.                                                              | Household paid from khums-paid savings → still deducted (2,400)                                                 | ALREADY RAISED (598), not fixed       |
| S6  | HIGH     | Annual workflow: an asset bought with khums-paid money is excluded even if it is merchandise (737 ب «مگر آنکه مال‌التّجاره باشد»); the first-time workflow asks `ft-for-trade`, the annual one does not.                           | Shares, `holding-paid` yes → excluded                                                                           | ALREADY RAISED C12 (annual half open) |
| S7  | MEDIUM   | Treasure below niṣāb stops only the total; `surplus`/`khums-due` are still shown although that entry's effect on profit is unstated (scenario `annual-treasure-below` asserts it).                                                | Salary/household + treasure 4,000 below niṣāb → `khums-due` 2,400                                               | NEW                                   |
| S8  | MEDIUM   | A sale with no purchase-cost entry counts its full price as gain (proceeds and costs are not linked per sale).                                                                                                                    | Sale 50,000, no cost → 12,400                                                                                   | NEW                                   |
| S9  | MEDIUM   | Debt question asks for "the amount still owed"; 1803 deducts the borrowed amount, so in-year repayments are lost; the footnote's cumulative limit is neither encoded nor asked.                                                   | —                                                                                                               | NEW                                   |
| S10 | MEDIUM   | `KHUMS_PAID` is always applied to this year; a payment for an earlier year reduces this year's "still to pay".                                                                                                                    | —                                                                                                               | NEW                                   |
| S11 | MEDIUM   | Mixed funds, amount unknown, owner among a known group → the 1830 one-fifth; the owner-group question is asked only when the amount is known.                                                                                     | Mixed 5,000 → `khums-mixed` 1,000                                                                               | ALREADY RAISED C19, not fixed         |
| S12 | MEDIUM   | First-time: an asset bought with current-year income is charged one-fifth while current-year cash is excluded (no "current khums year" option for assets).                                                                        | Gold 4,000 → 800                                                                                                | NEW                                   |
| S13 | MEDIUM   | First-time: `CAPITAL_LOSS` and `SOLD_ITEM_COST` from year-old income are charged under 738, which speaks of living or business spending.                                                                                          | 10,000 → 2,000 each                                                                                             | NEW                                   |
| S14 | MEDIUM   | First-time: the 737 note 6 inflation check is applied unevenly (same-year merchandise goes to current value with no inflation question); the scholar should confirm which clauses note 6 covers.                                  | Stock 30,000 → 6,000                                                                                            | NEW                                   |
| S15 | MEDIUM   | Mapped by interpretation: RENTAL and INVESTMENT_RETURN as earnings under 1769 (excerpt names no subject); education, health, housing, travel under «و مانند اینها» (self-flagged); RELIGIOUS_DUTY wider than 1795's Hajj/ziyārah. | Rental 1,000 → 200                                                                                              | NEW (partly self-flagged)             |
| S16 | LOW      | Holdings left for review never block `khums-total` (by design), so unpaid earlier-year holdings would leave the labelled total low.                                                                                               | —                                                                                                               | NEW                                   |

## Both packs

| #   | Sev | Finding                                                                                                                                                                                                                                              | Earlier audit            |
| --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| B1  | LOW | No rounding anywhere (every step `rounding: null`): salary 10,000.01 → khums 2,000.002, halves 1,000.001; salary 0.03 → 0.006. The UI shows the exact string (e.g. `0.006 USD`) rather than rounding silently; rounding needs a scholar-stated rule. | ALREADY RAISED C20, open |

## Verified correct (both reviewers and the lead's cross-cutting runs)

- Rate and halves come only from the `khums-rate` (20) and `half-share` (50) parameters, each
  citing its transcription. Order: living expenses and deductible debts, then `max(0, …)`, then
  one-fifth of the surplus; never negative (living > income → 0).
- Other currency → `UNSUPPORTED`; date outside the period → `UNSUPPORTED`; ESTIMATED/RANGE →
  `consult-entry`; UNKNOWN/NOT_PROVIDED amounts or dates → clarification; an unanswered required
  question → `INVALID_INPUT`, never a default.
- Unconfirmed living-expense condition, "other" income/expense, asset purchases, debts outside the
  transcribed rulings and overpaid khums all stop only the figures that depend on them; mined,
  treasure, diving and mixed outputs stay separate.
- Fact mapping: every kind and subtype has exactly one handling (the build throws on a gap); every
  exclusion cites a rule. Browser and API use the same `prepareAssessmentInput`, so they cannot
  diverge. Earlier fixes C1, C2 (as designed), C4, C5/T2 (aggregate), C6 (Sistani), C8 (applied,
  see K5) and T3 were confirmed in place.
- Reports are deterministic (same input and pack → identical report).

## Recommendation (for the maintainer; no change made)

K1 and S1 show wrong figures on the review path and should be fixed first (K1: make every per-year
output that depends on the year's entries depend on `missed-uncertain`; S1: compare each sale with
its own cost, or stop when more than one sale is entered). The HIGH items each need either a
consult stop or a question the excerpt itself states; where the fix needs a choice between
readings, it must stay a `consult` stop for the governing scholar. Each fix needs a regression
scenario and a new pack version (0.4.1 or 0.5.0); 0.4.0 is not modified in place.
