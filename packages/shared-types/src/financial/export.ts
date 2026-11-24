import type { FactSheetContext, FinancialFact } from './facts';
import type { CurrencyCodeString } from '../calculation/primitives';

/**
 * Local JSON export of a financial fact sheet (M4.3.3), documented in
 * docs/FINANCIAL_INPUT_MODEL.md §9.
 *
 * - User-initiated, created in the browser and never sent to a server.
 * - Contains financial facts only: no Marja, no result, no classification, no calculation.
 * - Amounts are the original decimal strings with their original currency codes. Uncertainty
 *   states and approximate dates are kept exactly.
 * - App-internal fact ids are left out. Period ids are kept, because facts refer to them.
 */

/** A fact as exported: everything the user stated, without the app-internal `id`. */
export type ExportedFinancialFact = FinancialFact extends infer F
  ? F extends FinancialFact
    ? Omit<F, 'id'>
    : never
  : never;

export interface FinancialFactSheetExport {
  /** Identifies the file type. */
  readonly format: 'khums-platform.financial-facts';
  /** Export format version. Incremented on any incompatible change. */
  readonly exportVersion: 1;
  /** When the user created the export (ISO 8601, UTC). */
  readonly exportedAt: string;
  /** Marks the content as facts only: this file is not a Khums result. */
  readonly contents: 'FINANCIAL_FACTS_ONLY';
  readonly sheet: {
    readonly schemaVersion: 1;
    readonly currency: CurrencyCodeString;
    readonly context: FactSheetContext;
    readonly facts: readonly ExportedFinancialFact[];
  };
}
