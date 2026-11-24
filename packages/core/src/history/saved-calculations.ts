import type {
  Answers,
  AssessmentResult,
  CalculationReport,
  FactAnswers,
  FactAnswerSet,
  FinancialFactSheet,
  QuestionDefinition,
  YearAnswers,
} from '@khums/shared-types';
import {
  legacySavedCalculationSchema,
  MAX_SAVED_CALCULATIONS,
  SAVED_CALCULATION_HISTORY_VERSION,
  savedCalculationHistorySchema,
  savedCalculationSchema,
  savedHistoryEntrySchema,
  savedLabelSchema,
  type SavedCalculation,
  type SavedCalculationHistory,
  type SavedHistoryEntry,
  type SavedResultSection,
} from '@khums/validation';

/**
 * Browser-only calculation history (owner decisions 2026-11-23 and 2026-11-24; decisions 65 and
 * 71). Pure functions: the web app keeps the serialized history in the browser's own storage, only
 * when the user taps Save, and never sends it anywhere. Only VERIFIED results (the engine's
 * production mode with an approved, non-mock pack) can be saved; mock and provisional results
 * never can.
 */

/** A fresh, empty history. */
export const emptySavedHistory = (): SavedCalculationHistory => ({
  schemaVersion: SAVED_CALCULATION_HISTORY_VERSION,
  entries: [],
});

export type SavedHistoryRead =
  /**
   * Readable history. `unreadable` counts stored entries that did not verify (damaged, edited, or
   * from another version) and were left out; the readable ones are kept. They are removed the next
   * time the history is written (save, rename, delete), so the person must be told first.
   */
  | {
      readonly status: 'OK';
      readonly history: SavedCalculationHistory;
      readonly unreadable: number;
    }
  /** Nothing stored yet. */
  | { readonly status: 'EMPTY'; readonly history: SavedCalculationHistory }
  /** The stored value as a whole is unreadable or of another version: it is ignored (and can be cleared). */
  | { readonly status: 'DISCARDED'; readonly history: SavedCalculationHistory };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads a stored history (untrusted text). The envelope (`schemaVersion` 1 or 2 and an `entries`
 * array, nothing else) must verify, otherwise the whole value is DISCARDED. Each entry is then
 * checked on its own with the strict schema: entries that verify are kept, the others are left
 * out and counted, never repaired, so one damaged entry never hides the rest. A version 1 history
 * holds only version 1 entries; it is read as version 2 (its entries keep figures only) and
 * written back as version 2 on the next change. Nothing is migrated or invented.
 */
export function parseSavedHistory(raw: string | null): SavedHistoryRead {
  if (raw === null || raw === '') return { status: 'EMPTY', history: emptySavedHistory() };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { status: 'DISCARDED', history: emptySavedHistory() };
  }
  if (
    !isRecord(json) ||
    Object.keys(json).some((key) => key !== 'schemaVersion' && key !== 'entries') ||
    (json.schemaVersion !== 1 && json.schemaVersion !== SAVED_CALCULATION_HISTORY_VERSION) ||
    !Array.isArray(json.entries)
  ) {
    return { status: 'DISCARDED', history: emptySavedHistory() };
  }
  const schema = json.schemaVersion === 1 ? legacySavedCalculationSchema : savedHistoryEntrySchema;
  const readable: SavedHistoryEntry[] = [];
  let unreadable = 0;
  for (const candidate of json.entries as readonly unknown[]) {
    const parsed = schema.safeParse(candidate);
    if (parsed.success) readable.push(parsed.data);
    else unreadable += 1;
  }
  // More entries than the format allows: the newest (first) are kept, the rest count as unreadable.
  const entries = readable.slice(0, MAX_SAVED_CALCULATIONS);
  unreadable += readable.length - entries.length;
  return {
    status: 'OK',
    history: { schemaVersion: SAVED_CALCULATION_HISTORY_VERSION, entries },
    unreadable,
  };
}

export const serializeSavedHistory = (history: SavedCalculationHistory): string =>
  JSON.stringify(savedCalculationHistorySchema.parse(history));

/** Whether a saved entry keeps its entries and answers (version 2) and can be edited or copied. */
export const isEditableSavedCalculation = (entry: SavedHistoryEntry): entry is SavedCalculation =>
  'sheet' in entry;

const section = (
  result: Pick<AssessmentResult, 'status' | 'outputs'>,
  period: SavedResultSection['period'],
): SavedResultSection => ({
  period,
  status: result.status,
  figures: result.outputs.map((o) => ({
    id: o.id,
    label: o.label,
    amount: o.value?.amount ?? null,
  })),
});

export interface SavedCalculationDetails {
  readonly id: string;
  readonly savedAt: string;
  readonly marjaId: string;
  readonly label: string;
  /** The fact sheet the report was calculated from. */
  readonly sheet: FinancialFactSheet;
  readonly answers: Answers;
  readonly yearAnswers: YearAnswers;
  readonly factAnswers: FactAnswers;
}

/**
 * The entry to save for a calculated report, or null when the report is not a verified result
 * (anything but `APPROVED_RULE_PACK` guidance in production mode with a non-mock pack and a
 * recomputed digest), does not belong to the given sheet, or does not fit the stored format.
 * Answers are kept only in the scope the workflow uses (decision 62).
 */
export function savedCalculationFromReport(
  report: CalculationReport,
  entry: SavedCalculationDetails,
): SavedCalculation | null {
  const { meta } = report;
  if (
    meta.guidance !== 'APPROVED_RULE_PACK' ||
    meta.mode !== 'production' ||
    meta.rulePack.isMock ||
    meta.rulePack.contentDigest === null ||
    meta.rulePack.marjaId !== entry.marjaId
  ) {
    return null;
  }
  const missed = report.workflow === 'missed-year';
  const sections: SavedResultSection[] = missed
    ? [
        ...(report.aggregate === null ? [] : [section(report.aggregate, null)]),
        ...report.years.map((y) => section(y.result, { start: y.period.start, end: y.period.end })),
      ]
    : [section(report.result, null)];
  const parsed = savedCalculationSchema.safeParse({
    id: entry.id,
    savedAt: entry.savedAt,
    marjaId: entry.marjaId,
    workflow: report.workflow,
    rulePack: {
      packId: meta.rulePack.packId,
      version: meta.rulePack.version,
      contentDigest: meta.rulePack.contentDigest,
    },
    engineVersion: meta.engineVersion,
    currency: meta.currency,
    sections,
    label: entry.label,
    sheet: entry.sheet,
    answers: missed ? {} : entry.answers,
    yearAnswers: missed ? entry.yearAnswers : {},
    factAnswers: entry.factAnswers,
  });
  return parsed.success ? parsed.data : null;
}

/** Adds an entry first (newest first), keeping at most `MAX_SAVED_CALCULATIONS`. */
export function addSavedCalculation(
  history: SavedCalculationHistory,
  entry: SavedCalculation,
): SavedCalculationHistory {
  return {
    schemaVersion: SAVED_CALCULATION_HISTORY_VERSION,
    entries: [entry, ...history.entries.filter((e) => e.id !== entry.id)].slice(
      0,
      MAX_SAVED_CALCULATIONS,
    ),
  };
}

export function removeSavedCalculation(
  history: SavedCalculationHistory,
  id: string,
): SavedCalculationHistory {
  return {
    schemaVersion: SAVED_CALCULATION_HISTORY_VERSION,
    entries: history.entries.filter((e) => e.id !== id),
  };
}

/**
 * Renames one saved calculation in place (its position, figures and entries are unchanged). Null
 * when the label is empty or too long, or no editable entry has that id.
 */
export function renameSavedCalculation(
  history: SavedCalculationHistory,
  id: string,
  label: string,
): SavedCalculationHistory | null {
  const parsedLabel = savedLabelSchema.safeParse(label);
  const target = history.entries.find((e) => e.id === id);
  if (!parsedLabel.success || target === undefined || !isEditableSavedCalculation(target)) {
    return null;
  }
  return {
    schemaVersion: SAVED_CALCULATION_HISTORY_VERSION,
    entries: history.entries.map((e) => (e.id === id ? { ...target, label: parsedLabel.data } : e)),
  };
}

const answerFits = (question: QuestionDefinition | undefined, answer: boolean | string) =>
  question !== undefined &&
  (question.kind === 'boolean'
    ? typeof answer === 'boolean'
    : typeof answer === 'string' && question.choices.includes(answer));

/**
 * The saved answers that still apply when a saved calculation is recalculated with the Marja's
 * CURRENT verified pack and the (possibly edited) entries: answers to questions the pack still
 * asks, with an answer it still accepts; per-entry answers only for entries that still exist with
 * the same assessment type, kind and subtype; year answers only for years still in the sheet.
 * Everything else is dropped, so the person is asked again rather than given a stale answer.
 */
export function answersForRecalculation(
  saved: Pick<SavedCalculation, 'answers' | 'yearAnswers' | 'factAnswers'>,
  pack: { readonly questions: readonly QuestionDefinition[] },
  sheet: FinancialFactSheet,
): {
  readonly answers: Answers;
  readonly yearAnswers: YearAnswers;
  readonly factAnswers: FactAnswers;
} {
  const questions = new Map(pack.questions.map((q) => [q.id, q]));
  const keep = (set: Answers): Answers =>
    Object.fromEntries(Object.entries(set).filter(([id, a]) => answerFits(questions.get(id), a)));
  const { context } = sheet;
  const periods = new Set(
    context.workflow === 'missed-year' ? context.periods.map((p) => p.id) : [],
  );
  const factAnswers: Record<string, FactAnswerSet> = {};
  for (const [factId, set] of Object.entries(saved.factAnswers)) {
    const fact = sheet.facts.find((f) => f.id === factId);
    if (
      fact !== undefined &&
      set.workflow === context.workflow &&
      set.kind === fact.kind &&
      set.subtype === fact.subtype
    ) {
      factAnswers[factId] = { ...set, answers: keep(set.answers) };
    }
  }
  return {
    answers: context.workflow === 'missed-year' ? {} : keep(saved.answers),
    yearAnswers: Object.fromEntries(
      Object.entries(saved.yearAnswers)
        .filter(([periodId]) => periods.has(periodId))
        .map(([periodId, set]) => [periodId, keep(set)]),
    ),
    factAnswers,
  };
}

/** The pack a saved calculation, or a calculation now, used: id, version and content digest. */
export interface SavedPackRef {
  readonly packId: string;
  readonly version: string;
  readonly contentDigest: string;
}

/** Whether two pack references are exactly the same pack version (id, version and digest). */
export const isSameSavedPack = (a: SavedPackRef, b: SavedPackRef): boolean =>
  a.packId === b.packId && a.version === b.version && a.contentDigest === b.contentDigest;

/** No answers at all. */
export const noSavedAnswers = (): {
  readonly answers: Answers;
  readonly yearAnswers: YearAnswers;
  readonly factAnswers: FactAnswers;
} => ({ answers: {}, yearAnswers: {}, factAnswers: {} });

/**
 * The saved answers offered again when a saved calculation is reopened (decision 71, audit fixes).
 * Only when it is reopened to EDIT and the current verified pack is EXACTLY the pack the answers
 * were given for (same id, version and content digest): question ids can survive a pack change
 * with another meaning, so after any change every question is asked again. A copy for a new year
 * never carries answers (they were given for the earlier year). Otherwise the filtering of
 * `answersForRecalculation` applies (edited entries and years).
 */
export function savedAnswersToReuse(
  saved: Pick<SavedCalculation, 'answers' | 'yearAnswers' | 'factAnswers' | 'rulePack'>,
  mode: 'edit' | 'copy',
  current: {
    readonly ref: SavedPackRef;
    readonly pack: { readonly questions: readonly QuestionDefinition[] };
  },
  sheet: FinancialFactSheet,
): {
  readonly answers: Answers;
  readonly yearAnswers: YearAnswers;
  readonly factAnswers: FactAnswers;
} {
  if (mode === 'copy' || !isSameSavedPack(saved.rulePack, current.ref)) return noSavedAnswers();
  return answersForRecalculation(saved, current.pack, sheet);
}
