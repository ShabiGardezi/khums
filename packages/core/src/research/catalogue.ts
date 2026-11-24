/**
 * Research question catalogue (M5.3.2; owner decision D7, 2026-11-22). A version-controlled
 * constant mirroring the 70 REQUIRED questions of docs/research/RESEARCH_MATRIX.md §2 (revision 5):
 * 62 across the 11 original topics plus 8 continued-taqlid (`CTQ`) questions. Stable ids; no
 * question text is copied here (the matrix in Git stays the source of the wording).
 *
 * Proposed additions and promotions (RESEARCH_MATRIX §8) are NOT included: they enter only after
 * the owner approves decision #10, under a new catalogue revision. Adjacent (`ADJ`) questions are
 * not required and not included.
 */
export const RESEARCH_CATALOGUE_REVISION = 'research-matrix-rev5-required';

/** Topic code → number of required questions (RESEARCH_MATRIX §2). */
const TOPICS: readonly (readonly [code: string, count: number])[] = [
  ['INC', 7],
  ['EXP', 6],
  ['SUR', 7],
  ['SAV', 4],
  ['NEC', 6],
  ['PRO', 6],
  ['INV', 5],
  ['LIA', 5],
  ['BUS', 5],
  ['FTK', 5],
  ['MIS', 6],
  ['CTQ', 8],
];

export interface ResearchCatalogueQuestion {
  readonly id: string;
  readonly topic: string;
}

export const RESEARCH_QUESTION_CATALOGUE: {
  readonly revision: string;
  readonly questions: readonly ResearchCatalogueQuestion[];
} = Object.freeze({
  revision: RESEARCH_CATALOGUE_REVISION,
  questions: Object.freeze(
    TOPICS.flatMap(([topic, count]) =>
      Array.from({ length: count }, (_, i) =>
        Object.freeze({ id: `${topic}-${String(i + 1).padStart(2, '0')}`, topic }),
      ),
    ),
  ),
});

const IDS: ReadonlySet<string> = new Set(RESEARCH_QUESTION_CATALOGUE.questions.map((q) => q.id));

/** True only for a required question of the current catalogue revision. */
export const isCatalogueQuestion = (id: unknown): id is string =>
  typeof id === 'string' && IDS.has(id);

/**
 * Catalogue revisions a stored finding may name, each with its question ids. Only the current
 * revision exists; a later revision (after owner decision #10) is added here alongside it, so
 * findings written against an earlier revision keep replaying.
 */
const SUPPORTED: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [RESEARCH_CATALOGUE_REVISION, IDS],
]);

export const SUPPORTED_CATALOGUE_REVISIONS: readonly string[] = Object.freeze([
  ...SUPPORTED.keys(),
]);

/** True only for a question of a supported catalogue revision. */
export const isQuestionOfCatalogueRevision = (id: string, catalogueRevision: string): boolean =>
  SUPPORTED.get(catalogueRevision)?.has(id) ?? false;
