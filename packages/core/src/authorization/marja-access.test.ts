import { describe, expect, it } from 'vitest';

import {
  CROSS_MARJA_READ_ONLY_PERMISSIONS,
  GOVERNANCE_PERMISSIONS,
  ROLE_PERMISSIONS,
} from './catalogue';
import { isCrossMarjaReadOnly, ownsMarjaScope, permissionsForMarja } from './marja-access';

/** Informational per-Marja helpers (decision 64). Test values only. */

const ALL = { kind: 'ALL' as const, marjaIds: [] };
const scope = (...marjaIds: string[]) => ({ kind: 'MARJA' as const, marjaIds });

describe('permissionsForMarja / isCrossMarjaReadOnly', () => {
  it('gives a SCHOLAR its full permissions in its Marjas and read-only access elsewhere', () => {
    const roles = [{ role: 'SCHOLAR' as const, scope: scope('test-a', 'test-b') }];
    const inCatalogueOrder = (list: readonly string[]) =>
      GOVERNANCE_PERMISSIONS.filter((p) => list.includes(p));
    expect(permissionsForMarja(roles, 'test-a')).toEqual(
      inCatalogueOrder(ROLE_PERMISSIONS.SCHOLAR),
    );
    expect(permissionsForMarja(roles, 'test-b')).toEqual(
      inCatalogueOrder(ROLE_PERMISSIONS.SCHOLAR),
    );
    expect(permissionsForMarja(roles, 'test-c')).toEqual(
      inCatalogueOrder(CROSS_MARJA_READ_ONLY_PERMISSIONS),
    );
    expect(ownsMarjaScope(roles, 'test-a')).toBe(true);
    expect(ownsMarjaScope(roles, 'test-c')).toBe(false);
    expect(isCrossMarjaReadOnly(roles, 'test-a')).toBe(false);
    expect(isCrossMarjaReadOnly(roles, 'test-c')).toBe(true);
  });

  it('treats legacy GOVERNING_SCHOLAR exactly like SCHOLAR', () => {
    const legacy = [{ role: 'GOVERNING_SCHOLAR' as const, scope: scope('test-a') }];
    const current = [{ role: 'SCHOLAR' as const, scope: scope('test-a') }];
    for (const marja of ['test-a', 'test-z']) {
      expect(permissionsForMarja(legacy, marja)).toEqual(permissionsForMarja(current, marja));
      expect(isCrossMarjaReadOnly(legacy, marja)).toBe(isCrossMarjaReadOnly(current, marja));
    }
  });

  it('gives SUPER_ADMIN everything everywhere and never labels it read-only', () => {
    const roles = [{ role: 'SUPER_ADMIN' as const, scope: ALL }];
    expect(permissionsForMarja(roles, 'test-anything')).toEqual(GOVERNANCE_PERMISSIONS);
    expect(isCrossMarjaReadOnly(roles, 'test-anything')).toBe(false);
  });

  it('gives other legacy roles nothing outside their scope (no broadening)', () => {
    const roles = [{ role: 'SCHOLAR_REVIEWER' as const, scope: scope('test-a') }];
    expect(permissionsForMarja(roles, 'test-b')).toEqual([]);
    expect(isCrossMarjaReadOnly(roles, 'test-b')).toBe(false);
    expect(permissionsForMarja([], 'test-a')).toEqual([]);
  });
});
