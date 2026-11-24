# Step 2 — Religious Rules Research Plan

> **Status:** Approved in principle; **FROZEN 2026-11-20** (see [README.md](README.md#freeze)). Revision 2 (2026-11-19). The four-layer separation
> (sources → findings → approved rulings → executable rule packs) was approved by the owner on
> 2026-11-19.
> **Nothing in this folder is a religious ruling.** This document defines _how_ rulings will be
> located, recorded, compared and approved. Every ruling-dependent cell in the research matrix
> starts as `NOT_STARTED`. No research finding becomes executable logic without the separate,
> approved encoding step described in [RULE_PACK_STRUCTURE.md](RULE_PACK_STRUCTURE.md).

## 1. Objectives

| #   | Deliverable (from the Step 2 brief)                                     | Where it is produced                                                                                    |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| D1  | Supported Maraje for the initial release                                | §4 here (selection criteria) → owner decision recorded in [README.md](README.md)                        |
| D2  | Official authoritative sources for each Marja                           | [SOURCE_INVENTORY.md](SOURCE_INVENTORY.md)                                                              |
| D3  | Structured research matrix (11 required topic areas + continued taqlid) | [RESEARCH_MATRIX.md](RESEARCH_MATRIX.md) + per-Marja findings in `findings/`                            |
| D4  | Differences between rulings, with exact source references               | Comparison tables in [RESEARCH_MATRIX.md §5](RESEARCH_MATRIX.md#5-recording-differences-between-maraje) |
| D5  | Cases requiring individual religious consultation                       | [RESEARCH_MATRIX.md §6](RESEARCH_MATRIX.md#6-consultation-case-register)                                |
| D6  | Versioned, source-backed Marja rule-pack structure                      | [RULE_PACK_STRUCTURE.md](RULE_PACK_STRUCTURE.md) (proposal only — no code)                              |
| D7  | Scholar / qualified-representative review & approval process            | [REVIEW_PROCESS.md](REVIEW_PROCESS.md)                                                                  |

## 2. Non-negotiable research rules

1. **No invention or inference.** A cell is filled only with what a cited source states. If the
   source is silent, the status is `SOURCE_SILENT` — never "probably the same as …".
2. **No cross-Marja assumptions.** Each Marja is researched independently from their own sources.
   Two rulings are recorded as equivalent only when a scholar reviewer confirms it (§5 of the
   matrix).
3. **Verbatim first.** Every finding stores the exact original-language text, its precise locator
   (edition, volume, page, mas'alah / question number, URL, access date) and an archived copy.
   Translations are separate, attributed, and reviewed.
4. **AI is a research assistant, never an authority.** AI tools may help locate pages, draft
   translations or format records. AI output is always labelled, can never move a finding past
   `EXTRACTED`, and is never quoted as a ruling. Summaries written by researchers are labelled
   "researcher note — not a ruling".
5. **Uncertainty is visible.** `AMBIGUOUS`, `CONFLICTING_SOURCES`, `SOURCE_SILENT` and
   `REQUIRES_CONSULTATION` are first-class outcomes, not gaps to be papered over.
6. **Research ≠ rules.** Findings are documentation. Encoding approved rulings as rule-pack data is
   a later milestone (M4) with its own approvals.
7. **Official sources first** (tiering in [SOURCE_INVENTORY.md §1](SOURCE_INVENTORY.md#1-evidence-model)).
   Third-party sites may help locate text but are never the cited authority.
8. **Evidence quality.** Every source and evidence item keeps its source class, its **source-access
   status** (a separate field; inaccessible content is never counted), its exact URL, publication date (as
   printed and in Gregorian), original-language reference, translation (attributed) and the date a
   human verified it. Official Marja-office statements (`OFFICE_OWN`, `OFFICE_OTHER`) are kept
   distinct from news reports and community announcements
   ([SOURCE_INVENTORY.md §1.2](SOURCE_INVENTORY.md#12-source-evidence-classes)).
9. **Machine summaries are never sources.** Automated or AI page summaries only point a researcher
   to a page. Nothing is recorded as evidence until a human has read the original page.
10. **Marja lifecycle is separate from applicability.** Living or deceased status is recorded with
    evidence and confidence. A death never deactivates historical rulings, and the platform never
    decides whether a user may continue following a deceased Marja.

## 3. Scope

### 3.1 Topic areas (required)

| Code  | Topic area                      | Notes                                                                                                                                         |
| ----- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `INC` | Income                          | What counts as gain/acquisition per the source.                                                                                               |
| `EXP` | Expenses                        | Deductibility, timing.                                                                                                                        |
| `SUR` | Annual surplus & the Khums year | Year definition, valuation date, offsetting, payment timing.                                                                                  |
| `SAV` | Savings                         | Savings for future needs, deposits, pensions.                                                                                                 |
| `NEC` | Personal necessities (_mu'nah_) | Definition and treatment of items of use.                                                                                                     |
| `PRO` | Property (real estate)          | Residence, land, rental, appreciation, financing.                                                                                             |
| `INV` | Investments                     | Shares, funds, gains, losses, digital assets.                                                                                                 |
| `LIA` | Liabilities                     | Debts and their effect on the surplus.                                                                                                        |
| `BUS` | Business assets                 | Capital, stock, equipment, partnerships, receivables.                                                                                         |
| `FTK` | First-time Khums                | Initial assessment of existing wealth.                                                                                                        |
| `MIS` | Missed / irregular years        | Past unpaid years, valuation, settlement.                                                                                                     |
| `CTQ` | Continued taqlid                | Separate religious research topic: each relevant Marja's or office's official position, conditions and differences. Required for the M2 exit. |

### 3.2 Adjacent topics (logged, researched only where a required topic depends on them)

Gifts and inheritance, gold/silver and jewellery, mixed lawful/unlawful wealth, minors' wealth,
_mahr_, currency conversion and valuation, payment recipients and the division of Khums, need for
permission (_ijazah_) to spend or defer. (Continued taqlid is now its own required topic, `CTQ`.) These are listed in
the matrix as `ADJ-*` questions so they are not lost, but they are not required for the M2 exit.

### 3.3 Out of scope for Step 2

Formulas, calculator design, UI copy, executable rule data, and any statement presented to end
users. Fatwa interpretation beyond recording the source and flagging ambiguity.

## 4. Initial-release scope and the consultation fallback

### 4.1 Selection criteria (D1)

The owner selects the launch set. Research does not start on a Marja until they are selected.

| Criterion                         | Evidence required                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status evidence                   | To start research: evidence confidence `OFFICIAL_EVIDENCE` (human verification may still be pending). To list in production: human verification `VERIFIED` (release policy below). |
| Following among target users      | Owner/community input (first audiences: diaspora communities, South Asia, Iraq, Iran, Gulf, Lebanon). Not estimated by us.                                                         |
| Official Khums material available | Official risalah Khums chapter and/or official istifta' section reachable online.                                                                                                  |
| Language coverage                 | Official English (or target-language) version available; otherwise translation burden noted.                                                                                       |
| Reviewer access                   | A qualified reviewer or the Marja's office/representative can be contacted to review findings.                                                                                     |
| Ongoing maintenance               | Office publishes updates (new editions/istifta'at) we can monitor.                                                                                                                 |

### 4.2 Recommendation: Sistani as the first implementation candidate

Of the candidates in the present inventory, only Sayyid al-Sistani has both of these:

- living status supported by a located statement from his own office (human verification pending);
- accessible official English Khums material (the risalah Khums chapter, a Khums Q&A category and a
  question-submission route).

**Recommend:** research and implement Sistani first, end to end through all four layers. This
proves the pipeline before more Maraje are added.

This recommendation is **not** a statement that Sistani is the only living Marja, or the only one
the platform will support. It reflects evidence availability in this inventory only.

### 4.3 Multi-Marja guarantees

- The architecture, schemas and UI stay multi-Marja from day one. Marja is always an explicit
  user choice. There is no implicit default.
- No Marja's findings, rulings or rules are reused for another Marja.
- Followers of other Maraje, including deceased Maraje, are **never** migrated to Sistani's (or
  anyone's) rulings by the application.
- Further Maraje follow the same pipeline as soon as their status evidence and sources are ready.
  Historical sources of deceased Maraje stay preserved for possible historical rule packs, subject
  to `CTQ` research and reviewer approval.

### 4.4 Release evidence policy (summary)

Each capability has its own gate. The canonical definition is
[RULE_PACK_STRUCTURE.md §3.3](RULE_PACK_STRUCTURE.md#33-release-evidence-policy).

- **Marja directory visibility:** requires a human-verified lifecycle status.
- **Historical ruling archive:** requires human-verified sources (and approved findings for
  anything displayed).
- **Calculation availability:** requires an independently reviewed and approved rule pack.
- A verified Marja identity or status **does not** imply that their rulings are approved for
  calculation.

### 4.5 Consultation fallback (design requirement for the product; not a ruling)

The application must offer a respectful, non-calculating path whenever it cannot or must not
compute. In these cases:

| Situation                                                                    | Behaviour                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The user's Marja is not supported yet                                        | Say so plainly. Do **not** offer another Marja's calculation as a substitute. Show the official office channels from the source inventory. Offer general, sourced educational content clearly labelled as not specific to their Marja. |
| The user follows, or is unsure whether they may follow, a deceased Marja     | Show the researched `CTQ` positions with citations and the consultation pathway. Never decide eligibility. Record the user's own declaration.                                                                                          |
| A consultation stop in the rule pack (ambiguous, silent or referred matters) | Show no figure for the affected part. Explain that individual guidance is needed. Link to the Marja's official question channel.                                                                                                       |
| The user is unsure about their own facts (unknown amounts, past records)     | Same pathway. Optionally let the user export a private, locally generated summary of their own inputs to share with the office.                                                                                                        |

Consultation contacts come only from official channels recorded in the source inventory. The app
never forwards user data to an office itself. Anything shared is exported by the user.

## 5. Method

### Phase A — Source inventory & selection (gate: owner approves launch set)

1. Verify each candidate's status and official channels (done as a first pass in the inventory;
   every item marked VERIFIED/UNVERIFIED).
2. Identify the canonical edition of the risalah per language, the Khums chapter range, and the
   official istifta' section.
3. Archive each source page (web archive snapshot + local PDF/HTML snapshot with SHA-256) and record
   access dates.
4. Owner selects the launch Maraje.

### Phase B — Extraction (per selected Marja, per topic)

1. Researcher R1 works through the matrix questions for one Marja, recording **findings** with the
   [finding template](templates/finding.template.md): verbatim original text, locator, archive
   reference, status `EXTRACTED`.
2. Where the source does not address a question, record `SOURCE_SILENT` with the sections searched.
3. Where text admits more than one reading, record `AMBIGUOUS` with the competing readings stated as
   _questions_, not answers.
4. Translations (if needed) are drafted and marked `TRANSLATION_PENDING` until a qualified
   translator reviews them.

### Phase C — Verification

1. Researcher R2 (different person, competent in the source language) re-locates each citation in
   the archived source and confirms text and locator → `RESEARCHER_VERIFIED`, or returns it.
2. Findings that cannot be verified stay at their current status with the reason recorded.

### Phase D — Comparison & consultation register

1. For each question, the comparison table links each Marja's finding IDs. The researcher proposes
   a difference classification (matrix §5); the scholar reviewer confirms it.
2. Every `AMBIGUOUS`, `CONFLICTING_SOURCES`, `SOURCE_SILENT` (where the app would need an answer) and
   every case the source itself refers to the Marja/representative is entered in the consultation
   register (matrix §6).
3. Open questions are batched into an [office query](templates/office-query.template.md) to the
   Marja's office or authorized representative. Written answers become new sources (Tier 3).

### Phase E — Scholarly review & approval

Per [REVIEW_PROCESS.md](REVIEW_PROCESS.md): scholar review → approval → findings frozen as an
approved research baseline per Marja (versioned). Only approved findings may later be encoded.

## 6. Status vocabulary

| Status                  | Meaning                                                                                                 | Who may set it      |
| ----------------------- | ------------------------------------------------------------------------------------------------------- | ------------------- |
| `NOT_STARTED`           | No research yet.                                                                                        | —                   |
| `SOURCE_LOCATED`        | Relevant section identified, text not yet extracted.                                                    | R1                  |
| `EXTRACTED`             | Verbatim text + locator recorded. **Unverified.**                                                       | R1                  |
| `TRANSLATION_PENDING`   | Extracted; translation not yet reviewed.                                                                | R1                  |
| `SOURCE_SILENT`         | Searched sections listed; source does not address the question.                                         | R1, confirmed by R2 |
| `AMBIGUOUS`             | Text supports more than one reading; readings listed as questions.                                      | R1/R2/Scholar       |
| `CONFLICTING_SOURCES`   | Two sources of the same Marja appear to differ (e.g. risalah vs later istifta').                        | R1/R2               |
| `RESEARCHER_VERIFIED`   | Second researcher confirmed text and locator.                                                           | R2                  |
| `REQUIRES_CONSULTATION` | Source refers the matter to the Marja/representative, or reviewer judges individual guidance necessary. | R1/R2/Scholar       |
| `SCHOLAR_REVIEWED`      | Qualified reviewer confirmed the reading (and difference classification).                               | Scholar reviewer    |
| `APPROVED`              | Accepted into the approved research baseline for that Marja.                                            | Approver            |
| `SUPERSEDED`            | Replaced by a newer source/edition/istifta'; kept for history.                                          | Approver            |

## 7. Roles needed (to be staffed by the owner)

| Role                | Responsibility                                                        | Requirement                                                                              |
| ------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Research lead       | Plans work, maintains matrix integrity.                               | Familiar with fiqh terminology; not the approver.                                        |
| Researcher (R1)     | Extraction.                                                           | Reads the source language (Arabic/Persian/Urdu as needed).                               |
| Verifier (R2)       | Independent re-check.                                                 | Different person from R1, same language competence.                                      |
| Translator          | Reviews translations.                                                 | Qualified in the language pair; credited.                                                |
| Scholar reviewer    | Confirms readings, classifications, consultation flags.               | Qualified scholar; ideally linked to the Marja's office or an authorized representative. |
| Approver            | Final sign-off per Marja baseline.                                    | Designated by the owner; never the author of the findings.                               |
| Engineering liaison | Keeps findings structured for later encoding; **does not interpret**. | —                                                                                        |

## 8. Exit criteria for Step 2 (Milestone 2)

- Launch Maraje selected by the owner and recorded.
- Marja lifecycle register human-verified for each launch Marja and for every deceased Marja whose
  followers the release addresses (evidence confidence `OFFICIAL_EVIDENCE` and human verification
  `VERIFIED`, evidence archived).
- `CTQ` questions researched for each launch Marja (and for relevant deceased Maraje' offices),
  with conditions and differences recorded and scholar-reviewed.
- Source inventory complete for each: canonical editions, chapter ranges, istifta' sections,
  archived snapshots — all VERIFIED.
- Every required matrix question (`INC`…`MIS`) has a status other than `NOT_STARTED` for each launch
  Marja, and all `EXTRACTED` findings have reached at least `RESEARCHER_VERIFIED`.
- Comparison tables populated with scholar-confirmed difference classifications.
- Consultation register reviewed by the scholar reviewer; office queries sent and responses filed
  (or explicitly marked outstanding).
- Rule-pack data structure (D6) and review process (D7) approved by the owner and scholar reviewer.
- Signed review records for each Marja baseline.

## 9. Risks

| Risk                                             | Mitigation                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Translation changes meaning                      | Verbatim original is canonical; translations attributed and reviewed.                      |
| Online text differs from printed edition         | Record edition; prefer office-published PDF; archive snapshots with hashes.                |
| Rulings updated after research                   | Monitoring list per Marja; re-review triggers ([REVIEW_PROCESS.md §6](REVIEW_PROCESS.md)). |
| Reviewer unavailable                             | Research can proceed to `RESEARCHER_VERIFIED`; nothing ships without approval.             |
| Pressure to "fill gaps" for product completeness | Gaps become consultation flags in the product, not guessed rules.                          |
| Marja passes away during the project             | Continued-taqlid policy question goes to reviewers; rule sets are versioned.               |
