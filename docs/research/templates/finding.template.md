---
# Finding record — copy to findings/<marja-id>/<topic>.md (one block per finding).
# Documentation revision 6 (2026-11-22): independent scholar ownership. Revision 5 is preserved in
# ../archive/finding.template.rev5.md (revision 4 in ../archive/finding.template.rev4.md).
# The authorized scholar for this Marja may complete, verify and approve this record alone; no
# second researcher and no second scholar is required (REVIEW_PROCESS.md §16). Source, text,
# translation and attribution verification are still required and are the scholar's responsibility.
# Placeholders in <angle brackets>. Do not paraphrase the source in the verbatim original.
# Nothing in a finding is a ruling until a scholar with authority for this Marja approves it
# (REVIEW_PROCESS.md §13, §16). AI never authors, completes or approves finding content (§11).
id: F-<marja-id>-<question-id>-<nn>
marjaId: <marja-id> # sistani | khamenei (initial scope); never shared between Maraje
questionId: <e.g. INC-03> # only a required question (RESEARCH_MATRIX.md §2); never a §8 proposal
scenario: '<neutral description of the situation this finding concerns, or null>'
status: EXTRACTED # NOT_STARTED | SOURCE_LOCATED | EXTRACTED | TRANSLATION_PENDING | SOURCE_SILENT | AMBIGUOUS | CONFLICTING_SOURCES | RESEARCHER_VERIFIED | REQUIRES_CONSULTATION | SCHOLAR_REVIEWED | APPROVED | SUPERSEDED
citations:
  - sourceId: <id from sources/<marja-id>.sources.yaml>
    sourceVerificationId: <SV-<marja-id>-<nn>> # completed source-verification record (required for khamenei)
    originalLanguage: <ar | fa | other: name> # language of the quoted text
    canonicalText: UNDECIDED # UNDECIDED | CANONICAL | NON_CANONICAL — set only from a scholar's recorded decision (REVIEW_PROCESS.md §14.6)
    locator:
      edition: <as printed>
      publisher: <as printed>
      publicationDate: { original: <as printed>, gregorian: <YYYY-MM-DD or null>, conversionVerified: false }
      volume: <n or null>
      page: <n or null>
      masalah: '<number as printed, or null>'
      istiftaId: <id or null>
      url: <direct URL>
    attribution:
      author: <the mujtahid whose ruling the text states, as the source shows it>
      evidence: <how authorship is established, or UNVERIFIED>
      relativeToLifecycleChange: NOT_APPLICABLE # NOT_APPLICABLE | BEFORE | AFTER | UNKNOWN (deceased Marja: publication before/after the recorded date of death)
    sourceAccessStatus: READABLE # must be READABLE or ARCHIVED_COPY_AVAILABLE to extract verbatim text
    archive: { snapshotUrl: <url>, sha256: <hash> }
    accessedAt: <YYYY-MM-DD>
precaution: UNDETERMINED # FATWA | OBLIGATORY_PRECAUTION | RECOMMENDED_PRECAUTION | UNDETERMINED — as the text states it; record the wording below
translations: # stored separately from the original; never override it
  - language: en # en | ur
    translator: <name>
    translatedAt: <YYYY-MM-DD>
    machineDraft: false
    verification: { status: PENDING, by: null, at: null, notes: null } # PENDING | REVIEWED | DISPUTED — reviewed by the authorized scholar (or a translator they rely on)
verification: # citation check: text and locator re-located in the archived source, by the authorized scholar (a second person is optional)
  verifiedBy: null # the authorized scholar (may be the same person who extracted)
  verifiedAt: null
  relocatedInArchivedCopy: null # true | false
  discrepancies: []
  optionalSecondCheck: null # optional, never required: { by, at, result }
unresolvedAmbiguities: # phrased as questions; each links a consultation case when one is opened
  - { question: '<…>', consultationCase: null }
flags:
  ambiguous: false
  requiresConsultation: false
  conflictsWith: []
aiInvolvement: # required; empty list means none
  - { tool: <name>, purpose: <locating | machine-draft translation | formatting | consistency check>, at: <YYYY-MM-DD> }
supersedes: null
history:
  - { status: EXTRACTED, by: <scholar or assistant name>, at: <YYYY-MM-DD>, aiAssisted: false }
---

## Verbatim original (<language>)

> <exact text copied from the source, including conditions and cross-references>

## Precaution wording (if any)

> <the exact words in the text that indicate a fatwa or a precaution, or "none stated">

## Translation (<language pair>) — <translator>, <date>, review status: PENDING

> <translation; one section per language (English, Urdu). The original above governs.>

## Conditions / exceptions stated in the text

<copied or precisely pointed to; no interpretation>

## Sections searched (required if status is SOURCE_SILENT)

<list of chapters/mas'alah ranges/istifta' categories searched>

## Unresolved ambiguities (questions for the scholar or the office)

<each as a neutral question; no proposed answer>

## Researcher note — NOT A RULING

<optional: why this passage was selected, open questions phrased as questions>
