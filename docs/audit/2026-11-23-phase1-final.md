# Phase 1 final report — scholar-review packs 0.6.0 and 0.7.0 (2026-11-23)

Follows [2026-11-23-corrections-0.5.0.md](2026-11-23-corrections-0.5.0.md). Results stay
**PROVISIONAL — FOR SCHOLAR REVIEW ONLY**; no rule is verified or approved. Roles, permissions,
governance, database, deployment and infrastructure were not touched; nothing committed or deployed.

## Versions (all earlier ones frozen byte-exact in `packages/core/src/provisional/history/`)

| Version | Sistani digest                                                     | Khamenei digest                                                    | What changed                                                                     |
| ------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 0.4.0   | `38fa7555…0128843`                                                 | `a07e28f9…7cc0b2d`                                                 | Frozen (audited 2026-11-23)                                                      |
| 0.5.0   | `ecd237d4…a65972f`                                                 | `42ea3543…d8229`                                                   | Frozen: K1–K5, S1–S6, S8 corrections                                             |
| 0.6.0   | `51c4df3e…420cb6c`                                                 | `5c3f40dc…893e9f`                                                  | Frozen: maintainer decision — totals withheld while assets/balances await review |
| 0.7.0   | `348204c5eca4ecb7a328aba349992418e5b07518945d0e6f527ab97409b1fc6c` | `f9f4ba07142b5ee5cb9647b2713b4e3b096da4b6c2bda4502c9b0e71bd7fa450` | Current: residuals from the fresh audit of 0.6.0 (below)                         |

## Maintainer decisions implemented

- **Totals withheld when unresolved assets could affect the calculation (0.6.0).** In the annual
  program (and each missed year), assets and balances awaiting review withhold `khums-total`, both
  halves and `khums-remaining` (`consult-holdings`); the category figures stay visible as "of
  which" parts. Khamenei missed years with such assets are left out of the known total. 0.7.0
  extends this to mixed amounts whose duty may still include khums (Khamenei: unlawful part over
  one-fifth; Sistani: the case outside Ruling 1830). The first-time programs already withheld.
- **Full decimal precision (unchanged by design).** No step rounds (`rounding: null`, tested);
  results such as `2000.002` are shown exactly; no rounding rule was invented.

## Fresh independent audit of 0.6.0 (two reviewers, one per Marja, findings before reading earlier reports)

| Finding                                     | Verdict on 0.6.0                                                                                    | 0.7.0                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| K1 missed-year figures                      | RESOLVED                                                                                            | —                                                                        |
| K2 capital loss vs salary                   | RESOLVED                                                                                            | —                                                                        |
| K3 unsold stock                             | RESOLVED                                                                                            | —                                                                        |
| K4 inheritance / asset held for sale        | PARTIALLY: first-time still excluded a khums-paid asset held for sale                               | Fixed: first-time asks `holding-for-sale` → review                       |
| K5 older emergency savings                  | RESOLVED                                                                                            | —                                                                        |
| S1 sales netted                             | PARTIALLY: two sales each answered "the only sale" still netted (3,400) — entries cannot be counted | Fixed: every 1787 sale stops (developer capability needed to link costs) |
| S2–S6, S8                                   | RESOLVED                                                                                            | —                                                                        |
| NEW (Khamenei, HIGH) mixed over one-fifth   | Total, halves and remainder shown while a khums part is pending                                     | Fixed: total withheld; excluded from missed-year known total             |
| NEW (Khamenei, HIGH) living costs' source   | Living costs paid from non-income money deducted (as Sistani S5)                                    | Fixed: `living-from-year-income` question → review                       |
| NEW (both, HIGH) missed years share answers | One set of program answers (status, business lines, stock) applies to every missed year             | **Open** — engine/contract change needed (see below)                     |

Every reproduced item has a regression test in
`packages/core/src/provisional/re-audit-regressions.test.ts` (defect on the frozen version,
correction on the current one).

**Open HIGH: missed years share one set of answers.** `calculation-engine/src/mapping/map-facts.ts`
copies the sheet's answers into every year, although `AssessmentInput` already allows answers per
year. A person whose years differ (a losing line or unsold stock in one year only) cannot answer
truthfully, and a figure can be shown for a year whose own facts call for a stop. Fixing it needs
per-period answers through the fact sheet, the provisional `entries` request contract and the
review UI — an engine and API contract change that needs the maintainer's approval (and an
ARCHITECTURE §11 entry). A pack-only alternative (asking every such question per entry in missed
years) would rewrite the missed-year programs. Not implemented.

Medium/low items still open (planned in the 0.5.0 report): S7, S9–S15, K6–K10; new low items
(first-time `EXPENSE:OTHER` under 738; contradictory loan/living-source answers; 1851 halves applied
to 1830 purification khums; `BUSINESS_DEBT` through the personal-item question; a missed-year
`earlier-unpaid` next to that year's khums; gross `khums-year` label).

## Rule classification (read-only; derived by `reviewRules`, nothing stored or approved)

| Class                     | Sistani 0.7.0                          | Khamenei 0.7.0                         | Basis                                                                                                                         |
| ------------------------- | -------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `SOURCE_VERIFIED`         | 0                                      | 0                                      | No rule cites a scholar-verified source or an approved ruling version (`rulingRefs` empty; no research record verified here). |
| `SOURCE_UNVERIFIED`       | 28 transcriptions (PARTIALLY_VERIFIED) | 31 transcriptions (PARTIALLY_VERIFIED) | Locator checked by tools only; status `UNVERIFIED`.                                                                           |
| `SCHOLAR_REVIEW_REQUIRED` | 70 placeholders                        | 70 placeholders                        | "NOT A RULING" placeholders; every use is a consultation stop.                                                                |

**Automatic approval was not performed.** CLAUDE.md rule 1 says AI never approves rule content, and
only the governing scholar approves through the governance workflow; production use needs a new
`PRODUCTION` pack version through that workflow, which this phase may not touch. No rule
qualifies as source-verified in any case, so automatic approval would approve nothing.

## Environment

The `.next/dev` conflict came from another session's leftover e2e servers (`next dev` on 3101 and
an in-memory test API on 4100, both with throwaway test secrets). They were stopped and only the
git-ignored, generated `apps/web/.next/dev` folder was removed. Durable follow-up: the web
`tsconfig.json` includes `.next/dev/types/**/*.ts`, so any running `next dev` makes `typecheck` and
`build` fail on that generated file's unused declarations.

## Verification on 0.7.0 (actual results, 2026-11-23)

| Step                                                                                                      | Result                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` (format, boundaries, lint, typecheck, test, build; `KHUMS_API_ORIGIN=http://127.0.0.1:4100`) | Exit 0. Lint 11/11, typecheck 11/11, builds API and web successful                                                                                                                 |
| Unit and integration tests                                                                                | 1,818 passed, 1 skipped by design (validation 126, utils 20, shared-types 2, ui 27, api-client 14, money 118, calculation-engine 200, marja-rules 121, web 128, api 409, core 653) |
| Playwright e2e (desktop, tablet, mobile; in-memory API, no database)                                      | 498 passed, 3 skipped (viewport-specific by design), 0 failed                                                                                                                      |
| Frozen snapshots 0.4.0, 0.5.0, 0.6.0                                                                      | SHA-256 of all six files unchanged                                                                                                                                                 |

## Verdict

**NOT READY FOR PHASE 2.** One HIGH finding remains open (missed years share one set of answers),
and it needs an engine/API contract decision. Automatic approval of rules was not performed (CLAUDE.md
rule 1); that request needs the maintainer's decision on the conflict.
