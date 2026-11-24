import { describe, expect, it } from 'vitest';

import {
  aiDeclarationRefSchema,
  aiInvolvementSchema,
  researchCommandSchema,
  researchDisplayRefSchema,
  researchPayloadSchema,
  researchReferenceSchema,
  researchRevisionRecordSchema,
  uuidV7Schema,
} from './index';

/** Research record contracts (M5.3.2). Placeholder values only; no religious content. */

const UUID = '01936b2e-7c4a-7d3e-9f10-1a2b3c4d5e6f';
const reference = {
  entityType: 'PASSAGE',
  entityId: UUID,
  revision: 2,
  rulingVersion: null,
  marjaId: 'sistani',
};
const ai = {
  assistance: 'TRANSLATION_DRAFT',
  field: 'payload.text',
  generation: 'AI_GENERATED',
  tool: 'test-tool',
  occurredAt: '2026-11-22T10:00:00.000Z',
  scholarReview: 'REVIEWED_CORRECTED',
};
const record = {
  entityType: 'FINDING',
  entityId: UUID,
  displayRef: 'F-sistani-INC-01-7K3QX9MZ',
  marjaId: 'sistani',
  rulingVersion: null,
  question: { id: 'INC-01', catalogueRevision: 'research-matrix-rev5-required' },
  revision: 0,
  recordId: `${UUID}#0`,
  kind: 'CREATED',
  payload: { placeholder: 'TEST' },
  payloadDigest: 'a'.repeat(64),
  references: [reference],
  aiInvolvement: [ai],
  actor: { kind: 'STAFF_PRINCIPAL', subject: 'test-scholar' },
  recordedAt: '2026-11-22T10:00:00.000Z',
  reason: null,
  decisionId: 'd-1',
  requestId: 'r-1',
  previousRecordDigest: null,
  recordDigest: 'b'.repeat(64),
};

describe('identifiers', () => {
  it('accepts only lowercase UUIDv7', () => {
    expect(uuidV7Schema.safeParse(UUID).success).toBe(true);
    for (const bad of [
      UUID.toUpperCase(),
      '01936b2e-7c4a-4d3e-9f10-1a2b3c4d5e6f', // version 4
      '01936b2e-7c4a-7d3e-1f10-1a2b3c4d5e6f', // wrong variant
      'not-a-uuid',
    ]) {
      expect(uuidV7Schema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('accepts readable references of the documented shapes only', () => {
    for (const ok of ['S-sistani-7K3QX9MZ', 'R-khamenei-00000000', 'F-sistani-CTQ-08-ABCDEFGH']) {
      expect(researchDisplayRefSchema.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of [
      'X-sistani-7K3QX9MZ',
      'S-Sistani-7K3QX9MZ',
      'S-sistani-7K3QX9MI',
      'F-sistani-7K3QX9MZ',
    ]) {
      expect(researchDisplayRefSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('records', () => {
  it('accepts a well-formed revision record', () => {
    expect(researchRevisionRecordSchema.safeParse(record).success).toBe(true);
  });

  it('is strict and bounded', () => {
    for (const bad of [
      { ...record, extra: true },
      { ...record, actor: { kind: 'VERIFIED', subject: 'x' } },
      // Research records are staff-written only (audit P4).
      { ...record, actor: { kind: 'UNVERIFIED_REFERENCE', subject: 'test-someone' } },
      { ...record, reason: ' padded ' },
      { ...record, reason: 'ab' },
      { ...record, recordedAt: '2026-11-22T10:00:00Z' },
      { ...record, marjaId: 'Sistani' },
      { ...record, question: { id: 'INC-1', catalogueRevision: 'x' } },
      { ...record, kind: 'EDITED' },
    ]) {
      expect(researchRevisionRecordSchema.safeParse(bad).success).toBe(false);
    }
    expect(researchPayloadSchema.safeParse({ text: 'x'.repeat(60_001) }).success).toBe(false);
  });

  it('pins references and records AI involvement in detail (never a boolean)', () => {
    expect(researchReferenceSchema.safeParse({ ...reference, revision: -1 }).success).toBe(false);
    expect(researchReferenceSchema.safeParse({ ...reference, extra: 1 }).success).toBe(false);
    expect(aiInvolvementSchema.safeParse(ai).success).toBe(true);
    for (const bad of [
      { ...ai, scholarReview: 'APPROVED' },
      { ...ai, assistance: 'RULING_GENERATION' },
      { ...ai, generation: true },
      { ...ai, field: '' },
    ]) {
      expect(aiInvolvementSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('AI declaration corrections (shape)', () => {
  const identity = {
    assistance: 'OCR_TEXT_EXTRACTION',
    field: 'payload.text',
    generation: 'AI_GENERATED',
    tool: 'test-tool-misnamed',
    occurredAt: '2026-11-22T09:00:00.000Z',
  };
  const correction = {
    ...ai,
    scholarReview: 'NOT_REVIEWED',
    correctionOf: identity,
    correctionReason: 'TEST tool name recorded incorrectly',
  };

  it('accepts a correction linking the original identity, with a reason', () => {
    expect(aiInvolvementSchema.safeParse(correction).success).toBe(true);
    expect(aiDeclarationRefSchema.safeParse(identity).success).toBe(true);
  });

  it('is strict: one encoding (absent, never null), exact identity, bounded reason', () => {
    for (const bad of [
      { ...correction, correctionOf: null },
      { ...correction, correctionReason: null },
      { ...correction, correctionOf: { ...identity, scholarReview: 'NOT_REVIEWED' } },
      { ...correction, correctionOf: { ...identity, tool: '' } },
      { ...correction, correctionReason: 'ab' },
      { ...correction, correctionReason: ' padded ' },
      { ...correction, correctionReason: 'x'.repeat(501) },
    ]) {
      expect(aiInvolvementSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('commands', () => {
  const create = {
    type: 'CREATE',
    entityType: 'FINDING',
    entityId: UUID,
    marjaId: 'sistani',
    rulingVersion: null,
    questionId: 'INC-01',
    payload: { placeholder: 'TEST' },
    references: [],
    aiInvolvement: [],
  };

  it('accepts commands without server-derived fields', () => {
    expect(researchCommandSchema.safeParse(create).success).toBe(true);
    expect(
      researchCommandSchema.safeParse({
        type: 'TRANSITION',
        expectedRevision: 2,
        kind: 'APPROVED',
        reason: null,
      }).success,
    ).toBe(true);
    expect(
      researchCommandSchema.safeParse({
        type: 'REVISE',
        expectedRevision: 1,
        payload: {},
        references: [],
        aiInvolvement: [],
      }).success,
    ).toBe(true);
  });

  it('requires an integer expectedRevision ≥ 1 on REVISE and TRANSITION, never on CREATE (audit P1)', () => {
    const revise = { type: 'REVISE', payload: {}, references: [], aiInvolvement: [] };
    const transition = { type: 'TRANSITION', kind: 'VERIFIED', reason: null };
    for (const command of [revise, transition]) {
      expect(researchCommandSchema.safeParse(command).success).toBe(false);
      for (const expectedRevision of [0, -1, 1.5, '2', null, 10_001]) {
        expect(researchCommandSchema.safeParse({ ...command, expectedRevision }).success).toBe(
          false,
        );
      }
    }
    expect(researchCommandSchema.safeParse({ ...create, expectedRevision: 1 }).success).toBe(false);
  });

  it('refuses client-supplied actors, times, revisions, digests, display refs and Marja changes', () => {
    for (const extra of [
      { actor: { kind: 'STAFF_PRINCIPAL', subject: 'someone' } },
      { recordedAt: '2026-01-01T00:00:00.000Z' },
      { revision: 3 },
      { recordDigest: 'c'.repeat(64) },
      { displayRef: 'F-sistani-INC-01-7K3QX9MZ' },
    ]) {
      expect(researchCommandSchema.safeParse({ ...create, ...extra }).success).toBe(false);
    }
    expect(
      researchCommandSchema.safeParse({
        type: 'REVISE',
        expectedRevision: 1,
        marjaId: 'khamenei',
        payload: {},
        references: [],
        aiInvolvement: [],
      }).success,
    ).toBe(false);
    expect(
      researchCommandSchema.safeParse({
        type: 'TRANSITION',
        expectedRevision: 1,
        kind: 'CREATED',
        reason: null,
      }).success,
    ).toBe(false);
  });
});
