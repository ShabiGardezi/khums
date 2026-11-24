import { describe, expect, it } from 'vitest';

import { GRANTABLE_STAFF_ROLES, isLegacyStaffRole, LEGACY_STAFF_ROLES } from '@khums/api-client';
import { isCrossMarjaReadOnly, permissionsForMarja } from '@khums/core';

import { consoleEn } from '@/content/console/en';
import { consoleUr } from '@/content/console/ur';

import { CONSOLE_SECTIONS, visibleSections } from './console-nav';
import { PACK_FILE_LIMIT_BYTES, invalidFile, parsePackFile } from './pack-file';
import { problemMessage } from './problem-message';

/** Staff console helpers (M4.6.5). */

describe('console navigation', () => {
  it('shows only the rule builder, staff and audit log, each with its permission (decision 79)', () => {
    expect(visibleSections([]).map((s) => s.key)).toEqual([]);
    const admin = [
      'identity.user.read',
      'governance.policy.change',
      'governance.ledger.read',
      'audit.log.read',
      'provisional.pack.read',
      'research.read',
      'builder.rule.read',
    ];
    expect(visibleSections(admin).map((s) => s.key)).toEqual(['staff', 'audit', 'rules']);
    // A scholar sees the rule builder (test any Marja, read the rules) and nothing else.
    const scholar = [
      'provisional.pack.read',
      'feedback.read',
      'research.read',
      'builder.rule.read',
    ];
    expect(visibleSections(scholar).map((s) => s.key)).toEqual(['rules']);
    expect(new Set(CONSOLE_SECTIONS.map((s) => s.path)).size).toBe(CONSOLE_SECTIONS.length);
  });
});

describe('problem messages', () => {
  const errors = consoleEn.common.errors;
  const http = (code: string) =>
    ({
      kind: 'http',
      status: 409,
      problem: { type: 'about:blank', title: 't', status: 409, code },
    }) as const;
  it('maps stable codes to localized messages and keeps the code to quote', () => {
    expect(problemMessage(http('SELF_ADMINISTRATION'), errors)).toEqual({
      message: errors.selfAdministration,
      code: 'SELF_ADMINISTRATION',
    });
    expect(problemMessage(http('OPERATIONAL_STATE_FORBIDS'), errors).message).toBe(
      errors.stateForbids,
    );
    expect(problemMessage(http('SOMETHING_NEW'), errors)).toEqual({
      message: errors.generic,
      code: 'SOMETHING_NEW',
    });
    expect(problemMessage({ kind: 'network', cause: null }, errors)).toEqual({
      message: errors.network,
      code: null,
    });
    // Decision 64: legacy roles are refused with their own message.
    expect(problemMessage(http('ROLE_NOT_GRANTABLE'), errors).message).toBe(
      errors.roleNotGrantable,
    );
    const local = invalidFile();
    if (local.ok) throw new Error('expected a refusal');
    expect(problemMessage(local.error, errors).message).toBe(errors.fileInvalid);
  });
});

describe('pack files', () => {
  it('reads the pack id and version from JSON metadata; refuses anything else', () => {
    expect(
      parsePackFile(JSON.stringify({ metadata: { packId: 'p', version: '1.0.0' }, rules: [] })),
    ).toMatchObject({ kind: 'OK', packId: 'p', version: '1.0.0' });
    for (const text of [
      '',
      'not json',
      '[]',
      '"text"',
      JSON.stringify({ metadata: { packId: 1, version: '1.0.0' } }),
      JSON.stringify({ rules: [] }),
      'x'.repeat(PACK_FILE_LIMIT_BYTES + 1),
    ]) {
      expect(parsePackFile(text).kind, text.slice(0, 20)).toBe('INVALID');
    }
  });
});

describe('staff roles in the console (decision 64)', () => {
  it('offers only Administrator and Scholar for grants, labels every readable role in both locales', () => {
    expect(GRANTABLE_STAFF_ROLES).toEqual(['SUPER_ADMIN', 'SCHOLAR']);
    for (const content of [consoleEn, consoleUr]) {
      for (const role of [...GRANTABLE_STAFF_ROLES, ...LEGACY_STAFF_ROLES]) {
        expect(content.staff.roles.names[role].length, role).toBeGreaterThan(0);
      }
      expect(content.staff.roles.legacy.length).toBeGreaterThan(0);
    }
    expect(LEGACY_STAFF_ROLES.every(isLegacyStaffRole)).toBe(true);
    expect(GRANTABLE_STAFF_ROLES.some(isLegacyStaffRole)).toBe(false);
  });

  it('shows another Marja as read-only for a scholar: test calculations, no state changes', () => {
    const scholar = [
      { role: 'SCHOLAR' as const, scope: { kind: 'MARJA' as const, marjaIds: ['sistani'] } },
    ];
    expect(isCrossMarjaReadOnly(scholar, 'khamenei')).toBe(true);
    expect(isCrossMarjaReadOnly(scholar, 'sistani')).toBe(false);
    const other = permissionsForMarja(scholar, 'khamenei');
    expect(other).toContain('provisional.calculate');
    for (const p of ['feedback.submit', 'feedback.respond', 'provisional.pack.enable'] as const) {
      expect(other).not.toContain(p);
    }
    const admin = [{ role: 'SUPER_ADMIN' as const, scope: { kind: 'ALL' as const, marjaIds: [] } }];
    expect(isCrossMarjaReadOnly(admin, 'khamenei')).toBe(false);
    expect(permissionsForMarja(admin, 'khamenei')).toContain('provisional.pack.enable');
  });
});
