import 'reflect-metadata';

import { readFileSync } from 'node:fs';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FINANCIAL_FACT_SUBTYPES,
  ruleInflationResponseSchema,
  scholarRuleResponseSchema,
  scholarRuleTestResponseSchema,
  type BuilderRuleContent,
} from '@khums/validation';

import { AppModule } from '../src/app.module';
import { bootstrapSuperAdmin } from '../src/auth/bootstrap';
import { PASSWORD_HASHER, type PasswordHasher } from '../src/auth/password-hasher';
import { STAFF_STORE, type StaffStore } from '../src/auth/staff-store';
import { loadConfig } from '../src/config';
import { configureApp } from '../src/shared/http/configure-app';
import { staffBrowserClass } from './support/staff-browser';

/**
 * Phase 4 P4-3: the AI-prepared annual rules of `docs/research/bundles/<marja>/bundle.json`
 * imported through the real staff API (DRAFT research with AI declarations; builder rules marked
 * "Approved for scholar testing by AI") and run in the scholar-testing calculator. Expected figures
 * are TECHNICAL expectations computed by hand from the encoded rules (rate 20 = the one-fifth the
 * cited texts state) with arbitrary test amounts: never religious answers. Passage text is a
 * labelled placeholder (the offices' text is never committed).
 */

const WEB = 'https://web.khums.test';
const EDGE_SECRET = 'integration-edge-secret-0123456789abcdef';
const ADMIN = { username: 'annual-admin', password: 'integration admin passphrase 11' };
const TYPES: Readonly<Record<string, string>> = {
  sources: 'SOURCE',
  passages: 'PASSAGE',
  translations: 'TRANSLATION',
  findings: 'FINDING',
  rulings: 'RULING',
};

let app: NestExpressApplication;
let url: string;
const Browser = staffBrowserClass({ url: () => url, web: WEB, edgeSecret: EDGE_SECRET });
type Browser = InstanceType<typeof Browser>;
let admin: Browser;

interface BundleRecord {
  key: string;
  type: string;
  questionId?: string;
  payload: Record<string, unknown>;
  refs: string[];
  ai: { assistance: string; field: string }[];
}
interface BundleRule {
  key: string;
  aiStage: string;
  tests: string;
  content: BuilderRuleContent;
}
interface Bundle {
  marjaId: string;
  tool: string;
  records: BundleRecord[];
  rules: BundleRule[];
}

const bundleOf = (marjaId: string): Bundle =>
  JSON.parse(
    readFileSync(
      new URL(`../../../docs/research/bundles/${marjaId}/bundle.json`, import.meta.url),
      'utf8',
    ),
  ) as Bundle;

/** Imports a bundle as scripts/import-research-bundle.mjs does; returns rule key → rule. */
async function importBundle(bundle: Bundle) {
  const ids = new Map<
    string,
    { type: string; entityId: string; revision: number; rulingVersion: number | null }
  >();
  const now = new Date().toISOString();
  for (const record of bundle.records) {
    const references = record.refs.map((key) => {
      const ref = ids.get(key);
      if (ref === undefined) throw new Error(`${record.key}: ${key} not imported yet`);
      return {
        entityType: TYPES[ref.type],
        entityId: ref.entityId,
        revision: ref.revision,
        rulingVersion: ref.type === 'rulings' ? ref.rulingVersion : null,
        marjaId: bundle.marjaId,
      };
    });
    const payload =
      record.type === 'passages'
        ? { ...record.payload, text: `TEST PLACEHOLDER — not the office's text (${record.key})` }
        : record.payload;
    const created = await admin.call('POST', `/admin/research/${record.type}`, {
      body: {
        marjaId: bundle.marjaId,
        ...(record.questionId === undefined ? {} : { questionId: record.questionId }),
        payload,
        references,
        aiInvolvement: record.ai.map((d) => ({
          ...d,
          generation: 'AI_GENERATED',
          tool: bundle.tool,
          occurredAt: now,
          scholarReview: 'NOT_REVIEWED',
        })),
      },
    });
    expect(created.status, `${record.key}: ${JSON.stringify(created.json)}`).toBe(201);
    const json = created.json as {
      entityId: string;
      content: { revision: number };
      rulingVersion: number | null;
    };
    ids.set(record.key, {
      type: record.type,
      entityId: json.entityId,
      revision: json.content.revision,
      rulingVersion: json.rulingVersion,
    });
  }
  const rules = new Map<string, { ruleId: string; content: BuilderRuleContent }>();
  for (const rule of bundle.rules) {
    const at = (value: string) => ids.get(value.slice(1))?.entityId ?? value;
    const content = {
      ...rule.content,
      rulingId: rule.content.rulingId === null ? null : at(rule.content.rulingId),
      sourceRefs: rule.content.sourceRefs.map(at),
    };
    const created = await admin.call('POST', '/admin/rules', {
      body: {
        marjaId: bundle.marjaId,
        content,
        reason: `AI-prepared rule (${rule.key})`,
        aiPreparation: { stage: rule.aiStage, tool: bundle.tool, tests: rule.tests },
      },
    });
    expect(created.status, `${rule.key}: ${JSON.stringify(created.json)}`).toBe(201);
    const parsed = scholarRuleResponseSchema.parse(created.json);
    expect(parsed.check.status, rule.key).toBe('READY_FOR_VERIFICATION');
    expect(parsed.current.aiPreparation?.stage).toBe('APPROVED_FOR_SCHOLAR_TESTING');
    rules.set(rule.key, { ruleId: parsed.ruleId, content });
  }
  return rules;
}

interface Entry {
  id: string;
  kind: string;
  subtype: string;
  amount: string;
  /** Phase 4: the entry's date (default 2025-06-01, inside the default period). */
  date?: string;
}
interface Scenario {
  readonly id: string;
  readonly entries: readonly Entry[];
  /** Answers by rule key and condition index (default false for every question asked). */
  readonly yes?: readonly (readonly [string, number, string?])[];
  /** Phase 4: per-entry inflation figures: [rule key, deduction type, entry id, percentage]. */
  readonly rates?: readonly (readonly [string, string, string, string])[];
  /**
   * Decision 82: numbers asked by "count it as" confirmations: [rule key, condition index, entry
   * id, what (amount, inflation or portion), value].
   */
  readonly numbers?: readonly (readonly [
    string,
    number,
    string,
    'amount' | 'inflation' | 'portion',
    string,
  ])[];
  /** Phase 4: the khums year (default 2025-01-01 to 2025-12-31). */
  readonly period?: { readonly start: string; readonly end: string };
  /** Expected output per rule key: an amount, null (review stop) or 'NEEDS_REVIEW' (mapping stop). */
  readonly expect: Readonly<Record<string, string | null>> | 'NEEDS_REVIEW';
}

async function runScenario(
  marjaId: string,
  rules: Map<string, { ruleId: string; content: BuilderRuleContent }>,
  scenario: Scenario,
) {
  const answers: Record<string, boolean> = {};
  const entryAnswers: Record<string, Record<string, boolean | string>> = {};
  const isYes = (ruleKey: string, index: number, entryId?: string) =>
    (scenario.yes ?? []).some(
      ([k, i, e]) => k === ruleKey && i === index && (e === undefined || e === entryId),
    );
  for (const [ruleKey, { ruleId, content }] of rules) {
    const included = new Set(content.includedEntries.map((r) => `${r.kind}:${r.subtype}`));
    content.conditions.forEach((condition, index) => {
      if (condition.scope === 'CALCULATION') {
        answers[`builder:${ruleId}:confirm:${String(index)}`] = isYes(ruleKey, index);
        return;
      }
      for (const entry of scenario.entries) {
        const key = `${entry.kind}:${entry.subtype}`;
        const named = condition.entries.some((r) => `${r.kind}:${r.subtype}` === key);
        if (!(named || (condition.entries.length === 0 && included.has(key)))) continue;
        entryAnswers[entry.id] = {
          ...entryAnswers[entry.id],
          [`builder:${ruleId}:entry-confirm:${String(index)}`]: isYes(ruleKey, index, entry.id),
        };
      }
    });
  }
  for (const [ruleKey, index, entryId, what, value] of scenario.numbers ?? []) {
    const ruleId = rules.get(ruleKey)?.ruleId ?? '';
    entryAnswers[entryId] = {
      ...entryAnswers[entryId],
      [`builder:${ruleId}:entry-${what}:${String(index)}`]: value,
    };
  }
  for (const [ruleKey, type, entryId, value] of scenario.rates ?? []) {
    const ruleId = rules.get(ruleKey)?.ruleId ?? '';
    entryAnswers[entryId] = {
      ...entryAnswers[entryId],
      [`builder:${ruleId}:inflation:${type}`]: value,
    };
  }
  const tested = await admin.call('POST', '/admin/rules/test', {
    body: {
      marjaId,
      currency: 'USD',
      period: scenario.period ?? { start: '2025-01-01', end: '2025-12-31' },
      entries: scenario.entries.map((e) => ({ ...e, date: e.date ?? '2025-06-01' })),
      answers,
      entryAnswers,
    },
  });
  expect(tested.status, `${scenario.id}: ${JSON.stringify(tested.json)}`).toBe(200);
  const result = scholarRuleTestResponseSchema.parse(tested.json);
  expect(result.label).toBe('PROVISIONAL — FOR SCHOLAR REVIEW ONLY');
  expect(result.compiled).toHaveLength(5);
  expect(result.compiled.every((c) => c.aiStage === 'APPROVED_FOR_SCHOLAR_TESTING')).toBe(true);
  // Source references: every compiled rule shows its research ruling and every cited source.
  for (const { ruleId, content } of rules.values()) {
    const compiled = result.compiled.find((c) => c.ruleId === ruleId);
    expect(compiled?.rulingId).toBe(content.rulingId);
    expect(compiled?.sources.map((src) => src.refId).sort()).toEqual(
      [...content.sourceRefs].sort(),
    );
    // Office sources link to the office website; the form (decision 81) has no URL.
    expect(
      compiled?.sources.every((src) => src.url === null || src.url.startsWith('https://www.')),
    ).toBe(true);
  }
  if (scenario.expect === 'NEEDS_REVIEW') {
    expect(result.outcome, scenario.id).toBe('NEEDS_REVIEW');
    return;
  }
  expect(result.outcome, `${scenario.id}: ${JSON.stringify(result.refusal)}`).toBe('CALCULATED');
  const outputs = (
    result.report as { result: { outputs: { id: string; value: { amount: string } | null }[] } }
  ).result.outputs;
  for (const [ruleKey, expected] of Object.entries(scenario.expect)) {
    const ruleId = rules.get(ruleKey)?.ruleId ?? '';
    const value = outputs.find((o) => o.id === `builder:${ruleId}:result`)?.value?.amount ?? null;
    expect(value, `${scenario.id} ${ruleKey}`).toBe(expected);
  }
}

const e = (id: string, kind: string, subtype: string, amount: string, date?: string): Entry => ({
  id,
  kind,
  subtype,
  amount,
  ...(date === undefined ? {} : { date }),
});
const SIS = 'sis-rule-annual-surplus';
const KHA = 'kha-rule-annual-surplus';

const SISTANI: readonly Scenario[] = [
  // ── Decision 81: the Al-Bi'that Trust form (TECHNICAL expectations; salary 10000, rate 20) ──
  {
    id: 'sis-form-unknown-year',
    // Table 1: unknown whether a year passed: settle with the agent → review stop
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('i', 'ASSET', 'HOUSEHOLD_ITEM', '999')],
    yes: [[SIS, 16, 'i']],
    expect: 'NEEDS_REVIEW',
  },
  {
    id: 'sis-form-year-passed',
    // Tables 1–2: bought with income a year had passed on: khums on the price, (10000 + 1000) × 20%
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('i', 'ASSET', 'HOUSEHOLD_ITEM', '999')],
    yes: [[SIS, 20, 'i']],
    numbers: [[SIS, 20, 'i', 'amount', '1000']],
    expect: { [SIS]: '2200' },
  },
  {
    id: 'sis-form-dual-use',
    // Note 22: needed for life and work: half the price 2000 → (10000 + 1000) × 20% = 2200
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('v', 'ASSET', 'VEHICLE', '999')],
    yes: [
      [SIS, 21, 'v'],
      [SIS, 22, 'v'],
    ],
    numbers: [[SIS, 22, 'v', 'amount', '2000']],
    expect: { [SIS]: '2200' },
  },
  {
    id: 'sis-form-beyond-status',
    // Table 1: beyond need or status: khums on the price 1500 → 2300
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('i', 'ASSET', 'HOUSEHOLD_ITEM', '999')],
    yes: [
      [SIS, 21, 'i'],
      [SIS, 23, 'i'],
    ],
    numbers: [[SIS, 23, 'i', 'amount', '1500']],
    expect: { [SIS]: '2300' },
  },
  {
    id: 'sis-form-unused',
    // Table 1 / note 20: a thing bought this year and not used: its current value 1000 → 2200
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('i', 'ASSET', 'HOUSEHOLD_ITEM', '1000')],
    yes: [[SIS, 21, 'i']],
    expect: { [SIS]: '2200' },
  },
  {
    id: 'sis-form-note-17',
    // Note 17: unused, but not having it ready would be against status: no khums → 2000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('i', 'ASSET', 'HOUSEHOLD_ITEM', '1000')],
    yes: [
      [SIS, 21, 'i'],
      [SIS, 25, 'i'],
    ],
    expect: { [SIS]: '2000' },
  },
  {
    id: 'sis-form-inheritance',
    // Note 6: khums on the part on which khums was due (2000) → 2400
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('h', 'INCOME', 'INHERITANCE', '5000')],
    yes: [[SIS, 0, 'h']],
    numbers: [[SIS, 0, 'h', 'amount', '2000']],
    expect: { [SIS]: '2400' },
  },
  {
    id: 'sis-form-transfer',
    // Note 14: a transfer not yet withdrawn or spent is not yet received → 2000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('g', 'INCOME', 'GIFT', '1000')],
    yes: [[SIS, 43, 'g']],
    expect: { [SIS]: '2000' },
  },
  {
    id: 'sis-form-exemptions',
    // Exemptions: khula property not counted; a scholarship is income: (10000 + 1000) × 20%
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('k', 'INCOME', 'KHULA_RECEIVED', '3000'),
      e('c', 'INCOME', 'SCHOLARSHIP', '1000'),
    ],
    expect: { [SIS]: '2200' },
  },
  {
    id: 'sis-form-capital-loss',
    // Note 23: a fall in taxed fixed capital is made up from savings: (10000 − 1000) × 20%
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('l', 'EXPENSE', 'FIXED_CAPITAL_LOSS', '1000'),
    ],
    expect: { [SIS]: '1800' },
  },
  {
    id: 'sis-form-hajj-loan-given',
    // Note 19: savings for a settled Hajj with no other way; note 29: an unrecoverable loan from
    // this year's income: both deducted, (10000 − 1000 − 500) × 20% = 1700
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('h', 'BALANCE', 'HAJJ_SAVINGS', '1000', '2025-12-31'),
      e('l', 'ASSET', 'LOAN_GIVEN', '500', '2025-12-31'),
    ],
    yes: [
      [SIS, 49, 'h'],
      [SIS, 50, 'l'],
    ],
    expect: { [SIS]: '1700' },
  },
  {
    id: 'sis-form-dowry',
    // Note 8: dowry one could buy when needed: counted, (10000 + 3000) × 20% = 2600
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('d', 'ASSET', 'DOWRY_ITEMS', '3000')],
    yes: [[SIS, 14, 'd']],
    expect: { [SIS]: '2600' },
  },
  {
    id: 'sis-form-dowry-custom',
    // Table 1 row 7: dowry built gradually by custom is a need of life → 2000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('d', 'ASSET', 'DOWRY_ITEMS', '3000')],
    yes: [[SIS, 15, 'd']],
    expect: { [SIS]: '2000' },
  },
  {
    id: 'sis-form-sale-needed-gift',
    // Note 18: a needed thing received as a gift and sold: the whole price is income → 2600
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('x', 'INCOME', 'SALE', '3000')],
    yes: [[SIS, 29, 'x']],
    expect: { [SIS]: '2600' },
  },
  {
    id: 'sis-form-home-gradual',
    // Note 15: land for a home built gradually by custom: no khums → 2000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('p', 'ASSET', 'LAND', '5000')],
    yes: [
      [SIS, 21, 'p'],
      [SIS, 27, 'p'],
    ],
    expect: { [SIS]: '2000' },
  },
  {
    id: 'sis-form-provident-fund',
    // Note 9: provident fund, gratuity and leave encashment are the year's income → 2600
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'INCOME', 'PROVIDENT_FUND', '1000'),
      e('g', 'INCOME', 'GRATUITY', '1000'),
      e('l', 'INCOME', 'LEAVE_ENCASHMENT', '1000'),
    ],
    expect: { [SIS]: '2600' },
  },
  {
    id: 'sis-form-mixed-money',
    // Note 11: only the part certainly from liable money (3000) → 2600
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('b', 'ASSET', 'BUSINESS_EQUIPMENT', '9000'),
    ],
    yes: [[SIS, 18, 'b']],
    numbers: [[SIS, 18, 'b', 'amount', '3000']],
    expect: { [SIS]: '2600' },
  },
  {
    id: 'sis-form-loan-capital',
    // Table 2 guide 1: bought on loan, 2000 repaid this year → 2400
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('b', 'ASSET', 'BUSINESS_EQUIPMENT', '9000'),
    ],
    yes: [[SIS, 19, 'b']],
    numbers: [[SIS, 19, 'b', 'amount', '2000']],
    expect: { [SIS]: '2400' },
  },
  {
    id: 'sis-form-insurance-maturity',
    // Note 13: maturity payout: only 1500 above the premiums is income → 2300
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'INCOME', 'INSURANCE_PAYOUT', '5000'),
    ],
    yes: [[SIS, 46, 'p']],
    numbers: [[SIS, 46, 'p', 'amount', '1500']],
    expect: { [SIS]: '2300' },
  },
  {
    id: 'sis-form-waqf',
    // Note 10: named for waqf but not handed over: counted at its value → 2800
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('h', 'ASSET', 'HOME', '4000')],
    yes: [[SIS, 11, 'h']],
    expect: { [SIS]: '2800' },
  },
  {
    id: 'sis-form-stock-animals',
    // Table 3 / notes 27–28: leftover household stock 500 and sellable animals 1000 counted;
    // unsellable crops not: (10000 + 500 + 1000) × 20% = 2300
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('f', 'ASSET', 'HOUSEHOLD_STOCK', '500', '2025-12-31'),
      e('a', 'ASSET', 'LIVESTOCK', '1000', '2025-12-31'),
      e('c', 'ASSET', 'CROPS_AND_TREES', '700', '2025-12-31'),
    ],
    yes: [[SIS, 47, 'a']],
    expect: { [SIS]: '2300' },
  },
  {
    id: 'sis-annual-household',
    // A realistic year (PKR). Counted: salary 2,400,000 + rent 360,000 − costs 60,000 + shares
    // 240,000 + wages owed 50,000 = 2,990,000. Deducted: living 1,500,000 (household, tax,
    // insurance, education) + prices paid 1,100,000 (car in use, shares) + loan 100,000 =
    // 2,700,000. (2,990,000 − 2,700,000) × 20% − khums paid 40,000 = 18,000
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '2400000'),
      e('r', 'INCOME', 'RENTAL', '360000'),
      e('rc', 'EXPENSE', 'BUSINESS', '60000'),
      e('h', 'EXPENSE', 'HOUSEHOLD', '1200000'),
      e('t', 'EXPENSE', 'TAX', '120000'),
      e('i', 'EXPENSE', 'INSURANCE', '30000'),
      e('ed', 'EXPENSE', 'EDUCATION', '150000'),
      e('cp', 'EXPENSE', 'ASSET_PURCHASE', '900000'),
      e('car', 'ASSET', 'VEHICLE', '850000', '2025-12-31'),
      e('sp', 'EXPENSE', 'ASSET_PURCHASE', '200000'),
      e('sh', 'ASSET', 'INVESTMENT', '240000', '2025-12-31'),
      e('w', 'ASSET', 'RECEIVABLE', '50000', '2025-12-31'),
      e('l', 'LIABILITY', 'LOAN', '100000', '2025-12-31'),
      e('k', 'EXPENSE', 'KHUMS_PAID', '40000'),
    ],
    yes: [
      [SIS, 21, 'car'],
      [SIS, 24, 'car'],
      [SIS, 41, 'sh'],
      [SIS, 38, 'w'],
      [SIS, 9, 'l'],
    ],
    expect: { [SIS]: '18000' },
  },
  {
    id: 'sis-annual-expenses-exceed-income',
    // Spending above income never makes khums negative; khums paid cannot take it below zero
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '1000'),
      e('h', 'EXPENSE', 'HOUSEHOLD', '3000'),
      e('k', 'EXPENSE', 'KHUMS_PAID', '100'),
    ],
    expect: { [SIS]: '0' },
  },
  {
    id: 'sis-annual-mahr-diyah',
    // Mahr and diyah received are not liable (Jami' 586; Q&A 4): 10000 × 20% = 2000
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('m', 'INCOME', 'MAHR', '5000'),
      e('d', 'INCOME', 'DIYAH', '2000'),
    ],
    expect: { [SIS]: '2000' },
  },
  {
    id: 'sis-annual-insurance',
    // Customary insurance premiums are mu'nah (624): (10000 − 1000) × 20% = 1800
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('i', 'EXPENSE', 'INSURANCE', '1000')],
    expect: { [SIS]: '1800' },
  },
  {
    id: 'sis-annual-insurance-investment',
    // Form note 13: investment-insurance premiums are not deducted: 10000 × 20% = 2000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('i', 'EXPENSE', 'INSURANCE', '1000')],
    yes: [[SIS, 44, 'i']],
    expect: { [SIS]: '2000' },
  },
  {
    id: 'sis-annual-insurance-payout',
    // Insurance money unspent at year end is liable (Q&A 4): (10000 + 1000) × 20% = 2200
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'INCOME', 'INSURANCE_PAYOUT', '1000'),
    ],
    expect: { [SIS]: '2200' },
  },
  {
    id: 'sis-annual-unpaid-mahr',
    // Unpaid mahr of a marriage this year (704; Q&A 27): (10000 − 3000) × 20% = 1400
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('m', 'LIABILITY', 'UNPAID_MAHR', '3000', '2025-12-31'),
    ],
    yes: [[SIS, 45, 'm']],
    expect: { [SIS]: '1400' },
  },
  {
    id: 'sis-annual-shares-trade-rise',
    // Shares bought with taxed money for trade: sellable rise liable even if unsold (680):
    // (10000 + 2600 − 2000) × 20% = 2120
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('end', 'ASSET', 'INVESTMENT', '2600', '2025-12-31'),
      e('start', 'ASSET', 'INVESTMENT', '2000', '2024-12-31'),
    ],
    yes: [
      [SIS, 41, 'end'],
      [SIS, 42, 'start'],
    ],
    expect: { [SIS]: '2120' },
  },
  {
    id: 'sis-annual-period-long',
    // A period longer than any calendar year stops for review (Jami' 563, 578)
    period: { start: '2025-01-01', end: '2026-01-05' },
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000')],
    expect: { [SIS]: null },
  },
  {
    id: 'sis-annual-period-transitional',
    // A shorter transitional period is assessed as it is (578): 5000 × 20% = 1000
    period: { start: '2025-01-01', end: '2025-06-30' },
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '5000', '2025-03-01')],
    expect: { [SIS]: '1000' },
  },
  {
    id: 'sis-annual-outside-year',
    // Income received after the khums year belongs to another year: review stop
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('n', 'INCOME', 'EMPLOYMENT', '500', '2026-01-10'),
    ],
    expect: 'NEEDS_REVIEW',
  },
  {
    id: 'sis-annual-separate-cycle',
    // Separate yearly cycles: how living expenses are borne is not stated (review)
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('h', 'EXPENSE', 'HOUSEHOLD', '2000')],
    yes: [[SIS, 40, 'h']],
    expect: 'NEEDS_REVIEW',
  },
  {
    id: 'sis-annual-stock-rise',
    // Taxed trading stock: rise above the last taxed value (645, 653): (10000 + 5000 − 4000) × 20%
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('end', 'ASSET', 'BUSINESS_STOCK', '5000', '2025-12-31'),
      e('start', 'ASSET', 'BUSINESS_STOCK', '4000', '2024-12-31'),
    ],
    yes: [
      [SIS, 41, 'end'],
      [SIS, 42, 'start'],
    ],
    expect: { [SIS]: '2200' },
  },
  {
    id: 'sis-annual-stock-rise-unconfirmed',
    // The opening value is used only when confirmed as the last taxed value: (10000 + 5000) × 20%
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('end', 'ASSET', 'BUSINESS_STOCK', '5000', '2025-12-31'),
      e('start', 'ASSET', 'BUSINESS_STOCK', '4000', '2024-12-31'),
    ],
    yes: [[SIS, 41, 'end']],
    expect: { [SIS]: '3000' },
  },
  {
    id: 'sis-annual-stock-inflation',
    // Form note 12 (decision 81): a rise that is only inflation is taxed by obligatory precaution,
    // so it is counted like any rise: (10000 + 5000) × 20% = 3000
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('end', 'ASSET', 'BUSINESS_STOCK', '5000', '2025-12-31'),
    ],
    yes: [[SIS, 41, 'end']],
    expect: { [SIS]: '3000' },
  },
  {
    id: 'sis-annual-sale-inflation',
    // Form note 12: an inflation-only rise on a sale is counted: (10000 + 3000 − 2000) × 20% = 2200
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('x', 'INCOME', 'SALE', '3000'),
      e('c', 'EXPENSE', 'SOLD_ITEM_COST', '2000'),
    ],
    expect: { [SIS]: '2200' },
  },
  {
    id: 'sis-annual-lasting-debt',
    // Unpaid, not yet deducted part of a home loan still lived in (704; Q&A 7): (10000 − 3000) × 20%
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('l', 'LIABILITY', 'MORTGAGE', '3000', '2025-12-31'),
    ],
    yes: [[SIS, 9, 'l']],
    expect: { [SIS]: '1400' },
  },
  {
    id: 'sis-annual-tax',
    // Tax paid is mu'nah (Jami' 848): (10000 − 1000) × 20% = 1800
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('t', 'EXPENSE', 'TAX', '1000')],
    expect: { [SIS]: '1800' },
  },
  {
    id: 'sis-annual-khums-paid',
    // Khums paid on this year's income (Jami' 721): (10000 − 2000) × 20% − 500 = 1100
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('h', 'EXPENSE', 'HOUSEHOLD', '2000'),
      e('k', 'EXPENSE', 'KHUMS_PAID', '500'),
    ],
    expect: { [SIS]: '1100' },
  },
  {
    id: 'sis-annual-khums-paid-earlier',
    // Paid for an earlier year from this year's income: not deducted, (10000 − 2000) × 20% = 1600
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('h', 'EXPENSE', 'HOUSEHOLD', '2000'),
      e('k', 'EXPENSE', 'KHUMS_PAID', '500'),
    ],
    yes: [[SIS, 35, 'k']],
    expect: { [SIS]: '1600' },
  },
  {
    id: 'sis-annual-receivable',
    // Collectable wages owed for this year's work (Jami' 715): (10000 + 2000) × 20% = 2400
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('r', 'ASSET', 'RECEIVABLE', '2000')],
    yes: [[SIS, 38, 'r']],
    expect: { [SIS]: '2400' },
  },
  {
    id: 'sis-annual-receivable-later',
    // Not collectable and paid when collected (the person's choice, Jami' 715): 10000 × 20% = 2000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('r', 'ASSET', 'RECEIVABLE', '2000')],
    yes: [
      [SIS, 38, 'r'],
      [SIS, 39, 'r'],
    ],
    expect: { [SIS]: '2000' },
  },
  {
    id: 'sis-annual-receivable-stops',
    // A credit sale needs the price and the profit separately: review stop
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('r', 'ASSET', 'RECEIVABLE', '2000')],
    yes: [[SIS, 36, 'r']],
    expect: 'NEEDS_REVIEW',
  },
  {
    id: 'sis-annual-salary',
    // (10000 − 6000) × 20% = 800
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('h', 'EXPENSE', 'HOUSEHOLD', '6000')],
    expect: { [SIS]: '800' },
  },
  {
    id: 'sis-annual-business-loss',
    // (10000 + max(2000 − 3000, 0) − 4000) × 20% = 1200: the loss does not offset salary
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('b', 'INCOME', 'BUSINESS', '2000'),
      e('c', 'EXPENSE', 'BUSINESS', '3000'),
      e('h', 'EXPENSE', 'HOUSEHOLD', '4000'),
    ],
    expect: { [SIS]: '1200' },
  },
  {
    id: 'sis-annual-business-loss-separate-lines',
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('b', 'INCOME', 'BUSINESS', '2000')],
    yes: [[SIS, 10]],
    expect: { [SIS]: null },
  },
  {
    id: 'sis-annual-gifts',
    // Gift of money is a gain: (5000 + 1000) × 20% = 1200
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '5000'), e('g', 'INCOME', 'GIFT', '1000')],
    expect: { [SIS]: '1200' },
  },
  {
    id: 'sis-annual-gift-item',
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '5000'), e('g', 'INCOME', 'GIFT', '1000')],
    yes: [[SIS, 3, 'g']],
    expect: 'NEEDS_REVIEW',
  },
  {
    id: 'sis-annual-inheritance',
    // Expected inheritance under valid rules is excluded: 5000 × 20% = 1000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '5000'), e('i', 'INCOME', 'INHERITANCE', '3000')],
    yes: [[SIS, 1, 'i']],
    expect: { [SIS]: '1000' },
  },
  {
    id: 'sis-annual-inheritance-gain',
    // Not under valid rules (e.g. ta'sib) and money: (5000 + 3000) × 20% = 1600
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '5000'), e('i', 'INCOME', 'INHERITANCE', '3000')],
    expect: { [SIS]: '1600' },
  },
  {
    id: 'sis-annual-debts',
    // Confirmed needs debt: (10000 − 2000) × 20% = 1600
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('l', 'LIABILITY', 'LOAN', '2000')],
    yes: [[SIS, 9, 'l']],
    expect: { [SIS]: '1600' },
  },
  {
    id: 'sis-annual-debts-unconfirmed',
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('l', 'LIABILITY', 'LOAN', '2000')],
    expect: { [SIS]: '2000' },
  },
  {
    id: 'sis-annual-stops',
    // Digital assets: no ruling found, no rule counts them: the entry stops for review
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('x', 'ASSET', 'DIGITAL_ASSET', '500')],
    expect: 'NEEDS_REVIEW',
  },
  {
    id: 'sis-annual-beyond-status',
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('h', 'EXPENSE', 'HOUSEHOLD', '6000')],
    yes: [[SIS, 6, 'h']],
    expect: 'NEEDS_REVIEW',
  },
  {
    id: 'sis-annual-holdings',
    // Unused item bought from this year's income: (10000 − 1000 + 800) × 20% = 1960
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'EXPENSE', 'ASSET_PURCHASE', '1000'),
      e('a', 'ASSET', 'HOUSEHOLD_ITEM', '800'),
    ],
    yes: [[SIS, 21, 'a']],
    expect: { [SIS]: '1960' },
  },
  {
    id: 'sis-annual-holdings-used',
    // Used during the year (mu'nah): (10000 − 1000) × 20% = 1800
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'EXPENSE', 'ASSET_PURCHASE', '1000'),
      e('a', 'ASSET', 'HOUSEHOLD_ITEM', '800'),
    ],
    yes: [
      [SIS, 21, 'a'],
      [SIS, 24, 'a'],
    ],
    expect: { [SIS]: '1800' },
  },
  {
    id: 'sis-annual-holdings-shares',
    // Shares bought from this year's income at year-end value: (10000 − 1200 + 1500) × 20% = 2060
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'EXPENSE', 'ASSET_PURCHASE', '1200'),
      e('a', 'ASSET', 'INVESTMENT', '1500'),
    ],
    yes: [[SIS, 41, 'a']],
    expect: { [SIS]: '2060' },
  },
  {
    id: 'sis-annual-capital-hardship',
    // Form note 31: certain that khums on this capital cannot be paid at all: not counted,
    // 10000 × 20% = 2000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('a', 'ASSET', 'BUSINESS_STOCK', '3000')],
    yes: [
      [SIS, 41, 'a'],
      [SIS, 26, 'a'],
    ],
    expect: { [SIS]: '2000' },
  },
  {
    id: 'sis-annual-sale-gain',
    // Gain on a sale: (10000 + max(5000 − 3000, 0)) × 20% = 2400
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('v', 'INCOME', 'SALE', '5000'),
      e('k', 'EXPENSE', 'SOLD_ITEM_COST', '3000'),
    ],
    expect: { [SIS]: '2400' },
  },
  {
    id: 'sis-annual-sale-inherited',
    // Inherited item, not kept for trade: excluded: 10000 × 20% = 2000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('v', 'INCOME', 'SALE', '5000')],
    yes: [[SIS, 30, 'v']],
    expect: { [SIS]: '2000' },
  },
  {
    id: 'sis-annual-sale-loss',
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('v', 'INCOME', 'SALE', '2000'),
      e('k', 'EXPENSE', 'SOLD_ITEM_COST', '3000'),
    ],
    yes: [[SIS, 32]],
    expect: { [SIS]: null },
  },
  {
    id: 'sis-annual-bank-profit',
    // Definite bank profit under an agency contract: (10000 + 500) × 20% = 2100
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('r', 'INCOME', 'INVESTMENT_RETURN', '500'),
    ],
    expect: { [SIS]: '2100' },
  },
  {
    id: 'sis-annual-profit-on-account',
    // Paid 'on account' before profit is confirmed: not yet liable: 10000 × 20% = 2000
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('r', 'INCOME', 'INVESTMENT_RETURN', '500'),
    ],
    yes: [[SIS, 34, 'r']],
    expect: { [SIS]: '2000' },
  },
  {
    id: 'sis-annual-bank-no-agency',
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('r', 'INCOME', 'INVESTMENT_RETURN', '500'),
    ],
    yes: [[SIS, 33, 'r']],
    expect: 'NEEDS_REVIEW',
  },
  {
    id: 'sis-mined',
    entries: [e('m', 'INCOME', 'MINED_PRODUCT', '5000')],
    expect: { 'sis-rule-mined': '1000' },
  },
  {
    id: 'sis-mined-below-nisab',
    entries: [e('m', 'INCOME', 'MINED_PRODUCT', '5000')],
    yes: [['sis-rule-mined', 0]],
    expect: { 'sis-rule-mined': null },
  },
  {
    id: 'sis-treasure',
    entries: [e('t', 'INCOME', 'TREASURE', '2000')],
    expect: { 'sis-rule-treasure': '400' },
  },
  {
    id: 'sis-diving',
    entries: [e('d', 'INCOME', 'DIVING_GEMS', '1000')],
    expect: { 'sis-rule-diving': '200' },
  },
  {
    id: 'sis-mixed',
    entries: [e('x', 'BALANCE', 'MIXED_FUNDS', '10000')],
    expect: { 'sis-rule-mixed': '2000' },
  },
];

const KHAMENEI: readonly Scenario[] = [
  // ── Decision 81: the Al-Bi'that Trust form (TECHNICAL expectations; salary 10000, rate 20) ──
  {
    id: 'kha-form-gradual',
    // Table 1: bought gradually or on loan: khums is 1/120 of the price 120000 → 2000 + 1000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('i', 'ASSET', 'HOUSEHOLD_ITEM', '999')],
    yes: [[KHA, 15, 'i']],
    numbers: [[KHA, 15, 'i', 'amount', '120000']],
    expect: { [KHA]: '3000' },
  },
  {
    id: 'kha-form-gradual-rounding',
    // 1/120 of 100 = 0.8333… → 0.83 (half up, minor unit) → 2000.83
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('i', 'ASSET', 'HOUSEHOLD_ITEM', '999')],
    yes: [[KHA, 15, 'i']],
    numbers: [[KHA, 15, 'i', 'amount', '100']],
    expect: { [KHA]: '2000.83' },
  },
  {
    id: 'kha-form-unknown-year',
    // Table 1: unknown whether a year passed: settlement at one tenth of 50000 → 2000 + 5000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('i', 'ASSET', 'HOUSEHOLD_ITEM', '999')],
    yes: [[KHA, 16, 'i']],
    numbers: [[KHA, 16, 'i', 'amount', '50000']],
    expect: { [KHA]: '7000' },
  },
  {
    id: 'kha-form-year-passed',
    // Guide 1: a year had passed on the money: price 1000 + 10% inflation → (10000 + 1100) × 20%
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('i', 'ASSET', 'HOUSEHOLD_ITEM', '999')],
    yes: [[KHA, 21, 'i']],
    numbers: [
      [KHA, 21, 'i', 'amount', '1000'],
      [KHA, 21, 'i', 'inflation', '10'],
    ],
    expect: { [KHA]: '2220' },
  },
  {
    id: 'kha-form-loan-capital',
    // Table 2 guide 1: bought on loan, 2000 repaid this year → 2400
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('b', 'ASSET', 'BUSINESS_EQUIPMENT', '9000'),
    ],
    yes: [[KHA, 20, 'b']],
    numbers: [[KHA, 20, 'b', 'amount', '2000']],
    expect: { [KHA]: '2400' },
  },
  {
    id: 'kha-form-mixed-unknown',
    // Note 11: parts unknown: one tenth of (1000 + 10% inflation) = 110 → 2110
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('b', 'ASSET', 'BUSINESS_EQUIPMENT', '9000'),
    ],
    yes: [[KHA, 19, 'b']],
    numbers: [
      [KHA, 19, 'b', 'amount', '1000'],
      [KHA, 19, 'b', 'inflation', '10'],
    ],
    expect: { [KHA]: '2110' },
  },
  {
    id: 'kha-form-mixed-known',
    // Note 11: parts known: only the liable part 3000 → 2600
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('b', 'ASSET', 'BUSINESS_EQUIPMENT', '9000'),
    ],
    yes: [[KHA, 18, 'b']],
    numbers: [[KHA, 18, 'b', 'amount', '3000']],
    expect: { [KHA]: '2600' },
  },
  {
    id: 'kha-form-dual-use',
    // Note 22: business share 30% of the price 2000 = 600 → 2120
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('v', 'ASSET', 'VEHICLE', '999')],
    yes: [
      [KHA, 22, 'v'],
      [KHA, 24, 'v'],
    ],
    numbers: [
      [KHA, 24, 'v', 'amount', '2000'],
      [KHA, 24, 'v', 'portion', '30'],
    ],
    expect: { [KHA]: '2120' },
  },
  {
    id: 'kha-form-beyond-status',
    // Table 1 / note 20: beyond need or status: khums on the price 1500 → 2300
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('i', 'ASSET', 'HOUSEHOLD_ITEM', '999')],
    yes: [
      [KHA, 22, 'i'],
      [KHA, 25, 'i'],
    ],
    numbers: [[KHA, 25, 'i', 'amount', '1500']],
    expect: { [KHA]: '2300' },
  },
  {
    id: 'kha-form-waqf',
    // Note 10: named for waqf but not handed over: counted at its value → 2800
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('h', 'ASSET', 'HOME', '4000')],
    yes: [[KHA, 11, 'h']],
    expect: { [KHA]: '2800' },
  },
  {
    id: 'kha-form-exemptions',
    // Exemptions: scholarship, income support, an institution's payment to heirs and dowry
    // received are not counted; khula property is income: (10000 + 1000) × 20% = 2200
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('a', 'INCOME', 'SCHOLARSHIP', '1000'),
      e('b', 'INCOME', 'INCOME_SUPPORT', '1000'),
      e('c', 'INCOME', 'DEATH_BENEFIT', '1000'),
      e('d', 'INCOME', 'DOWRY_RECEIVED', '1000'),
      e('k', 'INCOME', 'KHULA_RECEIVED', '1000'),
    ],
    expect: { [KHA]: '2200' },
  },
  {
    id: 'kha-form-provident-fund',
    // Note 9: the employer's gift part is not liable; gratuity and leave encashment are income
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'INCOME', 'PROVIDENT_FUND', '1000'),
      e('g', 'INCOME', 'GRATUITY', '1000'),
      e('l', 'INCOME', 'LEAVE_ENCASHMENT', '1000'),
    ],
    yes: [[KHA, 2, 'p']],
    expect: { [KHA]: '2400' },
  },
  {
    id: 'kha-form-inheritance',
    // Note 6: khums certainly due on this inheritance (entered as that part, 3000) → 2600
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('h', 'INCOME', 'INHERITANCE', '3000')],
    yes: [[KHA, 3, 'h']],
    expect: { [KHA]: '2600' },
  },
  {
    id: 'kha-form-salary-unpaid',
    // Note 7: salary unpaid by the khums date is next year's income → 2000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('r', 'ASSET', 'RECEIVABLE', '2000')],
    yes: [[KHA, 31, 'r']],
    expect: { [KHA]: '2000' },
  },
  {
    id: 'kha-form-sale-need-ended',
    // Note 18: need ended and held to trade: the rise is income, (10000 + 3000 − 2000) × 20%
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('x', 'INCOME', 'SALE', '3000'),
      e('c', 'EXPENSE', 'SOLD_ITEM_COST', '2000'),
    ],
    yes: [[KHA, 37, 'x']],
    rates: [[KHA, 'COST_OF_ITEMS_SOLD', 'c', '0']],
    expect: { [KHA]: '2200' },
  },
  {
    id: 'kha-form-prepaid',
    // Table 3 row 2: fees paid ahead for after the khums date are not deducted → 2000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('f', 'EXPENSE', 'EDUCATION', '1000')],
    yes: [
      [KHA, 5, 'f'],
      [KHA, 7, 'f'],
    ],
    expect: { [KHA]: '2000' },
  },
  {
    id: 'kha-form-needs-of-life',
    // Table 1 rows 6–8: family farm land, household animals, customary dowry → 2000
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('l', 'ASSET', 'LAND', '5000'),
      e('a', 'ASSET', 'LIVESTOCK', '2000'),
      e('d', 'ASSET', 'DOWRY_ITEMS', '3000'),
    ],
    yes: [
      [KHA, 12, 'l'],
      [KHA, 13, 'a'],
      [KHA, 14, 'd'],
    ],
    expect: { [KHA]: '2000' },
  },
  {
    id: 'kha-form-stock-animals',
    // Table 3 / notes 27–28: leftover stock 500 and sellable animals 1000 counted → 2300
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('f', 'ASSET', 'HOUSEHOLD_STOCK', '500', '2025-12-31'),
      e('a', 'ASSET', 'LIVESTOCK', '1000', '2025-12-31'),
      e('c', 'ASSET', 'CROPS_AND_TREES', '700', '2025-12-31'),
    ],
    yes: [[KHA, 52, 'a']],
    expect: { [KHA]: '2300' },
  },
  {
    id: 'kha-form-loan-given',
    // Note 29: lent from this year's income and not recoverable now: deducted → 1800
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('l', 'ASSET', 'LOAN_GIVEN', '1000', '2025-12-31'),
    ],
    yes: [[KHA, 54, 'l']],
    expect: { [KHA]: '1800' },
  },
  {
    id: 'kha-form-partnership',
    // Note 5: an untaxed share in your control: counted → 2400
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'ASSET', 'PARTNERSHIP_SHARE', '2000', '2025-12-31'),
    ],
    yes: [[KHA, 53, 'p']],
    expect: { [KHA]: '2400' },
  },
  {
    id: 'kha-form-minor',
    // Note 4: an assessment for a child below maturity: no khums
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000')],
    yes: [[KHA, 55]],
    expect: { [KHA]: '0' },
  },
  {
    id: 'kha-form-insurance-maturity',
    // Note 13: maturity payout: only 1500 above the premiums is income → 2300
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'INCOME', 'INSURANCE_PAYOUT', '5000'),
    ],
    yes: [[KHA, 51, 'p']],
    numbers: [[KHA, 51, 'p', 'amount', '1500']],
    expect: { [KHA]: '2300' },
  },
  {
    id: 'kha-form-hajj-capital-loss',
    // Note 19: Hajj savings are never deducted; note 23: a fixed-capital loss is not made up → 2000
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('h', 'BALANCE', 'HAJJ_SAVINGS', '1000', '2025-12-31'),
      e('l', 'EXPENSE', 'FIXED_CAPITAL_LOSS', '500'),
    ],
    expect: { [KHA]: '2000' },
  },
  {
    id: 'kha-form-shop-fitout',
    // Note 25: fixed shop decoration from this year's business income: (10000 + 5000 − 1000) × 20%
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('b', 'INCOME', 'BUSINESS', '5000'),
      e('f', 'EXPENSE', 'SHOP_FITOUT', '1000'),
    ],
    expect: { [KHA]: '2800' },
  },
  {
    id: 'kha-annual-household',
    // The same realistic year under the Khamenei rules (spending after the first income, car
    // needed, shares bought this year, wages collectable): 18,000
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '2400000'),
      e('r', 'INCOME', 'RENTAL', '360000'),
      e('rc', 'EXPENSE', 'BUSINESS', '60000'),
      e('h', 'EXPENSE', 'HOUSEHOLD', '1200000'),
      e('t', 'EXPENSE', 'TAX', '120000'),
      e('i', 'EXPENSE', 'INSURANCE', '30000'),
      e('ed', 'EXPENSE', 'EDUCATION', '150000'),
      e('cp', 'EXPENSE', 'ASSET_PURCHASE', '900000'),
      e('car', 'ASSET', 'VEHICLE', '850000', '2025-12-31'),
      e('sp', 'EXPENSE', 'ASSET_PURCHASE', '200000'),
      e('sh', 'ASSET', 'INVESTMENT', '240000', '2025-12-31'),
      e('w', 'ASSET', 'RECEIVABLE', '50000', '2025-12-31'),
      e('l', 'LIABILITY', 'LOAN', '100000', '2025-12-31'),
      e('k', 'EXPENSE', 'KHUMS_PAID', '40000'),
    ],
    yes: [
      [KHA, 5, 'h'],
      [KHA, 5, 't'],
      [KHA, 5, 'i'],
      [KHA, 5, 'ed'],
      [KHA, 23, 'car'],
      [KHA, 43, 'sh'],
      [KHA, 34, 'w'],
      [KHA, 8, 'l'],
    ],
    expect: { [KHA]: '18000' },
  },
  {
    id: 'kha-annual-expenses-exceed-income',
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '1000'),
      e('h', 'EXPENSE', 'HOUSEHOLD', '3000'),
      e('k', 'EXPENSE', 'KHUMS_PAID', '100'),
    ],
    yes: [[KHA, 5, 'h']],
    expect: { [KHA]: '0' },
  },
  {
    id: 'kha-annual-mahr-diyah',
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('m', 'INCOME', 'MAHR', '5000'),
      e('d', 'INCOME', 'DIYAH', '2000'),
    ],
    expect: { [KHA]: '2000' },
  },
  {
    id: 'kha-annual-insurance',
    // Premiums from the year's income are mu'nah: (10000 − 1000) × 20% = 1800
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('i', 'EXPENSE', 'INSURANCE', '1000')],
    yes: [[KHA, 5, 'i']],
    expect: { [KHA]: '1800' },
  },
  {
    id: 'kha-annual-insurance-investment',
    // Investment-type payments are liable each year end: not deducted, 2000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('i', 'EXPENSE', 'INSURANCE', '1000')],
    yes: [
      [KHA, 5, 'i'],
      [KHA, 49, 'i'],
    ],
    expect: { [KHA]: '2000' },
  },
  {
    id: 'kha-annual-insurance-payout',
    // Compensation paid to the insured is earned income: 2200
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'INCOME', 'INSURANCE_PAYOUT', '1000'),
    ],
    expect: { [KHA]: '2200' },
  },
  {
    id: 'kha-annual-life-insurance-family',
    // Life insurance paid to the insured's spouse or child is not liable: 2000
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'INCOME', 'INSURANCE_PAYOUT', '1000'),
    ],
    yes: [[KHA, 50, 'p']],
    expect: { [KHA]: '2000' },
  },
  {
    id: 'kha-annual-period-long',
    // Postponing the khums year is not allowed (Q235): a longer period stops for review
    period: { start: '2025-01-01', end: '2026-01-05' },
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000')],
    expect: { [KHA]: null },
  },
  {
    id: 'kha-annual-outside-year',
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('n', 'INCOME', 'EMPLOYMENT', '500', '2026-01-20'),
    ],
    expect: 'NEEDS_REVIEW',
  },
  {
    id: 'kha-annual-five-days',
    // Spending on needs within five days after the year end: (10000 − 2000) × 20% = 1600
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('h', 'EXPENSE', 'HOUSEHOLD', '2000', '2026-01-05'),
    ],
    yes: [[KHA, 5, 'h']],
    expect: { [KHA]: '1600' },
  },
  {
    id: 'kha-annual-five-days-late',
    // Six days after the year end: outside the five days, review stop
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('h', 'EXPENSE', 'HOUSEHOLD', '2000', '2026-01-06'),
    ],
    yes: [[KHA, 5, 'h']],
    expect: 'NEEDS_REVIEW',
  },
  {
    id: 'kha-annual-separate-cycle',
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('h', 'EXPENSE', 'HOUSEHOLD', '2000')],
    yes: [
      [KHA, 5, 'h'],
      [KHA, 36, 'h'],
    ],
    expect: 'NEEDS_REVIEW',
  },
  {
    id: 'kha-annual-debt-repaid-five-days',
    // A past needs debt repaid within five days after the year end: (10000 − 1000) × 20% = 1800
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('l', 'LIABILITY', 'LOAN', '1000', '2025-12-31'),
    ],
    yes: [[KHA, 8, 'l']],
    expect: { [KHA]: '1800' },
  },
  {
    id: 'kha-annual-sale-inflation',
    // Gain above cost plus 10% inflation: 3000 − 2000 × 1.1 = 800; (10000 + 800) × 20% = 2160
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('x', 'INCOME', 'SALE', '3000'),
      e('c', 'EXPENSE', 'SOLD_ITEM_COST', '2000'),
    ],
    rates: [[KHA, 'COST_OF_ITEMS_SOLD', 'c', '10']],
    expect: { [KHA]: '2160' },
  },
  {
    id: 'kha-annual-sale-munah',
    // Sale of mu'nah owes nothing: 10000 × 20% = 2000
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('x', 'INCOME', 'SALE', '3000'),
      e('c', 'EXPENSE', 'SOLD_ITEM_COST', '2000'),
    ],
    yes: [[KHA, 38, 'x']],
    rates: [[KHA, 'COST_OF_ITEMS_SOLD', 'c', '10']],
    expect: { [KHA]: '2000' },
  },
  {
    id: 'kha-annual-sale-stops',
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('x', 'INCOME', 'SALE', '3000')],
    yes: [[KHA, 40, 'x']],
    expect: 'NEEDS_REVIEW',
  },
  {
    id: 'kha-annual-capital-growth',
    // Working capital: 6000 − 5000 × 1.1 = 500 above last year's value plus inflation:
    // (10000 + 500) × 20% = 2100
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('end', 'ASSET', 'BUSINESS_STOCK', '6000', '2025-12-31'),
      e('start', 'ASSET', 'BUSINESS_STOCK', '5000', '2024-12-31'),
    ],
    yes: [
      [KHA, 43, 'end'],
      [KHA, 45, 'start'],
    ],
    rates: [[KHA, 'PREVIOUSLY_TAXED_VALUE', 'start', '10']],
    expect: { [KHA]: '2100' },
  },
  {
    id: 'kha-annual-shares-kept',
    // Shares kept for value from an earlier year: not counted until sold: 10000 × 20% = 2000
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('sh', 'ASSET', 'INVESTMENT', '3000', '2025-12-31'),
    ],
    expect: { [KHA]: '2000' },
  },
  {
    id: 'kha-annual-bank-inflation',
    // Deposit profit 600 less 4% inflation on the taxed principal 10000 (400): (10000 + 200) × 20%
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'INCOME', 'INVESTMENT_RETURN', '600'),
      e('d', 'BALANCE', 'BANK_ACCOUNT', '10000', '2024-12-31'),
    ],
    rates: [[KHA, 'TAXED_PRINCIPAL', 'd', '4']],
    expect: { [KHA]: '2040' },
  },
  {
    id: 'kha-annual-bank-untaxed-principal',
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'INCOME', 'INVESTMENT_RETURN', '600'),
      e('d', 'BALANCE', 'BANK_ACCOUNT', '10000', '2024-12-31'),
    ],
    yes: [[KHA, 46, 'd']],
    rates: [[KHA, 'TAXED_PRINCIPAL', 'd', '4']],
    expect: 'NEEDS_REVIEW',
  },
  {
    id: 'kha-annual-savings-marriage',
    // Savings for marriage after steps began are exempt: (10000 − 3000) × 20% = 1400
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('c', 'BALANCE', 'CASH', '3000', '2025-12-31'),
    ],
    yes: [[KHA, 48, 'c']],
    expect: { [KHA]: '1400' },
  },
  {
    id: 'kha-annual-savings-not-exempt',
    // Other savings stay part of the surplus (already counted through income): 2000
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('c', 'BALANCE', 'CASH', '3000', '2025-12-31'),
    ],
    expect: { [KHA]: '2000' },
  },
  {
    id: 'kha-annual-savings-near-future',
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('c', 'BALANCE', 'CASH', '3000', '2025-12-31'),
    ],
    yes: [[KHA, 47, 'c']],
    expect: 'NEEDS_REVIEW',
  },
  {
    id: 'kha-annual-tax',
    // Tax for this year's earnings is mu'nah: (10000 − 1000) × 20% = 1800
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('t', 'EXPENSE', 'TAX', '1000')],
    expect: { [KHA]: '1800' },
  },
  {
    id: 'kha-annual-tax-earlier-year',
    // Tax of an earlier year's earnings is not deducted: 10000 × 20% = 2000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('t', 'EXPENSE', 'TAX', '1000')],
    yes: [[KHA, 29, 't']],
    expect: { [KHA]: '2000' },
  },
  {
    id: 'kha-annual-khums-paid',
    // Khums paid during the year on this year's income: (10000 − 2000) × 20% − 500 = 1100
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('h', 'EXPENSE', 'HOUSEHOLD', '2000'),
      e('k', 'EXPENSE', 'KHUMS_PAID', '500'),
    ],
    yes: [[KHA, 5, 'h']],
    expect: { [KHA]: '1100' },
  },
  {
    id: 'kha-annual-khums-paid-earlier',
    // Last year's khums paid from this year's income (Q247): not deducted, 8000 × 20% = 1600
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('h', 'EXPENSE', 'HOUSEHOLD', '2000'),
      e('k', 'EXPENSE', 'KHUMS_PAID', '500'),
    ],
    yes: [
      [KHA, 5, 'h'],
      [KHA, 30, 'k'],
    ],
    expect: { [KHA]: '1600' },
  },
  {
    id: 'kha-annual-receivable',
    // Wages owed and collectable at the year end: (10000 + 2000) × 20% = 2400
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('r', 'ASSET', 'RECEIVABLE', '2000')],
    yes: [[KHA, 34, 'r']],
    expect: { [KHA]: '2400' },
  },
  {
    id: 'kha-annual-receivable-later',
    // Not collectable at the year end: income of the year received, 10000 × 20% = 2000
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('r', 'ASSET', 'RECEIVABLE', '2000')],
    yes: [
      [KHA, 34, 'r'],
      [KHA, 35, 'r'],
    ],
    expect: { [KHA]: '2000' },
  },
  {
    id: 'kha-annual-receivable-stops',
    // A credit sale needs the cash price and the mark-up separately: review stop
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('r', 'ASSET', 'RECEIVABLE', '2000')],
    yes: [[KHA, 32, 'r']],
    expect: 'NEEDS_REVIEW',
  },
  {
    id: 'kha-annual-salary',
    // Spent after the year's first income: (10000 − 6000) × 20% = 800
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('h', 'EXPENSE', 'HOUSEHOLD', '6000')],
    yes: [[KHA, 5, 'h']],
    expect: { [KHA]: '800' },
  },
  {
    id: 'kha-annual-spent-before-first-income',
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('h', 'EXPENSE', 'HOUSEHOLD', '6000')],
    expect: { [KHA]: '2000' },
  },
  {
    id: 'kha-annual-business-loss',
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('b', 'INCOME', 'BUSINESS', '2000'),
      e('c', 'EXPENSE', 'BUSINESS', '3000'),
      e('h', 'EXPENSE', 'HOUSEHOLD', '4000'),
    ],
    yes: [[KHA, 5, 'h']],
    expect: { [KHA]: '1200' },
  },
  {
    id: 'kha-annual-gifts',
    // Gifts, inheritance and support received are not liable: 5000 × 20% = 1000
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '5000'),
      e('g', 'INCOME', 'GIFT', '1000'),
      e('i', 'INCOME', 'INHERITANCE', '3000'),
      e('c', 'INCOME', 'CHARITY_RECEIVED', '500'),
    ],
    expect: { [KHA]: '1000' },
  },
  {
    id: 'kha-annual-contract-bonus',
    // Contractual bonus counts: (5000 + 1000) × 20% = 1200; a festive bonus does not
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '5000'), e('b', 'INCOME', 'BONUS', '1000')],
    yes: [[KHA, 0, 'b']],
    expect: { [KHA]: '1200' },
  },
  {
    id: 'kha-annual-festive-bonus',
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '5000'), e('b', 'INCOME', 'BONUS', '1000')],
    expect: { [KHA]: '1000' },
  },
  {
    id: 'kha-annual-debts',
    // Needs debt after the first income, and a business debt against business income:
    // (10000 + (3000 − 1000) − 2000) × 20% = 2000
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('b', 'INCOME', 'BUSINESS', '3000'),
      e('d', 'LIABILITY', 'BUSINESS_DEBT', '1000'),
      e('l', 'LIABILITY', 'LOAN', '2000'),
    ],
    yes: [
      [KHA, 8, 'l'],
      [KHA, 9, 'd'],
    ],
    expect: { [KHA]: '2000' },
  },
  {
    id: 'kha-annual-stops',
    // A survivors' pension is not liable (Q223): 5000 × 20% = 1000
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '5000'),
      e('p', 'INCOME', 'PENSION_OR_BENEFIT', '2000'),
    ],
    yes: [[KHA, 1, 'p']],
    expect: { [KHA]: '1000' },
  },
  {
    id: 'kha-annual-separate-lines-loss',
    entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000')],
    yes: [[KHA, 10]],
    expect: { [KHA]: null },
  },
  {
    id: 'kha-annual-holdings',
    // Unneeded item bought from this year's income: (10000 − 1000 + 800) × 20% = 1960
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'EXPENSE', 'ASSET_PURCHASE', '1000'),
      e('a', 'ASSET', 'HOUSEHOLD_ITEM', '800'),
    ],
    yes: [[KHA, 22, 'a']],
    expect: { [KHA]: '1960' },
  },
  {
    id: 'kha-annual-holdings-needed',
    // Needed and kept available: exempt even if unused: (10000 − 1000) × 20% = 1800
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'EXPENSE', 'ASSET_PURCHASE', '1000'),
      e('a', 'ASSET', 'HOUSEHOLD_ITEM', '800'),
    ],
    yes: [
      [KHA, 22, 'a'],
      [KHA, 23, 'a'],
    ],
    expect: { [KHA]: '1800' },
  },
  {
    id: 'kha-annual-capital-hardship',
    // Capital whose khums would leave too little to live on is exempt: (10000 − 3000) × 20% = 1400
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'EXPENSE', 'ASSET_PURCHASE', '3000'),
      e('a', 'ASSET', 'BUSINESS_STOCK', '3000'),
    ],
    yes: [
      [KHA, 22, 'a'],
      [KHA, 26, 'a'],
    ],
    expect: { [KHA]: '1400' },
  },
  {
    id: 'kha-annual-purchase-from-gift',
    // Bought with gift money: price not deducted, item not counted: 10000 × 20% = 2000
    entries: [
      e('s', 'INCOME', 'EMPLOYMENT', '10000'),
      e('p', 'EXPENSE', 'ASSET_PURCHASE', '1000'),
      e('a', 'ASSET', 'HOUSEHOLD_ITEM', '800'),
    ],
    yes: [[KHA, 28, 'p']],
    expect: { [KHA]: '2000' },
  },
  {
    id: 'kha-mined',
    entries: [e('m', 'INCOME', 'MINED_PRODUCT', '5000')],
    expect: { 'kha-rule-mined': '1000' },
  },
  {
    id: 'kha-mined-below-nisab',
    // Below the nisab: no khums on the mined product (stated explicitly)
    entries: [e('m', 'INCOME', 'MINED_PRODUCT', '5000')],
    yes: [['kha-rule-mined', 0]],
    expect: { 'kha-rule-mined': '0' },
  },
  {
    id: 'kha-treasure',
    entries: [e('t', 'INCOME', 'TREASURE', '2000')],
    expect: { 'kha-rule-treasure': '400' },
  },
  {
    id: 'kha-diving',
    entries: [e('d', 'INCOME', 'DIVING_GEMS', '1000')],
    expect: { 'kha-rule-diving': '200' },
  },
  {
    id: 'kha-mixed',
    entries: [e('x', 'BALANCE', 'MIXED_FUNDS', '10000')],
    expect: { 'kha-rule-mixed': '2000' },
  },
];

beforeAll(async () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CORS_ORIGINS: WEB,
    STAFF_AUTH_SECRET: 'integration-test-secret-0123456789abcdef',
    STAFF_EDGE_SECRET: EDGE_SECRET,
    KHUMS_OPERATIONAL_STATE: 'SCHOLAR_REVIEW',
  });
  if (!config.ok) throw new Error(config.error.join('\n'));
  app = await NestFactory.create<NestExpressApplication>(AppModule.register(config.value), {
    logger: false,
  });
  configureApp(app, config.value);
  await app.listen(0, '127.0.0.1');
  url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  const seeded = await bootstrapSuperAdmin(
    {
      store: app.get<StaffStore>(STAFF_STORE),
      hasher: app.get<PasswordHasher>(PASSWORD_HASHER),
      now: Date.now(),
    },
    ADMIN,
  );
  if (!seeded.ok) throw new Error(seeded.error.kind);
  admin = new Browser();
  expect((await admin.login(ADMIN.username, ADMIN.password)).status).toBe(200);
}, 60_000);
afterAll(() => app.close());

/**
 * Every entry type a person can choose, alone with a salary of 10000 and every question answered
 * No: the annual surplus result (20% of 10000 = 2000 before the entry) or REVIEW (the calculation
 * stops for review). TECHNICAL expectations of the encoded rules, never religious answers: "No"
 * is only the default answer here (for a held item it means "not bought with this year's income",
 * for Khamenei's spending "spent before the year's first income").
 */
const ENTRY_COVERAGE: readonly (readonly [string, string, string])[] = [
  ['ASSET:PRECIOUS_METAL', '2000', '2000'],
  ['ASSET:REAL_ESTATE', '2000', '2000'],
  ['ASSET:VEHICLE', '2000', '2000'],
  ['ASSET:INVESTMENT', '2000', '2000'],
  ['ASSET:BUSINESS_STOCK', '2000', '2000'],
  ['ASSET:HOUSEHOLD_ITEM', '2000', '2000'],
  ['ASSET:RECEIVABLE', '2000', '2000'],
  ['ASSET:HOME', '2000', '2000'],
  ['ASSET:LAND', '2000', '2000'],
  ['ASSET:JEWELLERY', '2000', '2000'],
  ['ASSET:PERSONAL_ITEM', '2000', '2000'],
  ['ASSET:BUSINESS_EQUIPMENT', '2000', '2000'],
  ['ASSET:DIGITAL_ASSET', 'REVIEW', 'REVIEW'],
  ['ASSET:JOINT_OWNERSHIP', 'REVIEW', 'REVIEW'],
  ['ASSET:LIVESTOCK', '2000', '2000'],
  ['ASSET:CROPS_AND_TREES', '2000', '2000'],
  ['ASSET:RAW_MATERIAL', '2000', '2000'],
  ['ASSET:HOUSEHOLD_STOCK', '2200', '2200'],
  ['ASSET:DOWRY_ITEMS', '2000', '2000'],
  ['ASSET:LOAN_GIVEN', '2000', '2000'],
  ['ASSET:COMMITTEE', '2000', '2000'],
  ['ASSET:PRIZE_BOND', '2000', '2000'],
  ['ASSET:PREPAID', '2000', '2000'],
  ['ASSET:PARTNERSHIP_SHARE', '2000', '2000'],
  ['ASSET:RENTAL_ASSET', '2000', '2000'],
  ['ASSET:OTHER', 'REVIEW', 'REVIEW'],
  ['BALANCE:CASH', 'REVIEW', '2000'],
  ['BALANCE:BANK_ACCOUNT', 'REVIEW', '2000'],
  ['BALANCE:DIGITAL_WALLET', 'REVIEW', '2000'],
  ['BALANCE:MIXED_FUNDS', '2000', '2000'],
  ['BALANCE:HAJJ_SAVINGS', '2000', '2000'],
  ['BALANCE:OTHER', 'REVIEW', 'REVIEW'],
  ['INCOME:EMPLOYMENT', '2200', '2200'],
  ['INCOME:BUSINESS', '2200', '2200'],
  ['INCOME:INVESTMENT_RETURN', '2200', '2200'],
  ['INCOME:RENTAL', '2200', '2200'],
  ['INCOME:SALE', '2200', '2200'],
  ['INCOME:GIFT', '2200', '2000'],
  ['INCOME:INHERITANCE', '2200', '2000'],
  ['INCOME:FREELANCE', '2200', '2200'],
  ['INCOME:BONUS', '2200', '2000'],
  ['INCOME:PENSION_OR_BENEFIT', '2200', '2200'],
  ['INCOME:CHARITY_RECEIVED', '2200', '2000'],
  ['INCOME:MINED_PRODUCT', '2000', '2000'],
  ['INCOME:TREASURE', '2000', '2000'],
  ['INCOME:DIVING_GEMS', '2000', '2000'],
  ['INCOME:MAHR', '2000', '2000'],
  ['INCOME:DIYAH', '2000', '2000'],
  ['INCOME:INSURANCE_PAYOUT', '2200', '2200'],
  ['INCOME:SCHOLARSHIP', '2200', '2000'],
  ['INCOME:INCOME_SUPPORT', '2200', '2000'],
  ['INCOME:DEATH_BENEFIT', '2200', '2000'],
  ['INCOME:DOWRY_RECEIVED', '2200', '2000'],
  ['INCOME:KHULA_RECEIVED', '2000', '2200'],
  ['INCOME:PROVIDENT_FUND', '2200', '2200'],
  ['INCOME:GRATUITY', '2200', '2200'],
  ['INCOME:LEAVE_ENCASHMENT', '2200', '2200'],
  ['INCOME:OTHER', 'REVIEW', 'REVIEW'],
  ['EXPENSE:HOUSEHOLD', '1800', '2000'],
  ['EXPENSE:HOUSING', '1800', '2000'],
  ['EXPENSE:EDUCATION', '1800', '2000'],
  ['EXPENSE:HEALTH', '1800', '2000'],
  ['EXPENSE:TRAVEL', '1800', '2000'],
  ['EXPENSE:BUSINESS', '2000', '2000'],
  ['EXPENSE:DONATION', '1800', '2000'],
  ['EXPENSE:RELIGIOUS_DUTY', '1800', '2000'],
  ['EXPENSE:TAX', '1800', '1800'],
  ['EXPENSE:INSURANCE', '1800', '2000'],
  ['EXPENSE:CAPITAL_LOSS', '2000', '2000'],
  ['EXPENSE:SOLD_ITEM_COST', '2000', 'REVIEW'],
  ['EXPENSE:ASSET_PURCHASE', '1800', '1800'],
  ['EXPENSE:KHUMS_PAID', '1000', '1000'],
  ['EXPENSE:FIXED_CAPITAL_LOSS', '1800', '2000'],
  ['EXPENSE:SHOP_FITOUT', '2000', '2000'],
  ['EXPENSE:OTHER', 'REVIEW', 'REVIEW'],
  ['LIABILITY:LOAN', '2000', '2000'],
  ['LIABILITY:MORTGAGE', '2000', '2000'],
  ['LIABILITY:CREDIT_CARD', '2000', '2000'],
  ['LIABILITY:UNPAID_BILL', '2000', '2000'],
  ['LIABILITY:BUSINESS_DEBT', '2000', '2000'],
  ['LIABILITY:UNPAID_KHUMS', 'REVIEW', 'REVIEW'],
  ['LIABILITY:UNPAID_MAHR', '2000', 'REVIEW'],
  ['LIABILITY:OTHER', 'REVIEW', 'REVIEW'],
];

it('decision 83: official monthly-CPI inflation for the test panel (IMF data, exact ratio)', async () => {
  const get = async (q: string) => {
    const r = await admin.call('GET', `/admin/rules/inflation?${q}`);
    expect(r.status).toBe(200);
    return ruleInflationResponseSchema.parse(r.json);
  };
  // Pakistan July 2023 → June 2024: 255.9426662530318 ÷ 235.2327780754696 − 1 = 8.80%
  expect(await get('currency=PKR&from=2023-07-15&to=2024-06-30')).toMatchObject({
    available: true,
    percent: '8.8',
    fromMonth: '2023-07',
    toMonth: '2024-06',
    latestPublished: false,
    economy: 'PAK',
  });
  // United States January 2020 → December 2025: 25.62%; euro area (HICP) March 2015 → November 2025
  expect((await get('currency=USD&from=2020-01-01&to=2025-12-31')).percent).toBe('25.62');
  expect(await get('currency=EUR&from=2015-03-01&to=2025-11-30')).toMatchObject({
    percent: '29.44',
    economy: 'G163',
  });
  // Before Pakistan's monthly series, or a currency with no monthly index: not available
  expect((await get('currency=PKR&from=2000-01-01&to=2024-06-30')).available).toBe(false);
  expect((await get('currency=NZD&from=2020-01-01&to=2024-06-30')).available).toBe(false);
  // Unknown fields and malformed dates are refused
  expect(
    (await admin.call('GET', '/admin/rules/inflation?currency=PKR&from=x&to=2024-01-01')).status,
  ).toBe(400);
});

it('the entry coverage table lists every predefined entry type', () => {
  const all = Object.entries(FINANCIAL_FACT_SUBTYPES).flatMap(([kind, subtypes]) =>
    (subtypes as readonly string[]).map((subtype) => `${kind}:${subtype}`),
  );
  expect(ENTRY_COVERAGE.map(([key]) => key)).toEqual(all);
});

describe.each([
  ['sistani', SISTANI],
  ['khamenei', KHAMENEI],
] as const)('%s annual rules (AI-prepared, approved for scholar testing)', (marjaId, scenarios) => {
  let rules: Map<string, { ruleId: string; content: BuilderRuleContent }>;
  beforeAll(async () => {
    rules = await importBundle(bundleOf(marjaId));
  }, 120_000);

  it('imports as DRAFT research and five complete rules, none verified', () => {
    expect([...rules.keys()]).toHaveLength(5);
  });

  it('every rule cites the scenarios that test it', () => {
    const tested = bundleOf(marjaId).rules.flatMap(
      (r) =>
        r.tests
          .split(':')[1]
          ?.split(',')
          .map((s) => s.trim()) ?? [],
    );
    for (const id of tested)
      expect(
        scenarios.some((s) => s.id === id),
        id,
      ).toBe(true);
  });

  it.each(scenarios.map((s) => [s.id, s] as const))('scenario %s', async (_id, scenario) => {
    await runScenario(marjaId, rules, scenario);
  });

  it.each(ENTRY_COVERAGE)('entry type %s (Sistani %s, Khamenei %s)', async (key, sis, kha) => {
    const [kind = '', subtype = ''] = key.split(':');
    const expected = marjaId === 'sistani' ? sis : kha;
    await runScenario(marjaId, rules, {
      id: `${marjaId} ${key}`,
      entries: [e('s', 'INCOME', 'EMPLOYMENT', '10000'), e('x', kind, subtype, '1000')],
      expect:
        expected === 'REVIEW' ? 'NEEDS_REVIEW' : { [marjaId === 'sistani' ? SIS : KHA]: expected },
    });
  });
});
