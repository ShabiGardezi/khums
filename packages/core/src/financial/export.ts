import type { FinancialFactSheet, FinancialFactSheetExport } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import { financialFactExportSchema } from '@khums/validation';

import { parseFinancialFactSheet, type FactSheetIssue } from './fact-sheet';

/**
 * Builds the local export of a fact sheet (docs/FINANCIAL_INPUT_MODEL.md §9).
 *
 * The whole sheet is revalidated first; an invalid sheet is never exported. Values are copied
 * unchanged: decimal strings, currency codes, uncertainty states and approximate dates are kept
 * exactly, and nothing is rounded, converted, totalled or filled in. App-internal fact ids are
 * removed. The caller supplies the timestamp (core has no clock).
 */
export function buildFactSheetExport(
  sheet: FinancialFactSheet,
  exportedAt: string,
): Result<FinancialFactSheetExport, readonly FactSheetIssue[]> {
  const parsed = parseFinancialFactSheet(sheet);
  if (!parsed.ok) return parsed;
  const facts = parsed.value.facts.map(({ id: _id, ...rest }) => rest);
  const candidate: FinancialFactSheetExport = {
    format: 'khums-platform.financial-facts',
    exportVersion: 1,
    exportedAt,
    contents: 'FINANCIAL_FACTS_ONLY',
    sheet: {
      schemaVersion: 1,
      currency: parsed.value.currency,
      context: parsed.value.context,
      facts,
    },
  };
  return parseFactSheetExport(candidate);
}

/** Validates an export (e.g. a file read back). Never throws; issues carry no values. */
export function parseFactSheetExport(
  raw: unknown,
): Result<FinancialFactSheetExport, readonly FactSheetIssue[]> {
  const result = financialFactExportSchema.safeParse(raw);
  if (result.success) return ok(result.data);
  return err(
    result.error.issues.map((issue) => {
      const params = (issue as { params?: { code?: unknown } }).params;
      return {
        path: issue.path.map(String).join('.'),
        code: typeof params?.code === 'string' ? params.code : issue.code,
      };
    }),
  );
}

/** Pretty-printed JSON. Amounts are already strings, so serialization cannot alter them. */
export function serializeFactSheetExport(data: FinancialFactSheetExport): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** File name with only the export date: no names, Marja or amounts. */
export function factSheetExportFileName(exportedAt: string): string {
  return `khums-financial-facts-${exportedAt.slice(0, 10)}.json`;
}
