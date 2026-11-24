import type { RulePack } from '@khums/shared-types';

import { operationalState } from '../operational-state';
import { createDevelopmentMockPack } from './mock-rule-pack';

/**
 * SERVER-ONLY. The pack the results dashboard may use in this process, or `null`.
 *
 * Only the `DEVELOPMENT` operational state (local machines, CI; never a hosted deployment) gets
 * the non-religious mock pack. `SCHOLAR_REVIEW` runs PROVISIONAL calculations through the API's
 * provisional endpoints (M4.5a; wired into the web results in M4.5.2), never in the browser;
 * `PRODUCTION_APPROVED` uses only governed production packs. Neither ever receives a mock pack.
 */
export function developmentCalculationPack(state = operationalState()): RulePack | null {
  return state.ok && state.state === 'DEVELOPMENT' ? createDevelopmentMockPack() : null;
}
