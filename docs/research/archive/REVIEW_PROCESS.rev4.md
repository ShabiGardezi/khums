# Scholar / Qualified-Representative Review & Approval Process

> **Status:** Approved in principle; **FROZEN 2026-11-20** (see [README.md](README.md#freeze)). Complements
> [../RELIGIOUS_RULES.md](../RELIGIOUS_RULES.md) (principles) with the operational procedure for
> Step 2 research and later rule packs.

## 1. Principles

1. The platform records and applies published rulings; it never issues them.
2. Only qualified humans approve. Engineers and AI tools may assist with formatting, search and
   draft translation, but cannot advance a finding beyond `EXTRACTED` or approve anything.
3. **Four-eyes at every gate:** the person who extracts is never the person who verifies; the
   person who authors findings is never the approver.
4. **Per Marja, per version.** Approval of one Marja's baseline says nothing about another's.
5. Everything is written down: decisions, dissent, and the reviewer's qualifications/role.

## 2. Roles and qualifications

| Role                    | Who                                                                                 | Can                                                                                   | Cannot                             |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| Researcher (R1)         | Trained researcher reading the source language                                      | Create findings (`EXTRACTED`, `SOURCE_SILENT`, `AMBIGUOUS`)                           | Verify own findings                |
| Verifier (R2)           | Second researcher, same language competence                                         | Set `RESEARCHER_VERIFIED`, return findings                                            | Verify findings they authored      |
| Translator              | Qualified translator for the language pair                                          | Mark translations `REVIEWED`                                                          | Change verbatim text               |
| Scholar reviewer        | Qualified scholar; preferably authorized by, or in contact with, the Marja's office | Confirm readings, difference classifications, consultation flags (`SCHOLAR_REVIEWED`) | Approve their own authored content |
| Office / representative | The Marja's office or an authorized representative (_wakil_)                        | Answer written queries (filed as Tier 3 sources)                                      | —                                  |
| Approver                | Designated by the project owner for religious content                               | Set `APPROVED`; sign research baselines and rule-pack versions                        | Approve content they authored      |

The project owner records reviewer identities, affiliations and the scope of their authority in
`docs/research/reviews/REVIEWERS.md` (private details may be kept outside the repository).

## 3. Workflow

```
 R1 extract ─► R2 verify ─► (translation review) ─► Scholar review ─► Approver sign-off ─► Baseline vN
     ▲              │                                     │                 │
     └── returned ◄─┴──────────── returned with reasons ◄─┴─────────────────┘
                                         │
                                         └─► office query (if unresolved) ─► answer filed as source ─► re-review
```

| Gate               | Entry condition                                          | Exit condition                                                                                          |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Verification       | Finding `EXTRACTED` with verbatim text, locator, archive | R2 re-located text in archived source; `RESEARCHER_VERIFIED` or returned                                |
| Translation review | Translation drafted                                      | Translator marks `REVIEWED`                                                                             |
| Scholarly review   | All findings for a topic area verified                   | Readings confirmed; difference classifications confirmed; consultation flags set; open questions listed |
| Office query       | Unresolved ambiguity / silence on a needed case          | Written answer filed as Tier 3 source with permission to cite, or marked outstanding                    |
| Approval           | Scholarly review complete for the whole Marja baseline   | Approver signs `REVIEW.md`; findings become `APPROVED`; baseline tagged                                 |

## 4. Review record (`docs/research/reviews/<marja-id>/<baseline>.REVIEW.md`)

Must contain: baseline ID and scope (question IDs covered); list of finding IDs and their final
statuses; reviewers with roles and dates; decisions on each `AMBIGUOUS`/`CONFLICTING_SOURCES`
item; consultation register entries confirmed; outstanding office queries; dissent (verbatim, with
author) and how it was handled; approver signature line and date.

## 5. Disagreements

- Between R1 and R2 on text/locator → resolved by re-reading the archived source; if unresolved,
  escalate to the research lead.
- On the meaning of a ruling → the scholar reviewer decides whether it is resolvable; if not, it is
  sent to the Marja's office and stays `AMBIGUOUS` (and becomes a consultation stop in the product)
  until answered.
- Reviewer vs office answer → the office answer prevails for that Marja and is cited.
- Dissent is recorded, never deleted.

## 6. Re-review triggers

A new review cycle (and new baseline/pack version) is required when:

- the Marja's office publishes a new risalah edition or a relevant new istifta';
- a reviewer or user reports a discrepancy with a source;
- a Marja's lifecycle status changes (§9), which triggers a review of the `CTQ` findings that
  concern them;
- a matrix question is added or changed for a topic already approved;
- an archived source becomes inconsistent with the live official page.

The research lead keeps a monitoring list of official update channels per Marja
(see [SOURCE_INVENTORY.md](SOURCE_INVENTORY.md)).

## 7. Path from approved research to rule packs (Milestone 4 preview)

1. Engineer transcribes approved rulings into `rulings.json` using the scholar-approved wording —
   no rewording.
2. Engineer encodes `rules.json` referencing those rulings; every rule lists its ruling IDs.
3. Scholar reviewer checks the encoded rules and `test-cases.json` (worked examples they verified).
4. Approver signs the pack's `REVIEW.md`; CI enforces the invariants in
   [RULE_PACK_STRUCTURE.md §2](RULE_PACK_STRUCTURE.md#2-the-four-layers); pack is published and
   becomes immutable.

## 8. Evidence-quality rules

1. Evidence is recorded with the fields in
   [SOURCE_INVENTORY.md §1.3](SOURCE_INVENTORY.md#13-required-fields-for-every-evidence-item): exact
   URL, publication date as printed and in Gregorian, original-language title, attributed
   translation, access date, human-verification date and verifier, and archive.
2. Official Marja-office statements (`OFFICE_OWN`, `OFFICE_OTHER`) are never merged with news
   (`NEWS`) or community announcements (`COMMUNITY`). Reviewers see the evidence class on every
   item.
3. A machine-generated summary of a page is never evidence and never quoted. R2 verification
   means a human re-read the **original** page, or the archived copy of it.
4. Translations never replace the original. If a translation is disputed, the original text
   governs and the dispute is recorded.

5. **Source-access status is a separate field** (`READABLE`, `ACCESS_BLOCKED`, `NOT_FOUND`,
   `ARCHIVED_COPY_AVAILABLE`; initial state `NOT_YET_ACCESSED`). It is never merged with the source
   class, the item assessment, evidence confidence or human verification
   ([SOURCE_INVENTORY.md §1.4](SOURCE_INVENTORY.md#14-source-access-status-per-item)).
6. **Inaccessible content is never evidence.** Items that are `ACCESS_BLOCKED`, `NOT_FOUND` or
   `NOT_YET_ACCESSED` stay `UNASSESSED` and are not counted, even when the owner supplied or
   classified them. Researchers may read a blocked page from another network or through an
   archived copy. Its access status then becomes `READABLE` or `ARCHIVED_COPY_AVAILABLE`, with the
   access log entry recording how it was read.
7. R2 may set an item to `VERIFIED` only if its access status is `READABLE` or
   `ARCHIVED_COPY_AVAILABLE`, and must store the archive copy and hash.
8. Every access attempt is logged with its date and outcome, including failures (append-only).

## 9. Marja lifecycle changes (living ↔ deceased, verification of pending candidates)

| Step | Who             | Action                                                                                                                                                            |
| ---- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Researcher (R1) | Records evidence items with their classes; proposes the status and confidence.                                                                                    |
| 2    | Verifier (R2)   | Re-reads each original page, archives it, and marks `humanVerification: VERIFIED`.                                                                                |
| 3    | Approver        | Signs the registry change → `humanVerification: VERIFIED`. Verified `DECEASED` requires human-verified `OFFICE_OWN`, `OFFICE_OTHER` or `STATE_OFFICIAL` evidence. |
| 4    | Research lead   | Opens a `CTQ` review for that Marja's followers. Confirms that no sources, findings or packs were deactivated.                                                    |
| 5    | Product (later) | Shows affected users a neutral notice with the source, the researched `CTQ` positions and the consultation pathway. **No automatic switch of Marja.**             |

Evidence confidence and human verification are separate fields and are never merged. Until
step 3, a status is shown as reported, never as verified, and the Marja is not listed in the
production directory. Verification of status grants directory visibility only. It does not
approve rulings for display or calculation
([RULE_PACK_STRUCTURE.md §3.3](RULE_PACK_STRUCTURE.md#33-release-evidence-policy)).

## 10. Reviewing continued-taqlid (`CTQ`) findings

- Each Marja's position is reviewed as that Marja's own. Positions are never merged into a
  "general" rule.
- The scholar reviewer confirms the conditions recorded verbatim, and the difference
  classification between Maraje.
- Reviewers also approve the **user-facing presentation** of `CTQ` positions. It must inform, not
  decide eligibility, and must always offer the consultation pathway.

## 11. AI usage policy (research)

Allowed: searching for where a topic appears (results are pointers only, §8), drafting translations (labelled
`machine-draft`, `TRANSLATION_PENDING`), formatting records, consistency checks (e.g. missing
locators). Not allowed: generating ruling text, summarising rulings as answers, choosing between
readings, setting statuses beyond `EXTRACTED`, or filling `SOURCE_SILENT` gaps. Any AI involvement is
noted in the finding's history.

## 12. Preservation of evidence and verification history

1. **Append-only.** Evidence items, findings, registry entries and review records are never
   silently overwritten or deleted.
2. **Evidence items are immutable** once recorded. The only permitted changes are appending a
   verification record or an archive reference. A correction is a new item with
   `supersedes: <old id>`; the old item stays visible and marked superseded.
3. **Findings** are never edited after `RESEARCHER_VERIFIED`. A change creates a new finding that
   supersedes the old one, with the reason recorded.
4. **Status changes** (lifecycle, evidence confidence, human verification, finding status) are
   logged with the previous value preserved verbatim, the new value, the evidence, who made the
   change and who approved it (inventory §7 history log, registry `history`, finding `history`).
5. **Verification history is kept in full.** That includes `DISPUTED` results and the verifier's
   reasons, even after the dispute is resolved.
6. Git history is a backstop, not a substitute: the documents themselves must show the history.
