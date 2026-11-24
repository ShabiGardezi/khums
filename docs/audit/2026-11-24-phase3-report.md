# Phase 3 report — public Khums calculator (2026-11-24)

Plan: [../PHASE3_PLAN.md](../PHASE3_PLAN.md). Decisions: ARCHITECTURE §11 #71 (opt-in device storage,
owner decision), #72 (availability and guided inputs), #73 (result summary and print). Nothing
committed, pushed or deployed; no database, API-contract, engine, money, governance or role change;
production Atlas untouched; historical rule packs 0.3.0–0.9.0 byte-identical.

## 1. What was built

| Plan step                 | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Availability up front  | Each Marja shows "verified rules available" or "no verified rules yet"; only the assessment types in the Marja's verified pack are offered (others disabled with "needs scholar review"), and the Server Function refuses any other type with or without JavaScript; the no-rules message appears before data entry. The Marja choice is still never sent (packs for every Marja load at render)                                       |
| 2. Inputs guided by rules | `describeEntryCoverage` (core) reads the verified pack's own fact mapping: each entry type is calculated, excluded, asks a question, or needs scholar review. The form groups types into "used by your Marja's verified rules" and "not yet covered"; choosing an uncovered type, or a currency the calculation cannot convert, warns before saving. No type hidden, no ruling in code                                                 |
| 3. Yearly history         | Saved only when the person taps Save, in this browser only: name, entries, dates, answers, figures and pack id/version/digest. Open (figures exactly as saved, "not recalculated"), edit and recalculate, rename, copy to a new year (new dates, no answers carried), delete one / all (confirmed). Saving after an edit creates a new entry, so earlier results are kept. Older saved results stay viewable                           |
| Recalculation             | Always uses the Marja's current verified pack and shows its version; a warning names both versions when it differs from the saved one; saved answers are reused only when the pack is exactly the same (id, version, digest), otherwise the questions are asked again. A Marja that no longer has verified rules shows no new figures                                                                                                  |
| 4. Result summary, print  | A short summary above the breakdown, built only from the engine's output: figure per category (never added together; exact amounts labelled), entries used, deducted (only when certain from the pack's program) or left out, and what stopped for scholar review or needs an answer, with the pack trace. "Print or save as PDF" view keeps notices, disclaimer, trace, summary and breakdown. Mock/provisional labels stay prominent |
| 6. Wording                | Start page, landing and privacy texts updated for the public calculator and for opt-in saving (en and ur); every disclaimer kept                                                                                                                                                                                                                                                                                                       |
| 7. Scenario tests         | 17 scenarios each for `sistani` and `khamenei` using TEST research and TEST rates through the real Phase 2 path (scholar verification, automatic governance, public bundle, `runVerifiedAssessment`), with exact Decimal and hand-computed literal figures and trace checks; Playwright journeys in en and ur with axe                                                                                                                 |
| 5. Export/import          | Not implemented (owner: only if genuinely necessary)                                                                                                                                                                                                                                                                                                                                                                                   |

## 2. Independent audit and verification

- **Audit** (fresh auditor, read-only): 0 CRITICAL, 1 HIGH, 3 MEDIUM, 7 LOW. HIGH: saved answers
  could be applied to a different question after a scholar revised a rule, producing a verified
  figure. MEDIUM: copy to a new year carried last year's answers; changed answers reverted after
  Back/Edit; one unreadable saved entry hid the whole history and the next save overwrote it.
- **Fixes:** all 11 fixed with regression tests.
- **Verification** (second independent agent, reproducing each original scenario): all 11
  VERIFIED, no new CRITICAL/HIGH/MEDIUM. Of its 4 new LOW notes, the outdated "answers are not
  stored" and two other privacy sentences were corrected; the rest are listed below.

## 3. Test results (final state)

| Step                                                                         | Result                                          |
| ---------------------------------------------------------------------------- | ----------------------------------------------- |
| `pnpm check` (format, boundaries, lint, typecheck, tests, production builds) | Exit 0; lint 11/11, typecheck 11/11, builds 2/2 |
| Unit and integration tests                                                   | 2,486 passed, 1 skipped by design               |
| Playwright e2e (desktop, tablet, mobile; in-memory API)                      | 575 passed, 7 skipped (desktop-only), 0 failed  |

## 4. Limitations and open items

- **No public figures yet:** no rule is source-verified, so every Marja shows "no verified rules"
  until scholars verify rules. Real Sistani/Khamenei accuracy can only be tested then; the tests
  prove the calculator applies whatever is verified, exactly.
- **Builder coverage:** annual assessment only; no thresholds, currency conversion, combined total,
  first-time or missed-year in verified rules. An unanswered calculation-wide confirmation refuses
  the whole calculation.
- **Site-wide preview banner** still says every figure is mock (its code says to remove it only
  after Gate R): **owner decision needed** for the public site.
- **Storage key** stays `khums.savedCalculations.v1` (the value carries its own version); rolling
  the site back to a pre-Phase-3 build would treat new saves as unreadable.
- LOW: answers kept within one page session survive a change of dates or entries until the
  entries are discarded; rename/delete on /history also removes unreadable entries (warned on the
  page); storage that fails only on write shows "full" rather than "unavailable"; the review page
  does not mark uncovered entries (the form does).
- Saved calculations live in one browser; there is no backup (export/import not built).
