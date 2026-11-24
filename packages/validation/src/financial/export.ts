import { z } from 'zod';

import type { FinancialFactSheetExport } from '@khums/shared-types';

import { financialFactSheetSchema } from './facts';

/** Placeholder id used only to validate exported facts with the sheet schema (never exported). */
const VALIDATION_ID_PREFIX = 'export-fact-';

/**
 * Versioned local export (docs/FINANCIAL_INPUT_MODEL.md §9). Strict: unexpected fields are
 * rejected. The sheet is checked with the same rules as in the app, so an export can only contain
 * facts the app itself would accept.
 */
export const financialFactExportSchema: z.ZodType<FinancialFactSheetExport> = z
  .strictObject({
    format: z.literal('khums-platform.financial-facts'),
    exportVersion: z.literal(1),
    exportedAt: z.iso.datetime(),
    contents: z.literal('FINANCIAL_FACTS_ONLY'),
    sheet: z.strictObject({
      schemaVersion: z.literal(1),
      currency: z.string(),
      context: z.unknown(),
      facts: z.array(z.record(z.string(), z.unknown())),
    }),
  })
  .superRefine((value, ctx) => {
    if (ctx.issues.length > 0) return;
    const facts = value.sheet.facts.map((fact, index) => {
      if ('id' in fact) {
        ctx.addIssue({
          code: 'custom',
          path: ['sheet', 'facts', index, 'id'],
          message: 'Exported facts do not carry app ids',
          params: { code: 'UNEXPECTED_ID' },
        });
      }
      return { ...fact, id: `${VALIDATION_ID_PREFIX}${String(index)}` };
    });
    const sheet = financialFactSheetSchema.safeParse({ ...value.sheet, facts });
    if (!sheet.success) {
      for (const issue of sheet.error.issues) {
        ctx.addIssue({
          code: 'custom',
          path: ['sheet', ...issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p))],
          message: issue.message,
          params: (issue as { params?: Record<string, unknown> }).params ?? { code: issue.code },
        });
      }
    }
  }) as unknown as z.ZodType<FinancialFactSheetExport>;
