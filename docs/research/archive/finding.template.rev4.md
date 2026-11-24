---
# Finding record — copy to findings/<marja-id>/<topic>.md (one block per finding).
# Placeholders in <angle brackets>. Do not paraphrase the source in verbatimOriginal.
id: F-<marja-id>-<question-id>-<nn>
marjaId: <marja-id>
questionId: <e.g. INC-03>
status: EXTRACTED # NOT_STARTED | SOURCE_LOCATED | EXTRACTED | TRANSLATION_PENDING | SOURCE_SILENT | AMBIGUOUS | CONFLICTING_SOURCES | RESEARCHER_VERIFIED | REQUIRES_CONSULTATION | SCHOLAR_REVIEWED | APPROVED | SUPERSEDED
citations:
  - sourceId: <id from sources/<marja-id>.sources.yaml>
    locator:
      edition: <as printed>
      volume: <n or null>
      page: <n or null>
      masalah: '<number as printed, or null>'
      istiftaId: <id or null>
      url: <direct URL>
    sourceAccessStatus: READABLE # must be READABLE or ARCHIVED_COPY_AVAILABLE to extract verbatim text
    archive: { snapshotUrl: <url>, sha256: <hash> }
    accessedAt: <YYYY-MM-DD>
flags:
  ambiguous: false
  requiresConsultation: false
  conflictsWith: []
supersedes: null
history:
  - { status: EXTRACTED, by: <R1 name>, at: <YYYY-MM-DD>, aiAssisted: false }
---

## Verbatim original (<language>)

> <exact text copied from the source, including conditions and cross-references>

## Translation (<language pair>) — <translator>, review status: PENDING

> <translation>

## Conditions / exceptions stated in the text

<copied or precisely pointed to; no interpretation>

## Sections searched (required if status is SOURCE_SILENT)

<list of chapters/mas'alah ranges/istifta' categories searched>

## Researcher note — NOT A RULING

<optional: why this passage was selected, open questions phrased as questions>
