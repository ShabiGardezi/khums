# Implementer F: notes (pack 0.10.0, final verification VF-01, VF-02, VF-03)

## Files changed

- Pack: `packages/marja-rules/src/review-packs/annual.ts`, `build.ts`, `scenarios.ts`.
- Tests: `packages/core/src/provisional/comprehensive-annual.test.ts`,
  `comprehensive-khamenei-annual.test.ts`, `re-audit-regressions.test.ts` (default answer only),
  `apps/web/e2e/review-packs.spec.ts`.
- Not touched: `history/`, the engine, schema, API, UI, roles, governance, database. Nothing was committed.

## Per item

| Item                   | Result                 | What was done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VF-01 (both)           | DONE (stop, pack-only) | New required boolean `period-is-latest-year`. Sistani label cites Tawdih Jami’ 736 and 737 note 5. Khamenei label cites Q260 and Q265. New consultation `consult-earlier-year` for each Marja. New exported `annualOnlyProgram(marjaId, program)` wraps `surplus` and every category part (`khums-inheritance`, `-mined`, `-treasure`, `-diving`, `-mixed`): `when(answer(period-is-latest-year, true), …, consult-earlier-year)`. So "no" withholds the surplus, khums-due, the parts, the total, the halves and still-to-pay. `build.ts` applies it only to `workflows.annual`. The missed-year builders still receive the unwrapped `annual.program`, so they never reference the question and never require it. First-time does not reference it either. No engine change was needed. |
| VF-03 (Sistani missed) | DONE (withhold)        | `sistaniMissedYearParts` now uses the same wrapper (`withheldUnless`) with the `missed-money-value-loss` condition. Yes or not sure now also withholds the category parts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| VF-02 (both)           | RECORDED               | Over-stop note added to the `issues` of sis-736 and kha-missed-years. No logic or label change. The Khamenei label is not widened, because no encoded excerpt covers it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

"Encoded:" texts updated with "Since 0.10.0 (final verification, VF-0x) …":

- sis-736: VF-01 and VF-03
- kha-missed-years: VF-01

Every rule stays UNVERIFIED.

## Tests

- **comprehensive-annual (Sistani):**
  - Frozen 0.9.0 with a 2015 annual period: 2,400, COMPLETED.
  - Current pack: no → only `consult-earlier-year`, all figures null (the mined part too). Yes → 2,400. Unanswered → INPUT_MISSING_REQUIRED_ANSWER.
  - Label cited.
  - The question is in the annual program only. A missed-year run without it is not refused. A first-time run without it is not refused.
  - VF-03: yes / not sure → khums-mined null and the result UNRESOLVED; no → 2,000.
- **comprehensive-khamenei-annual:** the same checks. Frozen 0.9.0: total 2,400 and remaining 2,400 with no stop.
- **Defaults:**
  - `period-is-latest-year: true` added to `KHA_DEFAULTS`, `SIS_STATUS_YES` and the Sistani annual scenario defaults.
  - Added to the `withFinalAuditAnswers` helpers (3 files).
  - Added in one explicit FS-03 test.
  - No expectation changed.
- **e2e:** three annual journeys now answer LATEST_YEAR Yes.

## Checks

| Check                                       | Result                                                              |
| ------------------------------------------- | ------------------------------------------------------------------- |
| marja-rules                                 | 121/121                                                             |
| core                                        | 1050 passed, 1 skipped. Only the 2 "is pinned…" history tests fail. |
| api                                         | 410/410, including the pack-size test                               |
| web unit                                    | 128/128                                                             |
| lint and typecheck (core, marja-rules, web) | clean                                                               |
| prettier on changed files                   | clean                                                               |
| Playwright `e2e/review-packs.spec.ts`       | 12/12                                                               |

Note on the Playwright run: it uses the production builds. I rebuilt `apps/api` (`nest build`) and `apps/web` with `KHUMS_API_ORIGIN=http://127.0.0.1:4100`, as CI does. A web build without that variable breaks staff sign-in in e2e.

## Limitations and over-stops

- **UI (unchanged, pre-existing):** the results form lists every pack-level question in every workflow (`assessmentQuestions`).
  - So `period-is-latest-year` appears, optional and with no effect, in missed years and first-time.
  - `missed-money-value-loss` already appeared the same way in annual.
  - Showing only the questions a workflow's program references would need a UI change. This is out of scope and is for the maintainer to decide.
- **VF-01 relies on the person's answer.** There is still no date check of the period's recency, because the engine has no date expression (same class as FS-06).
- **Over-stop:** a person assessing the year that ended a few months ago, who did not pay on time, would still answer yes. The question asks only for "most recently ended", so that case is not stopped. This matches the auditor's proposed wording.
- **Withholding the category parts in an earlier annual year** (and in a Sistani value-loss missed year) goes beyond X1, where parts stay visible. This is deliberate: those parts are late khums too.
