import { z } from 'zod';

import {
  answersSchema,
  factAnswersSchema,
  yearAnswersSchema,
} from '../calculation/assessment-input';
import { identifierSchema, isoDateSchema } from '../calculation/common';
import { decimalStringSchema } from '../decimal';
import { financialFactSheetSchema } from '../financial/facts';

/**
 * Browser-only calculation history (owner decisions 2026-11-23 and 2026-11-24; decisions 65 and
 * 71): what a public user chooses to keep ON THEIR OWN DEVICE, only when they tap Save. Versioned;
 * anything that does not match is discarded on read, never repaired. Nothing here is ever sent to
 * a server, logged or put in a URL.
 *
 * Version 2 (decision 71): each saved calculation keeps a user label, the fact sheet (entries,
 * dates, currency), the answers, the result figures the engine produced (labels exactly as the
 * pack states them, amounts as decimal strings) and the pack trace (Marja, pack id, version,
 * digest, engine). Entries saved under version 1 (figures and trace only, no entries) stay
 * readable for viewing; they cannot be edited or copied.
 */

export const SAVED_CALCULATION_HISTORY_VERSION = 2;
/** The newest entries kept; older ones are dropped when a new one is saved. */
export const MAX_SAVED_CALCULATIONS = 50;
/** Longest user label for a saved calculation. */
export const MAX_SAVED_LABEL_LENGTH = 100;

const currencySchema = z.string().regex(/^[A-Z]{3}$/);

export const savedLabelSchema = z.string().trim().min(1).max(MAX_SAVED_LABEL_LENGTH);

export const savedFigureSchema = z.strictObject({
  id: identifierSchema,
  label: z.string().max(500),
  /** Null when the engine could not calculate this output (open items). */
  amount: decimalStringSchema.nullable(),
});

export const savedResultSectionSchema = z.strictObject({
  /** The year of a missed-year calculation; null for the single result or the total. */
  period: z.strictObject({ start: isoDateSchema, end: isoDateSchema }).nullable(),
  status: z.enum(['COMPLETED', 'UNRESOLVED']),
  figures: z.array(savedFigureSchema).max(50),
});

/** Trace and figures, shared by both entry versions. */
const savedResultShape = {
  id: z.uuid(),
  savedAt: z.iso.datetime(),
  marjaId: identifierSchema,
  workflow: z.enum(['annual', 'first-time', 'missed-year']),
  rulePack: z.strictObject({
    packId: identifierSchema,
    version: z.string().max(50),
    contentDigest: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  engineVersion: z.string().max(50),
  currency: currencySchema,
  sections: z.array(savedResultSectionSchema).min(1).max(100),
};

/** A version 1 entry: figures and trace only (read-only, never written any more). */
export const legacySavedCalculationSchema = z.strictObject(savedResultShape);

/** A version 2 entry: everything needed to reopen, edit, recalculate or copy it. */
export const savedCalculationSchema = z
  .strictObject({
    ...savedResultShape,
    label: savedLabelSchema,
    sheet: financialFactSheetSchema,
    answers: answersSchema,
    yearAnswers: yearAnswersSchema,
    factAnswers: factAnswersSchema,
  })
  .superRefine((entry, ctx) => {
    if (entry.sheet.context.workflow !== entry.workflow) {
      ctx.addIssue({ code: 'custom', path: ['sheet'], message: 'Workflow differs from the sheet' });
    }
    if (entry.sheet.currency !== entry.currency) {
      ctx.addIssue({ code: 'custom', path: ['sheet'], message: 'Currency differs from the sheet' });
    }
  });

export const savedHistoryEntrySchema = z.union([
  savedCalculationSchema,
  legacySavedCalculationSchema,
]);

/** The stored history as version 1 wrote it (read only; converted to version 2 on read). */
export const legacySavedCalculationHistorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  entries: z.array(legacySavedCalculationSchema).max(MAX_SAVED_CALCULATIONS),
});

export const savedCalculationHistorySchema = z.strictObject({
  schemaVersion: z.literal(SAVED_CALCULATION_HISTORY_VERSION),
  entries: z.array(savedHistoryEntrySchema).max(MAX_SAVED_CALCULATIONS),
});

export type SavedFigure = z.infer<typeof savedFigureSchema>;
export type SavedResultSection = z.infer<typeof savedResultSectionSchema>;
export type LegacySavedCalculation = z.infer<typeof legacySavedCalculationSchema>;
export type SavedCalculation = z.infer<typeof savedCalculationSchema>;
export type SavedHistoryEntry = z.infer<typeof savedHistoryEntrySchema>;
export type SavedCalculationHistory = z.infer<typeof savedCalculationHistorySchema>;
