/**
 * Initial research scope (owner decision D12, 2026-11-22): research records may be CREATED only for
 * these Marjas. Configuration of the research process, not a ruling. The architecture stays
 * multi-Marja: other catalogue Marjas are not activated for research creation until the owner
 * extends this list in a reviewed change.
 */
export const INITIAL_RESEARCH_MARJAS: readonly string[] = Object.freeze(['sistani', 'khamenei']);

export const isResearchMarja = (marjaId: string): boolean =>
  INITIAL_RESEARCH_MARJAS.includes(marjaId);
