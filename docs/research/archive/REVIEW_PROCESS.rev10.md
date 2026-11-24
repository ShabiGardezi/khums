# Scholar / Qualified-Representative Review & Approval Process

> **Status:** Approved in principle; **FROZEN 2026-11-20** (see [README.md](README.md#freeze)).
> **Documentation revision 5 (2026-11-22):** M5 scholar authority and approval policy (§13),
> translations (§14) and historical rulings of a deceased Marja (§15), from the owner's approved
> M5.1 decisions. Revision 4 is preserved byte-for-byte in
> [archive/REVIEW_PROCESS.rev4.md](archive/REVIEW_PROCESS.rev4.md).
> **Documentation revision 6 (2026-11-22): independent scholar ownership (§16).** An authorized
> scholar owns the complete religious-rule lifecycle within their Marja scope. **No second
> researcher (R2) verification and no second-scholar or peer approval is mandatory anywhere in
> this process.** Where any section differs from §16, §16 governs. Revision 5 is preserved
> byte-for-byte in [archive/REVIEW_PROCESS.rev5.md](archive/REVIEW_PROCESS.rev5.md). Complements
> [../RELIGIOUS_RULES.md](../RELIGIOUS_RULES.md) (principles) with the operational procedure for
> Step 2 research and later rule packs.
>
> **Documentation revision 7 (2026-11-23): approval policy (§17).** A rule the authorized scholar
> has source-verified is approved automatically and is available for scholar testing and public
> calculation; there is no separate approval step or production approval gate. Where any section
> differs from §17, §17 governs. Revision 6 is preserved byte-for-byte in
> [archive/REVIEW_PROCESS.rev6.md](archive/REVIEW_PROCESS.rev6.md).
>
> **Documentation revision 8 (2026-11-23): three roles (Phase 2, ARCHITECTURE decision 64).** The
> only staff roles that can be granted are `SUPER_ADMIN` (complete platform access, every Marja)
> and `SCHOLAR` (one or more assigned Marjas, plus read-only research reads and test calculations
> for other Marjas); `USER` is the public calculator user. **SUPER_ADMIN now holds every
> permission, including research, verification and approval, on every Marja** (owner decision;
> the sentences saying SUPER_ADMIN has no religious authority are superseded, §13.1 item 5,
> §13.5, §16.5). Legacy roles stay readable until converted or revoked; `GOVERNING_SCHOLAR` acts
> exactly as `SCHOLAR`. Revision 7 is preserved byte-for-byte in
> [archive/REVIEW_PROCESS.rev7.md](archive/REVIEW_PROCESS.rev7.md).
>
> **Documentation revision 9 (2026-11-24): source verification implemented for builder rules
> (Phase 2 step 5, ARCHITECTURE decisions 67 and 68).** §17.5 now states what the software
> enforces: the source-verification record, its preconditions, the automatic approval and
> publication of builder rules, and what is still not implemented. Revision 8 is preserved
> byte-for-byte in [archive/REVIEW_PROCESS.rev8.md](archive/REVIEW_PROCESS.rev8.md).
>
> **Documentation revision 10 (2026-11-24): live re-check of verified builder rules (§17.5,
> ARCHITECTURE decision 69).** Revision 9 is preserved byte-for-byte in
> [archive/REVIEW_PROCESS.rev9.md](archive/REVIEW_PROCESS.rev9.md).

## 1. Principles

1. The platform records and applies published rulings; it never issues them.
2. Only qualified humans approve. Engineers and AI tools may assist with formatting, search and
   draft translation, but cannot advance a finding beyond `EXTRACTED` or approve anything.
3. **Independent scholar ownership (revision 6, §16).** An authorized scholar may perform the whole
   workflow alone, from locating and verifying sources to approving rules and managing corrections.
   No second researcher and no second scholar is required at any step. _History:_ revision 4
   required four-eyes at every gate (R1 ≠ R2, author ≠ approver); revision 5 allowed scholar
   self-approval but kept R2 citation verification; revision 6 removes R2 as a requirement.
4. **Verification is not removed; it is owned.** Source authenticity, original-text accuracy,
   translation accuracy and correct attribution remain mandatory, and they are the authorized
   scholar's responsibility (§16.2).
5. **Per Marja, per version.** Approval of one Marja's baseline says nothing about another's.
6. Everything is written down: decisions, dissent, the actor, and the scholar's authority and
   scope.

## 2. Roles and qualifications

| Role                          | Who                                                                               | Can                                                                                                                                                                                                       | Cannot                                                     |
| ----------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Authorized scholar**        | Qualified scholar with a staff account assigned authority over one or more Marjas | Within each assigned Marja, the **entire workflow** (§16.1): research, verify sources, extract, review translations, interpret, create and edit findings and rule-pack content, approve, correct, version | Act on a Marja outside the assigned scope                  |
| Research assistant (optional) | Researcher reading the source language, working under an authorized scholar       | Locate sources, draft extractions and records for the scholar                                                                                                                                             | Approve; set any status beyond `EXTRACTED` alone           |
| Second researcher (optional)  | Any qualified person the scholar chooses to ask                                   | Re-check a citation and record the result                                                                                                                                                                 | Act as a required gate                                     |
| Translator (optional)         | Qualified translator for the language pair                                        | Draft or review translations for the scholar                                                                                                                                                              | Change verbatim text; replace the scholar's responsibility |
| Office / representative       | The Marja's office or an authorized representative (_wakil_)                      | Answer written queries (filed as Tier 3 sources)                                                                                                                                                          | —                                                          |

Optional roles help; none of them is ever a mandatory approval or verification step. The
scholar decides whether to use them and stays responsible for the result. Earlier role names
(R1, R2 "Verifier", "Scholar reviewer", "Approver") in older records and archived revisions refer
to these functions; from revision 6 they may all be the same authorized scholar.

The project owner records reviewer identities, affiliations and the scope of their authority in
`docs/research/reviews/REVIEWERS.md` (private details may be kept outside the repository).

## 3. Workflow

```
 Authorized scholar (one person may do every step):
   locate & verify source ─► extract verbatim ─► check translation ─► interpret ─► approve ─► Baseline vN
          ▲                                                                 │
          └────────────── corrections: new version / withdrawal / supersession ◄───┘
                                         │
                                         └─► office query (if unresolved) ─► answer filed as source
```

| Step                | Entry condition                                   | Exit condition (all by the authorized scholar, optionally assisted)                                          |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Source verification | Source located                                    | Authorship, edition, authenticity and access recorded; archive stored (source-verification record)           |
| Extraction          | Verified source                                   | Verbatim text and locator recorded (`EXTRACTED`)                                                             |
| Citation check      | Finding `EXTRACTED`                               | Text re-located in the archived source (`RESEARCHER_VERIFIED`; the scholar may set it for their own finding) |
| Translation review  | Translation drafted                               | Translation marked `REVIEWED` by the scholar (or a qualified translator they rely on)                        |
| Interpretation      | Verified findings                                 | Reading, conditions, exceptions and precaution level recorded; difference classification; consultation flags |
| Office query        | Unresolved ambiguity / silence on a needed case   | Written answer filed as Tier 3 source with permission to cite, or marked outstanding                         |
| Approval            | The scholar is satisfied the baseline is complete | The scholar signs `REVIEW.md`; findings become `APPROVED`; baseline tagged                                   |

## 4. Review record (`docs/research/reviews/<marja-id>/<baseline>.REVIEW.md`)

Must contain: baseline ID and scope (question IDs covered); list of finding IDs and their final
statuses; the authorized scholar (and any optional assistants) with roles and dates; decisions on
each `AMBIGUOUS`/`CONFLICTING_SOURCES` item; consultation register entries confirmed; outstanding
office queries; dissent, if any (verbatim, with author) and how it was handled; the scholar's
approval signature line and date. One signature by the authorized scholar is sufficient.

## 5. Disagreements

- On text or locator (when an optional second person raised it) → resolved by re-reading the
  archived source; the authorized scholar decides.
- On the meaning of a ruling → the authorized scholar decides whether it is resolvable; if not, it is
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
3. The authorized scholar checks the encoded rules and `test-cases.json` (worked examples they
   verified). The scholar may also create and update rule-pack content directly (§16.1).
4. The authorized scholar signs the pack's `REVIEW.md` (self-approval allowed); CI enforces the invariants in
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
3. A machine-generated summary of a page is never evidence and never quoted. Verification means a
   human (the authorized scholar, or a person they rely on) re-read the **original** page, or the
   archived copy of it.
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
7. An item may be set to `VERIFIED` (by the authorized scholar for that Marja) only if its access
   status is `READABLE` or `ARCHIVED_COPY_AVAILABLE`, and the archive copy and hash are stored.
8. Every access attempt is logged with its date and outcome, including failures (append-only).

## 9. Marja lifecycle changes (living ↔ deceased, verification of pending candidates)

| Step | Who                                                 | Action                                                                                                                                                                                                      |
| ---- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Authorized scholar for that Marja (or an assistant) | Records evidence items with their classes; proposes the status and confidence.                                                                                                                              |
| 2    | Authorized scholar for that Marja                   | Re-reads each original page, archives it, signs the registry change → `humanVerification: VERIFIED`. Verified `DECEASED` requires human-verified `OFFICE_OWN`, `OFFICE_OTHER` or `STATE_OFFICIAL` evidence. |
| 3    | Authorized scholar for that Marja                   | Opens a `CTQ` review for that Marja's followers. Confirms that no sources, findings or packs were deactivated.                                                                                              |
| 4    | Product (later)                                     | Shows affected users a neutral notice with the source, the researched `CTQ` positions and the consultation pathway. **No automatic switch of Marja.**                                                       |

_Revision 6:_ one authorized scholar may perform every step; earlier revisions assigned steps to
R1, R2, an approver and the research lead.

Evidence confidence and human verification are separate fields and are never merged. Until
step 2, a status is shown as reported, never as verified, and the Marja is not listed in the
production directory. Verification of status grants directory visibility only. It does not
approve rulings for display or calculation
([RULE_PACK_STRUCTURE.md §3.3](RULE_PACK_STRUCTURE.md#33-release-evidence-policy)).

## 10. Reviewing continued-taqlid (`CTQ`) findings

- Each Marja's position is reviewed as that Marja's own. Positions are never merged into a
  "general" rule.
- The authorized scholar for that Marja confirms the conditions recorded verbatim, and the
  difference classification between Maraje.
- The authorized scholar also approves the **user-facing presentation** of `CTQ` positions. It must inform, not
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
   supersedes the old one, with the reason recorded. (Since revision 6 the scholar may set
   `RESEARCHER_VERIFIED` on their own finding; the immutability rule is unchanged.)
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
5. ~~**SUPER_ADMIN** manages platform accounts and permissions only. It never receives religious
   authority automatically, cannot approve rulings, and cannot grant itself a scholar role
   (self-administration is refused).~~ _Superseded by revision 8 (owner decision 2026-11-23,
   decision 64):_ **SUPER_ADMIN** has complete platform access, including research, source
   verification and approval for every Marja. It still cannot administer its own account or
   roles (self-administration is refused), and the last SUPER_ADMIN cannot be removed.
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
- **Citation verification** of text and locator is still recorded for every finding. _Revision 6
  (owner decision 2026-11-22, resolving open decision #9):_ it is performed by the authorized
  scholar; an independent second researcher (R2) is **not** required (§16).
- **AI policy** (§11): AI never authors, completes or approves ruling content.
- **Preservation of history** (§12) and every rule-pack integrity, governance and audit safeguard.

### 13.5 How the existing software maps to this policy (for reference; no change made)

- Pack-level governance already has a per-Marja policy `SINGLE_SCHOLAR_V1`: one in-scope
  `SCHOLAR` (or legacy `GOVERNING_SCHOLAR`) may review and approve their own submission. The initial configuration
  assigns it to `sistani` and `khamenei` (development settings, `initial-governance-policies.ts`).
  Changing a Marja's policy needs two administrators. That is a **platform administration**
  control over configuration, not a religious approval: it never applies to researching, editing
  or approving rules. Under `INDEPENDENT_REVIEW_V1` a second person would be required, so the
  in-scope Marjas stay on `SINGLE_SCHOLAR_V1` (§16.5).
- Staff roles carry Marja scopes, and the API authorizes every governance and provisional action
  against them. _Revision 8:_ SUPER_ADMIN holds every permission on every Marja; a `SCHOLAR`
  (formerly `GOVERNING_SCHOLAR`, which still acts identically) holds the full permissions for its
  assigned Marjas and read-only research reads and test calculations for other Marjas.
- **Not yet implemented:** a rulings layer (Layer 3) with its own versions, draft deletion and
  per-ruling audit records (§13.2–§13.3). These are requirements for a later implementation
  milestone ([RULE_PACK_STRUCTURE.md §5.11](RULE_PACK_STRUCTURE.md)).

## 14. Translations (documentation revision 5)

1. **Primary research languages:** Arabic and Persian. **Translation languages:** English and
   Urdu.
2. The **original source text** is preserved exactly, with its source location and edition
   details. It is canonical.
3. English and Urdu translations are stored **separately** from the original, each with its
   translator, translation date and verification status (`PENDING` → `REVIEWED` by the authorized
   scholar, or by a qualified human translator the scholar relies on, the scholar remaining
   responsible; `DISPUTED` with the reason).
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

## 16. Independent scholar ownership (documentation revision 6, owner decision 2026-11-22)

### 16.1 The authorized scholar owns the complete lifecycle

Within their assigned Marja scope, an authorized scholar is responsible for, and may perform alone:

1. researching religious rulings;
2. identifying and verifying authoritative original sources;
3. checking original-language text and source references;
4. reviewing translations and their accuracy;
5. interpreting the ruling, including conditions, exceptions and precaution levels;
6. creating and editing findings;
7. creating and updating rule-pack content;
8. reviewing and approving their own religious rules;
9. managing subsequent corrections and new versions.

### 16.2 No mandatory second person; verification stays mandatory

- **No independent second researcher (R2) verification is mandatory.**
- **No second-scholar or peer approval is mandatory.**
- The authorized scholar may perform the entire workflow independently and approve their own
  research and rule additions.
- No document, template, workflow, status or configuration may reintroduce a second-person
  requirement for religious-rule work. Optional checks by another person may be recorded, never
  required.
- **Removing R2 is not removing verification.** Source authenticity, original-text accuracy,
  translation accuracy and correct attribution remain required for every finding and rule, and
  they are the authorized scholar's responsibility. Evidence rules (§8), the source-verification
  record, the deceased-Marja attribution rules (§15) and the AI policy (§11) apply unchanged.

### 16.3 Terminology across the research documents

Wherever the research documents (including the matrix, the plan, the rule-pack structure and
archived revisions) say "scholar reviewer", "reviewer", "approver" or "verifier" for religious-rule
work, it means **the authorized scholar for that Marja**, who may be the same person who did the
research. These words never imply that a second person is required.

### 16.4 Scope

- A scholar may be authorized for one Marja or several.
- The scholar manages and approves rules **only** within the assigned scope, and manages each
  authorized Marja independently.
- No scholar can edit or approve another Marja's rules without that Marja's authorization.

### 16.5 Governance and audit (unchanged)

- Every creation, edit, review, approval and lifecycle action is auditable; records identify the
  actor, Marja, rule or pack version, action, timestamp and decision (§13.2).
- Approved and published versions are immutable; corrections create new versions, withdrawals or
  supersessions, never silent overwrites (§13.3).
- ~~SUPER_ADMIN keeps platform administration authority and never receives religious authority
  automatically (§13.1).~~ _Revision 8:_ SUPER_ADMIN has complete platform access, including
  religious-content permissions on every Marja (§13.1 item 5).
- Role-based authorization and backend enforcement stay as they are. In the existing software the
  relaxed rules apply to a scholar holding the `SCHOLAR` role (or the legacy `GOVERNING_SCHOLAR`) for the Marja under the
  Marja's `SINGLE_SCHOLAR_V1` policy; the in-scope Marjas (`sistani`, `khamenei`) are configured
  with it. Platform administration (accounts, roles, policy configuration) is separate from
  religious-rule work and keeps its own controls.

## 17. Approval policy (documentation revision 7, owner decision 2026-11-23)

ARCHITECTURE §11 #63. Supersedes the separate approval stage and any separate production approval
gate wherever §3, §7, §13 or §16 describe them; everything else in those sections stands.

### 17.1 Source verification is the approval

- A rule is **source-verified** when the authorized scholar for its Marja (§16) has verified its
  sources (authenticity and edition), original-language text, translation and attribution, and
  recorded that verification in the source-verification record and the rule's audit trail (§12,
  §13.2).
- A source-verified rule is **approved automatically**. No further approval step is required.
- Source verification is per rule and per version: a change to a rule's content creates a new
  version that must be source-verified again before it is used.

### 17.2 Availability

- Source-verified rules are available for **scholar testing and public calculation**. There is no
  separate production approval gate.
- Rules without adequate source verification stay **`UNVERIFIED`**: provisional, served only to
  authorized staff in the scholar-review state, and never used for public calculation. A pack used
  for public calculation contains only source-verified rules.

### 17.3 Scholar permissions and audit (unchanged)

- Scholars improve rules **only within their assigned Marja permissions** (§16.4); no scholar edits
  another Marja's rules.
- Every creation, edit, verification and lifecycle action is audited (§13.2); published versions
  are immutable and corrections create new versions (§13.3).

### 17.4 AI

- AI never makes a rule source-verified and never approves. Automated checks of locators or quotes
  help the scholar but are not source verification (§11). AI transcriptions (CLAUDE.md rule 1)
  stay `UNVERIFIED` until the authorized scholar verifies them.

### 17.5 Implementation status

_Revision 9 (2026-11-24; ARCHITECTURE §11 #67, #68)._ Implemented for rules entered in the
scholar rule builder:

- **Source-verification record.** A verification is recorded for ONE builder rule revision, in the
  append-only `ruleVerificationRecords` collection with its audit event, by a SCHOLAR assigned to
  the Marja (or the legacy `GOVERNING_SCHOLAR`) or a SUPER_ADMIN — never by AI, automated tests or
  a system actor (permission `builder.rule.verify`). It holds the four attestations of §17.1
  (sources authentic and correctly cited; original text matches; translation accurate;
  attribution to this Marja correct), each explicitly confirmed, optional notes, the actor, time
  and reason. It binds the rule id, revision and content hash and the ruling content it was made
  against: a later revision or a changed ruling is unverified until verified again (§17.1).
- **Preconditions** (refused with stable codes otherwise): the revision is complete and needs no
  developer implementation; its ruling exists for the Marja and is current; every cited source and
  passage, and every passage, translation and source the ruling relies on, is `VERIFIED` in the
  research lifecycle (translations `REVIEWED`).
- **Automatic approval and availability (§17.2).** Recording the verification approves that
  revision: the server builds a new `PRODUCTION` version of the Marja's builder rules containing
  only source-verified rules — every other rule becomes a review stop and can never produce a
  public figure — and runs the existing governance ledger automatically, with the verifier as the
  actor of every record, under the policy `SOURCE_VERIFIED_AUTO_V1`. The technical checks remain:
  schema validation, sealing and digest binding, version immutability, rule status and sources,
  publication and activation, readiness, tests. Old versions stay; a correction is a new revision,
  verified again, published as a new version. Withdrawal uses the existing ledger commands.
- **Public calculator.** It serves the active builder version automatically; the governance ledger
  (which names staff) is never sent to the public. Unverified rules remain testable by staff only
  (provisional).

Still not implemented: hand-built packs (the code-built scholar-review packs) are not covered —
they keep the earlier governance workflow and stay staff-only; builder capabilities marked
Developer Implementation Required (thresholds, dates, valuation, carry-over, currency conversion,
first-time and missed-year workflows) cannot be verified until a developer adds them.

_Revision 10 (2026-11-24; ARCHITECTURE §11 #69)._ **Live re-check.** Every public serve re-checks
the live builder version against current research: if a cited source, passage, translation,
finding or ruling is no longer verified or current (disputed, superseded, withdrawn, deleted or
changed), that Marja's verified rules are not served (no figures; no older version is served
instead) and staff see the rule as suspended with the reason until it is corrected and verified
again. Verification also requires the ruling's findings to be VERIFIED or APPROVED (a DRAFT or
retired finding blocks it).
