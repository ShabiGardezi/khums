import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { decideEvidenceAttachment, replayResearchChain } from '@khums/core';
import type { EvidenceArtefact, EvidenceMediaType } from '@khums/shared-types';
import {
  EVIDENCE_MAX_BYTES,
  type EvidenceArtefactResponse,
  type EvidenceContentResponse,
  type UploadEvidenceRequest,
} from '@khums/validation';

import { CLOCK, type Clock } from '../auth/auth.tokens';
import { problemForDenial, StaffAuthorizationService } from '../auth/staff-authorization.service';
import { ApiProblemException } from '../common/errors/api-problem.exception';
import { Rollback } from '../persistence/unit-of-work';
import { EVIDENCE_STORAGE } from './evidence-tokens';
import { sha256Hex, type EvidenceStorage } from './evidence-storage';
import {
  problem,
  RESEARCH_ID_SOURCE,
  researchConflict,
  researchNotFound,
  researchUnavailable,
  type ResearchIdSource,
} from './research-common';
import { RESEARCH_STORE, type ResearchStore } from './research-store';

/**
 * Evidence artefacts (M5.3.3; architecture §4.3, D3, D10). The decision is `@khums/core`'s
 * (`decideEvidenceAttachment`: `research.source.record` in the source's Marja, source state,
 * copyright, size); this service adds hashing, storage, atomicity and audit:
 *
 * - The SHA-256 is computed here and must equal the client's; the leading bytes must match the
 *   declared media type.
 * - Bytes are stored first (content-addressed, idempotent), then the write-once metadata and its
 *   audit event commit in one unit of work. A failed commit leaves only unreferenced encrypted
 *   bytes (reported by verification), never metadata without bytes.
 * - Every retrieval decrypts, then re-verifies SHA-256 and size; a mismatch is an integrity
 *   incident (503, logged with ids only) and the bytes are never returned.
 * - Without durable storage (production, until an approved provider exists) uploads and downloads
 *   answer 503 EVIDENCE_STORAGE_UNAVAILABLE.
 */

/** Rollback marker: a concurrent upload committed the same file first. */
const DUPLICATE = Symbol('EVIDENCE_DUPLICATE');

const evidenceNotFound = () =>
  problem(404, 'EVIDENCE_NOT_FOUND', 'No evidence with this id is available to you.');
const storageUnavailable = () =>
  problem(
    503,
    'EVIDENCE_STORAGE_UNAVAILABLE',
    'Evidence storage is not available on this deployment.',
  );
const refused = (code: string, status = 422) =>
  problem(status, 'EVIDENCE_REFUSED', `The evidence was refused (${code}).`);

/** True when the leading bytes match the declared media type (text must be valid UTF-8). */
export function matchesMediaType(bytes: Uint8Array, mediaType: EvidenceMediaType): boolean {
  const starts = (...prefix: number[]) => prefix.every((byte, i) => bytes[i] === byte);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      if (bytes[offset + i] !== text.charCodeAt(i)) return false;
    }
    return true;
  };
  switch (mediaType) {
    case 'application/pdf':
      return ascii(0, '%PDF-');
    case 'image/png':
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/jpeg':
      return starts(0xff, 0xd8, 0xff);
    case 'image/webp':
      return ascii(0, 'RIFF') && ascii(8, 'WEBP');
    case 'text/plain':
    case 'text/html':
      if (bytes.includes(0)) return false;
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return true;
      } catch {
        return false;
      }
  }
}

const responseOf = (a: EvidenceArtefact): EvidenceArtefactResponse => ({
  artefactId: a.artefactId,
  marjaId: a.marjaId,
  sourceId: a.sourceId,
  sourceRevision: a.sourceRevision,
  digest: a.digest,
  size: a.size,
  mediaType: a.mediaType,
  copyright: a.copyright,
  extent: a.extent,
  description: a.description,
  recordedBy: a.recordedBy,
  recordedAt: a.recordedAt,
});

@Injectable()
export class EvidenceService {
  constructor(
    @Inject(RESEARCH_STORE) private readonly store: ResearchStore,
    @Inject(EVIDENCE_STORAGE) private readonly storage: EvidenceStorage,
    @Inject(RESEARCH_ID_SOURCE) private readonly ids: ResearchIdSource,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly authz: StaffAuthorizationService,
    @InjectPinoLogger(EvidenceService.name) private readonly logger: PinoLogger,
  ) {}

  private integrityFailure(artefactId: string, code: string): ApiProblemException {
    this.logger.error(
      { event: 'evidence.integrity.failure', artefactId, code },
      'Evidence failed verification',
    );
    return researchUnavailable();
  }

  private requireAuthenticated(request: object): void {
    const decision = this.authz.decide(request, 'research.read', {
      type: 'MARJA_RESEARCH',
      marjaId: 'unbound-marja',
    });
    if (decision.allowed) return;
    if (decision.reason === 'MISSING_PERMISSION' || decision.reason === 'OUT_OF_SCOPE') return;
    throw problemForDenial(decision.reason);
  }

  /** `research.read` in the Marja, otherwise `notFound` (nothing reveals the record). */
  private requireRead(request: object, marjaId: string, notFound: () => ApiProblemException) {
    const decision = this.authz.decide(request, 'research.read', {
      type: 'MARJA_RESEARCH',
      marjaId,
    });
    if (decision.allowed) return;
    if (decision.reason === 'MISSING_PERMISSION' || decision.reason === 'OUT_OF_SCOPE') {
      throw notFound();
    }
    throw problemForDenial(decision.reason);
  }

  private async loadSource(sourceId: string) {
    const loaded = await this.store.stores.sources.load(sourceId);
    if (loaded.kind === 'UNAVAILABLE') throw researchUnavailable();
    if (loaded.kind === 'NOT_FOUND') return null;
    const view = replayResearchChain(loaded.value);
    if (!view.ok) throw this.integrityFailure(sourceId, 'SOURCE_CHAIN_INVALID');
    return { chain: loaded.value, view: view.value };
  }

  /**
   * Attaches a file. Idempotent within a Marja: re-uploading the same bytes to the SAME source
   * returns the existing artefact (`created: false`, nothing new recorded, but the bytes are
   * re-stored, which repairs missing storage and restarts an orphan's grace period); the same
   * bytes for ANOTHER source of the Marja are refused (one artefact per file per Marja). Files of
   * other Marjas are never consulted (per-Marja uniqueness).
   */
  async upload(
    request: object,
    input: UploadEvidenceRequest,
    requestId: string,
  ): Promise<{ readonly artefact: EvidenceArtefactResponse; readonly created: boolean }> {
    this.requireAuthenticated(request);
    const source = await this.loadSource(input.sourceId);
    if (source === null) throw researchNotFound();
    this.requireRead(request, source.view.marjaId, researchNotFound);
    if (this.storage.kind === 'UNAVAILABLE') throw storageUnavailable();

    const bytes = new Uint8Array(Buffer.from(input.contentBase64, 'base64'));
    if (bytes.length === 0 || bytes.length > EVIDENCE_MAX_BYTES) {
      throw refused('EVIDENCE_SIZE_INVALID');
    }
    const digest = sha256Hex(bytes);
    if (digest !== input.sha256) throw refused('EVIDENCE_DIGEST_MISMATCH');
    if (!matchesMediaType(bytes, input.mediaType)) throw refused('MEDIA_TYPE_MISMATCH');

    const { principal, ...context } = this.authz.contextFor(request);
    const decision = decideEvidenceAttachment({
      principal,
      sourceChain: source.chain,
      context: { ...context, requestId },
      file: {
        artefactId: this.ids.next(),
        digest,
        size: bytes.length,
        mediaType: input.mediaType,
        copyright: input.copyright,
        extent: input.extent,
        description: input.description,
      },
    });
    if (decision.status !== 'APPLIED') {
      await this.auditRefusal(request, input.sourceId, source.view.marjaId, decision, requestId);
      if (decision.status === 'DENIED') {
        throw problemForDenial(
          decision.decision.allowed ? 'UNVERIFIED_PRINCIPAL' : decision.decision.reason,
        );
      }
      throw refused(decision.issues.join(', '));
    }
    const { artefact } = decision;

    const already = await this.existingFor(artefact, bytes);
    if (already !== null) return { artefact: already, created: false };

    const stored = await this.storage.put(artefact.storageKey, bytes);
    if (!stored.ok) {
      if (stored.error === 'KEY_CONFLICT') {
        await this.auditIntegrity(artefact, 'STORAGE_KEY_CONFLICT');
        throw this.integrityFailure(artefact.artefactId, 'STORAGE_KEY_CONFLICT');
      }
      throw storageUnavailable();
    }

    const result = await this.store.atomically(
      async (s): Promise<EvidenceArtefactResponse | typeof DUPLICATE | ApiProblemException> => {
        // The source must not have changed since the decision (its revision is recorded).
        const current = await s.sources.load(artefact.sourceId);
        if (current.kind !== 'FOUND') throw new Rollback(researchUnavailable());
        if (current.value.records.length !== artefact.sourceRevision + 1) {
          throw new Rollback(researchConflict());
        }
        const inserted = await s.evidence.insert(artefact);
        // A concurrent upload of the same file won: resolved after the rollback (below).
        if (inserted === 'DUPLICATE_DIGEST') throw new Rollback(DUPLICATE);
        if (inserted !== 'STORED') throw new Rollback(researchUnavailable());
        const recorded = await s.audit({
          eventId: randomUUID(),
          type: 'research.evidence.attached',
          actor: artefact.recordedBy,
          targets: [
            { kind: 'evidenceArtefact', id: artefact.artefactId },
            { kind: 'researchRecord', id: artefact.sourceId },
          ],
          marjaIds: [artefact.marjaId],
          details: {
            digest: artefact.digest,
            mediaType: artefact.mediaType,
            extent: artefact.extent,
            copyright: artefact.copyright,
            decisionId: decision.decision.decisionId,
          },
          requestId,
          occurredAt: new Date(this.clock.now()).toISOString(),
        });
        if (!recorded.ok) throw new Rollback(researchUnavailable());
        return responseOf(artefact);
      },
    );
    if (result === DUPLICATE) {
      const winner = await this.existingFor(artefact, bytes);
      if (winner === null) throw researchUnavailable();
      return { artefact: winner, created: false };
    }
    if (result instanceof ApiProblemException) throw result;
    return { artefact: result, created: true };
  }

  /**
   * The committed artefact of this file in this Marja, if any: returned when it belongs to the
   * same source (after re-storing the bytes), refused (409) when it belongs to another source.
   */
  private async existingFor(
    artefact: EvidenceArtefact,
    bytes: Uint8Array,
  ): Promise<EvidenceArtefactResponse | null> {
    const existing = await this.store.stores.evidence.byDigest(artefact.marjaId, artefact.digest);
    if (existing.kind === 'UNAVAILABLE') throw researchUnavailable();
    if (existing.kind === 'NOT_FOUND') return null;
    if (existing.value.sourceId !== artefact.sourceId) {
      throw problem(
        409,
        'EVIDENCE_REFUSED',
        `The evidence was refused (EVIDENCE_DUPLICATE: already attached as ${existing.value.artefactId}).`,
      );
    }
    const restored = await this.storage.put(existing.value.storageKey, bytes);
    if (!restored.ok) {
      if (restored.error === 'KEY_CONFLICT') {
        await this.auditIntegrity(existing.value, 'STORAGE_KEY_CONFLICT');
        throw this.integrityFailure(existing.value.artefactId, 'STORAGE_KEY_CONFLICT');
      }
      throw storageUnavailable();
    }
    return responseOf(existing.value);
  }

  private async auditRefusal(
    request: object,
    sourceId: string,
    marjaId: string,
    decision: Exclude<ReturnType<typeof decideEvidenceAttachment>, { status: 'APPLIED' }>,
    requestId: string,
  ): Promise<void> {
    const recorded = await this.store.atomically((s) =>
      s.audit({
        eventId: randomUUID(),
        type: decision.status === 'DENIED' ? 'research.action.denied' : 'research.action.refused',
        actor: this.authz.contextFor(request).principal?.principalId ?? null,
        targets: [{ kind: 'researchRecord', id: sourceId }],
        marjaIds: [marjaId],
        details: {
          action: 'ATTACH_EVIDENCE',
          decisionId: decision.decision.decisionId ?? null,
          denyReason:
            decision.status === 'DENIED' && !decision.decision.allowed
              ? decision.decision.reason
              : null,
          issues: decision.status === 'REFUSED' ? [...decision.issues] : [],
        },
        requestId,
        occurredAt: new Date(this.clock.now()).toISOString(),
      }),
    );
    if (!recorded.ok) this.logger.warn({ code: recorded.error }, 'Refusal not audited');
  }

  async list(request: object, sourceId: string): Promise<EvidenceArtefactResponse[]> {
    this.requireAuthenticated(request);
    const source = await this.loadSource(sourceId);
    if (source === null) throw researchNotFound();
    this.requireRead(request, source.view.marjaId, researchNotFound);
    const found = await this.store.stores.evidence.bySource(sourceId);
    if (!found.ok) throw researchUnavailable();
    return found.value.filter((a) => a.marjaId === source.view.marjaId).map(responseOf);
  }

  private async artefact(request: object, artefactId: string): Promise<EvidenceArtefact> {
    this.requireAuthenticated(request);
    const found = await this.store.stores.evidence.get(artefactId);
    if (found.kind === 'UNAVAILABLE') throw researchUnavailable();
    if (found.kind === 'NOT_FOUND') throw evidenceNotFound();
    this.requireRead(request, found.value.marjaId, evidenceNotFound);
    return found.value;
  }

  async get(request: object, artefactId: string): Promise<EvidenceArtefactResponse> {
    return responseOf(await this.artefact(request, artefactId));
  }

  /** Records an integrity incident (ids and codes only) in the audit chain; never blocks the 503. */
  private async auditIntegrity(artefact: EvidenceArtefact, code: string): Promise<void> {
    const recorded = await this.store.atomically((s) =>
      s.audit({
        eventId: randomUUID(),
        type: 'research.evidence.integrity.failure',
        actor: null,
        targets: [{ kind: 'evidenceArtefact', id: artefact.artefactId }],
        marjaIds: [artefact.marjaId],
        details: { code, digest: artefact.digest },
        requestId: null,
        occurredAt: new Date(this.clock.now()).toISOString(),
      }),
    );
    if (!recorded.ok) this.logger.warn({ code: recorded.error }, 'Integrity incident not audited');
  }

  /** The bytes, decrypted and re-verified against the recorded SHA-256 and size. */
  async content(request: object, artefactId: string): Promise<EvidenceContentResponse> {
    const artefact = await this.artefact(request, artefactId);
    if (this.storage.kind === 'UNAVAILABLE') throw storageUnavailable();
    const bytes = await this.storage.get(artefact.storageKey);
    if (!bytes.ok) {
      if (bytes.error === 'UNAVAILABLE') throw storageUnavailable();
      await this.auditIntegrity(artefact, `STORAGE_${bytes.error}`);
      throw this.integrityFailure(artefact.artefactId, `STORAGE_${bytes.error}`);
    }
    if (sha256Hex(bytes.value) !== artefact.digest || bytes.value.length !== artefact.size) {
      await this.auditIntegrity(artefact, 'EVIDENCE_DIGEST_MISMATCH');
      throw this.integrityFailure(artefact.artefactId, 'EVIDENCE_DIGEST_MISMATCH');
    }
    return {
      artefact: responseOf(artefact),
      contentBase64: Buffer.from(bytes.value).toString('base64'),
    };
  }
}
