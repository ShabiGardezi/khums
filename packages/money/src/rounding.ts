import type { RoundingMode } from '@khums/shared-types';

/**
 * Rounding modes. There is deliberately **no default**: every rounding call must name its mode,
 * because the correct mode for a financial or religious calculation is a policy decision
 * (normally supplied by the rule set or the currency's settlement convention).
 *
 * | Mode        | 2.5 → | -2.5 → | 2.4 → | Description                         |
 * | ----------- | ----- | ------ | ----- | ----------------------------------- |
 * | `UP`        | 3     | -3     | 3     | Away from zero                      |
 * | `DOWN`      | 2     | -2     | 2     | Towards zero (truncate)             |
 * | `CEILING`   | 3     | -2     | 3     | Towards +∞                          |
 * | `FLOOR`     | 2     | -3     | 2     | Towards −∞                          |
 * | `HALF_UP`   | 3     | -3     | 2     | Nearest; ties away from zero        |
 * | `HALF_DOWN` | 2     | -2     | 2     | Nearest; ties towards zero          |
 * | `HALF_EVEN` | 2     | -2     | 2     | Nearest; ties to even (banker's)    |
 */
export const ROUNDING_MODES = [
  'UP',
  'DOWN',
  'CEILING',
  'FLOOR',
  'HALF_UP',
  'HALF_DOWN',
  'HALF_EVEN',
] as const satisfies readonly RoundingMode[];

/** Compile-time guard: the runtime list covers every mode in the shared type (no drift). */
type MissingModes = Exclude<RoundingMode, (typeof ROUNDING_MODES)[number]>;
type AssertNever<T extends never> = T;
/** Fails to compile if a shared rounding mode is missing from ROUNDING_MODES. */
export type RoundingModesAreExhaustive = AssertNever<MissingModes>;

export type { RoundingMode };

/** Largest number of decimal places a value may be rounded to or rendered with. */
export const MAX_SCALE = 30;
