# Corrections N1–N6 and fresh audit — scholar-review packs 0.9.0 (2026-11-23)

Follows [2026-11-23-audit-0.8.0.md](2026-11-23-audit-0.8.0.md). Results stay **PROVISIONAL — FOR
SCHOLAR REVIEW ONLY**; no rule was verified or approved. Every correction is a review stop or a
question the cited excerpt states; no reading was chosen. Roles, permissions, governance, database,
deployment and infrastructure were not touched; nothing committed or deployed.

## Versions

| Version | Sistani                                                            | Khamenei                                                           |
| ------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 0.8.0   | frozen (`0b17934f…bf0a8d9`), snapshot added before any change      | frozen (`0c6b3141…b3765c20`), snapshot added before any change     |
| 0.9.0   | `feb454c8491359eab78085e972a987fd85255d5fe92932d16afee74222f4fe2b` | `87d589bd04c3b0689f5e7234297991ae73c516a887231e324cab7261abefa9de` |

All ten earlier snapshot files (0.3.0–0.8.0) are byte-identical (SHA-256 checked after every step).

## Corrections

Each finding was reproduced on frozen 0.8.0 first; `re-audit-regressions.test.ts` ("fresh audit of
0.8.0") replays the defect on 0.8.0 and the correction on 0.9.0.

| #   | Marja    | 0.8.0 (reproduced)                                                                 | 0.9.0                                                                                                                                                            |
| --- | -------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | both     | Mixed money (1830 case) → completed total 4,400; remainder never considered        | Any mixed amount withholds total, halves and remainder (`consult-mixed-remainder`); its parts stay visible; Khamenei missed years with one leave the known total |
| N2  | Sistani  | Living loan: "enter the amount still owed" → 2,200 under an unstated reading       | Question asks for the amount borrowed; new `debt-repaid-some`: yes → review (`consult-debts`), no → deducted as the text says                                    |
| N3  | both     | Asset/balance from inherited money excluded without the deceased's-unpaid question | New `holding-inherited-unpaid` on the paid path (annual, missed-year, first-time asset and cash): yes → `consult-inheritance-unpaid` / first-time review         |
| N4  | Khamenei | Freelance costs entered as business costs dropped (8,400)                          | Freelance and rental earnings kept in `work-earnings`; a business loss beside them stops at `consult-work-costs`                                                 |
| N5  | Khamenei | Business loss with one account reduced salary (1,800)                              | One shared account → `consult-business-loss` (Q245 vs the p.60 note); separate accounts → loss counts as zero (both texts agree)                                 |
| N6  | Khamenei | First-time necessity excluded without the status condition                         | New `ftk-necessity-status`: no → review                                                                                                                          |

"Encoded:" texts updated: sis-737, sis-1772, sis-1803, sis-1830, kha-business-cost,
kha-business-lines, kha-inheritance, kha-paid, kha-expenses, kha-mixed. New scenarios:
`annual-inherited-savings-unpaid`, `annual-living-debt-repaid`, `annual-freelance-costs`; changed
expectations: mixed-amount scenarios (total withheld) and Khamenei `annual-business-loss-shared`
(now a review stop; 0.8.0 showed 3,000).

## Verification (actual results)

| Step                                                              | Result                                          |
| ----------------------------------------------------------------- | ----------------------------------------------- |
| `pnpm check` (format, boundaries, lint, typecheck, tests, builds) | Exit 0; lint 11/11, typecheck 11/11, builds 2/2 |
| Unit and integration tests                                        | 1,874 passed, 1 skipped by design               |
| Playwright e2e (desktop, tablet, mobile; in-memory test API)      | 501 passed, 3 skipped (viewport-specific)       |

## Fresh independent audit of 0.9.0 (two reviewers, own pass first; coordinator reproduced each HIGH)

**N1–N6: resolved** in every answer combination the reviewers tried (unanswered → clarification or
missing answer, never a figure). All earlier CRITICAL/HIGH findings (S1–S6, S8, S11, K1–K5, mixed
over one-fifth, living source, business lines, per-year isolation) remain resolved.

**New or raised HIGH findings (not fixed; need a 0.10.0 round):**

| Id  | Marja    | Workflow                   | Shown on 0.9.0 (reproduced)                                                                                                                                  |
| --- | -------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | Sistani  | annual, missed, first-time | "Khums-paid or inherited money" excludes inherited holdings without the 1771 exceptions (unexpected inheritance, taʿṣīb): real estate → completed 2,400      |
| F2  | Sistani  | first-time                 | Spending from "khums-paid or inherited money" skips the N3 question → completed 0                                                                            |
| F3  | Sistani  | first-time                 | Price entry not linked to its asset: price khums lost (0) or counted twice (22,000) on contradictory answers (was medium)                                    |
| F4  | Sistani  | first-time                 | 738 applied to capital losses, sold-item costs and "other" expenses → 2,000 (was S13, medium)                                                                |
| F5  | Sistani  | first-time                 | Asset from income of the current, unfinished year charged one-fifth → 800 (was S12, medium)                                                                  |
| K11 | Khamenei | annual, missed-year        | Mixed funds answered "doubt only" excluded entirely, skipping the holdings question → 2,400                                                                  |
| K12 | Khamenei | first-time                 | A receivable (money owed to the person) charged as capital → 2,000                                                                                           |
| K13 | Khamenei | annual, missed-year        | Freelance costs inside business costs with an overall profit: a freelance loss is netted silently; the line-loss question does not mention that work → 4,000 |
| K14 | Khamenei | annual, missed-year        | An unpaid cost-of-earning debt with no business income entered is dropped although the person answered it → 6,000                                            |

S14 and S15 (Sistani) can also change a shown total; they stay parked as scholar decisions.

A pattern behind most of these: answer options that join several cases the texts treat differently
("khums-paid **or inherited**", "(or similar)", freelance costs only as business costs, receivables
under "property"). A systematic pass splitting such options would close the class rather than one
case per round.

## Medium and low items

| Item                                                                                                | Status                                                                           |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| S7 treasure below niṣāb (total withheld; parts shown)                                               | OPEN, medium                                                                     |
| S10 khums paid for another year                                                                     | OPEN, medium                                                                     |
| K7 no "not sure" on paid questions                                                                  | OPEN, medium                                                                     |
| K9 bonus scope; mined below niṣāb                                                                   | OPEN, medium (scholar decision)                                                  |
| S14, S15                                                                                            | OPEN, scholar decision (can change the total)                                    |
| K10                                                                                                 | Known-years part resolved; dropped debt is K14; estimated/range over-stops (LOW) |
| Sistani debt status condition only via living wording (F6)                                          | LOW                                                                              |
| Sistani "(or similar)" lets a gift count as paid (F7)                                               | LOW (part of the F1 class)                                                       |
| Khamenei unknown missed-year amounts cannot reach Q255 path                                         | LOW (over-stops; no figure)                                                      |
| Gross `khums-total` label when khums was paid (Khamenei)                                            | LOW                                                                              |
| First-time `ftk-year-known` = no shows a labelled part                                              | LOW (total withheld)                                                             |
| B1 no rounding                                                                                      | BY DESIGN                                                                        |
| Earlier lows (partial aggregate, empty year 0, `earlier-unpaid`, 1851 halves, `BUSINESS_DEBT` path) | OPEN, LOW; no total changed                                                      |

## Verdict

**Critical: none. High: nine remain** (F1–F5, K11–K14), all reproduced on 0.9.0. N1–N6 are fixed
and the audit did not change any code or pack.
