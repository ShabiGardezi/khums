import { describe, expect, it } from 'vitest';

import type {
  GovernanceLedger,
  ResearchChain,
  ResearchEntityType,
  ResearchReference,
  RulePack,
  VerifiedPrincipal,
} from '@khums/shared-types';
import type {
  BuilderRuleContent,
  RuleVerificationRecord,
  ScholarRuleRevision,
} from '@khums/validation';

import { ALL, marjaScope, NOW, principal, shift } from '../authorization/test-support';
import { runVerifiedAssessment } from '../financial/run-assessment';
import { executeGovernanceCommand } from '../governance/authorized';
import { checkGovernedProductionReadiness } from '../governance/commands';
import { replayLedger } from '../governance/ledger';
import { proposeGovernancePolicyChange } from '../governance/policy-registry';
import {
  activationFromLedger,
  checkPublicVerifiedPack,
  publicBundleOf,
  selectPublicVerifiedPack,
} from '../governance/public-pack';
import { appendResearchRevision } from '../research/chain';
import { formatUuidV7, researchDisplayRef } from '../research/ids';
import {
  builderPackRuleId,
  builderTestSheet,
  checkVerificationPreconditions,
  classifyBuilderRules,
  compileVerifiedBuilderPack,
  completeVerification,
  currentVerification,
  nextBuilderVersion,
  previewBuilderPublication,
  recordRuleVerification,
  ruleRevisionContentHash,
  runAutomaticBuilderGovernance,
  selectLivePublicPack,
  checkLivePackResearch,
  type PendingRuleVerification,
} from './index';
import { rulingReferenceIssue } from '../research/rule-pack-references';

/**
 * Phase 2 step 5 (decisions 63, 67): source verification, automatic approval and publication of
 * builder rules. SYNTHETIC research records and TEST values only (rate 12.5, amounts 200.00 …);
 * nothing here states how any Marja treats anything. `sistani` is used only as an id because the
 * builder policy is configured for the research Marjas.
 */

const MARJA = 'sistani';

let seq = 0;
const uuid = () => {
  seq += 1;
  const random = new Uint8Array(10);
  random[0] = 0x80;
  random[8] = Math.floor(seq / 256);
  random[9] = seq % 256;
  return formatUuidV7(Date.parse('2026-11-22T12:00:00.000Z') + seq, random);
};
const step = (
  kind: string,
  payload: Record<string, unknown> | null,
  refs: ResearchReference[],
) => ({
  kind: kind as 'CREATED',
  payload,
  references: refs,
  aiInvolvement: [],
  actor: { kind: 'STAFF_PRINCIPAL' as const, subject: 'test-scholar' },
  recordedAt: '2026-11-22T12:00:00.000Z',
  reason: ['WITHDRAWN', 'DRAFT_DELETED', 'DISPUTED'].includes(kind) ? 'TEST reason' : null,
  decisionId: `d-${kind}`,
  requestId: `r-${kind}`,
});
const pin = (chain: ResearchChain, revision: number): ResearchReference => ({
  entityType: chain.entityType,
  entityId: chain.entityId,
  revision,
  rulingVersion: chain.records[0]?.rulingVersion ?? null,
  marjaId: chain.records[0]?.marjaId ?? '',
});

const chains = new Map<string, ResearchChain>();
const load = (type: ResearchEntityType, id: string) => {
  const chain = chains.get(id);
  return chain?.entityType === type ? chain : null;
};
function create(
  entityType: ResearchEntityType,
  payload: Record<string, unknown>,
  refs: ResearchReference[] = [],
  marjaId = MARJA,
): ResearchChain {
  const entityId = uuid();
  const question =
    entityType === 'FINDING'
      ? { id: 'INC-01', catalogueRevision: 'research-matrix-rev5-required' }
      : null;
  const made = appendResearchRevision(
    null,
    {
      entityType,
      entityId,
      displayRef: researchDisplayRef(entityType, marjaId, entityId, question?.id ?? null),
      marjaId,
      rulingVersion: entityType === 'RULING' ? 1 : null,
      rulingSeriesId: entityType === 'RULING' ? entityId : null,
      question,
    },
    step('CREATED', payload, refs),
  );
  if (!made.ok) throw new Error(made.error);
  chains.set(entityId, made.value.chain);
  return made.value.chain;
}
function then(chain: ResearchChain, kind: string, payload: Record<string, unknown> | null = null) {
  const next = appendResearchRevision(chain, null, step(kind, payload, []));
  if (!next.ok) throw new Error(`${kind}: ${next.error}`);
  chains.set(chain.entityId, next.value.chain);
  return next.value.chain;
}

/**
 * TEST research: a source and a passage (both DRAFT until verified), a finding citing the passage
 * and a draft ruling citing the finding and the passage. Pins point at revision 1 (the VERIFIED
 * record) once verified, so verification happens before the finding is created.
 */
function research(options: { verify: boolean; marjaId?: string } = { verify: true }) {
  const marjaId = options.marjaId ?? MARJA;
  let source = create(
    'SOURCE',
    { title: { original: 'TEST source', translation: null }, copyright: 'EXCERPTS_ONLY' },
    [],
    marjaId,
  );
  if (options.verify) source = then(source, 'VERIFIED');
  let passage = create(
    'PASSAGE',
    { locator: { page: '1' }, originalLanguage: 'ar', text: 'TEST excerpt' },
    [pin(source, options.verify ? 1 : 0)],
    marjaId,
  );
  if (options.verify) passage = then(passage, 'VERIFIED');
  const passagePin = options.verify ? 1 : 0;
  let finding = create(
    'FINDING',
    { conclusion: 'TEST finding' },
    [pin(passage, passagePin)],
    marjaId,
  );
  // Decision 69: a cited finding must be VERIFIED or APPROVED.
  if (options.verify) finding = then(finding, 'VERIFIED');
  const ruling = create(
    'RULING',
    { conclusion: 'TEST ruling' },
    [pin(finding, 0), pin(passage, passagePin)],
    marjaId,
  );
  return { source, passage, finding, ruling };
}

const content = (
  rulingId: string,
  sourceId: string,
  overrides: Partial<BuilderRuleContent> = {},
): BuilderRuleContent => ({
  category: 'ANNUAL_SURPLUS',
  rulingId,
  rate: '12.5',
  includedEntries: [{ kind: 'INCOME', subtype: 'EMPLOYMENT' }],
  deductions: [],
  conditions: [],
  exceptions: [],
  threshold: null,
  sourceRefs: [sourceId],
  requirementFlags: [],
  otherRequirement: null,
  notes: null,
  ...overrides,
});
const revisionOf = (ruleId: string, c: BuilderRuleContent, revision = 0): ScholarRuleRevision => ({
  ruleId,
  revision,
  marjaId: MARJA,
  content: c,
  rulingVersion: c.rulingId === null ? null : 1,
  actor: 'test-scholar',
  at: '2026-11-22T13:00:00.000Z',
  reason: 'TEST save',
});

const scholar = principal('test-scholar', { roles: [['SCHOLAR', marjaScope(MARJA)]] });
const legacyScholar = principal('test-legacy', {
  roles: [['GOVERNING_SCHOLAR', marjaScope(MARJA)]],
});
const superAdmin = principal('test-super-admin', { roles: [['SUPER_ADMIN', ALL]] });
const otherScholar = principal('test-other', { roles: [['SCHOLAR', marjaScope('khamenei')]] });
const researcher = principal('test-researcher', {
  roles: [['RELIGIOUS_RESEARCHER', marjaScope(MARJA)]],
});

let decisions = 0;
const ctx = (who: VerifiedPrincipal) => () => {
  decisions += 1;
  return {
    decisionId: `test-decision-${String(decisions)}`,
    evaluatedAt: shift(NOW, decisions),
    session: { sessionId: who.session.sessionId, state: 'ACTIVE' },
  };
};
const ATTESTED = {
  sourcesAuthentic: true,
  originalTextMatches: true,
  translationAccurate: true,
  attributionCorrect: true,
};

function verify(
  who: unknown,
  history: readonly ScholarRuleRevision[],
  overrides: Partial<Parameters<typeof recordRuleVerification>[0]> = {},
) {
  const session =
    (who as Partial<VerifiedPrincipal> | null)?.session === undefined
      ? scholar
      : (who as VerifiedPrincipal);
  return recordRuleVerification({
    principal: who,
    context: ctx(session)(),
    history,
    expectedRevision: history.at(-1)?.revision ?? 0,
    attestations: ATTESTED,
    notes: null,
    reason: 'TEST verification',
    verificationId: uuid(),
    load,
    ...overrides,
  });
}

const codes = (blockers: readonly { code: string }[]) => blockers.map((b) => b.code);

describe('source verification preconditions', () => {
  it('blocks while the research records are not VERIFIED, naming each record', () => {
    const r = research({ verify: false });
    const rule = revisionOf(uuid(), content(r.ruling.entityId, r.source.entityId));
    const blockers = checkVerificationPreconditions(rule, load);
    expect(codes(blockers)).toEqual(
      expect.arrayContaining(['SOURCE_NOT_VERIFIED', 'PASSAGE_NOT_VERIFIED']),
    );
    expect(blockers.find((b) => b.code === 'PASSAGE_NOT_VERIFIED')).toMatchObject({
      entityType: 'PASSAGE',
      entityId: r.passage.entityId,
      state: 'DRAFT',
    });
  });

  it('passes on VERIFIED research and a complete, supported rule', () => {
    const r = research();
    const rule = revisionOf(uuid(), content(r.ruling.entityId, r.source.entityId));
    expect(checkVerificationPreconditions(rule, load)).toEqual([]);
  });

  it('Developer Implementation Required, drafts and invalid content block verification', () => {
    const r = research();
    const flagged = revisionOf(
      uuid(),
      content(r.ruling.entityId, r.source.entityId, { requirementFlags: ['CARRY_OVER'] }),
    );
    expect(codes(checkVerificationPreconditions(flagged, load))).toContain(
      'DEVELOPER_IMPLEMENTATION_REQUIRED',
    );
    const draft = revisionOf(uuid(), content(r.ruling.entityId, r.source.entityId, { rate: null }));
    expect(codes(checkVerificationPreconditions(draft, load))).toContain('RULE_INCOMPLETE');
  });

  it('the ruling must exist in the Marja, be current and be the cited version', () => {
    const r = research();
    const other = research({ verify: true, marjaId: 'khamenei' });
    const foreign = revisionOf(uuid(), content(other.ruling.entityId, r.source.entityId));
    expect(codes(checkVerificationPreconditions(foreign, load))).toContain('RULING_NOT_FOUND');
    const foreignSource = revisionOf(uuid(), content(r.ruling.entityId, other.source.entityId));
    expect(codes(checkVerificationPreconditions(foreignSource, load))).toContain(
      'SOURCE_NOT_FOUND',
    );
    const wrongVersion = { ...revisionOf(uuid(), content(r.ruling.entityId, r.source.entityId)) };
    expect(
      codes(checkVerificationPreconditions({ ...wrongVersion, rulingVersion: 2 }, load)),
    ).toContain('RULING_VERSION_CHANGED');
    const withdrawn = research();
    then(then(withdrawn.ruling, 'APPROVED'), 'WITHDRAWN');
    const rule = revisionOf(uuid(), content(withdrawn.ruling.entityId, withdrawn.source.entityId));
    expect(codes(checkVerificationPreconditions(rule, load))).toContain('RULING_NOT_CURRENT');
  });
});

describe('recordRuleVerification (who may verify; four attestations)', () => {
  const setup = () => {
    const r = research();
    return { r, history: [revisionOf(uuid(), content(r.ruling.entityId, r.source.entityId))] };
  };

  it('the Marja’s scholar, the legacy governing scholar and a SUPER_ADMIN may verify', () => {
    for (const who of [scholar, legacyScholar, superAdmin]) {
      const { history } = setup();
      const [first] = history;
      const recorded = verify(who, history);
      if (!recorded.ok || first === undefined) throw new Error('fixture');
      expect(recorded.value).toMatchObject({
        ruleId: first.ruleId,
        revision: 0,
        marjaId: MARJA,
        actor: who.principalId,
        attestations: ATTESTED,
        contentHash: ruleRevisionContentHash(first),
      });
    }
  });

  it('other Marjas’ scholars, other roles, system actors, AI and forged principals cannot', () => {
    const { history } = setup();
    for (const who of [otherScholar, researcher]) {
      expect(verify(who, history)).toMatchObject({ ok: false, error: { code: 'DENIED' } });
    }
    const system = { principalId: 'system:automation', roles: [] };
    for (const who of [null, undefined, system, { ...scholar }, 'ai-assistant']) {
      expect(verify(who, history)).toMatchObject({ ok: false, error: { code: 'DENIED' } });
    }
  });

  it('every attestation must be true; the revision must be the current one', () => {
    const { history } = setup();
    for (const key of Object.keys(ATTESTED)) {
      expect(
        verify(scholar, history, { attestations: { ...ATTESTED, [key]: false } }),
      ).toMatchObject({ ok: false, error: { code: 'ATTESTATIONS_INVALID' } });
    }
    expect(verify(scholar, history, { attestations: {} })).toMatchObject({ ok: false });
    expect(verify(scholar, history, { expectedRevision: 1 })).toMatchObject({
      ok: false,
      error: { code: 'REVISION_CONFLICT' },
    });
    const r = research({ verify: false });
    const blocked = [revisionOf(uuid(), content(r.ruling.entityId, r.source.entityId))];
    expect(verify(scholar, blocked)).toMatchObject({
      ok: false,
      error: { code: 'PRECONDITIONS_FAILED' },
    });
  });

  it('binds rule id + revision + content hash (and ruling content): a later revision is unverified', () => {
    const { r, history } = setup();
    const recorded = verify(scholar, history);
    if (!recorded.ok) throw new Error(recorded.error.code);
    const [first] = history;
    if (first === undefined) throw new Error('fixture');
    expect(currentVerification(first, [recorded.value], load)?.verificationId).toBe(
      recorded.value.verificationId,
    );
    const revised = revisionOf(first.ruleId, { ...first.content, rate: '10' }, 1);
    expect(currentVerification(revised, [recorded.value], load)).toBeNull();
    // A changed ruling (new content record) also makes the verification stale.
    then(r.ruling, 'REVISED', { conclusion: 'TEST ruling, revised' });
    expect(currentVerification(first, [recorded.value], load)).toBeNull();
  });
});

// ── Automatic approval and publication ─────────────────────────────────────────────────────

interface Published {
  readonly ledger: GovernanceLedger;
  readonly pack: RulePack;
  readonly verification: RuleVerificationRecord;
}

/** Verify `history`'s current revision and publish the Marja's verified rules as `version`. */
function publish(
  who: VerifiedPrincipal,
  histories: readonly (readonly ScholarRuleRevision[])[],
  target: readonly ScholarRuleRevision[],
  stored: readonly PendingRuleVerification[],
  previous: readonly Published[],
  sources: Record<string, { title: string; url: null; locator: null }>,
) {
  const pending = verify(who, target);
  if (!pending.ok) throw new Error(pending.error.code);
  const version = nextBuilderVersion(previous.map((p) => p.ledger.version));
  const compiled = compileVerifiedBuilderPack({
    marjaId: MARJA,
    version,
    histories,
    verifications: [...stored, pending.value],
    sources,
    load,
  });
  if (!compiled.ok) throw new Error(compiled.error.code);
  const verification = completeVerification(pending.value, {
    packId: compiled.value.pack.metadata.packId,
    version,
    contentDigest: compiled.value.pack.metadata.integrity?.digest ?? '',
  });
  if (!verification.ok) throw new Error('record');
  const governed = runAutomaticBuilderGovernance({
    principal: who,
    nextContext: ctx(who),
    pack: compiled.value.pack,
    verification: verification.value,
    previous: previous.map((p) => ({ ledger: p.ledger, pack: p.pack })),
  });
  return { compiled: compiled.value, verification: verification.value, governed };
}

describe('automatic approval and publication (SOURCE_VERIFIED_AUTO_V1)', () => {
  const fixture = () => {
    const r = research();
    const verifiedRule = [revisionOf(uuid(), content(r.ruling.entityId, r.source.entityId))];
    const unverifiedRule = [
      revisionOf(
        uuid(),
        content(r.ruling.entityId, r.source.entityId, {
          category: 'TREASURE',
          includedEntries: [{ kind: 'INCOME', subtype: 'OTHER' }],
        }),
      ),
    ];
    const sources = { [r.source.entityId]: { title: 'TEST source', url: null, locator: null } };
    return { r, verifiedRule, unverifiedRule, sources };
  };

  it('publishes ONLY verified rules (APPROVED); unverified rules become review stops', () => {
    const f = fixture();
    const { compiled, governed } = publish(
      scholar,
      [f.verifiedRule, f.unverifiedRule],
      f.verifiedRule,
      [],
      [],
      f.sources,
    );
    const { pack } = compiled;
    expect(pack.metadata).toMatchObject({
      packId: 'sistani-builder',
      version: '1.0.0',
      releaseChannel: 'PRODUCTION',
      isMock: false,
    });
    const verifiedId = f.verifiedRule[0]?.ruleId ?? '';
    const unverifiedId = f.unverifiedRule[0]?.ruleId ?? '';
    expect(pack.rules.map((r) => [r.id, r.status])).toEqual([
      [builderPackRuleId(verifiedId), 'APPROVED'],
    ]);
    expect(compiled.withheld).toEqual([
      { ruleId: unverifiedId, revision: 0, reason: 'NOT_VERIFIED' },
    ]);
    expect(pack.rulingSnapshots?.map((s) => s.state)).toEqual(['DRAFT']);
    expect(
      pack.factMapping?.rules.find((m) => m.id === 'builder:not-verified:map:INCOME:OTHER')?.then,
    ).toEqual({ action: 'consult', consultationId: 'builder:not-verified' });

    if (!governed.ok) throw new Error(governed.error.command);
    const { ledger, publishedPack } = governed.value;
    expect(ledger.records.map((r) => r.type)).toEqual([
      'SUBMITTED',
      'REVIEW_STARTED',
      'REVIEW_COMPLETED',
      'APPROVED',
      'PUBLISHED',
      'ACTIVATED',
    ]);
    expect(new Set(ledger.records.map((r) => r.actor.subject))).toEqual(
      new Set([scholar.principalId]),
    );
    const view = replayLedger(ledger);
    if (!view.ok) throw new Error('replay');
    expect(view.value.policy).toBe('SOURCE_VERIFIED_AUTO_V1');
    expect(publishedPack.metadata.approvals).toHaveLength(1);
    expect(publishedPack.metadata.approvals[0]).toMatchObject({
      role: 'SOURCE_VERIFIER',
      reviewerId: scholar.principalId,
    });

    // The existing governed readiness check passes unchanged.
    const activation = activationFromLedger(ledger);
    if (!activation.ok) throw new Error('activation');
    expect(
      checkGovernedProductionReadiness(publishedPack, ledger, {
        workflow: 'annual',
        activation: activation.value,
        dateRanges: [{ start: '2025-01-01', end: '2025-12-31' }],
        requireFactMapping: true,
      }),
    ).toEqual([]);
    const checked = checkPublicVerifiedPack(publishedPack, ledger);
    if (!checked.ok) throw new Error(JSON.stringify(checked.error));

    // A public calculation: the verified rule gives a figure; an entry of the unverified rule
    // stops for review (no figure).
    const bundle = publicBundleOf(checked.value);
    expect(JSON.stringify(bundle)).not.toContain(scholar.principalId);
    const sheet = (subtype: 'EMPLOYMENT' | 'OTHER', amount: string) =>
      builderTestSheet({
        marjaId: MARJA,
        currency: 'USD',
        period: { start: '2025-01-01', end: '2025-12-31' },
        entries: [{ id: 'e1', kind: 'INCOME', subtype, amount, date: '2025-06-01' }],
        answers: {},
        entryAnswers: {},
      });
    const calculated = runVerifiedAssessment(sheet('EMPLOYMENT', '200.00'), bundle);
    if (calculated.kind !== 'CALCULATED' || calculated.report.workflow === 'missed-year') {
      throw new Error(JSON.stringify(calculated));
    }
    expect(calculated.report.meta.guidance).toBe('APPROVED_RULE_PACK');
    expect(
      calculated.report.result.outputs.find(
        (o) => o.id === `${builderPackRuleId(verifiedId)}:result`,
      )?.value?.amount,
    ).toBe('25');
    expect(runVerifiedAssessment(sheet('OTHER', '200.00'), bundle).kind).toBe('NEEDS_INPUT');
  });

  it('a new verification publishes the next version and supersedes the previous one', () => {
    const f = fixture();
    const first = publish(
      scholar,
      [f.verifiedRule, f.unverifiedRule],
      f.verifiedRule,
      [],
      [],
      f.sources,
    );
    if (!first.governed.ok) throw new Error(first.governed.error.command);
    const v1: Published = {
      ledger: first.governed.value.ledger,
      pack: first.governed.value.publishedPack,
      verification: first.verification,
    };
    const second = publish(
      superAdmin,
      [f.verifiedRule, f.unverifiedRule],
      f.unverifiedRule,
      [first.verification],
      [v1],
      f.sources,
    );
    if (!second.governed.ok) throw new Error(second.governed.error.command);
    expect(second.compiled.pack.metadata.version).toBe('2.0.0');
    expect(second.compiled.pack.rules.every((r) => r.status === 'APPROVED')).toBe(true);
    expect(second.compiled.pack.rules).toHaveLength(2);
    const [superseded] = second.governed.value.superseded;
    expect(superseded?.record.type).toBe('SUPERSEDED');
    const v1After = superseded?.after;
    if (v1After === undefined) throw new Error('fixture');
    expect(checkPublicVerifiedPack(v1.pack, v1After).ok).toBe(false);
    const chosen = selectPublicVerifiedPack(MARJA, [
      { pack: v1.pack, ledger: v1After },
      { pack: second.governed.value.publishedPack, ledger: second.governed.value.ledger },
    ]);
    expect(chosen?.pack.metadata.version).toBe('2.0.0');
  });

  it('a revision after verification is unverified again: the next version withholds it', () => {
    const f = fixture();
    const first = publish(
      scholar,
      [f.verifiedRule, f.unverifiedRule],
      f.verifiedRule,
      [],
      [],
      f.sources,
    );
    const [rule] = f.verifiedRule;
    if (rule === undefined || !first.governed.ok) throw new Error('fixture');
    const revised = [
      ...f.verifiedRule,
      revisionOf(rule.ruleId, { ...rule.content, rate: '10' }, 1),
    ];
    const classified = classifyBuilderRules([revised], [first.verification], load);
    expect(classified.included).toEqual([]);
    expect(classified.withheld.map((w) => w.reason)).toEqual(['NOT_VERIFIED']);
  });

  it('builder packs are never submitted by hand or with another person’s verification', () => {
    const f = fixture();
    const { compiled, verification } = publish(
      scholar,
      [f.verifiedRule],
      f.verifiedRule,
      [],
      [],
      f.sources,
    );
    const handSubmit = (who: VerifiedPrincipal, sourceVerification: unknown) =>
      executeGovernanceCommand({
        principal: who,
        ledger: { packId: 'sistani-builder', version: '1.0.0', records: [] },
        command: { type: 'SUBMIT', pack: compiled.pack },
        context: { ...ctx(who)(), policyRegistry: null, sourceVerification },
      });
    expect(handSubmit(scholar, undefined)).toMatchObject({
      status: 'REFUSED',
      issues: [{ code: 'BUILDER_VERIFICATION_REQUIRED' }],
    });
    expect(handSubmit(superAdmin, verification)).toMatchObject({
      status: 'REFUSED',
      issues: [{ code: 'BUILDER_VERIFICATION_REQUIRED' }],
    });
    // A scholar of another Marja cannot run the ledger at all.
    const denied = runAutomaticBuilderGovernance({
      principal: otherScholar,
      nextContext: ctx(otherScholar),
      pack: compiled.pack,
      verification: { ...verification, actor: otherScholar.principalId },
      previous: [],
    });
    expect(denied).toMatchObject({ ok: false, error: { command: 'SUBMIT' } });
    expect(denied.ok || denied.error.outcome.status).toBe('DENIED');
  });

  it('the registry can never assign the builder policy to a Marja', () => {
    const outcome = proposeGovernancePolicyChange({
      principal: superAdmin,
      registry: { records: [] },
      marjaId: MARJA,
      newPolicy: 'SOURCE_VERIFIED_AUTO_V1',
      reason: 'TEST',
      context: { ...ctx(superAdmin)(), requestId: 'test-request' },
    });
    expect(outcome).toMatchObject({ status: 'REFUSED', issue: 'POLICY_CHANGE_INVALID' });
  });

  it('SUPER_ADMIN emergency withdrawal and the scholar’s withdrawal stop public use', () => {
    for (const [who, type] of [
      [superAdmin, 'EMERGENCY_WITHDRAW'],
      [scholar, 'WITHDRAW'],
    ] as const) {
      const f = fixture();
      const { governed } = publish(scholar, [f.verifiedRule], f.verifiedRule, [], [], f.sources);
      if (!governed.ok) throw new Error(governed.error.command);
      const { ledger, publishedPack } = governed.value;
      const withdrawn = executeGovernanceCommand({
        principal: who,
        ledger,
        command:
          type === 'EMERGENCY_WITHDRAW'
            ? {
                type,
                pack: publishedPack,
                reason: 'ERROR_FOUND',
                note: 'TEST emergency withdrawal',
              }
            : { type, pack: governed.value.submittedPack, reason: 'ERROR_FOUND' },
        context: { ...ctx(who)(), policyRegistry: null },
      });
      if (withdrawn.status !== 'APPLIED') throw new Error(`${type} ${withdrawn.status}`);
      expect(checkPublicVerifiedPack(publishedPack, withdrawn.ledger).ok).toBe(false);
    }
  });

  it('versions increase monotonically', () => {
    expect(nextBuilderVersion([])).toBe('1.0.0');
    expect(nextBuilderVersion(['1.0.0', '3.0.0', '2.0.0'])).toBe('4.0.0');
  });
});

// ── Audit fixes (P2-5): BLD-01/02/03/07/08, SEC-01/03; decision 69 ─────────────────────────

describe('findings must be current and VERIFIED or APPROVED (BLD-02)', () => {
  const ruleOn = (r: ReturnType<typeof research>) =>
    revisionOf(uuid(), content(r.ruling.entityId, r.source.entityId));

  it('a DRAFT finding blocks verification (FINDING_NOT_VERIFIED), naming the finding', () => {
    const r = research();
    // Revising a VERIFIED finding returns it to DRAFT (re-verification required).
    then(r.finding, 'REVISED', { conclusion: 'TEST finding, revised' });
    const blockers = checkVerificationPreconditions(ruleOn(r), load);
    expect(blockers.find((b) => b.code === 'FINDING_NOT_VERIFIED')).toMatchObject({
      entityType: 'FINDING',
      entityId: r.finding.entityId,
      state: 'DRAFT',
    });
  });

  it('a deleted or withdrawn finding blocks verification (FINDING_NOT_CURRENT)', () => {
    const deleted = research();
    then(deleted.finding, 'DRAFT_DELETED');
    expect(codes(checkVerificationPreconditions(ruleOn(deleted), load))).toContain(
      'FINDING_NOT_CURRENT',
    );
    const withdrawn = research();
    then(then(withdrawn.finding, 'APPROVED'), 'WITHDRAWN');
    const rule = ruleOn(withdrawn);
    expect(codes(checkVerificationPreconditions(rule, load))).toContain('FINDING_NOT_CURRENT');
    expect(verify(scholar, [rule])).toMatchObject({
      ok: false,
      error: { code: 'PRECONDITIONS_FAILED' },
    });
  });

  it('an APPROVED finding may back a rule', () => {
    const r = research();
    then(r.finding, 'APPROVED');
    expect(checkVerificationPreconditions(ruleOn(r), load)).toEqual([]);
  });

  it('a retired finding makes the ruling evidence unverified under every policy', () => {
    const r = research();
    then(r.finding, 'DRAFT_DELETED');
    const ref = `${r.ruling.entityId}@1`;
    for (const policy of ['PROVISIONAL', 'SOURCE_VERIFIED'] as const) {
      expect(rulingReferenceIssue(ref, MARJA, load, policy)).toBe('RULING_EVIDENCE_UNVERIFIED');
    }
  });
});

describe('repeat verification and revoked verifiers (SEC-03, BLD-07)', () => {
  it('re-verifying an already-verified identical revision is refused (ALREADY_VERIFIED)', () => {
    const r = research();
    const history = [revisionOf(uuid(), content(r.ruling.entityId, r.source.entityId))];
    const first = verify(scholar, history);
    if (!first.ok) throw new Error(first.error.code);
    expect(verify(superAdmin, history, { verifications: [first.value] })).toMatchObject({
      ok: false,
      error: { code: 'ALREADY_VERIFIED', verificationId: first.value.verificationId },
    });
    // Not live any more (e.g. the version was withdrawn): republishing it stays possible.
    expect(
      verify(superAdmin, history, { verifications: [first.value], activeRevision: null }).ok,
    ).toBe(true);
    expect(
      verify(superAdmin, history, { verifications: [first.value], activeRevision: 0 }),
    ).toMatchObject({
      ok: false,
      error: { code: 'ALREADY_VERIFIED' },
    });
    // A verification whose verifier no longer holds the permission does not count.
    expect(
      verify(superAdmin, history, { verifications: [first.value], counts: () => false }).ok,
    ).toBe(true);
    // After a ruling change the old verification is stale: it no longer refuses a new one.
    then(r.ruling, 'REVISED', { conclusion: 'TEST ruling, revised' });
    const again = verify(scholar, history, { verifications: [first.value] });
    expect(again.ok || again.error.code).not.toBe('ALREADY_VERIFIED');
  });

  it('a verification by a verifier who lost the permission is withheld (VERIFIER_NOT_AUTHORIZED)', () => {
    const r = research();
    const only = revisionOf(uuid(), content(r.ruling.entityId, r.source.entityId));
    const history = [only];
    const recorded = verify(scholar, history);
    if (!recorded.ok) throw new Error(recorded.error.code);
    const counted = classifyBuilderRules([history], [recorded.value], load, {
      counts: (v) => v.actor === scholar.principalId,
    });
    expect(counted.included).toHaveLength(1);
    const revoked = classifyBuilderRules([history], [recorded.value], load, {
      counts: () => false,
    });
    expect(revoked.included).toEqual([]);
    expect(revoked.withheld.map((w) => w.reason)).toEqual(['VERIFIER_NOT_AUTHORIZED']);
    expect(currentVerification(only, [recorded.value], load, () => false)).toBeNull();
  });
});

describe('preview of the next publication (BLD-03)', () => {
  it('lists the rules the next version includes and withholds, and live rules it removes', () => {
    const r = research();
    const a0 = revisionOf(uuid(), content(r.ruling.entityId, r.source.entityId));
    const b = revisionOf(
      uuid(),
      content(r.ruling.entityId, r.source.entityId, {
        category: 'TREASURE',
        includedEntries: [{ kind: 'INCOME', subtype: 'OTHER' }],
      }),
    );
    const recorded = verify(scholar, [a0]);
    if (!recorded.ok) throw new Error(recorded.error.code);
    // A is live at revision 0, then revised (unverified).
    const a1 = revisionOf(a0.ruleId, { ...a0.content, rate: '10' }, 1);
    const preview = previewBuilderPublication({
      histories: [[a0, a1], [b]],
      verifications: [recorded.value],
      load,
      verifyingRuleId: b.ruleId,
      liveRuleIds: [a0.ruleId],
    });
    expect(preview.included).toEqual([{ ruleId: b.ruleId, revision: 0 }]);
    expect(preview.withheld).toEqual([{ ruleId: a0.ruleId, revision: 1, reason: 'NOT_VERIFIED' }]);
    expect(preview.removedFromPublic).toEqual([a0.ruleId]);
  });
});

describe('public pack content carries no free-text notes (SEC-01)', () => {
  it('neither the scholar’s rule notes nor the ruling’s internal notes are published', () => {
    const r = research();
    const ruling = create(
      'RULING',
      { conclusion: 'TEST ruling', notes: 'TEST-MARKER-RULING-NOTES' },
      [{ ...pin(r.finding, 0) }, { ...pin(r.passage, 1) }],
    );
    const rule = [
      revisionOf(
        uuid(),
        content(ruling.entityId, r.source.entityId, { notes: 'TEST-MARKER-RULE-NOTES' }),
      ),
    ];
    const sources = { [r.source.entityId]: { title: 'TEST source', url: null, locator: null } };
    const { compiled, governed } = publish(scholar, [rule], rule, [], [], sources);
    if (!governed.ok) throw new Error(governed.error.command);
    const json = JSON.stringify(governed.value.publishedPack);
    expect(json).not.toContain('TEST-MARKER-RULE-NOTES');
    expect(json).not.toContain('TEST-MARKER-RULING-NOTES');
    expect(compiled.pack.rules[0]?.summary).toContain('Rate: 12.5 percent.');
    expect(compiled.pack.rulingSnapshots?.[0]?.payload).toEqual({ conclusion: 'TEST ruling' });
  });
});

describe('a live builder pack is re-checked against current research on every serve (BLD-01)', () => {
  const live = () => {
    const r = research();
    const rule = [revisionOf(uuid(), content(r.ruling.entityId, r.source.entityId))];
    const sources = { [r.source.entityId]: { title: 'TEST source', url: null, locator: null } };
    const { governed } = publish(scholar, [rule], rule, [], [], sources);
    if (!governed.ok) throw new Error(governed.error.command);
    const candidate = { pack: governed.value.publishedPack, ledger: governed.value.ledger };
    return { r, rule, candidate };
  };
  const issueCodes = (candidate: { pack: RulePack; ledger: GovernanceLedger }) =>
    checkLivePackResearch(candidate.pack, candidate.ledger, load).flatMap((i) => i.codes);

  it('serves the pack while its research holds', () => {
    const { candidate } = live();
    const selected = selectLivePublicPack(MARJA, [candidate], load);
    expect(selected.suspended).toBeNull();
    expect(selected.bundle?.pack.metadata.packId).toBe('sistani-builder');
  });

  it('a disputed passage suspends the pack (no figures), naming the rule and codes', () => {
    const { r, rule, candidate } = live();
    then(r.passage, 'DISPUTED');
    const selected = selectLivePublicPack(MARJA, [candidate], load);
    expect(selected.bundle).toBeNull();
    expect(selected.suspended).toMatchObject({ packId: 'sistani-builder', version: '1.0.0' });
    expect(selected.suspended?.issues[0]?.ruleId).toBe(builderPackRuleId(rule[0]?.ruleId ?? ''));
    expect(selected.suspended?.issues[0]?.codes).toEqual(
      expect.arrayContaining(['PASSAGE_NOT_VERIFIED', 'RULING_EVIDENCE_UNVERIFIED']),
    );
  });

  it('a deleted ruling, a revised draft ruling, a retired finding or source also suspend it', () => {
    const deleted = live();
    then(deleted.r.ruling, 'DRAFT_DELETED');
    expect(issueCodes(deleted.candidate)).toContain('RULING_NOT_CURRENT');

    const revised = live();
    then(revised.r.ruling, 'REVISED', { conclusion: 'TEST ruling, revised' });
    expect(issueCodes(revised.candidate)).toContain('RULING_SNAPSHOT_STALE');

    const finding = live();
    then(then(finding.r.finding, 'APPROVED'), 'WITHDRAWN');
    expect(issueCodes(finding.candidate)).toEqual(
      expect.arrayContaining(['FINDING_NOT_CURRENT', 'RULING_EVIDENCE_UNVERIFIED']),
    );

    const draftFinding = live();
    then(draftFinding.r.finding, 'REVISED', { conclusion: 'TEST finding, revised' });
    expect(issueCodes(draftFinding.candidate)).toContain('FINDING_NOT_VERIFIED');

    const source = live();
    then(source.r.source, 'SUPERSEDED');
    expect(issueCodes(source.candidate)).toContain('SOURCE_NOT_VERIFIED');
  });
});
