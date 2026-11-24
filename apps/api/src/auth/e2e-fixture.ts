import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { normalizeUsername } from '@khums/core';

import { e2eStaffFixtureSchema } from '../config/e2e-fixture.schema';
import { bootstrapSuperAdmin } from './bootstrap';
import type { PasswordHasher } from './password-hasher';
import { staffRepository } from './staff-repository';
import { Rollback, type StaffStore } from './staff-store';

const FIXTURE_ACTOR = 'system:e2e-fixture';

/**
 * TEST ONLY (M4.6.2b): seeds the fixed Playwright SUPER_ADMIN into an IN-MEMORY staff store through
 * the real bootstrap path. Enabled only by `STAFF_E2E_FIXTURE_FILE`, which the environment schema
 * refuses in production and together with `MONGODB_URI`; this function refuses a durable store
 * again. The fixture holds test values only (apps/api/test/fixtures/e2e-staff.json).
 */
export async function seedE2eFixture(
  path: string,
  store: StaffStore,
  hasher: PasswordHasher,
  now: number,
): Promise<void> {
  if (store.durable) throw new Error('The e2e staff fixture is only for in-memory test stores');
  const fixture = e2eStaffFixtureSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  const result = await bootstrapSuperAdmin({ store, hasher, now }, fixture.superAdmin);
  if (!result.ok) throw new Error(`e2e staff fixture could not be seeded: ${result.error.kind}`);
  for (const scholar of fixture.scholars ?? []) {
    await seedScholar(store, hasher, now, scholar);
  }
}

/** TEST ONLY: one active scholar with a permanent password and one TEST-Marja role. */
async function seedScholar(
  store: StaffStore,
  hasher: PasswordHasher,
  now: number,
  scholar: {
    username: string;
    password: string;
    role: 'SCHOLAR' | 'GOVERNING_SCHOLAR' | 'SCHOLAR_REVIEWER' | 'RULE_PACK_AUTHOR';
    marjaIds: string[];
  },
): Promise<void> {
  const username = normalizeUsername(scholar.username);
  if (!username.ok) throw new Error('e2e scholar username is invalid');
  const passwordHash = await hasher.hash(scholar.password);
  const at = new Date(now).toISOString();
  const principalId = randomUUID();
  const outcome = await store.atomically(async (c): Promise<'OK' | 'FAILED'> => {
    const tx = staffRepository(c);
    const account = await tx.insertAccount({
      principalId,
      username: username.value,
      usernameKey: username.value,
      passwordHash,
      passwordChangedAt: at,
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
      status: 'ACTIVE',
      createdBy: FIXTURE_ACTOR,
      createdAt: at,
      sessionEpoch: 0,
      version: 0,
    });
    if (account.kind !== 'INSERTED') throw new Rollback('FAILED' as const);
    const role = await tx.insertRoleRecord({
      recordId: randomUUID(),
      kind: 'GRANTED',
      assignmentId: randomUUID(),
      principalId,
      role: scholar.role,
      scope: { kind: 'MARJA', marjaIds: scholar.marjaIds },
      actor: FIXTURE_ACTOR,
      at,
      reason: 'TEST ONLY e2e fixture',
    });
    if (role.kind !== 'INSERTED') throw new Rollback('FAILED' as const);
    return 'OK';
  });
  if (outcome !== 'OK') throw new Error('e2e scholar could not be seeded');
}
