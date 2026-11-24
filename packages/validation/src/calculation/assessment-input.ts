import { z } from 'zod';

import type { AssessmentInput, FactAnswers, YearAnswers } from '@khums/shared-types';

import { decimalStringSchema } from '../decimal';
import { identifierSchema, isoDateSchema } from './common';

/** Structural schema for assessment inputs (strict request contract). */

const entrySchema = z.strictObject({
  id: identifierSchema,
  categoryId: identifierSchema,
  amount: decimalStringSchema,
  date: isoDateSchema.nullable(),
  description: z.string().max(500).nullable(),
  // Phase 4 (decision 78): set by a pack's fact mapping only.
  adjustment: z
    .strictObject({ mode: z.enum(['ADD_PERCENT', 'PERCENT']), percent: decimalStringSchema })
    .exactOptional(),
  // Decision 82: percentages applied in order.
  adjustments: z
    .array(
      z.strictObject({ mode: z.enum(['ADD_PERCENT', 'PERCENT']), percent: decimalStringSchema }),
    )
    .min(1)
    .max(5)
    .exactOptional(),
});

const periodSchema = z.strictObject({ start: isoDateSchema, end: isoDateSchema });

export const answersSchema = z.record(
  identifierSchema,
  z.union([z.boolean(), z.string().min(1).max(100)]),
);

/**
 * Per-entry answers keyed by fact id (audit 2026-11-23 T5: sent to the server so it maps the
 * entries itself). Binding to workflow, kind and subtype is re-checked by the mapping.
 */
export const factAnswersSchema: z.ZodType<FactAnswers> = z.record(
  z.string().min(1).max(100),
  z.strictObject({
    workflow: z.enum(['annual', 'first-time', 'missed-year']),
    kind: z.enum(['ASSET', 'BALANCE', 'INCOME', 'EXPENSE', 'LIABILITY']),
    subtype: z.string().min(1).max(64),
    answers: answersSchema,
  }),
);

/**
 * Missed-year assessments: each year's own answers, keyed by the fact sheet's period id (decision
 * 62). One entry per period; at most 200.
 */
export const yearAnswersSchema: z.ZodType<YearAnswers> = z
  .record(identifierSchema, answersSchema)
  .refine((value) => Object.keys(value).length <= 200, 'At most 200 periods');

const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code, e.g. "USD"');

const entriesSchema = z.array(entrySchema).max(5000);

export const assessmentInputSchema: z.ZodType<AssessmentInput> = z.discriminatedUnion('workflow', [
  z.strictObject({
    workflow: z.literal('annual'),
    currency: currencySchema,
    period: periodSchema,
    entries: entriesSchema,
    answers: answersSchema,
  }),
  z.strictObject({
    workflow: z.literal('first-time'),
    currency: currencySchema,
    assessmentDate: isoDateSchema,
    entries: entriesSchema,
    answers: answersSchema,
  }),
  z.strictObject({
    workflow: z.literal('missed-year'),
    currency: currencySchema,
    assessmentDate: isoDateSchema,
    years: z
      .array(
        z.strictObject({ period: periodSchema, entries: entriesSchema, answers: answersSchema }),
      )
      .min(1)
      .max(100),
  }),
]);
