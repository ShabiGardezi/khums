import type { AiDeclarationRef, AiInvolvement } from '@khums/shared-types';

/**
 * Cumulative AI involvement and append-only corrections (M5.3.2;
 * docs/SCHOLAR_RESEARCH_ARCHITECTURE.md §4.4). Pure rules shared by append and replay.
 *
 * - A declaration's identity is its assistance, field, generation, tool and occurredAt (never its
 *   review state). Every content revision repeats every earlier declaration unchanged, except that
 *   `scholarReview` may move once from NOT_REVIEWED to a reviewed value.
 * - A wrongly recorded declaration is never removed or edited. A later revision adds a correction:
 *   a NEW declaration with `correctionOf` (the original's identity, which must be in the previous
 *   content revision and not already corrected) and a `correctionReason`. It enters NOT_REVIEWED.
 * - Approval-type transitions need every EFFECTIVE declaration (one not corrected) reviewed. A
 *   correction therefore never bypasses review: it replaces the original in the gate and itself
 *   starts unreviewed.
 */

export type AiIssueCode =
  /** A revision dropped or altered an earlier declaration (including its correction link). */
  | 'AI_DECLARATION_REMOVED'
  /** A revision moved a reviewed declaration back to NOT_REVIEWED or to another review result. */
  | 'AI_REVIEW_REGRESSED'
  /** Two declarations in one revision share the same identity. */
  | 'AI_DECLARATION_DUPLICATE'
  /** A correction without a reason. */
  | 'AI_CORRECTION_REASON_REQUIRED'
  /** A reason without a correction link. */
  | 'AI_CORRECTION_INVALID'
  /** The corrected declaration is not in the previous content revision, or is already corrected. */
  | 'AI_CORRECTION_TARGET_INVALID'
  /** A new correction must start NOT_REVIEWED (its review is a separate, later revision). */
  | 'AI_CORRECTION_REVIEW_INVALID';

/** The identity key of a declaration or declaration reference. */
export const aiKey = (ai: AiDeclarationRef): string =>
  JSON.stringify([ai.assistance, ai.field, ai.generation, ai.tool, ai.occurredAt]);

/** The identity of a declaration (what a correction links to). */
export const aiIdentityOf = (ai: AiDeclarationRef): AiDeclarationRef => ({
  assistance: ai.assistance,
  field: ai.field,
  generation: ai.generation,
  tool: ai.tool,
  occurredAt: ai.occurredAt,
});

const sameCorrection = (a: AiInvolvement, b: AiInvolvement): boolean =>
  a.correctionReason === b.correctionReason &&
  (a.correctionOf === undefined || b.correctionOf === undefined
    ? a.correctionOf === b.correctionOf
    : aiKey(a.correctionOf) === aiKey(b.correctionOf));

/** Checks one content revision's declarations against the previous content revision's. */
export function checkAiInvolvement(
  previous: readonly AiInvolvement[],
  next: readonly AiInvolvement[],
): AiIssueCode | null {
  const byKey = new Map<string, AiInvolvement>();
  for (const ai of next) {
    const key = aiKey(ai);
    if (byKey.has(key)) return 'AI_DECLARATION_DUPLICATE';
    byKey.set(key, ai);
  }
  const previousKeys = new Set<string>();
  const corrected = new Set<string>();
  for (const before of previous) {
    previousKeys.add(aiKey(before));
    if (before.correctionOf !== undefined) corrected.add(aiKey(before.correctionOf));
    const after = byKey.get(aiKey(before));
    if (after === undefined || !sameCorrection(before, after)) return 'AI_DECLARATION_REMOVED';
    if (before.scholarReview !== 'NOT_REVIEWED' && after.scholarReview !== before.scholarReview) {
      return 'AI_REVIEW_REGRESSED';
    }
  }
  for (const ai of next) {
    if (previousKeys.has(aiKey(ai))) continue;
    if (ai.correctionOf === undefined) {
      if (ai.correctionReason !== undefined) return 'AI_CORRECTION_INVALID';
      continue;
    }
    if (ai.correctionReason === undefined) return 'AI_CORRECTION_REASON_REQUIRED';
    const target = aiKey(ai.correctionOf);
    if (!previousKeys.has(target) || corrected.has(target)) return 'AI_CORRECTION_TARGET_INVALID';
    corrected.add(target);
    if (ai.scholarReview !== 'NOT_REVIEWED') return 'AI_CORRECTION_REVIEW_INVALID';
  }
  return null;
}

/** The declarations that count for review: every declaration not corrected by another. */
export function effectiveAiInvolvement(
  declarations: readonly AiInvolvement[],
): readonly AiInvolvement[] {
  const corrected = new Set(
    declarations.flatMap((ai) => (ai.correctionOf === undefined ? [] : [aiKey(ai.correctionOf)])),
  );
  return declarations.filter((ai) => !corrected.has(aiKey(ai)));
}

/** True while any effective declaration is unreviewed (approval-type transitions are refused). */
export const aiReviewPending = (declarations: readonly AiInvolvement[]): boolean =>
  effectiveAiInvolvement(declarations).some((ai) => ai.scholarReview === 'NOT_REVIEWED');
