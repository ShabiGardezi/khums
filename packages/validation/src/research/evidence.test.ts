import { describe, expect, it } from 'vitest';

import {
  createResearchRecordRequestSchema,
  createRulingVersionRequestSchema,
  evidenceListQuerySchema,
  researchListQuerySchema,
  researchTransitionParamsSchema,
  researchTransitionRequestSchema,
  reviseResearchRecordRequestSchema,
  uploadEvidenceRequestSchema,
} from '../api/research';
import { integrityChainIdSchema } from '../integrity';
import {
  EVIDENCE_MAX_BYTES,
  evidenceArtefactSchema,
  findingPayloadSchema,
  PASSAGE_TEXT_MAX,
  passagePayloadSchema,
  rulingPayloadSchema,
  sourcePayloadSchema,
  translationPayloadSchema,
} from './evidence';

/** Evidence-layer contracts (M5.3.3). SYNTHETIC placeholder values only. */

const UUID = '01936b2e-7c4a-7d3e-9f10-1a2b3c4d5e6f';
const SOURCE = {
  title: { original: 'TEST source title', translation: null },
  originalLanguage: 'ar',
  sourceClass: 'REFERENCE',
  sourceTier: 4,
  publisher: null,
  edition: null,
  publicationDate: { original: null, gregorian: null },
  url: null,
  authorship: { statedAuthor: null, establishedBy: null, status: 'UNVERIFIED' },
  authenticity: { status: 'UNVERIFIED', compareWith: [] },
  accessStatus: 'NOT_YET_ACCESSED',
  copyright: 'UNKNOWN',
  canonicalForMarja: 'UNDECIDED',
  notes: null,
};
const PASSAGE = {
  locator: { volume: 1, page: null, masalah: '7', istiftaId: null, section: null, url: null },
  originalLanguage: 'fa',
  text: 'TEST excerpt placeholder',
  precautionWording: null,
  notes: null,
};
const TRANSLATION = { language: 'ur', text: 'TEST', translator: 'test-translator', notes: null };

describe('evidence payloads', () => {
  it('accept well-formed synthetic records', () => {
    expect(sourcePayloadSchema.safeParse(SOURCE).success).toBe(true);
    expect(passagePayloadSchema.safeParse(PASSAGE).success).toBe(true);
    expect(translationPayloadSchema.safeParse(TRANSLATION).success).toBe(true);
  });

  it('are strict and bounded (excerpts, never complete works; http URLs refused)', () => {
    for (const bad of [
      { ...SOURCE, extra: 1 },
      { ...SOURCE, sourceTier: 5 },
      { ...SOURCE, url: 'http://example.test/page' },
      { ...SOURCE, copyright: 'FREE' },
      { ...SOURCE, title: { original: ' ', translation: null } },
    ]) {
      expect(sourcePayloadSchema.safeParse(bad).success).toBe(false);
    }
    for (const bad of [
      { ...PASSAGE, text: 'x'.repeat(PASSAGE_TEXT_MAX + 1) },
      { ...PASSAGE, locator: { ...PASSAGE.locator, masalah: null, volume: null } },
      { ...PASSAGE, originalLanguage: 'Arabic' },
    ]) {
      expect(passagePayloadSchema.safeParse(bad).success).toBe(false);
    }
    for (const bad of [
      { ...TRANSLATION, language: 'ar' },
      { ...TRANSLATION, original: 'TEST' },
    ]) {
      expect(translationPayloadSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('evidence artefact metadata', () => {
  const artefact = {
    artefactId: UUID,
    marjaId: 'sistani',
    sourceId: UUID,
    sourceRevision: 0,
    digest: 'a'.repeat(64),
    size: 10,
    mediaType: 'application/pdf',
    storageKey: `sistani/${'a'.repeat(64)}`,
    copyright: 'EXCERPTS_ONLY',
    extent: 'EXCERPT',
    description: 'TEST page',
    recordedBy: 'test-scholar',
    recordedAt: '2026-11-22T10:00:00.000Z',
    decisionId: 'd',
    requestId: 'r',
  };
  it('accepts write-once metadata and refuses traversal-shaped keys and oversize files', () => {
    expect(evidenceArtefactSchema.safeParse(artefact).success).toBe(true);
    for (const bad of [
      { ...artefact, storageKey: '../etc/passwd' },
      { ...artefact, storageKey: `sistani/../${'a'.repeat(64)}` },
      { ...artefact, size: EVIDENCE_MAX_BYTES + 1 },
      { ...artefact, mediaType: 'application/x-msdownload' },
      { ...artefact, extra: true },
    ]) {
      expect(evidenceArtefactSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('research API contracts', () => {
  const content = { payload: {}, references: [], aiInvolvement: [] };

  it('are strict: no actor, time, digest, display ref or record revision from the client', () => {
    const create = { marjaId: 'sistani', ...content };
    expect(createResearchRecordRequestSchema.safeParse(create).success).toBe(true);
    for (const extra of [
      { actor: { kind: 'STAFF_PRINCIPAL', subject: 'x' } },
      { recordedAt: '2026-01-01T00:00:00.000Z' },
      { entityId: UUID },
      { displayRef: 'S-sistani-7K3QX9MZ' },
      { revision: 0 },
      { expectedRevision: 1 },
    ]) {
      expect(createResearchRecordRequestSchema.safeParse({ ...create, ...extra }).success).toBe(
        false,
      );
    }
    expect(
      reviseResearchRecordRequestSchema.safeParse({ expectedRevision: 1, ...content }).success,
    ).toBe(true);
    expect(reviseResearchRecordRequestSchema.safeParse(content).success).toBe(false);
    expect(
      reviseResearchRecordRequestSchema.safeParse({
        expectedRevision: 1,
        marjaId: 'khamenei',
        ...content,
      }).success,
    ).toBe(false);
    expect(
      researchTransitionRequestSchema.safeParse({ expectedRevision: 2, reason: null }).success,
    ).toBe(true);
    expect(
      researchTransitionRequestSchema.safeParse({ expectedRevision: 0, reason: null }).success,
    ).toBe(false);
  });

  it('routes only the research types and transitions (findings and rulings since M5.3.4)', () => {
    for (const good of [
      { type: 'sources', id: UUID, action: 'verify' },
      { type: 'findings', id: UUID, action: 'approve' },
      { type: 'rulings', id: UUID, action: 'withdraw' },
    ]) {
      expect(researchTransitionParamsSchema.safeParse(good).success).toBe(true);
    }
    for (const bad of [
      { type: 'opinions', id: UUID, action: 'verify' },
      { type: 'sources', id: UUID, action: 'publish' },
      { type: 'sources', id: UUID, action: 'revise' },
      { type: 'sources', id: 'not-a-uuid', action: 'verify' },
    ]) {
      expect(researchTransitionParamsSchema.safeParse(bad).success).toBe(false);
    }
    expect(researchListQuerySchema.safeParse({ marjaId: 'sistani', state: 'DRAFT' }).success).toBe(
      true,
    );
    expect(researchListQuerySchema.safeParse({ state: 'PUBLISHED' }).success).toBe(false);
    expect(evidenceListQuerySchema.safeParse({ sourceId: UUID, extra: 1 }).success).toBe(false);
  });

  it('bounds evidence uploads and needs the client digest', () => {
    const upload = {
      sourceId: UUID,
      mediaType: 'text/plain',
      sha256: 'b'.repeat(64),
      copyright: 'EXCERPTS_ONLY',
      extent: 'EXCERPT',
      description: 'TEST note',
      contentBase64: 'VEVTVA==', // base64 of "TEST"
    };
    expect(uploadEvidenceRequestSchema.safeParse(upload).success).toBe(true);
    for (const bad of [
      { ...upload, sha256: 'B'.repeat(64) },
      { ...upload, contentBase64: 'not base64!' },
      { ...upload, contentBase64: 'A'.repeat(Math.ceil(EVIDENCE_MAX_BYTES / 3) * 4 + 4) },
      { ...upload, marjaId: 'khamenei' },
      { ...upload, storageKey: 'sistani/x' },
    ]) {
      expect(uploadEvidenceRequestSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('accepts research chain ids for integrity checkpoints', () => {
    expect(integrityChainIdSchema.safeParse(`research:source:${UUID}`).success).toBe(true);
    expect(integrityChainIdSchema.safeParse(`research:translation:${UUID}`).success).toBe(true);
    for (const bad of ['research:source:x', `research:other:${UUID}`, `research:${UUID}`]) {
      expect(integrityChainIdSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('finding and ruling payloads (M5.3.4)', () => {
  const finding = {
    language: 'en',
    scenario: null,
    conclusion: 'TEST conclusion',
    explanation: 'TEST explanation',
    precaution: 'UNDETERMINED',
    conditions: ['TEST condition'],
    exceptions: [],
    qualifications: [],
    unresolvedIssues: ['TEST question?'],
    notes: null,
  };
  const ruling = {
    language: 'ur',
    conclusion: 'TEST conclusion',
    explanation: 'TEST explanation',
    precaution: 'FATWA',
    conditions: [],
    exceptions: ['TEST exception'],
    notes: null,
  };

  it('accepts complete payloads', () => {
    expect(findingPayloadSchema.safeParse(finding).success).toBe(true);
    expect(rulingPayloadSchema.safeParse(ruling).success).toBe(true);
  });

  it('is strict, requires a conclusion and explanation, and bounds lists', () => {
    expect(findingPayloadSchema.safeParse({ ...finding, citations: [] }).success).toBe(false);
    expect(findingPayloadSchema.safeParse({ ...finding, conclusion: '  ' }).success).toBe(false);
    expect(rulingPayloadSchema.safeParse({ ...ruling, explanation: '' }).success).toBe(false);
    expect(rulingPayloadSchema.safeParse({ ...ruling, precaution: 'PROBABLY' }).success).toBe(
      false,
    );
    expect(
      findingPayloadSchema.safeParse({ ...finding, conditions: Array(31).fill('TEST') }).success,
    ).toBe(false);
    // A ruling carries no finding-only fields.
    expect(rulingPayloadSchema.safeParse({ ...ruling, qualifications: [] }).success).toBe(false);
  });
});

describe('ruling version contracts (M5.3.5)', () => {
  it('requires expectedRevision and rejects server-derived fields', () => {
    const body = { expectedRevision: 2, payload: {}, references: [], aiInvolvement: [] };
    expect(createRulingVersionRequestSchema.safeParse(body).success).toBe(true);
    for (const extra of [{ rulingVersion: 2 }, { rulingSeriesId: UUID }, { marjaId: 'sistani' }]) {
      expect(createRulingVersionRequestSchema.safeParse({ ...body, ...extra }).success).toBe(false);
    }
    expect(
      createRulingVersionRequestSchema.safeParse({ ...body, expectedRevision: 0 }).success,
    ).toBe(false);
  });
});
