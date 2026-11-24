import { describe, expect, it } from 'vitest';

import { canonicalDigest } from '@khums/calculation-engine';
import type {
  AiInvolvement,
  ResearchChain,
  ResearchEntityType,
  ResearchReference,
  ResearchRevisionRecord,
  VerifiedPrincipal,
} from '@khums/shared-types';
import { researchDisplayRefSchema, uuidV7Schema } from '@khums/validation';

import { ALL, marjaScope, NOW, principal, shift } from '../authorization/test-support';
import { executeResearchCommand, type ResearchCommandOutcome } from './actions';
import { isCatalogueQuestion, RESEARCH_QUESTION_CATALOGUE } from './catalogue';
import { appendResearchRevision, replayResearchChain, type ResearchRevisionDraft } from './chain';
import { formatUuidV7, researchDisplayRef } from './ids';
import { researchPermissionFor } from './lifecycle';
import { researchAiProvenance } from './ai-provenance';
import { checkResearchReferences } from './references';
import { INITIAL_RESEARCH_MARJAS } from './scope';

/**
 * Scholar research foundations (M5.3.2). TEST identities and placeholder payloads only: no
 * religious content, sources or rulings.
 */

let seq = 0;
const uuid = () => {
  seq += 1;
  const random = new Uint8Array(10);
  random[9] = seq;
  random[8] = seq >> 8;
  return formatUuidV7(Date.parse('2026-11-22T10:00:00.000Z') + seq, random);
};

const SCHOLAR = principal('test-scholar', {
  roles: [['GOVERNING_SCHOLAR', marjaScope('sistani')]],
});
const TWO_MARJAS = principal('test-two-marjas', {
  roles: [['GOVERNING_SCHOLAR', marjaScope('sistani', 'khamenei')]],
});
const OTHER_SCOPE = principal('test-other-scholar', {
  roles: [['GOVERNING_SCHOLAR', marjaScope('makarem-shirazi')]],
});
const RESEARCHER = principal('test-researcher', {
  roles: [['RELIGIOUS_RESEARCHER', marjaScope('sistani')]],
});
const ADMIN = principal('test-admin', { roles: [['SUPER_ADMIN', ALL]] });
const AUDITOR = principal('test-auditor', { roles: [['AUDITOR', ALL]] });

let tick = 0;
/**
 * Runs a command. REVISE/TRANSITION without an explicit `expectedRevision` get the chain's current
 * length (the up-to-date caller); tests of stale commands pass it explicitly.
 */
function run(
  who: VerifiedPrincipal,
  chain: ResearchChain | null,
  command: Record<string, unknown>,
  resolve?: (reference: ResearchReference) => ResearchChain | null,
): ResearchCommandOutcome {
  tick += 1;
  const withRevision =
    chain !== null && command.type !== 'CREATE' && !('expectedRevision' in command)
      ? { ...command, expectedRevision: chain.records.length }
      : command;
  return executeResearchCommand({
    principal: who,
    chain,
    command: withRevision,
    context: {
      decisionId: `d-${String(tick)}`,
      evaluatedAt: shift(NOW, tick),
      session: { sessionId: who.session.sessionId, state: 'ACTIVE' },
      requestId: `r-${String(tick)}`,
    },
    ...(resolve === undefined ? {} : { resolve }),
  });
}
/** Every applied chain by entity id (latest version), for reference resolution in tests. */
const store = new Map<string, ResearchChain>();
const resolveAll = (reference: ResearchReference): ResearchChain | null =>
  store.get(reference.entityId) ?? null;

function applied(outcome: ResearchCommandOutcome): ResearchChain {
  if (outcome.status !== 'APPLIED') {
    throw new Error(
      `expected APPLIED, got ${outcome.status} ${JSON.stringify(
        outcome.status === 'REFUSED' ? outcome.issues : outcome.decision,
      )}`,
    );
  }
  store.set(outcome.chain.entityId, outcome.chain);
  return outcome.chain;
}
const denial = (outcome: ResearchCommandOutcome) =>
  outcome.status === 'DENIED' && !outcome.decision.allowed
    ? outcome.decision.reason
    : outcome.status;
const refusal = (outcome: ResearchCommandOutcome) =>
  outcome.status === 'REFUSED' ? outcome.issues : outcome.status;

const create = (
  entityType: ResearchEntityType,
  marjaId = 'sistani',
  overrides: Record<string, unknown> = {},
) => ({
  type: 'CREATE',
  entityType,
  entityId: uuid(),
  marjaId,
  rulingVersion: entityType === 'RULING' ? 1 : null,
  questionId: entityType === 'FINDING' ? 'INC-01' : null,
  payload: { placeholder: `TEST ${entityType}` },
  references: [],
  aiInvolvement: [],
  ...overrides,
});
const revise = (overrides: Record<string, unknown> = {}) => ({
  type: 'REVISE',
  payload: { placeholder: 'TEST revised' },
  references: [],
  aiInvolvement: [],
  ...overrides,
});
const transition = (kind: string, reason: string | null = null) => ({
  type: 'TRANSITION',
  kind,
  reason,
});
const refTo = (chain: ResearchChain, revision: number): ResearchReference => {
  const view = replayResearchChain(chain);
  if (!view.ok) throw new Error('fixture');
  return {
    entityType: view.value.entityType,
    entityId: view.value.entityId,
    revision,
    rulingVersion: view.value.rulingVersion,
    marjaId: view.value.marjaId,
  };
};
const stateOf = (chain: ResearchChain) => {
  const view = replayResearchChain(chain);
  return view.ok ? view.value.state : 'INVALID';
};

/**
 * Re-seals edited records (recomputes each record digest and link) so a test can show that replay
 * rejects a record for its CONTENT, not merely for a broken digest.
 */
function reseal(chain: ResearchChain, records: readonly ResearchRevisionRecord[]): ResearchChain {
  let previous: string | null = null;
  const sealed: ResearchRevisionRecord[] = [];
  for (const record of records) {
    const { recordDigest: _old, ...rest } = { ...record, previousRecordDigest: previous };
    const digest = canonicalDigest(rest);
    if (!digest.ok) throw new Error('fixture');
    sealed.push({ ...rest, recordDigest: digest.value });
    previous = digest.value;
  }
  return { ...chain, records: sealed };
}

describe('identifiers (D8)', () => {
  it('formats time-ordered UUIDv7 values from injected time and randomness', () => {
    const a = formatUuidV7(1_700_000_000_000, new Uint8Array(10).fill(0xff));
    const b = formatUuidV7(1_700_000_000_001, new Uint8Array(10));
    expect(uuidV7Schema.safeParse(a).success).toBe(true);
    expect(uuidV7Schema.safeParse(b).success).toBe(true);
    expect(a < b).toBe(true);
    expect(() => formatUuidV7(-1, new Uint8Array(10))).toThrow();
    expect(() => formatUuidV7(1, new Uint8Array(9))).toThrow();
  });

  it('derives stable readable references (unique per UUID, valid shape)', () => {
    const id = uuid();
    const ref = researchDisplayRef('FINDING', 'sistani', id, 'INC-01');
    expect(ref).toMatch(/^F-sistani-INC-01-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(researchDisplayRef('FINDING', 'sistani', id, 'INC-01')).toBe(ref);
    expect(researchDisplayRefSchema.safeParse(ref).success).toBe(true);
    expect(researchDisplayRef('SOURCE', 'khamenei', id, null)).toMatch(/^S-khamenei-/);
    expect(researchDisplayRef('SOURCE', 'sistani', uuid(), null)).not.toBe(
      researchDisplayRef('SOURCE', 'sistani', uuid(), null),
    );
  });
});

describe('question catalogue (D7)', () => {
  it('holds exactly the 70 required questions with stable ids', () => {
    const { questions } = RESEARCH_QUESTION_CATALOGUE;
    expect(questions).toHaveLength(70);
    expect(new Set(questions.map((q) => q.id)).size).toBe(70);
    expect(questions.filter((q) => q.topic === 'CTQ')).toHaveLength(8);
    expect(questions.filter((q) => q.topic !== 'CTQ')).toHaveLength(62);
    expect(isCatalogueQuestion('INC-07')).toBe(true);
    expect(isCatalogueQuestion('INC-08')).toBe(false);
  });

  it('matches the exact ids of RESEARCH_MATRIX §2 (revision 5), topic by topic', () => {
    // Written independently from the matrix: topic → number of required questions.
    const matrix: Record<string, number> = {
      INC: 7,
      EXP: 6,
      SUR: 7,
      SAV: 4,
      NEC: 6,
      PRO: 6,
      INV: 5,
      LIA: 5,
      BUS: 5,
      FTK: 5,
      MIS: 6,
      CTQ: 8,
    };
    const expected = Object.entries(matrix).flatMap(([topic, count]) =>
      Array.from({ length: count }, (_, i) => `${topic}-${String(i + 1).padStart(2, '0')}`),
    );
    expect(RESEARCH_QUESTION_CATALOGUE.questions.map((q) => q.id)).toEqual(expected);
    expect(RESEARCH_QUESTION_CATALOGUE.revision).toBe('research-matrix-rev5-required');
  });

  it('excludes adjacent questions and every proposed addition (decision #10 pending)', () => {
    for (const id of ['ADJ-01', 'MIS-07', 'SUR-08', 'SUR-12', 'NEC-07', 'INC-08']) {
      expect(isCatalogueQuestion(id), id).toBe(false);
    }
  });
});

describe('initial research scope (D12)', () => {
  it('is Sistani and Khamenei only', () => {
    expect(INITIAL_RESEARCH_MARJAS).toEqual(['sistani', 'khamenei']);
  });
});

describe('one authorized scholar owns the whole lifecycle (D4, D5)', () => {
  it('creates, revises, verifies and approves their own finding; no second person anywhere', () => {
    let finding = applied(run(SCHOLAR, null, create('FINDING')));
    finding = applied(run(SCHOLAR, finding, revise()));
    finding = applied(run(SCHOLAR, finding, transition('VERIFIED')));
    finding = applied(run(SCHOLAR, finding, transition('APPROVED')));
    expect(stateOf(finding)).toBe('APPROVED');
    expect(finding.records.every((r) => r.actor.subject === 'test-scholar')).toBe(true);
    expect(finding.records[0]).toMatchObject({
      question: { id: 'INC-01', catalogueRevision: 'research-matrix-rev5-required' },
      displayRef: expect.stringMatching(/^F-sistani-INC-01-/),
    });
  });

  it('approves a ruling version alone; it is then frozen (corrections are new versions)', () => {
    let ruling = applied(run(SCHOLAR, null, create('RULING')));
    ruling = applied(run(SCHOLAR, ruling, transition('APPROVED')));
    expect(refusal(run(SCHOLAR, ruling, revise()))).toEqual(['INVALID_TRANSITION']);
    expect(refusal(run(SCHOLAR, ruling, transition('DRAFT_DELETED', 'TEST reason')))).toEqual([
      'INVALID_TRANSITION',
    ]);
    const withdrawn = applied(run(SCHOLAR, ruling, transition('WITHDRAWN', 'TEST correction')));
    expect(stateOf(withdrawn)).toBe('WITHDRAWN');
    expect(refusal(run(SCHOLAR, withdrawn, transition('APPROVED')))).toEqual(['CHAIN_TERMINAL']);
  });

  it('a scholar of two Marjas manages each independently', () => {
    for (const marjaId of ['sistani', 'khamenei']) {
      let finding = applied(run(TWO_MARJAS, null, create('FINDING', marjaId)));
      finding = applied(run(TWO_MARJAS, finding, transition('VERIFIED')));
      finding = applied(run(TWO_MARJAS, finding, transition('APPROVED')));
      expect(finding.records[0]?.marjaId).toBe(marjaId);
    }
  });
});

describe('authorization (D4, D6, D12)', () => {
  it('denies scholars outside the Marja, RELIGIOUS_RESEARCHER and AUDITOR', () => {
    // Decision 64: SUPER_ADMIN holds every research permission (formerly MISSING_PERMISSION).
    expect(denial(run(ADMIN, null, create('FINDING')))).toBe('APPLIED');
    for (const who of [RESEARCHER, AUDITOR]) {
      expect(denial(run(who, null, create('FINDING')))).toBe('MISSING_PERMISSION');
    }
    expect(denial(run(OTHER_SCOPE, null, create('FINDING')))).toBe('OUT_OF_SCOPE');
    const finding = applied(run(SCHOLAR, null, create('FINDING')));
    for (const who of [RESEARCHER, AUDITOR]) {
      expect(denial(run(who, finding, transition('APPROVED')))).toBe('MISSING_PERMISSION');
      expect(denial(run(who, finding, revise()))).toBe('MISSING_PERMISSION');
    }
    expect(denial(run(OTHER_SCOPE, finding, transition('APPROVED')))).toBe('OUT_OF_SCOPE');
  });

  it('refuses creation for a Marja outside the initial research scope, even for an in-scope scholar', () => {
    expect(refusal(run(OTHER_SCOPE, null, create('SOURCE', 'makarem-shirazi')))).toEqual([
      'MARJA_NOT_IN_RESEARCH_SCOPE',
    ]);
  });

  it('takes the Marja from the stored chain; a command cannot move or re-bind a record', () => {
    const finding = applied(run(SCHOLAR, null, create('FINDING')));
    expect(denial(run(TWO_MARJAS, finding, { ...revise(), marjaId: 'khamenei' }))).toBe(
      'INVALID_REQUEST',
    );
    expect(denial(run(SCHOLAR, finding, create('FINDING')))).toBe('INVALID_REQUEST');
  });

  it('maps every action to exactly one research permission held only by GOVERNING_SCHOLAR', () => {
    expect(researchPermissionFor('FINDING', 'APPROVED')).toBe('research.finding.approve');
    expect(researchPermissionFor('FINDING', 'VERIFIED')).toBe('research.finding.verify');
    expect(researchPermissionFor('PASSAGE', 'VERIFIED')).toBe('research.source.verify');
    expect(researchPermissionFor('TRANSLATION', 'REVIEWED')).toBe('research.translation.review');
    expect(researchPermissionFor('RULING', 'WITHDRAWN')).toBe('research.ruling.withdraw');
    expect(researchPermissionFor('RULING', 'DRAFT_DELETED')).toBe('research.ruling.edit');
    expect(researchPermissionFor('SOURCE', 'APPROVED')).toBeNull();
    expect(researchPermissionFor('TRANSLATION', 'VERIFIED')).toBeNull();
  });

  it('refuses an unknown question for a finding', () => {
    expect(
      refusal(run(SCHOLAR, null, create('FINDING', 'sistani', { questionId: 'INC-08' }))),
    ).toEqual(['QUESTION_UNKNOWN']);
  });
});

describe('lifecycles and immutability', () => {
  it('evidence: DRAFT → VERIFIED → DISPUTED → SUPERSEDED; verified content is frozen', () => {
    let source = applied(run(SCHOLAR, null, create('SOURCE')));
    source = applied(run(SCHOLAR, source, transition('VERIFIED')));
    expect(refusal(run(SCHOLAR, source, revise()))).toEqual(['INVALID_TRANSITION']);
    expect(refusal(run(SCHOLAR, source, transition('DISPUTED')))).toEqual(['REASON_REQUIRED']);
    source = applied(run(SCHOLAR, source, transition('DISPUTED', 'TEST dispute')));
    source = applied(run(SCHOLAR, source, transition('SUPERSEDED')));
    expect(stateOf(source)).toBe('SUPERSEDED');
  });

  it('translations are REVIEWED, not approved; findings verified then approved', () => {
    const translation = applied(run(SCHOLAR, null, create('TRANSLATION')));
    // There is no "approve" action for a translation at all: rejected as an invalid request.
    expect(denial(run(SCHOLAR, translation, transition('APPROVED')))).toBe('INVALID_REQUEST');
    expect(stateOf(applied(run(SCHOLAR, translation, transition('REVIEWED'))))).toBe('REVIEWED');
    const finding = applied(run(SCHOLAR, null, create('FINDING')));
    expect(refusal(run(SCHOLAR, finding, transition('APPROVED')))).toEqual(['INVALID_TRANSITION']);
    // Revising verified research returns it to a draft.
    const verified = applied(run(SCHOLAR, finding, transition('VERIFIED')));
    expect(stateOf(applied(run(SCHOLAR, verified, revise())))).toBe('DRAFT');
  });

  it('drafts are deleted by a tombstone with a reason; history is kept', () => {
    const draft = applied(run(SCHOLAR, null, create('PASSAGE')));
    expect(refusal(run(SCHOLAR, draft, transition('DRAFT_DELETED')))).toEqual(['REASON_REQUIRED']);
    const deleted = applied(run(SCHOLAR, draft, transition('DRAFT_DELETED', 'TEST duplicate')));
    expect(stateOf(deleted)).toBe('DELETED');
    expect(deleted.records).toHaveLength(2);
    expect(deleted.records[0]?.payload).toEqual({ placeholder: 'TEST PASSAGE' });
    expect(refusal(run(SCHOLAR, deleted, revise()))).toEqual(['CHAIN_TERMINAL']);
  });

  it('refuses approval while declared AI involvement is unreviewed (assistance recorded in detail)', () => {
    const involvement = {
      assistance: 'TRANSLATION_DRAFT',
      field: 'payload.text',
      generation: 'AI_GENERATED',
      tool: 'test-tool',
      occurredAt: '2026-11-22T09:00:00.000Z',
      scholarReview: 'NOT_REVIEWED',
    };
    let translation = applied(
      run(SCHOLAR, null, create('TRANSLATION', 'sistani', { aiInvolvement: [involvement] })),
    );
    expect(refusal(run(SCHOLAR, translation, transition('REVIEWED')))).toEqual([
      'AI_REVIEW_REQUIRED',
    ]);
    translation = applied(
      run(
        SCHOLAR,
        translation,
        revise({ aiInvolvement: [{ ...involvement, scholarReview: 'REVIEWED_CORRECTED' }] }),
      ),
    );
    expect(stateOf(applied(run(SCHOLAR, translation, transition('REVIEWED'))))).toBe('REVIEWED');
  });
});

describe('chain integrity', () => {
  it('detects tampering, changed bindings and reordering', () => {
    let finding = applied(run(SCHOLAR, null, create('FINDING')));
    finding = applied(run(SCHOLAR, finding, revise()));
    const [first, second] = finding.records;
    if (first === undefined || second === undefined) throw new Error('fixture');
    for (const records of [
      [{ ...first, payload: { placeholder: 'EDITED' } }, second],
      [first, { ...second, marjaId: 'khamenei' }],
      [second, first],
      [first, { ...second, recordDigest: 'f'.repeat(64) }],
    ]) {
      expect(replayResearchChain({ ...finding, records }).ok).toBe(false);
    }
    expect(replayResearchChain(finding).ok).toBe(true);
  });

  it('refuses a binding that does not fit the entity type', () => {
    const draft: ResearchRevisionDraft = {
      kind: 'CREATED',
      payload: { placeholder: 'TEST' },
      references: [],
      aiInvolvement: [],
      actor: { kind: 'STAFF_PRINCIPAL', subject: 'test-scholar' },
      recordedAt: NOW,
      reason: null,
      decisionId: 'd',
      requestId: 'r',
    };
    const id = uuid();
    const base = {
      entityId: id,
      displayRef: researchDisplayRef('SOURCE', 'sistani', id, null),
      marjaId: 'sistani',
    };
    expect(
      appendResearchRevision(
        null,
        { ...base, entityType: 'SOURCE', rulingVersion: 1, question: null },
        draft,
      ),
    ).toMatchObject({ ok: false, error: 'BINDING_INVALID' });
    expect(
      appendResearchRevision(
        null,
        { ...base, entityType: 'RULING', rulingVersion: null, question: null },
        draft,
      ),
    ).toMatchObject({ ok: false, error: 'BINDING_INVALID' });
  });
});

describe('references: exact revisions, same Marja (foundations)', () => {
  it('refuses references to another Marja, to itself and to disallowed types at write time', () => {
    const passage = applied(run(TWO_MARJAS, null, create('PASSAGE', 'khamenei')));
    expect(
      refusal(
        run(
          TWO_MARJAS,
          null,
          create('FINDING', 'sistani', { references: [refTo(passage, 0)] }),
          resolveAll,
        ),
      ),
    ).toEqual(['REFERENCE_OTHER_MARJA']);
    const finding = applied(run(SCHOLAR, null, create('FINDING')));
    const self = refTo(finding, 0);
    expect(refusal(run(SCHOLAR, finding, revise({ references: [self] }), resolveAll))).toEqual([
      'REFERENCE_SELF',
    ]);
    const ruling = applied(run(SCHOLAR, null, create('RULING')));
    expect(
      refusal(
        run(
          SCHOLAR,
          null,
          create('PASSAGE', 'sistani', { references: [refTo(ruling, 0)] }),
          resolveAll,
        ),
      ),
    ).toEqual(['REFERENCE_TYPE_INVALID']);
  });

  it('approval needs each referenced revision in the required state; a dispute blocks it', () => {
    let passage = applied(run(SCHOLAR, null, create('PASSAGE')));
    const draftRef = refTo(passage, 0);
    passage = applied(run(SCHOLAR, passage, transition('VERIFIED')));
    const chains = new Map([[passage.entityId, passage]]);
    const resolve = (r: ResearchReference) => chains.get(r.entityId) ?? null;

    // A finding citing the DRAFT revision cannot be verified.
    let finding = applied(
      run(SCHOLAR, null, create('FINDING', 'sistani', { references: [draftRef] }), resolve),
    );
    expect(refusal(run(SCHOLAR, finding, transition('VERIFIED'), resolve))).toEqual([
      'REFERENCE_STATE_INVALID',
    ]);
    // Without a resolver nothing with references is verified.
    expect(refusal(run(SCHOLAR, finding, transition('VERIFIED')))).toEqual([
      'REFERENCES_UNRESOLVED',
    ]);
    // Citing the VERIFIED revision works.
    finding = applied(run(SCHOLAR, finding, revise({ references: [refTo(passage, 1)] }), resolve));
    finding = applied(run(SCHOLAR, finding, transition('VERIFIED'), resolve));
    // A later dispute of the passage blocks approval.
    chains.set(
      passage.entityId,
      applied(run(SCHOLAR, passage, transition('DISPUTED', 'TEST dispute'))),
    );
    expect(refusal(run(SCHOLAR, finding, transition('APPROVED'), resolve))).toEqual([
      'REFERENCE_DISPUTED',
    ]);
  });

  it('reports missing, invalid and out-of-range references', () => {
    const passage = applied(run(SCHOLAR, null, create('PASSAGE')));
    const resolve = (r: ResearchReference) => (r.entityId === passage.entityId ? passage : null);
    expect(
      checkResearchReferences(
        'sistani',
        [{ ...refTo(passage, 0), entityId: uuid() }],
        resolve,
        'DRAFT',
      ),
    ).toEqual([expect.objectContaining({ code: 'REFERENCE_NOT_FOUND' })]);
    expect(checkResearchReferences('sistani', [refTo(passage, 5)], resolve, 'DRAFT')).toEqual([
      expect.objectContaining({ code: 'REFERENCE_REVISION_INVALID' }),
    ]);
    expect(
      checkResearchReferences(
        'sistani',
        [{ ...refTo(passage, 0), entityType: 'SOURCE' }],
        resolve,
        'DRAFT',
      ),
    ).toEqual([expect.objectContaining({ code: 'REFERENCE_INVALID' })]);
    expect(checkResearchReferences('sistani', [refTo(passage, 0)], resolve, 'DRAFT')).toEqual([]);
  });
});

describe('stale revision protection (audit P1)', () => {
  it('applies a command built against the current revision and refuses stale or future ones', () => {
    let source = applied(run(SCHOLAR, null, create('SOURCE')));
    source = applied(run(SCHOLAR, source, { ...revise(), expectedRevision: 1 }));
    expect(source.records).toHaveLength(2);
    for (const expectedRevision of [1, 3, 99]) {
      expect(refusal(run(SCHOLAR, source, { ...revise(), expectedRevision }))).toEqual([
        'REVISION_CONFLICT',
      ]);
      expect(
        refusal(run(SCHOLAR, source, { ...transition('VERIFIED'), expectedRevision })),
      ).toEqual(['REVISION_CONFLICT']);
    }
    expect(
      stateOf(applied(run(SCHOLAR, source, { ...transition('VERIFIED'), expectedRevision: 2 }))),
    ).toBe('VERIFIED');
  });

  it('of two commands built from the same revision, the second is refused once the first is stored', () => {
    const base = applied(run(SCHOLAR, null, create('FINDING')));
    const first = { ...revise({ payload: { placeholder: 'TEST a' } }), expectedRevision: 1 };
    const second = { ...transition('VERIFIED'), expectedRevision: 1 };
    const stored = applied(run(SCHOLAR, base, first));
    expect(refusal(run(SCHOLAR, stored, second))).toEqual(['REVISION_CONFLICT']);
    expect(refusal(run(SCHOLAR, stored, { ...first }))).toEqual(['REVISION_CONFLICT']);
    // Core detects stale commands only: evaluated against the SAME stored chain both pass, and
    // both would be revision 1. The API's atomic persistence (unique {entityId, revision} in a
    // transaction, M5.3.3) must store exactly one of them.
    expect(run(SCHOLAR, base, first).status).toBe('APPLIED');
    expect(run(SCHOLAR, base, second).status).toBe('APPLIED');
  });

  it('requires expectedRevision on REVISE and TRANSITION and never on CREATE', () => {
    const source = applied(run(SCHOLAR, null, create('SOURCE')));
    const call = (command: Record<string, unknown>, chain: ResearchChain | null = source) =>
      executeResearchCommand({
        principal: SCHOLAR,
        chain,
        command,
        context: {
          decisionId: 'd-x',
          evaluatedAt: shift(NOW, 10_000),
          session: { sessionId: SCHOLAR.session.sessionId, state: 'ACTIVE' },
          requestId: 'r-x',
        },
      });
    expect(denial(call(revise()))).toBe('INVALID_REQUEST');
    expect(denial(call(transition('VERIFIED')))).toBe('INVALID_REQUEST');
    expect(denial(call({ ...revise(), expectedRevision: 0 }))).toBe('INVALID_REQUEST');
    expect(denial(call({ ...revise(), expectedRevision: 1.5 }))).toBe('INVALID_REQUEST');
    expect(denial(call({ ...create('SOURCE'), expectedRevision: 1 }, null))).toBe(
      'INVALID_REQUEST',
    );
    expect(call(create('SOURCE'), null).status).toBe('APPLIED');
  });
});

describe('AI involvement is cumulative (audit P2)', () => {
  const declared: AiInvolvement = {
    assistance: 'TRANSLATION_DRAFT',
    field: 'payload.text',
    generation: 'AI_GENERATED',
    tool: 'test-tool',
    occurredAt: '2026-11-22T09:00:00.000Z',
    scholarReview: 'NOT_REVIEWED',
  };
  const reviewed: AiInvolvement = { ...declared, scholarReview: 'REVIEWED_CORRECTED' };
  const later: AiInvolvement = {
    ...declared,
    assistance: 'CONSISTENCY_CHECK',
    generation: 'MACHINE_ASSISTED',
    occurredAt: '2026-11-22T11:00:00.000Z',
  };
  const translationWith = (aiInvolvement: readonly unknown[]) =>
    applied(run(SCHOLAR, null, create('TRANSLATION', 'sistani', { aiInvolvement })));

  it('refuses a revision that drops a declaration, so review cannot be bypassed', () => {
    const translation = translationWith([declared]);
    expect(refusal(run(SCHOLAR, translation, revise({ aiInvolvement: [] })))).toEqual([
      'AI_DECLARATION_REMOVED',
    ]);
    expect(refusal(run(SCHOLAR, translation, transition('REVIEWED')))).toEqual([
      'AI_REVIEW_REQUIRED',
    ]);
  });

  it('refuses altering a declaration (tool, field, kind, generation or time)', () => {
    const translation = translationWith([declared]);
    for (const altered of [
      { ...declared, tool: 'other-tool' },
      { ...declared, field: 'payload.other' },
      { ...declared, assistance: 'OCR_TEXT_EXTRACTION' },
      { ...declared, generation: 'MACHINE_ASSISTED' },
      { ...declared, occurredAt: '2026-11-22T09:00:00.001Z' },
    ]) {
      expect(refusal(run(SCHOLAR, translation, revise({ aiInvolvement: [altered] })))).toEqual([
        'AI_DECLARATION_REMOVED',
      ]);
    }
  });

  it('lets review progress but never regress or change once given', () => {
    let translation = translationWith([declared]);
    translation = applied(run(SCHOLAR, translation, revise({ aiInvolvement: [reviewed] })));
    for (const scholarReview of ['NOT_REVIEWED', 'REVIEWED_UNCHANGED']) {
      expect(
        refusal(
          run(SCHOLAR, translation, revise({ aiInvolvement: [{ ...declared, scholarReview }] })),
        ),
      ).toEqual(['AI_REVIEW_REGRESSED']);
    }
    expect(stateOf(applied(run(SCHOLAR, translation, transition('REVIEWED'))))).toBe('REVIEWED');
  });

  it('keeps reviewed declarations and gates approval on newly added ones', () => {
    let finding = applied(
      run(SCHOLAR, null, create('FINDING', 'sistani', { aiInvolvement: [reviewed] })),
    );
    expect(refusal(run(SCHOLAR, finding, revise({ aiInvolvement: [] })))).toEqual([
      'AI_DECLARATION_REMOVED',
    ]);
    finding = applied(run(SCHOLAR, finding, revise({ aiInvolvement: [reviewed, later] })));
    expect(refusal(run(SCHOLAR, finding, transition('VERIFIED')))).toEqual(['AI_REVIEW_REQUIRED']);
    finding = applied(
      run(
        SCHOLAR,
        finding,
        revise({ aiInvolvement: [reviewed, { ...later, scholarReview: 'REVIEWED_UNCHANGED' }] }),
      ),
    );
    finding = applied(run(SCHOLAR, finding, transition('VERIFIED')));
    // Returning a verified finding to draft keeps every declaration.
    expect(refusal(run(SCHOLAR, finding, revise({ aiInvolvement: [reviewed] })))).toEqual([
      'AI_DECLARATION_REMOVED',
    ]);
    const view = replayResearchChain(finding);
    expect(view.ok && view.value.content.aiInvolvement).toHaveLength(2);
  });

  it('refuses duplicate declarations in one revision', () => {
    expect(
      refusal(
        run(
          SCHOLAR,
          null,
          create('TRANSLATION', 'sistani', { aiInvolvement: [declared, declared] }),
        ),
      ),
    ).toEqual(['AI_DECLARATION_DUPLICATE']);
  });

  it('rejects a stored chain whose later revision dropped a declaration (replay)', () => {
    let translation = translationWith([reviewed]);
    translation = applied(run(SCHOLAR, translation, revise({ aiInvolvement: [reviewed] })));
    const [first, second] = translation.records;
    if (first === undefined || second === undefined) throw new Error('fixture');
    expect(replayResearchChain(reseal(translation, [first, second])).ok).toBe(true);
    for (const aiInvolvement of [[], [{ ...reviewed, scholarReview: 'NOT_REVIEWED' as const }]]) {
      expect(
        replayResearchChain(reseal(translation, [first, { ...second, aiInvolvement }])).ok,
      ).toBe(false);
    }
  });
});

describe('references are resolved while drafting (audit P3)', () => {
  it('refuses content with references when no resolver is available; never skips', () => {
    const passage = applied(run(SCHOLAR, null, create('PASSAGE')));
    expect(
      refusal(
        run(SCHOLAR, null, create('FINDING', 'sistani', { references: [refTo(passage, 0)] })),
      ),
    ).toEqual(['REFERENCES_UNRESOLVED']);
    const finding = applied(run(SCHOLAR, null, create('FINDING')));
    expect(refusal(run(SCHOLAR, finding, revise({ references: [refTo(passage, 0)] })))).toEqual([
      'REFERENCES_UNRESOLVED',
    ]);
  });

  it('refuses missing entities, invalid revisions, other Marjas and deleted targets', () => {
    const passage = applied(run(TWO_MARJAS, null, create('PASSAGE')));
    const other = applied(run(TWO_MARJAS, null, create('PASSAGE', 'khamenei')));
    const deleted = applied(
      run(
        TWO_MARJAS,
        applied(run(TWO_MARJAS, null, create('PASSAGE'))),
        transition('DRAFT_DELETED', 'TEST duplicate'),
      ),
    );
    const cases: readonly [ResearchReference, string][] = [
      [{ ...refTo(passage, 0), entityId: uuid() }, 'REFERENCE_NOT_FOUND'],
      [refTo(passage, 1), 'REFERENCE_REVISION_INVALID'],
      [refTo(other, 0), 'REFERENCE_OTHER_MARJA'],
      // Claims this Marja but the stored target belongs to another.
      [{ ...refTo(other, 0), marjaId: 'sistani' }, 'REFERENCE_OTHER_MARJA'],
      [refTo(deleted, 0), 'REFERENCE_DELETED'],
      [{ ...refTo(passage, 0), entityType: 'SOURCE' }, 'REFERENCE_INVALID'],
    ];
    const finding = applied(run(TWO_MARJAS, null, create('FINDING')));
    for (const [reference, code] of cases) {
      expect(
        refusal(
          run(
            TWO_MARJAS,
            null,
            create('FINDING', 'sistani', { references: [reference] }),
            resolveAll,
          ),
        ),
      ).toEqual([code]);
      expect(
        refusal(run(TWO_MARJAS, finding, revise({ references: [reference] }), resolveAll)),
      ).toEqual([code]);
    }
  });

  it('accepts valid draft references and records without references', () => {
    const source = applied(run(SCHOLAR, null, create('SOURCE')));
    const passage = applied(
      run(
        SCHOLAR,
        null,
        create('PASSAGE', 'sistani', { references: [refTo(source, 0)] }),
        resolveAll,
      ),
    );
    expect(passage.records[0]?.references).toEqual([refTo(source, 0)]);
    const finding = applied(run(SCHOLAR, null, create('FINDING')));
    expect(
      applied(run(SCHOLAR, finding, revise({ references: [refTo(passage, 0)] }), resolveAll))
        .records,
    ).toHaveLength(2);
    expect(applied(run(SCHOLAR, null, create('SOURCE'))).records).toHaveLength(1);
  });
});

describe('replay integrity (audit P4, P5)', () => {
  const base = () => applied(run(SCHOLAR, null, create('FINDING')));
  const firstOf = (chain: ResearchChain) => {
    const [first] = chain.records;
    if (first === undefined) throw new Error('fixture');
    return first;
  };

  it('accepts a re-sealed but unchanged chain (the helper is sound)', () => {
    const chain = applied(run(SCHOLAR, base(), revise()));
    expect(replayResearchChain(reseal(chain, chain.records)).ok).toBe(true);
  });

  it('requires a staff-principal actor on every research record', () => {
    const chain = base();
    const forged = reseal(chain, [
      { ...firstOf(chain), actor: { kind: 'UNVERIFIED_REFERENCE', subject: 'test-someone' } },
    ]);
    expect(replayResearchChain(forged).ok).toBe(false);
  });

  it('recomputes the display reference from the UUID, Marja, entity type and question', () => {
    const chain = base();
    const first = firstOf(chain);
    for (const displayRef of [
      first.displayRef.replace('F-sistani-', 'F-khamenei-'),
      first.displayRef.replace(/-[0-9A-Z]{8}$/, '-00000000'),
      first.displayRef.replace('-INC-01-', '-INC-02-'),
    ]) {
      expect(replayResearchChain(reseal(chain, [{ ...first, displayRef }])).ok, displayRef).toBe(
        false,
      );
    }
    const id = uuid();
    const draft: ResearchRevisionDraft = {
      kind: 'CREATED',
      payload: { placeholder: 'TEST' },
      references: [],
      aiInvolvement: [],
      actor: { kind: 'STAFF_PRINCIPAL', subject: 'test-scholar' },
      recordedAt: NOW,
      reason: null,
      decisionId: 'd',
      requestId: 'r',
    };
    const binding = {
      entityType: 'SOURCE' as const,
      entityId: id,
      marjaId: 'sistani',
      rulingVersion: null,
      question: null,
    };
    expect(
      appendResearchRevision(
        null,
        { ...binding, displayRef: researchDisplayRef('SOURCE', 'khamenei', id, null) },
        draft,
      ),
    ).toMatchObject({ ok: false, error: 'BINDING_INVALID' });
    expect(
      appendResearchRevision(
        null,
        { ...binding, displayRef: researchDisplayRef('SOURCE', 'sistani', id, null) },
        draft,
      ).ok,
    ).toBe(true);
  });

  it('accepts only supported catalogue revisions, and the revision never changes', () => {
    const chain = base();
    const first = firstOf(chain);
    const unknown = reseal(chain, [
      { ...first, question: { id: 'INC-01', catalogueRevision: 'made-up-revision' } },
    ]);
    expect(replayResearchChain(unknown).ok).toBe(false);

    const revised = applied(run(SCHOLAR, chain, revise()));
    const [, second] = revised.records;
    if (second === undefined) throw new Error('fixture');
    const changed = reseal(revised, [
      first,
      { ...second, question: { id: 'INC-01', catalogueRevision: 'research-matrix-rev6' } },
    ]);
    expect(replayResearchChain(changed).ok).toBe(false);
    // Same values in another key order are the same question.
    const reordered = reseal(revised, [
      first,
      { ...second, question: { catalogueRevision: 'research-matrix-rev5-required', id: 'INC-01' } },
    ]);
    expect(replayResearchChain(reordered).ok).toBe(true);
  });
});

describe('lifecycle transition table (architecture §5), exhaustively', () => {
  type Kind =
    | 'REVISE'
    | 'VERIFIED'
    | 'REVIEWED'
    | 'APPROVED'
    | 'DISPUTED'
    | 'SUPERSEDED'
    | 'WITHDRAWN'
    | 'DRAFT_DELETED';
  const KINDS: readonly Kind[] = [
    'REVISE',
    'VERIFIED',
    'REVIEWED',
    'APPROVED',
    'DISPUTED',
    'SUPERSEDED',
    'WITHDRAWN',
    'DRAFT_DELETED',
  ];
  const REASON: ReadonlySet<Kind> = new Set(['DISPUTED', 'WITHDRAWN', 'DRAFT_DELETED']);
  const TERMINAL = new Set(['SUPERSEDED', 'WITHDRAWN', 'DELETED']);

  // Written from the architecture's table, independently of lifecycle.ts.
  interface Row {
    readonly actions: readonly Kind[];
    readonly paths: Readonly<Record<string, readonly Kind[]>>;
    readonly allowed: Readonly<Record<string, Partial<Record<Kind, string>>>>;
  }
  const evidence: Row = {
    actions: ['REVISE', 'VERIFIED', 'DISPUTED', 'SUPERSEDED', 'DRAFT_DELETED'],
    paths: {
      DRAFT: [],
      VERIFIED: ['VERIFIED'],
      DISPUTED: ['VERIFIED', 'DISPUTED'],
      SUPERSEDED: ['VERIFIED', 'SUPERSEDED'],
      DELETED: ['DRAFT_DELETED'],
    },
    allowed: {
      DRAFT: { REVISE: 'DRAFT', VERIFIED: 'VERIFIED', DRAFT_DELETED: 'DELETED' },
      VERIFIED: { DISPUTED: 'DISPUTED', SUPERSEDED: 'SUPERSEDED' },
      DISPUTED: { SUPERSEDED: 'SUPERSEDED' },
    },
  };
  const TABLE: Readonly<Record<ResearchEntityType, Row>> = {
    SOURCE: evidence,
    PASSAGE: evidence,
    TRANSLATION: {
      actions: ['REVISE', 'REVIEWED', 'DISPUTED', 'SUPERSEDED', 'DRAFT_DELETED'],
      paths: {
        DRAFT: [],
        REVIEWED: ['REVIEWED'],
        DISPUTED: ['REVIEWED', 'DISPUTED'],
        SUPERSEDED: ['REVIEWED', 'SUPERSEDED'],
        DELETED: ['DRAFT_DELETED'],
      },
      allowed: {
        DRAFT: { REVISE: 'DRAFT', REVIEWED: 'REVIEWED', DRAFT_DELETED: 'DELETED' },
        REVIEWED: { DISPUTED: 'DISPUTED', SUPERSEDED: 'SUPERSEDED' },
        DISPUTED: { SUPERSEDED: 'SUPERSEDED' },
      },
    },
    FINDING: {
      actions: ['REVISE', 'VERIFIED', 'APPROVED', 'SUPERSEDED', 'WITHDRAWN', 'DRAFT_DELETED'],
      paths: {
        DRAFT: [],
        VERIFIED: ['VERIFIED'],
        APPROVED: ['VERIFIED', 'APPROVED'],
        SUPERSEDED: ['VERIFIED', 'APPROVED', 'SUPERSEDED'],
        WITHDRAWN: ['VERIFIED', 'APPROVED', 'WITHDRAWN'],
        DELETED: ['DRAFT_DELETED'],
      },
      allowed: {
        DRAFT: { REVISE: 'DRAFT', VERIFIED: 'VERIFIED', DRAFT_DELETED: 'DELETED' },
        VERIFIED: { REVISE: 'DRAFT', APPROVED: 'APPROVED', DRAFT_DELETED: 'DELETED' },
        APPROVED: { SUPERSEDED: 'SUPERSEDED', WITHDRAWN: 'WITHDRAWN' },
      },
    },
    RULING: {
      actions: ['REVISE', 'APPROVED', 'SUPERSEDED', 'WITHDRAWN', 'DRAFT_DELETED'],
      paths: {
        DRAFT: [],
        APPROVED: ['APPROVED'],
        SUPERSEDED: ['APPROVED', 'SUPERSEDED'],
        WITHDRAWN: ['APPROVED', 'WITHDRAWN'],
        DELETED: ['DRAFT_DELETED'],
      },
      allowed: {
        DRAFT: { REVISE: 'DRAFT', APPROVED: 'APPROVED', DRAFT_DELETED: 'DELETED' },
        APPROVED: { SUPERSEDED: 'SUPERSEDED', WITHDRAWN: 'WITHDRAWN' },
      },
    },
  };
  const command = (kind: Kind, withReason = true) =>
    kind === 'REVISE'
      ? revise()
      : transition(kind, withReason && REASON.has(kind) ? 'TEST reason' : null);

  for (const entityType of Object.keys(TABLE) as ResearchEntityType[]) {
    it(`${entityType}: every state × every action`, () => {
      const { actions, paths, allowed } = TABLE[entityType];
      for (const [state, path] of Object.entries(paths)) {
        let chain = applied(run(SCHOLAR, null, create(entityType)));
        for (const step of path) chain = applied(run(SCHOLAR, chain, command(step)));
        expect(stateOf(chain), `${entityType} reach ${state}`).toBe(state);
        for (const kind of KINDS) {
          const label = `${entityType} ${state} ${kind}`;
          const outcome = run(SCHOLAR, chain, command(kind));
          const target = allowed[state]?.[kind];
          if (!actions.includes(kind)) {
            expect(denial(outcome), label).toBe('INVALID_REQUEST');
          } else if (TERMINAL.has(state)) {
            expect(refusal(outcome), label).toEqual(['CHAIN_TERMINAL']);
          } else if (target === undefined) {
            expect(refusal(outcome), label).toEqual(['INVALID_TRANSITION']);
          } else {
            expect(outcome.status, label).toBe('APPLIED');
            if (outcome.status === 'APPLIED') expect(stateOf(outcome.chain), label).toBe(target);
            if (REASON.has(kind)) {
              expect(refusal(run(SCHOLAR, chain, command(kind, false))), label).toEqual([
                'REASON_REQUIRED',
              ]);
            }
          }
        }
      }
    });
  }
});

describe('AI declaration corrections: append-only (final hardening A)', () => {
  const wrong: AiInvolvement = {
    assistance: 'OCR_TEXT_EXTRACTION',
    field: 'payload.text',
    generation: 'AI_GENERATED',
    tool: 'test-tool-misnamed',
    occurredAt: '2026-11-22T09:00:00.000Z',
    scholarReview: 'NOT_REVIEWED',
  };
  const identity = (ai: AiInvolvement) => ({
    assistance: ai.assistance,
    field: ai.field,
    generation: ai.generation,
    tool: ai.tool,
    occurredAt: ai.occurredAt,
  });
  const correction: AiInvolvement = {
    ...wrong,
    tool: 'test-tool',
    correctionOf: identity(wrong),
    correctionReason: 'TEST tool name recorded incorrectly',
  };
  const reviewedCorrection: AiInvolvement = { ...correction, scholarReview: 'REVIEWED_CORRECTED' };
  const passageWith = (aiInvolvement: readonly AiInvolvement[]) =>
    applied(run(SCHOLAR, null, create('PASSAGE', 'sistani', { aiInvolvement })));

  it('adds a linked correction, keeps the original, and still requires review before verification', () => {
    let passage = passageWith([wrong]);
    passage = applied(run(SCHOLAR, passage, revise({ aiInvolvement: [wrong, correction] })));
    // The correction starts unreviewed, so the gate still holds.
    expect(refusal(run(SCHOLAR, passage, transition('VERIFIED')))).toEqual(['AI_REVIEW_REQUIRED']);
    passage = applied(
      run(SCHOLAR, passage, revise({ aiInvolvement: [wrong, reviewedCorrection] })),
    );
    // The original (still NOT_REVIEWED) is corrected, so it no longer gates; nothing was removed.
    passage = applied(run(SCHOLAR, passage, transition('VERIFIED')));
    expect(stateOf(passage)).toBe('VERIFIED');
    expect(passage.records[1]?.aiInvolvement).toEqual([wrong, correction]);

    const provenance = researchAiProvenance(passage);
    if (!provenance.ok) throw new Error('fixture');
    const [original, fix] = provenance.value;
    expect(original).toMatchObject({
      declaration: wrong,
      declaredIn: { revision: 0, actor: { kind: 'STAFF_PRINCIPAL', subject: 'test-scholar' } },
      correctedBy: identity(correction),
      correctedIn: { revision: 1 },
      effective: false,
    });
    expect(fix).toMatchObject({
      declaration: reviewedCorrection,
      declaredIn: { revision: 1, recordId: `${passage.entityId}#1` },
      reviewedIn: { revision: 2 },
      correctedBy: null,
      effective: true,
    });
    expect(fix?.declaredIn.recordedAt).toBe(passage.records[1]?.recordedAt);
  });

  it('never removes or rewrites the original or the correction later', () => {
    let passage = passageWith([wrong]);
    expect(refusal(run(SCHOLAR, passage, revise({ aiInvolvement: [correction] })))).toEqual([
      'AI_DECLARATION_REMOVED',
    ]);
    passage = applied(run(SCHOLAR, passage, revise({ aiInvolvement: [wrong, correction] })));
    for (const aiInvolvement of [
      [wrong],
      [wrong, { ...correction, correctionReason: 'TEST different reason' }],
      [wrong, { ...correction, correctionOf: { ...identity(wrong), field: 'payload.other' } }],
    ]) {
      expect(refusal(run(SCHOLAR, passage, revise({ aiInvolvement })))).toEqual([
        'AI_DECLARATION_REMOVED',
      ]);
    }
  });

  it('requires a reason, and a reason only on a correction', () => {
    const passage = passageWith([wrong]);
    const { correctionReason: _omit, ...noReason } = correction;
    expect(refusal(run(SCHOLAR, passage, revise({ aiInvolvement: [wrong, noReason] })))).toEqual([
      'AI_CORRECTION_REASON_REQUIRED',
    ]);
    const { correctionOf: _unlinked, ...reasonOnly } = correction;
    expect(refusal(run(SCHOLAR, passage, revise({ aiInvolvement: [wrong, reasonOnly] })))).toEqual([
      'AI_CORRECTION_INVALID',
    ]);
    // A malformed reason is rejected by the contract.
    expect(
      denial(
        run(
          SCHOLAR,
          passage,
          revise({ aiInvolvement: [wrong, { ...correction, correctionReason: ' x ' }] }),
        ),
      ),
    ).toBe('INVALID_REQUEST');
  });

  it('refuses broken links: unknown target, same-revision target, double correction, at creation', () => {
    const passage = passageWith([wrong]);
    const unknownTarget = { ...correction, correctionOf: { ...identity(wrong), tool: 'nothing' } };
    expect(
      refusal(run(SCHOLAR, passage, revise({ aiInvolvement: [wrong, unknownTarget] }))),
    ).toEqual(['AI_CORRECTION_TARGET_INVALID']);
    // Correcting a declaration added in the same revision (not yet recorded history).
    const fresh: AiInvolvement = { ...wrong, occurredAt: '2026-11-22T09:30:00.000Z' };
    const ofFresh = { ...correction, tool: 'test-tool-2', correctionOf: identity(fresh) };
    expect(
      refusal(run(SCHOLAR, passage, revise({ aiInvolvement: [wrong, fresh, ofFresh] }))),
    ).toEqual(['AI_CORRECTION_TARGET_INVALID']);
    // Two corrections of one declaration, in one revision or a later one.
    const second = { ...correction, tool: 'test-tool-2' };
    expect(
      refusal(run(SCHOLAR, passage, revise({ aiInvolvement: [wrong, correction, second] }))),
    ).toEqual(['AI_CORRECTION_TARGET_INVALID']);
    const corrected = applied(
      run(SCHOLAR, passage, revise({ aiInvolvement: [wrong, correction] })),
    );
    expect(
      refusal(run(SCHOLAR, corrected, revise({ aiInvolvement: [wrong, correction, second] }))),
    ).toEqual(['AI_CORRECTION_TARGET_INVALID']);
    // A correction can itself be corrected (a chain of corrections).
    const fixOfFix = {
      ...correction,
      tool: 'test-tool-3',
      correctionOf: identity(correction),
    };
    expect(
      run(SCHOLAR, corrected, revise({ aiInvolvement: [wrong, correction, fixOfFix] })).status,
    ).toBe('APPLIED');
    // Nothing to correct at creation.
    expect(
      refusal(run(SCHOLAR, null, create('PASSAGE', 'sistani', { aiInvolvement: [correction] }))),
    ).toEqual(['AI_CORRECTION_TARGET_INVALID']);
  });

  it('cannot enter already reviewed, so a correction never skips review', () => {
    const passage = passageWith([wrong]);
    expect(
      refusal(run(SCHOLAR, passage, revise({ aiInvolvement: [wrong, reviewedCorrection] }))),
    ).toEqual(['AI_CORRECTION_REVIEW_INVALID']);
  });

  it('only an authorized scholar of the Marja can record a correction', () => {
    const passage = passageWith([wrong]);
    // Decision 64: SUPER_ADMIN may record it too (formerly MISSING_PERMISSION).
    expect(denial(run(ADMIN, passage, revise({ aiInvolvement: [wrong, correction] })))).toBe(
      'APPLIED',
    );
    for (const who of [RESEARCHER, AUDITOR]) {
      expect(denial(run(who, passage, revise({ aiInvolvement: [wrong, correction] })))).toBe(
        'MISSING_PERMISSION',
      );
    }
    expect(denial(run(OTHER_SCOPE, passage, revise({ aiInvolvement: [wrong, correction] })))).toBe(
      'OUT_OF_SCOPE',
    );
  });

  it('replay rejects tampered corrections and unverified actors', () => {
    let passage = passageWith([wrong]);
    passage = applied(run(SCHOLAR, passage, revise({ aiInvolvement: [wrong, correction] })));
    const [first, second] = passage.records;
    if (first === undefined || second === undefined) throw new Error('fixture');
    expect(replayResearchChain(reseal(passage, [first, second])).ok).toBe(true);
    const { correctionReason: _r, ...unreasoned } = correction;
    for (const aiInvolvement of [
      [wrong, unreasoned],
      [wrong, reviewedCorrection],
      [correction],
      [wrong, { ...correction, correctionOf: { ...identity(wrong), tool: 'nothing' } }],
    ]) {
      expect(replayResearchChain(reseal(passage, [first, { ...second, aiInvolvement }])).ok).toBe(
        false,
      );
    }
    expect(
      replayResearchChain(
        reseal(passage, [
          first,
          { ...second, actor: { kind: 'UNVERIFIED_REFERENCE', subject: 'test-someone' } },
        ]),
      ).ok,
    ).toBe(false);
    // Tampering without re-sealing breaks the digest chain.
    expect(
      replayResearchChain({
        ...passage,
        records: [first, { ...second, aiInvolvement: [wrong, unreasoned] }],
      }).ok,
    ).toBe(false);
    expect(researchAiProvenance({ ...passage, records: [second] }).ok).toBe(false);
  });
});

describe('reference lifecycle: pinned historical revisions (final hardening B)', () => {
  type Outcome = string; // 'OK' or the refusal codes
  const ok = 'OK';
  const outcomeOf = (outcome: ResearchCommandOutcome): Outcome =>
    outcome.status === 'APPLIED'
      ? ok
      : outcome.status === 'REFUSED'
        ? outcome.issues.join(',')
        : `DENIED:${outcome.decision.allowed ? '' : outcome.decision.reason}`;

  /** Builds a target chain by applying `steps`, returning it and the revision to pin. */
  function target(
    entityType: ResearchEntityType,
    pinAfter: readonly string[],
    after: readonly string[],
  ): { readonly chain: ResearchChain; readonly reference: ResearchReference } {
    let chain = applied(run(SCHOLAR, null, create(entityType)));
    const step = (kind: string) =>
      kind === 'REVISE'
        ? revise()
        : transition(
            kind,
            ['DISPUTED', 'WITHDRAWN', 'DRAFT_DELETED'].includes(kind) ? 'TEST reason' : null,
          );
    for (const kind of pinAfter) chain = applied(run(SCHOLAR, chain, step(kind)));
    const reference = refTo(chain, chain.records.length - 1);
    for (const kind of after) chain = applied(run(SCHOLAR, chain, step(kind)));
    return { chain, reference };
  }

  /** Drafts a referring record, then tries each approval-type step; reports each outcome. */
  function exercise(
    referring: ResearchEntityType,
    pinned: { readonly chain: ResearchChain; readonly reference: ResearchReference },
  ): Record<string, Outcome> {
    const resolve = (r: ResearchReference) =>
      r.entityId === pinned.chain.entityId ? pinned.chain : null;
    const command = create(referring, 'sistani', { references: [pinned.reference] });
    const created = run(SCHOLAR, null, command, resolve);
    const result: Record<string, Outcome> = { create: outcomeOf(created) };
    // REVISE of an existing draft with the same reference.
    const plain = applied(run(SCHOLAR, null, create(referring)));
    result.revise = outcomeOf(
      run(SCHOLAR, plain, revise({ references: [pinned.reference] }), resolve),
    );
    if (created.status !== 'APPLIED') return result;
    const steps =
      referring === 'FINDING'
        ? ['VERIFIED', 'APPROVED']
        : referring === 'TRANSLATION'
          ? ['REVIEWED']
          : referring === 'RULING'
            ? ['APPROVED']
            : ['VERIFIED'];
    // Approval-type steps in order; stops at the first refusal (later steps never run).
    let chain = created.chain;
    for (const kind of steps) {
      const outcome = run(SCHOLAR, chain, transition(kind), resolve);
      result[kind] = outcomeOf(outcome);
      if (outcome.status !== 'APPLIED') break;
      chain = outcome.chain;
    }
    return result;
  }

  const VERIFIED_PASSAGE = ['VERIFIED'];

  it('a terminal or invalid transition keeps its own code even when the record has references', () => {
    const pinned = target('SOURCE', ['VERIFIED'], ['DISPUTED']);
    const resolve = (r: ResearchReference) =>
      r.entityId === pinned.chain.entityId ? pinned.chain : null;
    const draft = applied(
      run(SCHOLAR, null, create('PASSAGE', 'sistani', { references: [pinned.reference] }), resolve),
    );
    const deleted = applied(run(SCHOLAR, draft, transition('DRAFT_DELETED', 'TEST reason')));
    // Without a resolver and with a disputed reference: the lifecycle refusal comes first.
    expect(outcomeOf(run(SCHOLAR, deleted, transition('VERIFIED')))).toBe('CHAIN_TERMINAL');
    expect(outcomeOf(run(SCHOLAR, deleted, transition('VERIFIED'), resolve))).toBe(
      'CHAIN_TERMINAL',
    );
    // A permitted transition still gets the reference check.
    expect(outcomeOf(run(SCHOLAR, draft, transition('VERIFIED')))).toBe('REFERENCES_UNRESOLVED');
    expect(outcomeOf(run(SCHOLAR, draft, transition('VERIFIED'), resolve))).toBe(
      'REFERENCE_DISPUTED',
    );
  });

  it('a clean pinned revision passes drafting, verification and approval', () => {
    expect(exercise('FINDING', target('PASSAGE', VERIFIED_PASSAGE, []))).toEqual({
      create: ok,
      revise: ok,
      VERIFIED: ok,
      APPROVED: ok,
    });
    expect(exercise('TRANSLATION', target('PASSAGE', VERIFIED_PASSAGE, []))).toEqual({
      create: ok,
      revise: ok,
      REVIEWED: ok,
    });
  });

  it('SUPERSEDED alone never invalidates a pinned revision (historical references stay valid)', () => {
    expect(exercise('FINDING', target('PASSAGE', VERIFIED_PASSAGE, ['SUPERSEDED']))).toEqual({
      create: ok,
      revise: ok,
      VERIFIED: ok,
      APPROVED: ok,
    });
    const approvedFinding = target('FINDING', ['VERIFIED', 'APPROVED'], ['SUPERSEDED']);
    expect(exercise('RULING', approvedFinding)).toEqual({ create: ok, revise: ok, APPROVED: ok });
  });

  it('DISPUTED after the pin blocks verification and approval, even once superseded', () => {
    for (const after of [['DISPUTED'], ['DISPUTED', 'SUPERSEDED']]) {
      expect(exercise('FINDING', target('PASSAGE', VERIFIED_PASSAGE, after)), after.join()).toEqual(
        {
          create: ok,
          revise: ok,
          VERIFIED: 'REFERENCE_DISPUTED',
        },
      );
      expect(exercise('TRANSLATION', target('PASSAGE', VERIFIED_PASSAGE, after))).toEqual({
        create: ok,
        revise: ok,
        REVIEWED: 'REFERENCE_DISPUTED',
      });
    }
    expect(exercise('FINDING', target('TRANSLATION', ['REVIEWED'], ['DISPUTED']))).toEqual({
      create: ok,
      revise: ok,
      VERIFIED: 'REFERENCE_DISPUTED',
    });
  });

  it('WITHDRAWN after the pin blocks approval', () => {
    expect(exercise('RULING', target('FINDING', ['VERIFIED', 'APPROVED'], ['WITHDRAWN']))).toEqual({
      create: ok,
      revise: ok,
      APPROVED: 'REFERENCE_WITHDRAWN',
    });
  });

  it('DELETED targets are refused at every phase, including drafting', () => {
    expect(exercise('FINDING', target('PASSAGE', [], ['DRAFT_DELETED']))).toEqual({
      create: 'REFERENCE_DELETED',
      revise: 'REFERENCE_DELETED',
    });
    // A draft citing it before deletion cannot be verified afterwards.
    const passage = applied(run(SCHOLAR, null, create('PASSAGE')));
    const finding = applied(
      run(
        SCHOLAR,
        null,
        create('FINDING', 'sistani', { references: [refTo(passage, 0)] }),
        resolveAll,
      ),
    );
    applied(run(SCHOLAR, passage, transition('DRAFT_DELETED', 'TEST duplicate')));
    expect(refusal(run(SCHOLAR, finding, transition('VERIFIED'), resolveAll))).toEqual([
      'REFERENCE_DELETED',
    ]);
  });

  it('a pin to a revision outside the required state never passes, whatever happened since', () => {
    // Pinned to the DRAFT content, later verified: the pinned revision itself was never verified.
    expect(exercise('FINDING', target('PASSAGE', [], ['VERIFIED']))).toEqual({
      create: ok,
      revise: ok,
      VERIFIED: 'REFERENCE_STATE_INVALID',
    });
    // Pinned to the dispute revision itself, or to an approved finding's withdrawal.
    expect(exercise('FINDING', target('PASSAGE', ['VERIFIED', 'DISPUTED'], []))).toEqual({
      create: ok,
      revise: ok,
      VERIFIED: 'REFERENCE_STATE_INVALID',
    });
    expect(
      exercise('RULING', target('FINDING', ['VERIFIED', 'APPROVED', 'WITHDRAWN'], [])),
    ).toEqual({
      create: ok,
      revise: ok,
      APPROVED: 'REFERENCE_STATE_INVALID',
    });
    // A finding pinned while VERIFIED (not APPROVED) cannot support a ruling.
    expect(exercise('RULING', target('FINDING', ['VERIFIED'], ['APPROVED']))).toEqual({
      create: ok,
      revise: ok,
      APPROVED: 'REFERENCE_STATE_INVALID',
    });
  });

  it('an older pinned revision stays valid when the target gained newer revisions later', () => {
    // The finding was approved at revision 2; later revisions (superseded) do not move the pin.
    const finding = target('FINDING', ['VERIFIED', 'APPROVED'], ['SUPERSEDED']);
    expect(finding.reference.revision).toBe(2);
    expect(finding.chain.records).toHaveLength(4);
    expect(exercise('RULING', finding)).toEqual({ create: ok, revise: ok, APPROVED: ok });
  });

  it('a dispute between verification and approval blocks approval', () => {
    let passage = applied(run(SCHOLAR, null, create('PASSAGE')));
    passage = applied(run(SCHOLAR, passage, transition('VERIFIED')));
    const reference = refTo(passage, 1);
    let finding = applied(
      run(SCHOLAR, null, create('FINDING', 'sistani', { references: [reference] }), resolveAll),
    );
    finding = applied(run(SCHOLAR, finding, transition('VERIFIED'), resolveAll));
    applied(run(SCHOLAR, passage, transition('DISPUTED', 'TEST dispute')));
    expect(refusal(run(SCHOLAR, finding, transition('APPROVED'), resolveAll))).toEqual([
      'REFERENCE_DISPUTED',
    ]);
  });
});
