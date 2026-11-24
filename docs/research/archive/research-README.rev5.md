# Step 2 — Religious Rules Research (index)

> **Nothing in this folder is a religious ruling.** It holds the plan, structure and evidence
> inventory for researching rulings. No religious interpretation has been made, and no Khums
> formulas, rule packs or application code exist for rulings. **Phase A (human verification) and
> Phase B (the 70-question research matrix) have not started** and will not start until the
> required human reviewers are named.
>
> **Documentation revision 5 (2026-11-22, M5.1):** initial Marjas **Sistani and Khamenei**, researched
> and implemented independently; scholar authority and self-approval; Khamenei historical rulings;
> Arabic/Persian research with English/Urdu translations; corrected question count (70); proposed
> matrix amendments pending approval. Revision 4 of this file is preserved byte-for-byte in
> [archive/research-README.rev4.md](archive/research-README.rev4.md).

## Freeze

**The Step 2 research documentation is FROZEN as of 2026-11-20 (revision 4).**

- Any change to a frozen document requires project-owner approval, recorded in the decision log
  below, plus a revision entry in the affected document (for the inventory, a new row in its
  history log, §7).
- Frozen means the **structure, rules and process** are fixed. During Phase A and Phase B,
  researchers will _append_ records as the review process allows: evidence items, access attempts,
  verification records, findings. Nothing already recorded is overwritten.
- Git history preserves every earlier revision. Owner-approved amendments create a **new
  revision**; the superseded revision is kept byte-for-byte in [archive/](archive/).

## Approvals

| Date       | Approved by   | What                                                                                                                                                                                                                                                                                              |
| ---------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-19 | Project owner | Four-layer separation: Sources → Findings → Approved rulings → Executable rule packs                                                                                                                                                                                                              |
| 2026-11-20 | Project owner | Revision 2 documentation approved in principle, subject to the revision 3 adjustments                                                                                                                                                                                                             |
| 2026-11-20 | Project owner | Revision 3 approved in principle, subject to adding source-access status; documentation to be frozen                                                                                                                                                                                              |
| 2026-11-20 | Project owner | Step 3 engine approved. `RULE_PACK_STRUCTURE.md` revision 5 approved: provisional, non-authoritative vocabulary (§5.6) and future requirements FR-1…FR-5 (§9). Revision 4 archived unchanged                                                                                                      |
| 2026-11-20 | Project owner | M4.4.1 requested: `RULE_PACK_STRUCTURE.md` revision 6 adds the provisional fact-mapping structure (§5.7, pack `schemaVersion` 2). Revision 5 archived unchanged. Pending review                                                                                                                   |
| 2026-11-20 | Project owner | M4.4.2 requested: `RULE_PACK_STRUCTURE.md` revision 7 adds content integrity (§5.8, FR-1). Revision 6 archived unchanged. Pending review                                                                                                                                                          |
| 2026-11-20 | Project owner | M4.4.3 requested: `RULE_PACK_STRUCTURE.md` revision 8 adds the governance ledger (§5.9). Revision 7 archived unchanged. Pending review                                                                                                                                                            |
| 2026-11-22 | Project owner | M5.1 decisions (decision log below): documentation revision 5 of `README`, `RESEARCH_MATRIX` (rev 5), `RESEARCH_PLAN` (rev 3), `REVIEW_PROCESS`, `SOURCE_INVENTORY` (rev 5), `RULE_PACK_STRUCTURE` (rev 11) and the templates; superseded revisions archived with SHA-256 in [archive/](archive/) |

## Final documentation status (revision 4, frozen)

| Document                                                                               | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Status                                           |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| _Revision 5 (2026-11-22)_                                                              | **M5:** initial Marjas Sistani and Khamenei; [RESEARCH_PLAN.md §10](RESEARCH_PLAN.md) (scope, languages, Khamenei historical rulings, execution plan); [REVIEW_PROCESS.md §13–§15](REVIEW_PROCESS.md) (scholar authority and self-approval, translations, deceased-Marja historical rulings); [RESEARCH_MATRIX.md](RESEARCH_MATRIX.md) rev 5 (70 questions, §8 proposals pending approval, §9 Khamenei); [SOURCE_INVENTORY.md §8](SOURCE_INVENTORY.md) (access log, attribution); [RULE_PACK_STRUCTURE.md §5.11](RULE_PACK_STRUCTURE.md) (governance requirements G1–G13); [templates/source-verification.template.md](templates/source-verification.template.md) (new) | Owner-approved decisions · no research recorded  |
| [RESEARCH_PLAN.md](RESEARCH_PLAN.md)                                                   | Research rules (evidence quality incl. source-access status; machine summaries never sources; lifecycle ≠ applicability); scope (11 topics + `CTQ`); Sistani as first candidate; multi-Marja guarantees; release-policy summary; consultation fallback; method; statuses; roles; exit criteria                                                                                                                                                                                                                                                                                                                                                                          | Approved in principle · frozen                   |
| [SOURCE_INVENTORY.md](SOURCE_INVENTORY.md)                                             | Source tiers and classes. Four **separate** dimensions: source class, **source-access status**, item assessment / evidence confidence, human verification. Lifecycle register with counted items; evidence items with IDs; ruling-source URLs with access status; open issues; append-only history H1–H13                                                                                                                                                                                                                                                                                                                                                               | Revision 4 · frozen · no item human-verified yet |
| [RESEARCH_MATRIX.md](RESEARCH_MATRIX.md)                                               | 70 required neutral questions (62 across 11 topics + 8 `CTQ`; corrected in rev 5 from "71 (63 + 8)") and 5 adjacent; difference classes; consultation register                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Template · frozen · all `NOT_STARTED`            |
| [RULE_PACK_STRUCTURE.md](RULE_PACK_STRUCTURE.md)                                       | Four layers and CI invariants; Marja registry (lifecycle separate from applicability; evidence item schema with `accessStatus`, `itemAssessment`, `humanVerification` and an access log); release evidence policy (§3.3); record shapes; versioning; **rev 5:** provisional calculation vocabulary (§5.6), future requirements FR-1…FR-5 (§9), revision history (§10); **rev 6:** provisional fact mapping (§5.7); **rev 7:** content integrity (§5.8); **rev 8:** governance (§5.9)                                                                                                                                                                                    | Revision 8 · frozen · rev 4–7 archived           |
| [REVIEW_PROCESS.md](REVIEW_PROCESS.md)                                                 | Roles; gates; evidence-quality and **source-access rules** (§8); lifecycle-change procedure; `CTQ` review; AI policy; preservation of history (§12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Approved in principle · frozen                   |
| [templates/finding.template.md](templates/finding.template.md)                         | Finding record (verbatim text, locator, `sourceAccessStatus`, archive, history)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Ready · frozen                                   |
| [templates/source-verification.template.md](templates/source-verification.template.md) | Source authorship, edition, publication date, authenticity and access (rev 5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Ready                                            |
| [templates/office-query.template.md](templates/office-query.template.md)               | Neutral query to a Marja's office, with permission to cite                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Ready · frozen                                   |
| [findings/](findings/)                                                                 | Per-Marja findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Empty                                            |

### Snapshot of the evidence state (no human verification yet)

| Marja                                                     | Lifecycle (proposed)   | Evidence confidence | Counted items    | Access issues                                                      |
| --------------------------------------------------------- | ---------------------- | ------------------- | ---------------- | ------------------------------------------------------------------ |
| Sistani                                                   | Living                 | `OFFICIAL_EVIDENCE` | E-SIS-1          | —                                                                  |
| Khamenei                                                  | Deceased               | `OFFICIAL_EVIDENCE` | E-KHA-1          | E-KHA-2…6 `NOT_YET_ACCESSED`; khamenei.ir `ACCESS_BLOCKED`         |
| al-Fayyadh                                                | Deceased               | `SINGLE_REPORT`     | E-FAY-2          | **E-FAY-1 `ACCESS_BLOCKED` (not counted)**; E-FAY-3 `INCONCLUSIVE` |
| Wahid Khorasani                                           | Deceased               | `OFFICIAL_EVIDENCE` | E-WAH-1, E-WAH-2 | E-WAH-3 `ACCESS_BLOCKED`                                           |
| Makarem Shirazi, Sadiq Shirazi, Bashir al-Najafi, Sobhani | `PENDING_VERIFICATION` | `NO_EVIDENCE`       | —                | Some sites blocked or not yet accessed                             |

## Human actions required to begin Phase A

> _Revision 5:_ the actions below now apply to **both** initial Marjas. For Khamenei, add:
> human-verify E-KHA-1 and open E-KHA-2…6; locate his historical Khums sources from his own
> office's publications or archived copies of khamenei.ir and complete a
> [source-verification record](templates/source-verification.template.md) for each; establish
> whether any office answers questions on his rulings. Name people with **Persian** as well as
> **Arabic** competence, and qualified English and Urdu translators
> ([RESEARCH_PLAN.md §10.7](RESEARCH_PLAN.md)). Action 2 also covers an official channel for
> Khamenei, if one exists.

Phase A cannot begin until **actions 1–3** are done. Actions 4–8 are the Phase A work itself, and
they need the people from action 1.

1. **Name the reviewers and researchers** and record them in `reviews/REVIEWERS.md` (private
   details may be kept outside the repository):
   - the scholar reviewer(s), with their scope of authority;
   - the approver, who may not author findings;
   - Researcher R1 and Verifier R2, two different people. At least one must read Arabic; Persian is
     needed for some candidates.
2. **Confirm the official channel** to Sayyid al-Sistani's office or an authorized representative
   for office queries.
3. **Decide snapshot storage** (repository vs separate access-controlled storage) so verifiers can
   archive what they read.
4. **Read and archive the counted lifecycle evidence**: E-SIS-1, E-KHA-1, E-WAH-1, E-WAH-2,
   E-FAY-2. Set human verification per item.
5. **Resolve blocked and unread items:**
   - read **E-FAY-1** (sjc.iq, HTTP 403) from another network or through an archived copy, and
     record its title, date and wording;
   - open E-KHA-2…6;
   - retry wahidkhorasani.com, khamenei.ir, shirazi.ir and the alshirazi.org English version;
   - find the leader.ir death announcement.
6. **Confirm Hijri-to-Gregorian conversions:** 6 Jumada al-Akhirah 1448 (E-SIS-1/E-WAH-1) and
   11 Ramadan 1447 (E-KHA-1).
7. **Sistani sources:** open and archive the original-language Khums chapter (Arabic, and
   Persian/Urdu as applicable), the English chapter (confirm edition and ruling ranges), the Khums
   Q&A category and the question-submission page.
8. **Approver signs** each verified lifecycle status in the registry (append-only history).

## Decisions still open (owner)

| #   | Decision                                                                                                                                             | Recommendation                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Approve the extra initial access state `NOT_YET_ACCESSED`, added so unopened URLs are not mislabelled                                                | Approve                                                                                                                  |
| 2   | Confirm Sistani as the first implementation candidate                                                                                                | Confirm                                                                                                                  |
| 3   | `CTQ` scope for the first release                                                                                                                    | Sistani's position first, plus a source search for guidance from the offices of Khamenei, al-Fayyadh and Wahid Khorasani |
| 4   | Rule packs for deceased Maraje in the first release                                                                                                  | Out of scope (sources preserved; directory listing and consultation fallback only)                                       |
| 5   | Historical ruling archive (display only) in the first release                                                                                        | Defer until the Sistani pipeline is proven                                                                               |
| 6   | Release evidence policy ([RULE_PACK_STRUCTURE.md §3.3](RULE_PACK_STRUCTURE.md#33-release-evidence-policy))                                           | Approve as written                                                                                                       |
| 7   | Consultation fallback behaviour ([RESEARCH_PLAN.md §4.5](RESEARCH_PLAN.md#45-consultation-fallback-design-requirement-for-the-product-not-a-ruling)) | Approve the behaviour now; scholars review the wording in M5                                                             |
| 8   | Authorize Phase A once actions 1–3 are complete                                                                                                      | Pending                                                                                                                  |

_Revision 5 status of the decisions above:_ **#2** is superseded by the 2026-11-22 scope decision
(Sistani and Khamenei). **#3** is narrowed: `CTQ` research for Khamenei comes first, and
continued-taqlid decisions stay under scholar authority. **#4** stays **open**: the owner's
Khamenei decision (historical fatwas for the initial implementation) bears on it, but the owner's
item 4 remains unspecified, so no decision is recorded for it. **#1, #5–#8** are unchanged.

**New decisions still open (revision 5):**

| #   | Decision                                                                                                                          | Who                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 9   | Must second-researcher citation verification (R2) be complete before a scholar may approve? (Existing order stands until decided) | Owner               |
| 10  | Approve or reject each proposed matrix amendment ([RESEARCH_MATRIX.md §8](RESEARCH_MATRIX.md))                                    | Owner               |
| 11  | Canonical source language and version for Sistani, and for Khamenei                                                               | Scholar (per Marja) |
| 12  | Urdu translations: from the original text, or from the reviewed English translation                                               | Owner and scholar   |
| 13  | Whether the four out-of-scope Marjas stay in the software's initial governance configuration (a code change, not made)            | Owner               |
| 14  | Name the scholar(s) and their Marja scope, R1/R2 per Marja, translators and the research lead                                     | Owner               |
| 15  | Continued-taqlid presentation wording, and the handling of unresolved Khamenei cases                                              | Scholar             |
| 16  | Owner's item 4 (unspecified)                                                                                                      | Owner               |

**Decision log:** _(record decisions with date and approver; never edit past entries)_

| Date       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Approver      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 2026-11-20 | Development proceeds ahead of scholar review; religious review is the mandatory pre-launch Gate R                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Project owner |
| 2026-11-20 | `RULE_PACK_STRUCTURE.md` revision 5 created (rev 4 archived). The calculation vocabulary is provisional, non-authoritative, does not constrain rulings, and rulings are never altered to fit it                                                                                                                                                                                                                                                                                                                                                                         | Project owner |
| 2026-11-22 | **M5 initial Marjas:** Ayatollah Sayyid Ali al-Sistani and Ayatollah Sayyid Ali Khamenei, researched and implemented independently; the scholar reviews both before any other Marja. The remaining four Marjas are out of scope until both initial implementations are scholar-approved                                                                                                                                                                                                                                                                                 | Project owner |
| 2026-11-22 | **Scholar authority:** accounts assigned to one or more Marjas; within scope a scholar may create, research, edit, review and approve rulings, **including their own**; a second scholar's approval is not mandatory; each assigned Marja managed independently; backend-enforced; every action audited (scholar, Marja, ruling id, version, action, timestamp, decision); SUPER_ADMIN has no automatic religious authority; drafts deletable with audit; approved or published rulings never deleted or silently overwritten (new version, withdrawal or supersession) | Project owner |
| 2026-11-22 | **Khamenei:** the initial implementation uses his authentic, available historical Khums fatwas; authorship, publication date, edition and authenticity established for every ruling; no attribution of successor or current-office publications without verified evidence; continued taqlid under scholar authority; the application never decides eligibility; unresolved cases are consultation-required                                                                                                                                                              | Project owner |
| 2026-11-22 | **Languages:** research in Arabic and Persian; translations in English and Urdu, stored separately with translator, date and verification status; qualified human review; translations never override the original; the canonical source per Marja is a scholar decision                                                                                                                                                                                                                                                                                                | Project owner |
| 2026-11-22 | **Matrix:** required count corrected to 70 (62 + 8); all questions preserved; audit proposals recorded as pending approval; templates extended (original language, canonical text, precaution level, scenario, attribution, R2 verification, unresolved ambiguities, AI involvement)                                                                                                                                                                                                                                                                                    | Project owner |
