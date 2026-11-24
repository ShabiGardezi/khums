/** Injection tokens of the staff authentication module (M4.6.2b). */

/** Server clock (milliseconds since the epoch). Injected so tests are deterministic. */
export const CLOCK = Symbol('CLOCK');
export interface Clock {
  now(): number;
}
export const systemClock: Clock = { now: () => Date.now() };
