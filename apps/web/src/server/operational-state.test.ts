import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { listMarjaCatalogue, runDevelopmentAssessment } from '@khums/core';

import { developmentCalculationPack } from './development/calculation-pack';
import { createDevelopmentMockPack } from './development/mock-rule-pack';
import { resolveOperationalState } from './operational-state';

describe('operational state (server-side)', () => {
  it('reads a valid explicit state', () => {
    for (const state of ['DEVELOPMENT', 'SCHOLAR_REVIEW', 'PRODUCTION_APPROVED'] as const) {
      expect(resolveOperationalState({ KHUMS_OPERATIONAL_STATE: state })).toEqual({
        ok: true,
        state,
      });
    }
  });

  it('defaults to DEVELOPMENT only under next dev, otherwise unconfigured', () => {
    expect(resolveOperationalState({ NODE_ENV: 'development' })).toEqual({
      ok: true,
      state: 'DEVELOPMENT',
    });
    expect(resolveOperationalState({ NODE_ENV: 'production' })).toEqual({
      ok: false,
      reason: 'UNCONFIGURED',
    });
    expect(resolveOperationalState({ KHUMS_OPERATIONAL_STATE: '' })).toEqual({
      ok: false,
      reason: 'UNCONFIGURED',
    });
  });

  it('treats invalid values as unconfigured (fail closed)', () => {
    for (const bad of ['development', 'PRODUCTION', 'DEV', ' DEVELOPMENT']) {
      expect(resolveOperationalState({ KHUMS_OPERATIONAL_STATE: bad })).toEqual({
        ok: false,
        reason: 'INVALID',
      });
    }
  });

  it('refuses DEVELOPMENT on a hosted (Vercel) deployment, explicit or by default', () => {
    expect(
      resolveOperationalState({ KHUMS_OPERATIONAL_STATE: 'DEVELOPMENT', VERCEL: '1' }),
    ).toEqual({ ok: false, reason: 'DEVELOPMENT_ON_HOSTED_DEPLOYMENT' });
    expect(resolveOperationalState({ NODE_ENV: 'development', VERCEL: '1' })).toEqual({
      ok: false,
      reason: 'UNCONFIGURED',
    });
  });
});

describe('development mock pack gate', () => {
  it('is available only in DEVELOPMENT', () => {
    expect(developmentCalculationPack({ ok: true, state: 'DEVELOPMENT' })).not.toBeNull();
    for (const state of ['SCHOLAR_REVIEW', 'PRODUCTION_APPROVED'] as const) {
      expect(developmentCalculationPack({ ok: true, state })).toBeNull();
    }
    for (const reason of ['UNCONFIGURED', 'INVALID', 'DEVELOPMENT_ON_HOSTED_DEPLOYMENT'] as const) {
      expect(developmentCalculationPack({ ok: false, reason })).toBeNull();
    }
  });

  it('is a structurally valid, MOCK-labelled, non-religious pack', () => {
    const pack = createDevelopmentMockPack();
    // Structural validity is checked by core before mapping (an invalid pack is refused).
    const run = runDevelopmentAssessment(
      {
        schemaVersion: 1,
        currency: 'GBP',
        context: { workflow: 'first-time', assessmentDate: '2026-06-30' },
        facts: [],
      },
      pack,
    );
    expect(run.kind === 'NEEDS_INPUT' && run.mapping.unsupported).not.toEqual([
      { factId: null, code: 'INVALID_RULE_PACK' },
    ]);
    expect(pack.metadata.isMock).toBe(true);
    expect(pack.metadata.status).toBe('DRAFT');
    expect(pack.metadata.title).toContain('MOCK / NOT FOR PRODUCTION');
    expect(pack.metadata.title).toContain('NOT RELIGIOUS GUIDANCE');
    for (const label of [
      ...pack.inputCategories.map((c) => c.label),
      ...pack.questions.map((q) => q.label),
      ...pack.consultations.map((c) => c.label),
      ...pack.parameters.map((p) => p.label),
      ...pack.rules.map((r) => r.summary),
      ...pack.sources.map((s) => s.title),
    ]) {
      expect(label, label).toMatch(/^MOCK \/ NOT FOR PRODUCTION/);
    }
  });

  it('never names a real Marja or uses a catalogue id', () => {
    const text = JSON.stringify(createDevelopmentMockPack()).toLowerCase();
    for (const entry of listMarjaCatalogue()) {
      expect(text, entry.id).not.toContain(`"${entry.id}"`);
      for (const name of Object.values(entry.name) as string[]) {
        expect(text, name).not.toContain(name.toLowerCase());
      }
    }
    expect(text).not.toContain('khums');
  });

  it('runs end to end in development mode, labelled not religious guidance', () => {
    const run = runDevelopmentAssessment(
      {
        schemaVersion: 1,
        currency: 'GBP',
        context: {
          workflow: 'annual',
          period: { start: '2026-01-01', end: '2026-12-31' },
        },
        facts: [
          {
            id: 'fact-1',
            kind: 'BALANCE',
            subtype: 'CASH',
            label: null,
            note: null,
            currency: 'GBP',
            value: { status: 'KNOWN', amount: '200.00' },
            periodId: null,
            valuedOn: { status: 'KNOWN', date: '2026-06-30' },
          },
        ],
      },
      createDevelopmentMockPack(),
      { 'mock-flag': false },
    );
    expect(run.kind).toBe('CALCULATED');
    if (run.kind !== 'CALCULATED') return;
    expect(run.report.meta.guidance).toBe('NOT_RELIGIOUS_GUIDANCE');
    expect(run.report.meta.rulePack.isMock).toBe(true);
  });
});

describe('client bundle hygiene', () => {
  it('no client component imports the development module', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry)) files.push(full);
      }
    };
    walk(join(__dirname, '..'));
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (source.includes("'use client'") || source.includes('"use client"')) {
        expect(source, file).not.toMatch(/server\/development|server\/operational-state/);
      }
    }
  });
});

describe('mock isolation (M4.5.1 is development-only)', () => {
  const sources = () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(full);
      }
    };
    walk(join(__dirname, '..'));
    return files.map((file) => ({ file, source: readFileSync(file, 'utf8') }));
  };

  it('only the gate imports the mock pack, and only the start page imports the gate', () => {
    const importers = (pattern: RegExp) =>
      sources()
        .filter(({ source }) => pattern.test(source))
        .map(({ file }) => file.slice(join(__dirname, '..').length + 1));
    expect(importers(/from '[^']*development\/mock-rule-pack'|from '\.\/mock-rule-pack'/)).toEqual([
      join('server', 'development', 'calculation-pack.ts'),
    ]);
    expect(importers(/development\/calculation-pack'/)).toEqual([
      join('app', '[locale]', 'start', 'marja', 'page.tsx'),
    ]);
  });

  it('SCHOLAR_REVIEW and PRODUCTION_APPROVED never receive a mock pack, even with dev defaults', () => {
    for (const state of ['SCHOLAR_REVIEW', 'PRODUCTION_APPROVED'] as const) {
      for (const env of [
        { KHUMS_OPERATIONAL_STATE: state },
        { KHUMS_OPERATIONAL_STATE: state, NODE_ENV: 'development' },
      ]) {
        expect(developmentCalculationPack(resolveOperationalState(env))).toBeNull();
      }
    }
  });

  it('core refuses to run a non-mock pack through the development path', () => {
    const pack = createDevelopmentMockPack();
    const notMock = { ...pack, metadata: { ...pack.metadata, isMock: false } };
    expect(runDevelopmentAssessment({}, notMock).kind).toBe('NOT_A_DEVELOPMENT_PACK');
  });
});
