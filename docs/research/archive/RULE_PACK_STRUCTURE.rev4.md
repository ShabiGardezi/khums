# Proposed Marja Rule-Pack Structure

> **Status:** PROPOSAL, **FROZEN 2026-11-20** (see [README.md](README.md#freeze)). **No code, no rule data.** All values below are placeholders
> in `<angle brackets>`. Implementation (schemas in `@khums/validation`, packs in
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

## 6. Versioning

Semantic versioning per Marja pack:

| Change                                                                  | Version bump |
| ----------------------------------------------------------------------- | ------------ |
| Any change that can alter a computed obligation or a consultation stop  | **MAJOR**    |
| New coverage that does not change existing results                      | MINOR        |
| Wording, translation or citation corrections with no calculation effect | PATCH        |

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
