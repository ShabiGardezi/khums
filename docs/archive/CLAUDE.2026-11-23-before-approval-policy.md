# CLAUDE.md — Instructions for AI coding assistants

These rules are permanent. Follow them in every session. If a request conflicts with them, stop and
ask the maintainer.

## Project in one paragraph

Khums Platform: a privacy-first, multi-Marja Khums calculator for Shia Muslims. Turborepo + pnpm
monorepo, strict TypeScript. Web (Next.js) first, backed by ONE shared NestJS API (`apps/api`) that
will also serve the Expo mobile app and the admin console — all sharing pure TypeScript packages. Read `docs/ARCHITECTURE.md` before structural changes.

## Absolute restrictions

1. **Never invent, approve, paraphrase into new meaning, or "fill gaps" in religious rulings.** Rule
   content comes only from rule sets produced through `docs/RELIGIOUS_RULES.md`: approved
   (`PRODUCTION` channel) rule sets, or proposed `SCHOLAR_REVIEW` rule sets authored by an
   authorized scholar for that Marja (or the research team under their authority) from sourced
   findings whose sources, original text, translations and attribution the scholar has verified
   (no second researcher or second scholar is required; `docs/research/REVIEW_PROCESS.md` §16).
   AI never authors, completes or approves
   rule content of either kind. If a rule is missing or unclear, leave a `TODO(rules):` note and tell
   the maintainer — do not guess.

   **Provisional transcription (owner decision 2026-11-23; ARCHITECTURE §11 #60).** Three things are
   distinguished:
   - _Transcription_: encoding a ruling that an authenticated, office-published source states
     **explicitly** (subject, condition, exception and amount all stated, no choice between
     readings) as deterministic logic in a `SCHOLAR_REVIEW` pack. AI may do this, and only this,
     for provisional packs: every transcribed rule cites the exact source, edition and ruling
     number, quotes a short excerpt of the original, keeps status `UNVERIFIED`, and its results are
     **PROVISIONAL — FOR SCHOLAR REVIEW ONLY**, staff-only.
   - _Interpretation_: anything the text leaves ambiguous, incomplete, disputed, edition-dependent,
     unattributed, or that needs a choice between readings or a judgement of the person's
     circumstances. AI never does this: it stays a `consult` stop naming what is missing.
   - _Verification and approval_: only the governing scholar, through the research and governance
     workflows. Transcription never verifies or approves anything and never reaches production.

2. **Never hard-code rulings, percentages, thresholds or exemptions** in components, the engine or
   app code. They are rule-set data in `@khums/marja-rules`.
3. **AI-generated content must never determine a user's Khums obligation.** No LLM output may flow
   into calculation inputs, rule data or results, except provisional transcriptions under rule 1,
   which are labelled, staff-only and never authoritative.
4. **Never use JavaScript `number` for money.** Use `@khums/money` (`Decimal`, `Money`;
   `ARCHITECTURE.md` §6). Amounts travel as decimal strings. Never import `decimal.js` outside
   `@khums/money`. Always pass an explicit rounding mode; never round silently. No `parseFloat`,
   `toFixed`, or float math on amounts. Compare with `compare()`/`lessThan()`/`greaterThan()`,
   never `<`/`>`/`Number(x)`/`+x` (they throw `ImplicitConversionError`).
5. **Never log, print or send financial values or personal data** (including in tests' snapshots
   sent anywhere, error messages, or analytics).
6. Never commit secrets or real `.env` files. Never weaken security headers, auth checks or lint
   rules to make something pass.
7. Do not modify a published rule-set version; create a new version.

## Architecture boundaries

```text
apps → core → { marja-rules → validation, calculation-engine } → money → utils → shared-types
apps(web, mobile) → api-client → validation
apps(web, admin) → ui → utils
```

- `shared-types`, `utils`, `money`, `validation`, `marja-rules`, `calculation-engine`, `core`,
  `api-client` are **pure**:
  no React/Next/Expo/NestJS/Mongoose, no `node:*`, no `window`/`document`/`localStorage`/`process`,
  no I/O, no reading env vars, no logging, no `Date.now()` (inject a clock via `core` ports).
- `calculation-engine` must not import `marja-rules`: rule sets are passed in as arguments.
- Every calculation result must carry a trace: rule-set id, version, content hash, source refs.
- `ui` is React DOM only (web/admin). Mobile must not import it.
- Import packages by name via their `exports` (`@khums/utils`), never `@khums/x/src/...`.
- Declare each type once (`shared-types` or `z.infer` in `validation`); never duplicate in apps.
- Platform code (storage, auth, HTTP, logging) lives in apps and implements `core` ports.
- Anonymous, local-first usage must always keep working; cloud sync is optional.

## Backend & API contract rules

- There is exactly one backend: `apps/api` (NestJS). Do not add BFFs or per-client APIs.
- NestJS, Mongoose/MongoDB, pino, helmet and express may only be used in `apps/api`.
- Request schemas use `z.strictObject` (reject unexpected fields); response schemas use `z.object`
  (additive; never `looseObject`) and every handler declares `@ApiContractResponse`, which strips
  undeclared fields before sending — see ARCHITECTURE §12 compatibility policy.
- Request/response schemas live in `@khums/validation` (`src/api/`), with `.meta({ id })` naming the
  OpenAPI component. The API never declares its own contract schemas or interfaces; DTOs are
  `class XDto extends createZodDto(sharedSchema) {}` — the global pipe rejects any un-DTO'd
  body/query/param, so never work around it. Web/mobile call the API only through
  `@khums/api-client`.
- After changing endpoints or contracts: register the schema in
  `apps/api/src/shared/openapi/contract-schemas.ts`, run `pnpm --filter @khums/api openapi`, and
  commit `apps/api/openapi.json` (a test fails on drift).
- Errors are RFC 9457 problems with a stable `code`; never put internal details, stack traces,
  submitted values or secrets in responses or logs.
- Business logic belongs in `@khums/core`, not in controllers. Controllers stay thin.
- Configuration is read only through the validated `AppConfig` (`@InjectAppConfig()`), never
  `process.env` in feature code. New variables go in `env.schema.ts` and `.env.example`.

Adding a dependency edge between packages requires updating `scripts/check-boundaries.mjs`,
`docs/ARCHITECTURE.md`, and getting maintainer approval.

## Coding standards (summary — full version in `docs/CODING_STANDARDS.md`)

- Strict TS; no `any`, no `!` in source, `import type` for types, exhaustive `switch` with `assertNever`.
- Expected failures → `Result<T, E>` with `code` discriminants; programmer errors → `invariant()`.
- Files `kebab-case`; components/types `PascalCase`; schemas `xxxSchema`; error codes `SCREAMING_SNAKE`.
- Server Components by default; logical Tailwind utilities (`ps-`, `ms-`, `start-`) for RTL;
  accessible semantic HTML (WCAG 2.2 AA).
- Shared versions go in the pnpm `catalog:`; add deps with `pnpm add <pkg> --filter <workspace>`.
  Don't add packages without a clear need; never add platform deps to pure packages.
- Conventional Commits: `type(scope): summary`.

## Calculation engine rules (Step 3)

- The engine (`@khums/calculation-engine`) must stay formula-free. Never add Khums-specific
  logic, rates, thresholds or category meanings to engine code. They belong in rule-pack data,
  which requires scholar approval before production.
- Rule packs are exactly one of three kinds (owner decision 2026-11-21; see the operational states
  in `docs/DEVELOPMENT_ROADMAP.md`):
  - **Mock fixtures** (development and engineering tests only): `isMock: true`, labelled
    **MOCK / NOT FOR PRODUCTION** in title and labels, with deliberately non-religious names and
    values (e.g. `mock-category-a`, rate `12.5`). Never exported from packages, never served by a
    deployment. **One narrow exception (owner decision 2026-11-21):** `apps/web/src/server/development/`
    may hold non-religious mock packs for local click-through only. They load only when the
    server-side operational state is `DEVELOPMENT` (never on a hosted deployment), never use real
    Marja names, and every result shows `MockCalculationNotice`. Tests enforce this.
  - **Scholar-review packs** (`releaseChannel: 'SCHOLAR_REVIEW'`, `isMock: false`): actual proposed
    Khums rules authored by the research team from sourced findings, or provisional transcriptions
    of explicit published rulings (rule 1); every rule cites real sources; rule status `UNVERIFIED` or `APPROVED`, never `DRAFT`. Results are always labelled
    **PROVISIONAL — FOR SCHOLAR REVIEW ONLY** and are served only to authenticated, authorized staff
    in the `SCHOLAR_REVIEW` operational state. An `APPROVED` rule inside one does not make the pack
    authoritative.
  - **Production packs** (`releaseChannel: 'PRODUCTION'`): explicitly scholar-approved through
    governance, published, activated and passing every production-readiness check.
- A scholar-review pack can never become a production pack: approval produces a new `PRODUCTION`
  version (new content hash) under the Marja's governance policy. Never relabel, migrate or re-hash
  existing packs; schema versions 1 and 2 stay readable.
- Never present a development (`NOT_RELIGIOUS_GUIDANCE`) or provisional (scholar-review) result as
  religious guidance. Always show `meta.disclaimer` with it.
- Never weaken the production readiness gate (`checkProductionReadiness`) or call `calculate` in
  production mode with a mock, scholar-review or unactivated pack. Authoritative production
  calculations use the governed readiness path (ledger-verified), never the standalone engine gate.
- Deploying the software is not approving its calculations. Provisional calculations must be
  completely inaccessible to public users; the operational state is enforced server-side.
- The expression vocabulary is **provisional and non-authoritative**
  (`docs/research/RULE_PACK_STRUCTURE.md` §5.6). Never simplify or alter a religious ruling to fit
  it. Extend the interpreter instead, or encode a `consult` stop until it is extended.
- New expression kinds require structure validation, readiness reference walking, evaluator
  support, Zod schema support, and tests, plus a pack `schemaVersion` decision.

## Web UI rules (Step 4)

- Use the design tokens' semantic colour roles, never raw palette colours. The `mock` role is
  reserved for mock notices; provisional (scholar-review) notices get their own role.
- Every mock calculation, result, report or export must show `MockCalculationNotice`
  (`MOCK_CALCULATION_LABEL`) prominently. Every provisional one must show the provisional notice
  (**PROVISIONAL — FOR SCHOLAR REVIEW ONLY**). Never make mock or provisional output look approved.
- Shared components go in `packages/ui`; app-specific ones in `apps/web/src/components`. When
  overriding cva variant classes, merge with `cn()`.
- Accessibility is mandatory: semantic HTML, labelled controls (use `Field`), visible focus, one
  `h1` per page, logical (RTL-safe) spacing. New pages are added to the Playwright shell/axe tests.

## Localization rules (M4.2.2)

- Never hard-code user-facing text in components. Add it to the typed content module for the area
  (`apps/web/src/content/<area>/{types,en,ur}.ts`), in **every** locale. The coverage test fails
  otherwise.
- Never branch on language in components (`if (locale === 'ur')`). Use content, logical CSS
  (`ps-`, `me-`, `start-`) and `rtl:` variants.
- Build internal links with `localizePath()` / `getI18n().href()`, never as raw `/path` strings.
- Urdu must be natural, reviewed Urdu, not literal translation. Religious-content rules apply
  equally to every language: no rulings, keep all disclaimers, no named provisional Marja.

## Testing requirements

- Every new public function in `packages/*` gets Vitest tests beside it (`*.test.ts`).
- The calculation engine needs deterministic, exhaustive tests including every reviewer-verified
  rule-set test case; target ≥ 95% branch coverage.
- Bug fixes include a regression test. UI journeys get Playwright tests in `apps/web/e2e`.
- Before declaring work done run, and report honestly:
  `pnpm format:check && pnpm check:boundaries && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
  (or `pnpm check`). Never claim a check passed without running it.

## Workflow expectations

- Read the relevant doc in `docs/` before working in an area; update docs when behaviour or
  architecture changes.
- Make architectural decisions explicit; record them in `docs/ARCHITECTURE.md` §11.
- Prefer simple, explicit code over clever abstractions. Avoid overengineering.
- Don't delete user files; don't run destructive git commands without being asked.
- Work milestone by milestone (`docs/DEVELOPMENT_ROADMAP.md`); don't start a later milestone
  without the maintainer's go-ahead.

## Useful commands

```bash
pnpm install                # install
pnpm dev                    # web on :3000, API on :4000 (/api/v1, docs /api/docs)
pnpm --filter @khums/api openapi    # regenerate the committed OpenAPI spec
pnpm check                  # full CI suite locally
pnpm --filter @khums/web test:e2e   # Playwright (after `playwright install chromium`)
```
