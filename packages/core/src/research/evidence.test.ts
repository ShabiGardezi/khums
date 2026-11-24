import { describe, expect, it } from 'vitest';

import type { ResearchChain, ResearchReference, VerifiedPrincipal } from '@khums/shared-types';
import { PASSAGE_TEXT_MAX } from '@khums/validation';

import { ALL, marjaScope, NOW, principal, shift } from '../authorization/test-support';
import { appendResearchRevision, replayResearchChain } from './chain';
import {
  checkEvidenceContent,
  decideEvidenceAttachment,
  evidenceReadDecision,
  executeEvidenceCommand,
  type EvidenceCommandOutcome,
} from './evidence';
import { formatUuidV7, researchDisplayRef } from './ids';
import type { RulingSeriesInput } from './rulings';

/**
 * The evidence layer (M5.3.3): sources, passages, translations and evidence attachment. SYNTHETIC
 * placeholder content only: no real source, excerpt, translation or ruling.
 */

let seq = 0;
const uuid = () => {
  seq += 1;
  const random = new Uint8Array(10);
  random[9] = seq;
  random[8] = seq >> 8;
  return formatUuidV7(Date.parse('2026-11-22T12:00:00.000Z') + seq, random);
};

const SCHOLAR = principal('test-scholar', {
  roles: [['GOVERNING_SCHOLAR', marjaScope('sistani')]],
});
const OUTSIDER = principal('test-outsider', {
  roles: [['GOVERNING_SCHOLAR', marjaScope('khamenei')]],
});
const RESEARCHER = principal('test-researcher', {
  roles: [['RELIGIOUS_RESEARCHER', marjaScope('sistani')]],
});
const ADMIN = principal('test-admin', { roles: [['SUPER_ADMIN', ALL]] });
const AUDITOR = principal('test-auditor', { roles: [['AUDITOR', ALL]] });

const SOURCE = {
  title: { original: 'TEST source title', translation: null },
  originalLanguage: 'ar',
  sourceClass: 'REFERENCE',
  sourceTier: 4,
  publisher: null,
  edition: null,
  publicationDate: { original: null, gregorian: null },
  url: null,
  authorship: { statedAuthor: null, establishedBy: null, status: 'UNVERIFIED' },
  authenticity: { status: 'UNVERIFIED', compareWith: [] },
  accessStatus: 'NOT_YET_ACCESSED',
  copyright: 'EXCERPTS_ONLY',
  canonicalForMarja: 'UNDECIDED',
  notes: null,
};
const PASSAGE = {
  locator: { volume: null, page: '12', masalah: null, istiftaId: null, section: null, url: null },
  originalLanguage: 'ar',
  text: 'TEST excerpt placeholder',
  precautionWording: null,
  notes: null,
};
const TRANSLATION = {
  language: 'en',
  text: 'TEST translation placeholder',
  translator: 'test-translator',
  notes: null,
};

const store = new Map<string, ResearchChain>();
const resolve = (r: ResearchReference) => store.get(r.entityId) ?? null;
/** Every stored version of a ruling series (what the API loads by `rulingSeriesId`). */
const seriesOf = (seriesId: string) =>
  [...store.values()].filter((c) => c.records[0]?.rulingSeriesId === seriesId);

let tick = 0;
function run(
  who: VerifiedPrincipal,
  chain: ResearchChain | null,
  command: Record<string, unknown>,
  rulingSeries?: RulingSeriesInput,
): EvidenceCommandOutcome {
  const seriesId = chain?.records[0]?.rulingSeriesId;
  tick += 1;
  const withRevision =
    chain !== null && command.type !== 'CREATE' && !('expectedRevision' in command)
      ? { ...command, expectedRevision: chain.records.length }
      : command;
  return executeEvidenceCommand({
    principal: who,
    chain,
    command: withRevision,
    context: {
      decisionId: `d-${String(tick)}`,
      evaluatedAt: shift(NOW, tick),
      session: { sessionId: who.session.sessionId, state: 'ACTIVE' },
      requestId: `r-${String(tick)}`,
    },
    resolve,
    ...(rulingSeries !== undefined
      ? { rulingSeries }
      : seriesId !== undefined
        ? { rulingSeries: { correcting: null, versions: seriesOf(seriesId) } }
        : {}),
  });
}
function applied(outcome: EvidenceCommandOutcome): ResearchChain {
  if (outcome.status !== 'APPLIED') {
    throw new Error(
      `expected APPLIED, got ${outcome.status} ${JSON.stringify(
        outcome.status === 'REFUSED' ? outcome.issues : outcome.decision,
      )}`,
    );
  }
  store.set(outcome.chain.entityId, outcome.chain);
  if (outcome.superseded) store.set(outcome.superseded.chain.entityId, outcome.superseded.chain);
  return outcome.chain;
}
const refusal = (outcome: EvidenceCommandOutcome) =>
  outcome.status === 'REFUSED' ? outcome.issues : outcome.status;
const denial = (outcome: EvidenceCommandOutcome) =>
  outcome.status === 'DENIED' && !outcome.decision.allowed
    ? outcome.decision.reason
    : outcome.status;
const create = (entityType: string, payload: unknown, references: unknown[] = []) => ({
  type: 'CREATE',
  entityType,
  entityId: uuid(),
  marjaId: 'sistani',
  rulingVersion: entityType === 'RULING' ? 1 : null,
  questionId: entityType === 'FINDING' ? 'INC-01' : null,
  payload,
  references,
  aiInvolvement: [],
});
const revise = (payload: unknown, references: unknown[] = []) => ({
  type: 'REVISE',
  payload,
  references,
  aiInvolvement: [],
});
const transition = (kind: string, reason: string | null = null) => ({
  type: 'TRANSITION',
  kind,
  reason,
});
const refTo = (chain: ResearchChain, revision: number): ResearchReference => ({
  entityType: chain.entityType,
  entityId: chain.entityId,
  revision,
  rulingVersion: chain.records[0]?.rulingVersion ?? null,
  marjaId: chain.records[0]?.marjaId ?? 'sistani',
});
const stateOf = (chain: ResearchChain) => {
  const view = replayResearchChain(chain);
  return view.ok ? view.value.state : 'INVALID';
};

describe('evidence layer: one scholar from source to reviewed translations', () => {
  it('records and verifies a source and a passage, then reviews separate en and ur translations', () => {
    let source = applied(run(SCHOLAR, null, create('SOURCE', SOURCE)));
    source = applied(run(SCHOLAR, source, transition('VERIFIED')));
    let passage = applied(run(SCHOLAR, null, create('PASSAGE', PASSAGE, [refTo(source, 1)])));
    passage = applied(run(SCHOLAR, passage, transition('VERIFIED')));
    for (const language of ['en', 'ur']) {
      let translation = applied(
        run(
          SCHOLAR,
          null,
          create('TRANSLATION', { ...TRANSLATION, language }, [refTo(passage, 1)]),
        ),
      );
      translation = applied(run(SCHOLAR, translation, transition('REVIEWED')));
      expect(stateOf(translation)).toBe('REVIEWED');
      // The translation is its own record; the passage text is untouched.
      expect(translation.records[0]?.payload).not.toHaveProperty('locator');
    }
    expect(passage.records[0]?.payload).toEqual(PASSAGE);
  });

  it('only the in-scope governing scholar (or SUPER_ADMIN) may create, verify or review', () => {
    // Decision 64: SUPER_ADMIN holds every research permission (formerly MISSING_PERMISSION).
    expect(denial(run(ADMIN, null, create('SOURCE', SOURCE)))).toBe('APPLIED');
    for (const who of [RESEARCHER, AUDITOR]) {
      expect(denial(run(who, null, create('SOURCE', SOURCE)))).toBe('MISSING_PERMISSION');
    }
    expect(denial(run(OUTSIDER, null, create('SOURCE', SOURCE)))).toBe('OUT_OF_SCOPE');
    const source = applied(run(SCHOLAR, null, create('SOURCE', SOURCE)));
    for (const who of [RESEARCHER, AUDITOR]) {
      expect(denial(run(who, source, transition('VERIFIED')))).toBe('MISSING_PERMISSION');
    }
    expect(denial(run(OUTSIDER, source, transition('VERIFIED')))).toBe('OUT_OF_SCOPE');
  });
});

describe('evidence content rules', () => {
  it('validates each payload against its schema (original and translation stay separate)', () => {
    expect(refusal(run(SCHOLAR, null, create('SOURCE', { placeholder: 'x' })))).toEqual([
      'CONTENT_INVALID',
    ]);
    const source = applied(run(SCHOLAR, null, create('SOURCE', SOURCE)));
    const passage = applied(run(SCHOLAR, null, create('PASSAGE', PASSAGE, [refTo(source, 0)])));
    for (const bad of [
      { ...TRANSLATION, language: 'fr' },
      { ...TRANSLATION, originalText: 'TEST original copied in' },
      { ...TRANSLATION, text: '   ' },
    ]) {
      expect(refusal(run(SCHOLAR, null, create('TRANSLATION', bad, [refTo(passage, 0)])))).toEqual([
        'CONTENT_INVALID',
      ]);
    }
    for (const bad of [
      { ...PASSAGE, text: 'x'.repeat(PASSAGE_TEXT_MAX + 1) },
      { ...PASSAGE, locator: { ...PASSAGE.locator, page: null } },
      { ...PASSAGE, translation: 'TEST translation inside the original' },
    ]) {
      expect(refusal(run(SCHOLAR, null, create('PASSAGE', bad, [refTo(source, 0)])))).toEqual([
        'CONTENT_INVALID',
      ]);
    }
  });

  it('enforces the reference shape of each entity type', () => {
    const source = applied(run(SCHOLAR, null, create('SOURCE', SOURCE)));
    const other = applied(run(SCHOLAR, null, create('SOURCE', SOURCE)));
    expect(refusal(run(SCHOLAR, null, create('PASSAGE', PASSAGE)))).toEqual([
      'SOURCE_REFERENCE_REQUIRED',
    ]);
    expect(
      refusal(run(SCHOLAR, null, create('PASSAGE', PASSAGE, [refTo(source, 0), refTo(other, 0)]))),
    ).toEqual(['SOURCE_REFERENCE_REQUIRED']);
    expect(refusal(run(SCHOLAR, null, create('TRANSLATION', TRANSLATION)))).toEqual([
      'PASSAGE_REFERENCE_REQUIRED',
    ]);
    // A source may not cite anything (the generic type rules refuse it first).
    expect(refusal(run(SCHOLAR, null, create('SOURCE', SOURCE, [refTo(other, 0)])))).toEqual([
      'REFERENCE_TYPE_INVALID',
    ]);
    expect(checkEvidenceContent('SOURCE', SOURCE, [refTo(other, 0)], null)).toEqual([
      'REFERENCES_NOT_ALLOWED',
    ]);
  });

  it('keeps a passage on its source and a translation on its passage and language', () => {
    let source = applied(run(SCHOLAR, null, create('SOURCE', SOURCE)));
    const other = applied(run(SCHOLAR, null, create('SOURCE', SOURCE)));
    let passage = applied(run(SCHOLAR, null, create('PASSAGE', PASSAGE, [refTo(source, 0)])));
    expect(refusal(run(SCHOLAR, passage, revise(PASSAGE, [refTo(other, 0)])))).toEqual([
      'BINDING_CHANGED',
    ]);
    // Re-pinning a newer revision of the SAME source is allowed.
    source = applied(run(SCHOLAR, source, transition('VERIFIED')));
    passage = applied(run(SCHOLAR, passage, revise(PASSAGE, [refTo(source, 1)])));
    const otherPassage = applied(
      run(SCHOLAR, null, create('PASSAGE', PASSAGE, [refTo(source, 1)])),
    );
    const translation = applied(
      run(SCHOLAR, null, create('TRANSLATION', TRANSLATION, [refTo(passage, 1)])),
    );
    expect(
      refusal(
        run(SCHOLAR, translation, revise({ ...TRANSLATION, language: 'ur' }, [refTo(passage, 1)])),
      ),
    ).toEqual(['BINDING_CHANGED']);
    expect(
      refusal(run(SCHOLAR, translation, revise(TRANSLATION, [refTo(otherPassage, 0)]))),
    ).toEqual(['BINDING_CHANGED']);
    expect(
      run(
        SCHOLAR,
        translation,
        revise({ ...TRANSLATION, text: 'TEST revised' }, [refTo(passage, 1)]),
      ).status,
    ).toBe('APPLIED');
  });

  it('keeps the generic rules: stale revisions, AI review and reference states', () => {
    const source = applied(run(SCHOLAR, null, create('SOURCE', SOURCE)));
    expect(
      refusal(run(SCHOLAR, source, { ...transition('VERIFIED'), expectedRevision: 3 })),
    ).toEqual(['REVISION_CONFLICT']);
    // A passage citing the DRAFT source revision cannot be verified.
    const passage = applied(run(SCHOLAR, null, create('PASSAGE', PASSAGE, [refTo(source, 0)])));
    expect(refusal(run(SCHOLAR, passage, transition('VERIFIED')))).toEqual([
      'REFERENCE_STATE_INVALID',
    ]);
    // A machine-drafted translation of a verified passage still needs the scholar's AI review.
    const verifiedSource = applied(
      run(SCHOLAR, applied(run(SCHOLAR, null, create('SOURCE', SOURCE))), transition('VERIFIED')),
    );
    const verifiedPassage = applied(
      run(
        SCHOLAR,
        applied(run(SCHOLAR, null, create('PASSAGE', PASSAGE, [refTo(verifiedSource, 1)]))),
        transition('VERIFIED'),
      ),
    );
    const machineDraft = applied(
      run(SCHOLAR, null, {
        ...create('TRANSLATION', TRANSLATION, [refTo(verifiedPassage, 1)]),
        aiInvolvement: [
          {
            assistance: 'TRANSLATION_DRAFT',
            field: 'payload.text',
            generation: 'AI_GENERATED',
            tool: 'test-tool',
            occurredAt: '2026-11-22T11:00:00.000Z',
            scholarReview: 'NOT_REVIEWED',
          },
        ],
      }),
    );
    expect(refusal(run(SCHOLAR, machineDraft, transition('REVIEWED')))).toEqual([
      'AI_REVIEW_REQUIRED',
    ]);
  });
});

describe('evidence attachment (D3, D10)', () => {
  const file = (overrides: Record<string, unknown> = {}) => ({
    artefactId: uuid(),
    digest: 'a'.repeat(64),
    size: 1234,
    mediaType: 'image/png' as const,
    copyright: 'EXCERPTS_ONLY' as const,
    extent: 'EXCERPT' as const,
    description: 'TEST screenshot of a page',
    ...overrides,
  });
  const attach = (who: VerifiedPrincipal, sourceChain: unknown, overrides = {}) => {
    tick += 1;
    return decideEvidenceAttachment({
      principal: who,
      sourceChain,
      context: {
        decisionId: `d-${String(tick)}`,
        evaluatedAt: shift(NOW, tick),
        session: { sessionId: who.session.sessionId, state: 'ACTIVE' },
        requestId: `r-${String(tick)}`,
      },
      file: file(overrides),
    });
  };

  it('returns write-once metadata bound to the source, its Marja and revision', () => {
    const source = applied(run(SCHOLAR, null, create('SOURCE', SOURCE)));
    const outcome = attach(SCHOLAR, source);
    expect(outcome.status).toBe('APPLIED');
    if (outcome.status !== 'APPLIED') return;
    expect(outcome.artefact).toMatchObject({
      marjaId: 'sistani',
      sourceId: source.entityId,
      sourceRevision: 0,
      storageKey: `sistani/${'a'.repeat(64)}`,
      recordedBy: 'test-scholar',
      extent: 'EXCERPT',
    });
  });

  it('only the in-scope governing scholar (or SUPER_ADMIN, decision 64) may attach evidence', () => {
    const source = applied(run(SCHOLAR, null, create('SOURCE', SOURCE)));
    expect(attach(ADMIN, source).status).toBe('APPLIED');
    for (const who of [RESEARCHER, AUDITOR]) {
      const outcome = attach(who, source);
      expect(
        outcome.status === 'DENIED' && !outcome.decision.allowed && outcome.decision.reason,
      ).toBe('MISSING_PERMISSION');
    }
    const outsider = attach(OUTSIDER, source);
    expect(
      outsider.status === 'DENIED' && !outsider.decision.allowed && outsider.decision.reason,
    ).toBe('OUT_OF_SCOPE');
    expect(attach(SCHOLAR, { not: 'a chain' }).status).toBe('DENIED');
  });

  it('stores complete documents only with permission on the file and the source', () => {
    const restricted = applied(run(SCHOLAR, null, create('SOURCE', SOURCE)));
    const permitted = applied(
      run(SCHOLAR, null, create('SOURCE', { ...SOURCE, copyright: 'PERMITTED' })),
    );
    const refusedIssues = (o: ReturnType<typeof attach>) =>
      o.status === 'REFUSED' ? o.issues : o.status;
    expect(
      refusedIssues(attach(SCHOLAR, restricted, { extent: 'COMPLETE', copyright: 'PERMITTED' })),
    ).toEqual(['COPYRIGHT_FORBIDS_COMPLETE']);
    expect(refusedIssues(attach(SCHOLAR, permitted, { extent: 'COMPLETE' }))).toEqual([
      'COPYRIGHT_FORBIDS_COMPLETE',
    ]);
    expect(attach(SCHOLAR, permitted, { extent: 'COMPLETE', copyright: 'PERMITTED' }).status).toBe(
      'APPLIED',
    );
  });

  it('refuses deleted or superseded sources and invalid sizes', () => {
    const source = applied(run(SCHOLAR, null, create('SOURCE', SOURCE)));
    const deleted = applied(run(SCHOLAR, source, transition('DRAFT_DELETED', 'TEST duplicate')));
    const refusedIssues = (o: ReturnType<typeof attach>) =>
      o.status === 'REFUSED' ? o.issues : o.status;
    expect(refusedIssues(attach(SCHOLAR, deleted))).toEqual(['SOURCE_STATE_INVALID']);
    const live = applied(run(SCHOLAR, null, create('SOURCE', SOURCE)));
    for (const size of [0, 2 * 1024 * 1024 + 1, 1.5]) {
      expect(refusedIssues(attach(SCHOLAR, live, { size }))).toEqual(['EVIDENCE_SIZE_INVALID']);
    }
    expect(refusedIssues(attach(SCHOLAR, live, { digest: 'not-a-digest' }))).toEqual([
      'EVIDENCE_INVALID',
    ]);
  });

  it('lets research readers read evidence (any Marja for scholars), never auditors', () => {
    const context = (who: VerifiedPrincipal) => ({
      decisionId: 'd-read',
      evaluatedAt: shift(NOW, 1),
      session: { sessionId: who.session.sessionId, state: 'ACTIVE' },
    });
    expect(evidenceReadDecision(SCHOLAR, 'sistani', context(SCHOLAR)).allowed).toBe(true);
    for (const who of [AUDITOR, RESEARCHER]) {
      expect(evidenceReadDecision(who, 'sistani', context(who)).allowed).toBe(false);
    }
    // Decision 64: SUPER_ADMIN reads everything, and a scholar of another Marja may read research
    // (read-only) — formerly both were refused.
    for (const who of [ADMIN, OUTSIDER]) {
      expect(evidenceReadDecision(who, 'sistani', context(who)).allowed).toBe(true);
    }
  });
});

// ---- M5.3.4: findings and first-version rulings ----

const FINDING = {
  language: 'en',
  scenario: null,
  conclusion: 'TEST conclusion placeholder',
  explanation: 'TEST explanation placeholder',
  precaution: 'UNDETERMINED',
  conditions: ['TEST condition'],
  exceptions: [],
  qualifications: [],
  unresolvedIssues: ['TEST open question?'],
  notes: null,
};
const RULING = {
  language: 'en',
  conclusion: 'TEST ruling conclusion placeholder',
  explanation: 'TEST ruling explanation placeholder',
  precaution: 'UNDETERMINED',
  conditions: [],
  exceptions: [],
  notes: null,
};

describe('findings and rulings (M5.3.4, D14)', () => {
  /** A VERIFIED source, a VERIFIED passage of it (revision 1) and a REVIEWED translation. */
  function material(marjaId = 'sistani', who = SCHOLAR) {
    const inMarja = (c: Record<string, unknown>) => ({ ...c, marjaId });
    const source = applied(
      run(who, applied(run(who, null, inMarja(create('SOURCE', SOURCE)))), transition('VERIFIED')),
    );
    const draftPassage = applied(
      run(who, null, inMarja(create('PASSAGE', PASSAGE, [refTo(source, 1)]))),
    );
    const passage = applied(run(who, draftPassage, transition('VERIFIED')));
    const draftTranslation = applied(
      run(who, null, inMarja(create('TRANSLATION', TRANSLATION, [refTo(passage, 1)]))),
    );
    const translation = applied(run(who, draftTranslation, transition('REVIEWED')));
    return { source, passage, translation };
  }
  const finding = (references: unknown[], overrides: Record<string, unknown> = {}) =>
    run(SCHOLAR, null, { ...create('FINDING', FINDING, references), ...overrides });

  it('creates a finding for a catalogue question with exact passage and translation pins', () => {
    const { passage, translation } = material();
    const created = applied(finding([refTo(passage, 1), refTo(translation, 1)]));
    const view = replayResearchChain(created);
    expect(view.ok && view.value.question).toEqual({
      id: 'INC-01',
      catalogueRevision: 'research-matrix-rev5-required',
    });
    for (const questionId of ['INC-08', 'ADJ-01', 'SUR-12']) {
      expect(refusal(finding([refTo(passage, 1)], { questionId }))).toEqual(['QUESTION_UNKNOWN']);
    }
    expect(refusal(finding([refTo(passage, 1)], { questionId: 'CTQ-08' }))).toEqual('APPLIED');
  });

  it('requires one or more passages and never accepts a source citation (D14)', () => {
    const { source, passage, translation } = material();
    expect(refusal(finding([]))).toEqual(['PASSAGE_REFERENCE_REQUIRED']);
    expect(refusal(finding([refTo(translation, 1)]))).toEqual(['PASSAGE_REFERENCE_REQUIRED']);
    expect(refusal(finding([refTo(source, 1), refTo(passage, 1)]))).toEqual([
      'REFERENCE_TYPE_INVALID',
    ]);
    expect(
      refusal(finding([refTo(passage, 1)], { payload: { ...FINDING, conclusion: '' } })),
    ).toEqual(['CONTENT_INVALID']);
  });

  it('accepts a translation only when it translates a cited passage revision', () => {
    const one = material();
    const other = material();
    expect(refusal(finding([refTo(one.passage, 1), refTo(other.translation, 1)]))).toEqual([
      'TRANSLATION_PASSAGE_NOT_CITED',
    ]);
    // Same passage pinned to the same content (DRAFT revision 0 and VERIFIED revision 1): accepted.
    expect(refusal(finding([refTo(one.passage, 0), refTo(one.translation, 1)]))).toEqual('APPLIED');
    // A translation of an earlier content revision of the passage is a different text: refused.
    const draft = applied(run(SCHOLAR, null, create('PASSAGE', PASSAGE, [refTo(one.source, 1)])));
    const old = applied(run(SCHOLAR, null, create('TRANSLATION', TRANSLATION, [refTo(draft, 0)])));
    const revised = applied(
      run(
        SCHOLAR,
        draft,
        revise({ ...PASSAGE, text: 'TEST corrected excerpt' }, [refTo(one.source, 1)]),
      ),
    );
    expect(refusal(finding([refTo(revised, 1), refTo(old, 0)]))).toEqual([
      'TRANSLATION_PASSAGE_NOT_CITED',
    ]);
    // Revising a finding keeps the rule.
    const created = applied(finding([refTo(one.passage, 1)]));
    expect(
      refusal(
        run(
          SCHOLAR,
          created,
          revise(FINDING, [refTo(one.passage, 1), refTo(other.translation, 1)]),
        ),
      ),
    ).toEqual(['TRANSLATION_PASSAGE_NOT_CITED']);
  });

  it('lets the same scholar verify and approve; approval needs verified passages and reviewed translations', () => {
    const { source, passage, translation } = material();
    const draftPassage = applied(
      run(SCHOLAR, null, create('PASSAGE', PASSAGE, [refTo(source, 1)])),
    );
    const onDraft = applied(finding([refTo(draftPassage, 0)]));
    expect(refusal(run(SCHOLAR, onDraft, transition('VERIFIED')))).toEqual([
      'REFERENCE_STATE_INVALID',
    ]);
    const draftTranslation = applied(
      run(SCHOLAR, null, create('TRANSLATION', TRANSLATION, [refTo(passage, 1)])),
    );
    const withDraftTranslation = applied(finding([refTo(passage, 1), refTo(draftTranslation, 0)]));
    expect(refusal(run(SCHOLAR, withDraftTranslation, transition('VERIFIED')))).toEqual([
      'REFERENCE_STATE_INVALID',
    ]);

    const created = applied(finding([refTo(passage, 1), refTo(translation, 1)]));
    const verified = applied(run(SCHOLAR, created, transition('VERIFIED')));
    const approved = applied(run(SCHOLAR, verified, transition('APPROVED')));
    const view = replayResearchChain(approved);
    expect(view.ok && view.value.state).toBe('APPROVED');
    // Every revision is kept with its actor and time; the approved content is frozen.
    expect(approved.records.map((r) => [r.kind, r.actor.subject])).toEqual([
      ['CREATED', 'test-scholar'],
      ['VERIFIED', 'test-scholar'],
      ['APPROVED', 'test-scholar'],
    ]);
    expect(approved.records.every((r) => r.recordedAt.length > 0)).toBe(true);
    expect(refusal(run(SCHOLAR, approved, revise(FINDING, [refTo(passage, 1)])))).toEqual([
      'INVALID_TRANSITION',
    ]);
    expect(refusal(run(SCHOLAR, approved, transition('DRAFT_DELETED', 'TEST reason')))).toEqual([
      'INVALID_TRANSITION',
    ]);
    expect(
      refusal(
        run(SCHOLAR, approved, { ...transition('WITHDRAWN', 'TEST reason'), expectedRevision: 2 }),
      ),
    ).toEqual(['REVISION_CONFLICT']);
    expect(refusal(run(SCHOLAR, approved, transition('WITHDRAWN', 'TEST reason')))).toEqual(
      'APPLIED',
    );
  });

  it('gives findings and rulings to the Marja’s governing scholar only (and SUPER_ADMIN)', () => {
    const { passage } = material();
    // Decision 64: SUPER_ADMIN is no longer in this list (it holds every research permission).
    for (const who of [RESEARCHER, AUDITOR, OUTSIDER]) {
      expect(denial(run(who, null, create('FINDING', FINDING, [refTo(passage, 1)])))).not.toBe(
        'APPLIED',
      );
      expect(denial(run(who, null, create('RULING', RULING, [refTo(passage, 1)])))).not.toBe(
        'APPLIED',
      );
    }
    const created = applied(finding([refTo(passage, 1)]));
    const verified = applied(run(SCHOLAR, created, transition('VERIFIED')));
    for (const who of [RESEARCHER, AUDITOR, OUTSIDER]) {
      expect(run(who, verified, transition('APPROVED')).status).toBe('DENIED');
    }
    expect(run(ADMIN, verified, transition('APPROVED')).status).toBe('APPLIED');
  });

  it('keeps Marjas apart: no finding or ruling cites another Marja’s research', () => {
    const sistani = material();
    const khamenei = material('khamenei', OUTSIDER);
    const crossFinding = run(OUTSIDER, null, {
      ...create('FINDING', FINDING, [{ ...refTo(sistani.passage, 1), marjaId: 'khamenei' }]),
      marjaId: 'khamenei',
    });
    expect(refusal(crossFinding)).toEqual(['REFERENCE_OTHER_MARJA']);
    const own = applied(
      run(OUTSIDER, null, {
        ...create('FINDING', FINDING, [refTo(khamenei.passage, 1)]),
        marjaId: 'khamenei',
      }),
    );
    expect(own.records[0]?.marjaId).toBe('khamenei');
    expect(
      refusal(
        run(SCHOLAR, null, create('RULING', RULING, [refTo(own, 0), refTo(sistani.passage, 1)])),
      ),
    ).toEqual(['REFERENCE_OTHER_MARJA']);
  });

  it('creates rulings from approved findings and passages; approves, withdraws', () => {
    const { passage, translation } = material();
    const draftFinding = applied(finding([refTo(passage, 1)]));
    expect(refusal(run(SCHOLAR, null, create('RULING', RULING, [refTo(passage, 1)])))).toEqual([
      'FINDING_REFERENCE_REQUIRED',
    ]);
    expect(refusal(run(SCHOLAR, null, create('RULING', RULING, [refTo(draftFinding, 0)])))).toEqual(
      ['PASSAGE_REFERENCE_REQUIRED'],
    );
    // A ruling on an unapproved finding can be drafted but never approved.
    const early = applied(
      run(SCHOLAR, null, create('RULING', RULING, [refTo(draftFinding, 0), refTo(passage, 1)])),
    );
    expect(refusal(run(SCHOLAR, early, transition('APPROVED')))).toEqual([
      'REFERENCE_STATE_INVALID',
    ]);

    const approvedFinding = applied(
      run(
        SCHOLAR,
        applied(run(SCHOLAR, draftFinding, transition('VERIFIED'))),
        transition('APPROVED'),
      ),
    );
    const ruling = applied(
      run(
        SCHOLAR,
        null,
        create('RULING', RULING, [
          refTo(approvedFinding, 2),
          refTo(passage, 1),
          refTo(translation, 1),
        ]),
      ),
    );
    const approved = applied(run(SCHOLAR, ruling, transition('APPROVED')));
    const view = replayResearchChain(approved);
    expect(view.ok && [view.value.state, view.value.rulingVersion]).toEqual(['APPROVED', 1]);
    expect(
      refusal(
        run(SCHOLAR, approved, revise(RULING, [refTo(approvedFinding, 2), refTo(passage, 1)])),
      ),
    ).toEqual(['INVALID_TRANSITION']);
    expect(refusal(run(SCHOLAR, approved, transition('SUPERSEDED')))).toEqual([
      'RULING_SUPERSEDED_BY_APPROVAL',
    ]);
    expect(
      refusal(
        run(SCHOLAR, null, {
          ...create('RULING', RULING, [refTo(approvedFinding, 2), refTo(passage, 1)]),
          rulingVersion: 2,
        }),
      ),
    ).toEqual(['RULING_SERIES_INVALID']);
    expect(refusal(run(SCHOLAR, approved, transition('WITHDRAWN', 'TEST reason')))).toEqual(
      'APPLIED',
    );
  });
});

describe('ruling versions and supersession (M5.3.5)', () => {
  /** An APPROVED version 1 of a ruling, on an approved finding and a verified passage. */
  function approvedRuling() {
    const source = applied(
      run(SCHOLAR, applied(run(SCHOLAR, null, create('SOURCE', SOURCE))), transition('VERIFIED')),
    );
    const passage = applied(
      run(
        SCHOLAR,
        applied(run(SCHOLAR, null, create('PASSAGE', PASSAGE, [refTo(source, 1)]))),
        transition('VERIFIED'),
      ),
    );
    let finding = applied(run(SCHOLAR, null, create('FINDING', FINDING, [refTo(passage, 1)])));
    finding = applied(run(SCHOLAR, finding, transition('VERIFIED')));
    finding = applied(run(SCHOLAR, finding, transition('APPROVED')));
    const refs = [refTo(finding, 2), refTo(passage, 1)];
    const v1 = applied(
      run(
        SCHOLAR,
        applied(run(SCHOLAR, null, create('RULING', RULING, refs))),
        transition('APPROVED'),
      ),
    );
    return { v1, refs };
  }
  const correction = (
    of: ResearchChain,
    refs: unknown[],
    version: number,
    who = SCHOLAR,
    seriesId = of.records[0]?.rulingSeriesId ?? '',
  ) =>
    run(
      who,
      null,
      {
        ...create('RULING', { ...RULING, explanation: 'TEST corrected explanation' }, refs),
        rulingVersion: version,
      },
      { correcting: of.entityId, versions: seriesOf(seriesId) },
    );
  const state = (chain: ResearchChain | undefined) => {
    const view = chain === undefined ? null : replayResearchChain(chain);
    return view?.ok ? view.value.state : 'INVALID';
  };

  it('creates a correction as a new DRAFT version in the same series; version 1 is untouched', () => {
    const { v1, refs } = approvedRuling();
    const before = JSON.stringify(v1);
    const v2 = applied(correction(v1, refs, 2));
    expect(v2.entityId).not.toBe(v1.entityId);
    expect(v2.records[0]).toMatchObject({
      rulingVersion: 2,
      rulingSeriesId: v1.entityId,
      kind: 'CREATED',
    });
    expect(v1.records[0]?.rulingSeriesId).toBe(v1.entityId);
    expect(JSON.stringify(store.get(v1.entityId))).toBe(before);
    expect(state(store.get(v1.entityId))).toBe('APPROVED');
  });

  it('approving the correction supersedes the previous version in the same outcome', () => {
    const { v1, refs } = approvedRuling();
    const v1Records = JSON.stringify(v1.records);
    const v2 = applied(correction(v1, refs, 2));
    const outcome = run(SCHOLAR, v2, transition('APPROVED'));
    expect(outcome.status).toBe('APPLIED');
    if (outcome.status !== 'APPLIED') return;
    expect(outcome.superseded?.record).toMatchObject({
      entityId: v1.entityId,
      kind: 'SUPERSEDED',
      actor: { subject: 'test-scholar' },
    });
    applied(outcome);
    // The original version keeps every earlier record; one SUPERSEDED record is appended.
    const after = store.get(v1.entityId);
    expect(JSON.stringify(after?.records.slice(0, v1.records.length))).toBe(v1Records);
    expect([state(after), state(store.get(v2.entityId))]).toEqual(['SUPERSEDED', 'APPROVED']);
    const approvedVersions = seriesOf(v1.entityId).filter((c) => state(c) === 'APPROVED');
    expect(approvedVersions.map((c) => c.entityId)).toEqual([v2.entityId]);
  });

  it('never allows two current versions or two open corrections', () => {
    const { v1, refs } = approvedRuling();
    const v2 = applied(correction(v1, refs, 2));
    expect(refusal(correction(v1, refs, 3))).toEqual(['RULING_CORRECTION_NOT_ALLOWED']);
    expect(refusal(correction(v1, refs, 2))).toEqual(['RULING_CORRECTION_NOT_ALLOWED']);
    applied(run(SCHOLAR, v2, transition('APPROVED')));
    // The superseded version can no longer be corrected; the current one can, as version 3 only.
    expect(refusal(correction(v1, refs, 3))).toEqual(['RULING_CORRECTION_NOT_ALLOWED']);
    const current = store.get(v2.entityId) ?? v2;
    expect(refusal(correction(current, refs, 4))).toEqual(['RULING_VERSION_INVALID']);
    expect(refusal(correction(current, refs, 3))).toEqual('APPLIED');
    // A ruling is never superseded directly, and a forged series with two current versions fails.
    expect(refusal(run(SCHOLAR, current, transition('SUPERSEDED')))).toEqual([
      'RULING_SUPERSEDED_BY_APPROVAL',
    ]);
    // A stale or forged series (the old APPROVED copy of version 1 beside the current version 2)
    // is refused: core never sees two current versions as valid.
    const v3 = applied(correction(current, refs, 3));
    const stale = { correcting: null, versions: [v1, current, v3] };
    expect(refusal(run(SCHOLAR, v3, transition('APPROVED'), stale))).toEqual([
      'RULING_SERIES_INVALID',
    ]);
    expect(refusal(correction(current, refs, 3, SCHOLAR, 'x'))).toEqual(['RULING_SERIES_INVALID']);
  });

  it('refuses corrections of a draft, approval without the series, and a correction numbered 1', () => {
    const { v1, refs } = approvedRuling();
    const draft = applied(run(SCHOLAR, null, create('RULING', RULING, refs)));
    expect(refusal(correction(draft, refs, 2))).toEqual(['RULING_CORRECTION_NOT_ALLOWED']);
    expect(refusal(correction(v1, refs, 1))).toEqual(['RULING_VERSION_INVALID']);
    expect(
      refusal(run(SCHOLAR, draft, transition('APPROVED'), { correcting: null, versions: [] })),
    ).toEqual(['RULING_SERIES_INVALID']);
  });

  it('never approves a correction once the version it corrects is withdrawn (regression)', () => {
    const { v1, refs } = approvedRuling();
    const v2 = applied(correction(v1, refs, 2));
    const withdrawn = applied(run(SCHOLAR, v1, transition('WITHDRAWN', 'TEST reason')));
    const v1Before = JSON.stringify(withdrawn);
    const v2Before = JSON.stringify(v2);
    expect(refusal(run(SCHOLAR, v2, transition('APPROVED')))).toEqual([
      'RULING_CORRECTION_NOT_ALLOWED',
    ]);
    // Both records and their history are unchanged; nothing in the series is current.
    expect(JSON.stringify(store.get(v1.entityId))).toBe(v1Before);
    expect(JSON.stringify(store.get(v2.entityId))).toBe(v2Before);
    expect(seriesOf(v1.entityId).map((c) => state(c))).toEqual(['WITHDRAWN', 'DRAFT']);
    // A new ruling (a new series) is the way forward; the stale draft may only be deleted.
    expect(refusal(run(SCHOLAR, null, create('RULING', RULING, refs)))).toEqual('APPLIED');
    expect(refusal(run(SCHOLAR, v2, transition('DRAFT_DELETED', 'TEST reason')))).toEqual(
      'APPLIED',
    );
  });

  it('withdraws with a mandatory reason and keeps the withdrawn version and its history', () => {
    const { v1, refs } = approvedRuling();
    expect(refusal(run(SCHOLAR, v1, transition('WITHDRAWN')))).not.toBe('APPLIED');
    const withdrawn = applied(run(SCHOLAR, v1, transition('WITHDRAWN', 'TEST reason')));
    expect(withdrawn.records.map((r) => r.kind)).toEqual(['CREATED', 'APPROVED', 'WITHDRAWN']);
    expect(withdrawn.records.at(-1)?.reason).toBe('TEST reason');
    // Nothing is current any more; a withdrawn version cannot be corrected.
    expect(refusal(correction(withdrawn, refs, 2))).toEqual(['RULING_CORRECTION_NOT_ALLOWED']);
  });

  it('gives versioning to the Marja’s governing scholar only (and SUPER_ADMIN)', () => {
    const { v1, refs } = approvedRuling();
    // Decision 64: SUPER_ADMIN is no longer in these lists (it holds every research permission).
    for (const who of [RESEARCHER, AUDITOR, OUTSIDER]) {
      expect(correction(v1, refs, 2, who).status).toBe('DENIED');
    }
    const v2 = applied(correction(v1, refs, 2));
    for (const who of [RESEARCHER, AUDITOR, OUTSIDER]) {
      expect(run(who, v2, transition('APPROVED')).status).toBe('DENIED');
    }
    // A Khamenei correction can never join a Sistani series.
    const crossMarja = run(
      OUTSIDER,
      null,
      { ...create('RULING', RULING, []), marjaId: 'khamenei', rulingVersion: 2 },
      { correcting: v1.entityId, versions: seriesOf(v1.entityId) },
    );
    expect(refusal(crossMarja)).toEqual(['RULING_SERIES_INVALID']);
  });
});

describe('ruling series binding (M5.3.5)', () => {
  const draft = {
    kind: 'CREATED' as const,
    payload: RULING,
    references: [],
    aiInvolvement: [],
    actor: { kind: 'STAFF_PRINCIPAL' as const, subject: 'test-scholar' },
    recordedAt: '2026-11-22T12:00:00.000Z',
    reason: null,
    decisionId: 'd-binding',
    requestId: 'r-binding',
  };
  const binding = (rulingVersion: number, rulingSeriesId: string | null, entityId = uuid()) => ({
    entityType: 'RULING' as const,
    entityId,
    displayRef: '',
    marjaId: 'sistani',
    rulingVersion,
    rulingSeriesId,
    question: null,
  });
  const appendWith = (b: ReturnType<typeof binding>) =>
    appendResearchRevision(
      null,
      { ...b, displayRef: researchDisplayRef('RULING', 'sistani', b.entityId, null) },
      draft,
    );

  it('binds every ruling to a series: version 1 is its own series, later versions join one', () => {
    const id = uuid();
    expect(appendWith(binding(1, id, id)).ok).toBe(true);
    expect(appendWith(binding(2, uuid(), id)).ok).toBe(true);
    // A missing series, a version 1 in another series, or a version 2 starting its own series fail.
    for (const bad of [binding(1, null, id), binding(1, uuid(), id), binding(2, id, id)]) {
      const result = appendWith(bad);
      expect(result.ok ? 'APPLIED' : result.error).toBe('BINDING_INVALID');
    }
  });
});
