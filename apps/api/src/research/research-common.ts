import { randomBytes } from 'node:crypto';

import { formatUuidV7 } from '@khums/core';
import { API_ERROR_CODES } from '@khums/validation';

import { ApiProblemException } from '../common/errors/api-problem.exception';

/** Shared pieces of the research API (M5.3.3): ids and problems. */

/**
 * Server-drawn UUIDv7 identifiers (D8): the injected clock's milliseconds and 74 bits from the
 * operating system's CSPRNG. No counters and no `max + 1`. Collisions (practically impossible) are
 * caught by the unique indexes and answered by drawing again.
 */
export interface ResearchIdSource {
  next(): string;
}

export const RESEARCH_ID_SOURCE = Symbol('RESEARCH_ID_SOURCE');

export const uuidV7Source = (now: () => number): ResearchIdSource => ({
  next: () => formatUuidV7(now(), randomBytes(10)),
});

/** Attempts to create a record before giving up on repeated id collisions. */
export const CREATE_ATTEMPTS = 3;

export const problem = (status: number, code: keyof typeof API_ERROR_CODES, detail: string) =>
  new ApiProblemException(status, API_ERROR_CODES[code], detail);

export const researchUnavailable = () =>
  problem(503, 'SERVICE_UNAVAILABLE', 'Research records are currently unavailable.');

export const researchNotFound = () =>
  problem(404, 'RESEARCH_NOT_FOUND', 'No research record with this id is available to you.');

export const researchConflict = () =>
  problem(409, 'RESEARCH_CONFLICT', 'The record changed meanwhile. Reload and try again.');

/** Issue codes are fixed identifiers from @khums/core (never content or submitted values). */
export const researchRefused = (codes: readonly string[]) =>
  problem(
    422,
    'RESEARCH_REFUSED',
    `The command was refused (${[...new Set(codes)].sort().join(', ')}).`,
  );
