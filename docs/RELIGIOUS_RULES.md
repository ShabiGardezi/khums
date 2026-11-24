# Religious Rules Management

> **No religious rulings are defined, approved or implied anywhere in this repository yet.**
> This document describes the _process_ by which rulings may be added. Rule content is produced in
> Step 2 (Religious Research and Rules Specification) and must pass the review below before any
> code uses it.

## 1. Principles

1. **The platform applies rulings; it never issues them.** Every behaviour that depends on fiqh
   must trace back to a published source from the user's selected Marja.
2. **No source, no rule.** A rule without at least one verifiable citation cannot be published.
3. **Human scholarly review is mandatory.** Engineers and AI tools may help draft, translate or
   structure rules; they may never approve them. One authorized scholar for the Marja is
   sufficient (no second person is required; research/REVIEW_PROCESS.md §16).
4. **Rules are data, not code.** Rulings live in `@khums/marja-rules` as structured, versioned data
   validated by schemas in `@khums/validation`. They are never hard-coded in UI components or in
   the calculation engine.
5. **Immutability.** A published rule-set version never changes. Corrections create a new version.
6. **Transparency.** Users can see which rule-set version and which sources produced their result.
7. **Uncertainty is explicit.** Where a Marja requires individual consultation, or sources conflict
   or are silent, the rule is marked as such and the app routes the user to the Marja's office
   instead of guessing.

## 2. Source hierarchy

Ranked from most to least authoritative. Each citation records which type it is.

| Rank | Source type                                                              | Notes                                        |
| ---- | ------------------------------------------------------------------------ | -------------------------------------------- |
| 1    | Official risalah (Tawdih al-Masa'il / Minhaj al-Salihin) of the Marja    | Edition, volume, page, mas'alah number.      |
| 2    | Official istifta' answers published by the Marja's office                | Official website URL + archived copy + date. |
| 3    | Written confirmation from the Marja's office / authorized representative | Stored privately; referenced by id.          |
| 4    | Reputable secondary works explaining the Marja's view                    | Supporting only; never sufficient alone.     |

Not acceptable as sources: forums, social media, unverified apps, AI-generated text.

## 3. Rule-set structure (_superseded by the Step 2 proposal_)

> The detailed, layered proposal (sources → findings → rulings → rule packs) is in
> [research/RULE_PACK_STRUCTURE.md](research/RULE_PACK_STRUCTURE.md); the operational review
> procedure is in [research/REVIEW_PROCESS.md](research/REVIEW_PROCESS.md). The outline below is kept
> for history.

```text
packages/marja-rules/src/rule-sets/<marja-id>/<version>/
  rule-set.json       # rules, parameters, applicability, rounding policy
  sources.json        # citation records
  test-cases.json     # reviewer-verified worked examples (inputs → expected outputs)
  CHANGELOG.md        # what changed vs previous version and why
  REVIEW.md           # reviewers, dates, decision, open questions
```

Each rule records: stable `ruleId`, plain-language summary (per locale), machine-readable
parameters, `sourceRefs[]`, `status` (draft → in-review → approved → published → superseded),
`requiresConsultation` flag, and effective date range.

## 4. Versioning

- Semantic versioning per Marja rule set: **MAJOR** — a change that can alter a user's obligation;
  **MINOR** — new coverage that does not change existing results; **PATCH** — wording, translation
  or citation fixes with no calculation effect.
- Each published version has a content hash; results store `ruleSetId@version + hash`.
- Old versions remain available forever for reproducing historical results and missed-year
  assessments.
- When a Marja passes away or a ruling changes, a new rule set / version is created; guidance on
  continuing taqlid is presented from sources, not decided by the app.

## 5. Review workflow

```text
 Draft ──► Research verification ──► Scholarly review ──► Approval ──► Published
   ▲                │                        │                │
   └──── changes ◄──┴────────────────────────┴────────────────┘
```

| Stage               | Who                                                                                      | Exit criteria                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Draft               | The authorized scholar for the Marja (may be assisted; tools for draft translation only) | Every rule has ≥ 1 citation; test cases drafted.                                            |
| Source verification | The same authorized scholar                                                              | Citations checked against the original text; translations checked; attribution established. |
| Scholarly review    | The same authorized scholar                                                              | Rules and worked examples confirmed; consultation flags set.                                |
| Approval            | The same authorized scholar (self-approval allowed)                                      | Signed-off `REVIEW.md`; version and hash assigned.                                          |
| Published           | Automated release                                                                        | CI validates schema, citations, test cases, immutability.                                   |

_Owner decision 2026-11-22 (independent scholar ownership):_ one authorized scholar may perform
every stage above alone. No second researcher and no second scholar is required at any stage.

_Owner decision 2026-11-23 (approval policy; ARCHITECTURE §11 #63; supersedes the separate
"Approval" stage and any separate production approval gate):_

```text
 Draft ──► Source verification (authorized scholar) ──► Approved automatically ──► Available
   ▲                      │                                                       (scholar testing
   └──── changes ◄────────┴──────────────────────────────────────────────────────  and public use)
```

- **Source-verified** = the authorized scholar for the Marja has verified the rule's sources,
  original text, translation and attribution and recorded it (research/REVIEW_PROCESS.md §17).
- A source-verified rule is approved automatically and is available for scholar testing and public
  calculation. There is no separate approval step and no separate production approval gate.
- Scholars improve rules only within their assigned Marja permissions; each change is a new,
  audited version that is source-verified again.
- A rule without adequate source verification stays `UNVERIFIED`, staff-only and provisional.
- AI and tool checks never count as source verification and never approve (principle 3 stands).
- **Implementation (Phase 2 step 5, ARCHITECTURE §11 #67, 2026-11-24):** for rules entered in the
  scholar rule builder this is now how the software works. The authorized scholar of the Marja (or
  a SUPER_ADMIN) records four explicit attestations for one exact rule revision (sources authentic
  and correctly cited; original text matches; translation accurate; attribution correct). That
  verification is recorded (`ruleVerificationRecords`, append-only, audited) and approves the
  revision automatically: the server publishes a new version of the Marja's builder rules that
  contains only source-verified rules, through the existing governance ledger and with every
  technical integrity and readiness check. Verification is refused while a cited research record
  is not verified or the rule needs a developer implementation; any later revision is unverified
  until verified again, and the public calculator keeps the previous version meanwhile.
- **Evidence policy (owner decision 2026-11-24, final; ARCHITECTURE §11 #70):** a draft research
  ruling may support a source-verified rule when its evidence, original text, translation,
  attribution and the exact rule revision have been verified by an authorized scholar of the Marja
  or a SUPER_ADMIN. A draft finding never supports a verified public rule; it must first be
  verified in the Research Workspace.
- Hand-built packs (the code-built scholar-review packs and any manually submitted pack) still
  follow the earlier governance workflow; nothing here makes them public.

~~Two-person rule: the author of a rule set can never be its approver.~~ _Superseded by the owner's
decision of 2026-11-22 (M5.1):_ a scholar with authority for a Marja may approve their own research
and edits, and a second scholar's approval is not mandatory. Scholar authority is assigned per Marja
and enforced by the backend; ~~SUPER_ADMIN has no religious authority~~ _(superseded 2026-11-23,
ARCHITECTURE decision 64: SUPER_ADMIN has complete platform access, including religious-content
permissions on every Marja; scholars act within their assigned Marjas and only read and test
other Marjas)_; every action is audited;
approved or published rulings are never deleted or silently overwritten. _Also 2026-11-22
(independent scholar ownership):_ second-researcher verification is not mandatory either; source,
original-text, translation and attribution verification remain required and are the authorized
scholar's responsibility. See [research/REVIEW_PROCESS.md §13 and §16](research/REVIEW_PROCESS.md).

## 6. Engineering guardrails

- CI will reject rule-set changes that: fail schema validation, lack citations, modify a published
  version, or lack reviewer-verified test cases.
- The calculation engine is tested against every published rule set's `test-cases.json`.
- UI copy that explains a ruling is pulled from the rule set (with its citation), never written
  ad hoc in components.
- AI tools (including coding assistants) must not invent, paraphrase into new meaning, or "fill
  gaps" in rulings. Gaps are recorded as open questions for scholars.

## 7. Disclaimers shown to users

- The result depends on the selected Marja's rulings as interpreted from the cited sources and on
  the accuracy of the user's inputs.
- For situations not covered, or flagged for consultation, contact the Marja's office.
- Exact disclaimer wording will be reviewed by scholars before launch.

## 8. Open items for Step 2

> _2026-11-22 (M5.1):_ launch Marjas decided: Sistani and Khamenei (independently). Research
> languages Arabic and Persian; translations English and Urdu. Remaining open items are tracked in
> [research/README.md](research/README.md#decisions-still-open-owner).

Tracked in the Step 2 research package: [research/README.md](research/README.md).

- Launch Maraje and contact points with their offices.
- Scholarly reviewers and approval authority.
- Canonical editions/translations to cite for each Marja.
- Catalogue of Khums concepts that require parameters (to finalize the rule-set schema).
