import { expect, type Page } from '@playwright/test';

import { sealRulePack } from '@khums/core';
import type { RulePack } from '@khums/shared-types';

import { createDevelopmentMockPack } from '../../src/server/development/mock-rule-pack';
import { signIn, staffFetch } from './staff-session';

/**
 * TEST ONLY (decision 65): a PRODUCTION-channel pack taken through the governance ledger in the
 * in-memory e2e API, so the public calculator has a verified pack to serve. Its content is the
 * development sample (arbitrary engineering buckets, questions and "sample rate"), relabelled
 * TEST: NOT a ruling of any Marja. It is bound to the catalogue id `sistani` only because the
 * public calculator serves catalogue Marjas and research and governance are configured for it;
 * its rules cite a SYNTHETIC test ruling created here. Never used outside the e2e run.
 * Like the scholar rule-builder packs, it defines the annual workflow only (Phase 3 step 1: the
 * other assessment types are shown as not available for this Marja).
 */

export const PUBLIC = 'http://localhost:3102';
export const PUBLIC_PACK_ID = 'test-public-verified-pack';
export const PUBLIC_PACK_VERSION = '1.0.0';
export const PUBLIC_MARJA = 'sistani';
/** SCHOLAR on sistani in the TEST staff fixture (e2e-staff.json). */
export const PUBLIC_SCHOLAR = {
  username: 'e2e-research',
  password: 'e2e research scholar test passphrase 0003',
};

export function publicVerifiedTestPack(rulingRef: string): RulePack {
  const base = JSON.parse(
    JSON.stringify(createDevelopmentMockPack()).replaceAll(
      'MOCK / NOT FOR PRODUCTION',
      'TEST ONLY — NOT A RULING',
    ),
  ) as RulePack;
  const sealed = sealRulePack({
    ...base,
    metadata: {
      ...base.metadata,
      packId: PUBLIC_PACK_ID,
      marjaId: PUBLIC_MARJA,
      version: PUBLIC_PACK_VERSION,
      title: 'TEST PACK — public verified e2e fixture (not a ruling)',
      schemaVersion: 3,
      releaseChannel: 'PRODUCTION',
      status: 'DRAFT',
      isMock: false,
    },
    rules: base.rules.map((r) => ({ ...r, status: 'APPROVED' as const, rulingRefs: [rulingRef] })),
    workflows: { ...base.workflows, firstTime: null, missedYear: null },
    ...(base.factMapping === undefined
      ? {}
      : {
          factMapping: {
            ...base.factMapping,
            rules: base.factMapping.rules.map((r) => ({
              ...r,
              match: { ...r.match, workflows: ['annual' as const] },
            })),
          },
        }),
  });
  if (!sealed.ok) throw new Error('e2e public verified pack could not be sealed');
  return sealed.value;
}

interface ResearchRecord {
  entityType: string;
  entityId: string;
}

/** A SYNTHETIC, approved TEST ruling of sistani (source → passage → finding → ruling). */
async function createTestRuling(page: Page): Promise<string> {
  const step = { expectedRevision: 1, reason: null };
  const post = async (path: string, body: unknown): Promise<ResearchRecord> => {
    const response = await staffFetch(page, 'POST', `/admin/research${path}`, body);
    expect(response.status, `${path}: ${JSON.stringify(response.json)}`).toBeLessThan(300);
    return response.json as ResearchRecord;
  };
  const pin = (r: ResearchRecord, revision: number) => ({
    entityType: r.entityType,
    entityId: r.entityId,
    revision,
    rulingVersion: null,
    marjaId: PUBLIC_MARJA,
  });
  const source = await post('/sources', {
    marjaId: PUBLIC_MARJA,
    payload: {
      title: { original: 'TEST e2e synthetic source', translation: null },
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
    },
    references: [],
    aiInvolvement: [],
  });
  await post(`/sources/${source.entityId}/verify`, step);
  const passage = await post('/passages', {
    marjaId: PUBLIC_MARJA,
    payload: {
      locator: {
        volume: null,
        page: '1',
        masalah: null,
        istiftaId: null,
        section: null,
        url: null,
      },
      originalLanguage: 'ar',
      text: 'TEST e2e synthetic excerpt',
      precautionWording: null,
      notes: null,
    },
    references: [pin(source, 1)],
    aiInvolvement: [],
  });
  await post(`/passages/${passage.entityId}/verify`, step);
  const finding = await post('/findings', {
    marjaId: PUBLIC_MARJA,
    questionId: 'CTQ-01',
    payload: {
      language: 'en',
      scenario: null,
      conclusion: 'TEST e2e synthetic conclusion',
      explanation: 'TEST e2e synthetic explanation',
      precaution: 'UNDETERMINED',
      conditions: [],
      exceptions: [],
      qualifications: [],
      unresolvedIssues: [],
      notes: null,
    },
    references: [pin(passage, 1)],
    aiInvolvement: [],
  });
  await post(`/findings/${finding.entityId}/verify`, step);
  const approved = await post(`/findings/${finding.entityId}/approve`, {
    expectedRevision: 2,
    reason: null,
  });
  const ruling = await post('/rulings', {
    marjaId: PUBLIC_MARJA,
    payload: {
      language: 'en',
      conclusion: 'TEST e2e synthetic ruling conclusion',
      explanation: 'TEST e2e synthetic explanation',
      precaution: 'UNDETERMINED',
      conditions: [],
      exceptions: [],
      notes: null,
    },
    references: [pin(approved, 2), pin(passage, 1)],
    aiInvolvement: [],
  });
  await post(`/rulings/${ruling.entityId}/approve`, step);
  return `${ruling.entityId}@1`;
}

const NEXT_STEP: Readonly<Record<string, string>> = {
  SUBMITTED: 'review/start',
  REVIEW_STARTED: 'review/complete',
  REVIEW_COMPLETED: 'approve',
  APPROVED: 'publish',
  PUBLISHED: 'activate',
};
const evidence = { reference: 'docs/research/reviews/test/e2e-public.REVIEW.md' };

/**
 * Takes the TEST pack through the governance ledger (SINGLE_SCHOLAR_V1 for sistani) up to
 * ACTIVATED, once per API run. Idempotent and safe when several projects run it at once: each
 * call advances the ledger by its last record and tolerates concurrent conflicts (409).
 */
export async function ensureVerifiedPack(page: Page) {
  await signIn(page, PUBLIC_SCHOLAR, PUBLIC);
  const base = `/admin/governance/packs/${PUBLIC_PACK_ID}/versions/${PUBLIC_PACK_VERSION}`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await staffFetch(page, 'GET', base);
    if (current.status === 404) {
      const submitted = await staffFetch(page, 'POST', `${base}/submit`, {
        expectedSequence: 0,
        pack: publicVerifiedTestPack(await createTestRuling(page)),
      });
      expect([200, 409]).toContain(submitted.status);
      continue;
    }
    expect(current.status).toBe(200);
    const view = current.json as {
      activated: boolean;
      expectedSequence: number;
      records: { type: string }[];
    };
    if (view.activated) break;
    const last = view.records.at(-1)?.type ?? '';
    const next = NEXT_STEP[last];
    if (next === undefined) throw new Error(`unexpected TEST ledger state ${last}`);
    const body: Record<string, unknown> = { expectedSequence: view.expectedSequence };
    if (next === 'review/complete' || next === 'approve') body.evidence = evidence;
    const result = await staffFetch(page, 'POST', `${base}/${next}`, body);
    expect([200, 409], `${next}: ${JSON.stringify(result.json)}`).toContain(result.status);
  }
  const served = await staffFetch(page, 'GET', `/public/marjas/${PUBLIC_MARJA}/pack`);
  expect((served.json as { status: string }).status).toBe('AVAILABLE');
}
