# Step 2 — Religious Rules Research (index)

> **Nothing in this folder is a religious ruling.** It holds the plan, structure and evidence
> inventory for researching rulings. No religious interpretation has been made, and no Khums
> formulas, rule packs or application code exist for rulings. **Phase A (human verification) and
> Phase B (the 71-question research matrix) have not started** and will not start until the
> required human reviewers are named.

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

| Date       | Approved by   | What                                                                                                                                                                                         |
| ---------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-19 | Project owner | Four-layer separation: Sources → Findings → Approved rulings → Executable rule packs                                                                                                         |
| 2026-11-20 | Project owner | Revision 2 documentation approved in principle, subject to the revision 3 adjustments                                                                                                        |
| 2026-11-20 | Project owner | Revision 3 approved in principle, subject to adding source-access status; documentation to be frozen                                                                                         |
| 2026-11-20 | Project owner | Step 3 engine approved. `RULE_PACK_STRUCTURE.md` revision 5 approved: provisional, non-authoritative vocabulary (§5.6) and future requirements FR-1…FR-5 (§9). Revision 4 archived unchanged |
| 2026-11-20 | Project owner | M4.4.1 requested: `RULE_PACK_STRUCTURE.md` revision 6 adds the provisional fact-mapping structure (§5.7, pack `schemaVersion` 2). Revision 5 archived unchanged. Pending review              |
| 2026-11-20 | Project owner | M4.4.2 requested: `RULE_PACK_STRUCTURE.md` revision 7 adds content integrity (§5.8, FR-1). Revision 6 archived unchanged. Pending review                                                     |
| 2026-11-20 | Project owner | M4.4.3 requested: `RULE_PACK_STRUCTURE.md` revision 8 adds the governance ledger (§5.9). Revision 7 archived unchanged. Pending review                                                       |

## Final documentation status (revision 4, frozen)

| Document                                                                 | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Status                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| [RESEARCH_PLAN.md](RESEARCH_PLAN.md)                                     | Research rules (evidence quality incl. source-access status; machine summaries never sources; lifecycle ≠ applicability); scope (11 topics + `CTQ`); Sistani as first candidate; multi-Marja guarantees; release-policy summary; consultation fallback; method; statuses; roles; exit criteria                                                                                                                                                                                       | Approved in principle · frozen                   |
| [SOURCE_INVENTORY.md](SOURCE_INVENTORY.md)                               | Source tiers and classes. Four **separate** dimensions: source class, **source-access status**, item assessment / evidence confidence, human verification. Lifecycle register with counted items; evidence items with IDs; ruling-source URLs with access status; open issues; append-only history H1–H13                                                                                                                                                                            | Revision 4 · frozen · no item human-verified yet |
| [RESEARCH_MATRIX.md](RESEARCH_MATRIX.md)                                 | 71 required neutral questions (63 across 11 topics + 8 `CTQ`) and 5 adjacent; difference classes; consultation register                                                                                                                                                                                                                                                                                                                                                              | Template · frozen · all `NOT_STARTED`            |
| [RULE_PACK_STRUCTURE.md](RULE_PACK_STRUCTURE.md)                         | Four layers and CI invariants; Marja registry (lifecycle separate from applicability; evidence item schema with `accessStatus`, `itemAssessment`, `humanVerification` and an access log); release evidence policy (§3.3); record shapes; versioning; **rev 5:** provisional calculation vocabulary (§5.6), future requirements FR-1…FR-5 (§9), revision history (§10); **rev 6:** provisional fact mapping (§5.7); **rev 7:** content integrity (§5.8); **rev 8:** governance (§5.9) | Revision 8 · frozen · rev 4–7 archived           |
| [REVIEW_PROCESS.md](REVIEW_PROCESS.md)                                   | Roles; gates; evidence-quality and **source-access rules** (§8); lifecycle-change procedure; `CTQ` review; AI policy; preservation of history (§12)                                                                                                                                                                                                                                                                                                                                  | Approved in principle · frozen                   |
| [templates/finding.template.md](templates/finding.template.md)           | Finding record (verbatim text, locator, `sourceAccessStatus`, archive, history)                                                                                                                                                                                                                                                                                                                                                                                                      | Ready · frozen                                   |
| [templates/office-query.template.md](templates/office-query.template.md) | Neutral query to a Marja's office, with permission to cite                                                                                                                                                                                                                                                                                                                                                                                                                           | Ready · frozen                                   |
| [findings/](findings/)                                                   | Per-Marja findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Empty                                            |

### Snapshot of the evidence state (no human verification yet)

| Marja                                                     | Lifecycle (proposed)   | Evidence confidence | Counted items    | Access issues                                                      |
| --------------------------------------------------------- | ---------------------- | ------------------- | ---------------- | ------------------------------------------------------------------ |
| Sistani                                                   | Living                 | `OFFICIAL_EVIDENCE` | E-SIS-1          | —                                                                  |
| Khamenei                                                  | Deceased               | `OFFICIAL_EVIDENCE` | E-KHA-1          | E-KHA-2…6 `NOT_YET_ACCESSED`; khamenei.ir `ACCESS_BLOCKED`         |
| al-Fayyadh                                                | Deceased               | `SINGLE_REPORT`     | E-FAY-2          | **E-FAY-1 `ACCESS_BLOCKED` (not counted)**; E-FAY-3 `INCONCLUSIVE` |
| Wahid Khorasani                                           | Deceased               | `OFFICIAL_EVIDENCE` | E-WAH-1, E-WAH-2 | E-WAH-3 `ACCESS_BLOCKED`                                           |
| Makarem Shirazi, Sadiq Shirazi, Bashir al-Najafi, Sobhani | `PENDING_VERIFICATION` | `NO_EVIDENCE`       | —                | Some sites blocked or not yet accessed                             |

## Human actions required to begin Phase A

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

**Decision log:** _(record decisions with date and approver; never edit past entries)_

| Date       | Decision                                                                                                                                                                                        | Approver      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 2026-11-20 | Development proceeds ahead of scholar review; religious review is the mandatory pre-launch Gate R                                                                                               | Project owner |
| 2026-11-20 | `RULE_PACK_STRUCTURE.md` revision 5 created (rev 4 archived). The calculation vocabulary is provisional, non-authoritative, does not constrain rulings, and rulings are never altered to fit it | Project owner |
