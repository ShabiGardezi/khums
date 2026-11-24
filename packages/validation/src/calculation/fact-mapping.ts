import { z } from 'zod';

import type { FactMapping, FactMappingAction } from '@khums/shared-types';

import { decimalStringSchema } from '../decimal';
import { FINANCIAL_FACT_SUBTYPES } from '../financial/facts';
import { identifierSchema, idListSchema } from './common';

/**
 * Structural schema for a pack's fact mapping (RULE_PACK_STRUCTURE §5.7). Strict: unknown fields
 * and unknown operations are rejected. Every handling is required; there are no defaults.
 * Cross-references (categories, questions, consultations, rules) are checked by
 * `validateRulePackStructure` in the engine.
 */

const consult = z.strictObject({
  handling: z.literal('consult'),
  consultationId: identifierSchema,
});
const clarify = z.strictObject({ handling: z.literal('clarify') });
const use = z.strictObject({ handling: z.literal('use') });
const stop = z.discriminatedUnion('handling', [clarify, consult]);
const useClarifyOrConsult = z.discriminatedUnion('handling', [use, clarify, consult]);

const amountPolicySchema = z.strictObject({
  estimated: useClarifyOrConsult,
  range: z.discriminatedUnion('handling', [
    z.strictObject({ handling: z.literal('use-min') }),
    z.strictObject({ handling: z.literal('use-max') }),
    clarify,
    consult,
  ]),
  unknown: stop,
  notProvided: stop,
});

const DATE_FIELDS = [
  'valuedOn',
  'acquiredOn',
  'receivedOn',
  'paidOn',
  'incurredOn',
  'dueOn',
] as const;

const datePolicySchema = z.strictObject({
  field: z.enum(DATE_FIELDS).nullable(),
  approximate: useClarifyOrConsult,
  unknown: stop,
  notProvided: stop,
});

export const factMappingActionSchema: z.ZodType<FactMappingAction> = z.lazy(() =>
  z.discriminatedUnion('action', [
    z.strictObject({
      action: z.literal('category'),
      categoryId: identifierSchema,
      amount: amountPolicySchema,
      date: datePolicySchema,
      // Phase 4 (decision 78): this fact's own percentage answer adjusts the counted amount.
      adjust: z
        .strictObject({
          questionId: identifierSchema,
          mode: z.enum(['ADD_PERCENT', 'PERCENT']),
        })
        .exactOptional(),
      // Decision 82: an ordered list (an asked amount first; percentages; fixed percentages).
      adjustments: z
        .array(
          z.union([
            z.strictObject({
              questionId: identifierSchema,
              mode: z.enum(['ADD_PERCENT', 'PERCENT', 'AMOUNT']),
            }),
            z.strictObject({ mode: z.literal('FIXED_PERCENT'), percent: decimalStringSchema }),
          ]),
        )
        .min(1)
        .max(5)
        .exactOptional(),
    }),
    // Every exclusion carries its own justification (production: approved and sourced).
    z.strictObject({ action: z.literal('exclude'), ruleIds: idListSchema.min(1) }),
    z.strictObject({ action: z.literal('consult'), consultationId: identifierSchema }),
    z.strictObject({
      action: z.literal('ask'),
      questionId: identifierSchema,
      cases: z
        .array(
          z.strictObject({
            equals: z.union([z.boolean(), z.string().min(1).max(100)]),
            then: factMappingActionSchema,
          }),
        )
        .min(1)
        .max(20),
      otherwise: consult,
    }),
  ]),
);

const KINDS = ['ASSET', 'BALANCE', 'INCOME', 'EXPENSE', 'LIABILITY'] as const;

const ruleSchema = z
  .strictObject({
    id: identifierSchema,
    ruleIds: idListSchema,
    match: z.strictObject({
      workflows: z
        .array(z.enum(['annual', 'first-time', 'missed-year']))
        .min(1)
        .max(3),
      kinds: z.array(z.enum(KINDS)).min(1).max(5),
      subtypes: z.array(z.string().min(1).max(50)).min(1).max(50),
      // Phase 4 (decision 78): annual only; windows never overlap (engine structure check).
      dated: z
        .discriminatedUnion('window', [
          z.strictObject({ window: z.literal('IN_PERIOD') }),
          z.strictObject({ window: z.literal('BEFORE_START') }),
          z.strictObject({ window: z.literal('AFTER_END'), days: z.number().int().min(1).max(31) }),
        ])
        .exactOptional(),
    }),
    then: factMappingActionSchema,
  })
  .superRefine((rule, ctx) => {
    if (ctx.issues.length > 0) return;
    const allowed = new Set<string>(rule.match.kinds.flatMap((k) => FINANCIAL_FACT_SUBTYPES[k]));
    rule.match.subtypes.forEach((subtype, index) => {
      if (!allowed.has(subtype)) {
        ctx.addIssue({
          code: 'custom',
          path: ['match', 'subtypes', index],
          message: 'Subtype does not belong to any of the listed kinds',
          params: { code: 'MAPPING_UNKNOWN_SUBTYPE' },
        });
      }
    });
    rule.match.kinds.forEach((kind, index) => {
      const own: readonly string[] = FINANCIAL_FACT_SUBTYPES[kind];
      if (!rule.match.subtypes.some((s) => own.includes(s))) {
        ctx.addIssue({
          code: 'custom',
          path: ['match', 'kinds', index],
          message: 'A listed kind has none of its subtypes named (no wildcards)',
          params: { code: 'MAPPING_KIND_WITHOUT_SUBTYPE' },
        });
      }
    });
  });

export const factMappingSchema: z.ZodType<FactMapping> = z.strictObject({
  mappingVersion: z.literal(1),
  factSheetSchemaVersions: z.array(z.literal(1)).min(1).max(1),
  rules: z.array(ruleSchema).min(1).max(500),
  unmatched: consult,
  outOfPeriod: consult.exactOptional(),
  ruleIds: idListSchema,
});
