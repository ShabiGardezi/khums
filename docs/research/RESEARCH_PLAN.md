# Step 2 — Religious Rules Research Plan

> **Status:** Approved in principle; **FROZEN 2026-11-20** (see [README.md](README.md#freeze)). Revision 2 (2026-11-19).
> **Revision 3 (2026-11-22, owner-approved M5.1 decisions):** initial Marjas Sistani and Khamenei
> (§10.1), languages (§10.2), Khamenei historical rulings (§10.3), scholar authority (§10.4) and
> the M5 execution plan (§10.5–§10.8). Where §10 differs from earlier sections, §10 governs.
> Revision 2 is preserved byte-for-byte in [archive/RESEARCH_PLAN.rev2.md](archive/RESEARCH_PLAN.rev2.md).
> **Revision 4 (2026-11-22): independent scholar ownership.** An authorized scholar may perform the
> entire workflow alone; no second researcher (R2) and no second-scholar approval is mandatory
> ([REVIEW_PROCESS.md §16](REVIEW_PROCESS.md)). Source, text, translation and attribution
> verification remain mandatory and are the scholar's responsibility. Revision 3 is preserved
> byte-for-byte in [archive/RESEARCH_PLAN.rev3.md](archive/RESEARCH_PLAN.rev3.md). The four-layer separation
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

> _Revision 3:_ superseded by the owner's M5 scope (§10.1): Sistani **and** Khamenei are the two
> initial Marjas, researched and implemented independently. The text below is kept for history.

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
- **Calculation availability:** requires an approved, published rule pack (revision 4: approved by
  the authorized scholar, who may have authored it; no separate reviewer is required).
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

1. The authorized scholar (optionally assisted) works through the matrix questions for one Marja, recording **findings** with the
   [finding template](templates/finding.template.md): verbatim original text, locator, archive
   reference, status `EXTRACTED`.
2. Where the source does not address a question, record `SOURCE_SILENT` with the sections searched.
3. Where text admits more than one reading, record `AMBIGUOUS` with the competing readings stated as
   _questions_, not answers.
4. Translations (if needed) are drafted and marked `TRANSLATION_PENDING` until the authorized
   scholar (or a qualified translator they rely on) reviews them.

### Phase C — Verification

1. The authorized scholar re-locates each citation in the archived source and confirms text and
   locator → `RESEARCHER_VERIFIED`. _Revision 4:_ a second researcher is optional, never required.
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

| Status                  | Meaning                                                                                                                           | Who may set it                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `NOT_STARTED`           | No research yet.                                                                                                                  | —                                 |
| `SOURCE_LOCATED`        | Relevant section identified, text not yet extracted.                                                                              | Authorized scholar (or assistant) |
| `EXTRACTED`             | Verbatim text + locator recorded. **Unverified.**                                                                                 | Authorized scholar (or assistant) |
| `TRANSLATION_PENDING`   | Extracted; translation not yet reviewed.                                                                                          | Authorized scholar (or assistant) |
| `SOURCE_SILENT`         | Searched sections listed; source does not address the question.                                                                   | Authorized scholar                |
| `AMBIGUOUS`             | Text supports more than one reading; readings listed as questions.                                                                | Authorized scholar (or assistant) |
| `CONFLICTING_SOURCES`   | Two sources of the same Marja appear to differ (e.g. risalah vs later istifta').                                                  | Authorized scholar (or assistant) |
| `RESEARCHER_VERIFIED`   | Text and locator re-checked against the archived source (revision 4: by the authorized scholar; a second researcher is optional). | Authorized scholar                |
| `REQUIRES_CONSULTATION` | Source refers the matter to the Marja/representative, or the scholar judges individual guidance necessary.                        | Authorized scholar                |
| `SCHOLAR_REVIEWED`      | The authorized scholar confirmed the reading (and difference classification).                                                     | Authorized scholar                |
| `APPROVED`              | Accepted into the approved research baseline for that Marja (self-approval allowed).                                              | Authorized scholar                |
| `SUPERSEDED`            | Replaced by a newer source/edition/istifta'; kept for history.                                                                    | Authorized scholar                |

An assistant never sets a status beyond `EXTRACTED` alone, and AI tools never do (§2 rule 4).
_Revision 4:_ earlier "who may set it" values (R1, R2, Approver) are preserved in the archived
revisions.

## 7. Roles needed (to be staffed by the owner)

| Role                          | Responsibility                                                                                                                                                                                                                  | Requirement                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Authorized scholar**        | The complete lifecycle within their Marja scope: research, source verification, extraction, translation review, interpretation, findings, rule-pack content, approval, corrections ([REVIEW_PROCESS.md §16](REVIEW_PROCESS.md)) | Qualified scholar; authority assigned per Marja; reads the source languages (or is assisted) |
| Research lead (optional)      | Plans work, maintains matrix integrity.                                                                                                                                                                                         | Familiar with fiqh terminology; never a required approval step                               |
| Research assistant (optional) | Locates sources and drafts records for the scholar.                                                                                                                                                                             | Reads the source language                                                                    |
| Translator (optional)         | Drafts or reviews translations for the scholar.                                                                                                                                                                                 | Qualified in the language pair; credited                                                     |
| Engineering liaison           | Keeps findings structured for later encoding; **does not interpret**.                                                                                                                                                           | —                                                                                            |

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

## 10. M5 scope and research execution plan (revision 3, owner decisions 2026-11-22)

### 10.1 Initial Marjas

1. Ayatollah Sayyid Ali al-Sistani (`sistani`).
2. Ayatollah Sayyid Ali Khamenei (`khamenei`).

Both are researched and implemented **independently**: separate findings, separate comparison
entries, separate research baselines and separate rule packs. The scholar reviews both
implementations before work on any other Marja begins. **The remaining four Marjas configured in
the software (`makarem-shirazi`, `wahid-khorasani`, `najafi`, `fayyadh`) are out of scope** until
both initial implementations have received scholar approval. (Their inventory entries stay as
recorded; nothing is deleted.)

### 10.2 Languages

- Primary research languages: **Arabic and Persian**. Translation languages: **English and Urdu**.
- Original text is preserved exactly with location and edition; translations are stored
  separately with translator, date and verification status, and require qualified human review
  ([REVIEW_PROCESS.md §14](REVIEW_PROCESS.md)).
- A scholar with authority for the Marja decides its **canonical source language and version**.
  Official English material (for example Sistani's English risalah) is a translation: it may help
  locate text but does not replace the original unless the scholar decides otherwise.

### 10.3 Khamenei: historical rulings

- The initial Khamenei implementation uses **authentic, available historical Khums fatwas issued
  by him** ([REVIEW_PROCESS.md §15](REVIEW_PROCESS.md)).
- **Lifecycle (recorded, not yet human-verified):** the source inventory records him as deceased,
  2026-02-28, with `OFFICIAL_EVIDENCE` (E-KHA-1) and human verification `PENDING`
  ([SOURCE_INVENTORY.md §3.2](SOURCE_INVENTORY.md)).
- **Attribution requirement:** leader.ir now serves the successor's office, and khamenei.ir was
  unreachable from the project's network (inventory §8). Every Khamenei source records authorship,
  publication date and edition, and whether it was published before or after the recorded date of
  death; nothing published by the current office is attributed to him without verified evidence
  that it reproduces his historical rulings.
- **Continued taqlid:** decided only by qualified scholars; the application records the user's
  declaration and never decides eligibility. Unresolved cases are consultation-required.

### 10.4 Scholar authority

Scholars assigned to a Marja may create, research, edit, review and approve rulings in that scope,
including their own; a second scholar's approval is not required
([REVIEW_PROCESS.md §13](REVIEW_PROCESS.md)). _Revision 4:_ the authorized scholar owns the
complete lifecycle and may perform every phase alone, including citation verification; no second
researcher is required ([REVIEW_PROCESS.md §16](REVIEW_PROCESS.md)).

### 10.5 Phases for M5

| Phase | Work                                                                                                                                                                                                                           | Entry condition                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| 0     | Name the authorized scholar(s) and their Marja scope (§10.7); decide snapshot storage; scholar decides each Marja's canonical text; owner decides the proposed matrix amendments ([RESEARCH_MATRIX.md §8](RESEARCH_MATRIX.md)) | Now                                       |
| A     | Source verification per Marja by the authorized scholar (§10.6), with the [source-verification template](templates/source-verification.template.md)                                                                            | Scholar named, snapshot storage decided   |
| B     | Extraction by the authorized scholar (optionally assisted), in the priority order below, per Marja                                                                                                                             | Phase A complete for that Marja's sources |
| C     | Citation verification by the authorized scholar (a second researcher is optional)                                                                                                                                              | Findings `EXTRACTED`                      |
| D     | Comparison (default `UNKNOWN`), consultation register, office queries                                                                                                                                                          | Verified findings                         |
| E     | Approval per Marja by the authorized scholar, self-approval allowed (§10.4)                                                                                                                                                    | Per topic area                            |

Sistani and Khamenei move through the phases independently; one may be ahead of the other.

### 10.6 Phase A tasks (source verification)

**Sistani:** human-verify E-SIS-1; open and archive the Arabic _Minhaj al-Salihin_ (search results
suggest the office lists a corrected 1445 AH edition; not yet opened or verified), the Persian and Urdu Khums chapters, the English "Islamic
Laws" Khums chapter (edition and ruling range), the Khums Q&A category and the question form;
record the official contact channels (question form; affiliated institutions listed by the office).

**Khamenei:** human-verify E-KHA-1 and open E-KHA-2…6; recover his Khums corpus (for example the
Persian and Arabic istifta' collections and the educational treatise: titles and editions to be
established, not assumed) from his own office's publications or archived copies of khamenei.ir
dated before the recorded date of death; check the authorship and edition of every leader.ir item
before any use; establish whether any office answers questions about his rulings after his death
(`CTQ-06`, `CTQ-07`).

### 10.7 People and skills

| Role                                                     | Sistani                                                        | Khamenei                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Authorized scholar (required; may do everything)         | Authority for Sistani; Arabic (primary), Persian               | Authority for Khamenei; Persian (primary), Arabic; continued-taqlid decisions |
| Research assistants (optional)                           | Arabic, Persian                                                | Persian, Arabic                                                               |
| Translators (optional; the scholar reviews)              | Arabic→English, Persian→English, then English or original→Urdu | Persian→English, Arabic→English, then →Urdu                                   |
| Research lead, archivist, engineering liaison (optional) | Shared                                                         | Shared                                                                        |

One scholar may hold authority for both Marjas; each Marja is still handled independently.

### 10.8 Priority order for extraction (per Marja; never assume the same answer for both)

| Priority | Purpose                                                    | Questions                                                                                                                 |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| P0       | Khamenei only: continued taqlid and office status          | CTQ-01…08                                                                                                                 |
| P1       | Annual calculation                                         | INC-01, 02 · EXP-01, 02, 04 · SUR-01, 02, 03, 05, 06 · NEC-01, 02, 03 · SAV-01, 02 · LIA-01, 04 · PRO-01, 02 · BUS-01, 02 |
| P2       | First-time and missed years                                | FTK-01…05 · MIS-01…06 · SUR-07 · SAV-03 · PRO-05 · Sistani CTQ-01…08                                                      |
| P3       | Savings, assets, liabilities, investments, business detail | PRO-03, 04, 06 · INV-01…05 · BUS-03…05 · LIA-02, 03, 05 · NEC-04…06 · SAV-04 · SUR-04                                     |
| P4       | Other income, expenses and adjacent topics                 | INC-03…07 · EXP-03, 05, 06 · ADJ-01…04, 06                                                                                |

Proposed new questions and promotions ([RESEARCH_MATRIX.md §8](RESEARCH_MATRIX.md)) enter this
order only after owner approval.
