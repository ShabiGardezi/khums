import { z } from 'zod';

/** Research primitives shared by the research schemas (M5.3.2–M5.3.3). */

/** UUID version 7 (RFC 9562), lowercase: time-ordered, collision-resistant, immutable. */
export const uuidV7Schema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'UUIDv7');

/** A catalogue Marja id (lowercase, digits, hyphens). */
export const researchMarjaIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/);
