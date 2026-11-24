#!/usr/bin/env node
/**
 * Imports an AI-prepared research bundle (Phase 4, ARCHITECTURE §11 #74–#76) into a running
 * Khums app through its public staff API: sources, verbatim passages, translations, findings and
 * rulings as DRAFT research records with their AI involvement declared, then Rule Builder rules
 * with their AI preparation stage. Nothing is verified or approved here: AI never verifies, and
 * every record stays DRAFT until an authorised scholar acts on it.
 *
 *   KHUMS_BASE_URL=http://localhost:3101 \
 *   KHUMS_IMPORT_USERNAME=… KHUMS_IMPORT_PASSWORD=… \
 *   node scripts/import-research-bundle.mjs docs/research/bundles/sistani/bundle.json
 *
 * Against a local web tier that requires the edge signature, add KHUMS_LOCAL_CLIENT_IP=1.
 *
 * Run scripts/fetch-office-passages.mjs on the bundle first: passages carry their verbatim text
 * only in the local, git-ignored cache it writes.
 *
 * The base URL is the WEB origin (its proxy signs requests for the API). The account is a staff
 * account allowed to write research and builder rules for the bundle's Marja; the server records
 * it as the actor, and each record declares the AI involvement. Credentials are read from the
 * environment only and never printed. Importing into a hosted or Atlas-backed deployment needs
 * the owner's explicit approval.
 *
 * Idempotent: created ids are kept in `<bundle dir>/.import-state.<host>.json` (git-ignored).
 * A record that still exists is reused. A changed payload or reference list is reported and
 * revised only with `--revise-drafts`, only while the record is DRAFT and only if nobody revised
 * it after this import wrote it;
 * a builder rule whose content or AI stage changed gets a new revision.
 *
 * Bundle format (JSON):
 *   { "marjaId": "sistani", "tool": "<AI tool>",
 *     "records": [ { "key", "type": "sources|passages|translations|findings|rulings",
 *                    "questionId"?, "payload", "refs": ["<key>", …],
 *                    "ai": [ { "assistance", "field" } ] } ],
 *     "rules": [ { "key", "content": { …builder content; "rulingId": "@<key>",
 *                  "sourceRefs": ["@<key>"] }, "aiStage", "tests" } ] }
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ENTITY = {
  sources: 'SOURCE',
  passages: 'PASSAGE',
  translations: 'TRANSLATION',
  findings: 'FINDING',
  rulings: 'RULING',
};

const fail = (message) => {
  console.error(`import: ${message}`);
  process.exit(1);
};

const bundlePath = process.argv[2];
if (bundlePath === undefined) fail('usage: import-research-bundle.mjs <bundle.json>');
const base = process.env.KHUMS_BASE_URL;
/** Asks on the terminal (the password is not echoed); never printed or stored. */
async function ask(question, hidden) {
  if (!process.stdin.isTTY) return '';
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    rl._writeToOutput = (text) => {
      if (text.startsWith(question)) process.stdout.write(question);
    };
  }
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  if (hidden) process.stdout.write('\n');
  return answer.trim();
}
const username = process.env.KHUMS_IMPORT_USERNAME || (await ask('Staff username: ', false));
const password = process.env.KHUMS_IMPORT_PASSWORD || (await ask('Staff password: ', true));
if (!base || !username || !password) {
  fail('set KHUMS_BASE_URL, and give a staff username and password (prompted on a terminal)');
}
const origin = new URL(base).origin;
/**
 * A web tier on this machine signs API requests only when they carry the client-IP header the
 * hosted edge would set (KHUMS_CLIENT_IP_HEADER, normally x-forwarded-for). For a local web origin
 * only, KHUMS_LOCAL_CLIENT_IP=1 sends it as loopback; on a hosted origin the edge sets it.
 */
const localClientIp =
  process.env.KHUMS_LOCAL_CLIENT_IP === '1' &&
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname);
if (process.env.KHUMS_LOCAL_CLIENT_IP === '1' && !localClientIp) {
  fail('KHUMS_LOCAL_CLIENT_IP is only for a web origin on this machine');
}
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
// Passage text: '@fetch' is replaced from the cache written by scripts/fetch-office-passages.mjs.
// TEST ONLY: --test-placeholder-text loads a labelled placeholder instead (local checks of the
// records against the API; never for real research records).
const placeholder = process.argv.includes('--test-placeholder-text');
/** Revise DRAFT research records this import created whose bundle content changed (opt-in). */
const reviseDrafts = process.argv.includes('--revise-drafts');
const cachePath = join(dirname(bundlePath), '.passage-cache.json');
const passageCache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
const passageText = (record) => {
  if (record.payload.text !== '@fetch') return record.payload.text;
  if (placeholder) return `TEST PLACEHOLDER — not the office's text (${record.key})`;
  const text = passageCache[record.key];
  if (typeof text !== 'string' || text === '') {
    fail(`${record.key} has no fetched text: run scripts/fetch-office-passages.mjs first`);
  }
  return text;
};
const statePath = join(
  dirname(bundlePath),
  `.import-state.${new URL(base).host.replace(/[^a-z0-9.-]/gi, '_')}.json`,
);
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
const saveState = () => writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

// ── A minimal staff browser: cookie jar, origin, CSRF header from the readable cookie ──
const jar = new Map();
async function call(method, path, body) {
  const headers = { origin, 'sec-fetch-site': 'same-origin' };
  if (localClientIp) headers['x-forwarded-for'] = '127.0.0.1';
  if (jar.size > 0) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const csrf = jar.get('__Host-khums_csrf') ?? jar.get('khums_csrf');
  if (method !== 'GET' && csrf !== undefined) headers['x-csrf-token'] = csrf;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${origin}/api/v1${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(';');
    const at = pair.indexOf('=');
    jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
  const text = await response.text();
  let json = null;
  try {
    json = text === '' ? null : JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json };
}
/** JSON with object keys sorted (stable comparison of API echoes). */
const canonical = (value) =>
  JSON.stringify(value, (_k, v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
const problem = (r) => `${String(r.status)} ${r.json?.code ?? ''} ${r.json?.detail ?? ''}`.trim();

const login = await call('POST', '/staff/auth/login', { username, password });
if (login.status !== 200) fail(`sign-in refused (${problem(login)})`);

const marjaId = bundle.marjaId;
const now = new Date().toISOString();
const declarations = (ai) =>
  (ai ?? []).map((d) => ({
    assistance: d.assistance,
    field: d.field,
    generation: 'AI_GENERATED',
    tool: bundle.tool,
    occurredAt: now,
    scholarReview: 'NOT_REVIEWED',
  }));

// ── Pre-flight (nothing is written if it fails) ──
// Never overwrite or collide with scholar work: if the Marja already has builder rules that this
// import did not create (and that are not rejected), stop before creating any rule.
{
  const listed = await call('GET', `/admin/rules?marjaId=${encodeURIComponent(marjaId)}`);
  if (listed.status !== 200) fail(`could not list existing rules (${problem(listed)})`);
  const ours = new Set(
    Object.values(state)
      .map((v) => v.ruleId)
      .filter(Boolean),
  );
  const others = listed.json.rules.filter((r) => !ours.has(r.ruleId) && r.rejected !== true);
  if (others.length > 0 && (bundle.rules ?? []).length > 0) {
    fail(
      `${String(others.length)} existing ${marjaId} rule(s) were not created by this import ` +
        `(${others.map((r) => r.ruleId).join(', ')}). Nothing was imported. Review those rules ` +
        'with the scholar first (reject or reconcile), then re-run.',
    );
  }
}
// A source of this bundle that already exists but is not in the local state means an earlier
// import whose state file is missing: stop rather than create duplicates.
for (const source of bundle.records.filter((r) => r.type === 'sources')) {
  if (state[source.key] !== undefined) continue;
  const listed = await call(
    'GET',
    `/admin/research/sources?marjaId=${encodeURIComponent(marjaId)}&limit=100`,
  );
  if (listed.status !== 200) fail(`could not list existing sources (${problem(listed)})`);
  const title = source.payload.title.original;
  if (listed.json.items.some((item) => item.label.includes(title))) {
    fail(
      `a source titled "${title}" already exists but is not in ${statePath}: an earlier import's ` +
        'state is missing. Nothing was imported; restore the state file before re-running.',
    );
  }
}

// ── Research records, in bundle order (references must come first) ──
const records = new Map(); // key → { type, entityId, revision, rulingVersion }
const referencesOf = (record) =>
  (record.refs ?? []).map((key) => {
    const ref = records.get(key);
    if (ref === undefined) fail(`${record.key} references unknown or later key ${key}`);
    return {
      entityType: ENTITY[ref.type],
      entityId: ref.entityId,
      revision: ref.revision,
      rulingVersion: ref.type === 'rulings' ? ref.rulingVersion : null,
      marjaId,
    };
  });
let created = 0;
let reused = 0;
let changed = 0;
let revisedRecords = 0;
for (const record of bundle.records) {
  const known = state[record.key];
  if (known !== undefined) {
    const found = await call('GET', `/admin/research/${known.type}/${known.entityId}`);
    if (found.status === 200) {
      records.set(record.key, {
        type: known.type,
        entityId: known.entityId,
        revision: found.json.content.revision,
        rulingVersion: found.json.rulingVersion,
      });
      const expected =
        record.type === 'passages'
          ? { ...record.payload, text: passageText(record) }
          : record.payload;
      const expectedRefs = referencesOf(record);
      const storedRefs = found.json.content.references.map((r) => r.entityId).sort();
      const differs =
        canonical(found.json.content.payload) !== canonical(expected) ||
        canonical(storedRefs) !== canonical(expectedRefs.map((r) => r.entityId).sort());
      if (!differs) {
        reused += 1;
        continue;
      }
      changed += 1;
      // Revised only on request, only while DRAFT, and only if nobody revised it since this
      // import wrote it (the revision recorded in the state file).
      const ours = (known.revision ?? 0) === found.json.content.revision;
      if (!reviseDrafts || found.json.state !== 'DRAFT' || !ours) {
        console.warn(
          `import: ${record.key} differs from the stored record; not revised (` +
            (!reviseDrafts
              ? 'pass --revise-drafts to revise drafts this import created'
              : found.json.state !== 'DRAFT'
                ? 'it is no longer a draft'
                : 'it was revised after this import') +
            ')',
        );
        reused += 1;
        continue;
      }
      const revisedRecord = await call(
        'POST',
        `/admin/research/${known.type}/${known.entityId}/revise`,
        {
          expectedRevision: found.json.expectedRevision,
          payload: expected,
          references: expectedRefs,
          // AI declarations are cumulative: keep the stored ones, add only new kinds.
          aiInvolvement: [
            ...found.json.content.aiInvolvement,
            ...declarations(record.ai).filter(
              (d) =>
                !found.json.content.aiInvolvement.some(
                  (x) => x.assistance === d.assistance && x.field === d.field,
                ),
            ),
          ],
        },
      );
      if (revisedRecord.status !== 200)
        fail(`${record.key} revision was refused (${problem(revisedRecord)})`);
      records.set(record.key, {
        type: known.type,
        entityId: known.entityId,
        revision: revisedRecord.json.content.revision,
        rulingVersion: revisedRecord.json.rulingVersion,
      });
      state[record.key] = { ...known, revision: revisedRecord.json.content.revision };
      saveState();
      revisedRecords += 1;
      continue;
    }
  }
  const references = referencesOf(record);
  const response = await call('POST', `/admin/research/${record.type}`, {
    marjaId,
    ...(record.questionId === undefined ? {} : { questionId: record.questionId }),
    payload:
      record.type === 'passages'
        ? { ...record.payload, text: passageText(record) }
        : record.payload,
    references,
    aiInvolvement: declarations(record.ai),
  });
  if (response.status !== 201) fail(`${record.key} was refused (${problem(response)})`);
  const value = {
    type: record.type,
    entityId: response.json.entityId,
    revision: response.json.content.revision,
    rulingVersion: response.json.rulingVersion,
  };
  records.set(record.key, value);
  state[record.key] = { type: record.type, entityId: value.entityId, revision: value.revision };
  saveState();
  created += 1;
}

// ── Rule Builder rules ──
const resolveId = (value) => {
  if (typeof value !== 'string' || !value.startsWith('@')) return value;
  const ref = records.get(value.slice(1));
  if (ref === undefined) fail(`rule references unknown key ${value}`);
  return ref.entityId;
};
let rulesCreated = 0;
let rulesRevised = 0;
for (const rule of bundle.rules ?? []) {
  const content = {
    ...rule.content,
    rulingId: rule.content.rulingId === null ? null : resolveId(rule.content.rulingId),
    sourceRefs: rule.content.sourceRefs.map(resolveId),
  };
  const aiPreparation = { stage: rule.aiStage, tool: bundle.tool, tests: rule.tests ?? null };
  const known = state[rule.key];
  if (known !== undefined) {
    const found = await call('GET', `/admin/rules/${known.ruleId}`);
    if (found.status === 200) {
      const current = found.json.current;
      const same =
        canonical(current.content) === canonical(content) &&
        canonical(current.aiPreparation) === canonical(aiPreparation);
      // A scholar's later revision is never overwritten by a re-import.
      if (same || current.aiPreparation === null) continue;
      const revised = await call('POST', `/admin/rules/${known.ruleId}/revise`, {
        expectedRevision: found.json.revisions,
        content,
        reason: `AI-prepared update (${rule.key})`,
        aiPreparation,
      });
      if (revised.status !== 200) fail(`rule ${rule.key} was refused (${problem(revised)})`);
      rulesRevised += 1;
      continue;
    }
  }
  const response = await call('POST', '/admin/rules', {
    marjaId,
    content,
    reason: `AI-prepared rule (${rule.key})`,
    aiPreparation,
  });
  if (response.status !== 201) fail(`rule ${rule.key} was refused (${problem(response)})`);
  state[rule.key] = { ruleId: response.json.ruleId };
  saveState();
  rulesCreated += 1;
}

await call('POST', '/staff/auth/logout', {});
console.log(
  `import: ${marjaId}: ${String(created)} research records created, ${String(reused)} reused` +
    ` (${String(changed)} differ, ${String(revisedRecords)} drafts revised), ${String(rulesCreated)} rules created,` +
    ` ${String(rulesRevised)} revised.`,
);
