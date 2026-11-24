import { describe, expect, it } from 'vitest';

import type {
  ResearchChain,
  ResearchEntityType,
  ResearchReference,
  RulePack,
} from '@khums/shared-types';

import { appendResearchRevision } from './chain';
import { formatUuidV7, researchDisplayRef } from './ids';
import {
  buildRulingSnapshots,
  checkRulingSnapshots,
  parseRulingRef,
  rulingIdsOf,
  withRulingSnapshots,
} from './rule-pack-references';

/** M5.3.6 rule-pack ruling references and in-pack snapshots. SYNTHETIC records only. */

let seq = 0;
const uuid = () => {
  seq += 1;
  const random = new Uint8Array(10);
  random[0] = 0x80;
  random[9] = seq;
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
const ref = (chain: ResearchChain, revision: number): ResearchReference => ({
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
  marjaId: string,
  payload: Record<string, unknown>,
  refs: ResearchReference[] = [],
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
function then(
  chain: ResearchChain,
  kind: string,
  payload: Record<string, unknown> | null = null,
  refs: ResearchReference[] = [],
) {
  const next = appendResearchRevision(chain, null, step(kind, payload, refs));
  if (!next.ok) throw new Error(next.error);
  chains.set(chain.entityId, next.value.chain);
  return next.value.chain;
}

/**
 * A sourced ruling on VERIFIED evidence: source (verified) → passage (cites source@1, verified) →
 * finding (cites passage@1) → draft ruling (cites finding@0 and passage@1). All synthetic.
 * `verify: false` leaves the passage unverified (for the evidence tests).
 */
function sourcedRuling(marjaId = 'test-marja', copyright = 'EXCERPTS_ONLY', verify = true) {
  const source = then(
    create('SOURCE', marjaId, { title: { original: 'TEST source', translation: null }, copyright }),
    'VERIFIED',
  );
  const draftPassage = create(
    'PASSAGE',
    marjaId,
    { locator: { page: '1' }, originalLanguage: 'ar', text: 'TEST excerpt' },
    [ref(source, 1)],
  );
  const passage = verify ? then(draftPassage, 'VERIFIED') : draftPassage;
  const pin = verify ? 1 : 0;
  const finding = create('FINDING', marjaId, { conclusion: 'TEST finding' }, [ref(passage, pin)]);
  const ruling = create('RULING', marjaId, { conclusion: 'TEST ruling' }, [
    ref(finding, 0),
    ref(passage, pin),
  ]);
  return { source, passage, finding, ruling };
}
const refOf = (chain: ResearchChain) => `${chain.entityId}@1`;
const pack = (marjaId: string, refs: string[], extra: Partial<RulePack> = {}) =>
  ({
    metadata: { marjaId },
    rules: [{ id: 'rule-a', rulingRefs: refs }],
    ...extra,
  }) as unknown as RulePack;
const codes = (issues: readonly { code: string }[]) => issues.map((i) => i.code);

describe('ruling references by policy (M5.3.6)', () => {
  it('provisional packs may cite a sourced draft; production needs the approved version', () => {
    const { ruling } = sourcedRuling();
    const p = pack('test-marja', [refOf(ruling)]);
    expect(codes(buildRulingSnapshots(p, load, 'PROVISIONAL').issues)).toEqual([]);
    expect(codes(buildRulingSnapshots(p, load, 'PRODUCTION').issues)).toEqual([
      'RULING_NOT_APPROVED',
    ]);
    then(ruling, 'APPROVED');
    expect(codes(buildRulingSnapshots(p, load, 'PRODUCTION').issues)).toEqual([]);
  });

  it('never allows withdrawn, superseded or deleted versions, other Marjas, wrong versions or bad refs', () => {
    const withdrawn = then(then(sourcedRuling().ruling, 'APPROVED'), 'WITHDRAWN');
    const superseded = then(then(sourcedRuling().ruling, 'APPROVED'), 'SUPERSEDED');
    const deleted = then(sourcedRuling().ruling, 'DRAFT_DELETED');
    const other = sourcedRuling('test-other-marja').ruling;
    for (const policy of ['PROVISIONAL', 'PRODUCTION'] as const) {
      for (const [r, code] of [
        [refOf(withdrawn), 'RULING_NOT_CURRENT'],
        [refOf(superseded), 'RULING_NOT_CURRENT'],
        [refOf(deleted), 'RULING_NOT_CURRENT'],
        [refOf(other), 'RULING_REFERENCE_UNRESOLVED'],
        [`${other.entityId}@2`, 'RULING_REFERENCE_UNRESOLVED'],
        ['R-test-marja-ABCDEFGH', 'RULING_REFERENCE_INVALID'],
      ] as const) {
        expect(
          codes(buildRulingSnapshots(pack('test-marja', [r]), load, policy).issues),
          r,
        ).toEqual([code]);
      }
    }
  });

  it('refuses an unsourced ruling (no finding or passage)', () => {
    const unsourced = create('RULING', 'test-marja', { conclusion: 'TEST' });
    expect(
      codes(
        buildRulingSnapshots(pack('test-marja', [refOf(unsourced)]), load, 'PROVISIONAL').issues,
      ),
    ).toEqual(['RULING_PROVENANCE_INCOMPLETE']);
  });
});

describe('a draft ruling never means unverified evidence (D14)', () => {
  const provisional = (ruling: ResearchChain) =>
    codes(buildRulingSnapshots(pack('test-marja', [refOf(ruling)]), load, 'PROVISIONAL').issues);

  it('refuses a draft ruling whose cited passage is not verified', () => {
    const { ruling } = sourcedRuling('test-marja', 'EXCERPTS_ONLY', false);
    expect(provisional(ruling)).toEqual(['RULING_EVIDENCE_UNVERIFIED']);
  });

  it('refuses a verified passage of an unverified source, and a finding citing an unverified passage', () => {
    const source = create('SOURCE', 'test-marja', {
      title: { original: 'TEST', translation: null },
      copyright: 'UNKNOWN',
    });
    const passage = then(
      create(
        'PASSAGE',
        'test-marja',
        { locator: { page: '2' }, originalLanguage: 'ar', text: 'x' },
        [ref(source, 0)],
      ),
      'VERIFIED',
    );
    const finding = create('FINDING', 'test-marja', { conclusion: 'TEST' }, [ref(passage, 1)]);
    const onUnverifiedSource = create('RULING', 'test-marja', { conclusion: 'TEST' }, [
      ref(finding, 0),
      ref(passage, 1),
    ]);
    expect(provisional(onUnverifiedSource)).toEqual(['RULING_EVIDENCE_UNVERIFIED']);

    const verified = sourcedRuling();
    const weakPassage = create(
      'PASSAGE',
      'test-marja',
      { locator: { page: '3' }, originalLanguage: 'ar', text: 'y' },
      [ref(verified.source, 1)],
    );
    const weakFinding = create('FINDING', 'test-marja', { conclusion: 'TEST' }, [
      ref(weakPassage, 0),
    ]);
    const mixed = create('RULING', 'test-marja', { conclusion: 'TEST' }, [
      ref(weakFinding, 0),
      ref(verified.passage, 1),
    ]);
    expect(provisional(mixed)).toEqual(['RULING_EVIDENCE_UNVERIFIED']);
  });

  it('stops further use when cited evidence is disputed after the snapshot', () => {
    const { ruling, passage } = sourcedRuling();
    const p = pack('test-marja', [refOf(ruling)]);
    const withSnap = {
      ...p,
      rulingSnapshots: buildRulingSnapshots(p, load, 'PROVISIONAL').snapshots,
    };
    const use = () =>
      codes(checkRulingSnapshots(withSnap, load, 'PROVISIONAL', { requireEveryRule: false }));
    expect(use()).toEqual([]);
    chains.set(passage.entityId, then(passage, 'DISPUTED'));
    expect(use()).toEqual(['RULING_EVIDENCE_UNVERIFIED']);
  });
});

describe('in-pack ruling snapshots (§9.3)', () => {
  it('freezes the exact ruling version and its finding → passage → source chain', () => {
    const { source, passage, finding, ruling } = sourcedRuling();
    const { snapshots } = buildRulingSnapshots(
      pack('test-marja', [refOf(ruling)]),
      load,
      'PROVISIONAL',
    );
    expect(snapshots).toEqual([
      {
        ref: refOf(ruling),
        marjaId: 'test-marja',
        displayRef: ruling.records[0]?.displayRef,
        rulingSeriesId: ruling.entityId,
        rulingVersion: 1,
        state: 'DRAFT',
        contentRevision: 0,
        payloadDigest: ruling.records[0]?.payloadDigest,
        contentRecordDigest: ruling.records[0]?.recordDigest,
        payload: { conclusion: 'TEST ruling' },
        findings: [
          {
            entityId: finding.entityId,
            displayRef: finding.records[0]?.displayRef,
            revision: 0,
            recordDigest: finding.records[0]?.recordDigest,
            contentRevision: 0,
            payloadDigest: finding.records[0]?.payloadDigest,
            questionId: 'INC-01',
            passageRefs: [`${passage.entityId}@1`],
          },
        ],
        passages: [
          {
            entityId: passage.entityId,
            displayRef: passage.records[0]?.displayRef,
            revision: 1,
            recordDigest: passage.records[1]?.recordDigest,
            contentRevision: 0,
            payloadDigest: passage.records[0]?.payloadDigest,
            locator: { page: '1' },
            originalLanguage: 'ar',
            // Copyright is not PERMITTED: locators and digests only, never the text.
            text: null,
            source: {
              entityId: source.entityId,
              displayRef: source.records[0]?.displayRef,
              revision: 1,
              recordDigest: source.records[1]?.recordDigest,
              title: 'TEST source',
              copyright: 'EXCERPTS_ONLY',
            },
          },
        ],
      },
    ]);
    const permitted = sourcedRuling('test-marja', 'PERMITTED').ruling;
    const built = buildRulingSnapshots(pack('test-marja', [refOf(permitted)]), load, 'PROVISIONAL');
    expect(built.snapshots[0]?.passages[0]?.text).toBe('TEST excerpt');
  });

  it('attaches snapshots, keeps packs without ruling refs unchanged, and refuses altered snapshots', () => {
    const { ruling } = sourcedRuling();
    const base = pack('test-marja', [refOf(ruling)], {
      metadata: { marjaId: 'test-marja' },
    } as Partial<RulePack>);
    const { snapshots } = buildRulingSnapshots(base, load, 'PROVISIONAL');
    const none = pack('test-marja', []);
    expect(withRulingSnapshots(none, [])).toEqual({ ok: true, pack: none });
    const given = { ...base, rulingSnapshots: snapshots };
    expect(withRulingSnapshots(given, snapshots)).toEqual({ ok: true, pack: given });
    const altered = {
      ...base,
      rulingSnapshots: [{ ...snapshots[0], payload: { conclusion: 'changed' } }],
    } as unknown as RulePack;
    expect(withRulingSnapshots(altered, snapshots)).toEqual({
      ok: false,
      code: 'RULING_SNAPSHOT_MISMATCH',
    });
  });

  it('at use time: lifecycle re-checked, snapshot required, a revised draft is stale', () => {
    const { ruling, finding, passage } = sourcedRuling();
    const p = pack('test-marja', [refOf(ruling)]);
    const withSnap = {
      ...p,
      rulingSnapshots: buildRulingSnapshots(p, load, 'PROVISIONAL').snapshots,
    };
    const use = (
      policy: 'PROVISIONAL' | 'PRODUCTION',
      target: RulePack = withSnap,
      requireEveryRule = false,
    ) => codes(checkRulingSnapshots(target, load, policy, { requireEveryRule }));
    expect(use('PROVISIONAL')).toEqual([]);
    expect(use('PRODUCTION')).toEqual(['RULING_NOT_APPROVED']);
    expect(use('PROVISIONAL', p)).toEqual(['RULING_SNAPSHOT_MISSING']);
    // Approval does not change content: the draft-time snapshot stays valid.
    const approved = then(ruling, 'APPROVED');
    expect(use('PRODUCTION')).toEqual([]);
    then(approved, 'WITHDRAWN');
    expect(use('PROVISIONAL')).toEqual(['RULING_NOT_CURRENT']);
    // A revised draft no longer matches the pack's snapshot.
    const other = sourcedRuling().ruling;
    const p2 = pack('test-marja', [refOf(other)]);
    const snap2 = {
      ...p2,
      rulingSnapshots: buildRulingSnapshots(p2, load, 'PROVISIONAL').snapshots,
    };
    then(other, 'REVISED', { conclusion: 'TEST revised' }, [ref(finding, 0), ref(passage, 1)]);
    expect(use('PROVISIONAL', snap2)).toEqual(['RULING_SNAPSHOT_STALE']);
    expect(use('PRODUCTION', pack('test-marja', []), true)).toEqual(['RULING_REFERENCE_REQUIRED']);
  });

  it('parses refs and lists the ids to load', () => {
    const { ruling } = sourcedRuling();
    expect(parseRulingRef(refOf(ruling))).toEqual({ entityId: ruling.entityId, version: 1 });
    expect(parseRulingRef('x@1')).toBeNull();
    expect(rulingIdsOf(pack('test-marja', [refOf(ruling), refOf(ruling), 'bad']))).toEqual([
      ruling.entityId,
    ]);
  });
});
