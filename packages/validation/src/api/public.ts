import { z } from 'zod';

import { identifierSchema } from '../calculation/common';

/**
 * Public (unauthenticated) calculator contracts (decision 65; docs/PHASE2_PLAN.md step 6).
 *
 * The API serves, per Marja, only the rule pack that the governance ledger shows PUBLISHED and
 * ACTIVATED and that passes the governed production readiness check; otherwise it says that no
 * verified rules are available yet. Nothing provisional (scholar-review) is ever served here.
 * The browser re-checks the bundle and calculates locally: the user's facts are never sent.
 *
 * Privacy (Phase 2 step 5 fix): the governance ledger is NOT served (it names staff principals).
 * The pack is served with its approvals' person identifiers redacted (outside the hashed content:
 * the digest is unchanged), plus a minimal public verification summary. The server performs the
 * governed (ledger) readiness check; the browser re-checks integrity, digest and the engine
 * readiness that does not need the ledger.
 */

// ---- Requests (strict) ----

export const publicMarjaParamsSchema = z
  .strictObject({ marjaId: identifierSchema })
  .meta({ id: 'PublicMarjaParams', title: 'PublicMarjaParams' });

// ---- Responses (additive) ----

/** The trace of a verified pack: what a public result names (never the content itself). */
export const publicVerifiedPackSummarySchema = z
  .object({
    packId: z.string(),
    version: z.string(),
    /** The recomputed SHA-256 content digest bound by the governance ledger. */
    contentDigest: z.string(),
    /** The date of the governance ACTIVATED record (YYYY-MM-DD). */
    activatedAt: z.iso.date(),
    workflows: z.array(z.enum(['annual', 'first-time', 'missed-year'])),
    /** The date of the governance PUBLISHED record (YYYY-MM-DD). */
    publishedAt: z.iso.date(),
    /**
     * References (`<record id>/<record digest>`) of the ledger-derived approvals and of the
     * publication record, which the activation names. Opaque; never a person.
     */
    approvalReferences: z.array(z.string().min(1).max(500)).max(10),
    publicationReference: z.string().min(1).max(500),
    /** Every rule in the pack with its verified (APPROVED) status. */
    rules: z
      .array(z.object({ ruleId: z.string().min(1).max(100), verified: z.boolean() }))
      .max(10_000),
  })
  .meta({ id: 'PublicVerifiedPackSummary', title: 'PublicVerifiedPackSummary' });

export const publicMarjaSchema = z
  .object({
    marjaId: z.string(),
    /** The verified pack, or null: no verified rules are available yet for this Marja. */
    verifiedPack: publicVerifiedPackSummarySchema.nullable(),
  })
  .meta({ id: 'PublicMarja', title: 'PublicMarja' });

export const publicMarjaListResponseSchema = z
  .object({ marjas: z.array(publicMarjaSchema) })
  .meta({ id: 'PublicMarjaListResponse', title: 'PublicMarjaListResponse' });

/**
 * The verified pack of one Marja. `AVAILABLE` carries the sealed pack (approvals' person ids
 * redacted) and the public verification summary, so the browser can re-check integrity, digest
 * and engine readiness (validated there with the strict schemas of `@khums/validation`); the
 * governance ledger stays on the server. `NOT_AVAILABLE` means no verified rules yet.
 */
export const publicVerifiedPackResponseSchema = z
  .discriminatedUnion('status', [
    z.object({
      status: z.literal('AVAILABLE'),
      marjaId: z.string(),
      summary: publicVerifiedPackSummarySchema,
      pack: z.record(z.string(), z.unknown()),
    }),
    z.object({ status: z.literal('NOT_AVAILABLE'), marjaId: z.string() }),
  ])
  .meta({ id: 'PublicVerifiedPackResponse', title: 'PublicVerifiedPackResponse' });

export type PublicMarjaParams = z.infer<typeof publicMarjaParamsSchema>;
export type PublicVerifiedPackSummary = z.infer<typeof publicVerifiedPackSummarySchema>;
export type PublicMarja = z.infer<typeof publicMarjaSchema>;
export type PublicMarjaListResponse = z.infer<typeof publicMarjaListResponseSchema>;
export type PublicVerifiedPackResponse = z.infer<typeof publicVerifiedPackResponseSchema>;
