#!/usr/bin/env node
/**
 * Builds the AI-prepared research bundles (Phase 4, ARCHITECTURE §11 #74) from the research
 * sheets in docs/research/bundles/<marja>/:
 *
 * - sources.json          — one record per publication (official translations are their own source)
 * - sheets*.jsonl         — one own-words research sheet per ruling (never the ruling's text)
 *
 * and writes, per Marja, bundle.json for scripts/import-research-bundle.mjs, plus
 * docs/research/COVERAGE.md. Passages carry no text here: their verbatim text is fetched from the
 * office's own page by scripts/fetch-office-passages.mjs, run by the owner (copyright is stated on
 * no official page, so the text is never committed). Findings are DRAFTs written by AI from the
 * sheets: explicit statements only, every open point listed as unresolved; never verified by AI.
 *
 *   node scripts/build-research-bundle.mjs
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../docs/research/bundles/', import.meta.url));
const TOOL = 'Claude (Anthropic), Phase 4 research';
const DRAFT =
  'DRAFT prepared by AI from the explicit text only — not verified by a scholar. Every open point is listed under unresolved issues.';
const cut = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const uniq = (xs) => [...new Set(xs.filter((x) => typeof x === 'string' && x.trim() !== ''))];
const readJsonl = (dir) =>
  readdirSync(dir)
    .filter((f) => /^sheets.*\.jsonl$/.test(f))
    .sort()
    .flatMap((f) =>
      readFileSync(join(dir, f), 'utf8')
        .split('\n')
        .filter((l) => l.trim() !== '')
        .map((l) => ({ ...JSON.parse(l), file: f })),
    );

const QUESTIONS = readFileSync(
  new URL('../docs/research/RESEARCH_MATRIX.md', import.meta.url),
  'utf8',
)
  .split('\n')
  .map((l) => /^\| ([A-Z]{3}-\d{2}) +\| (.+?) \|/.exec(l))
  .filter(Boolean)
  .reduce((m, [, id, text]) => (m.has(id) ? m : m.set(id, text.trim())), new Map());

/** The 70 required catalogue questions (RESEARCH_MATRIX §2; the only ids a finding may cite). */
const REQUIRED =
  /^(INC-0[1-7]|EXP-0[1-6]|SUR-0[1-7]|SAV-0[1-4]|NEC-0[1-6]|PRO-0[1-6]|INV-0[1-5]|LIA-0[1-5]|BUS-0[1-5]|FTK-0[1-5]|MIS-0[1-6]|CTQ-0[1-8])$/;
const CATALOGUE = [...QUESTIONS.keys()].filter((q) => REQUIRED.test(q));
/** Matrix questions outside the 70 (adjacent and proposed): listed in ADDITIONAL_TOPICS.md. */
const ADDITIONAL = [...QUESTIONS.keys()].filter((q) => !REQUIRED.test(q) && q !== 'ADJ-05');
if (CATALOGUE.length !== 70)
  throw new Error(`expected 70 catalogue questions, found ${CATALOGUE.length}`);

const sheetText = (s, ref) =>
  cut(
    [
      `${ref} — ${s.topic}.`,
      `States (own words): ${s.states}`,
      s.conditions.length ? `Conditions: ${s.conditions.join('; ')}.` : null,
      s.exceptions.length ? `Exceptions: ${s.exceptions.join('; ')}.` : null,
      `Precaution as worded: ${s.precaution}.`,
      `Assessment types named by the text — annual: ${s.workflows.annual}; first-time: ${s.workflows.firstTime}; missed-year: ${s.workflows.missedYear}.`,
      `Calculator use: ${s.use}.`,
      s.issues.length ? `Open: ${s.issues.join(' | ')}` : null,
    ]
      .filter(Boolean)
      .join(' '),
    1990,
  );

function buildMarja(marjaId) {
  const dir = join(ROOT, marjaId);
  const sources = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
  const sheets = readJsonl(dir);
  const records = sources.map((s) => ({
    key: s.key,
    type: 'sources',
    payload: s.payload,
    refs: [],
    ai: s.ai,
  }));
  const passages = new Map(); // passage key → { record, sheets: [] }
  const sheetPassages = []; // [sheet, ref label, passage keys]

  // Decision 81: `inline` is a short verbatim excerpt of a scholar-provided document (no fetch).
  const passage = (key, sourceKey, locator, language, fetch, label, inline = null) => {
    if (!passages.has(key)) {
      passages.set(key, {
        record: {
          key,
          type: 'passages',
          ...(inline === null ? { fetch } : {}),
          payload: {
            locator,
            originalLanguage: language,
            text: inline ?? '@fetch',
            precautionWording: null,
            notes: null,
          },
          refs: [sourceKey],
          ai: [{ assistance: 'TEXT_TRANSCRIPTION', field: 'text' }],
        },
        label,
        sheets: [],
      });
    }
    return key;
  };
  const loc = (o) => ({
    volume: null,
    page: null,
    masalah: null,
    istiftaId: null,
    section: null,
    url: null,
    ...o,
  });

  for (const s of sheets) {
    const keys = [];
    let ref;
    if (s.file === 'sheets-bithat.jsonl') {
      // Decision 81: the Al-Bi'that Trust khums form (owner-accepted scholar source), quoted.
      const prefix = marjaId === 'sistani' ? 'sis' : 'kha';
      ref = `Al-Bi'that khums form, ${s.section}`;
      keys.push(
        passage(
          `${prefix}-p-bithat-${s.item}`,
          `${prefix}-src-bithat-form`,
          loc({ page: String(s.page), section: s.section }),
          'ur',
          null,
          ref,
          s.quote,
        ),
      );
    } else if (
      marjaId === 'sistani' &&
      (s.file === 'sheets.jsonl' || s.file === 'sheets-taqlid.jsonl')
    ) {
      ref = `Tawdih ${s.n}`;
      const fa = `https://www.sistani.org/persian/book/50/${s.fa}/`;
      const en = `https://www.sistani.org/english/book/48/${s.page}/`;
      keys.push(
        passage(
          `sis-p-tawdih-${s.n}`,
          'sis-src-tawdih-fa',
          loc({ masalah: String(s.n), section: s.n < 100 ? 'احکام تقلید' : 'احکام خمس', url: fa }),
          'fa',
          { kind: 'sistani-tawdih-fa', url: fa, n: s.n },
          ref,
        ),
        passage(
          `sis-p-en-${s.n}`,
          'sis-src-islamic-laws-en',
          loc({
            masalah: String(s.n),
            section: s.n < 100 ? 'Following a Jurist (Taqlid)' : 'Chapter Six: Khums',
            url: en,
          }),
          'en',
          { kind: 'sistani-en', url: en, n: s.n },
          `Islamic Laws ${s.n} (official translation)`,
        ),
      );
    } else if (marjaId === 'sistani' && s.file === 'sheets-qa.jsonl') {
      ref = `Sistani Q&A (Khums) item ${s.qn}`;
      const url = 'https://www.sistani.org/persian/qa/0893/';
      keys.push(
        passage(
          `sis-p-qa-${s.qn}`,
          'sis-src-qa-fa',
          loc({ istiftaId: String(s.qn), section: 'پرسش و پاسخ — خمس', url }),
          'fa',
          { kind: 'sistani-qa', url, qn: s.qn },
          ref,
        ),
      );
    } else if (marjaId === 'sistani') {
      ref = `Jami' ${s.n}`;
      const url = `https://www.sistani.org/persian/book/26576/${s.section}/`;
      keys.push(
        passage(
          `sis-p-jami-${s.n}`,
          'sis-src-jami-fa',
          loc({ masalah: String(s.n), section: `Jami' vol. 2, section ${s.section}`, url }),
          'fa',
          { kind: 'sistani-jami', url, n: s.n },
          ref,
        ),
      );
    } else if (s.file === 'sheets-ajwibah.jsonl') {
      ref = `Ajwibah Q${s.qn}`;
      const url =
        'https://www.leader.ir/fa/book/2/%D8%A7%D8%AC%D9%88%D8%A8%D8%A9-%D8%A7%D9%84%D8%A7%D8%B3%D8%AA%D9%81%D8%AA%D8%A7%D8%A6%D8%A7%D8%AA';
      keys.push(
        passage(
          `kha-p-ajwibah-${s.qn}`,
          'kha-src-ajwibah',
          loc({ istiftaId: `س ${s.qn}`, section: 'احکام تقلید', url }),
          'fa',
          { kind: 'khamenei-ajwibah', qn: s.qn },
          ref,
        ),
      );
    } else {
      const heading = s.heading.replace(/\s+/g, ' ').trim();
      ref = `Ahkam-e Khums «${heading}»${s.item > 200 ? ` Q${s.item}` : ''}`;
      const url =
        'https://www.leader.ir/fa/book/215/%D8%A7%D8%AD%DA%A9%D8%A7%D9%85-%D8%AE%D9%85%D8%B3';
      const key = `kha-p-${heading.replace(/[^\p{L}\p{N}]+/gu, '-')}`;
      keys.push(
        passage(
          key,
          'kha-src-ahkam-khums',
          loc({ section: heading, url }),
          'fa',
          { kind: 'khamenei-ahkam', heading },
          `Ahkam-e Khums «${heading}»`,
        ),
      );
    }
    for (const k of keys) passages.get(k).sheets.push(s);
    sheetPassages.push([s, ref, keys]);
  }

  for (const p of passages.values()) {
    const notes = `AI research sheet(s), own words, not the ruling's text; not verified by a scholar. ${p.sheets
      .map((s) => sheetText(s, p.label))
      .join(' || ')}`;
    p.record.payload.notes = cut(notes, 4000);
    records.push(p.record);
  }

  // Findings: one DRAFT per catalogue question that the sheets touch.
  const byQuestion = new Map();
  for (const [s, ref, keys] of sheetPassages) {
    for (const q of s.q) {
      if (!CATALOGUE.includes(q) && !ADDITIONAL.includes(q)) {
        throw new Error(`${marjaId}: unknown question ${q} in ${ref}`);
      }
      if (!byQuestion.has(q)) byQuestion.set(q, []);
      byQuestion.get(q).push([s, ref, keys]);
    }
  }
  const coverage = new Map();
  for (const q of ADDITIONAL) coverage.set(q, byQuestion.get(q) ?? []);
  for (const q of CATALOGUE) {
    const items = byQuestion.get(q) ?? [];
    coverage.set(q, items);
    if (items.length === 0) continue;
    const prec = uniq(items.map(([s]) => s.precaution.split(' ')[0]));
    const named = (w) =>
      uniq(items.filter(([s]) => s.workflows[w].startsWith('named')).map(([, ref]) => ref));
    const payload = {
      language: 'en',
      scenario: null,
      conclusion: cut(`${DRAFT} ${items.map(([s, ref]) => `${ref}: ${s.states}`).join(' ')}`, 4000),
      explanation: cut(items.map(([s, ref]) => sheetText(s, ref)).join('\n'), 12000),
      precaution:
        prec.length === 1 && ['FATWA', 'OBLIGATORY_PRECAUTION'].includes(prec[0])
          ? prec[0]
          : 'UNDETERMINED',
      conditions: uniq(items.flatMap(([s, ref]) => s.conditions.map((c) => `${c} (${ref})`)))
        .slice(0, 30)
        .map((c) => cut(c, 2000)),
      exceptions: uniq(items.flatMap(([s, ref]) => s.exceptions.map((c) => `${c} (${ref})`)))
        .slice(0, 30)
        .map((c) => cut(c, 2000)),
      qualifications: [
        `Annual assessment named by: ${named('annual').join(', ') || 'none'}.`,
        `First-time assessment named by: ${named('firstTime').join(', ') || 'none'}.`,
        `Missed-year assessment named by: ${named('missedYear').join(', ') || 'none'}.`,
      ].map((c) => cut(c, 2000)),
      unresolvedIssues: uniq(items.flatMap(([s, ref]) => s.issues.map((i) => `${ref}: ${i}`)))
        .slice(0, 30)
        .map((c) => cut(c, 2000)),
      notes: `Prepared by AI from the research sheets of ${items.length} ruling(s) (decision 74). AI never verifies; this finding must be verified in the Research Workspace before it can support a public rule.`,
    };
    records.push({
      key: `${marjaId}-f-${q}`,
      type: 'findings',
      questionId: q,
      payload,
      refs: uniq(items.flatMap(([, , keys]) => keys)).slice(0, 200),
      ai: [{ assistance: 'FINDING_DRAFT', field: 'payload' }],
    });
  }

  // Phase 4 P4-3: research rulings (DRAFT) and Rule Builder rules prepared from the findings.
  const slug = (heading) =>
    `kha-p-${heading
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')}`;
  const resolveRef = (ref) => (ref.startsWith('kha:') ? slug(ref.slice(4)) : ref);
  const known = new Set(records.map((r) => r.key));
  const rulesFile = join(dir, 'rules.json');
  const authored = existsSync(rulesFile)
    ? JSON.parse(readFileSync(rulesFile, 'utf8'))
    : { rulings: [], rules: [] };
  for (const ruling of authored.rulings) {
    const refs = ruling.refs.map(resolveRef);
    for (const ref of refs)
      if (!known.has(ref)) throw new Error(`${ruling.key}: unknown reference ${ref}`);
    records.push({
      key: ruling.key,
      type: 'rulings',
      payload: ruling.payload,
      refs,
      ai: [{ assistance: 'FINDING_DRAFT', field: 'payload' }],
    });
    known.add(ruling.key);
  }
  const rules = authored.rules.map((rule) => {
    const at = (ref) => {
      const key = resolveRef(ref.slice(1));
      if (!known.has(key)) throw new Error(`${rule.key}: unknown reference ${ref}`);
      return `@${key}`;
    };
    return {
      key: rule.key,
      aiStage: 'APPROVED_FOR_SCHOLAR_TESTING',
      tests: `Scenarios in apps/api/test/annual-rules.integration.test.ts: ${rule.tests}`,
      content: {
        ...rule.content,
        rulingId: at(rule.content.rulingId),
        sourceRefs: rule.content.sourceRefs.map(at),
      },
    };
  });
  const bundle = { marjaId, tool: TOOL, records, rules };
  writeFileSync(join(dir, 'bundle.json'), `${JSON.stringify(bundle, null, 1)}\n`);
  return {
    marjaId,
    sheets,
    passages: passages.size,
    findings: records.filter((r) => r.type === 'findings').length,
    rulings: authored.rulings.length,
    rules: rules.length,
    coverage,
  };
}

const results = ['sistani', 'khamenei'].map(buildMarja);

// docs/research/COVERAGE.md
const cell = (items) => {
  if (items.length === 0) return '—';
  const uses = uniq(items.map(([s]) => s.use));
  return `${items.length} (${uses.join(', ')})`;
};
const wf = (items, w) =>
  items.some(([s]) => s.workflows[w].startsWith('named'))
    ? '✓'
    : items.some(([s]) => s.workflows[w].startsWith('relevant'))
      ? '~'
      : '';
const row = (q) => {
  const [s, k] = results.map((r) => r.coverage.get(q) ?? []);
  return `| ${q} | ${cell(s)} | ${wf(s, 'annual')} / ${wf(s, 'firstTime')} / ${wf(s, 'missedYear')} | ${cell(k)} | ${wf(k, 'annual')} / ${wf(k, 'firstTime')} / ${wf(k, 'missedYear')} |`;
};
const lines = [
  '# Research coverage (Phase 4, generated)',
  '',
  'Generated by `scripts/build-research-bundle.mjs` from the AI research sheets in',
  '`docs/research/bundles/`. **Not verified by a scholar.** Counts are rulings read in full; the',
  'calculator use is the AI classification (RULE: explicit and calculable; RULE_WITH_STOP: explicit',
  'but needs an input or capability, otherwise a review stop; STOP: interpretation, settlement or',
  'outside the inputs; GUIDANCE: payment or conduct, not calculation; OUT_OF_SCOPE). Workflow',
  'columns: ✓ the text itself names the assessment type, ~ relevant but not named.',
  '',
  ...results.map(
    (r) =>
      `- ${r.marjaId}: ${r.sheets.length} rulings, ${r.passages} passages, ${r.findings} draft findings.`,
  ),
  '',
  '| Question | Sistani | S: annual / first / missed | Khamenei | K: annual / first / missed |',
  '| -------- | ------- | -------------------------- | -------- | -------------------------- |',
  ...CATALOGUE.map((q) => row(q)),
  '',
  '## Beyond the 70 questions',
  '',
  'Matrix questions outside the required catalogue (adjacent and proposed; RESEARCH_MATRIX).',
  'Rulings found for them are recorded as passages; findings cannot cite them until the owner',
  'adds them to the catalogue. See `docs/research/ADDITIONAL_TOPICS.md`.',
  '',
  '| Question | Sistani | S: annual / first / missed | Khamenei | K: annual / first / missed |',
  '| -------- | ------- | -------------------------- | -------- | -------------------------- |',
  ...ADDITIONAL.map((q) => row(q)),
  '',
];
writeFileSync(new URL('../docs/research/COVERAGE.md', import.meta.url), lines.join('\n'));
for (const r of results) {
  console.log(
    `build: ${r.marjaId}: ${r.sheets.length} sheets → ${r.passages} passages, ${r.findings} findings, ${r.rulings} rulings, ${r.rules} rules`,
  );
}
