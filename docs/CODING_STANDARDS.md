# Coding Standards

Tooling enforces most of this: **Prettier** (formatting), **ESLint** (`typescript-eslint`
`strictTypeChecked` + `stylisticTypeChecked`, Next.js core-web-vitals for apps), **TypeScript**
strict, and `scripts/check-boundaries.mjs`. Run `pnpm check` before pushing.

## 1. TypeScript

- `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
  `noImplicitReturns`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax` (see `tsconfig.base.json`).
- No `any`. Use `unknown` and narrow (Zod for external data).
- No non-null assertions (`!`) in source; allowed in tests.
- Prefer `type` aliases for unions and `interface` for object shapes that may be extended.
- Use `import type` for type-only imports (lint-enforced).
- Discriminated unions + `assertNever` for exhaustive handling (`switch-exhaustiveness-check`).
- Branded types (`Brand<T, 'Name'>`) for identifiers and units that must not be mixed.
- Domain values are `readonly` by default; shared packages never mutate their inputs.
- **Money:** never `number`. Use `@khums/money` (`Decimal.parse` for input, `Money` for amounts
  with a currency; ARCHITECTURE §6). Always name the rounding mode. `decimal.js` may only be
  imported inside `@khums/money`; `parseFloat` and `.toFixed` are lint-banned in financial packages.

## 2. Naming

| Thing                                    | Convention                      | Example                      |
| ---------------------------------------- | ------------------------------- | ---------------------------- |
| Files (TS modules)                       | `kebab-case.ts`                 | `rule-set-registry.ts`       |
| React component files                    | `kebab-case.tsx` (shadcn style) | `result-breakdown.tsx`       |
| Components, types, interfaces            | `PascalCase`                    | `ResultBreakdown`, `RuleSet` |
| Functions, variables                     | `camelCase`                     | `calculateAnnualKhums`       |
| Constants (module-level, true constants) | `SCREAMING_SNAKE_CASE`          | `MAX_RULESET_SIZE`           |
| Zod schemas                              | `camelCase` + `Schema`          | `assessmentInputSchema`      |
| Error codes                              | `SCREAMING_SNAKE_CASE` strings  | `RULESET_NOT_FOUND`          |
| Packages                                 | `@khums/<kebab-case>`           | `@khums/calculation-engine`  |
| Booleans                                 | `is/has/can/should` prefix      | `isFinalized`                |
| Tests                                    | `<module>.test.ts` beside code  | `result.test.ts`             |

Avoid abbreviations except well-known ones (`id`, `url`, `api`). Religious terms use a single
agreed transliteration documented in the glossary (Milestone 2), e.g. `marja` / `maraje`.

## 3. Imports & module boundaries

- Order: external packages → `@khums/*` → app alias (`@/…`) → relative. Prettier formats; keep
  groups separated by a blank line.
- Within an app use the `@/*` alias (→ `src/*`) instead of long `../../` chains.
- Across workspaces import the package name only (`@khums/utils`), never relative paths into another
  workspace and never `@khums/x/src/...`.
- Every package's public API is its `exports` map + `src/index.ts`. Export deliberately; anything not
  exported is private.
- Dependency direction and allowed edges: `ARCHITECTURE.md` §3–4.

## 4. Errors

- **Expected failures** (invalid input, unsupported case, missing rule set) are values: return
  `Result<T, E>` from `@khums/utils` with a discriminated error type:
  `{ code: 'RULESET_NOT_FOUND'; marjaId: string }`.
- **Programmer errors** (broken invariants) throw `InvariantError` via `invariant()` /
  `assertNever()`. Don't catch these except at app top-level boundaries.
- Shared packages never throw for user input and never return localized messages — they return
  codes; apps map codes to translated messages.
- Apps: React error boundaries (`error.tsx`) per route segment; the API maps domain errors to
  RFC 9457 `application/problem+json` responses.
- Never swallow errors silently; `catch` must handle, rethrow, or convert to `Result`.

## 5. Logging

- Shared packages **do not log**. If diagnostics are needed, they're returned (e.g. in the trace) or a
  `Logger` port is injected through `core`.
- Apps use a single structured logger per runtime (decision with the API milestone) with levels
  `debug | info | warn | error`, JSON output in production, and a request/correlation id.
- `console.*` is lint-banned in source; use the logger.
- Never log financial values or personal data (`SECURITY.md` §7).

## 6. Environment variables

- Declared in each app's `.env.example` with a comment; real values in `.env.local` (git-ignored).
- `NEXT_PUBLIC_` prefix only for values safe to expose in the browser.
- Parsed once at startup through a Zod schema in the app (e.g. `src/env.ts`); code imports the typed
  object, not `process.env` directly.
- Variables that affect build output must be listed in `turbo.json` (`env` / `globalEnv`) so caches
  invalidate correctly.
- Shared packages never read environment variables; configuration is passed in.

## 7. React & Next.js

- Server Components by default; add `'use client'` only where interactivity requires it, as low in
  the tree as possible.
- No business or religious logic in components — call `@khums/core` and render results. No rulings,
  percentages or thresholds hard-coded in UI.
- Components are small and accessible: semantic HTML first, labelled controls, visible focus,
  keyboard operability, `aria-*` only when semantics can't express it. Target WCAG 2.2 AA.
- Use Tailwind logical utilities (`ps-*`, `pe-*`, `ms-*`, `start-*`) so layouts work in RTL.
- shadcn/ui components are generated into `packages/ui` (shared) and customized there.
- Data fetching in Server Components / Route Handlers; validate all external data with Zod.
- Use `next/image`, `next/link`, metadata API; no client-side analytics on financial screens.

## 8. Testing

| Layer             | Tool                             | Location                       | Expectation                                         |
| ----------------- | -------------------------------- | ------------------------------ | --------------------------------------------------- |
| Unit (packages)   | Vitest                           | `src/**/*.test.ts` beside code | All public functions; engine ≥ 95% branch coverage. |
| Rule-set fixtures | Vitest                           | `marja-rules`                  | Every reviewer test case must pass.                 |
| Property-based    | Vitest (+ lib TBD)               | engine, money                  | Arithmetic invariants, determinism.                 |
| Component         | Vitest + Testing Library (jsdom) | `packages/ui`, `apps/web`      | Behaviour and accessibility, not implementation.    |
| End-to-end        | Playwright                       | `apps/web/e2e`                 | Critical journeys + a11y checks.                    |

- Tests are deterministic: no real network, time injected via `Clock` port, no shared state.
- Name tests by behaviour (`it('returns RULESET_NOT_FOUND for unknown marja')`).
- A bug fix includes a regression test.

## 9. Git & repository conventions

- **Branches:** `main` is always releasable. Work on `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/):
  `type(scope): summary` — types `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`,
  `build`; scope = package or app (`feat(calculation-engine): add trace output`).
  Changes to rule data use scope `rules` and reference the review record.
- **Pull requests:** small and focused; CI green; at least one review. Changes to
  `packages/marja-rules` additionally require scholarly sign-off (`RELIGIOUS_RULES.md`).
- **Dependencies:** add with `pnpm add <pkg> --filter <workspace>`; shared versions go in the
  `catalog:` of `pnpm-workspace.yaml`. Justify every new runtime dependency in the PR. Shared pure
  packages must not gain platform-specific dependencies (enforced).
- Lockfile is committed; CI installs with `--frozen-lockfile`.
