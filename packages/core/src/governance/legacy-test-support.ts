import type { GovernanceLedger } from '@khums/shared-types';

import { deepFreeze, recordDigestOf, type RecordDraft } from './ledger';

/**
 * TEST ONLY (M5.2.1). Builds a ledger record exactly as storage would hold one written BEFORE the
 * fail-closed rule for legacy ledgers existed: correct sequence, record id, hash chain and digest,
 * but without going through `append` (which refuses new records on an unbound legacy ledger).
 * Used to prove that such history still replays unchanged.
 */
export function storedHistory(ledger: GovernanceLedger, draft: RecordDraft): GovernanceLedger {
  const sequence = ledger.records.length;
  const partial = {
    ...draft,
    sequence,
    recordId: `${ledger.packId}@${ledger.version}#${String(sequence)}`,
    packId: ledger.packId,
    version: ledger.version,
    previousRecordDigest: ledger.records.at(-1)?.recordDigest ?? null,
  };
  const recordDigest = recordDigestOf(partial);
  if (recordDigest === null) throw new Error('digest');
  return deepFreeze({
    packId: ledger.packId,
    version: ledger.version,
    records: [...ledger.records, { ...partial, recordDigest }],
  });
}
