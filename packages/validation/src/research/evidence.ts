import { z } from 'zod';

import type { EvidenceArtefact } from '@khums/shared-types';

import { identifierSchema } from '../calculation/common';
import { researchMarjaIdSchema, uuidV7Schema } from './common';

/**
 * Evidence-layer payloads (M5.3.3; docs/SCHOLAR_RESEARCH_ARCHITECTURE.md §2, §4.3). Shape only:
 * `@khums/core` checks the reference rules (a passage cites exactly one source revision, a
 * translation exactly one passage revision) and the bindings that never change (a passage's source,
 * a translation's passage and language). These are research records, never rulings. Original text
 * lives only in passages; translations are separate records and never override the original.
 */

const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value.trim().length > 0, 'must not be blank');
const optionalText = (max: number) => text(max).nullable();
/** BCP 47-style language tag of the ORIGINAL text (e.g. `ar`, `fa`, `ur`). */
const languageTag = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/, 'language tag');
const httpsUrl = z
  .string()
  .max(2000)
  .regex(/^https:\/\/[^\s]+$/, 'https URL');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

/** Copyright status of a source or an evidence item (D10). */
export const COPYRIGHT_STATUSES = ['UNKNOWN', 'PERMITTED', 'RESTRICTED', 'EXCERPTS_ONLY'] as const;

/** Source classes and tiers as SOURCE_INVENTORY.md §1 defines them (Tier 4 is never authority). */
export const SOURCE_CLASSES = [
  'OFFICE_OWN',
  'OFFICE_OTHER',
  'STATE_OFFICIAL',
  'NEWS',
  'COMMUNITY',
  'REFERENCE',
  /**
   * Decision 81: a document a scholar provided that the owner accepted as a research source
   * (e.g. the Al-Bi'that Trust khums form). AI may transcribe it; it never verifies anything.
   */
  'SCHOLAR_PROVIDED',
] as const;

export const TRANSLATION_LANGUAGES = ['en', 'ur'] as const;

/** A research source: one book edition, istifta' page or office letter, with what is known of it. */
export const sourcePayloadSchema = z.strictObject({
  title: z.strictObject({ original: text(500), translation: optionalText(500) }),
  originalLanguage: languageTag,
  sourceClass: z.enum(SOURCE_CLASSES),
  sourceTier: z.int().min(1).max(4),
  publisher: optionalText(300),
  edition: optionalText(300),
  publicationDate: z.strictObject({ original: optionalText(100), gregorian: isoDate.nullable() }),
  url: httpsUrl.nullable(),
  authorship: z.strictObject({
    statedAuthor: optionalText(300),
    establishedBy: optionalText(500),
    status: z.enum(['UNVERIFIED', 'ESTABLISHED', 'DISPUTED', 'NOT_ESTABLISHED']),
  }),
  authenticity: z.strictObject({
    status: z.enum(['UNVERIFIED', 'AUTHENTIC', 'QUESTIONABLE', 'NOT_AUTHENTIC']),
    compareWith: z.array(text(300)).max(20),
  }),
  accessStatus: z.enum([
    'NOT_YET_ACCESSED',
    'READABLE',
    'ACCESS_BLOCKED',
    'NOT_FOUND',
    'ARCHIVED_COPY_AVAILABLE',
  ]),
  copyright: z.enum(COPYRIGHT_STATUSES),
  /** Only from a scholar's recorded decision (REVIEW_PROCESS.md §14.6). */
  canonicalForMarja: z.enum(['UNDECIDED', 'CANONICAL', 'NON_CANONICAL']),
  notes: optionalText(4000),
});

/** An exact locator inside the source; at least one precise position is required. */
export const passageLocatorSchema = z
  .strictObject({
    volume: z.int().min(1).max(10_000).nullable(),
    page: optionalText(40),
    masalah: optionalText(40),
    istiftaId: optionalText(100),
    section: optionalText(300),
    /** Paragraph within the page or section (M5.3.7); optional, absent in earlier passages. */
    paragraph: optionalText(40).exactOptional(),
    url: httpsUrl.nullable(),
  })
  .refine(
    (l) =>
      l.page !== null ||
      l.masalah !== null ||
      l.istiftaId !== null ||
      l.section !== null ||
      (l.paragraph ?? null) !== null ||
      l.url !== null,
    'a locator needs a page, masalah, istifta id, section, paragraph or URL',
  );

/** Maximum length of a verbatim excerpt (D10: excerpts, never complete works). */
export const PASSAGE_TEXT_MAX = 8000;

/** A verbatim original-language excerpt at an exact locator. Cites one source revision. */
export const passagePayloadSchema = z.strictObject({
  locator: passageLocatorSchema,
  originalLanguage: languageTag,
  /** Verbatim; copied exactly, including conditions and cross-references. */
  text: text(PASSAGE_TEXT_MAX),
  /** The exact words that indicate a fatwa or a precaution, or null when none are stated. */
  precautionWording: optionalText(1000),
  notes: optionalText(4000),
});

/** An English or Urdu translation of one passage revision. The original always governs. */
export const translationPayloadSchema = z.strictObject({
  language: z.enum(TRANSLATION_LANGUAGES),
  text: text(12_000),
  /** The translator as declared by the scholar (a person, or the scholar). */
  translator: text(200),
  notes: optionalText(4000),
});

// ---- Evidence artefacts (write-once metadata; bytes in private storage) ----

// ---- Findings and rulings (M5.3.4) ----

/** How the cited text states the obligation (finding template; recorded, never inferred). */
export const PRECAUTION_LEVELS = [
  'FATWA',
  'OBLIGATORY_PRECAUTION',
  'RECOMMENDED_PRECAUTION',
  'UNDETERMINED',
] as const;

const statements = z.array(text(2000)).max(30);

/**
 * A research finding (layer A): the authorized scholar's documented conclusion on one catalogue
 * question for one Marja. Shape only; `@khums/core` enforces the citation rules (D14: one or more
 * exact passage revisions, translations only of cited passages, never a source directly).
 */
export const findingPayloadSchema = z.strictObject({
  /** Language the scholar wrote this finding in (the cited passages keep their own originals). */
  language: languageTag,
  /** Neutral description of the situation the finding concerns, or null. */
  scenario: optionalText(2000),
  conclusion: text(4000),
  explanation: text(12_000),
  precaution: z.enum(PRECAUTION_LEVELS),
  conditions: statements,
  exceptions: statements,
  qualifications: statements,
  /** Open questions for the scholar or the office (phrased as questions). */
  unresolvedIssues: statements,
  notes: optionalText(4000),
});

/**
 * A religious ruling version (layer B), written by the authorized scholar from APPROVED findings of
 * the same Marja. Shape only; `@khums/core` enforces its references (findings and passages
 * required). Nothing here is generated: a ruling exists only as the scholar authors it.
 */
export const rulingPayloadSchema = z.strictObject({
  language: languageTag,
  conclusion: text(4000),
  explanation: text(12_000),
  precaution: z.enum(PRECAUTION_LEVELS),
  conditions: statements,
  exceptions: statements,
  notes: optionalText(4000),
});

/** Media types accepted as evidence (checked against the file's leading bytes by the API). */
export const EVIDENCE_MEDIA_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/html',
] as const;

/** Largest evidence file accepted (bytes). */
export const EVIDENCE_MAX_BYTES = 2 * 1024 * 1024;

const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'lowercase SHA-256 hex');
const timestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'ISO 8601 UTC with milliseconds');

/**
 * Metadata of one archived evidence file. Write-once: never updated or deleted. The bytes are in
 * private encrypted storage under `storageKey`; every retrieval re-verifies `digest`.
 */
export const evidenceArtefactSchema: z.ZodType<EvidenceArtefact> = z.strictObject({
  artefactId: uuidV7Schema,
  marjaId: researchMarjaIdSchema,
  sourceId: uuidV7Schema,
  /** The source revision the evidence was attached at. */
  sourceRevision: z.int().min(0),
  digest: sha256,
  size: z.int().min(1).max(EVIDENCE_MAX_BYTES),
  mediaType: z.enum(EVIDENCE_MEDIA_TYPES),
  storageKey: z.string().regex(/^[a-z][a-z0-9-]{0,62}\/[0-9a-f]{64}$/),
  copyright: z.enum(COPYRIGHT_STATUSES),
  /** COMPLETE only with copyright PERMITTED (D10). */
  extent: z.enum(['EXCERPT', 'COMPLETE']),
  description: text(500),
  recordedBy: identifierSchema,
  recordedAt: timestamp,
  decisionId: z.string().min(1).max(200),
  requestId: z.string().min(1).max(200),
});
