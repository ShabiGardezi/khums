---
# Source-verification record — copy to sources/<marja-id>/verification/SV-<marja-id>-<nn>.md
# Documentation revision 5 (2026-11-22). One record per source item (book edition, istifta' page,
# office letter). Required before any finding cites the item for `khamenei`, and for every
# `sistani` source before scholar review (REVIEW_PROCESS.md §8, §15; SOURCE_INVENTORY.md §1).
# Records are append-only: corrections are new records with `supersedes`.
# Documentation revision 6 (2026-11-22): completed and verified by the authorized scholar for the
# Marja, who may do so alone (REVIEW_PROCESS.md §16). Revision 5: ../archive/source-verification.template.rev5.md.
id: SV-<marja-id>-<nn>
marjaId: <marja-id>
sourceId: <id from sources/<marja-id>.sources.yaml>
evidenceItem: <E-… id if the item is also lifecycle evidence, or null>
item:
  url: <exact URL, or null for print-only>
  title: { original: '<verbatim title>', translation: '<attributed translation or null>' }
  originalLanguage: <ar | fa | other>
  sourceTier: <1 | 2 | 3 | 4> # SOURCE_INVENTORY.md §1.1; Tier 4 is never cited as authority
  sourceClass: <OFFICE_OWN | OFFICE_OTHER | STATE_OFFICIAL | NEWS | COMMUNITY | REFERENCE>
  publisher: <as printed>
  edition: <as printed, e.g. printing number and year>
  publicationDate:
    { original: <as printed>, gregorian: <YYYY-MM-DD or null>, conversionVerified: false }
authorship:
  statedAuthor: <the mujtahid named by the item as the author of the rulings, verbatim>
  establishedBy: <e.g. title page, office imprint, preface signed by the author>
  status: UNVERIFIED # UNVERIFIED | ESTABLISHED | DISPUTED | NOT_ESTABLISHED
  # Deceased Marja (e.g. khamenei): rulings of a successor, or publications of an office that now
  # serves someone else, are attributed to the deceased Marja ONLY with verified evidence that they
  # reproduce his historical rulings.
  publishedRelativeToDeath: NOT_APPLICABLE # NOT_APPLICABLE | BEFORE | AFTER | UNKNOWN
  reproducesHistoricalRulingsEvidence: <required when AFTER; otherwise null>
authenticity:
  officialLocation: <where the office publishes or published it>
  compareWith: [<other editions or copies compared, with differences found>]
  status: UNVERIFIED # UNVERIFIED | AUTHENTIC | QUESTIONABLE | NOT_AUTHENTIC
access:
  accessStatus: NOT_YET_ACCESSED # READABLE | ACCESS_BLOCKED | NOT_FOUND | ARCHIVED_COPY_AVAILABLE | NOT_YET_ACCESSED
  accessLog: # append-only; include failures
    - {
        at: <YYYY-MM-DD>,
        outcome: '<read | HTTP 403 | DNS failure | …>',
        by: <name or tool>,
        via: '<live | archive URL>',
      }
archive: { snapshotUrl: <url or null>, sha256: <hash or null>, storedFile: <path or null> }
humanVerification: { status: PENDING, by: null, at: null, reason: null } # PENDING | IN_REVIEW | VERIFIED | DISPUTED — `by`: the authorized scholar
canonicalForMarja: UNDECIDED # UNDECIDED | CANONICAL | NON_CANONICAL — only from a scholar's recorded decision
aiInvolvement: [] # e.g. { tool, purpose: locating, at } — a tool summary is never evidence
supersedes: null
---

## What was checked (by the authorized scholar, in their own words)

<how authorship, edition and authenticity were established; what could not be established>

## Open questions

<each as a neutral question; anything unresolved stays UNVERIFIED and is not cited as verified>
