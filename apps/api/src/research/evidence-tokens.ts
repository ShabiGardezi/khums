import type { AppConfig } from '../config';
import {
  localEncryptedEvidenceStorage,
  memoryEvidenceStorage,
  unavailableEvidenceStorage,
  type EvidenceStorage,
} from './evidence-storage';

export const EVIDENCE_STORAGE = Symbol('EVIDENCE_STORAGE');

/**
 * Chooses the evidence provider (M5.3.3). Production ALWAYS gets the unavailable provider: the
 * private deployment (Render Free) has an ephemeral filesystem and no approved durable, private,
 * encrypted, no-cost provider exists yet, so evidence is never accepted where it would be lost.
 * Development and test use the local encrypted provider when configured, otherwise memory.
 */
export function selectEvidenceStorage(config: AppConfig): EvidenceStorage {
  if (config.env === 'production') return unavailableEvidenceStorage();
  if (config.evidence !== null) {
    return localEncryptedEvidenceStorage(config.evidence.dir, config.evidence.key);
  }
  return memoryEvidenceStorage();
}
