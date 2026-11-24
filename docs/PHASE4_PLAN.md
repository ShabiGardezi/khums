# Phase 4 plan: complete Khums calculator for Sistani and Khamenei (draft for approval)

Status: **decisions approved by the owner 2026-11-24** (ARCHITECTURE §11 #74–#76); **this
implementation plan awaits the owner's approval.** No code or database record is changed before
then. Based on a read-only review on 2026-11-24 of the code, both scholar-review packs (0.10.0),
the research documents, the research and governance policies and the Phase 3 session's final
report (`docs/audit/2026-11-24-phase3-report.md`).

Goal: a working calculator for `sistani` and `khamenei` covering the **annual**, **first-time** and
**missed-year** assessments. AI researches and prepares the rules; an authorised scholar verifies
each exact rule version and its evidence; verified rules are then approved and published
automatically (decision 63; no separate production approval step).

## 1. Approved decisions (owner, 2026-11-24)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **AI prepares the research** (ARCHITECTURE #74): AI may read the official publications and create **DRAFT** research records (sources, verbatim passages, translations, findings and rulings) with its involvement declared on every record. AI records only what the text states explicitly (CLAUDE.md rule 1, transcription); anything ambiguous is recorded as an unresolved issue for the scholar, never answered             |
| D2  | **The Rule Builder is the single rule-management path** for all three assessments (#75). AI enters its prepared rules there. The hand-built scholar-review packs are frozen at 0.10.0 as history (never edited, deleted or re-hashed); their 59 transcriptions are reused, not redone                                                                                                                                             |
| D3  | **"Approved for scholar testing" is an AI technical status, not religious approval** (#76). After AI has researched, implemented and technically tested a rule it may mark that rule revision _Approved for scholar testing_. The rule is then immediately usable in the staff scholar-testing calculator. It stays `UNVERIFIED`, provisional and staff-only, and every place showing it says it is **not verified by a scholar** |
| D4  | **Scholar verification publishes** (unchanged policy, decisions 63, 67, 70): an authorised SCHOLAR of the Marja (or a SUPER_ADMIN) verifies the exact rule revision and its evidence; the server then approves and publishes it automatically. AI never verifies, never reviews its own AI declarations and never sets a research record beyond DRAFT                                                                             |
| D5  | **Never invent or approximate.** New engine capabilities (dates, valuations, thresholds, deductions, carry-over, currency conversion) are added only where a researched ruling needs them; a case the rulings do not settle, or the engine cannot express exactly, stops for scholar review naming what is missing                                                                                                                |
| D6  | **Preserve everything**: the 59 transcriptions, the 140 placeholder topics, the 70 catalogue questions (unchanged), historical rule packs, source references, version history and audit records                                                                                                                                                                                                                                   |
| D7  | **Simple architecture**: no new packages or services; extend the existing engine, rule builder, research workspace and scholar screens                                                                                                                                                                                                                                                                                            |

## 2. What exists today (reuse)

| Area                      | Implemented                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Research workspace        | Sources, verbatim passages (≤ 8,000 characters, exact locator), translations (en, ur), findings, rulings; DRAFT → VERIFIED/REVIEWED/APPROVED lifecycles; AI-involvement declarations that block every approval transition until a person reviews them; evidence files (≤ 2 MB each) in private storage; full audit                                                                           |
| Rule builder              | One rule per Khums category (annual surplus, mined products, treasure, diving, mixed funds) with included entries, deductions (living expenses, costs of earning, deductible debts), yes/no conditions (per entry or per calculation; include, exclude, stop for review), exceptions, source refs and a research ruling; revisions are append-only and audited; staff test run (annual only) |
| Verification and publish  | Four attestations per rule revision by a SCHOLAR or SUPER_ADMIN; preconditions (evidence VERIFIED, findings VERIFIED/APPROVED, no developer implementation required); automatic PRODUCTION builder version through the governance ledger (`SOURCE_VERIFIED_AUTO_V1`); live re-check against current research on every public serve                                                           |
| Engine (0.2.0)            | Sum of categories, add, subtract, multiply, percentage, max, min, conditions on answers and on comparisons of two computed values, consult stops; fact mapping (category, exclude, ask, consult); annual, first-time and missed-year programs; per-year answers; missed-year total marked COMPLETE, PARTIAL or UNRESOLVED; trace on every result                                             |
| Hand-built packs (0.10.0) | Sistani 98 rules (28 transcriptions + 70 placeholders), Khamenei 101 (31 + 70); about 100 test scenarios each; all three workflows with many review stops. Staff-only; they can never publish (REVIEW_PROCESS §17.5)                                                                                                                                                                         |
| Scholar screens           | Research workspace, rule builder and rule pages, provisional review (packs, breakdown, sources), feedback on provisional results (categories: rule content, source, result, explanation, usability, other), governance, audit                                                                                                                                                                |
| Public calculator         | Phase 3 complete: availability per Marja, workflows offered only when the verified rules define them, entry coverage, result summary, print view, device-only history                                                                                                                                                                                                                        |

**Gaps that block the goal**

1. No research record exists for either Marja (the transcriptions live only in code).
2. The builder covers the annual assessment only, and its single template cannot express most of the
   59 transcriptions (business-line netting, deductions limited to one kind of income, per-entry
   question chains, named review stops, inheritance cases, first-time and missed-year logic).
3. No dates, money thresholds, valuation, carry-over between years or currency conversion in the
   engine.
4. No AI-preparation status, no way to reject or retire a builder rule, no "request a missing rule"
   feedback for builder rules, and the builder test run shows less than the provisional review
   (sources and breakdown).

## 3. Research: done and missing

| Item                              | Sistani                                                                                                                                                                                                                                                                  | Khamenei                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publications located              | Persian _Tawdih_ (Khums 1768–1850, distribution 1851–1866); _Tawdih Jami'_ vol. 2, 1403 (190 Khums headings); Arabic _Minhaj_ vol. 1, 1445 (1191–1269); English _Islamic Laws_ 4th ed. 2023 (official); Urdu _Tawdih_ (official translation, same numbering); office Q&A | «احکام خمس» (2016, 23 chapters; only source with documented lifetime attribution); «اجوبة‌الاستفتائات» (Persian, Arabic); English _Rulings of Khums_ (Q224–Q271 match the Persian); «رساله آموزشی» |
| Passages read in full             | Only those quoted by the 28 transcriptions                                                                                                                                                                                                                               | Only those quoted by the 31 transcriptions                                                                                                                                                         |
| Topics touched by a transcription | 32 of 70                                                                                                                                                                                                                                                                 | 40 of 70                                                                                                                                                                                           |
| Topics with pointers only         | 38 (incl. all continued-taqlid topics)                                                                                                                                                                                                                                   | 30                                                                                                                                                                                                 |
| Not yet read                      | _Jami'_ ruling numbers; Q&A answers; _Minhaj_ cross-check                                                                                                                                                                                                                | Khums chapters of «اجوبة» and «رساله آموزشی»; khamenei.ir (blocked to tools)                                                                                                                       |
| Per-assessment analysis           | None                                                                                                                                                                                                                                                                     | None                                                                                                                                                                                               |
| Verified by a person              | None                                                                                                                                                                                                                                                                     | None                                                                                                                                                                                               |
| Open issues recorded              | 68, plus audit findings F1–F5                                                                                                                                                                                                                                            | 62, plus audit findings K11–K14                                                                                                                                                                    |

Khamenei's rulings now reach us through his successor's office; the deceased-Marja rules
(REVIEW_PROCESS §15) and the attribution evidence of PRIMARY_SOURCE_INVENTORY §3.3–§3.5 apply to
every Khamenei record.

## 4. Research method (per Marja)

1. **Sources**: one SOURCE record per edition (title, language, edition, publisher, date, web
   address, stated authorship, access and copyright status as observed). Authenticity and
   canonical status stay `UNVERIFIED` / `UNDECIDED` for the scholar.
2. **Read every Khums passage**, not headings: the whole Khums chapter of the canonical texts
   (Sistani: Persian _Tawdih_ and _Tawdih Jami'_, cross-checked with _Minhaj_ and the Q&A; Khamenei:
   all of «احکام خمس», then the Khums questions of «اجوبة»). Each relevant ruling becomes a PASSAGE:
   verbatim original text, exact locator (book, edition, page or ruling/question number, web
   address), the precaution wording exactly as written.
3. **Translations**: an office's own English or Urdu edition is recorded as its own SOURCE and
   PASSAGE (official translation). AI translations are TRANSLATION records whose translator is
   "AI machine draft" with an AI declaration. The original always governs.
4. **Per-ruling sheet** (FINDING, DRAFT, one per catalogue question per Marja, written only from
   explicit text): conditions, exceptions, qualifications, precaution level as worded, which
   assessment types the text itself names, and every unresolved issue phrased as a question.
5. **Rulings** (DRAFT): one per rule the calculator needs, citing its findings and passages.
6. **Beyond the 70 questions**: any further Khums ruling a complete calculator needs is recorded
   against the closest catalogue question and listed in `docs/research/ADDITIONAL_TOPICS.md` for the
   owner; the 70 questions are never changed.
7. **Reuse first**: the 59 transcriptions and their quoted excerpts are re-checked against the full
   passages and carried over; nothing already found is searched for again.

**Where records live**: a committed, reviewable research bundle (`docs/research/bundles/<marja>/`,
excerpts only) loaded into the local app by an idempotent import command that creates DRAFT
records through the existing research API, each with its AI declaration. Loading into Atlas
happens only with the owner's explicit approval. Full copies of publications stay in a local
folder that is never committed or published (copyright is stated on no official page); each
download is requested from the owner first (file name, source, size).

## 5. Rules needed and assessment coverage

A rule applies to an assessment type only where its text says so; otherwise that type gets a
review stop naming the gap. Annual rules are never assumed for the other two.

| Area (catalogue groups)                                                                    | Annual                                                  | First-time                                             | Missed-year                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| Liable gains (INC): earnings, business, gifts, inheritance, mined, treasure, diving, mixed | Transcribed partly (32/40 topics); complete             | Which past gains are liable, valuation of what remains | Per year, as annual, with that year's own facts |
| Expenses and needs (EXP, NEC)                                                              | Living expenses, costs of earning; needs largely unread | Items bought from unpaid income and still held         | Expenses of each year only                      |
| Surplus and savings (SUR, SAV)                                                             | Partly                                                  | Savings held at the start; hardship cases (Khamenei)   | Savings carried between years                   |
| Property and investments (PRO, INV)                                                        | Mostly review stops                                     | Value at purchase vs now (scholar to confirm which)    | Value changes between years                     |
| Debts (LIA)                                                                                | Partly (business debt vs salary, Khamenei)              | Debts at the start                                     | Debts and unpaid Khums carried forward          |
| Business (BUS)                                                                             | Netting rules transcribed; stock partly                 | Capital and stock at the start                         | Losses and capital per year                     |
| Khums year and timing (FTK, MIS)                                                           | Year boundaries                                         | First Khums year, unknown amounts, doubt               | Payments, settlements, unknown years, inflation |
| Distribution and payment                                                                   | Halves (both Marjas)                                    | As annual                                              | As annual                                       |
| Continued taqlid (CTQ)                                                                     | Review stop (Khamenei)                                  | Review stop                                            | Review stop                                     |

The complete list of rulings and rules per Marja is the output of research step 4 (the per-ruling
sheets); it is tracked in `docs/research/COVERAGE.md`, one row per rule: question, passages,
assessment types named by the text, status (explicit → rule; ambiguous → review stop), builder
rule id.

## 6. Calculation capabilities

| Capability                                                           | Today                           | Work                                                                                                                                               |
| -------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Categories, deductions, yes/no conditions, review stops, rate        | Engine and builder              | Builder: named review stops with the scholar's reason; conditions combining several answers (all/any); a deduction limited to named income entries |
| First-time and missed-year programs                                  | Engine (hand-built packs)       | Builder templates for both, reusing the engine's existing programs and per-year answers                                                            |
| Missed-year total (complete / partial / unresolved)                  | Engine                          | Reuse                                                                                                                                              |
| Carry-over between years (payments, unpaid Khums, debts, losses)     | Missing (years independent)     | Engine: a year may read declared outputs of the previous year; aggregate unchanged                                                                 |
| Dates (Khums year boundaries, acquisition inside or before the year) | Fact dates exist, no date logic | Engine: compare an entry's date with the assessment year; builder: date conditions                                                                 |
| Valuation (cost, value at a date, current value)                     | Missing                         | Inputs: the person states each value with its date (never fetched); rule data says which value applies                                             |
| Money thresholds                                                     | Missing (builder field unused)  | Engine: money constant with currency; builder threshold becomes compilable                                                                         |
| Currency conversion                                                  | Missing                         | The person enters the rate and its date; rule data says which date's rate applies; never fetched                                                   |
| Proportional split (part paid from untaxed money)                    | Missing                         | Only if a researched ruling needs it                                                                                                               |
| Rounding                                                             | Engine (packs)                  | Builder: only where a ruling states it                                                                                                             |

Each new expression kind gets structure validation, readiness walking, evaluator support, Zod
schema support, tests and a pack `schemaVersion` 4 decision (CLAUDE.md engine rules). Older packs
stay readable and are never re-hashed.

## 7. Scholar testing and verification

- **AI preparation status** on each builder rule revision: `preparedBy` (AI or staff) and
  `aiStage` (`DRAFT` → `APPROVED_FOR_SCHOLAR_TESTING`), set only after the rule's technical tests
  pass. Shown everywhere as **"Approved for scholar testing by AI — not verified by a scholar"**
  together with **PROVISIONAL — FOR SCHOLAR REVIEW ONLY**.
- **Scholar-testing calculator**: the existing builder test run, extended to all three workflows and
  showing the Phase 3 result summary, the step-by-step breakdown, each rule's sources (original
  passage, official or AI translation) and its AI status. Unverified rules never reach the public
  calculator.
- **Scholar actions**: revise (existing), replace (new revision), **reject** (new: the rule is
  retired and compiles to nothing; history kept), verify (existing), and **request a missing rule
  or calculation change** (new feedback category `MISSING_RULE`, also on builder rules).
- **Verification**: unchanged. The scholar verifies the research records (passages, translations,
  findings) in the workspace and then the exact rule revision; the server publishes automatically.

## 8. Steps (each ends ready for scholar testing)

| Step | Work                                                                                                                                                     | Exit                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| P4-0 | Baseline: commit the current tree (owner approval needed; nothing is committed yet); confirm the Phase 3 session is finished                             | Clean starting point                                                                 |
| P4-1 | Builder foundations: AI preparation status, reject, `MISSING_RULE` feedback, test run with sources and breakdown, research-bundle import command         | Existing annual builder rules testable with the new screens                          |
| P4-2 | Research, both Marjas: sources, all Khums passages, official vs AI translations, findings and rulings (DRAFT), coverage table, additional topics list    | Research bundle loaded locally; every passage reviewable                             |
| P4-3 | Annual: builder extensions (named stops, combined conditions, limited deductions, dates, thresholds); enter every annual rule; scenarios for both Marjas | Annual rules marked Approved for scholar testing                                     |
| P4-4 | First-time: builder template, valuation inputs; rules and scenarios                                                                                      | First-time rules marked Approved for scholar testing                                 |
| P4-5 | Missed-year: builder template, carry-over, currency conversion where rulings need it; rules and scenarios                                                | Missed-year rules marked Approved for scholar testing                                |
| P4-6 | Independent audit of rules against passages; full check suite (`pnpm check`, Playwright); report                                                         | Report with honest results; nothing committed, migrated or deployed without approval |

## 9. Still needing the owner

- Approval of this plan.
- Approval of each publication download (file name, source, size), and of the P4-0 baseline commit.
- Approval before any import into Atlas.
- The site-wide "mock" banner question raised by the Phase 3 session (unchanged by this plan).

## 10. Progress

**P4-1 (2026-11-24), implemented, uncommitted:**

- Builder revisions carry an optional AI preparation (`DRAFT` or `APPROVED_FOR_SCHOLAR_TESTING`,
  tool, tests). AI approval is refused unless the rule is complete and supported, and is shown
  everywhere as "Approved for scholar testing by AI — not verified by a scholar". AI-approved
  rules compile into the scholar-testing calculator at once and stay `UNVERIFIED`.
- Scholars can reject a rule (a new revision): it is left out of every test and public pack, and
  cannot be verified (`RULE_REJECTED`) until a later revision replaces it.
- Scholar requests (missing rule, calculation change) with a single resolution
  (`scholarRuleRequests`; Atlas needs `--migrate-database`, with the owner's approval).
- The builder test run lists each compiled rule's AI status, research ruling and sources.
- `scripts/import-research-bundle.mjs` imports an AI-prepared bundle (DRAFT research records with
  AI declarations, builder rules with their AI stage) through the staff API; idempotent.
- New AI involvement types `TEXT_TRANSCRIPTION` and `FINDING_DRAFT` (decision 74).

**P4-2 (2026-11-24), research prepared, uncommitted:**

- Read in full (passages, not headings): Sistani _Tawdih_ Khums and taqlid rulings in Persian and
  the office's English edition (1768–1866; 2, 6, 8, 12), _Tawdih Jami'_ vol. 2 (158 rulings on the
  khums year, mu'nah, savings, capital, price rises and inflation, investments, debts, receivables,
  settlement and missed years), the Sistani Khums Q&A page; Khamenei «احکام خمس» (all chapters)
  and the taqlid chapter of «اجوبة الاستفتائات».
- 524 own-words research sheets (`docs/research/bundles/<marja>/sheets*.jsonl`), each with the
  assessment types the text itself names and the calculator use (rule, rule needing an input or
  capability, review stop, guidance). No ruling text is stored in the repository.
- Bundles (`bundle.json`, generated by `scripts/build-research-bundle.mjs`): Sistani 4 sources,
  378 passages, 66 draft findings; Khamenei 2 sources, 181 passages, 69 draft findings. Official
  translations (Sistani's English edition) are their own source and passages; no AI translation of
  the texts is made (copyright).
- `scripts/fetch-office-passages.mjs` (run by the owner) copies each cited ruling's verbatim text
  from the official page or EPUB into a git-ignored cache; `--check` found all 559 passages.
- `docs/research/COVERAGE.md` (generated) and `docs/research/ADDITIONAL_TOPICS.md`.
- Research rulings (layer B) are created with the rules in P4-3, so each cites exactly the
  findings and passages its rule needs.

**P4-3 (2026-11-24), annual rules, implemented, uncommitted:**

- Builder extensions (existing engine operations only; no new expression kind, no pack schema
  change; earlier revisions keep their content hash): a deduction may be limited to named counted
  entries (`against`: e.g. business costs reduce business, freelance and rental income only, never
  below zero, so a business loss never offsets salary); per-entry confirmations may name
  deduction entries (spending and debts); costs of earning may include business debts. The rule
  form edits both fields (it previously dropped a confirmation's entry list on save).
- Minimum amounts (nisab of mines, treasure and diving) are asked as factual confirmations (is the
  value below the stated gold or silver weight on the date?) instead of a money threshold: the
  texts state the nisab in metal weight, so a fixed amount would need a metal price anyway.
- Ten AI-prepared annual rules with their DRAFT research rulings (`docs/research/bundles/<marja>/
rules.json`), five per Marja: annual surplus, mined products, treasure, diving gems, mixed
  wealth. Each confirmation cites its ruling; anything the texts leave open is a review stop.
- `apps/api/test/annual-rules.integration.test.ts` imports both bundles through the staff API and
  runs 30 scenarios in the scholar-testing calculator against hand-computed figures; the rules
  carry "Approved for scholar testing by AI" with the scenario ids.

**P4-3 annual completion audit (2026-11-24), implemented, uncommitted:**

- Every annual category audited for both Marjas against the research sheets and the encoded rules:
  `docs/audit/2026-11-24-annual-coverage.md` (implemented, partial, scholar review, needs developer,
  needs research).
- Added from explicit text with existing engine operations (decision 77): tax as spending (Sistani
  Jami' 848; Khamenei's tax section, earlier years' tax not deducted), khums paid during the year
  subtracted from the amount due (Jami' 582, 721; Khamenei Q227, Q247), receivables of income not
  yet received (Jami' 715, 716; Khamenei's receivables sections). Credit sales stay review stops.
- End-to-end: 61 hand-computed scenarios and every one of the 55 entry types for both Marjas run
  through the staff API and the scholar-testing calculator.
- Still needing developer capabilities before the annual assessment is complete: date logic
  (entries outside the year, separate cycles, changing the year, Khamenei's five days), opening
  (already taxed) values for carry-over, an inflation input (Khamenei), and the balance-based
  savings exceptions (Khamenei). These need engine work and an owner decision on the input model.

**P4-3 annual capabilities (2026-11-24), implemented, uncommitted (decision 78):**

- Khums-year dates: entries outside the year stop for review; a period longer than any calendar
  year stops (Sistani Jami' 578, Khamenei Q235); a shorter transitional period is calculated as
  entered (578, Q234); separate yearly cycles are assessed one cycle at a time, and living expenses
  in a separate-cycle assessment stop for review (not stated); Khamenei's five days after the year
  end for spending, business costs and needs debts.
- Carry-over: a value taxed at the end of the previous year (dated before the year) is deducted
  from the same counted items (Sistani trading stock, 645, 653, 670; Khamenei working capital and
  shares held for growth); Sistani's unpaid, not yet deducted lasting-needs debt (704; Q&A 7).
- Inflation (Khamenei): the person's own percentage per entry: sale gains above cost plus
  inflation, deposit profit above the principal's inflation, capital growth above last year's
  value plus inflation. Sistani: obligatory precaution (647), review stop on stock and sales.
- Balances (Khamenei): year-end cash, bank and wallet balances exempt for marriage once steps began,
  emergencies and the last salary; near-future necessities stop for review.
- 25 new hand-computed scenarios; every entry type for both Marjas; 2,726 tests pass.

**P4-3 completion (2026-11-24), implemented, uncommitted:** entry types `INCOME:MAHR`, `DIYAH`,
`INSURANCE_PAYOUT`, `EXPENSE:INSURANCE`, `LIABILITY:UNPAID_MAHR` (frozen packs build without them,
digests unchanged); rules for mahr and diyah received (not liable), insurance premiums and payouts,
and Sistani's unpaid mahr of the first year of marriage; a realistic full-household year and
negative-surplus edge cases for both Marjas; 101 scenarios and all 60 entry types end to end.
Every complete AI-prepared rule carries "Approved for scholar testing by AI" and is in the
scholar-testing calculator at once; research records stay DRAFT (decision 74).
