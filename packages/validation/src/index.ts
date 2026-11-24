/**
 * @khums/validation — public API.
 *
 * Owns the Zod schemas for every input that crosses a trust boundary:
 * user forms, API requests/responses, local/cloud storage payloads and rule-set files.
 * Types are inferred from schemas (`z.infer`) and re-exported, never redeclared in apps.
 *
 * Compatibility policy (docs/ARCHITECTURE.md §12): request contracts use `z.strictObject`
 * (unexpected fields rejected); response contracts use `z.object` (additive, never `looseObject`).
 *
 * API contracts (`./api`) are the single source of truth for the REST API: the NestJS app
 * validates with them and generates its OpenAPI document from them; web and mobile consume
 * them through @khums/api-client.
 */
export type { DecimalString } from './decimal';
export { decimalStringSchema } from './decimal';
export * from './api';
export * from './calculation';
export * from './financial';
export * from './governance';
export * from './auth';
export * from './integrity';
export * from './staff';
export * from './provisional';
export * from './research';
export * from './history';
export * from './rule-builder';
