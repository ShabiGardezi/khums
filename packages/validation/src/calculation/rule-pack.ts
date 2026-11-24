import { z } from 'zod';

import type {
  Condition,
  Expression,
  Program,
  RulePack,
  RulePackActivation,
} from '@khums/shared-types';

import { decimalStringSchema } from '../decimal';
import { factMappingSchema } from './fact-mapping';
import { idListSchema, identifierSchema, isoDateSchema, roundingModeSchema } from './common';

/** An exact research ruling version: `<ruling entity id (UUIDv7)>@<version>` (M5.3.6, D13). */
export const rulingVersionRefSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@[1-9]\d{0,4}$/,
    'Must be <ruling uuidv7>@<version>',
  );

/**
 * Structural schema for rule-pack files (strict: unknown fields rejected). Semantic checks
 * (references, value kinds, readiness for production) are done by @khums/calculation-engine.
 */

const roundingSpecSchema = z.strictObject({
  scale: z.union([z.int().min(0).max(30), z.literal('currency')]),
  mode: roundingModeSchema,
});

export const expressionSchema: z.ZodType<Expression> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.strictObject({ op: z.literal('sumCategories'), categoryIds: idListSchema.min(1) }),
    z.strictObject({ op: z.literal('parameter'), parameterId: identifierSchema }),
    z.strictObject({ op: z.literal('step'), stepId: identifierSchema }),
    z.strictObject({ op: z.literal('zero') }),
    z.strictObject({ op: z.literal('add'), operands: z.array(expressionSchema).min(1) }),
    z.strictObject({
      op: z.literal('subtract'),
      minuend: expressionSchema,
      subtrahends: z.array(expressionSchema).min(1),
    }),
    z.strictObject({
      op: z.literal('multiply'),
      value: expressionSchema,
      factor: expressionSchema,
    }),
    z.strictObject({ op: z.literal('percentage'), of: expressionSchema, rate: expressionSchema }),
    z.strictObject({ op: z.literal('max'), operands: z.array(expressionSchema).min(1) }),
    z.strictObject({ op: z.literal('min'), operands: z.array(expressionSchema).min(1) }),
    // Decision 82: division always states its rounding.
    z.strictObject({
      op: z.literal('divide'),
      dividend: expressionSchema,
      divisor: expressionSchema,
      rounding: roundingSpecSchema,
    }),
    z.strictObject({
      op: z.literal('when'),
      condition: conditionSchema,
      then: expressionSchema,
      otherwise: expressionSchema,
    }),
    z.strictObject({ op: z.literal('consult'), consultationId: identifierSchema }),
  ]),
);

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('answer'),
      questionId: identifierSchema,
      equals: z.union([z.boolean(), z.string().min(1)]),
    }),
    z.strictObject({
      kind: z.literal('compare'),
      left: expressionSchema,
      operator: z.enum(['lt', 'lte', 'eq', 'gte', 'gt']),
      right: expressionSchema,
    }),
    // Phase 4 (decision 78): the annual period's length in days (engine checks annual only).
    z.strictObject({
      kind: z.literal('periodDays'),
      operator: z.enum(['lt', 'lte', 'eq', 'gte', 'gt']),
      days: z.int().min(1).max(100_000),
    }),
    z.strictObject({ kind: z.literal('all'), conditions: z.array(conditionSchema).min(1) }),
    z.strictObject({ kind: z.literal('any'), conditions: z.array(conditionSchema).min(1) }),
    z.strictObject({ kind: z.literal('not'), condition: conditionSchema }),
  ]),
);

export const programSchema: z.ZodType<Program> = z.strictObject({
  steps: z
    .array(
      z.strictObject({
        id: identifierSchema,
        label: z.string().min(1).max(300),
        ruleIds: idListSchema,
        expression: expressionSchema,
        rounding: roundingSpecSchema.nullable(),
      }),
    )
    .min(1)
    .max(500),
  outputs: z
    .array(
      z.strictObject({
        id: identifierSchema,
        label: z.string().min(1).max(300),
        stepId: identifierSchema,
      }),
    )
    .min(1),
});

/**
 * Content integrity record (M4.4.2; RULE_PACK_STRUCTURE §5.8). The shape is validated here; the
 * digest itself is always recomputed and compared by the engine, never trusted.
 */
/** Release channels of schemaVersion 3 packs (M4.5a). */
export const RELEASE_CHANNELS = ['SCHOLAR_REVIEW', 'PRODUCTION'] as const;

export const contentIntegritySchema = z.strictObject({
  algorithm: z.literal('SHA-256'),
  canonicalization: z.literal('khums-jcs-1'),
  scope: z.literal('rule-pack-content-1'),
  digest: z.string().regex(/^[0-9a-f]{64}$/, 'Must be 64 lowercase hexadecimal characters'),
});

const approvalSchema = z.strictObject({
  role: z.enum(['SCHOLAR_REVIEWER', 'APPROVER', 'GOVERNING_SCHOLAR', 'SOURCE_VERIFIER']),
  reviewerId: identifierSchema,
  approvedAt: isoDateSchema,
  reference: z.string().min(1).max(500),
  integrity: contentIntegritySchema.optional(),
});

const labelled = { id: identifierSchema, label: z.string().min(1).max(300), ruleIds: idListSchema };

const digestHex = z.string().regex(/^[0-9a-f]{64}$/);
const snapshotId = z.string().min(1).max(100);
const revisionNumber = z.number().int().min(0).max(10_000);
const snapshotObject = z.record(z.string(), z.unknown());

/** Server-computed provenance of one cited ruling version (M5.3.6, D13 §9.3). */
export const rulingSnapshotSchema = z.strictObject({
  ref: rulingVersionRefSchema,
  marjaId: identifierSchema,
  displayRef: snapshotId,
  rulingSeriesId: snapshotId,
  rulingVersion: z.number().int().min(1),
  state: z.enum(['DRAFT', 'APPROVED']),
  contentRevision: revisionNumber,
  payloadDigest: digestHex,
  contentRecordDigest: digestHex,
  payload: snapshotObject,
  findings: z
    .array(
      z.strictObject({
        entityId: snapshotId,
        displayRef: snapshotId,
        revision: revisionNumber,
        recordDigest: digestHex,
        contentRevision: revisionNumber,
        payloadDigest: digestHex,
        questionId: snapshotId,
        passageRefs: z.array(z.string().min(1).max(120)).max(200),
      }),
    )
    .max(200),
  passages: z
    .array(
      z.strictObject({
        entityId: snapshotId,
        displayRef: snapshotId,
        revision: revisionNumber,
        recordDigest: digestHex,
        contentRevision: revisionNumber,
        payloadDigest: digestHex,
        locator: snapshotObject,
        originalLanguage: z.string().min(1).max(40),
        text: z.string().max(20_000).nullable(),
        source: z.strictObject({
          entityId: snapshotId,
          displayRef: snapshotId,
          revision: revisionNumber,
          recordDigest: digestHex,
          title: z.string().min(1).max(1000),
          copyright: z.string().min(1).max(40),
        }),
      }),
    )
    .max(400),
});

export const rulePackSchema: z.ZodType<RulePack> = z
  .strictObject({
    metadata: z.strictObject({
      packId: identifierSchema,
      marjaId: identifierSchema,
      version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semantic version MAJOR.MINOR.PATCH'),
      schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      // schemaVersion 3 only (M4.5a). Hashed content: never added to version 1–2 packs.
      releaseChannel: z.enum(RELEASE_CHANNELS).exactOptional(),
      title: z.string().min(1).max(300),
      status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'WITHDRAWN']),
      isMock: z.boolean(),
      effectiveFrom: isoDateSchema,
      effectiveTo: isoDateSchema.nullable(),
      contentHash: z
        .string()
        .regex(/^sha256:[a-f0-9]{64}$/)
        .nullable(),
      integrity: contentIntegritySchema.optional(),
      researchBaseline: z.string().min(1).max(300).nullable(),
      approvals: z.array(approvalSchema).max(50),
      supersedes: z.string().min(1).max(100).nullable(),
    }),
    sources: z
      .array(
        z.strictObject({
          id: identifierSchema,
          title: z.string().min(1).max(500),
          url: z.url().nullable(),
          locator: z.string().min(1).max(300).nullable(),
          // M5.4: tool-assisted locator check (optional; hashed when present).
          locatorCheck: z.enum(['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED']).exactOptional(),
        }),
      )
      .max(1000),
    rules: z
      .array(
        z.strictObject({
          id: identifierSchema,
          status: z.enum(['DRAFT', 'UNVERIFIED', 'APPROVED', 'SUPERSEDED']),
          summary: z.string().min(1).max(5000),
          sourceRefs: idListSchema,
          // Research ruling versions as `<ruling uuidv7>@<version>` (M5.3.6; resolved by the API
          // against the research store); legacy identifiers still parse and are refused there.
          rulingRefs: z.array(z.union([identifierSchema, rulingVersionRefSchema])).max(200),
          // M5.4 (optional; hashed when present): catalogue questions and open research issues.
          questionIds: z
            .array(z.string().regex(/^[A-Z]{3}-\d{2}$/))
            .max(70)
            .exactOptional(),
          openIssues: z.array(z.string().min(1).max(1000)).max(50).exactOptional(),
        }),
      )
      .max(1000),
    inputCategories: z.array(z.strictObject(labelled)).max(500),
    questions: z
      .array(
        z.strictObject({
          ...labelled,
          kind: z.enum(['boolean', 'choice', 'decimal']),
          // Decision 82: what a decimal answer is (absent: a percentage).
          unit: z.enum(['PERCENT', 'AMOUNT']).exactOptional(),
          choices: z.array(z.string().min(1).max(100)).max(50),
          required: z.boolean(),
        }),
      )
      .max(500),
    parameters: z.array(z.strictObject({ ...labelled, value: decimalStringSchema })).max(500),
    consultations: z.array(z.strictObject(labelled)).max(500),
    workflows: z.strictObject({
      annual: programSchema.nullable(),
      firstTime: programSchema.nullable(),
      missedYear: z
        .strictObject({
          perYear: programSchema,
          aggregateOutputIds: idListSchema,
          aggregateRuleIds: idListSchema,
        })
        .nullable(),
    }),
    factMapping: factMappingSchema.optional(),
    rulingSnapshots: z.array(rulingSnapshotSchema).max(200).exactOptional(),
  })
  .superRefine((pack, ctx) => {
    // Schema version 2 adds the fact mapping; version 1 packs must not carry one (compatibility).
    const version = pack.metadata.schemaVersion;
    if (version === 1 && pack.factMapping !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['factMapping'],
        message: 'A fact mapping requires metadata.schemaVersion 2',
      });
    }
    // Schema version 3 adds the release channel (required); versions 1–2 never carry one.
    if (version === 3 && pack.metadata.releaseChannel === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['metadata', 'releaseChannel'],
        message: 'Schema version 3 packs must declare a release channel',
      });
    }
    if (version !== 3 && pack.metadata.releaseChannel !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['metadata', 'releaseChannel'],
        message: 'A release channel requires metadata.schemaVersion 3',
      });
    }
    if (version === 2 && pack.factMapping === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['factMapping'],
        message: 'Schema version 2 packs must declare a fact mapping',
      });
    }
  }) as z.ZodType<RulePack>;

export const rulePackActivationSchema: z.ZodType<RulePackActivation> = z.strictObject({
  packId: identifierSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  integrity: contentIntegritySchema,
  activatedAt: isoDateSchema,
  activatedBy: identifierSchema,
  approvalReferences: z.array(z.string().min(1).max(500)).min(1).max(50),
  publicationReference: z.string().min(1).max(500),
});
