# Proposed Marja Rule-Pack Structure

> **Status:** PROPOSAL — **REVISION 9** (2026-11-21, owner-approved M4.6.4a governance API decision D3; see
> [§10](#10-revision-history)). Earlier revisions are preserved unchanged in [archive/](archive/):
> [rev 8](archive/RULE_PACK_STRUCTURE.rev8.md), [rev 7](archive/RULE_PACK_STRUCTURE.rev7.md), [rev 6](archive/RULE_PACK_STRUCTURE.rev6.md),
> [rev 5](archive/RULE_PACK_STRUCTURE.rev5.md), [rev 4](archive/RULE_PACK_STRUCTURE.rev4.md).
> **No rule data.** All values below are placeholders in `<angle brackets>`. Implementation (schemas in `@khums/validation`, packs in
> `@khums/marja-rules`) happens in Milestones 3–4, only after this structure and the relevant
> research baselines are approved.

## 1. Design goals

1. **Every executable rule traces back to verbatim source text** through an unbroken chain.
2. **Marja lifecycle is evidence-backed and separate from ruling applicability.** A death never
   deactivates historical rulings, and the app never decides whether a user may continue following
   a deceased Marja (§3).
3. **Research can never become executable by accident.** Findings and rules are different
   artefacts, in different places, with a mandatory human approval step between them.
4. **Per-Marja independence.** No shared "default" rules; no inheritance between Maraje. Shared
   _schemas_, never shared _rulings_.
5. **Immutability and reproducibility.** Published packs never change; any historical result can be
   re-run against the exact pack version (and content hash) it cites.
6. **Uncertainty is executable as a stop.** A rule can say "this situation requires consultation";
   the engine must then refuse to produce a figure for it rather than guess.
7. **Data, not code.** Packs are JSON validated by Zod schemas; the engine interprets them. No
   ruling ever appears in TypeScript source or UI components.

## 2. The four layers

```
 Layer 1  SOURCES        what was consulted            (registry, archived, hashed)
    │
 Layer 2  FINDINGS       what the source says          (docs/research/findings — human research)
    │                    statuses up to APPROVED
    │       ── mandatory human encoding step + second approval (never automatic) ──
 Layer 3  RULINGS        approved statements           (scholar-approved wording, per Marja)
    │
 Layer 4  RULE PACK      executable parameters/rules   (packages/marja-rules, Milestone 4)
                         reference ruling IDs only
```

| Layer    | Lives in                                        | Authored by                                                   | Becomes immutable when |
| -------- | ----------------------------------------------- | ------------------------------------------------------------- | ---------------------- |
| Sources  | `docs/research/sources/` (+ archived snapshots) | Researchers                                                   | Snapshot hashed        |
| Findings | `docs/research/findings/<marja-id>/`            | R1, verified by R2                                            | `APPROVED`             |
| Rulings  | rule pack `rulings.json` (M4)                   | Scholar reviewer wording; engineer only transcribes           | Pack published         |
| Rules    | rule pack `rules.json` (M4)                     | Engineer, **from approved rulings only**; reviewed by scholar | Pack published         |

**Hard invariants (to be enforced by CI in M4):**

- A rule must reference ≥ 1 ruling; a ruling must reference ≥ 1 `APPROVED` finding; a finding must
  reference ≥ 1 source with an archived snapshot.
- The build fails if any referenced item is missing, unapproved, superseded, or belongs to a
  different Marja.
- No tool generates rules from findings. Encoding is a manual, reviewed change.
- A published version directory is read-only (CI rejects modifications).

## 3. Marja registry: lifecycle separate from applicability

Three different things are kept apart and never derived from one another:

| Concept                 | What it is                                                                     | Who/what sets it                                                                          | Effect on rulings                                      |
| ----------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Marja lifecycle**     | A fact: living or deceased, with evidence, dates and confidence                | Researchers, human-verified, approver signs the change                                    | **None.** Never deactivates sources, findings or packs |
| **Rule-pack lifecycle** | `draft → in_review → approved → published → superseded`                        | Review process. `superseded` only by a newer version of the **same** Marja's pack         | Governs which version is current for that Marja        |
| **User applicability**  | Whom the user follows, and whether that includes remaining on a deceased Marja | **The user's own declaration**, informed by researched positions (`CTQ`) and consultation | The app records it; it **never** computes eligibility  |

### 3.1 Marja registry record (proposed; placeholders only)

Lives in `docs/research/marja-registry.yaml` during research. It moves to `@khums/marja-rules`
(Milestone 4), separate from the rule packs.

```yaml
id: <marja-id>
names: { ar: <name>, fa: <name>, en: <name>, ur: <name> }
lifecycle:
  status: LIVING # LIVING | DECEASED | PENDING_VERIFICATION
  # Two independent fields (SOURCE_INVENTORY.md §1.4), never combined into one status:
  # Calculated only from evidence items that are SUPPORTING and READABLE / ARCHIVED_COPY_AVAILABLE
  evidenceConfidence: OFFICIAL_EVIDENCE # OFFICIAL_EVIDENCE | MULTIPLE_INDEPENDENT_REPORTS | SINGLE_REPORT | UNASSESSED | NO_EVIDENCE
  humanVerification:
    status: PENDING # PENDING | IN_REVIEW | VERIFIED | DISPUTED
    verifiedBy: [<R2 name>, <approver name>] # both required for VERIFIED
    verifiedAt: <YYYY-MM-DD>
    reason: <required when DISPUTED>
  deathDate: # only if DECEASED
    gregorian: <YYYY-MM-DD>
    original: <date as printed, e.g. Hijri>
    precision: DAY # DAY | APPROXIMATE
  evidence: [<evidence item ids>] # all recorded items, counted or not (shape below)
  countedEvidence: [<evidence item ids>] # subset that determines evidenceConfidence
officialChannels: [<source ids for the office website, istifta', contact>]
continuedTaqlid:
  researchFindings: [<CTQ finding ids>] # researched positions; no default
history: # append-only
  - {
      at: <date>,
      field: <e.g. lifecycle.status>,
      from: <previous value,
      preserved verbatim>,
      to: <new value>,
      evidence: [<ids>],
      by: <name>,
      approvedBy: <approver or null>,
    }
```

**Evidence item** (one per URL/document; immutable once recorded):

```yaml
id: E-<MARJA>-<n>
url: <exact URL>
sourceClass: STATE_OFFICIAL # OFFICE_OWN | OFFICE_OTHER | STATE_OFFICIAL | NEWS | COMMUNITY | REFERENCE
publisher: <publisher>
publicationDate:
  { original: <as printed>, gregorian: <YYYY-MM-DD or null>, conversionVerified: false }
originalTitle: <verbatim, or null if not read>
# Three separate fields, never combined:
accessStatus: ACCESS_BLOCKED # READABLE | ACCESS_BLOCKED | NOT_FOUND | ARCHIVED_COPY_AVAILABLE | NOT_YET_ACCESSED
itemAssessment: UNASSESSED # UNASSESSED | SUPPORTING | INCONCLUSIVE (always UNASSESSED unless READABLE / ARCHIVED_COPY_AVAILABLE)
humanVerification: { status: PENDING, by: null, at: null } # PENDING | IN_REVIEW | VERIFIED | DISPUTED
accessLog: # append-only
  - { at: <YYYY-MM-DD>, outcome: <e.g. HTTP 403>, by: <name or tool>, via: <live | archive URL> }
archive: { snapshotUrl: <url or null>, sha256: <hash or null> }
locatedWith: OWNER_SUPPLIED # MANUAL | TOOL_ASSISTED | OWNER_SUPPLIED
supersedes: null
```

Example values above mirror E-FAY-1 in the source inventory. Inaccessible content is **never
counted**. An item can only reach `humanVerification: VERIFIED` when its access status is
`READABLE` or `ARCHIVED_COPY_AVAILABLE`.

### 3.2 Rules for lifecycle changes

1. A change to `DECEASED` is recorded as soon as evidence supports it, with its evidence confidence.
   It counts as verified only when `humanVerification.status` is `VERIFIED`, which needs at least
   one `OFFICE_OWN`, `OFFICE_OTHER` or `STATE_OFFICIAL` item re-read by R2 and approver sign-off.
   Until then it is shown to users only as reported, with the source. News alone can reach at most
   `MULTIPLE_INDEPENDENT_REPORTS`.
2. The change **never** deletes, deactivates or supersedes that Marja's sources, findings,
   approved rulings or published packs. Historical packs stay loadable for past results and for
   users who declare that they remain in that Marja's taqlid.
3. The app **never** moves users to another Marja automatically, including to Sistani or any
   default. Affected users see a neutral notice (the reported death date and its source), the
   researched `CTQ` positions with citations, and the consultation pathway.
4. Where an approved rule pack exists (§3.3), calculations are not blocked solely because a Marja
   is deceased. If the user has not declared
   their situation, or declares they are unsure, the app shows the consultation pathway before any
   result, and records the user's declaration with the result for traceability.
5. A Marja whose lifecycle `humanVerification.status` is not `VERIFIED` is not listed in the
   production directory (§3.3).
6. **Nothing is silently overwritten.** Registry fields change only by appending a `history` entry
   that preserves the previous value verbatim. Evidence items are immutable once recorded:
   corrections are new items with `supersedes`. Findings follow the same rule
   ([REVIEW_PROCESS.md §12](REVIEW_PROCESS.md#12-preservation-of-evidence-and-verification-history)).

### 3.3 Release evidence policy

Each user-facing capability has its own gate. **Passing one gate never implies another.**

| Capability (production)                                                                                                     | Required evidence                                                                                                                                                                                                                                                                                    | Not sufficient on its own                                        |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Marja directory visibility** (name, lifecycle status, official channels shown to users)                                   | Lifecycle status with `humanVerification.status: VERIFIED`, backed by official evidence. Deceased Maraje are listed with their death date and source.                                                                                                                                                | Strong but unverified evidence (`OFFICIAL_EVIDENCE` + `PENDING`) |
| **Historical ruling archive** (published sources and approved research shown for reference, with citations; no calculation) | Every displayed source with access status `READABLE` or `ARCHIVED_COPY_AVAILABLE`, human-verified (read, archived, edition recorded), and every displayed finding `APPROVED` under the review process. `ACCESS_BLOCKED`, `NOT_FOUND` and `NOT_YET_ACCESSED` sources are never displayed as verified. | A verified Marja status                                          |
| **Calculation availability**                                                                                                | An independently reviewed and **approved, published rule pack** for that Marja (scholar review + separate approver, CI invariants in §2), plus a verified directory entry. For a deceased Marja, also scholar-reviewed `CTQ` research and the consultation pathway.                                  | A verified Marja status, or a verified historical archive        |

**A verified Marja identity/status does not imply that their rulings are approved for
calculation.** Directory listing, archive display and calculation are independent decisions, each
recorded with its own approval.

During development, unverified data may appear only in internal/test builds, clearly labelled.

## 4. Repository layout (proposed)

```text
docs/research/
├── marja-registry.yaml                      Marja lifecycle register (§3)
├── sources/<marja-id>.sources.yaml          Layer 1 registry (per Marja)
├── findings/<marja-id>/<topic>.md           Layer 2 findings (template-based, YAML front matter)
└── reviews/<marja-id>/<baseline>.REVIEW.md  signed research-baseline approvals

packages/marja-rules/rule-packs/<marja-id>/<semver>/      (Milestone 4)
├── manifest.json        identity, version, status, hashes, approvals
├── sources.json         snapshot of the Layer 1 entries the pack cites
├── rulings.json         Layer 3 approved statements + finding references
├── rules.json           Layer 4 executable definitions + ruling references
├── consultation.json    situations where the engine must stop and refer
├── test-cases.json      reviewer-verified worked examples (inputs → expected outputs/stops)
├── CHANGELOG.md         what changed vs the previous version and why
└── REVIEW.md            scholar review + approval record for this pack version
```

## 5. Record shapes (illustrative; placeholders only)

### 5.1 Source (Layer 1)

```yaml
id: <marja-id>.risalah.<lang>.<edition>
marjaId: <marja-id>
tier: 1 # 1 official risalah | 2 official istifta' | 3 written office answer | 4 secondary (supporting only)
type: risalah # risalah | istifta | office-letter | statement | secondary
sourceClass: OFFICE_OWN # OFFICE_OWN | OFFICE_OTHER | STATE_OFFICIAL | NEWS | COMMUNITY | REFERENCE
originalTitle: <title verbatim, original script>
titleTranslation: { text: <translation>, translator: <name> }
language: <ar|fa|en|ur|…> # an official translation is recorded as its own source and linked to the original
translationOf: <source id of the original-language edition, or null>
edition: <edition / printing / version as stated>
publisher: <office or publisher>
publicationDate: { original: <as printed, e.g. Hijri>, gregorian: <YYYY-MM-DD or null> }
url: <exact official URL>
archive:
  snapshotUrl: <web-archive URL>
  file: <path to stored copy>
  sha256: <hash of stored copy>
accessedAt: <YYYY-MM-DD>
accessStatus: READABLE # READABLE | ACCESS_BLOCKED | NOT_FOUND | ARCHIVED_COPY_AVAILABLE | NOT_YET_ACCESSED
accessLog: [
    {
      at: <YYYY-MM-DD>,
      outcome: <readable | HTTP 403 | DNS failure | 404>,
      via: <live | archive URL>,
    },
  ] # append-only
humanVerification: { status: PENDING, by: null, at: null } # PENDING | IN_REVIEW | VERIFIED | DISPUTED
locatedWith: MANUAL # MANUAL | TOOL_ASSISTED | OWNER_SUPPLIED. A tool summary is a pointer only and never evidence
notes: <free text>
```

### 5.2 Finding (Layer 2)

```yaml
id: F-<marja-id>-<question-id>-<nn>
marjaId: <marja-id>
questionId: <e.g. INC-03>
status: EXTRACTED # see RESEARCH_PLAN.md §6
citations:
  - sourceId: <source id>
    locator:
      {
        volume: <n>,
        page: <n>,
        masalah: '<number as printed>',
        istiftaId: <id>,
        anchor: <url#fragment>,
      }
    verbatimOriginal: '<exact text copied from the source>'
    translation:
      text: '<translation>'
      translator: <name>
      reviewStatus: PENDING # PENDING | REVIEWED
conditionsAndExceptions: '<copied from text>'
flags: { ambiguous: false, requiresConsultation: false, conflictsWith: [] }
researcherNote: '<labelled non-authoritative>'
history:
  - { status: EXTRACTED, by: <R1>, at: <date> }
```

### 5.3 Ruling (Layer 3, Milestone 4)

```json
{
  "id": "R-<marja-id>-<nnn>",
  "marjaId": "<marja-id>",
  "findingIds": ["F-<marja-id>-<question-id>-<nn>"],
  "statement": { "en": "<scholar-approved wording>", "<lang>": "<…>" },
  "scope": "<situation this ruling covers, in neutral terms>",
  "requiresConsultation": false,
  "approvedBy": "<reviewer id>",
  "approvedAt": "<date>"
}
```

### 5.4 Rule (Layer 4, Milestone 4)

Rules carry **parameters and references**, not prose. The exact rule vocabulary (what kinds of
rules the engine supports) is designed in Milestone 3 from the approved research — it is
deliberately not fixed here so research is not shaped to fit code.

> **Revision 5 note (2026-11-20):** the paragraph above is revision 4 text, kept verbatim. Under
> the owner's decision to develop ahead of scholar review, a calculation vocabulary now exists in
> code **before** approved research. It is documented in [§5.6](#56-provisional-technical-calculation-vocabulary-revision-5)
> as a **provisional technical implementation**. The principle above still governs: research is
> not shaped to fit code.

```json
{
  "id": "<stable rule id>",
  "rulingIds": ["R-<marja-id>-<nnn>"],
  "kind": "<rule kind from the M3 engine vocabulary>",
  "appliesTo": "<input category id>",
  "parameters": { "<name>": "<decimal string | enum | reference>" },
  "rounding": { "scale": "<n>", "mode": "<RoundingMode>" },
  "onUnsupported": "REQUIRE_CONSULTATION"
}
```

### 5.5 Manifest (per pack version)

```json
{
  "packId": "<marja-id>",
  "version": "<semver>",
  "status": "draft | in_review | approved | published | superseded",
  "schemaVersion": 1,
  "researchBaseline": "<baseline id from docs/research/reviews>",
  "effectiveFrom": "<date>",
  "contentHash": "sha256:<hash of canonical JSON of all pack files>",
  "approvals": [
    { "role": "scholar-reviewer", "by": "<id>", "at": "<date>" },
    { "role": "approver", "by": "<id>", "at": "<date>" }
  ],
  "supersedes": "<previous version | null>"
}
```

### 5.6 Provisional technical calculation vocabulary (revision 5)

> **Not authoritative.** This vocabulary is a provisional technical implementation in
> `@khums/calculation-engine` (Step 3), written before any ruling was researched or approved. It
> **does not constrain religious rulings** and is not evidence of what any Marja holds.

Implemented today. Each workflow program is an ordered list of steps; each step has an expression,
the rule IDs that justify it, and optional rounding:

| Expression                                                     | Purpose (technical)                                |
| -------------------------------------------------------------- | -------------------------------------------------- |
| `sumCategories`                                                | Sum the user's entries in pack-defined categories  |
| `parameter`                                                    | Read a pack parameter (decimal string)             |
| `step`, `zero`                                                 | Reference an earlier step; money zero              |
| `add`, `subtract`, `multiply`, `percentage`, `min`, `max`      | Exact decimal arithmetic                           |
| `when` + conditions (`answer`, `compare`, `all`, `any`, `not`) | Branch on user answers or comparisons              |
| `consult`                                                      | Stop: individual consultation required (no figure) |
| Step `rounding` (`scale: n \| 'currency'`, explicit mode)      | Rounding only where the pack specifies it          |

Missed-year aggregation across years happens only for outputs the pack lists. Full reference:
[packages/calculation-engine/README.md](../../packages/calculation-engine/README.md).

**Binding rules for this vocabulary**

1. **Rulings come first.** Approved rulings are recorded (Layers 1–3) in their own terms, without
   reference to what the engine can express.
2. **Never simplify or alter a ruling to fit the DSL.** If a scholar-approved ruling cannot be
   expressed exactly, the interpreter is extended or changed, under a new pack `schemaVersion`, with
   tests. Until then, the situation is encoded as a `consult` stop, never as an approximation.
3. **Future approved rulings may require** new expression kinds or new input structures (e.g.
   per-item facts, dates of acquisition, valuation bases, liabilities). They may also require
   changes to existing semantics, or a different program model. None of these is ruled out by the
   current design.
4. **Scholar reviewers review encoded rules, not just rulings.** A scholar reviewer must confirm
   that each encoded program reproduces the approved ruling and its worked examples (`test-cases.json`).
5. **The vocabulary can be revised freely before Gate R.** After a pack is published, any change
   that alters results requires a new MAJOR pack version (§6).

### 5.7 Fact mapping (revision 6; provisional, non-authoritative)

> **Not authoritative.** The mapping language is a provisional technical structure (M4.4.1), like
> §5.6. It does not constrain rulings, and it is not evidence of how any Marja treats any fact.
> **No real mapping exists yet**: only MOCK fixtures in tests.

A pack with `metadata.schemaVersion: 2` carries a `factMapping`. It says how **this pack** reads
the user's neutral financial facts ([FINANCIAL_INPUT_MODEL.md](../FINANCIAL_INPUT_MODEL.md)) into
its own input categories. The facts are never modified. Mappings are never shared between Maraje,
and there are no defaults.

```text
factMapping
  mappingVersion: 1                    language version (unsupported versions are refused)
  factSheetSchemaVersions: [1]         fact-sheet versions it was written for
  ruleIds: [<rule>]                    justifies the mapping and its unmatched fallback
  unmatched: consult <consultation>    any fact no rule matches → consultation (never ignored)
  rules: at most one rule per (workflow, kind, subtype); overlaps are rejected
    match: workflows[], kinds[], subtypes[]   explicit; no wildcards
    ruleIds: [<rule>]                         production: ≥ 1 APPROVED, sourced rule
    then: one of
      category <id>  amount policy + date policy   → one engine entry
      exclude ruleIds[]                             → feeds no category; its own justification
      consult <consultation>                        → stop
      ask <question> cases[] otherwise consult      → per-fact question, then a case
```

| Policy | Field                    | Allowed handling                                                |
| ------ | ------------------------ | --------------------------------------------------------------- |
| amount | `KNOWN`                  | always used as entered                                          |
| amount | `estimated`              | `use` · `clarify` · `consult`                                   |
| amount | `range`                  | `use-min` · `use-max` · `clarify` · `consult`                   |
| amount | `unknown`, `notProvided` | `clarify` · `consult` (never assumed)                           |
| date   | `field`                  | a date field of every matched kind, or `null` (first-time only) |
| date   | `approximate`            | `use` · `clarify` · `consult`                                   |
| date   | `unknown`, `notProvided` | `clarify` · `consult`                                           |

**Integrity rules (structure validation; violations make the pack unusable):**

- **No overlaps.** Two rules may not match the same (workflow, kind, subtype), so rule order can
  never change an interpretation.
- **Categories must be read.** A `category` must be read by the program of every workflow the
  rule matches; otherwise the amount would be silently ignored.
- **Exclusions are justified.** Every `exclude`, including one inside an `ask` case, cites its own
  rule(s). The trace records the mapping rule and the exclusion's rules.
- **Only known operations and handlings.** Unknown ones are refused, never ignored.
- **Per-fact answers are bound to their fact.** They are keyed by fact id and declare the fact's
  workflow, kind and subtype. A mismatch, or an answer for a fact not in the sheet, fails closed.
  An invalid value (wrong type, or not a declared choice) is asked again. A valid value with no
  case stops for the `otherwise` consultation. Assessment-level answers are never used as per-fact
  answers.
- **Facts are distinct.** Duplicate fact ids are refused.

**Execution** (`mapFactsToInput` in `@khums/calculation-engine`; `prepareAssessmentInput` in
`@khums/core`) is pure and deterministic:

- One trace line per fact, in sheet order, with the mapping rule, the outcome, the category, the
  copied amount, the cited rules and the questions answered.
- Amounts are copied as the original decimal strings. The mapping does no arithmetic; aggregation
  is the program's job.
- An engine input is produced only when every fact maps to an entry or is excluded. Otherwise
  the result is `NEEDS_CLARIFICATION` (what to ask), `CONSULTATION_REQUIRED` (which stops) or
  `UNSUPPORTED`.

**Not supported in mapping version 1** (encode as `consult` until an approved ruling requires an
extension under a new `mappingVersion`, with tests):

- conditions on dates or amounts (e.g. acquired before a date, above a value);
- splitting one fact across categories;
- quantities and units (FR-M1);
- currency conversion, so a fact in another currency is `UNSUPPORTED`;
- aggregation or arithmetic;
- per-year answers in missed-year assessments (the same answers apply to every year).

**Gates:**

- Structure validation checks every reference and schema-version consistency.
- Production readiness requires the mapping and every rule, question and consultation it can
  reach to be approved and sourced. `requireFactMapping` refuses fact-based input to a pack
  without a mapping.
- Production readiness also rejects any mapping structure issue, and activation eligibility runs
  full structure validation. All existing gates are unchanged.
- The mapping is part of the pack content, so the content hash, immutability and approvals apply
  to it. Since revision 7 the digest is **recomputed from the content** at every verification point
  (§5.8), so a changed mapping invalidates the pack's integrity, approvals and activation.

### 5.8 Content integrity (revision 7; FR-1)

Every gate **recomputes** the digest from the pack's actual content. A declared or caller-supplied
value is only ever compared, never trusted, and nothing is cached between checks.

**Integrity record** (`ContentIntegrity`):

```json
{
  "algorithm": "SHA-256",
  "canonicalization": "khums-jcs-1",
  "scope": "rule-pack-content-1",
  "digest": "<64 lowercase hex>"
}
```

It is declared in `metadata.integrity`, carried by each approval in `approvals[].integrity`, and
carried by the activation record in `integrity`. The canonicalization version and the scope are
independent of the pack `schemaVersion`.

**Hashed bytes.** SHA-256 is applied to the UTF-8 encoding of the `khums-jcs-1` canonical form of:

```json
{ "canonicalization": "khums-jcs-1", "content": <content>, "scope": "rule-pack-content-1" }
```

Embedding both versions binds every digest to how it was produced.

**Scope `rule-pack-content-1`.** `<content>` is the **whole pack** except four metadata fields:

| Excluded field         | Reason                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `metadata.integrity`   | The declared digest itself (circular)                                                           |
| `metadata.contentHash` | Legacy declared hash (circular); never accepted as integrity                                    |
| `metadata.approvals`   | Approvals sign the digest (circular). Each approval is bound to it through `integrity`          |
| `metadata.status`      | Lifecycle state that must change after approval (APPROVED → PUBLISHED) without changing content |

Everything else is hashed, at every depth, including fields not listed here:

- sources;
- rules, with their status, summaries and source/ruling references;
- input categories;
- questions and their choices;
- parameters (decimal strings);
- consultations;
- every workflow program (steps, expressions, rounding, outputs, aggregation);
- the fact mapping (rules, actions, handlings, ask cases, unmatched fallback, versions);
- all other metadata: id, Marja, version, `schemaVersion`, title, `isMock`, effective dates,
  research baseline and `supersedes`.

An unknown extra field is hashed too, and structure validation rejects it. The activation record
is already a separate artifact outside the pack.

**Canonicalization `khums-jcs-1`.** This is RFC 8785 (JCS) output for a narrowed input domain.
RFC 8785 is suitable as is, because every decimal value in a pack is already a string; the
profile only rules out ambiguous inputs:

- **Objects:** keys are sorted by UTF-16 code units, and there is no whitespace. Property
  insertion order has no effect.
- **Strings:** serialized exactly as ECMAScript `JSON.stringify`. They must be well-formed UTF-16
  (lone surrogates are rejected). **No Unicode normalization** is applied, so NFC and NFD forms
  hash differently, by design (bytes are content). Output is UTF-8.
- **Numbers:** only safe integers, which are used for versions and rounding scales. `-0`, `NaN`,
  `±Infinity`, fractions and unsafe integers are rejected. Decimal amounts and rates are strings
  and are kept exactly (`"12.50"` ≠ `"12.5"`).
- **Missing, null and empty values:** a missing key, `null`, `""`, `[]` and `{}` are all distinct.
  `undefined` anywhere is **rejected**, never dropped.
- **Arrays:** order is **always preserved, never sorted**. Some arrays are semantically ordered
  (steps, mapping rules, choices, ask cases, missed-year aggregation). Others act as lists of
  references (`ruleIds`, `sourceRefs`). Those are treated as ordered as well, so reordering them
  is a content change requiring re-approval, which is the conservative choice.
- **Rejected values:** functions, symbols, bigints, sparse arrays, cycles and non-plain objects.
  A pack that cannot be canonicalized fails structure validation (`PACK_NOT_CANONICALIZABLE`).

**Implementation.**

- `@khums/calculation-engine/integrity` is pure and synchronous. It uses audited
  `@noble/hashes` SHA-256 and a pure UTF-8 encoder, so there is no platform API and no async
  port. The same code runs in the API, web and mobile apps, and `@khums/core` re-exports it.
- Tests cover the FIPS 180-4 SHA-256 vectors and the RFC 8785 key-ordering example.

**Verification points (fail closed):**

| Point                                          | Function                                   | Checks                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Pack validation (all modes)                    | `validateRulePackStructure`                | Content canonicalizable; declared or approval integrity well-formed (`PACK_INTEGRITY_MALFORMED`)                          |
| Approval eligibility                           | `checkApprovalEligibility`                 | Structure; declared integrity present, supported and equal to the recomputed digest; not MOCK                             |
| Publication eligibility (APPROVED → PUBLISHED) | `checkPublicationEligibility`              | All activation-eligibility checks except PUBLISHED status; status must be APPROVED                                        |
| Activation eligibility                         | `checkActivationEligibility`               | Structure; integrity verified; approvals bound to the recomputed digest; all rule gates                                   |
| Production readiness                           | `checkProductionReadiness`                 | All of the above, plus the activation's integrity equal to the **recomputed** digest and referencing only valid approvals |
| Production calculation                         | `calculate(..., { mode: 'production' })`   | Runs readiness, so integrity is recomputed for each calculation                                                           |
| Traceability                                   | `calculate` meta, `mapFactsToInput` result | `contentDigest`: the digest recomputed from the content actually used                                                     |

**Failure codes** (stable; messages contain no pack content):

| Code                                                   | Meaning                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `READINESS_MISSING_CONTENT_HASH`                       | No declared integrity                                                                                           |
| `READINESS_INTEGRITY_UNSUPPORTED`                      | Unsupported algorithm, canonicalization or scope                                                                |
| `READINESS_INTEGRITY_MISMATCH`                         | Declared digest differs from the recomputed one                                                                 |
| `READINESS_LEGACY_CONTENT_HASH`                        | A legacy `contentHash` is set (unverifiable; must be `null`)                                                    |
| `READINESS_APPROVAL_NOT_BOUND`                         | An approval carries no integrity                                                                                |
| `READINESS_APPROVAL_STALE`                             | An approval covers other content. It does not count, so `MISSING_SCHOLAR_APPROVAL` or `MISSING_APPROVER` follow |
| `READINESS_ACTIVATION_STALE`                           | The activation names other content, or references a stale approval                                              |
| `PACK_NOT_CANONICALIZABLE`, `PACK_INTEGRITY_MALFORMED` | Structure errors                                                                                                |

In development mode readiness issues remain warnings, as before. In production they block.

**Binding consequences.**

- Any content change produces a new digest. The declared integrity then mismatches; or, if it is
  re-declared, every approval and the activation become stale. A changed pack can never reuse an
  earlier approval or activation.
- Publication changes only `status`, so approvals stay valid.
- A new canonicalization or scope version is refused until it is implemented. Migrating would
  mean re-sealing, re-approving and re-activating.

**Migration.**

- `contentHash` (`sha256:<hex>`, revisions ≤ 6) is kept in the schema for compatibility but must
  be `null` in production.
- Activation records now carry `integrity` instead of `contentHash`. No real activation existed.
- Existing MOCK packs (`schemaVersion` 1 and 2) are unchanged and still validate and calculate in
  development; they are simply unsealed.
- Test fixtures seal readiness-test packs with recomputed integrity and bound approvals.
- Future production packs are sealed by tooling (`sealRulePack`) before review. Reviewers approve
  the exact digest, and the activation names it.

### 5.9 Governance: approval, publication and immutability (revision 8)

> Domain architecture only. **Identities are unverified references** (FR-2 open), and there is
> **no persistence** (FR-3 storage open). Nothing here makes a pack production-ready by itself.

**Ledger.**

- Each pack version (`packId@version`) has an append-only `GovernanceLedger` of typed records:
  - `SUBMITTED`, `REVIEW_STARTED`, `CHANGES_REQUESTED` and `REVIEW_COMPLETED`;
  - `APPROVED`, `PUBLISHED` and `ACTIVATED`;
  - `WITHDRAWN` and `SUPERSEDED`.
- Every record carries:
  - `sequence` and `recordId` (`packId@version#n`);
  - `packId` and `version`;
  - `recordedAt` (ISO 8601 UTC with milliseconds, non-decreasing);
  - `actor`: `{ kind: 'STAFF_PRINCIPAL', subject }` for records written by the governance API
    (revision 9, M4.6.4a: `subject` is the staff principal id of the authenticated session, taken
    by the server, never from a request), or `{ kind: 'UNVERIFIED_REFERENCE', subject }` for
    records written before it. Both kinds stay valid; no record is rewritten or re-hashed, and
    separation rules compare `subject` across kinds;
  - `previousRecordDigest` and `recordDigest`, which form a SHA-256 hash chain over the
    `khums-jcs-1` canonical form, reusing §5.8.
- Content records (all except withdrawal and supersession) bind the exact `ContentIntegrity`.

**State is derived, never stored.** The lifecycle state is computed by replaying every record
through one transition function, the same one used to append. `metadata.status` is only a
projection, and it must match at publication and activation.

| From                         | Record              | To                | Conditions                                                                                        |
| ---------------------------- | ------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| DRAFT / CHANGES_REQUESTED    | `SUBMITTED`         | SUBMITTED         | Pack sealed, integrity verified, structure valid, not MOCK; a resubmission must change the digest |
| SUBMITTED                    | `REVIEW_STARTED`    | UNDER_REVIEW      | Same digest; reviewer ≠ author                                                                    |
| UNDER_REVIEW                 | `CHANGES_REQUESTED` | CHANGES_REQUESTED | By the same reviewer; same digest; evidence                                                       |
| UNDER_REVIEW                 | `REVIEW_COMPLETED`  | (UNDER_REVIEW)    | By the same reviewer; same digest; evidence; once per cycle                                       |
| UNDER_REVIEW + completed     | `APPROVED`          | APPROVED          | References the completed review; **same digest as reviewed**; approver ≠ reviewer and ≠ author    |
| APPROVED                     | `PUBLISHED`         | PUBLISHED         | All publication gates (below); references the approval; same digest                               |
| PUBLISHED                    | `ACTIVATED`         | (PUBLISHED)       | Explicit, once; references publication and approval; same digest; never automatic                 |
| PUBLISHED                    | `SUPERSEDED`        | SUPERSEDED        | A newer published version of the same pack                                                        |
| any non-terminal (not DRAFT) | `WITHDRAWN`         | WITHDRAWN         | Reason code                                                                                       |

`SUPERSEDED` and `WITHDRAWN` are terminal. Anything else is `INVALID_TRANSITION` or
`DUPLICATE_TRANSITION`. Approval is not publication, and publication is not activation.

**Publication** (`publish`):

- the pack's **recomputed** digest must equal the approved digest;
- `status` must be `APPROVED`;
- `approvals` must be exactly the two derived from the ledger's current cycle (scholar reviewer
  and approver, each bound to the digest and referencing its ledger record by `recordId/recordDigest`);
- every engine publication gate must pass (structure, integrity, separation, rule and source
  approvals, effective dates, not MOCK).

Only `status` changes, and the digest is re-verified afterwards. A published version is
immutable: any change needs a new version and a new ledger.

**Activation** (`activate`) is a separate, explicit step. The `RulePackActivation` names the pack
identity and version, the verified integrity, the review and approval record references, and
`publicationReference`. `checkGovernedProductionReadiness` requires the engine gate (§5.8) plus:

- a cleanly replaying ledger in state PUBLISHED, so not withdrawn or superseded;
- the pack's recomputed digest equal to the published digest;
- the ledger's approvals on the pack;
- an activation matching the ledger's `ACTIVATED` record exactly.

An old activation never authorizes a changed pack or another version.

**Immutability.**

- In the domain, records and ledgers are deeply frozen and only `append` exists (it returns a new
  ledger).
- Replay verifies shape, identity, contiguous sequence, record ids, the hash chain, record
  digests, timestamps and every transition. Modified, inserted, deleted-in-the-middle or reordered
  records are rejected (`LEDGER_TAMPERED`).
- **Not prevented by the domain alone:**
  - truncation of trailing records (for example removing a withdrawal);
  - a consistent rewrite of the entire chain.
    Both need write-once storage or an external anchor of the head digest (FR-3, future).

## 6. Versioning

Semantic versioning per Marja pack:

| Change                                                                  | Version bump |
| ----------------------------------------------------------------------- | ------------ |
| Any change that can alter a computed obligation or a consultation stop  | **MAJOR**    |
| New coverage that does not change existing results                      | MINOR        |
| Wording, translation or citation corrections with no calculation effect | PATCH        |

- **Pack `schemaVersion`:**
  - 1 means no fact mapping, and such packs remain valid and unchanged;
  - 2 adds `factMapping` (§5.7). A version 1 pack with a mapping, or a version 2 pack without
    one, is invalid.
  - Moving to version 2 is an explicit pack change: it needs a new pack version and the full
    review.
- **`factMapping.mappingVersion`** versions the mapping language independently. A change to a
  pack's mapping that can alter entries or stops is a MAJOR pack change.
- Results store `packId@version` + `contentHash` + engine version (traceability, ARCHITECTURE §5).
- Superseded versions remain available indefinitely for reproducing past and missed-year results.
- Research baselines are versioned separately (`<marja-id>-baseline-<n>`); a pack declares which
  baseline it encodes.

## 7. How the engine will use a pack (for context only)

`core` loads the user's selected pack, validates it against the schema and hash, and passes it to
`calculation-engine` as input (approved decision: engine receives the rule set as input). The
engine returns either a result with a step trace citing rule → ruling → finding → source, or a
**consultation stop** listing the consultation entries that apply. It never substitutes another
Marja's rules or a default. Marja lifecycle is not an engine input. The user's taqlid declaration
and any deceased-Marja notice are handled in `core`/UI and recorded with the result (§3.2).

## 8. Open design questions (for reviewers)

1. Should approved rulings be stored per pack version (copied) or in a per-Marja ruling registry
   referenced by packs? (Proposal: copied into each pack for self-contained immutability.)
2. Continued taqlid is now a research topic (`CTQ`) and a registry field (§3.1). Open question: how
   should researched `CTQ` positions be presented to users without implying eligibility? (Needs
   reviewer input on wording.)
3. Which languages must approved ruling statements be available in at launch?
4. Should source snapshots be stored in the repository or in separate, access-controlled storage
   (copyright and size)?

## 9. Future requirements (recorded in revision 5)

Owner-recorded requirements. Each must be met before the milestone indicated, and in all cases
before Gate R (see [../DEVELOPMENT_ROADMAP.md](../DEVELOPMENT_ROADMAP.md)).

| #    | Requirement                                                                                                                                                                                                                                                                                                          | Current state (2026-11-20)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Due                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| FR-1 | **Content-hash verification** before production activation: compute the canonical hash of the actual pack content and compare it with `metadata.contentHash` and the activation record. **Rev 7: implemented (§5.8)**, with `metadata.integrity`, bound approvals and activation.                                    | The engine only checks that a hash exists and matches the activation. It does not hash content (needs a platform hashing API, so it belongs in `core`/the app).                                                                                                                                                                                                                                                                                                                                                                                                                                                          | M4 (before any activation) |
| FR-2 | **Authenticated reviewer and approver identities.** (Rev 8: domain separation of roles exists, §5.9; identities remain unverified references.) Approvals and activations are created only by authenticated, authorized users, with role-based access and MFA. Reviewer IDs map to verified identities.               | `reviewerId`/`activatedBy` are plain strings; no authentication exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | M6/M7                      |
| FR-3 | **Immutable published versions and approval history.** (Rev 8: domain-level append-only, hash-chained ledger, §5.9; storage enforcement and head anchoring remain open.) Published packs can never be modified (enforced, not just documented). Approvals, activations and withdrawals are append-only and retained. | Documented only (§2, §6; REVIEW_PROCESS §12). No storage or CI enforcement yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | M4 (CI), M6/M7 (storage)   |
| FR-4 | **Financial input modelling for liabilities, deductions and adjustments without unsafe negative-amount conventions.** Verify that the model represents these explicitly and safely.                                                                                                                                  | Entries are non-negative amounts. A deduction is a pack-defined category that the program subtracts, so the sign comes from the approved program, not from the user. Liabilities with their own attributes (due dates, purpose, repayment timing) and adjustments are **not yet modelled**. To be verified against research findings (e.g. matrix `LIA`, `EXP`, `BUS`). **Rev 6:** liabilities are now neutral `LIABILITY` facts (incurred, due and valuation dates; non-negative amounts); a pack's fact mapping (§5.7) decides whether and how they feed its categories. Purpose and repayment attributes remain open. | M4                         |
| FR-5 | **Scenario coverage validation.** The engine must support every calculation scenario identified during religious research. Each must be expressible exactly or handled by a consultation stop, proven by reviewer-verified test cases.                                                                               | Only MOCK scenarios are tested. A coverage matrix linking research questions and findings to engine constructs and test cases is to be produced once findings exist.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Before Gate R              |

## 10. Revision history

| Revision      | Date                    | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Approved by                         |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1–3           | 2026-11-19 → 2026-11-20 | Initial proposal; Marja registry; release evidence policy (see git history)                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Owner (in principle)                |
| 4             | 2026-11-20              | Source-access status in the evidence item schema; documentation frozen. Preserved verbatim in [archive/RULE_PACK_STRUCTURE.rev4.md](archive/RULE_PACK_STRUCTURE.rev4.md) (SHA-256 `572d84e46ec7e938cba013a860361334b41b7c21232a9d3d2a5b02ecc1688a29`)                                                                                                                                                                                                                                                                                 | Owner                               |
| 5             | 2026-11-20              | §5.4 revision note; new §5.6 (provisional, non-authoritative calculation vocabulary and binding rules); new §9 (future requirements FR-1…FR-5); this history. No other content changed                                                                                                                                                                                                                                                                                                                                                | Owner                               |
| 6             | 2026-11-20              | New §5.7 (fact mapping, provisional and non-authoritative; pack `schemaVersion` 2); §6 versioning notes for `schemaVersion` and `mappingVersion`; FR-4 status note. Revision 5 preserved verbatim in [archive/RULE_PACK_STRUCTURE.rev5.md](archive/RULE_PACK_STRUCTURE.rev5.md) (SHA-256 `3f99a511f397df123516e679549a6ddf3f25f6da271b8c03ec0257e013919c13`)                                                                                                                                                                          | Owner (M4.4.1 request)              |
| 6 (corrected) | 2026-11-20              | **Correction during the M4.4.1 adversarial verification, before revision 6 was approved** (no archived revision changed). §5.7: first-match precedence replaced by rejecting overlapping rules; `exclude` carries its own `ruleIds`; mapped categories must be read by the workflow program; unknown operations refused; per-fact answers bound to the fact's workflow, kind and subtype; duplicate fact ids refused; readiness/activation reject mapping structure issues; explicit note that FR-1 hash computation is still missing | Owner (M4.4.1 verification request) |
| 7             | 2026-11-20              | New §5.8 (content integrity: `khums-jcs-1` canonicalization, SHA-256, scope `rule-pack-content-1`, verification points, failure codes, migration); §5.7 note updated; FR-1 marked implemented. Revision 6 (including its correction) preserved verbatim in [archive/RULE_PACK_STRUCTURE.rev6.md](archive/RULE_PACK_STRUCTURE.rev6.md) (SHA-256 `d22ce1ae503dcf05cb10cd16aeb0ed9b18c2423c3dbce6e6a42d36f2245626b9`)                                                                                                                    | Owner (M4.4.2 request)              |
| 8             | 2026-11-20              | New §5.9 (governance ledger, lifecycle states and transitions, separation rules, integrity-bound publication and activation, domain immutability and its limits); FR-2/FR-3 status notes. Revision 7 preserved verbatim in [archive/RULE_PACK_STRUCTURE.rev7.md](archive/RULE_PACK_STRUCTURE.rev7.md) (SHA-256 `a8fb7d9633cfc29f1ee9407e6d5a5e1797f2ab902246d9bfb15ca6d249919968`)                                                                                                                                                    | Owner (M4.4.3 request)              |
| 9             | 2026-11-21              | §5.9 record `actor` gains the `STAFF_PRINCIPAL` kind (session-derived staff principal id) next to the legacy `UNVERIFIED_REFERENCE`; no other content changed. Revision 8 preserved verbatim in [archive/RULE_PACK_STRUCTURE.rev8.md](archive/RULE_PACK_STRUCTURE.rev8.md) (SHA-256 `175bf13341df0bc0e184b10278d4e8a67c7781e8a2b0f17e0bc29bf71f8e666d`)                                                                                                                                                                               | Owner (M4.6.4a, decision D3)        |
