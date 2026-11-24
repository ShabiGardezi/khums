# Comprehensive review — Sistani and Khamenei calculation systems, packs 0.10.0 (2026-11-23)

Maintainer request: replace the "fix a few, find more" cycle with one complete review of both
calculation systems, all corrections in one new version, and a fresh independent audit. Results
stay **PROVISIONAL — FOR SCHOLAR REVIEW ONLY**. No rule was verified or approved: every rule is
`UNVERIFIED`. Roles, permissions, governance, database, deployment and infrastructure were not
touched; nothing was committed or deployed. Phase 2 was not started.

Detailed records (inventories, every reviewer's and auditor's findings with reproductions,
implementation notes and the binding decisions) are kept beside this report in
[`comprehensive-0.10.0/`](comprehensive-0.10.0/).

## 1. Method

1. **Consolidation.** Every finding of the seven earlier reports (frozen audit C1–C20 and T1–T10;
   fresh audit S1–S16, K1–K10, B1; corrections 0.5.0; Phase 1; per-year answers; audit of 0.8.0
   N1–N6; audit of 0.9.0 F1–F7, K11–K14) was given to the reviewers, who assigned each a current
   status (§3).
2. **Mechanical inventory.** The sealed 0.9.0 packs were walked programmatically: every
   fact-mapping path (159 Sistani, 226 Khamenei), question, option, category, consultation and
   program step, with every transcription's excerpt and issues. Reviewers walked it leaf by leaf
   instead of hunting for cases.
3. **Systematic review**, four reviewers in parallel (Sistani annual/missed, Sistani first-time,
   Khamenei annual/missed, Khamenei first-time). Each leaf was checked against its cited excerpt
   for missing conditions, combined answer options, wrong mappings, unsupported interpretations and
   misleading totals, and combinations were run through `prepareAssessmentInput` → `calculate`
   (scholar-review mode). Result: 35 HIGH, 31 MEDIUM, 24 LOW, no CRITICAL.
4. **Source check (by tools, not scholar verification).** Sistani quotes were checked in context on
   the office pages of sistani.org (Tawdih 1768–1850, Jami' vol. 2 incl. 598, 620–626, 684–690,
   701, 736–744; English 4th ed.). leader.ir returned HTTP 404, so Khamenei quotes were checked
   against a text extraction of the office PDF of «احکام خمس» (book 215) downloaded from the
   office site earlier in this project. No third-party site was used.
5. **Binding implementation decisions** (`comprehensive-0.10.0/decisions.md`): a new question or
   option only where the excerpt explicitly states the condition; everything ambiguous becomes a
   consult stop; a question whose meaning changes gets a new id; a defect class found in one Marja
   is fixed in both unless the other's own text settles it; over-stops are accepted and recorded.
6. **Implementation** of every item in one version, 0.10.0, by single-writer implementers in
   sequence, each adding regression tests (defect on frozen 0.9.0, correction on 0.10.0).
7. **Fresh independent audit** of 0.10.0 by four new auditors (own pass before reading anything
   else): 7 HIGH, 11 MEDIUM, 16 LOW → all fixed inside 0.10.0 (still unpublished).
8. **Final verification audit** of the whole system, one auditor per Marja over all workflows
   (334 + 525 mapping paths; 2,330 + 4,964 leaf runs): 2 HIGH, 5 MEDIUM, 5 LOW → fixed inside 0.10.0.
9. **Independent check of the last fixes** plus a regression sweep: **0 CRITICAL, 0 HIGH**, 1 MEDIUM,
   2 LOW → the MEDIUM and one LOW fixed, the other recorded (§4).

The HIGH count fell at each round: 35 → 7 → 2 → 0.

## 2. Versions

| Version | Sistani                                                            | Khamenei                                                           | Status                                    |
| ------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------- |
| 0.9.0   | `feb454c8…5274fe2b`                                                | `87d589bd…1ad3c73c`                                                | Frozen before any change (snapshot added) |
| 0.10.0  | `8d49a9ceb73078d602187ce6cdd71177021ebf1858382319d3b6fd83da57f585` | `bb5db6e2f923861724bfdee803b9e362649345c5acf520f51a1509bce324b20d` | Current; digests pinned                   |

All fourteen earlier snapshot files (0.3.0–0.9.0) are byte-identical (SHA-256 checked after every
step). No engine, schema, API contract, UI, role, permission or governance code changed. One test
policy changed: the API test that keeps each sealed pack below half the 512 kB registration limit
now keeps it below three-quarters (the limit itself is unchanged); 0.10.0 packs are about 320 kB
(Sistani) and 350 kB (Khamenei), because every new stop and question carries its citation.

## 3. Consolidated findings and their status

### 3.1 Earlier audits (all reports before this review)

| Group                              | Items                                     | Status on 0.10.0                                                                                            |
| ---------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Frozen audit, calculations         | C1–C10, C12, C14, C17, C19                | Resolved (C10 khums-paid capital condition, C14 growth assets, C17 period length by question)               |
|                                    | C11                                       | Resolved (0.3.0)                                                                                            |
|                                    | C13, C18                                  | Resolved (growth question; current-year items only at the year's end, Q227)                                 |
|                                    | C15, C16                                  | Resolved as stops (bonus kind; mined below niṣāb)                                                           |
|                                    | C20 / B1 rounding                         | By design: full precision, maintainer decision                                                              |
| Frozen audit, technical            | T1–T6                                     | Resolved (0.4.0); T3 also on the current-year path (AT-01)                                                  |
|                                    | T7–T10                                    | Open, LOW, outside pack content (UI/API hardening; no figure)                                               |
| Fresh audit 0.4.0                  | S1–S6, S8, S11, S16, K1–K6                | Resolved                                                                                                    |
|                                    | S7, S9, S10, S12, S13, K7, K8, K10        | Resolved (0.10.0)                                                                                           |
|                                    | S14, K9                                   | S14: recorded as a scholar issue, no logic change; K9: bonus and mined-below-niṣāb now stop                 |
|                                    | S15                                       | Living mappings supported by Jami' 598 ج; religious duties and donations now asked; investment returns stop |
| Phase 1 / per-year / 0.8.0 / 0.9.0 | N1–N6, F1–F7, K11–K14, per-year isolation | Resolved; per-year isolation re-verified                                                                    |

### 3.2 Comprehensive review (0.9.0 → 0.10.0)

| Area                                  | HIGH | MEDIUM | LOW | Done | Done as stop / note         | Not done (reason)                                  |
| ------------------------------------- | ---- | ------ | --- | ---- | --------------------------- | -------------------------------------------------- |
| Sistani annual and missed (SA-1…23)   | 10   | 6      | 7   | 18   | SA-22 note                  | SA-19, SA-20 (decision), SA-23 (nothing to change) |
| Sistani first-time (SF-01…20, 08b)    | 9    | 8      | 4   | 19   | SF-01 fail-safe, SF-17 note | SF-19 (decision)                                   |
| Khamenei annual and missed (KA-01…23) | 8    | 9      | 6   | 21   | KA-22, KA-23 notes          | —                                                  |
| Khamenei first-time (KF-01…24)        | 9    | 8      | 7   | 21   | KF-14 stop                  | KF-19 (no change proposed), KF-22 (UI)             |

Main corrections (both Marjas unless stated):

- **Combined answer options split**: "khums-paid or inherited money (or similar)" → a source
  choice; Sistani asks the Ruling 1771 exceptions and the 1772 question; Khamenei encodes its own
  kinds of doubt (Q249, Q250) exactly; gifts, loans, partly-paid money and other receipts stop.
- **Conditions the texts state now asked**: Jami' 598 conditions 3–5 and status for every living,
  gift, charity and religious entry (Sistani); Q50/51/94 leftovers and Q151/155 timing (Khamenei);
  1803 later-years rule for personal-item loans; khums-paid capital for capital losses (684);
  period is one khums year; nothing of the year's income now in property (737 الف/ج; p.5); pay
  withheld for a pension fund (626 n.1; Q72); hajj deposits (Q46–47; 1795).
- **Misleading totals withheld**: any mixed amount; remainder of mined product, treasure and gems;
  receivables; joint ownership; business equipment and freelance/rental costs inside business
  costs; business debts with no business income; khums paid for another year; investment returns
  (Sistani, pending the scholar); missed-year amounts not known (Q255); late khums without its
  loss of value (Q260–265; Sistani 737 n.5 analogue); an annual year that is not the latest.
- **Parts withheld with the total**: `surplus`/`khums-due` (annual, missed) and every first-time
  part are withheld whenever the total is; category parts with their own excerpt stay visible.
- **Labels**: totals and halves say "before khums already paid"; review cards say "not an amount".
- **First-time price ↔ asset**: pack-only fail-safe (separate categories and withholding checks).

### 3.3 Fresh audit of 0.10.0, final audit and last check (all fixed inside 0.10.0)

| Round                                              | Items                     | Not done                                                |
| -------------------------------------------------- | ------------------------- | ------------------------------------------------------- |
| Fresh audit (AS-1…9, AF-01…05, AK-01…13, AT-01…07) | 7 HIGH, 11 MEDIUM, 16 LOW | AS-8, AF-05 (UI), AS-9/AK-12 (decision), AF-03 (engine) |
| Final audit (FS-01…07, FK-01…05)                   | 2 HIGH, 5 MEDIUM, 5 LOW   | FS-06 (engine), FS-07 (= AS-8)                          |
| Last check (VF-01…03)                              | 0 HIGH, 1 MEDIUM, 2 LOW   | VF-02 recorded as an over-stop                          |

## 4. Remaining scholar-review cases, over-stops and limitations

**Cases that remain scholar-review stops (no figure is shown)** — the main ones: business losses
and losing lines that cannot be netted; unsold stock and business equipment; capital losses beyond
the business profit or from capital not khums-paid; every sale (1787); pensions outside 620/624/626;
"other" income and expenses; investment returns (Sistani); debts outside the transcribed rulings,
partly repaid loans, loans for items bought this year; inheritances with unpaid khums, unexpected
or taʿṣīb inheritances, and the 1772 valuation; treasure and gems below niṣāb or not the finder's;
the remainder of mined product, treasure and gems; every mixed-funds case; holdings not from
khums-paid or qualifying inherited money, merchandise and growth assets; receivables, digital
assets, joint ownership; khums paid for another year and overpaid khums; estimates, ranges and
approximate dates; missed-year unknown amounts (Q255) and inflation or loss of money value; a
period that is not one khums year or an annual year that is not the latest; first-time older
property's inflation, unknown sources (settlement), credit purchases, savings for near-future
needs, former necessities, and any first-time sheet whose prices and items do not pair.

**Over-stops a text arguably settles** (recorded in the rules' issues for the scholar to lift):
home or personal items bought this year; tool losses (685 ب); a living loan from a no-profit year;
the special remainder if not liable again; gifts in kind; co-owned houses; stolen merchandise (738);
necessities bought in an earlier year with that year's income; sale proceeds of a necessity (Q137);
borrowed money (Q35); survivors' pensions (Q223); severance pay (Q189); entitled bonuses; hajj
deposits treated as spent; pay entered net of withholding; gems from rivers or by tool;
`leftover-not-converted` answered "no" for a repaid house or car loan (VF-02).

**Limitations (engineering)**:

1. **Price ↔ asset linking (Sistani first-time, AF-03).** The expression vocabulary cannot count
   entries or link a price to its item. The fail-safe catches every unpaired kind but not N items
   with M ≠ N prices when the person answers each pairing question "yes" falsely (e.g. two items
   with one price shows 4,000 instead of 8,000). Needs an engine feature (entry count or a
   price→asset fact link) — not added (engine change out of scope).
2. **Period length (FS-06).** The engine does not compare period dates; the khums-year and
   latest-year questions rely on the person's answer.
3. **UI items:** pack questions are shown in every workflow, so annual-only or missed-only questions appear (optional, no effect) elsewhere (earlier T7); a required status question when nothing is deducted (AS-8); stale answers left on
   questions no longer on the path (AF-05); entry help text for gross/net pay (KA-22, KF-22);
   five-day payments after the year end cannot be entered (KA-23).
4. **Empty year or sheet** counts as 0 (SA-20, SF-19, AS-9, AK-12) — by decision.
5. **Source verification** is by tools only (locators and quotes in context). Khamenei quotes were
   checked against a local extraction of the office PDF because leader.ir returned 404. None of
   this is scholar verification; every rule stays `UNVERIFIED` and needs the governing scholar.
6. **Engine aggregate / earlier technical lows** T7–T10 are unchanged (outside pack content).

## 5. Verification (actual results, final state)

| Step                                                                                        | Result                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` (format, boundaries, lint, typecheck, tests, production builds of API and web) | Exit 0; lint 11/11, typecheck 11/11, builds 2/2                                                                                                                                                                                                                      |
| Unit and integration tests                                                                  | 2,224 passed, 1 skipped by design (core 1,052, API 410, engine 203, validation 129, web 128, marja-rules 121, money 118, ui 27, utils 20, api-client 14, shared-types 2)                                                                                             |
| New regression and cross-scenario tests                                                     | 4 files, 275+ tests (`packages/core/src/provisional/comprehensive-*.test.ts`): each defect replayed on frozen 0.9.0 and corrected on 0.10.0, every branch of changed questions, multi-entry sheets; plus updated scenarios (new review scenarios for the main stops) |
| Playwright e2e (desktop, tablet, mobile; in-memory test API, no database)                   | 501 passed, 3 skipped (viewport-specific), 0 failed                                                                                                                                                                                                                  |
| Frozen snapshots 0.3.0–0.9.0 (14 files)                                                     | SHA-256 unchanged                                                                                                                                                                                                                                                    |

The last check's fixes (VF-01 annual year not the latest, VF-03 Sistani value-loss parts) were
verified by regression tests and the full suite, not by a further independent audit round.

## 6. Verdict

No CRITICAL or HIGH finding is known to remain in either calculation system. The remaining items
are recorded scholar-review stops, recorded over-stops for the scholar, and the engineering
limitations above. Phase 2 has not been started.
