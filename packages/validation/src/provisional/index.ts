import { z } from 'zod';

import type { OperationalState } from '@khums/shared-types';

/**
 * The operational states (M4.5a), for configuration. (The hand-built scholar-review pack record
 * schemas were removed, decision 80.)
 */

type Exhaustive<T extends string, L extends readonly T[]> = [T] extends [L[number]] ? L : never;
const exhaustive =
  <T extends string>() =>
  <const L extends readonly T[]>(list: Exhaustive<T, L>): L =>
    list;

export const OPERATIONAL_STATES = exhaustive<OperationalState>()([
  'DEVELOPMENT',
  'SCHOLAR_REVIEW',
  'PRODUCTION_APPROVED',
]);
export const operationalStateSchema = z.enum(OPERATIONAL_STATES);
