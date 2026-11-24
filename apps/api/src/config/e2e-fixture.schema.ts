import { z } from 'zod';

/** TEST ONLY: shape of apps/api/test/fixtures/e2e-staff.json (`STAFF_E2E_FIXTURE_FILE`). */
export const e2eStaffFixtureSchema = z
  .object({
    purpose: z.string().regex(/^TEST ONLY/),
    superAdmin: z.object({ username: z.string(), password: z.string() }).strict(),
    /**
     * TEST ONLY (M4.5.2): staff with a scholar role on TEST Marja ids, for the scholar-review
     * journeys. Seeded directly (the catalogue holds no test Marja); never real people or Marjas.
     * `SCHOLAR` is the grantable role (decision 64); the legacy roles stay available here so the
     * journeys can prove that existing legacy assignments (e.g. `GOVERNING_SCHOLAR`) still work.
     */
    scholars: z
      .array(
        z
          .object({
            username: z.string(),
            password: z.string(),
            role: z.enum(['SCHOLAR', 'GOVERNING_SCHOLAR', 'SCHOLAR_REVIEWER', 'RULE_PACK_AUTHOR']),
            // TEST Marja ids; plus the two research-scope ids (M5.3.7), because research is
            // created only for `sistani` and `khamenei`. The fixture is in-memory only (refused in
            // production and with MONGODB_URI) and every research record it sees is SYNTHETIC.
            marjaIds: z.array(z.string().regex(/^(test-[a-z0-9-]+|sistani|khamenei)$/)).min(1),
          })
          .strict(),
      )
      .max(6)
      .optional(),
  })
  .strict();
