import { z } from 'zod';

import { ROUNDING_MODES } from '@khums/money';

/** Identifiers used inside rule packs and inputs (stable, URL/file safe). */
export const identifierSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/, 'Must be 1–100 chars: letters, digits, . _ : -');

export const isoDateSchema = z.iso.date();

export const roundingModeSchema = z.enum(ROUNDING_MODES);

export const idListSchema = z.array(identifierSchema).max(200);
