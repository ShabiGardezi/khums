/**
 * @khums/shared-types — public API.
 *
 * Domain types shared by every app and package. Type-only; no runtime code.
 * Calculation contracts (`./calculation`) describe rule packs, assessment inputs and results;
 * they contain no religious rulings — rulings live only in approved rule-pack data.
 */
export type { Brand } from './brand';
export type * from './calculation';
/** Neutral financial facts provided by the user (M4.3.1); no religious classification. */
export type * from './financial';
/** Rule-pack governance ledger (M4.4.3); identities are unverified references (FR-2 open). */
export type * from './governance';
/** Identity and authorization types for governance (M4.6.0 design; evaluator in core, M4.6.1). */
export type * from './auth';
/** Audit chain and signed integrity checkpoints (M4.6.3a). */
export type * from './integrity';
/** Provisional scholar-review track: operational state, provisional packs, feedback (M4.5a). */
export type * from './provisional';
/** Scholar research management: append-only research revision chains (M5.3.2). */
export type * from './research';
