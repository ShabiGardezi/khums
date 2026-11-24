import { describe, expect, it } from 'vitest';

import { governanceLedgerSchema, governanceRecordSchema } from './index';

const integrity = {
  algorithm: 'SHA-256',
  canonicalization: 'khums-jcs-1',
  scope: 'rule-pack-content-1',
  digest: 'a'.repeat(64),
};
const record = {
  type: 'SUBMITTED',
  sequence: 0,
  recordId: 'p@1.0.0#0',
  packId: 'p',
  version: '1.0.0',
  recordedAt: '2026-11-20T09:00:00.000Z',
  actor: { kind: 'UNVERIFIED_REFERENCE', subject: 'author-1' },
  previousRecordDigest: null,
  recordDigest: 'b'.repeat(64),
  integrity,
};

describe('governance record schemas', () => {
  it('accepts a well-formed record and ledger', () => {
    expect(governanceRecordSchema.safeParse(record).success).toBe(true);
    expect(
      governanceLedgerSchema.safeParse({ packId: 'p', version: '1.0.0', records: [record] })
        .success,
    ).toBe(true);
  });

  it('accepts both actor kinds: staff principals (M4.6.4a) and legacy references', () => {
    for (const kind of ['STAFF_PRINCIPAL', 'UNVERIFIED_REFERENCE']) {
      expect(
        governanceRecordSchema.safeParse({ ...record, actor: { kind, subject: 'author-1' } })
          .success,
        kind,
      ).toBe(true);
    }
    expect(
      governanceRecordSchema.safeParse({
        ...record,
        actor: { kind: 'STAFF_PRINCIPAL', subject: 'author-1', verifiedBy: 'client' },
      }).success,
    ).toBe(false);
  });

  it('rejects unknown types, extra fields, verified-identity claims and loose timestamps', () => {
    for (const bad of [
      { ...record, type: 'EDITED' },
      { ...record, extra: true },
      { ...record, actor: { kind: 'VERIFIED', subject: 'author-1' } },
      { ...record, recordedAt: '2026-11-20T09:00:00Z' },
      { ...record, recordDigest: 'B'.repeat(64) },
      { ...record, integrity: { ...integrity, canonicalization: 'other' } },
    ]) {
      expect(governanceRecordSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('accepts a POLICY_BOUND record with a known policy only (M5.2.1)', () => {
    const { integrity: _integrity, ...base } = record;
    const bound = { ...base, type: 'POLICY_BOUND', governancePolicy: 'SINGLE_SCHOLAR_V1' };
    expect(governanceRecordSchema.safeParse(bound).success).toBe(true);
    for (const bad of [
      { ...bound, governancePolicy: 'ANYTHING' },
      { ...base, type: 'POLICY_BOUND' },
      { ...bound, integrity },
    ]) {
      expect(governanceRecordSchema.safeParse(bad).success).toBe(false);
    }
  });
});
