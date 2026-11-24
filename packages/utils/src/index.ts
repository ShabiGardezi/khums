/**
 * @khums/utils — public API.
 *
 * Small, pure, platform-agnostic helpers. Anything exported here must work in
 * browsers, React Native (Hermes) and Node.js without polyfills.
 */
export type { Err, Ok, Result } from './result';
export { err, isErr, isOk, ok } from './result';
export { assertNever, invariant, InvariantError } from './assert';
export { addDaysToIsoDate, compareIsoDates, daysBetweenIsoDates, isIsoDate } from './iso-date';
