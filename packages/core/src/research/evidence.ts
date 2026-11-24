import type {
  AuthorizationDecision,
  CopyrightStatus,
  EvidenceArtefact,
  EvidenceMediaType,
  ResearchChain,
  ResearchEntityType,
  ResearchReference,
  ResearchRevisionRecord,
} from '@khums/shared-types';
import {
  EVIDENCE_MAX_BYTES,
  evidenceArtefactSchema,
  findingPayloadSchema,
  passagePayloadSchema,
  rulingPayloadSchema,
  sourcePayloadSchema,
  translationPayloadSchema,
} from '@khums/validation';

import { authorize } from '../authorization/evaluate';
import { isTrustedPrincipal } from '../authorization/principal';
import {
  executeResearchCommand,
  type ResearchCommandInput,
  type ResearchRefusalCode,
} from './actions';
import { replayRulingSeries } from './rulings';
import { replayResearchChain } from './chain';
import type { ReferenceResolver } from './references';

/**
 * The evidence layer (M5.3.3; docs/SCHOLAR_RESEARCH_ARCHITECTURE.md §2, §4.3): sources, passages
 * and translations, plus write-once evidence artefacts. Builds on the generic research commands
 * (authorization, lifecycle, chain, AI and reference rules are `executeResearchCommand`'s) and adds
 * what is specific to these entity types:
 *
 * - each payload matches its schema (`SourcePayload`, `PassagePayload`, `TranslationPayload`);
 * - a source cites nothing; a passage cites exactly one SOURCE revision; a translation exactly one
 *   PASSAGE revision (original and translations are separate records);
 * - bindings that never change: a passage's source, a translation's passage and language (a
 *   revision may re-pin a newer revision of the SAME source or passage, never another one);
 * - findings (M5.3.4, D14): one or more exact PASSAGE revisions, optionally REVIEWED translations
 *   of those cited passages, never a SOURCE (enforced by `ALLOWED_REFERENCES`);
 * - rulings (M5.3.4): one or more FINDING and PASSAGE revisions, translations only of cited
 *   passages; versions and supersession (M5.3.5, `./rulings`): approving a version supersedes the
 *   series' current version in the same outcome (`superseded`), and a ruling is never superseded
 *   directly.
 *
 * Pure: no I/O, no clock, no hashing (the API computes SHA-256 and passes it in).
 */

export const EVIDENCE_ENTITY_TYPES: readonly ResearchEntityType[] = Object.freeze([
  'SOURCE',
  'PASSAGE',
  'TRANSLATION',
  'FINDING',
  'RULING',
]);

export type EvidenceContentIssueCode =
  /** The entity type is not part of the evidence layer (findings and rulings come later). */
  | 'ENTITY_TYPE_NOT_SUPPORTED'
  /** The payload does not match the entity type's schema. */
  | 'CONTENT_INVALID'
  /** A source cites nothing. */
  | 'REFERENCES_NOT_ALLOWED'
  /** A passage must cite exactly one source revision. */
  | 'SOURCE_REFERENCE_REQUIRED'
  /** A translation must cite exactly one passage revision. */
  | 'PASSAGE_REFERENCE_REQUIRED'
  /** A revision changed the passage's source, or the translation's passage or language. */
  | 'BINDING_CHANGED'
  /** A ruling must cite at least one finding revision. */
  | 'FINDING_REFERENCE_REQUIRED'
  /** A cited translation does not translate a passage revision this record also cites (D14). */
  | 'TRANSLATION_PASSAGE_NOT_CITED';

export type EvidenceRefusalCode = ResearchRefusalCode | EvidenceContentIssueCode;

export type EvidenceCommandOutcome =
  | { readonly status: 'DENIED'; readonly decision: AuthorizationDecision }
  | {
      readonly status: 'REFUSED';
      readonly decision: AuthorizationDecision;
      readonly issues: readonly EvidenceRefusalCode[];
    }
  | {
      readonly status: 'APPLIED';
      readonly decision: AuthorizationDecision;
      readonly chain: ResearchChain;
      readonly record: ResearchRevisionRecord;
      /**
       * RULING approval only: the SUPERSEDED record appended to the series' previously current
       * version, to be stored in the same unit of work as `record` (null when there was none).
       */
      readonly superseded?: {
        readonly chain: ResearchChain;
        readonly record: ResearchRevisionRecord;
      } | null;
    };

/** The single reference of the required type, or null. */
const onlyReference = (
  references: readonly ResearchReference[],
  entityType: ResearchEntityType,
): ResearchReference | null =>
  references.length === 1 && references[0]?.entityType === entityType ? references[0] : null;

/** The bindings that never change after revision 0 (null when the content does not parse). */
function bindingOf(
  entityType: ResearchEntityType,
  payload: unknown,
  references: readonly ResearchReference[],
): string | null {
  switch (entityType) {
    case 'SOURCE':
      return '';
    case 'PASSAGE':
      return onlyReference(references, 'SOURCE')?.entityId ?? null;
    case 'TRANSLATION': {
      const parsed = translationPayloadSchema.safeParse(payload);
      const passage = onlyReference(references, 'PASSAGE');
      return parsed.success && passage !== null
        ? `${passage.entityId}|${parsed.data.language}`
        : null;
    }
    case 'FINDING':
    case 'RULING':
      // The question (findings) and ruling version are bound in the record envelope itself.
      return '';
  }
}

const count = (references: readonly ResearchReference[], entityType: ResearchEntityType) =>
  references.filter((r) => r.entityType === entityType).length;

/**
 * Checks one content revision of an evidence entity against its schema, its reference rules and
 * (for revisions) the previous content's bindings.
 */
export function checkEvidenceContent(
  entityType: ResearchEntityType,
  payload: unknown,
  references: readonly ResearchReference[],
  previous: { readonly payload: unknown; readonly references: readonly ResearchReference[] } | null,
): readonly EvidenceContentIssueCode[] {
  switch (entityType) {
    case 'SOURCE':
      if (!sourcePayloadSchema.safeParse(payload).success) return ['CONTENT_INVALID'];
      return references.length === 0 ? [] : ['REFERENCES_NOT_ALLOWED'];
    case 'PASSAGE':
      if (!passagePayloadSchema.safeParse(payload).success) return ['CONTENT_INVALID'];
      if (onlyReference(references, 'SOURCE') === null) return ['SOURCE_REFERENCE_REQUIRED'];
      break;
    case 'TRANSLATION':
      if (!translationPayloadSchema.safeParse(payload).success) return ['CONTENT_INVALID'];
      if (onlyReference(references, 'PASSAGE') === null) return ['PASSAGE_REFERENCE_REQUIRED'];
      break;
    case 'FINDING':
      if (!findingPayloadSchema.safeParse(payload).success) return ['CONTENT_INVALID'];
      if (count(references, 'PASSAGE') === 0) return ['PASSAGE_REFERENCE_REQUIRED'];
      break;
    case 'RULING':
      if (!rulingPayloadSchema.safeParse(payload).success) return ['CONTENT_INVALID'];
      if (count(references, 'FINDING') === 0) return ['FINDING_REFERENCE_REQUIRED'];
      if (count(references, 'PASSAGE') === 0) return ['PASSAGE_REFERENCE_REQUIRED'];
      break;
  }
  if (previous !== null) {
    const before = bindingOf(entityType, previous.payload, previous.references);
    if (before === null || before !== bindingOf(entityType, payload, references)) {
      return ['BINDING_CHANGED'];
    }
  }
  return [];
}

/**
 * Authorizes and applies one research command for the evidence layer: everything
 * `executeResearchCommand` enforces, then the evidence content rules. Never throws; nothing is
 * stored (the caller persists the returned record atomically with its audit event).
 */
export function executeEvidenceCommand(input: ResearchCommandInput): EvidenceCommandOutcome {
  const outcome = executeResearchCommand(input);
  if (outcome.status !== 'APPLIED') return outcome;
  const refuse = (issues: readonly EvidenceRefusalCode[]): EvidenceCommandOutcome =>
    Object.freeze({
      status: 'REFUSED',
      decision: outcome.decision,
      issues: Object.freeze([...issues]),
    });
  const { record } = outcome;
  if (!EVIDENCE_ENTITY_TYPES.includes(record.entityType)) {
    return refuse(['ENTITY_TYPE_NOT_SUPPORTED']);
  }
  if (record.entityType === 'RULING' && record.kind === 'SUPERSEDED') {
    return refuse(['RULING_SUPERSEDED_BY_APPROVAL']);
  }
  if (record.entityType === 'RULING' && record.kind === 'APPROVED') {
    return approveRulingVersion(input, outcome, refuse);
  }
  if (record.kind !== 'CREATED' && record.kind !== 'REVISED') return outcome;
  let previous: { payload: unknown; references: readonly ResearchReference[] } | null = null;
  if (record.kind === 'REVISED') {
    const view = replayResearchChain(input.chain);
    if (!view.ok) return refuse(['RESEARCH_CHAIN_INVALID']);
    previous = { payload: view.value.content.payload, references: view.value.content.references };
  }
  const issues = checkEvidenceContent(
    record.entityType,
    record.payload,
    record.references,
    previous,
  );
  if (issues.length > 0) return refuse(issues);
  return translationsOfCitedPassages(record.references, input.resolve)
    ? outcome
    : refuse(['TRANSLATION_PASSAGE_NOT_CITED']);
}

/**
 * Approving ruling version n makes it the series' only current version: the previously current
 * (APPROVED) version is SUPERSEDED by the same principal in the same outcome. Version 1 has none;
 * a correction whose corrected version was withdrawn is refused. The series
 * must be valid, contain this version as its draft, and have no current version newer than it.
 */
function approveRulingVersion(
  input: ResearchCommandInput,
  outcome: Extract<EvidenceCommandOutcome, { status: 'APPLIED' }>,
  refuse: (issues: readonly EvidenceRefusalCode[]) => EvidenceCommandOutcome,
): EvidenceCommandOutcome {
  const { record } = outcome;
  if (input.rulingSeries === undefined) return refuse(['RULING_SERIES_INVALID']);
  const series = replayRulingSeries(input.rulingSeries.versions, record.marjaId);
  if (!series.ok) return refuse([series.error]);
  const { current, draft } = series.value;
  if (
    draft?.view.entityId !== record.entityId ||
    draft.view.rulingSeriesId !== (record.rulingSeriesId ?? null)
  ) {
    return refuse(['RULING_SERIES_INVALID']);
  }
  if (current === null) {
    // Version 1 starts its series. A correction approves only while the version it corrects is
    // still current: once that version is withdrawn, the correction can never become current
    // (owner decision 2026-11-22) — a new ruling is required. Both records stay as they are.
    return (record.rulingVersion ?? 1) === 1
      ? { ...outcome, superseded: null }
      : refuse(['RULING_CORRECTION_NOT_ALLOWED']);
  }
  if ((current.view.rulingVersion ?? 0) >= (record.rulingVersion ?? 0)) {
    return refuse(['RULING_VERSION_INVALID']);
  }
  const superseded = executeResearchCommand({
    principal: input.principal,
    chain: current.chain,
    command: {
      type: 'TRANSITION',
      expectedRevision: current.view.length,
      kind: 'SUPERSEDED',
      reason: null,
    },
    context: input.context,
  });
  if (superseded.status !== 'APPLIED') {
    return superseded.status === 'REFUSED' ? refuse(superseded.issues) : superseded;
  }
  return { ...outcome, superseded: { chain: superseded.chain, record: superseded.record } };
}

/** The content revision a pin to `revision` refers to: the latest CREATED/REVISED at or before it. */
function contentRevisionAt(chain: ResearchChain, revision: number): number | null {
  for (let i = Math.min(revision, chain.records.length - 1); i >= 0; i -= 1) {
    const kind = chain.records[i]?.kind;
    if (kind === 'CREATED' || kind === 'REVISED') return i;
  }
  return null;
}

/**
 * D14: every cited translation translates a passage revision the record also cites (the same
 * passage, pinned to the same content). The references themselves were already resolved and
 * checked (same Marja, existing revision) by `executeResearchCommand`.
 */
function translationsOfCitedPassages(
  references: readonly ResearchReference[],
  resolve: ReferenceResolver | undefined,
): boolean {
  const translations = references.filter((r) => r.entityType === 'TRANSLATION');
  if (translations.length === 0) return true;
  if (resolve === undefined) return false;
  const cited = references.filter((r) => r.entityType === 'PASSAGE');
  return translations.every((t) => {
    const chain = resolve(t);
    const at = chain === null ? null : contentRevisionAt(chain, t.revision);
    const passage =
      at === null
        ? undefined
        : chain?.records[at]?.references.find((r) => r.entityType === 'PASSAGE');
    if (passage === undefined) return false;
    const passageChain = resolve(passage);
    if (passageChain === null) return false;
    const pinned = contentRevisionAt(passageChain, passage.revision);
    return cited.some(
      (p) =>
        p.entityId === passage.entityId &&
        pinned !== null &&
        contentRevisionAt(passageChain, p.revision) === pinned,
    );
  });
}

// ---- Evidence artefacts ----

export type EvidenceAttachmentIssueCode =
  /** The source chain is not a valid SOURCE chain. */
  | 'SOURCE_INVALID'
  /** Evidence is attached only to a DRAFT or VERIFIED source. */
  | 'SOURCE_STATE_INVALID'
  /** A complete document needs copyright PERMITTED on the file and the source (D10). */
  | 'COPYRIGHT_FORBIDS_COMPLETE'
  /** Empty or larger than EVIDENCE_MAX_BYTES. */
  | 'EVIDENCE_SIZE_INVALID'
  /** The metadata does not form a valid artefact. */
  | 'EVIDENCE_INVALID';

export interface EvidenceAttachmentInput {
  /** A principal returned by `establishPrincipal`. */
  readonly principal: unknown;
  /** The stored, unverified source chain. */
  readonly sourceChain: unknown;
  readonly context: {
    readonly decisionId: unknown;
    readonly evaluatedAt: unknown;
    readonly session: unknown;
    readonly requestId: string;
  };
  readonly file: {
    /** A UUIDv7 drawn by the server. */
    readonly artefactId: string;
    /** SHA-256 of the bytes, computed by the server. */
    readonly digest: string;
    readonly size: number;
    readonly mediaType: EvidenceMediaType;
    readonly copyright: CopyrightStatus;
    readonly extent: 'EXCERPT' | 'COMPLETE';
    readonly description: string;
  };
}

export type EvidenceAttachmentOutcome =
  | { readonly status: 'DENIED'; readonly decision: AuthorizationDecision }
  | {
      readonly status: 'REFUSED';
      readonly decision: AuthorizationDecision;
      readonly issues: readonly EvidenceAttachmentIssueCode[];
    }
  | {
      readonly status: 'APPLIED';
      readonly decision: AuthorizationDecision;
      readonly artefact: EvidenceArtefact;
    };

const invalidDecision = (): AuthorizationDecision =>
  Object.freeze({
    allowed: false,
    decisionId: null,
    permission: null,
    reason: 'INVALID_REQUEST',
    evaluatedAt: null,
  });

/**
 * Decides whether an evidence file may be attached to a source: `research.source.record` in the
 * source's Marja (never a governance policy), a DRAFT or VERIFIED source, D10 copyright, size.
 * Returns the write-once metadata to store; the bytes are stored by the caller. Never throws.
 */
export function decideEvidenceAttachment(
  input: EvidenceAttachmentInput,
): EvidenceAttachmentOutcome {
  try {
    const view = replayResearchChain(input.sourceChain);
    if (!view.ok || view.value.entityType !== 'SOURCE') {
      return Object.freeze({ status: 'DENIED', decision: invalidDecision() });
    }
    const source = view.value;
    const decision = authorize({
      principal: input.principal,
      permission: 'research.source.record',
      resource: { type: 'MARJA_RESEARCH', marjaId: source.marjaId },
      context: {
        decisionId: input.context.decisionId,
        evaluatedAt: input.context.evaluatedAt,
        session: input.context.session,
        governance: null,
      },
    });
    if (!decision.allowed || !isTrustedPrincipal(input.principal)) {
      return Object.freeze({ status: 'DENIED', decision });
    }
    const refuse = (issue: EvidenceAttachmentIssueCode): EvidenceAttachmentOutcome =>
      Object.freeze({ status: 'REFUSED', decision, issues: Object.freeze([issue]) });

    if (source.state !== 'DRAFT' && source.state !== 'VERIFIED') {
      return refuse('SOURCE_STATE_INVALID');
    }
    const sourcePayload = sourcePayloadSchema.safeParse(source.content.payload);
    if (!sourcePayload.success) return refuse('SOURCE_INVALID');
    const { file } = input;
    if (
      file.extent === 'COMPLETE' &&
      (file.copyright !== 'PERMITTED' || sourcePayload.data.copyright !== 'PERMITTED')
    ) {
      return refuse('COPYRIGHT_FORBIDS_COMPLETE');
    }
    if (!Number.isInteger(file.size) || file.size < 1 || file.size > EVIDENCE_MAX_BYTES) {
      return refuse('EVIDENCE_SIZE_INVALID');
    }
    const artefact = evidenceArtefactSchema.safeParse({
      artefactId: file.artefactId,
      marjaId: source.marjaId,
      sourceId: source.entityId,
      sourceRevision: source.length - 1,
      digest: file.digest,
      size: file.size,
      mediaType: file.mediaType,
      storageKey: `${source.marjaId}/${file.digest}`,
      copyright: file.copyright,
      extent: file.extent,
      description: file.description,
      recordedBy: input.principal.principalId,
      recordedAt: decision.evaluatedAt,
      decisionId: decision.decisionId,
      requestId: input.context.requestId,
    });
    if (!artefact.success) return refuse('EVIDENCE_INVALID');
    return Object.freeze({ status: 'APPLIED', decision, artefact: Object.freeze(artefact.data) });
  } catch {
    return Object.freeze({ status: 'DENIED', decision: invalidDecision() });
  }
}

/** Read access to evidence of a Marja (`research.read`); never a governance policy. */
export function evidenceReadDecision(
  principal: unknown,
  marjaId: string,
  context: {
    readonly decisionId: unknown;
    readonly evaluatedAt: unknown;
    readonly session: unknown;
  },
): AuthorizationDecision {
  return authorize({
    principal,
    permission: 'research.read',
    resource: { type: 'MARJA_RESEARCH', marjaId },
    context: { ...context, governance: null },
  });
}
