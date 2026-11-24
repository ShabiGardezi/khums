# Per-year answers for missed years, and packs 0.8.0 (2026-11-23)

Maintainer approval: "Option A" (per-year answers). ARCHITECTURE §11 decision 62. Results stay
**PROVISIONAL — FOR SCHOLAR REVIEW ONLY**; no rule was verified or approved. Roles, permissions,
governance, database, deployment and infrastructure were not touched; nothing committed or deployed.

## What changed

| Layer                                         | Change                                                                                                                                                                                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@khums/shared-types`                         | `YearAnswers` (answers keyed by the fact sheet's period id); mapping refusal code `ANSWERS_SCOPE_MISMATCH`                                                                                                                                                        |
| `@khums/calculation-engine` `mapFactsToInput` | Missed-year sheets: each year gets exactly `yearAnswers[periodId]` (own properties only; none if absent, never another year's). Refused: shared answers on a missed-year sheet, per-year answers on another workflow, unknown period ids. `calculate()` unchanged |
| `@khums/core`                                 | `prepareAssessmentInput(…, yearAnswers)`, `runDevelopmentAssessment(…, yearAnswers)`; `runProvisionalCalculation` validates and maps `entries.yearAnswers`                                                                                                        |
| `@khums/validation`                           | `yearAnswersSchema`; `ProvisionalCalculationRequest.entries.yearAnswers` (optional, additive); OpenAPI regenerated (`apps/api/openapi.json`). Response contract unchanged (reports already carry each year)                                                       |
| Web (results and scholar-review screens)      | Missed-year sheets show the questions once per year ("Questions for {start} to {end}", English and Urdu), each block an accessible region; each year's answers are kept and sent separately; shared answers are never sent for missed years                       |
| Review scenarios (`@khums/marja-rules`)       | `yearAnswers` on every scenario; existing missed-year scenarios state each year's answers explicitly (same values as before); new scenarios with years that differ                                                                                                |

Existing behaviour is preserved where valid: annual and first-time calls are unchanged, and a
missed-year calculation whose years are answered identically gives the same figures as before.
A missed-year request that still sends one shared set of answers is now refused (`INPUT_INVALID`
on the API) instead of applying it to every year.

## Fresh independent audit (two reviewers, packs 0.7.0 + per-year answers)

- **Per-year answers: resolved.** Both reviewers tried to make one year's answers reach another
  (living status and source, business lines, shared accounts, unsold stock), bypass the scope
  check (prototype keys, empty or unknown period ids, numeric-like ids, duplicate periods), and
  leave a year unanswered. No reuse was found; out-of-scope answers are refused; an unanswered
  year refuses the calculation (`INPUT_MISSING_REQUIRED_ANSWER`), never borrowing another year's
  answers; browser and server use the same mapping. A prototype-key hardening (`Object.hasOwn`)
  was applied during the audit and has a regression test.
- **Two HIGH findings in pack content (both fixed in 0.8.0, regression-tested on frozen 0.7.0 → 0.8.0):**
  - Sistani (S11, earlier rated medium): mixed money with the amount unknown and the owner among a
    known group took the 1830 one-fifth (total 3,400) without asking the group question. 0.8.0
    asks it; yes → review (`consult-mixed-other`, total withheld).
  - Khamenei: with an overall business loss, a losing line next to a profitable line in separate
    accounts was not asked about, so the profitable line's profit counted as 0 (total 10,000 shown).
    0.8.0 stops at `consult-business-lines`.
- These two fixes were verified by regression tests and the full suite, not by a further
  independent audit round.

## Versions

| Version | Sistani                                                            | Khamenei                                                           |
| ------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 0.7.0   | frozen (`348204c5…b1fc6c`)                                         | frozen (`f9f4ba07…7fa450`)                                         |
| 0.8.0   | `0b17934f19c791d9862d3ab7095491700e9ba2b27625ca557461c75e8bf0a8d9` | `0c6b31419c1ec8df907ad06a260fdcc2e364bb08a6edef478d97a096b3765c20` |

All earlier versions (0.4.0–0.7.0) are kept byte-exact in `packages/core/src/provisional/history/`.

## Tests added

- Engine (`map-facts.test.ts`): each year's own answers; an unanswered year gets none; inherited
  keys ignored; scope refusals.
- Core (`per-year-answers.test.ts`, 18 tests, both Marjas): scope refusals; a losing line, living
  status and unsold stock in one year stop only that year; mirror cases; changing one year's
  answers never changes another year's result; an unanswered year is refused.
- Core (`re-audit-regressions.test.ts`): the two 0.8.0 fixes.
- Validation: `yearAnswersSchema` and the request field.
- API (`provisional.service.test.ts`): per-year answers through the server; shared answers on a
  missed year refused (422).
- Scenarios: `missed-year-business-lines-differ`, `missed-year-living-status-differs`,
  `missed-year-both-years-plain` (both Marjas).
- Playwright: a Sistani scholar answers 2023 and 2024 separately on the review screen; 2023 stops
  for review, 2024 shows 2,000 (desktop, tablet, mobile; axe checked).

## Remaining (not critical or high)

Medium and low items listed in the earlier reports (S9, S12, S15, K6–K10 and the low items),
plus new low items from this audit: one missed year with no answers blocks the whole
calculation (fail-closed, by design); a per-fact question id given as a year answer is ignored;
freelance/rental work costs can only be entered as business costs (Khamenei, medium).

## Verification (final state, actual results)

| Step                                                                                        | Result                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `pnpm check` (format, boundaries, lint, typecheck, tests, production builds of API and web) | Exit 0; lint 11/11, typecheck 11/11, builds 2/2     |
| Unit and integration tests                                                                  | 1,855 passed, 1 skipped by design                   |
| Playwright e2e (desktop, tablet, mobile; in-memory test API)                                | 501 passed, 3 skipped (viewport-specific), 0 failed |
| Frozen packs 0.4.0–0.7.0 (8 files)                                                          | SHA-256 unchanged                                   |

**Remaining critical or high findings: none known.** The fresh audit found no remaining issue in
the per-year answers; its two pack-content HIGH findings are fixed in 0.8.0 and regression-tested,
without a further independent audit round.
