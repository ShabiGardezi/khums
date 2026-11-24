# Calculation corrections — scholar-review packs 0.5.0 (2026-11-23)

> Corrections for the CRITICAL and HIGH findings of
> [2026-11-23-fresh-calculation-audit.md](2026-11-23-fresh-calculation-audit.md), at the
> maintainer's direction ("calculation corrections only"). Nothing here is verified or approved by
> a scholar: results stay **PROVISIONAL — FOR SCHOLAR REVIEW ONLY**. Where a source is ambiguous
> the correction is a `consult` stop (scholar review), never a new reading (CLAUDE.md rule 1).
> Roles, permissions, governance, database, deployment and infrastructure were not touched.
> Nothing was committed or deployed.

## Versions

| Pack                      | 0.4.0 (frozen, byte-exact)                                         | 0.5.0 (current)                                                    |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `sistani-scholar-review`  | `38fa7555439f4e43aaccf68d73c78cb07dee921f8506f4495a78ba33a0128843` | `ecd237d437a2f40d7cb6b66b4f40d396b1e6f8c4eb38eebfe28f3670da65972f` |
| `khamenei-scholar-review` | `a07e28f95aca9c4e9deefbb0a82ffa4a602f01c1f1c1878aa827b7d5b7cc0b2d` | `42ea35436a8f00ee7941bb2728d10a8d9fe015c4a0819f0ba12e0379ef2d8229` |

- 0.4.0 was snapshotted **before** any change, exactly as `sealedReviewPack` built it, into
  `packages/core/src/provisional/history/{sistani,khamenei}-scholar-review-0.4.0.json` (the
  existing history procedure). Its digest equals the digest pinned for 0.4.0, the file bytes were
  checksummed and re-verified after every change, and `history.test.ts` validates it and re-runs a
  calculation traced to it. A 0.4.0 registered in any provisional store keeps its write-once copy.
- `REVIEW_PACK_VERSION` is `0.5.0`; the current digests are pinned in `history.test.ts`.
- Engine, readiness gates, schemas, API and contracts are unchanged; no new expression kind.
  Sealed 0.5.0 sizes: 190 kB and 209 kB (registration limit 512 kB).

## Corrections

Each row: what 0.4.0 did, what 0.5.0 does, and its regression test in
`packages/core/src/provisional/re-audit-regressions.test.ts` (which replays the defect on the
frozen 0.4.0 and the correction on 0.5.0).

| #   | Finding                                                                                                          | 0.5.0 behaviour                                                                                                                                                                                                               | Kind                      |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| K1  | Missed year with an unknown amount showed khums due / still to pay                                               | Every figure output of such a year (`khums-due`, `surplus`, `khums-remaining`, mined, treasure, diving, mixed, earlier-unpaid) goes through a `year-*` step that stops at `consult-missed-settlement`; review lists unchanged | Stop (Q255)               |
| S1  | Several sales netted together (3,400 shown)                                                                      | New entry question `sale-only-one`; several sales (or inconsistent answers) → `consult-sale-several`; the gain is calculated for a single sale only                                                                           | Stop                      |
| S8  | (medium, fixed with S1) sale without purchase price counted in full                                              | `consult-sale-cost-missing`                                                                                                                                                                                                   | Stop                      |
| S2  | Unpaid inheritance never asked about khums owed on other property                                                | `inh-deceased-owed` asked after the non-payer exception («in both cases»); yes → `consult-inheritance-unpaid`                                                                                                                 | Question the text states  |
| S3  | Capital loss bypassed the business-loss stop                                                                     | Capital losses are deducted only up to the business profit; more → `consult-capital-loss` (whether the rest reduces other income is not settled, Ruling 1790)                                                                 | Stop                      |
| S4  | Capital loss deducted with no question (Jami’ 685 excludes home/car)                                             | Entry question `capital-loss-business`; no → `consult-pending`                                                                                                                                                                | Question the text states  |
| S5  | Living expenses deducted whatever paid for them                                                                  | Program question `living-from-year-income` (asked only when living expenses are entered); no → `consult-living-source` (1792; Jami’ 598 first condition)                                                                      | Question the text states  |
| S6  | Khums-paid asset excluded even if merchandise (737 ب)                                                            | Entry question `holding-for-sale` for assets answered khums-paid; yes → listed for review (`consult-holdings`) instead of excluded                                                                                            | Question the text states  |
| K2  | Capital loss reduced salary with no shared-account answer                                                        | Same as S3/S4 (`capital-loss-business`; beyond the business profit → `consult-capital-loss`)                                                                                                                                  | Stop                      |
| K3  | Stock bought for resale deducted; unsold stock non-blocking                                                      | `ASSET:BUSINESS_STOCK` → `business-stock`; program question `business-stock-unsold`; either → `consult-business-stock` (as Sistani C6)                                                                                        | Stop                      |
| K4  | Inheritance excluded without asking about khums the deceased left unpaid; inherited asset held for sale excluded | Entry question `inh-deceased-unpaid`; yes → `pending-inheritance` → `consult-inheritance-unpaid` (now gated for both Marjas); `holding-for-sale` as S6 (the text's own «مگر اینکه آن را سرمایه (در معرض فروش) قرار دهد»)      | Stop                      |
| K5  | Q120 emergency exemption applied to older savings                                                                | Funding source asked first; Q120 applies to current-year savings only; older + emergency → `ftk-review` (`consult-ftk-pending`)                                                                                               | Stop (choice of readings) |

Every affected transcription's "Encoded:" text was updated to say exactly what 0.5.0 does
(sis-1772 already described the stop now implemented; sis-1787, sis-1792, sis-1801, kha-business-cost,
kha-capital-loss, kha-inheritance, kha-ftk-hardship). All rules stay `UNVERIFIED`.

## Scenarios changed (technical expectations only)

Defaults added the same way as the existing `holding-paid` default: Sistani annual scenarios
answer `living-from-year-income` yes and Khamenei annual scenarios answer `business-stock-unsold`
no, unless a scenario tests that question. Expectations that changed because the defect was fixed:

- Khamenei `annual-business-stock-unsold`, `annual-business-stock-asset`, `annual-business-full`:
  now stop at `consult-business-stock` (were 1,000 / 1,000 / 8,800).
- Khamenei `annual-inheritance-unpaid`, `-khums-unpaid`, `-non-payer`, `-owed-elsewhere`: now stop
  at `consult-inheritance-unpaid` (were 0 / 2,400 / 2,400 / 0).
- Khamenei `first-time-savings-emergency`: now stops at `consult-ftk-pending` (was 0).
- Sistani scenarios unchanged in figures; answers added for the new questions.

The e2e spec answers the two new program questions in the UI (`apps/web/e2e/review-packs.spec.ts`).
The history test runs earlier snapshots with the answers they define.

## Medium and low findings: prioritized resolution plan (not implemented)

**P1 — engineering, next pack version (each a stop or a question the text states; no reading chosen):**

1. S7 (Sistani): treasure below the niṣāb also withholds `surplus`/`khums-due` (its effect on profit is unstated).
2. S10 (Sistani): ask which year a "khums paid" entry was for; another year → review.
3. S11 (Sistani): ask the owner-group question when the unlawful amount is unknown too (1835 before 1830).
4. K7 (Khamenei): add "not sure" to the paid questions and treat it as not paid — kha-ftk-doubt states this explicitly.
5. K6 (Khamenei first-time): necessities from current-year income ask the status condition kha-expenses attaches.
6. S13 (Sistani first-time): `CAPITAL_LOSS` and `SOLD_ITEM_COST` from year-old income → review instead of 738.
7. S12 (Sistani first-time): an asset bought with current-year income → review (no current-year option exists).
8. K10 (Khamenei missed years): ESTIMATED/RANGE → Q255 settlement; list an unpaid business-cost debt the business cannot absorb; exclude years with open reviews from `khums-known-years`.
9. S9 (Sistani): the debt question asks for the amount still owed while 1803 deducts the borrowed amount — reword to the text and add a review for the cumulative limit in the footnote.

**P2 — needs a maintainer decision (design):**

10. S16 (both): holdings left for review do not block `khums-total`, so the labelled "total" can be low. Option: block the total while holdings are under review, or relabel it as "total of the reviewed categories".
11. B1 (both): no rounding (e.g. 0.006 USD shown exact). Rounding needs a scholar-stated rule; a display-only rounding with a visible "exact amount" would need a maintainer decision.

**P3 — scholar decisions (stay blocked or labelled; engineering cannot resolve):**

12. S15 (Sistani): RENTAL and INVESTMENT_RETURN mapped as earnings under 1769, education/health/housing/travel under «و مانند اینها», RELIGIOUS_DUTY wider than 1795. Strict reading of CLAUDE.md rule 1 would make these review stops until the scholar confirms; that reduces coverage, so it is listed for the maintainer/scholar.
13. S14 (Sistani first-time): which clauses of 737 note 6 (inflation) apply.
14. K8 (Khamenei): Q245 vs the p.60 note (already an open issue in the pack).
15. K9 (Khamenei, earlier C15/C16/C18 and Q247/Q260–265): bonus scope, mined below niṣāb, current-year items at any date, inflation basis.

## Verification (run 2026-11-23, actual results)

| Step                                                    | Result                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                                     | Passed                                                                                                                                                                                                                                                                                                          |
| `pnpm check:boundaries`                                 | Passed (11 workspaces)                                                                                                                                                                                                                                                                                          |
| `pnpm lint`                                             | Passed (11/11)                                                                                                                                                                                                                                                                                                  |
| `pnpm typecheck`                                        | 10/11 packages passed. `@khums/web` failed only on `.next/dev/types/validator.ts` (2 unused-declaration errors), a file generated at 05:10 by another session's still-running `next dev` on port 3101, before these changes. The web sources (same tsconfig without `.next/dev/types`) typecheck with 0 errors. |
| `pnpm test`                                             | Passed: 1,803 tests (validation 126, utils 20, shared-types 2, ui 27, api-client 14, money 118, calculation-engine 200, marja-rules 121, web 128, api 409, core 638 + 1 skipped by design)                                                                                                                      |
| Regression file `re-audit-regressions.test.ts`          | 18 tests passed (defect on frozen 0.4.0, correction on 0.5.0, for every reproduced CRITICAL and HIGH finding)                                                                                                                                                                                                   |
| `pnpm build` (`KHUMS_API_ORIGIN=http://127.0.0.1:4100`) | API built; web compiled, then failed its type check on the same generated `.next/dev/types/validator.ts`                                                                                                                                                                                                        |
| Playwright e2e                                          | **Not run**: it needs the web build, and the other session's servers on 4100 and 3101 would be reused. Waiting for the maintainer's go-ahead to stop them and clear the generated `.next/dev` folder.                                                                                                           |
| 0.4.0 snapshots                                         | SHA-256 of both files unchanged after every change                                                                                                                                                                                                                                                              |
