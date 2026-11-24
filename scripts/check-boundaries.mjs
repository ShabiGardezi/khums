#!/usr/bin/env node
// Verifies the monorepo dependency rules described in docs/ARCHITECTURE.md §4.
// Zero dependencies on purpose so it can run before `pnpm install` in CI.
//
// Checks:
//  1. Each package only depends on the internal packages its layer allows.
//  2. Source files only import internal packages that are declared in package.json.
//  3. No deep imports into another package's src/.
//  4. Platform-agnostic packages declare/import no frameworks, databases or node: builtins.
//  5. Apps never depend on other apps; mobile never uses the DOM-only UI kit.
//  6. Server-only dependencies (NestJS, MongoDB/Mongoose, pino) exist only in @khums/api.
//  7. decimal.js is used only inside @khums/money (the controlled decimal abstraction).
//  8. The API does not declare its own API-contract schemas (they live in @khums/validation).
//  9. The internal dependency graph is acyclic.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Allowed internal dependencies per package (dependency direction: right → left only). */
const ALLOWED = {
  '@khums/shared-types': [],
  '@khums/utils': ['@khums/shared-types'],
  '@khums/money': ['@khums/shared-types', '@khums/utils'],
  '@khums/validation': ['@khums/shared-types', '@khums/utils', '@khums/money'],
  '@khums/marja-rules': [
    '@khums/shared-types',
    '@khums/utils',
    '@khums/money',
    '@khums/validation',
  ],
  '@khums/calculation-engine': ['@khums/shared-types', '@khums/utils', '@khums/money'],
  '@khums/core': [
    '@khums/shared-types',
    '@khums/utils',
    '@khums/money',
    '@khums/validation',
    '@khums/marja-rules',
    '@khums/calculation-engine',
  ],
  '@khums/api-client': ['@khums/shared-types', '@khums/utils', '@khums/validation'],
  '@khums/ui': ['@khums/shared-types', '@khums/utils', '@khums/money'],
};

/** Must run unchanged in browsers, React Native (Hermes) and Node.js. */
const PURE = new Set([
  '@khums/shared-types',
  '@khums/utils',
  '@khums/money',
  '@khums/validation',
  '@khums/marja-rules',
  '@khums/calculation-engine',
  '@khums/core',
  '@khums/api-client',
]);

const API_APP = '@khums/api';

/** Internal packages an app may not use. */
/**
 * Client apps reach Marja data and the engine only through @khums/core (apps → core → rules).
 * The rule package and the engine are core's implementation details.
 */
const CORE_INTERNALS = ['@khums/marja-rules', '@khums/calculation-engine'];
const APP_FORBIDDEN = {
  '@khums/web': CORE_INTERNALS,
  '@khums/admin': CORE_INTERNALS,
  '@khums/mobile': ['@khums/ui', ...CORE_INTERNALS],
};

/**
 * Package subpaths only one workspace may import. `@khums/core/trusted-principal` creates the
 * principals the authorization evaluator trusts; only the API may call it, after verifying an
 * identity-provider token or session (docs/AUTH_ARCHITECTURE.md; M4.6.1).
 */
const RESTRICTED_SUBPATHS = { '@khums/core/trusted-principal': [API_APP] };

const FORBIDDEN_IN_PURE =
  /^(react|react-dom|react-native|next|expo|mongoose|mongodb|pino|helmet|express|jose)(\/|$)|^@(nestjs|expo|react-native|next|auth0)\//;

/** Backend-only dependencies: database drivers and the server framework. */
const SERVER_ONLY =
  /^(mongoose|mongodb|pino|pino-http|nestjs-pino|helmet|express)(\/|$)|^@nestjs\//;

const DECIMAL_LIB = /^decimal\.js(\/|$)/;
const DECIMAL_OWNER = '@khums/money';

/** Zod schema constructors that indicate a contract being declared inside the API. */
const API_SCHEMA_DECLARATION =
  /\bz\s*\.\s*(object|array|union|discriminatedUnion|enum|literal)\s*\(/;
/** API folders allowed to declare schemas: its own runtime configuration (not a contract). */
const API_SCHEMA_ALLOWED_DIRS = [join('apps', 'api', 'src', 'config') + sep];

const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

const errors = [];
const fail = (msg) => errors.push(msg);

function readWorkspaces(dir, kind) {
  const base = join(ROOT, dir);
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((name) => join(base, name))
    .filter((path) => existsSync(join(path, 'package.json')))
    .map((path) => ({
      path,
      kind,
      pkg: JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')),
    }));
}

function listSourceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    if (['node_modules', '.next', 'dist', '.turbo', 'coverage'].includes(entry)) return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return /\.(m?[jt]sx?)$/.test(entry) ? [full] : [];
  });
}

const workspaces = [...readWorkspaces('packages', 'package'), ...readWorkspaces('apps', 'app')];
const names = new Set(workspaces.map((w) => w.pkg.name));
const apps = new Set(workspaces.filter((w) => w.kind === 'app').map((w) => w.pkg.name));
const graph = new Map();

for (const { path, kind, pkg } of workspaces) {
  const name = pkg.name;
  const allDeps = { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.devDependencies };
  const depNames = Object.keys(allDeps);
  const internal = depNames.filter((d) => names.has(d));
  graph.set(name, internal);

  // 1 & 5. Declared internal dependencies.
  if (kind === 'package') {
    if (!(name in ALLOWED)) fail(`${name}: not registered in scripts/check-boundaries.mjs ALLOWED`);
    for (const dep of internal) {
      if (!ALLOWED[name]?.includes(dep)) fail(`${name}: may not depend on ${dep}`);
    }
  } else {
    for (const dep of internal) {
      if (apps.has(dep)) fail(`${name}: apps may not depend on other apps (${dep})`);
      if (APP_FORBIDDEN[name]?.includes(dep)) fail(`${name}: may not depend on ${dep}`);
    }
  }

  // 4, 6, 7. External dependencies.
  for (const dep of depNames) {
    if (PURE.has(name) && FORBIDDEN_IN_PURE.test(dep)) {
      fail(`${name}: platform-specific dependency "${dep}"`);
    }
    if (name !== API_APP && SERVER_ONLY.test(dep)) {
      fail(`${name}: server-only dependency "${dep}" (allowed only in ${API_APP})`);
    }
    if (name !== DECIMAL_OWNER && DECIMAL_LIB.test(dep)) {
      fail(`${name}: depends on decimal.js directly; use ${DECIMAL_OWNER}`);
    }
  }

  // 2, 3, 4, 6, 7, 8. Source imports.
  const sourceDirs = kind === 'app' ? ['src', 'e2e'] : ['src'];
  for (const file of sourceDirs.flatMap((dir) => listSourceFiles(join(path, dir)))) {
    const rel = relative(ROOT, file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (!spec) continue;
      const internalName = spec.match(/^(@khums\/[^/]+)/)?.[1];
      if (internalName) {
        if (internalName !== name && !internal.includes(internalName)) {
          fail(`${rel}: imports ${internalName} without declaring it in package.json`);
        }
        if (/^@khums\/[^/]+\/src(\/|$)/.test(spec)) fail(`${rel}: deep import "${spec}"`);
        if (APP_FORBIDDEN[name]?.includes(internalName)) {
          fail(`${rel}: imports ${internalName}; use @khums/core`);
        }
        // Prefix match, so variants such as `…/trusted-principal.ts` are caught too.
        for (const [subpath, allowed] of Object.entries(RESTRICTED_SUBPATHS)) {
          if (spec.startsWith(subpath) && !allowed.includes(name)) {
            fail(`${rel}: imports ${spec}, which only ${allowed.join(', ')} may use`);
          }
        }
      }
      // Relative imports may not reach into another workspace's files (that would bypass
      // `exports` and every rule above). Repository docs read by tests remain allowed.
      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec);
        const intoOther = workspaces.some(
          (w) => w.path !== path && !relative(w.path, target).startsWith('..'),
        );
        if (intoOther) {
          fail(
            `${rel}: relative import "${spec}" reaches into another workspace; import it by name`,
          );
        }
      }
      if (PURE.has(name) && (FORBIDDEN_IN_PURE.test(spec) || spec.startsWith('node:'))) {
        fail(`${rel}: platform-specific import "${spec}"`);
      }
      if (name !== API_APP && SERVER_ONLY.test(spec)) fail(`${rel}: server-only import "${spec}"`);
      if (name !== DECIMAL_OWNER && DECIMAL_LIB.test(spec)) {
        fail(`${rel}: imports decimal.js directly; use ${DECIMAL_OWNER}`);
      }
    }

    const isTest = /\.test\.[jt]sx?$/.test(file);
    const inAllowedDir = API_SCHEMA_ALLOWED_DIRS.some((dir) => rel.startsWith(dir));
    if (name === API_APP && !isTest && !inAllowedDir && API_SCHEMA_DECLARATION.test(source)) {
      fail(`${rel}: declares a Zod schema; API contracts belong in @khums/validation`);
    }
  }
}

// 9. Cycle detection (DFS with colouring).
const state = new Map();
function visit(node, stack) {
  state.set(node, 'visiting');
  for (const next of graph.get(node) ?? []) {
    if (state.get(next) === 'visiting') {
      fail(`dependency cycle: ${[...stack, node, next].join(' → ')}`);
    } else if (!state.has(next)) {
      visit(next, [...stack, node]);
    }
  }
  state.set(node, 'done');
}
for (const node of graph.keys()) if (!state.has(node)) visit(node, []);

if (errors.length > 0) {
  console.error(`✖ Package boundary check failed (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✔ Package boundaries OK (${workspaces.length} workspaces checked).`);
