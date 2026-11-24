import { z } from 'zod';

import { DECIMAL_STRING_PATTERN, MAX_DECIMAL_INPUT_LENGTH } from '@khums/money';

/**
 * A monetary or numeric amount transported as a decimal string (never a JSON number).
 * Syntax rules come from @khums/money so validation and arithmetic can never disagree.
 */
export const decimalStringSchema = z
  .string()
  .max(MAX_DECIMAL_INPUT_LENGTH)
  .regex(DECIMAL_STRING_PATTERN, 'Must be a plain decimal string, e.g. "1234.56"')
  .meta({ description: 'Exact decimal number encoded as a string', example: '1234.56' });

export type DecimalString = z.infer<typeof decimalStringSchema>;
