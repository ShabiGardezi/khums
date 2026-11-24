import type {
  ResearchChain,
  ResearchEntityType,
  ResearchReference,
  ResearchRevisionRecord,
  RulePack,
  RulingFindingSnapshot,
  RulingPassageSnapshot,
  RulingSnapshot,
} from '@khums/shared-types';

import { canonicalDigest, sealRulePack } from '@khums/calculation-engine';

import { replayResearchChain } from './chain';
import { TERMINAL_RESEARCH_STATES } from './lifecycle';
import { checkResearchReferences } from './references';

/**
 * Rule-pack ruling references and in-pack provenance (M5.3.6; docs/SCHOLAR_RESEARCH_ARCHITECTURE.md
 * §9, D13). A rule's `rulingRefs` entries name exact ruling versions as `"<ruling id>@<version>"`.
 *
 * - **Production** (governance submit and activation): the ruling version must be the series'
 *   current APPROVED version of the PACK'S Marja.
 * - **Provisional** (staff-only scholar-review packs: registration and calculation): a properly
 *   sourced DRAFT version is also allowed, so the scholar can review real rules in action before
 *   approving them. Withdrawn, superseded and deleted versions are never allowed anywhere.
 * - **Source-verified** (rule-builder PRODUCTION packs only, decision 67): the ruling version must
 *   be the current DRAFT or APPROVED version of the pack's Marja AND its evidence verified (as for
 *   every policy). Under decision 63 the authorized scholar's source verification of the rule is
 *   the approval, so no separate ruling approval step is required; the builder's own verification
 *   preconditions (VERIFIED sources/passages, REVIEWED translations) apply on top. Used only by
 *   the automatic builder publication; hand-submitted packs keep the PRODUCTION policy.
 * - Every cited ruling must be sourced: it cites at least one finding and one passage, and its
 *   EVIDENCE is verified even when the ruling itself is a draft (D14): every passage revision the
 *   ruling or any of its findings cites, and each passage's source revision, is VERIFIED at the
 *   pinned revision and not disputed or withdrawn since (the existing APPROVAL-phase reference
 *   rules); findings cite passages only. A draft ruling never means unverified evidence.
 *
 * At submission/registration `buildRulingSnapshots` freezes each cited ruling version and its
 * finding → passage → source chain into the pack (hashed content). At activation/calculation
 * `checkRulingSnapshots` re-checks the lifecycle and that the ruling's content is still exactly the
 * snapshotted content (a revised draft needs a new pack version). Packs stay authored content:
 * nothing here creates or changes a rule, formula or value. Pure.
 */

export type RulingReferencePolicy = 'PRODUCTION' | 'PROVISIONAL' | 'SOURCE_VERIFIED';

export type RulingReferenceIssueCode =
  /** Not of the form `<uuidv7>@<version>`. */
  | 'RULING_REFERENCE_INVALID'
  /** No such ruling version in the pack's Marja (unknown, another Marja, or another version). */
  | 'RULING_REFERENCE_UNRESOLVED'
  /** Production needs the APPROVED version; this one is a draft. */
  | 'RULING_NOT_APPROVED'
  /** Withdrawn, superseded or deleted: never usable. */
  | 'RULING_NOT_CURRENT'
  /** A rule without any ruling reference where one is required (activation). */
  | 'RULING_REFERENCE_REQUIRED'
  /** The ruling cites no finding or passage, or a cited record cannot be resolved. */
  | 'RULING_PROVENANCE_INCOMPLETE'
  /** A passage or source in the chain is not VERIFIED at its pin (or disputed/withdrawn since). */
  | 'RULING_EVIDENCE_UNVERIFIED'
  /** The pack carries snapshots that differ from the stored research records. */
  | 'RULING_SNAPSHOT_MISMATCH'
  /** A cited ruling has no snapshot in the pack (activation/calculation). */
  | 'RULING_SNAPSHOT_MISSING'
  /** The ruling's content changed after the snapshot (a revised draft): a new pack version is needed. */
  | 'RULING_SNAPSHOT_STALE';

export interface RulingReferenceIssue {
  readonly code: RulingReferenceIssueCode;
  readonly ruleId: string;
}

/** Loads a stored research chain by entity type and id (null when there is none). */
export type ResearchChainLoader = (
  entityType: ResearchEntityType,
  entityId: string,
) => ResearchChain | null;

const REF =
  /^([0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})@([1-9]\d{0,4})$/;

/** The entity id and version of a ruling reference, or null when malformed. */
export function parseRulingRef(ref: string): { entityId: string; version: number } | null {
  const match = REF.exec(ref);
  return match?.[1] === undefined || match[2] === undefined
    ? null
    : { entityId: match[1], version: Number(match[2]) };
}

/** Every ruling entity id the pack references (the starting points to load). */
export function rulingIdsOf(pack: RulePack): readonly string[] {
  const ids = new Set<string>();
  for (const rule of pack.rules) {
    for (const ref of rule.rulingRefs) {
      const parsed = parseRulingRef(ref);
      if (parsed !== null) ids.add(parsed.entityId);
    }
  }
  return [...ids];
}

/** The content record a pin to `revision` refers to: the latest CREATED/REVISED at or before it. */
function contentAt(chain: ResearchChain, revision: number): ResearchRevisionRecord | null {
  for (let i = Math.min(revision, chain.records.length - 1); i >= 0; i -= 1) {
    const record = chain.records[i];
    if (record?.kind === 'CREATED' || record?.kind === 'REVISED') return record;
  }
  return null;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const obj = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

type Resolved =
  | { readonly ok: true; readonly chain: ResearchChain; readonly state: 'DRAFT' | 'APPROVED' }
  | { readonly ok: false; readonly code: RulingReferenceIssueCode };

/** Resolves one reference and applies the lifecycle policy. */
function resolveRuling(
  ref: string,
  marjaId: string,
  load: ResearchChainLoader,
  policy: RulingReferencePolicy,
): Resolved {
  const parsed = parseRulingRef(ref);
  if (parsed === null) return { ok: false, code: 'RULING_REFERENCE_INVALID' };
  const chain = load('RULING', parsed.entityId);
  const view = chain === null ? null : replayResearchChain(chain);
  if (
    chain === null ||
    view?.ok !== true ||
    view.value.entityType !== 'RULING' ||
    view.value.rulingVersion !== parsed.version ||
    view.value.marjaId !== marjaId
  ) {
    return { ok: false, code: 'RULING_REFERENCE_UNRESOLVED' };
  }
  const { state } = view.value;
  if (state === 'APPROVED') return { ok: true, chain, state };
  if (state === 'DRAFT') {
    return policy === 'PROVISIONAL' || policy === 'SOURCE_VERIFIED'
      ? { ok: true, chain, state }
      : { ok: false, code: 'RULING_NOT_APPROVED' };
  }
  return { ok: false, code: 'RULING_NOT_CURRENT' };
}

/** A passage revision with its source, or null when any link is missing. */
function passageSnapshot(
  reference: ResearchReference,
  load: ResearchChainLoader,
): RulingPassageSnapshot | null {
  const chain = load('PASSAGE', reference.entityId);
  const pinned = chain?.records[reference.revision];
  const content = chain === null ? null : contentAt(chain, reference.revision);
  const sourceRef = content?.references.find((r) => r.entityType === 'SOURCE');
  if (pinned === undefined || content === null || sourceRef === undefined) return null;
  const sourceChain = load('SOURCE', sourceRef.entityId);
  const sourcePinned = sourceChain?.records[sourceRef.revision];
  const sourceContent = sourceChain === null ? null : contentAt(sourceChain, sourceRef.revision);
  if (sourcePinned === undefined || sourceContent === null) return null;
  const payload = obj(content.payload);
  const sourcePayload = obj(sourceContent.payload);
  const copyright = str(sourcePayload.copyright);
  return {
    entityId: reference.entityId,
    displayRef: pinned.displayRef,
    revision: reference.revision,
    recordDigest: pinned.recordDigest,
    contentRevision: content.revision,
    payloadDigest: content.payloadDigest ?? '',
    locator: obj(payload.locator),
    originalLanguage: str(payload.originalLanguage),
    // D10: restricted text never enters a pack; locators and digests always do.
    text: copyright === 'PERMITTED' ? str(payload.text) : null,
    source: {
      entityId: sourceRef.entityId,
      displayRef: sourcePinned.displayRef,
      revision: sourceRef.revision,
      recordDigest: sourcePinned.recordDigest,
      title: str(obj(sourcePayload.title).original),
      copyright,
    },
  };
}

/**
 * D14 evidence rule for a ruling version's current content: every passage revision cited by the
 * ruling or by its findings, and each passage's source revision, satisfies the APPROVAL-phase
 * reference rules (VERIFIED at the pin; not disputed or withdrawn since); findings cite at least
 * one passage and never a source.
 */
function evidenceVerified(
  ruling: ResearchChain,
  marjaId: string,
  load: ResearchChainLoader,
): boolean {
  const content = contentAt(ruling, ruling.records.length - 1);
  if (content === null) return false;
  const resolve = (r: ResearchReference) => load(r.entityType, r.entityId);
  const passages = content.references.filter((r) => r.entityType === 'PASSAGE');
  for (const reference of content.references.filter((r) => r.entityType === 'FINDING')) {
    const finding = load('FINDING', reference.entityId);
    const findingContent = finding === null ? null : contentAt(finding, reference.revision);
    if (finding === null || findingContent === null) return false;
    // A deleted, withdrawn or superseded finding never backs a ruling's evidence (audit BLD-02).
    const findingView = replayResearchChain(finding);
    if (!findingView.ok || TERMINAL_RESEARCH_STATES.has(findingView.value.state)) return false;
    const cited = findingContent.references;
    if (
      cited.some((r) => r.entityType === 'SOURCE') ||
      !cited.some((r) => r.entityType === 'PASSAGE')
    ) {
      return false;
    }
    passages.push(...cited.filter((r) => r.entityType === 'PASSAGE'));
  }
  if (checkResearchReferences(marjaId, passages, resolve, 'APPROVAL').length > 0) return false;
  const sources: ResearchReference[] = [];
  for (const reference of passages) {
    const passage = load('PASSAGE', reference.entityId);
    const passageContent = passage === null ? null : contentAt(passage, reference.revision);
    const source = passageContent?.references.find((r) => r.entityType === 'SOURCE');
    if (source === undefined) return false;
    sources.push(source);
  }
  return checkResearchReferences(marjaId, sources, resolve, 'APPROVAL').length === 0;
}

/**
 * The ruling payload frozen into a snapshot. Source-verified (public builder) packs leave out the
 * internal research `notes` (audit SEC-01): the four attestations do not cover them and public
 * content carries only verified material. The payload digest and the content record digest still
 * bind the complete stored payload.
 */
function snapshotPayload(
  payload: unknown,
  policy: RulingReferencePolicy,
): Readonly<Record<string, unknown>> {
  const all = obj(payload);
  if (policy !== 'SOURCE_VERIFIED' || !Object.hasOwn(all, 'notes')) return all;
  const { notes: _internal, ...published } = all;
  return published;
}

/** The snapshot of one resolved ruling version, or null when its provenance is incomplete. */
function snapshotOf(
  ref: string,
  chain: ResearchChain,
  state: 'DRAFT' | 'APPROVED',
  load: ResearchChainLoader,
  policy: RulingReferencePolicy,
): RulingSnapshot | null {
  const first = chain.records[0];
  const content = contentAt(chain, chain.records.length - 1);
  if (first === undefined || content === null) return null;
  const findingRefs = content.references.filter((r) => r.entityType === 'FINDING');
  const passageRefs = new Map<string, ResearchReference>();
  for (const r of content.references) {
    if (r.entityType === 'PASSAGE') passageRefs.set(`${r.entityId}@${String(r.revision)}`, r);
  }
  if (findingRefs.length === 0 || passageRefs.size === 0) return null;
  const findings: RulingFindingSnapshot[] = [];
  for (const reference of findingRefs) {
    const findingChain = load('FINDING', reference.entityId);
    const pinned = findingChain?.records[reference.revision];
    const findingContent =
      findingChain === null ? null : contentAt(findingChain, reference.revision);
    if (pinned === undefined || findingContent === null || pinned.question === null) return null;
    const cited = findingContent.references.filter((r) => r.entityType === 'PASSAGE');
    for (const r of cited) passageRefs.set(`${r.entityId}@${String(r.revision)}`, r);
    findings.push({
      entityId: reference.entityId,
      displayRef: pinned.displayRef,
      revision: reference.revision,
      recordDigest: pinned.recordDigest,
      contentRevision: findingContent.revision,
      payloadDigest: findingContent.payloadDigest ?? '',
      questionId: pinned.question.id,
      passageRefs: cited.map((r) => `${r.entityId}@${String(r.revision)}`).sort(),
    });
  }
  const passages: RulingPassageSnapshot[] = [];
  for (const key of [...passageRefs.keys()].sort()) {
    const reference = passageRefs.get(key);
    const passage = reference === undefined ? null : passageSnapshot(reference, load);
    if (passage === null) return null;
    passages.push(passage);
  }
  return {
    ref,
    marjaId: first.marjaId,
    displayRef: first.displayRef,
    rulingSeriesId: first.rulingSeriesId ?? first.entityId,
    rulingVersion: first.rulingVersion ?? 0,
    state,
    contentRevision: content.revision,
    payloadDigest: content.payloadDigest ?? '',
    contentRecordDigest: content.recordDigest,
    payload: snapshotPayload(content.payload, policy),
    findings: findings.sort((a, b) => (a.entityId < b.entityId ? -1 : 1)),
    passages,
  };
}

/**
 * The issue of ONE ruling reference under `policy` (null when it resolves, has complete provenance
 * and verified evidence): the same checks `buildRulingSnapshots` applies per reference.
 */
export function rulingReferenceIssue(
  ref: string,
  marjaId: string,
  load: ResearchChainLoader,
  policy: RulingReferencePolicy,
): RulingReferenceIssueCode | null {
  const resolved = resolveRuling(ref, marjaId, load, policy);
  if (!resolved.ok) return resolved.code;
  if (snapshotOf(ref, resolved.chain, resolved.state, load, policy) === null) {
    return 'RULING_PROVENANCE_INCOMPLETE';
  }
  return evidenceVerified(resolved.chain, marjaId, load) ? null : 'RULING_EVIDENCE_UNVERIFIED';
}

/** The record digest of a ruling chain's current content record (null when it has none). */
export function rulingContentRecordDigest(chain: ResearchChain): string | null {
  return contentAt(chain, chain.records.length - 1)?.recordDigest ?? null;
}

/**
 * Submission / registration: resolves every ruling reference under `policy` and freezes each cited
 * ruling version with its provenance chain. Snapshots are sorted by `ref`; empty when no rule cites a
 * ruling.
 */
export function buildRulingSnapshots(
  pack: RulePack,
  load: ResearchChainLoader,
  policy: RulingReferencePolicy,
): {
  readonly issues: readonly RulingReferenceIssue[];
  readonly snapshots: readonly RulingSnapshot[];
} {
  const issues: RulingReferenceIssue[] = [];
  const snapshots = new Map<string, RulingSnapshot>();
  for (const rule of pack.rules) {
    for (const ref of rule.rulingRefs) {
      const resolved = resolveRuling(ref, pack.metadata.marjaId, load, policy);
      if (!resolved.ok) {
        issues.push({ code: resolved.code, ruleId: rule.id });
        continue;
      }
      const snapshot =
        snapshots.get(ref) ?? snapshotOf(ref, resolved.chain, resolved.state, load, policy);
      if (snapshot === null) {
        issues.push({ code: 'RULING_PROVENANCE_INCOMPLETE', ruleId: rule.id });
        continue;
      }
      if (!evidenceVerified(resolved.chain, pack.metadata.marjaId, load)) {
        issues.push({ code: 'RULING_EVIDENCE_UNVERIFIED', ruleId: rule.id });
        continue;
      }
      snapshots.set(ref, snapshot);
    }
  }
  return {
    issues,
    snapshots: [...snapshots.keys()].sort().flatMap((ref) => snapshots.get(ref) ?? []),
  };
}

/**
 * Activation / calculation: every cited ruling is still usable under `policy`, carries a snapshot
 * in the pack, and its content is still exactly the snapshotted content. `requireEveryRule`
 * (production activation) also refuses a rule without any ruling reference.
 */
export function checkRulingSnapshots(
  pack: RulePack,
  load: ResearchChainLoader,
  policy: RulingReferencePolicy,
  options: { readonly requireEveryRule: boolean },
): readonly RulingReferenceIssue[] {
  const issues: RulingReferenceIssue[] = [];
  const snapshots = new Map((pack.rulingSnapshots ?? []).map((s) => [s.ref, s]));
  for (const rule of pack.rules) {
    if (options.requireEveryRule && rule.rulingRefs.length === 0) {
      issues.push({ code: 'RULING_REFERENCE_REQUIRED', ruleId: rule.id });
    }
    for (const ref of rule.rulingRefs) {
      const resolved = resolveRuling(ref, pack.metadata.marjaId, load, policy);
      if (!resolved.ok) {
        issues.push({ code: resolved.code, ruleId: rule.id });
        continue;
      }
      const snapshot = snapshots.get(ref);
      if (snapshot === undefined) {
        issues.push({ code: 'RULING_SNAPSHOT_MISSING', ruleId: rule.id });
        continue;
      }
      const content = contentAt(resolved.chain, resolved.chain.records.length - 1);
      if (
        content?.revision !== snapshot.contentRevision ||
        content.recordDigest !== snapshot.contentRecordDigest
      ) {
        issues.push({ code: 'RULING_SNAPSHOT_STALE', ruleId: rule.id });
      } else if (!evidenceVerified(resolved.chain, pack.metadata.marjaId, load)) {
        // Evidence disputed or withdrawn since the snapshot stops further use.
        issues.push({ code: 'RULING_EVIDENCE_UNVERIFIED', ruleId: rule.id });
      }
    }
  }
  return issues;
}

/**
 * The pack version to store: with the server-computed snapshots added (and its declared integrity
 * re-sealed over them), unchanged when no rule cites a ruling. Snapshots the author already carried
 * must equal the computed ones exactly (canonical comparison), otherwise `RULING_SNAPSHOT_MISMATCH`.
 */
export function withRulingSnapshots(
  pack: RulePack,
  snapshots: readonly RulingSnapshot[],
):
  | { readonly ok: true; readonly pack: RulePack }
  | { readonly ok: false; readonly code: 'RULING_SNAPSHOT_MISMATCH' } {
  if (pack.rulingSnapshots !== undefined) {
    const given = canonicalDigest(pack.rulingSnapshots);
    const computed = canonicalDigest(snapshots);
    return given.ok && computed.ok && given.value === computed.value
      ? { ok: true, pack }
      : { ok: false, code: 'RULING_SNAPSHOT_MISMATCH' };
  }
  if (snapshots.length === 0) return { ok: true, pack };
  const sealed = sealRulePack({ ...pack, rulingSnapshots: snapshots });
  return sealed.ok
    ? { ok: true, pack: sealed.value }
    : { ok: false, code: 'RULING_SNAPSHOT_MISMATCH' };
}
