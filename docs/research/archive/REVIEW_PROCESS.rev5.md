# Scholar / Qualified-Representative Review & Approval Process

> **Status:** Approved in principle; **FROZEN 2026-11-20** (see [README.md](README.md#freeze)).
> **Documentation revision 5 (2026-11-22):** M5 scholar authority and approval policy (§13),
> translations (§14) and historical rulings of a deceased Marja (§15), from the owner's approved
> M5.1 decisions. Where §13 differs from §1–§3 below, §13 governs. Revision 4 is preserved
> byte-for-byte in [archive/REVIEW_PROCESS.rev4.md](archive/REVIEW_PROCESS.rev4.md). Complements
> [../RELIGIOUS_RULES.md](../RELIGIOUS_RULES.md) (principles) with the operational procedure for
> Step 2 research and later rule packs.

## 1. Principles

1. The platform records and applies published rulings; it never issues them.
2. Only qualified humans approve. Engineers and AI tools may assist with formatting, search and
   draft translation, but cannot advance a finding beyond `EXTRACTED` or approve anything.
3. **Citation verification by a second person; approval by an in-scope scholar.** The person who
   extracts a citation is never the person who verifies its text and locator (R1 ≠ R2). _Revision
   5:_ the earlier rule "the person who authors findings is never the approver" no longer applies
   to scholars: a scholar with authority for the Marja may approve their own research and edits,
   and a second scholar's approval is not required (§13). Everyone else stays bound by it.
4. **Per Marja, per version.** Approval of one Marja's baseline says nothing about another's.
5. Everything is written down: decisions, dissent, and the reviewer's qualifications/role.

## 2. Roles and qualifications

| Role                    | Who                                                                                 | Can                                                                                                       | Cannot                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Researcher (R1)         | Trained researcher reading the source language                                      | Create findings (`EXTRACTED`, `SOURCE_SILENT`, `AMBIGUOUS`)                                               | Verify own findings                                                           |
| Verifier (R2)           | Second researcher, same language competence                                         | Set `RESEARCHER_VERIFIED`, return findings                                                                | Verify findings they authored                                                 |
| Translator              | Qualified translator for the language pair                                          | Mark translations `REVIEWED`                                                                              | Change verbatim text                                                          |
| Scholar reviewer        | Qualified scholar; preferably authorized by, or in contact with, the Marja's office | Confirm readings, difference classifications, consultation flags (`SCHOLAR_REVIEWED`)                     | Approve their own authored content                                            |
| Office / representative | The Marja's office or an authorized representative (_wakil_)                        | Answer written queries (filed as Tier 3 sources)                                                          | —                                                                             |
| Approver                | Designated by the project owner for religious content                               | Set `APPROVED`; sign research baselines and rule-pack versions                                            | Approve content they authored (_revision 5: except an in-scope scholar, §13_) |
| Scholar (revision 5)    | Qualified scholar with a staff account assigned authority over one or more Marjas   | Within each assigned Marja: create, research, edit, review and approve rulings, including their own (§13) | Act outside the assigned Marja scope                                          |

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

## 13. Scholar authority and approval policy (documentation revision 5, owner decision 2026-11-22)

Approved by the owner for M5. It applies to the two initial Marjas (§15 and
[RESEARCH_PLAN.md §10](RESEARCH_PLAN.md)) and to any Marja added later.

### 13.1 Authority is per Marja

1. A scholar's staff account is assigned authority over **one or several Marjas**. The assignment
   is the scope; nothing outside it is permitted.
2. Within an assigned Marja, the scholar may **create, research, edit, review and approve**
   rulings.
3. A scholar assigned several Marjas manages **each one independently**: research, decisions,
   approvals and versions of one Marja never carry over to another, and approving one Marja's
   ruling says nothing about another's (§1.4).
4. **Self-approval is allowed.** A scholar may approve their own research and edits. A second
   scholar's approval is **not** mandatory, and no process step may make it so.
5. **SUPER_ADMIN** manages platform accounts and permissions only. It never receives religious
   authority automatically, cannot approve rulings, and cannot grant itself a scholar role
   (self-administration is refused).
6. **Enforced by the backend.** Every create, edit, review, approve, withdraw, supersede and
   delete action is authorized by the API (`apps/api`) against the authenticated session and the
   account's Marja scope. The user interface only reflects permissions; it never grants them.

### 13.2 What every action records

Each action writes an append-only audit record with at least:

| Field     | Content                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------- |
| actor     | the **authenticated** scholar (staff principal id from the session; never a client-supplied value) |
| marjaId   | the Marja the action concerns                                                                      |
| rulingId  | the ruling (or finding / rule-pack) identifier                                                     |
| version   | the version acted on                                                                               |
| action    | e.g. `CREATE`, `EDIT`, `REVIEW`, `APPROVE`, `WITHDRAW`, `SUPERSEDE`, `DELETE_DRAFT`                |
| timestamp | server time, ISO 8601 UTC                                                                          |
| decision  | the outcome (e.g. approved, changes requested, withdrawn) and its reason                           |

Audit records contain identifiers and codes, never financial values or personal data beyond the
opaque principal id (`CLAUDE.md` rule 5).

### 13.3 Drafts, approved and published rulings

1. **Draft rulings** (never approved, never published) may be deleted. The deletion itself is
   audited (§13.2, action `DELETE_DRAFT`, with the reason).
2. **Approved or published rulings are never physically deleted and never silently
   overwritten.** A correction is made only by a **new version**, a **withdrawal** or a
   **supersession**, each recorded with the complete history and the previous version preserved.
3. Content that has been sealed into a submitted, registered or published rule-pack version is
   immutable through that version's integrity digest and ledger, independently of the ruling's
   own status ([RULE_PACK_STRUCTURE.md §5.8–§5.11](RULE_PACK_STRUCTURE.md)).

### 13.4 What stays unchanged

- **Evidence requirements** (§8): verbatim original text, locator, archive and hash, access
  status. Self-approval approves a reading; it never replaces evidence.
- **Citation verification (R2)** of text and locator (§3, Phase C of the research plan) is still
  recorded for every finding. R2 verifies the citation only; it is not a second scholar approval.
  Whether R2 verification must be complete before a scholar may approve is listed as an open
  owner decision in [README.md](README.md#decisions-still-open-owner); until decided, the existing
  order (`RESEARCHER_VERIFIED` before scholarly review) stands.
- **AI policy** (§11): AI never authors, completes or approves ruling content.
- **Preservation of history** (§12) and every rule-pack integrity, governance and audit safeguard.

### 13.5 How the existing software maps to this policy (for reference; no change made)

- Pack-level governance already has a per-Marja policy `SINGLE_SCHOLAR_V1`: one in-scope
  `GOVERNING_SCHOLAR` may review and approve their own submission. The initial configuration
  assigns it to `sistani` and `khamenei` (development settings, `initial-governance-policies.ts`).
  Changing a Marja's policy needs two administrators.
- Staff roles carry Marja scopes, and the API authorizes every governance and provisional action
  against them; SUPER_ADMIN holds no religious permission.
- **Not yet implemented:** a rulings layer (Layer 3) with its own versions, draft deletion and
  per-ruling audit records (§13.2–§13.3). These are requirements for a later implementation
  milestone ([RULE_PACK_STRUCTURE.md §5.11](RULE_PACK_STRUCTURE.md)).

## 14. Translations (documentation revision 5)

1. **Primary research languages:** Arabic and Persian. **Translation languages:** English and
   Urdu.
2. The **original source text** is preserved exactly, with its source location and edition
   details. It is canonical.
3. English and Urdu translations are stored **separately** from the original, each with its
   translator, translation date and verification status (`PENDING` → `REVIEWED` by a qualified
   human translator; `DISPUTED` with the reason).
4. A translation never silently overrides or changes the original. If a translation and the
   original disagree, the original governs and the disagreement is recorded.
5. Machine drafts are labelled `machine-draft` and stay `PENDING` until a qualified human reviews
   them (§11).
6. **Canonical source language and version per Marja** (which language edition governs when
   versions differ) is decided by a scholar with authority for that Marja and recorded in the
   decision log. Until then, no finding records a canonical text as decided.

## 15. Historical rulings of a deceased Marja (documentation revision 5)

Owner decision 2026-11-22: the initial Khamenei implementation uses **authentic, available
historical Khums fatwas issued by Ayatollah Sayyid Ali Khamenei**.

1. For every ruling, research establishes **original authorship, publication date, edition and
   source authenticity**, recorded with the
   [source-verification template](templates/source-verification.template.md).
2. **No successor or current-office attribution without evidence.** Rulings of a successor, and
   publications of an office that now serves someone else, are never attributed to Khamenei unless
   verified evidence shows that they reproduce his historical rulings.
3. His historical rulings are preserved **independently**, never merged with or replaced by
   another Marja's.
4. **Continued-taqlid** eligibility and related religious decisions stay under qualified scholar
   authority (§10). The application never decides whether a user may continue following a
   deceased Marja.
5. Every unresolved case is recorded as **consultation required** (matrix §6) and becomes a
   consultation stop, never a guess.
6. The lifecycle status itself follows §9: until human-verified and signed, it is shown as
   reported, not as verified.
