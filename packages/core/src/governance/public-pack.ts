import { checkProductionReadiness, computeRulePackIntegrity } from '@khums/calculation-engine';
import type { GovernanceLedger, RulePack, RulePackActivation, Workflow } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import {
  governanceLedgerSchema,
  publicVerifiedPackSummarySchema,
  rulePackSchema,
  type PublicVerifiedPackSummary,
} from '@khums/validation';

import { approvalsFromLedger, checkGovernedProductionReadiness, recordReference } from './commands';
import { deepFreeze, replayLedger, type GovernanceIssue } from './ledger';

/**
 * The public, verified rule pack of a Marja (decision 65; docs/PHASE2_PLAN.md step 6).
 *
 * A pack is offered to the public calculator only when it is a governed PRODUCTION pack that the
 * ledger shows PUBLISHED and ACTIVATED, and it passes `checkGovernedProductionReadiness` (engine
 * gate: recomputed integrity, bound approvals, activation, every used rule APPROVED and sourced,
 * the fact mapping approved and sourced; plus the clean, non-terminal ledger) for EVERY workflow
 * the pack defines. Anything else — a mock pack, a scholar-review pack, a draft, an unactivated,
 * withdrawn or superseded version, a legacy unbound ledger, changed content — is never public.
 *
 * Pure: the API loads candidates from its stores; the browser re-checks the same bundle before
 * calculating (the facts never leave the device; decision 27).
 */

/** What the API serves and the browser verifies again: the content and its governance ledger. */
export interface VerifiedPackBundle {
  readonly pack: RulePack;
  readonly ledger: GovernanceLedger;
  readonly activation: RulePackActivation;
  /** The workflows the pack defines (each one passed the governed readiness check). */
  readonly workflows: readonly Workflow[];
}

const definedWorkflows = (pack: RulePack): Workflow[] => [
  ...(pack.workflows.annual ? (['annual'] as const) : []),
  ...(pack.workflows.firstTime ? (['first-time'] as const) : []),
  ...(pack.workflows.missedYear ? (['missed-year'] as const) : []),
];

/**
 * The activation of a governed pack version, rebuilt only from its verified ledger (exactly as the
 * ACTIVATE command built it): the ACTIVATED record's digest, the publication record and the
 * ledger-derived approvals. Fails when the ledger does not replay or holds no activation.
 */
export function activationFromLedger(
  raw: unknown,
): Result<RulePackActivation, readonly GovernanceIssue[]> {
  const parsed = governanceLedgerSchema.safeParse(raw);
  if (!parsed.success) return err([{ code: 'LEDGER_MALFORMED', recordId: null }]);
  const ledger = parsed.data;
  const view = replayLedger(ledger);
  if (!view.ok) return err([view.error]);
  const { activation, publication } = view.value;
  if (activation === null || publication === null) {
    return err([{ code: 'INVALID_TRANSITION', recordId: null }]);
  }
  const approvals = approvalsFromLedger(ledger);
  if (!approvals.ok) return approvals;
  return ok(
    deepFreeze<RulePackActivation>({
      packId: ledger.packId,
      version: ledger.version,
      integrity: { ...activation.integrity },
      activatedAt: activation.recordedAt.slice(0, 10),
      activatedBy: activation.actor.subject,
      approvalReferences: approvals.value.map((a) => a.reference),
      publicationReference: recordReference(publication),
    }),
  );
}

/**
 * Checks that `rawPack` and `rawLedger` form a public, verified pack (see the module comment).
 * Untrusted input: both are validated with the strict schemas first.
 */
export function checkPublicVerifiedPack(
  rawPack: unknown,
  rawLedger: unknown,
): Result<VerifiedPackBundle, readonly GovernanceIssue[]> {
  const pack = rulePackSchema.safeParse(rawPack);
  if (!pack.success) return err([{ code: 'PACK_MALFORMED', recordId: null }]);
  const ledger = governanceLedgerSchema.safeParse(rawLedger);
  if (!ledger.success) return err([{ code: 'LEDGER_MALFORMED', recordId: null }]);
  // Explicit, before anything else: never a mock or a scholar-review (provisional) pack.
  if (pack.data.metadata.isMock || pack.data.metadata.releaseChannel === 'SCHOLAR_REVIEW') {
    return err([{ code: 'NOT_ELIGIBLE', recordId: null }]);
  }
  const activation = activationFromLedger(ledger.data);
  if (!activation.ok) return activation;
  const workflows = definedWorkflows(pack.data);
  if (workflows.length === 0) return err([{ code: 'NOT_ELIGIBLE', recordId: null }]);
  const issues = workflows.flatMap((workflow) =>
    checkGovernedProductionReadiness(pack.data, ledger.data, {
      workflow,
      activation: activation.value,
      // Dates are checked again by the engine with the user's own periods at calculation time.
      dateRanges: [],
      // The public calculator maps the user's facts with the pack's own (approved) mapping.
      requireFactMapping: true,
    }),
  );
  if (issues.length > 0) return err(issues);
  return ok(
    deepFreeze<VerifiedPackBundle>({
      pack: pack.data,
      ledger: ledger.data,
      activation: activation.value,
      workflows,
    }),
  );
}

const versionParts = (v: string) => v.split('.').map((part) => Number.parseInt(part, 10) || 0);
const compareVersions = (a: string, b: string): number => {
  const [x, y] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < 3; i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

/** The ACTIVATED record's time of a verified bundle (ISO; recorded by the server). */
const activatedAtOf = (bundle: VerifiedPackBundle): string =>
  bundle.ledger.records.findLast((r) => r.type === 'ACTIVATED')?.recordedAt ?? '';

/**
 * The verified pack the public calculator uses for `marjaId`, from the candidates the API loaded
 * (any governed versions of that Marja), or null when none qualifies: only bundles that pass
 * `checkPublicVerifiedPack` and belong to the Marja; the most recently activated one wins (then
 * the higher version, then the pack id, so the choice is deterministic).
 */
export function selectPublicVerifiedPack(
  marjaId: string,
  candidates: readonly { readonly pack: unknown; readonly ledger: unknown }[],
): VerifiedPackBundle | null {
  let best: VerifiedPackBundle | null = null;
  for (const candidate of candidates) {
    const checked = checkPublicVerifiedPack(candidate.pack, candidate.ledger);
    if (!checked.ok || checked.value.pack.metadata.marjaId !== marjaId) continue;
    const bundle = checked.value;
    if (best === null) {
      best = bundle;
      continue;
    }
    const byTime = activatedAtOf(bundle).localeCompare(activatedAtOf(best));
    const byVersion = compareVersions(bundle.pack.metadata.version, best.pack.metadata.version);
    const byId = bundle.pack.metadata.packId.localeCompare(best.pack.metadata.packId);
    if (byTime > 0 || (byTime === 0 && (byVersion > 0 || (byVersion === 0 && byId > 0)))) {
      best = bundle;
    }
  }
  return best;
}

// ── Public bundle without the ledger (Phase 2 step 5 privacy fix) ─────────────────────────────

/** Stands in for a person identifier in what the public calculator receives. */
export const REDACTED_PERSON = 'redacted';

/**
 * What the public endpoint serves: the sealed pack with every approval's person identifier
 * replaced by an opaque placeholder (approvals are outside the hashed content, so the digest and
 * every approval's digest binding are unchanged), and the public verification summary. The
 * governance ledger, which names staff principals, never leaves the server.
 */
export interface PublicPackBundle {
  readonly pack: RulePack;
  readonly summary: PublicVerifiedPackSummary;
}

/** The public bundle of a server-verified bundle (`checkPublicVerifiedPack` already passed). */
export function publicBundleOf(bundle: VerifiedPackBundle): PublicPackBundle {
  const { pack, ledger, activation } = bundle;
  const publication = ledger.records.findLast((r) => r.type === 'PUBLISHED');
  return deepFreeze<PublicPackBundle>({
    pack: {
      ...pack,
      metadata: {
        ...pack.metadata,
        // A distinct placeholder per approval keeps the engine's two-person separation check
        // meaningful for independently reviewed packs (the server checked the real people).
        approvals: pack.metadata.approvals.map((a, i) => ({
          ...a,
          reviewerId: `${REDACTED_PERSON}-${String(i + 1)}`,
        })),
      },
    },
    summary: {
      packId: pack.metadata.packId,
      version: pack.metadata.version,
      contentDigest: activation.integrity.digest,
      activatedAt: activation.activatedAt,
      workflows: [...bundle.workflows],
      publishedAt: (publication?.recordedAt ?? '').slice(0, 10),
      approvalReferences: [...activation.approvalReferences],
      publicationReference: activation.publicationReference,
      rules: pack.rules.map((r) => ({ ruleId: r.id, verified: r.status === 'APPROVED' })),
    },
  });
}

/** What the browser verified: the pack, the activation rebuilt from the summary, the workflows. */
export interface CheckedPublicPack {
  readonly pack: RulePack;
  readonly summary: PublicVerifiedPackSummary;
  readonly activation: RulePackActivation;
  readonly workflows: readonly Workflow[];
}

const sameList = (a: readonly unknown[], b: readonly unknown[]) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * The browser's re-check of a public bundle (the server already ran the governed, ledger-based
 * readiness check): strict validation; never a mock or scholar-review pack; the identity and the
 * RECOMPUTED content digest equal the summary; and the engine production gate passes for every
 * workflow the pack defines (declared integrity, approvals bound to the digest, the activation
 * the summary names, every used rule APPROVED and sourced, the fact mapping). Untrusted input.
 */
export function checkPublicPackBundle(
  rawPack: unknown,
  rawSummary: unknown,
): Result<CheckedPublicPack, readonly GovernanceIssue[]> {
  const parsedPack = rulePackSchema.safeParse(rawPack);
  if (!parsedPack.success) return err([{ code: 'PACK_MALFORMED', recordId: null }]);
  const parsedSummary = publicVerifiedPackSummarySchema.safeParse(rawSummary);
  if (!parsedSummary.success) return err([{ code: 'NOT_ELIGIBLE', recordId: null }]);
  const pack = parsedPack.data;
  const summary = parsedSummary.data;
  if (pack.metadata.isMock || pack.metadata.releaseChannel === 'SCHOLAR_REVIEW') {
    return err([{ code: 'NOT_ELIGIBLE', recordId: null }]);
  }
  if (pack.metadata.packId !== summary.packId)
    return err([{ code: 'PACK_MISMATCH', recordId: null }]);
  if (pack.metadata.version !== summary.version) {
    return err([{ code: 'VERSION_MISMATCH', recordId: null }]);
  }
  const computed = computeRulePackIntegrity(pack);
  if (!computed.ok || computed.value.digest !== summary.contentDigest) {
    return err([{ code: 'DIGEST_MISMATCH', recordId: null }]);
  }
  const workflows = definedWorkflows(pack);
  if (workflows.length === 0 || !sameList(workflows, summary.workflows)) {
    return err([{ code: 'NOT_ELIGIBLE', recordId: null }]);
  }
  const rules = pack.rules.map((r) => ({ ruleId: r.id, verified: r.status === 'APPROVED' }));
  if (!sameList(rules, summary.rules)) return err([{ code: 'NOT_ELIGIBLE', recordId: null }]);
  const activation: RulePackActivation = {
    packId: summary.packId,
    version: summary.version,
    integrity: computed.value,
    activatedAt: summary.activatedAt,
    activatedBy: REDACTED_PERSON,
    approvalReferences: summary.approvalReferences,
    publicationReference: summary.publicationReference,
  };
  const issues = workflows.flatMap((workflow) =>
    checkProductionReadiness(pack, {
      workflow,
      activation,
      dateRanges: [],
      requireFactMapping: true,
    }).map((i) => ({ code: i.code, recordId: null })),
  );
  if (issues.length > 0) return err(issues);
  return ok(deepFreeze<CheckedPublicPack>({ pack, summary, activation, workflows }));
}
