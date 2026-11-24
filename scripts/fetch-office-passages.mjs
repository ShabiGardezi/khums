#!/usr/bin/env node
/**
 * Fetches the verbatim text of every passage cited by an AI-prepared research bundle (Phase 4)
 * from the Marja office's own publication, for the owner to load into the Research Workspace.
 *
 *   node scripts/fetch-office-passages.mjs docs/research/bundles/sistani/bundle.json
 *   node scripts/fetch-office-passages.mjs docs/research/bundles/khamenei/bundle.json --check
 *
 * The text is written to `<bundle dir>/.passage-cache.json` (git-ignored, never committed or
 * published: copyright is stated on no official page). `--check` fetches and extracts but saves
 * nothing and prints only whether each passage was found and its length. One ruling (or one
 * chapter heading for Khamenei's book) per passage, at most 8,000 characters (an excerpt, never a
 * complete work). scripts/import-research-bundle.mjs reads the cache.
 *
 * Sources: sistani.org pages (Tawdih in Persian and the office's English edition, Tawdih Jami'
 * vol. 2, the Khums Q&A page) and the leader.ir EPUB exports of «احکام خمس» and
 * «اجوبة الاستفتائات». The EPUBs are unpacked with the system `unzip` into a temporary folder.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const MAX = 8000;
const bundlePath = process.argv[2];
const checkOnly = process.argv.includes('--check');
if (bundlePath === undefined) {
  console.error('usage: fetch-office-passages.mjs <bundle.json> [--check]');
  process.exit(1);
}
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
const cachePath = join(dirname(bundlePath), '.passage-cache.json');

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const toLatin = (s) => s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&zwnj;/g, '‌')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
const htmlText = (html) =>
  decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<(br|\/p|\/div|\/h\d|\/li)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

const pages = new Map();
async function page(url) {
  if (!pages.has(url)) {
    const response = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (research fetch)' },
    });
    if (!response.ok) throw new Error(`${url}: HTTP ${String(response.status)}`);
    pages.set(url, htmlText(await response.text()));
  }
  return pages.get(url);
}

/** The text of numbered ruling `n` on a page whose rulings start with `marker N`. */
function numbered(text, markerRe, n) {
  const re = new RegExp(markerRe, 'g');
  const hits = [...text.matchAll(re)].map((m) => ({ index: m.index, n: Number(toLatin(m[1])) }));
  const at = hits.findIndex((h) => h.n === n);
  if (at === -1) return null;
  const end = hits[at + 1]?.index ?? text.length;
  return text
    .slice(hits[at].index, end)
    .replace(/\n\[\d+\][\s\S]*$/, '')
    .trim();
}

const epubs = new Map();
function epubText(url) {
  if (!epubs.has(url)) {
    const dir = mkdtempSync(join(tmpdir(), 'khums-epub-'));
    try {
      execFileSync('curl', ['-sSL', '-A', 'Mozilla/5.0', '-o', join(dir, 'book.epub'), url]);
      execFileSync('unzip', ['-oq', join(dir, 'book.epub'), '-d', join(dir, 'x')]);
      const files = [];
      const walk = (d) => {
        for (const f of readdirSync(d, { withFileTypes: true })) {
          if (f.isDirectory()) walk(join(d, f.name));
          else if (/^page_\d+\.html$/.test(f.name)) files.push(join(d, f.name));
        }
      };
      walk(join(dir, 'x'));
      files.sort(
        (a, b) => Number(/(\d+)\.html$/.exec(a)?.[1]) - Number(/(\d+)\.html$/.exec(b)?.[1]),
      );
      epubs.set(
        url,
        files.map((f) => htmlText(readFileSync(f, 'utf8')).replace(/^Book\n/, '')).join('\n'),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return epubs.get(url);
}

const norm = (x) => x.replace(/‌/g, ' ').replace(/[ً-ْ]/g, '').replace(/\s+/g, ' ').trim();
function isHeading(line) {
  const t = line.trim();
  if (t === '' || line.startsWith('\t') || t.length > 75 || t.includes('؟')) return false;
  if ('.:؛،'.includes(t.at(-1)) || /^[0-9۰-۹]/.test(t)) return false;
  return !(t.endsWith(')') && !t.includes('('));
}
/** All body text under every occurrence of `heading` (until the next heading). */
function headingSection(text, heading) {
  const want = norm(heading);
  const out = [];
  let on = false;
  for (const line of text.split('\n')) {
    if (isHeading(line)) on = norm(line) === want;
    else if (on) out.push(line);
  }
  return out.length ? out.join('\n').trim() : null;
}

const AHKAM =
  'https://www.leader.ir/fa/book/215/epub/download/%D8%A7%D8%AD%DA%A9%D8%A7%D9%85-%D8%AE%D9%85%D8%B3';
const AJWIBAH =
  'https://www.leader.ir/fa/book/2/epub/download/%D8%A7%D8%AC%D9%88%D8%A8%D8%A9-%D8%A7%D9%84%D8%A7%D8%B3%D8%AA%D9%81%D8%AA%D8%A7%D8%A6%D8%A7%D8%AA';

async function extract(f) {
  switch (f.kind) {
    case 'sistani-tawdih-fa':
      return numbered(await page(f.url), '(?:^|\\n)\\s*مسأله\\s*([۰-۹0-9]+)', f.n);
    case 'sistani-en':
      return numbered(await page(f.url), 'Ruling (\\d{1,4})\\.', f.n);
    case 'sistani-jami':
      return numbered(await page(f.url), 'مسأله\\s*([۰-۹0-9]+)\\s*\\.', f.n);
    case 'sistani-qa':
      return numbered(await page(f.url), '\\n([۰-۹0-9]{1,3})\\n(?=پرسش)', f.qn);
    case 'khamenei-ahkam':
      return headingSection(epubText(AHKAM), f.heading);
    case 'khamenei-ajwibah':
      return numbered(epubText(AJWIBAH), '(?:^|\\n)س ([0-9۰-۹]+)\\.', f.qn);
    default:
      throw new Error(`unknown fetch kind ${String(f.kind)}`);
  }
}

const cache = {};
let found = 0;
const problems = [];
for (const record of bundle.records) {
  if (record.type !== 'passages' || record.fetch === undefined) continue;
  let text = null;
  try {
    text = await extract(record.fetch);
  } catch (error) {
    problems.push(`${record.key}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  if (text === null || text.length === 0) problems.push(`${record.key}: not found`);
  else if (text.length > MAX)
    problems.push(`${record.key}: ${String(text.length)} characters (over ${String(MAX)})`);
  else {
    found += 1;
    if (!checkOnly) cache[record.key] = text;
  }
}
if (!checkOnly) writeFileSync(cachePath, `${JSON.stringify(cache, null, 1)}\n`);
console.log(
  `fetch: ${bundle.marjaId}: ${String(found)} passages found${checkOnly ? ' (check only, nothing saved)' : `, saved to ${cachePath}`}.`,
);
for (const p of problems) console.log(`fetch: problem: ${p}`);
process.exitCode = problems.length > 0 ? 1 : 0;
