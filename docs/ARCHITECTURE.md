# Architecture

> Status: **Foundation (Milestone 1 + 1.1)**. Sections marked _Proposed_ are design intent, not yet
> implemented.

## 1. Goals that drive the architecture

| Goal                                            | Architectural consequence                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Same calculation on web, mobile and server      | All business logic lives in pure TypeScript packages with no platform dependencies.           |
| Multiple Maraje, rulings change over time       | Rules are **versioned data**, separate from the engine that executes them.                    |
| Users must be able to trust and verify a result | Every result carries a **trace**: rule-set id + version + source citations for each step.     |
| Privacy-first financial data                    | Anonymous, local-first by default; cloud sync is opt-in and authenticated.                    |
| Money correctness                               | No floating-point arithmetic for money anywhere (§6).                                         |
| AI must never decide an obligation              | AI output (if ever used) is advisory text only and cannot flow into the engine's inputs (§8). |

## 2. System overview

```
 apps/ (platform-specific)
 ┌───────────┐ ┌───────────┐ ┌───────────┐              ┌──────────────────────────────┐
 │ web       │ │ mobile    │ │ admin     │   REST/JSON  │ api  (NestJS, ONE backend)   │
 │ Next.js   │ │ Expo / RN │ │ Next.js   │ ───────────▶ │ /api/v1 · OpenAPI · problem+ │
 │ (MVP)     │ │ (later)   │ │ (later)   │  via         │ json · pino · MongoDB (M6)   │
 └─────┬─────┘ └─────┬─────┘ └─────┬─────┘  api-client  └──────────────┬───────────────┘
       └─────────────┴──────┬──────┴──────────────────────────────────┘
                            │ apps call use cases / contracts and implement ports
                            ▼   (storage, auth, logging, clock)
 packages/ (pure TypeScript — runs in browser, Hermes and Node)
 ┌──────────────────────────────────────────────────────────┐   ┌──────────────────────┐
 │ core               use cases + port interfaces           │   │ api-client           │
 └───────┬──────────────────────────────┬───────────────────┘   │ typed REST client    │
         ▼                              ▼                       │ (injected fetch)     │
 ┌────────────────────┐        ┌─────────────────────────┐      └──────────┬───────────┘
 │ marja-rules        │        │ calculation-engine      │                 │
 │ versioned rule data│        │ (input, ruleSet) → trace│                 │
 └───────┬────────────┘        └───────────┬─────────────┘                 │
         ▼                                 │                               │
 ┌──────────────────────────────────────┐  │                               │
 │ validation (Zod) — trust-boundary    │◀─┼───────────────────────────────┘
 │ schemas + REST API contracts         │  │
 └───────┬──────────────────────────────┘  │
         ▼                                 ▼
 ┌──────────────────────────────────────────────────────────┐
 │ money              exact Decimal / Money (wraps decimal.js)│
 └───────────────────────────┬──────────────────────────────┘
                             ▼
 ┌──────────────────────────────────────────────────────────┐
 │ utils              Result, invariant, assertNever        │
 └───────────────────────────┬──────────────────────────────┘
                             ▼
 ┌──────────────────────────────────────────────────────────┐
 │ shared-types       type-only leaf                        │
 └──────────────────────────────────────────────────────────┘

 packages/ui — React DOM components for web + admin only (depends on utils, shared-types, money).
 Arrows point from a package to what it may import; a package may also import any layer below it
 that §3 lists. MongoDB/Mongoose and NestJS exist only in apps/api.
```

## 3. Package responsibilities

| Package                     | Responsibility                                                                                                                                            | May depend on (internal)                                    | Runtime constraints   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------- |
| `@khums/shared-types`       | Domain types & interfaces. Type-only.                                                                                                                     | —                                                           | Pure                  |
| `@khums/utils`              | `Result`, `invariant`, `assertNever`.                                                                                                                     | shared-types                                                | Pure                  |
| `@khums/money`              | Exact `Decimal` / `Money`, explicit rounding, ISO 4217 minor units, formatting (§6).                                                                      | shared-types, utils                                         | Pure                  |
| `@khums/validation`         | Zod schemas for all trust-boundary input **and the REST API contracts** (§12).                                                                            | shared-types, utils, money                                  | Pure                  |
| `@khums/marja-rules`        | Versioned, source-cited rule sets as data + rule-set registry. **No calculation code.**                                                                   | shared-types, utils, money, validation                      | Pure                  |
| `@khums/calculation-engine` | Generic rule-pack interpreter (no embedded formulas): annual, first-time and missed-year workflows; production readiness gate; traceable breakdowns (§5). | shared-types, utils, money                                  | Pure, no I/O, no time |
| `@khums/core`               | Use cases (assessments, history), port interfaces (storage, clock, logger, sync).                                                                         | shared-types, utils, money, validation, marja-rules, engine | Pure, no I/O          |
| `@khums/api-client`         | Typed REST client for web + mobile; responses validated with the shared contracts.                                                                        | shared-types, utils, validation                             | Pure (injected fetch) |
| `@khums/ui`                 | shadcn/ui components and Tailwind helpers for React DOM.                                                                                                  | shared-types, utils, money                                  | Browser (React DOM)   |
| `apps/web`                  | Public web app (MVP). Implements ports with browser storage; renders UI.                                                                                  | any package                                                 | Next.js               |
| `apps/api`                  | **The single backend** for web, mobile and admin: NestJS REST + OpenAPI (§12).                                                                            | any package                                                 | Node.js               |
| `apps/mobile`               | _Proposed_ Expo app. Same `core` and `api-client`; native UI; must not use `@khums/ui`.                                                                   | any package except `ui`                                     | React Native          |
| `apps/admin`                | _Proposed_ Rule authoring, scholarly review and publishing console (uses the API).                                                                        | any package                                                 | Next.js               |

**Why the engine does not depend on `marja-rules`:** this enforces requirement "rules separated
from execution". The engine is a function `(input, ruleSet) → result`. `core` selects the rule set
(from `marja-rules`, or later from a signed rule bundle fetched from the API) and passes it in. This
lets us test the engine with synthetic rule sets, ship rule updates without engine changes, and
reproduce any historical result by re-running it against the exact rule-set version it cites.

## 4. Dependency rules (enforced)

1. Dependencies point **downwards** only (table above). No cycles.
2. Apps may depend on packages; packages never depend on apps; apps never depend on each other.
3. Pure packages may not import React, React Native, Next.js, Expo, NestJS, Mongoose/MongoDB,
   `node:*` builtins, or browser globals (`window`, `document`, `localStorage`, …).
4. Server-only dependencies (NestJS, MongoDB/Mongoose, pino, helmet, express) appear **only** in
   `apps/api`. Database access therefore can only ever exist in the backend.
5. `decimal.js` is imported **only** by `@khums/money`; everything else uses its API.
6. The API declares no contract schemas of its own: request/response schemas come from
   `@khums/validation` (only its private env schema lives in `apps/api/src/config`).
7. Imports go through a package's `exports` map only. Deep imports (`@khums/x/src/...`) are banned.
8. Types are declared once (in `shared-types`, or inferred from a schema in `validation`) and imported
   everywhere else. Apps never redeclare domain interfaces.

Enforcement:

- `pnpm check:boundaries` → `scripts/check-boundaries.mjs` (rules 1–7, cycles) — runs in CI.
- ESLint `no-restricted-imports` / `no-restricted-globals` per package (rules 3, 5, 7), plus float
  bans (`parseFloat`, `.toFixed`) in financial packages.
- TypeScript: pure packages compile with `lib: ["ES2023"]` and `types: []`, so DOM and Node APIs do
  not type-check there at all.

## 5. Calculation engine & traceability (implemented in Step 3)

`@khums/calculation-engine` is a **generic rule-pack interpreter**; details are in its
[README](../packages/calculation-engine/README.md).

- **No embedded formulas.** Each rule pack carries a declarative program per workflow, built from
  a small vocabulary: category sums, parameters, step references, add/subtract/multiply/percentage,
  min/max, conditional on answers or comparisons, consultation stop, and explicit rounding. The
  engine only evaluates it. All religiously significant choices are rule-pack data.
- **Three workflows:** `annual`, `first-time`, `missed-year` (per-year evaluation; cross-year
  aggregation only when the pack allows it).
- **Contracts** live in `@khums/shared-types` (`RulePack`, `AssessmentInput`, `CalculationReport`).
  Zod schemas live in `@khums/validation` and are typed against those contracts, so they cannot
  drift.
- **Refusal over guessing:**
  - malformed packs, unsupported workflows and invalid input are refused in every mode;
  - production additionally requires a published, non-mock pack with scholar and separate-approver
    sign-off, a content hash, a matching activation, effective dates covering the assessment, and
    every used rule approved and sourced;
  - unresolved cases make dependent outputs `null`.
- **Modes:** `development` labels every result `NOT_RELIGIOUS_GUIDANCE` with a
  "MOCK / NOT FOR PRODUCTION" disclaimer. `production` results are labelled `APPROVED_RULE_PACK`.

**Traceability.** Every result records:

- engine version, mode and guidance label;
- the rule pack's ID, Marja ID, version, status, mock flag and content hash;
- the currency;
- warnings;
- for every step: its rule IDs, their source references, its exact value (decimal string) or
  `null`, the rounding applied, and any unresolved case IDs.

A stored result can be re-run against `packId@version` and reproduces the same figures
(determinism is tested).

**Vocabulary note:** the expression vocabulary was designed before the religious research (owner
decision 2026-11-20 to develop ahead of scholar review). It contains only generic arithmetic and
control primitives. If approved research needs constructs it cannot express, the vocabulary is
extended under a new pack `schemaVersion`; rulings are never approximated to fit it. The vocabulary
is recorded as provisional and non-authoritative in
[research/RULE_PACK_STRUCTURE.md §5.6](research/RULE_PACK_STRUCTURE.md#56-provisional-technical-calculation-vocabulary-revision-5).
Open future requirements (content-hash verification, authenticated reviewers, immutable versions,
liability modelling, scenario coverage) are listed in §9 of that document as FR-1…FR-5.

### 5a. Fact mapping (M4.4.1)

Neutral financial facts reach the engine only through **the selected pack's own fact mapping**
(pack `schemaVersion` 2, `RULE_PACK_STRUCTURE.md` §5.7):

- Flow: `core.prepareAssessmentInput(sheet, pack, answers, factAnswers)` validates the sheet and
  the pack, then calls `calculation-engine.mapFactsToInput`. That returns a `MappingResult`:
  `MAPPED` with an `AssessmentInput`, `NEEDS_CLARIFICATION` with what to ask,
  `CONSULTATION_REQUIRED` with which stops, or `UNSUPPORTED` with why, plus a per-fact trace and
  the pack reference.
- **Execution:**
  - pure, deterministic and formula-free;
  - amounts are copied as the original decimal strings, facts are never modified, and the
    mapping does no arithmetic;
  - a fact in another currency is `UNSUPPORTED`, because there is no conversion.
- **No defaults.** Every handling for uncertain amounts and dates is explicit pack data. Subtypes
  are named explicitly (no wildcards), and unmatched facts stop for consultation. Mappings are
  never shared between Maraje.
- **No ambiguity or silent loss:**
  - overlapping rules are rejected, so order never changes an interpretation;
  - every exclusion cites its own rules and stays in the trace;
  - mapped categories must be read by the workflow's program;
  - unknown operations are refused;
  - per-fact answers are bound to their fact's workflow, kind and subtype;
  - duplicate fact ids are refused.
  - Each input fact has exactly one trace line.
- **Gates:**
  - structure validation checks the mapping's references;
  - production readiness requires the mapping and everything it reaches to be approved and
    sourced. `requireFactMapping` refuses fact-based input to a pack without one;
  - all existing gates are unchanged, and the mapping is part of the hashed, immutable pack
    content.
- **Compatibility:** `schemaVersion` 1 packs, their fixtures and `calculate()` are unchanged.
  `FACT_DATE_FIELDS` now has a single runtime copy in the engine, which `core` re-exports.

### 5b. Rule-pack content integrity (M4.4.2, FR-1)

- **What:**
  - SHA-256 over the `khums-jcs-1` canonical form (an RFC 8785 profile) of the whole pack, except
    `metadata.integrity`, `metadata.contentHash`, `metadata.approvals` and `metadata.status`, under
    scope `rule-pack-content-1`;
  - the versions are embedded in the hashed bytes;
  - full specification: `RULE_PACK_STRUCTURE.md` §5.8.
- **Where:** `@khums/calculation-engine/integrity`, re-exported by `@khums/core`.
  - It is pure and synchronous: audited `@noble/hashes` SHA-256 plus a pure UTF-8 encoder.
  - That means no hashing port, no platform API and one implementation for the API, web and
    mobile.
  - An async port was considered and rejected: no platform capability is needed, and it would
    have made the synchronous `calculate()` and readiness gates asynchronous.
- **Binding:** `metadata.integrity`, `approvals[].integrity` and `RulePackActivation.integrity`
  each carry `{ algorithm, canonicalization, scope, digest }`.
  - Every gate recomputes the digest and compares it with all three.
  - Only approvals bound to the recomputed digest count. The activation must name the
    **recomputed** digest, not just the declared one.
  - Nothing is cached, so a pack object modified after a check fails the next check.
- **Gates:** `validateRulePackStructure` (canonicalizable, well-formed integrity),
  `checkApprovalEligibility`, `checkPublicationEligibility`, `checkActivationEligibility`,
  `checkProductionReadiness` and `calculate` in production mode. Calculation and mapping results
  carry `contentDigest`, recomputed from the content actually used.
- **Compatibility:**
  - MOCK packs (`schemaVersion` 1 and 2) are unchanged and work in development, unsealed;
  - `contentHash` is legacy and must be `null` in production;
  - activation records changed from `contentHash` to `integrity` (none existed).

### 5c. Rule-pack governance (M4.4.3)

- **Model:** an append-only, hash-chained `GovernanceLedger` per pack version (types in
  `@khums/shared-types/governance`, strict schemas in `@khums/validation/governance`, logic in
  `@khums/core/governance`). Full specification: `RULE_PACK_STRUCTURE.md` §5.9.
- **Lifecycle:** DRAFT → SUBMITTED → UNDER_REVIEW → (CHANGES_REQUESTED → SUBMITTED …) →
  review completed → APPROVED → PUBLISHED, with SUPERSEDED and WITHDRAWN as terminal states.
  - Activation is a separate record, never automatic.
  - The state is always derived by replay, using the same transition function as `append`.
- **Separation:**
  - reviewer ≠ author;
  - approver ≠ reviewer and ≠ author;
  - only the reviewer who started a review can complete it or request changes;
  - the approval must bind the reviewed digest.
- **Integrity binding:**
  - every content record carries `ContentIntegrity`;
  - commands recompute the pack digest (§5b) and refuse stale content;
  - approvals and activations reference exact ledger records by `recordId/recordDigest`, so they
    cannot be replayed from another ledger.
- **Publication** requires the engine's publication gate, the ledger's current approvals on the
  pack and status APPROVED, and changes only `status`.
- **Governed production readiness** (`checkGovernedProductionReadiness`) requires the engine gate
  plus a clean, PUBLISHED ledger whose published digest, approvals and `ACTIVATED` record match
  the pack and activation.
- **Immutability:**
  - domain level: deep freeze, append-only API and a replay-verified hash chain;
  - database level (write-once storage, head anchoring against truncation): future work, FR-3;
  - identities are unverified references: FR-2 is open.

### 5d. Authentication and authorization (M4.6.0 design; M4.6.1 engine; M4.6.2 Auth0, partial)

- **Status:** M4.6.0 (architecture) and M4.6.1 (authorization engine) are complete. The
  additional governance policies were approved on 2026-11-20. M4.6.2 (Auth0 staff sign-in) is
  partially complete: Next.js SDK sign-in, API access-token verification and principal
  establishment are implemented; authoritative role/session stores, tenant confirmation of MFA
  evidence and verified ledger actors are open (decision 34). Full design:
  `docs/AUTH_ARCHITECTURE.md` (§4.5–§4.8 and §5.5).
- **Staff sign-in (M4.6.2):** `apps/web/src/server/staff-auth*.ts` and `src/proxy.ts` (only
  `/auth/login|callback|logout`, allow-listed query parameters, admin routes only);
  `apps/api/src/auth/` (`StaffAuthGuard` per controller, never global; JWT verification;
  `StaffPrincipalService` is the only caller of `establishPrincipal`; `StaffDirectory` and
  `SessionStatusSource` ports with a development-only file adapter and no production fallback).
- **Types** live in `@khums/shared-types/auth`. **Schemas** are in `@khums/validation/auth`; they
  are shape only and do not enumerate permissions.
- **Catalogue:** `@khums/core` `PERMISSION_REQUIREMENTS` and `ROLE_PERMISSIONS` are the single
  runtime definition, keyed by the shared permission and role types.
- **Trusted principals:**
  - `establishPrincipal` is exported only from `@khums/core/trusted-principal`;
    `scripts/check-boundaries.mjs` allows that subpath only in `apps/api`;
  - it returns frozen principals in a module-private registry;
  - `authorize` refuses any other principal-shaped value (`UNVERIFIED_PRINCIPAL`), and any
    principal older than 60 seconds (`PRINCIPAL_STALE`);
  - since M4.6.2 its trust source is a verified Auth0 access token plus the server-side
    directory and session ports (`AUTH_ARCHITECTURE.md` §4.8, §5.6).
- **Evaluator:** `authorize` is pure, deterministic, never throws and fails closed. It checks:
  - context and permission;
  - a trusted principal;
  - the resource type;
  - account and session;
  - permission;
  - Marja scope;
  - assurance reached at sign-in (AAL2; no step-up);
  - separation of duties and self-administration.
- **Governance entry point:** `executeGovernanceCommand` is the only exported way to change
  governance state.
  - It derives the resource from the detached pack and ledger.
  - It authorizes before running the domain command.
  - The actor comes from `principalId`; the time comes from the server context.
  - The raw domain commands are internal to core. The domain still enforces lifecycle,
    separation and integrity authoritatively.
- **Administrators** (`SUPER_ADMIN`) hold every permission since decision 64 (formerly no
  review, approval or publication permission) and cannot administer themselves. Dual-control role
  grants need a second administrator under `DUAL_ADMIN_V1`.
- **Unchanged:** the calculation engine has no authentication or authorization code.

## 6. Money & decimal strategy (implemented: `@khums/money`)

**Rule: JavaScript `number` is never used for money.** IEEE-754 floats cannot represent most decimal
fractions (`0.1 + 0.2 !== 0.3`), and Khums is a 20% computation over aggregated amounts where
rounding drift is unacceptable.

| Concern             | Implementation                                                                                                                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library             | `decimal.js` 10.6 behind `Decimal` / `Money` classes. No other package may import it (lint + boundary check), so it can be swapped.                                                                                                                                          |
| Input               | Decimal **strings only**: `^-?(0\|[1-9]\d*)(\.\d+)?$`, ≤ 100 chars. JS numbers, exponents, `+`, separators, whitespace, `NaN`/`Infinity` are rejected (`Result` errors).                                                                                                     |
| Exactness           | add, subtract, multiply, `percentage(rate)` (`× rate ÷ 100`) are exact. Each operation is checked _before_ it runs; if the exact result would exceed 1,000 significant digits it throws `PrecisionExceededError` rather than rounding. Division is deliberately not offered. |
| Rounding            | Only via `round(scale, mode)` / `roundToCurrency(mode)`. Seven named modes (`UP`, `DOWN`, `CEILING`, `FLOOR`, `HALF_UP`, `HALF_DOWN`, `HALF_EVEN`); **no default mode**.                                                                                                     |
| No silent rounding  | `toFixedScale(n)` / `toCurrencyString()` return `ROUNDING_REQUIRED` instead of rounding; `formatMoney` refuses unrounded amounts.                                                                                                                                            |
| Currency precision  | ISO 4217 minor units (USD 2, KWD/BHD/IQD/OMR/JOD 3, JPY 0, IRR 2 …). Used only when explicitly rounding to currency precision; calculations keep full precision. Real-world conventions that differ from ISO (e.g. IRR quoted without decimals) are rule-set / UI policy.    |
| Currency safety     | `Money` arithmetic across currencies throws `CurrencyMismatchError`; conversion must be explicit and sourced.                                                                                                                                                                |
| No implicit numbers | `Decimal`/`Money` throw `ImplicitConversionError` on numeric/default coercion (`+x`, `Number(x)`, `x * 2`, `a > b`). TypeScript accepts these expressions, and they would otherwise use floats or compare strings. Use `compare()`/`lessThan()`/`greaterThan()`/`equals()`.  |
| Serialization       | `toJSON()` → decimal strings (`{"amount":"12.3","currency":"USD"}`). Never JSON numbers. `decimalStringSchema` in `@khums/validation` reuses the same pattern.                                                                                                               |
| Formatting          | Separate module (`formatMoney`), `Intl.NumberFormat` with a string argument (no float conversion). Verify Hermes support when mobile starts.                                                                                                                                 |
| Policy (future)     | Rounding scale and mode for Khums results come from the rule set and are recorded in the trace; multi-currency conversions use dated, sourced rates captured in the trace.                                                                                                   |

### 6a. Financial input facts (M4.3.1)

User-provided financial facts are a **neutral layer before any rule pack**. They are defined in
`@khums/shared-types` (`FinancialFactSheet`, `FinancialFact`), validated in `@khums/validation`
(`financialFactSheetSchema`, `AMOUNT_INPUT_POLICY`) and reached by apps through `@khums/core`
(`parseFinancialFactSheet`). Approved rules:

- amounts are non-negative decimal strings, at most 15 integer digits, with no more decimal places
  than the currency's minor units;
- input is never rounded; negative amounts are rejected and zero is allowed;
- the sheet currency is only a preferred default, while each fact carries its actual currency;
  there is no conversion, cross-currency aggregation or inferred exchange rate;
- approximate dates stay approximate and never establish order or period membership;
  `requireExactDate()` makes rules ask or stop instead of guessing;
- missing, unknown and uncertain values are distinct;
- there is no religious classification field;
- non-monetary measurements (FR-M1), valuation precision and exchange rates are future designs.

Mapping facts to a pack's input categories is future, scholar-approved pack data. Full model:
[`FINANCIAL_INPUT_MODEL.md`](FINANCIAL_INPUT_MODEL.md).

## 7. Data & sync model (_Proposed_)

- **Anonymous mode (default):** all data stays on the device (web: IndexedDB; mobile: SQLite /
  secure storage). No account, no server calls with financial data.
- **Authenticated mode (opt-in):** user signs in; local records sync to the API. Records carry
  client-generated UUIDs and `updatedAt` / version counters for conflict resolution.
- `core` defines **ports** (`AssessmentRepository`, `Clock`, `Logger`, `SyncGateway`); each app
  provides adapters. This is how the same use case runs offline in the browser and on the server.
- See `docs/DATABASE_SCHEMA.md` for the server collections and `docs/SECURITY.md` for encryption.

## 8. AI boundary

AI features (if ever added — e.g. explaining a concept, answering "what does this term mean") are
confined to apps and produce **display text only**. AI output:

- is never parsed into calculation inputs, rule data or results;
- never selects or modifies a rule set;
- is always labelled as AI-generated and non-authoritative, with links to the cited rule sources.

Rule data enters the system only through the reviewed workflow in `docs/RELIGIOUS_RULES.md`.

## 9. Build & module strategy

- **Just-in-time internal packages:** packages export TypeScript source via `exports`
  (`"." : "./src/index.ts"`). There is no package build step.
  - **Web:** Next.js compiles them (`transpilePackages`).
  - **API:** NestJS 12 is ESM-only and needs decorator metadata, so `apps/api` is **bundled** with
    rspack (Nest CLI's ESM builder) and its built-in SWC loader: `@khums/*` source is compiled into
    `dist/main.js`; all npm dependencies stay external (`webpack-node-externals`) and load from
    `node_modules`. Type checking runs separately (`tsc --noEmit`). Tests use Vitest +
    `unplugin-swc` for the same decorator support.
  - **Mobile (future):** Metro compiles workspace TypeScript.
- **Trade-off:** no compiled `dist/` for packages keeps the loop fast and simple; the cost is one
  bundler config in the API. If a non-bundled Node consumer ever appears, compile packages (tsup /
  tsdown) at that point.
- **Module format:** ESM everywhere (`"type": "module"`, `moduleResolution: "Bundler"`).
- **Turborepo** orchestrates `build`, `lint`, `typecheck`, `test`, `test:e2e`, with a `transit`
  task so lint/typecheck caches invalidate when a dependency changes.

## 10. Future application integration

| App    | Integration notes                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------- |
| mobile | Imports `core`, `validation`, `money`, `api-client` (with RN `fetch`). Verify Hermes support for `Intl` string formatting. |
| api    | Feature modules expose `core` use cases over REST; DTOs from shared Zod contracts; MongoDB via Mongoose in Milestone 6.    |
| admin  | Calls the same API (admin-scoped routes); publishing produces an immutable, hashed rule-set version.                       |

## 10a. Web application structure (Step 4)

| Concern           | Location                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Design tokens     | `apps/web/src/app/globals.css` (semantic roles; light theme; dormant `.dark`; Urdu/RTL typography)     |
| Shared components | `packages/ui` (shadcn/ui style; see its README)                                                        |
| App shell         | `apps/web/src/components/layout/*` (header, nav, language switcher, footer, preview notice)            |
| Navigation        | `apps/web/src/config/navigation.ts` (paths and structure; labels come from content)                    |
| Content           | `apps/web/src/content/<area>/{types,en,ur}.ts` (site chrome, landing, pages)                           |
| Localization      | `apps/web/src/i18n/*` (config, negotiation, paths, server helper, coverage checker) and `src/proxy.ts` |
| Pages             | `apps/web/src/app/[locale]/**` (App Router; Server Components by default)                              |

### Localization (M4.2.2)

- **Locales:** `en` (LTR, default) and `ur` (RTL), defined once in `i18n/config.ts`.
- **Routing:**
  - every page lives under `/{locale}`, with both locales statically generated (`generateStaticParams`, `dynamicParams = false`);
  - the nested root layout `app/[locale]/layout.tsx` sets `<html lang dir>`;
  - `src/proxy.ts` (Next 16's replacement for middleware) redirects unprefixed URLs using the `NEXT_LOCALE` cookie, then `Accept-Language`, then `en`;
  - **the URL is the source of truth**; the cookie only records an explicit choice.
- **Reading the locale:**
  - Server Components call `getI18n()`, which uses `next/root-params`, so no locale prop drilling;
  - Client Components receive localized props or read `useParams()`;
  - components never branch on language.
- **Content:** typed per area (`SiteContent`, `LandingContent`, `PagesContent`) and aggregated in `content/index.ts` as `Record<Locale, …>`, so a missing locale is a compile error. `i18n/coverage.test.ts` fails on missing or extra keys, array length differences, empty strings, untranslated (non-Arabic-script) Urdu text, placeholder mismatches and changed identifiers.
- **Links:** all internal links are built with `localizePath()`; an e2e test asserts every link on an Urdu page stays in Urdu. The language switcher links to the same page in the other locale and sets the cookie. Changing locale is a full page load, so `lang`/`dir` are always correct.
- **RTL:**
  - logical spacing utilities only;
  - directional icons use `rtl:-scale-x-100`;
  - Urdu uses a Nastaliq-first system font stack, a 112.5% base size, `line-height: 2` (2.2 for headings), and no letter-spacing (it breaks Arabic-script joining);
  - English islands (`lang="en"`) keep English typography.
- **Mock label:** `MockCalculationNotice` shows the localized label **and** always the canonical English `MOCK_CALCULATION_LABEL`.
- **Not yet localized:** legal page bodies (English-only drafts, marked `lang="en" dir="ltr"` with a localized notice) and the internal design-system page.
- **No i18n library:** routing, negotiation and typed dictionaries are about 200 lines of tested code. Revisit (e.g. `next-intl`) if pluralization, ICU messages or many locales are needed.

### Onboarding and Marja selection (M4.2.3, corrected)

- **Journey:** `/{locale}/start` (welcome, process, preview status) → `/{locale}/start/marja`
  (selection, then review of the user's choice on the **same URL**). The assessment steps after
  it are not implemented yet.
- **Catalogue:** `PROVISIONAL_MARJA_CATALOGUE` in `@khums/marja-rules` (`src/catalogue/`), typed
  by `MarjaCatalogueEntry` in `@khums/shared-types`, copied from
  `docs/research/SOURCE_INVENTORY.md` rev 4 §2 (register) and §3 (evidence items).
  - Lifecycle **status**, the inventory's **proposed** lifecycle, **evidence confidence**,
    **human verification** and **counted evidence** are separate fields. Each evidence item keeps
    its **source class**, **access status**, **assessment** and **human verification** separately.
  - `LIVING`/`DECEASED` may be stated only when human-verified and backed by a counted, verified
    official item (SOURCE_INVENTORY §1.5–§1.6, RULE_PACK_STRUCTURE §3.2, REVIEW_PROCESS §9). Until
    then an entry is `PENDING_VERIFICATION`, or `UNKNOWN` when its proposed status has no recorded
    or counted item. Today every entry is pending or unknown.
  - An official source class never counts as verification, and an unreadable item
    (`ACCESS_BLOCKED`, `NOT_FOUND`, `NOT_YET_ACCESSED`) is never counted.
    `checkCatalogueConsistency()` enforces these rules, and `inventory-provenance.test.ts` reads
    `SOURCE_INVENTORY.md` itself and fails on any drift.
  - Research, rule-pack and calculation status stay independent. `isCalculationAvailable()` is
    false for every entry.
- **Access through `@khums/core`:** apps read the catalogue through `listMarjaCatalogue()`,
  `findMarjaCatalogueEntry()`, `isMarjaCalculationAvailable()` and `resolveMarjaSelection()`.
  These read the single catalogue (no copy). `scripts/check-boundaries.mjs` forbids web, admin
  and mobile from depending on, or importing, `@khums/marja-rules` or
  `@khums/calculation-engine` (in `src` and `e2e`). Next.js still compiles those packages
  transitively (`transpilePackages`).
- **The selection is transient and never in a URL:**
  - The form POSTs to a Server Function (`selectMarja`, used with `useActionState`), so it works
    without JavaScript (progressive enhancement), and the review renders on the same URL.
  - The function validates the ID against the catalogue and returns only
    `idle | error(required|invalid) | selected(id)`.
  - The choice lives in React state, or in the single no-JS response. It is not written to
    cookies, `localStorage`, `sessionStorage`, a database or a server record. It is gone when the
    user leaves, and the UI says so.
  - Server Function invocation logging is disabled (`logging.serverFunctions: false`). No
    analytics exist.
- **No default, recommendation or ranking:** nothing is pre-selected (only the user's own choice
  from the same page visit, after "Change selection"), and the list is sorted alphabetically per
  locale. "My Marja is not listed" is always offered.
- **No search filter:** 10 candidates plus "not listed" are short enough to scan. Revisit at about
  20 entries.

### Assessment type selection and flow continuation (M4.2.4)

- **Journey:** `/{locale}/start` → `/{locale}/start/marja`, where the transient flow runs on one URL:
  Marja → review → **assessment type** → **summary**. The flow ends at the summary; details entry
  and calculation are later milestones.
- **Assessment types** are exactly the shared `Workflow` type (`annual`, `first-time`,
  `missed-year`) that the engine runs. `ASSESSMENT_WORKFLOWS` in `@khums/core` lists them, with a
  compile-time check against `Workflow`. Listing a type says nothing about whether it applies to a
  user or whether a pack defines it; each rule pack decides (`WORKFLOW_NOT_SUPPORTED`). The wording
  reuses the approved landing-page descriptions.
- **Flow logic is framework-independent:** `advanceOnboarding()` in `@khums/core` computes the next
  state from one submission's untrusted values (`intent`, `marja`, `assessment`). It is pure and
  tested, and it **never uses the previous state**. The Marja carried in a hidden field is
  re-validated against the catalogue at every step; a missing or tampered value returns to Marja
  selection with a "could not be confirmed, choose again" message (`lost`) and is never
  substituted.
- **Web:** a single Server Function (`submitOnboardingStep`) wraps `advanceOnboarding`, and
  `OnboardingFlow` renders each step as a native form with intent buttons. It works without
  JavaScript (every step is a POST; "Back" and "Change" are server steps too). No cookies, browser
  storage, database or server record; Server Function logging stays disabled.
- **Single URL:** a transient choice cannot be carried across URLs without exposing or storing it,
  so all steps share `/start/marja`. The page title is the neutral "Set up your assessment"; each
  step has its own `h1`, a progress state, and focus moves to the new heading.
- **Calculation availability** is shown from `isMarjaCalculationAvailable()`, false for every
  entry today, so the assessment and summary steps always explain that no authoritative
  calculation can follow. Per-workflow availability (does the pack define this workflow?) needs a
  pack registry and is deferred to M4.4.

### Financial fact entry (M4.3.2)

- **Journey:** after the summary, "Continue to financial details" (a server step carrying only the
  Marja and assessment type) opens the **details** step on the same URL, at progress step 3 of 3.
- **Facts never leave the browser:**
  - They live in React state in `OnboardingFlow`, so they survive "Back to your setup" and return.
  - They are **not** sent to a Server Function, written to cookies, local or session storage, or
    a database, or put in a URL.
  - The fact form is never a native submission: it has no field `name`s, submit is always
    prevented, and it renders only after hydration.
  - Unsaved data is protected without storing anything:
    - closing an edited form asks first, and so does "Back to your setup" while a form has
      changes. An untouched form never asks; edits are detected by comparing drafts;
    - choosing a different assessment type asks before discarding saved entries;
    - while entries or a changed form exist, in-app links (which navigate client-side and never
      fire `beforeunload`) are confirmed, then followed with a full navigation, and reload or
      close triggers the browser's prompt;
    - confirmations use an accessible native modal `<dialog>`
      (`components/common/confirm-dialog.tsx`): the safe choice has focus, Escape keeps the data,
      and focus returns to the opener. Reload or restart still clears everything, and the UI
      says so.
- **No JavaScript, no fact entry.** The step explains that it needs JavaScript rather than
  sending financial values to the server. This deliberate exception to progressive enhancement
  is recorded as decision 27.
- **Validation outside React:**
  - `apps/web/src/financial/drafts.ts` (pure) turns form drafts into `FinancialFact`s and
    delegates to `@khums/core` (`validateFactInFrame`, `validateFactSheetFrame`, `factIssuesById`),
    which uses the `@khums/validation` schemas.
  - Errors are field keys plus codes, never values.
  - `entry-state.ts` (pure) holds add, edit, remove and period operations.
- **Currency:**
  - each fact keeps its own currency, chosen from `FACT_CURRENCIES`;
  - amounts are typed as text (`inputMode="decimal"`, `dir="ltr"`), never `type="number"` or
    floats;
  - display uses `formatFactAmount` (`@khums/money`, no rounding);
  - there are no totals, conversion or exchange rates.
- **Neutral UI:**
  - kinds and subtypes come from `FACT_KINDS` and `FINANCIAL_FACT_SUBTYPES`, with no additions;
  - the wording records what the user reports, and there is no classification, calculation or
    percentage;
  - saved facts that no longer match changed dates are flagged for editing, never altered.
- **Urdu controls:** Nastaliq needs `line-height: 2`, so Urdu selects and text inputs grow from
  the `h-10` minimum (`globals.css`).

### Fact sheet review and local export (M4.3.3)

- **Review:** "Review all entries" switches the details step to a read-only review on the
  client, of the same in-memory sheet (`FactReview`), with no server step.
  - It shows the summary, the uncertainty counts, every fact by kind, and any issues.
  - "Edit" returns to the entry form for that fact, "Remove" asks first, and "Back to financial
    details" returns to entry.
- **Export:** a user-activated button builds the export with `buildFactSheetExport`
  (`@khums/core`), which revalidates and copies values unchanged, and saves it with a Blob and a
  download link. Nothing is sent to a server.
  - The leave guard ignores `blob:` and `download` links.
  - The format is versioned and documented in `FINANCIAL_INPUT_MODEL.md` §9.
- **Pure helpers:** `financial/review.ts` holds the readiness status and the date-state counts.
  Amounts and notes are isolated with `<bdi>`, so they read correctly inside RTL layouts.

Principles:

- Presentation only in components. Workflows and calculations will go through an
  application/use-case layer and the engine (M4.3–M4.4), never inline in React.
- A site-wide preview notice states that all calculations use mock rule packs. It is removed only
  at Gate R.
- Responsive and accessibility behaviour is verified by Playwright on desktop (1280), tablet (768)
  and mobile (Pixel 7), with axe-core WCAG 2.0–2.2 A/AA scans, in both locales.

## 11. Architecture decision log

| #   | Decision                                      | Status                         | Rationale / trade-off                                                                                                                                                                                         |
| --- | --------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Turborepo + pnpm workspaces + catalogs        | Accepted                       | Specified. Catalogs keep versions in one place.                                                                                                                                                               |
| 2   | TypeScript 6.0 (not 7.0)                      | Accepted                       | `typescript-eslint` 8.x supports `<6.1`. Revisit when it supports TS 7.                                                                                                                                       |
| 3   | ESLint 9 (not 10)                             | Accepted                       | `eslint-config-next` plugins (react, import, jsx-a11y) don't yet support ESLint 10. npm marks 9.39.5 deprecated; upgrade when the plugins support 10.                                                         |
| 4   | Engine receives rule set as input             | Accepted (approved 2026-11-19) | Separation of rules and execution; reproducibility.                                                                                                                                                           |
| 5   | JIT internal packages; API bundled            | Accepted (approved 2026-11-19) | Simplicity; the API bundles `@khums/*` with rspack + SWC (§9) instead of compiling every package. Approval is conditional on the production smoke test (`pnpm --filter @khums/api smoke`, run in CI) passing. |
| 6   | `decimal.js` behind `@khums/money`            | Accepted                       | Specified in Step 1.1. See §6.                                                                                                                                                                                |
| 7   | Mongoose for MongoDB                          | Accepted (approved 2026-11-19) | Schema validation + middleware; Zod remains the API contract. Alt: native driver + Zod. Mongoose models stay inside `apps/api` (boundary-enforced).                                                           |
| 8   | `@khums/ui` is React DOM only                 | Accepted (approved 2026-11-19) | shadcn/ui is web-only; mobile gets native UI (future `ui-native`).                                                                                                                                            |
| 9   | Local-first, anonymous by default             | Accepted (approved 2026-11-19) | Privacy-first requirement.                                                                                                                                                                                    |
| 10  | Defer Expo/admin initialization               | Accepted                       | Avoid React/RN version pinning during the web MVP. (NestJS was initialized in Step 1.1.)                                                                                                                      |
| 11  | Respect pnpm `minimumReleaseAge`              | Accepted                       | Supply-chain guard kept on: turbo pinned to 2.11.12 because 2.11.13 was under a day old.                                                                                                                      |
| 12  | One NestJS 12 backend for all clients         | Accepted (approved 2026-11-19) | Specified in Step 1.1. ESM-only framework → rspack bundle via Nest CLI. Rspack approved subject to production smoke tests.                                                                                    |
| 13  | Zod contracts → OpenAPI (no class-validator)  | Accepted                       | One source of truth in `@khums/validation`; Nest DTOs via `createZodDto`; spec generated and drift-tested (§12).                                                                                              |
| 14  | Own typed config module (no `@nestjs/config`) | Accepted (approved 2026-11-19) | Zod-validated, frozen `AppConfig`; `.env` loaded with Node's `process.loadEnvFile` in development only. Fewer deps, typed access.                                                                             |
| 15  | pino via `nestjs-pino` for logs               | Accepted (approved 2026-11-19) | Structured JSON, low overhead, redaction; pretty output only in development.                                                                                                                                  |
| 16  | Express adapter (not Fastify)                 | Accepted (approved 2026-11-19) | Nest default, widest middleware ecosystem (helmet). Fastify remains an option if throughput requires.                                                                                                         |

| 17 | Request contracts strict, response contracts additive | Accepted (approved 2026-11-19) | See §12 "Compatibility policy". Responses are serialized through their schema so additive openness never exposes undeclared fields. |
| 18 | Generic rule-pack interpreter; formulas only as approved pack data | Accepted (approved 2026-11-20) | §5. Keeps all religious logic reviewable as data; the engine refuses production use of unapproved packs. |
| 19 | Religious review is a pre-launch gate (Gate R), not a development blocker | Accepted (owner, 2026-11-20) | `docs/DEVELOPMENT_ROADMAP.md`. Development uses MOCK packs only. |
| 20 | Web UI dependencies: `class-variance-authority`, `lucide-react` (shadcn defaults); Testing Library + jsdom 29 (dev); `@axe-core/playwright` (dev) | Implemented (pending approval) | Standard shadcn stack. jsdom pinned to 29 (supports Node ≥ 24; jsdom 30+ needs ≥ 24.15). Versions pinned older than pnpm's release-age window. |
| 21 | Locale-prefixed routing (`/en`, `/ur`) with `proxy.ts` negotiation; typed content modules; no i18n library | Implemented (pending approval) | §10a. URL is authoritative (shareable, cacheable, server-rendered `lang`/`dir`); `next/root-params` avoids prop drilling; ~200 tested lines instead of a dependency. |
| 22 | Provisional Marja catalogue as typed data in `@khums/marja-rules`: lifecycle status, proposed lifecycle, evidence confidence, human verification and per-item source class/access/assessment kept separate; `LIVING`/`DECEASED` only when human-verified | Implemented (pending approval; corrected 2026-11-20) | §10a. Sourced only from `SOURCE_INVENTORY.md` rev 4 §2–§3, cross-checked by a test that reads the inventory. Correction: the first version stated proposed statuses as `LIVING`/`DECEASED`. |
| 23 | Onboarding selection submitted by POST to a Server Function (`useActionState`), held only in page state; never in a URL, cookie, browser storage, database or log | Implemented (pending approval; replaces the URL-query approach) | §10a. A religious preference is sensitive; progressive enhancement keeps it working without JavaScript. |
| 24 | Apps reach Marja data and the engine only through `@khums/core`; the boundary check forbids web/admin/mobile from using `@khums/marja-rules` or `@khums/calculation-engine` directly | Implemented (pending approval) | Matches `apps → core → rules` in CLAUDE.md. No new package edge (core already depended on marja-rules). |
| 25 | Onboarding as a pure state machine in `@khums/core` (`advanceOnboarding`), driven by one POST Server Function; every step re-validates all carried values and ignores the previous state; all steps share one URL | Implemented (pending approval) | §10a. Keeps choices out of URLs and storage, works without JavaScript, and keeps business rules out of React. |
| 26 | Neutral financial facts (`FinancialFactSheet`) separate from the engine's rule-pack-category `FinancialEntry`; fact → category mapping will be scholar-approved pack data; input amounts validated, never rounded (≤ currency minor units, ≤ 15 integer digits, non-negative) | Approved 2026-11-20 (policy locked: 15 integer digits, reject excess precision, no rounding, no negatives, zero allowed) | `docs/FINANCIAL_INPUT_MODEL.md`. Keeps facts reusable across Maraje and keeps every religious decision in packs. Subtype vocabulary is provisional. |
| 27 | Financial facts are entered and held only in client memory; no Server Function, storage, cookie or URL carries them; the details step requires JavaScript (explicit exception to progressive enhancement) | Implemented (pending approval) | §10a. Keeps sensitive values on the device. Server Function logging is off anyway, but not sending the data is the stronger guarantee. |
| 28 | Local JSON export of the fact sheet: versioned (`exportVersion: 1`), revalidated before export, values copied unchanged, fact ids and Marja excluded, created in the browser only on explicit user action | Implemented (pending approval) | `FINANCIAL_INPUT_MODEL.md` §9. Gives users a copy without any server, storage or account. Import is not implemented. |
| 29 | Fact → category mapping is pack data (pack `schemaVersion` 2, `mappingVersion` 1), executed by a pure engine module; no defaults, explicit uncertainty handling, consultation for anything unmatched; no arithmetic or currency conversion in mapping | Implemented (pending approval) | §5a; `RULE_PACK_STRUCTURE.md` rev 6 §5.7. Version 1 packs unaffected. No real mapping exists (MOCK fixtures only). |
| 30 | Rule-pack integrity: SHA-256 over `khums-jcs-1` (RFC 8785 profile, safe integers only) of the pack minus `integrity`/`contentHash`/`approvals`/`status`; recomputed at every gate; approvals and activation bound to the recomputed digest; pure sync implementation with `@noble/hashes` in the engine (no port) | Implemented (pending approval) | §5b; `RULE_PACK_STRUCTURE.md` rev 7 §5.8. Closes FR-1. New dependency `@noble/hashes` 2.0.1 (audited, zero dependencies, pure JS). |
| 31 | Governance as an event-sourced, append-only, hash-chained ledger per pack version in `@khums/core`; state derived by replay; integrity-bound approvals/publication/activation referencing exact records; identities as unverified references; no persistence | Implemented (pending approval) | §5c; `RULE_PACK_STRUCTURE.md` rev 8 §5.9. Prepares FR-2/FR-3 without authentication or storage. Truncation/full-rewrite protection needs storage-level enforcement. |
| 32 | Staff authentication through a managed OIDC provider with the API as confidential client and server-side sessions; roles and permissions held server-side in a central permission catalogue; a pure policy decision point before every governance command; domain separation rules stay authoritative; phishing-resistant MFA and step-up for review, approval, publication, activation and role grants; administrators cannot review, approve or publish | Accepted design (M4.6.0, 2026-11-20) | §5d; `docs/AUTH_ARCHITECTURE.md`. Provider choice is the owner's. Authorization implemented in M4.6.1 (decision 33); authentication not implemented; FR-2 stays open until M4.6.2. |
| 33 | Centralized authorization in `@khums/core`: one permission catalogue keyed by shared types; principals trusted by identity (server-only `establishPrincipal` registry), not by shape; a pure fail-closed evaluator; `executeGovernanceCommand` as the only exported governance state-change entry point; raw commands made internal; the API-only subpath enforced by the boundary check | Implemented; policies approved 2026-11-20 | §5d; `AUTH_ARCHITECTURE.md` §5.5–§5.6. Four additional policies approved by the owner 2026-11-20 (historical, version-scoped authorship; independent activation; dual control for administrator grants; ledger-derived identity for withdraw/supersede). The registry is interim until M4.6.2. No provider, sessions, endpoints or database. |
| 34 | Staff identity through Auth0: the Next.js server is the confidential OIDC client (official `@auth0/nextjs-auth0` SDK, encrypted stateless session cookie, scope `openid`, no refresh token, no browser-visible tokens) and calls the API server-to-server with an Auth0 access token; the API verifies it (jose, RS256 JWKS, exact `iss`/`aud`, `azp`, max token age) and establishes principals only from verified identity plus server-side directory and session ports; MFA evidence from signed Action claims; roles never from Auth0; development-only role file, no production fallback | Superseded for staff by decision 36 (M4.6.2b, 2026-11-21); Auth0 kept for future public Google Sign-In | `AUTH_ARCHITECTURE.md` §4.5–§4.8. Supersedes decision 32's "API as OIDC client". Not a BFF: Next.js proxies no business endpoints; the API remains the only backend and the only authorization point. New dependencies: `@auth0/nextjs-auth0` 4.33.0 (web), `jose` 6.2.15 (API). Open: authoritative stores (M4.6.3), tenant confirmation of MFA evidence, back-channel revocation, verified ledger actors. |
| 35 | Staff authenticate once: every governance permission requires a multi-factor sign-in (AAL2) and nothing more; per-action step-up, the 10-minute re-authentication window, AAL3 requirements and the `STEP_UP_REQUIRED` deny reason removed | Implemented (owner policy, 2026-11-21) | `AUTH_ARCHITECTURE.md` §4.7, §5.2. Supersedes the AAL3/step-up parts of decisions 32–33. Unchanged: MFA at every sign-in (Action 1 plus API evidence check), server-side authentication and authorization per request, roles, Marja scope, separation of duties, dual control, session expiry and revocation, suspension, governance domain rules. `AdminSessionResponse.authentication.stepUpValidUntil` removed (internal staff endpoint, single consumer). |
| 36 | Staff authentication moves to NestJS: username/password (Argon2id), server-side sessions in MongoDB behind a first-party `__Host-` cookie via a Vercel rewrite (transport only), CSRF synchronizer token, distributed rate limiting with bounded lockout, temporary passwords with forced change; no mandatory MFA (assurance field kept for optional MFA); `IdentityProvider` interface with Google Sign-In kept as the future public-user option | Implemented (M4.6.2b, 2026-11-21), awaiting review | `AUTH_ARCHITECTURE.md` §4.10. Supersedes decision 34 for staff once implemented (Auth0 remains for future public users). Roles: SUPER_ADMIN (replaces PLATFORM_ADMIN), GOVERNING_SCHOLAR, SCHOLAR_REVIEWER, AUDITOR; independent-review roles kept defined. As built: Argon2id via `node:crypto` (no native dependency), `sessionEpoch` for immediate revocation, three-key bounded throttling, `PLATFORM_ADMIN` renamed `SUPER_ADMIN`, new `identity.user.read` permission; the Auth0 staff path, `jose` and `@auth0/nextjs-auth0` removed. Rewrite cookie/CSRF behaviour verified with Playwright through a real Next.js rewrite; to repeat on Vercel before M4.7. |
| 37 | Administrative control is a versioned setting: `SINGLE_ADMIN_V1` initially (one SUPER_ADMIN grants roles and changes policies with mandatory reason and audit, no deadlock), `DUAL_ADMIN_V1` later (requires two active SUPER_ADMINs); no self-grants; SUPER_ADMIN incompatible with religious roles; audit chain with periodic external integrity checkpoints | `SINGLE_ADMIN_V1`, bootstrap, role incompatibility and checkpoints implemented (M4.6.2b/M4.6.3a); `DUAL_ADMIN_V1` grant flow and single-admin policy changes not yet built | `AUTH_ARCHITECTURE.md` §4.10. Amends the dual-administrator rule of the single-scholar stage 4 work (kept as `DUAL_ADMIN_V1`). Full-chain rewrite is undetectable without the external checkpoint. |
| 38 | Persistence foundation: official `mongodb` driver (not Mongoose) in `apps/api` only; append-only, hash-chained collections written with `insertOne` behind unique sequence indexes (derived head, no mutable head document), idempotent retries by stable record identity, Zod validation and core chain verification on every read; collection-specific least-privilege Atlas roles (`khumsApp`, `khumsCheckpoint`, `khumsMigrator`); in-memory adapters for development and tests | Implemented (M4.6.3a, 2026-11-21) | `DATABASE_SCHEMA.md` §3.8–§3.9. New dependency: `mongodb` (API only). Pure chain logic lives in `@khums/core` (`persistence/`); the API only stores. Without `MONGODB_URI`, production stores stay unavailable (fail closed). |
| 39 | Signed integrity checkpoints: Ed25519 over a domain-separated canonical payload, signed by a separate checkpoint job whose key is held only in a sign-only KMS key or protected CI secret (never MongoDB, never the API runtime); trusted public keys version-controlled; copies in `auditCheckpoints` and an independent WORM archive | Format, signing and verification implemented (M4.6.3a); KMS signer and WORM archive writer are M4.7 entry criteria | `AUTH_ARCHITECTURE.md` §4.11. Addresses the full-chain-rewrite limitation of decision 37 against database administrators who do not also control the archive account and the signing key. |
| 40 | D1: the governance API is split. M4.6.4a (pack ledgers and commands, pack content, policies, audit reads) now; M4.6.4b (provisional enable/disable, scholar feedback) only after M4.5a (operational states, `releaseChannel`) | M4.6.4a implemented (owner approval 2026-11-21) | Provisional and feedback endpoints depend on server-side operational state and schemaVersion 3, which do not exist yet. `AUTH_ARCHITECTURE.md` §5.7 |
| 41 | D2: pack content is stored write-once in `rulePackContents` (one document per binding ledger record and kind: the submitted copy, and the published copy with status `PUBLISHED`); only SUBMIT carries content, every later command names the pack version and `expectedSequence` and the server loads the bound content, re-verifying its digest against the stored digest and the ledger on every read | Implemented (M4.6.4a) | Clients can never present replacement content; published content is immutable (append-only collection, no update/delete privilege). Exact JSON stored as a string so the digest check is byte-exact. Integrity failures fail closed (503, logged by code) |
| 42 | D3: ledger actors written by the API are `{ kind: 'STAFF_PRINCIPAL', subject: principalId }` from the guard-established session; legacy `UNVERIFIED_REFERENCE` records stay valid and are never rewritten or re-hashed; the authorization attestation lives in the audit event | Implemented (M4.6.4a); `RULE_PACK_STRUCTURE.md` revision 9 | A discriminated actor kind is an additive record version (the digest covers the actor, so old records keep their digests). Separation rules compare `subject` across kinds, which can only be stricter |
| 43 | Every version of a pack id is bound to the Marja of its first stored content; a submission naming another Marja is refused (`PACK_MARJA_MISMATCH`) | Implemented (M4.6.4a) | The ledger records digests, not the Marja, and core authorizes SUBMIT on the content's own Marja: without this binding an author in scope for Marja B could take over a pack version of Marja A by resubmitting it under B |
| 44 | One unit-of-work abstraction (`persistence/unit-of-work.ts`) for staff administration and governance: MongoDB transactions with snapshot reads, majority journaled writes and whole-unit retry on a lost sequence race; sequential (no rollback) only in development/test memory | Implemented (M4.6.4a) | A governance command's ledger record, content and audit event (and a policy change's registry record and audit event) commit together or not at all. No concurrent operations inside a unit of work (MongoDB sessions do not support them) |
| 45 | Pack `schemaVersion` 3 adds a required, hashed `releaseChannel` (`SCHOLAR_REVIEW` / `PRODUCTION`); versions 1–2 carry none and are never migrated or re-hashed | Implemented (M4.5a); `RULE_PACK_STRUCTURE.md` revision 10 | Hashing the channel makes a relabelled pack lose its integrity, approvals and activations; a scholar-review pack can never become a production pack, only a new `PRODUCTION` version can |
| 46 | Engine calculation modes are strictly separated by channel: `production` refuses scholar-review packs (`READINESS_SCHOLAR_REVIEW_PACK`, also in activation, publication and governance approval eligibility); `scholar-review` accepts only sealed version 3 scholar-review packs (`CHANNEL_MISMATCH`) and labels results `PROVISIONAL_SCHOLAR_REVIEW`; `development` refuses scholar-review packs | Implemented (M4.5a) | Provisional content always carries the PROVISIONAL — FOR SCHOLAR REVIEW ONLY label, and mock and approved paths can never show it unlabelled. The production gate is only extended, never weakened |
| 47 | The operational state is enforced in the API from its validated configuration (`KHUMS_OPERATIONAL_STATE`; unset is unconfigured in production; `DEVELOPMENT` refused in production); `@khums/core` `provisionalActionAllowed` decides per action: register/enable/calculate/feedback only in `SCHOLAR_REVIEW`; disable, read and feedback responses in every configured state | Implemented (M4.5a) | Provisional calculations are refused in `PRODUCTION_APPROVED` by state, channel and readiness together; a provisional pack can always be stopped (emergency disable) and inspected |
| 48 | Provisional state is an append-only, hash-chained record list per pack version (`provisionalPackRecords`), replayed by core; content write-once in `rulePackContents` (kind `PROVISIONAL`); one record per provisional calculation (`provisionalCalculations`) without input or result figures; feedback write-once (`feedbackReports`) with append-only status records | Implemented (M4.5a) | Same integrity discipline as governance ledgers (derived state, unique sequence indexes, digest links, unit-of-work atomicity with the audit event). No financial values are stored server-side |
| 49 | Scholar review web experience (M4.5.2): staff-only pages under `/admin/review`, gated by the web operational state (`SCHOLAR_REVIEW`) and the staff session, with every read and command authorized by the API. Facts are mapped in the browser with the pack's own fact mapping (`prepareAssessmentInput`, no calculation); the provisional calculation runs only on the API. The browser verifies the pack content (schema, registered digest, scholar-review channel) and shows a result only if it is a `scholar-review` result for exactly the reviewed version and content | Implemented (M4.5.2) | Keeps provisional calculation server-side (recorded and audited) while reusing the public fact-entry and results components; a production or mock result can never be displayed on the review path, and results panels in the provisional context always carry the provisional notice |
| 50 | Scholar review reports are produced by the browser's print-to-PDF from a print view of the results (provisional notice and a provisional footer on every page, rule and source lists expanded); history is the API's calculation records (no figures) joined with feedback | Implemented (M4.5.2) | Browser printing shapes Urdu Nastaliq and right-to-left layout exactly, which PDF libraries do not; figures are never stored server-side. A server-generated PDF with embedded fonts is a possible later addition |
| 51 | Staff console (M4.6.5): Server Component pages under `/admin/*` read through the API with the forwarded session cookie; every command goes from the browser through `@khums/api-client` with the CSRF header. Navigation by permission is informational only; the API authorizes and audits every read and command, and its refusals are shown by stable problem code (server `detail` text is never displayed) | Implemented (M4.6.5) | No authorization logic in the web app; staff, role/Marja-scope, policy, governance-lifecycle, provisional-pack, feedback and audit administration reuse the existing endpoints and their safeguards unchanged |
| 52 | Cursor paging for console lists: opaque base64url cursors over a deterministic sort key (`calculatedAt|calculationId` newest first; `submittedAt|feedbackId` oldest first), malformed cursors refused (400); team-wide calculation history limited to versions the caller may read; the review report prints only the report (everything else `display: none`) with the per-page provisional footer as an `@page` margin box, verified by a Playwright PDF render in English and Urdu | Implemented (M4.6.5) | Paging is in memory after the authorization filter (sufficient for the scholar-review scale; database-side paging when volumes grow). The PDF check found and fixed blank-page, footer-overlap and print-restore defects |
| 53 | Private scholar review runs on free hosting (owner decision 2026-11-22): Vercel Hobby (web), Render Free with a Docker image on Node 26 (API, `apps/api/Dockerfile`, `render.yaml`), the existing Atlas M0, the free Vercel URL; $0/month. KMS, WORM and a dedicated cluster stay production requirements; private-review and production readiness criteria are separate (`DEPLOYMENT_FREE_TIER.md` §10) | Implemented locally (M4.7 Phase 1); deployment pending approval | No architectural change: one stateless API, sessions in MongoDB, the existing signed-edge design. Trade-offs: cold starts, shared Render egress, no M0 backups, Hobby eligibility, the temporary use of the existing Atlas user (documented risk) |
| 54 | Whole-application private gate in `proxy.ts`: in `PRIVATE` mode (always for `SCHOLAR_REVIEW`; every hosted deployment unless `PRODUCTION_APPROVED` with `KHUMS_PUBLIC_ACCESS=enabled`) every page except sign-in requires a session the API confirms on each page request; `noindex`, `no-store`; a sleeping API sends the visitor to a wake step on the sign-in page. The API refuses every unsigned request except the health check when `KHUMS_REQUIRE_EDGE_SIGNATURE` is set (mandatory for production `SCHOLAR_REVIEW`); Server Component calls are signed like browser requests | Implemented (M4.7) | Adds gates without replacing sessions, CSRF, throttling, authorization or audit. Cost: one API session check per page request (acceptable at scholar-review scale) |
| 55 | KMS-free integrity checkpoints for private review: the existing Ed25519 PEM signer runs only on the maintainer's machine; provisional chains are checkpointed; an append-only local archive file (`--archive`, `--export-integrity-checkpoints`) accepts only trusted, correctly signed checkpoints, and `--verify-integrity <archive>` checks the database against it | Implemented (M4.7) | The signing and verification interfaces were unchanged (verified first). Not WORM: append-only by procedure; acceptable only for provisional review, never production |
| 56 | Independent scholar governance gaps closed (M5.2.1, owner decisions 2026-11-22): SUPER_ADMIN loses `governance.activate` and `governance.withdraw` and gains only `governance.withdraw.emergency` (PUBLISHED versions, required reason, audited with `emergency: true`); legacy ledgers whose SUBMITTED records name no policy fail closed (no new record except a withdrawal or an appended `POLICY_BOUND` record carrying the Marja's current registry policy, via `governance.policy.bindLegacy`); replay still verifies their history unchanged | Implemented (M5.2.1) | Activation now always carries a scholar's authority; no ledger silently acquires a second-person policy; historical records and immutable content untouched. The two-administrator controls for role grants and policy changes are unchanged |
| 57 | Scholar research management (M5.3.1, approved with required changes 2026-11-22): MongoDB system of record; every research entity (source, passage, translation, finding, ruling version) an append-only, hash-chained revision chain replayed by `@khums/core`; UUIDv7 ids with readable references; evidence bytes behind a provider-independent encrypted `EvidenceStorage`; research permissions on `MARJA_RESEARCH` held only by `GOVERNING_SCHOLAR` (separation `NONE`, never policy-dependent), auditors metadata-only; research creation limited to `sistani` and `khamenei`; rule packs reference exact approved rulings and verified sources with snapshots | Design approved; M5.3.2 domain foundations implemented, with acceptance fixes (stale commands refused by `expectedRevision`, cumulative AI declarations, references resolved while drafting, staff-only actors and recomputed display references on replay); the API must still persist atomically (M5.3.3) | `docs/SCHOLAR_RESEARCH_ARCHITECTURE.md`. Reuses the append-only collections, unit of work, audit chain, checkpoints and authorization engine; no ORM; no counters |
| 58 | Research evidence layer (M5.3.3): sources, passages and translations as research revision chains stored one document per revision (`recordJson` + index copies) and replayed by `@khums/core` (`executeEvidenceCommand`) on every read; per-type payload schemas and immutable bindings in core; `{entityId, revision}` unique + MongoDB transactions + `expectedRevision` for concurrency; each revision with its audit event in one unit of work; research chains in the integrity checkpoints; evidence bytes behind `EvidenceStorage` (AES-256-GCM local provider for development, unavailable in production), metadata write-once in `evidenceArtefacts` unique per Marja and digest | Implemented, in review; production evidence storage deliberately unavailable until an approved durable provider exists | `docs/SCHOLAR_RESEARCH_ARCHITECTURE.md` §4.2, §4.3.1, §8.1 |
| 59 | M5.4 review infrastructure (owner decision 2026-11-22, "Build review infrastructure"; CLAUDE.md rule 1): rule review status is DERIVED, never authored or stored. `@khums/core` `reviewRules` computes one of six statuses per rule (`SOURCE_VERIFIED_AWAITING_SCHOLAR_REVIEW`, `PARTIALLY_VERIFIED`, `SOURCE_UNVERIFIED`, `SCHOLAR_APPROVED`, `SCHOLAR_REJECTED`, `NEEDS_CORRECTION`) from the pack (optional, hashed `SourceReference.locatorCheck`, `RuleDefinition.questionIds` and `openIssues`), the live state of every cited ruling version, the PROVISIONAL ruling-reference checks and open rule-content/source feedback; the API returns it with the pack content (`reviews`, additive). Per-Marja scholar-review packs (`@khums/marja-rules` `buildReviewPack`, sealed by core `sealedReviewPack`) encode NO ruling: one UNVERIFIED placeholder rule per catalogue question citing the preparation-matrix source locators, every fact-mapping rule and program step a consultation stop, no categories, parameters or aggregate; test scenarios carry technical expectations only (`religiousResult: null`, `NOT_SET_BY_SCHOLAR`) | Implemented (M5.4), awaiting review | No engine, readiness or governance change; production still needs approved, activated packs. A rule becomes SCHOLAR_APPROVED only when every cited ruling version is current and APPROVED and the rule's encoding is APPROVED. Packs are registered through the existing provisional workflow (console download + upload); placeholders are replaced only by later pack versions encoding the governing scholar's approved rulings |
| 60 | Provisional transcription (owner decision 2026-11-23; CLAUDE.md rules 1 and 3 amended): AI may encode a ruling an authenticated, office-published source states **explicitly** into a `SCHOLAR_REVIEW` pack, citing the exact source, edition and ruling or section with a short excerpt of the original, status `UNVERIFIED`, results PROVISIONAL — FOR SCHOLAR REVIEW ONLY, staff-only. Interpretation (ambiguous, incomplete, disputed, edition-dependent or unattributed text, or a judgement of the person's circumstances) stays a `consult` stop; verification and approval stay with the governing scholar. Review packs 0.2.0: Sistani rulings 1769–1771, 1776, 1791, 1792, 1795, 1799 (Persian and English 4th edition compared) and Khamenei «احکام خمس» (introduction; «درآمد کسب و کار»; «مؤونه کسب درآمد»; «هدیه (هبه)»; «عیدی و پاداش»; «ارث»; «حقوق بازنشستگی»; «مؤونه معیشت و زندگی»; «صدقات») drive the annual calculation. Extended 2026-11-23: mined products, treasure, gems from diving and mixed lawful/unlawful property as separate obligations (Sistani 1815–1817, 1821, 1824–1826, 1828, 1830–1832, 1836; Khamenei «معدن», «گنج», «جواهری که با غوّاصی به دست آید», «مال مخلوط با حرام»), debts by each text (Sistani 1803; Khamenei «بدهی و مال قرضی»), a total and its two equal halves (Sistani 1851, Persian «نصف دیگر»; Khamenei «خمس از دو قسمت مساوی»). Spoils of war (1845–1849) and land bought by a dhimmī (1850, itself «محل اشکال») are not calculable for the users; sales, losses, holdings, below-niṣāb treasure or gems, first-time and missed years stop for review, each blocking only the figure it affects. Pack registration alone has a 512 kB body limit (every other route keeps 100 kB). Further 2026-11-23: khums-paid or inherited holdings excluded (Sistani Jami’ 737; Khamenei «اموال مخمّس»), business capital losses deducted (Sistani 1791, 1801, Jami’ 685; Khamenei «جبران خسارات سرمایه»), Khamenei business costs beyond business income deducted from the year’s profit, each non-khums mixed-property duty listed separately (Sistani 1831, 1832, 1835; Khamenei «راه حلال شدن…»), recipient conditions shown with the halves (Sistani 1851–1866; Khamenei «ولی امر خمس», whose identity after the recorded date of death stays a review item), Sistani first-time assessments (Jami’ 737) and missed years as yearly calculations added together (Jami’ 736); Khamenei first-time and missed years stay review stops (inflation adjustment and settlement, Q236). Further 2026-11-23: Sistani business lines netted only when no line lost or all share one account (1790, Jami’ 701), inherited property on which the deceased did not pay khums owes one-fifth unless the stated exception applies (1772), pensions and insurance payouts paid by transfer are income once withdrawn (Jami’ 620, 624, 626), donations are living expenses (Jami’ 598), the price increase of khums-paid non-business property sold is profit (1787) and khums already paid this year is subtracted (1783); Khamenei earlier living debts paid within five days after the year are deducted («بدهی بابت مئونه زندگی») and bank profit on a khums-paid deposit not above inflation is excluded («سود بانکها با توجّه به تورّم»), while dividends, sales, khums already paid and an excess payment stop for review. Further 2026-11-23 (Khamenei historical, «احکام خمس» leader.ir book 215 PDF, excerpts checked against the office text): first-time assessments classify each entry by its answers (Q231 khums year, Q236 and Q126 necessities at purchase price, «محلّ کسب» 4–5 property at the first khums year-end value, Q39 and Q248 savings, doubt kinds and Q249–250, Q253–255 earlier unpaid khums); amounts from the current khums year are calculated, older amounts show one-fifth before inflation with the inflation as a review (the text does not say how it is measured), and an unknown source, khums year or unpaid amount is a settlement review. Missed years reuse the annual program per year (Q231, Q247); entries whose amount is not known send their year to a settlement review (Q255) and the aggregate adds only years with all amounts known (`khums-known-years`), with inflation since each year-end as a review («کسر تورّم»). Q233 and Q272 (same numbering in the Persian PDF and the English edition) concern the calendar of the khums year and followers of other Marjas; neither changes a calculation. Version 0.3.0 (after the frozen audit of 0.2.0, docs/audit/2026-11-23-frozen-calculation-audit.md; CLAUDE.md rule 7): Sistani first-time assessments follow Tawdih Jami’ 736–744 branch by branch — asset entries are current values, and money paid out from year-old income (including the price of something still owned, new entry type `ASSET_PURCHASE`) is its own entry; 737 الف/ب/ج/د, 738 (certain amount; negligence → settlement), 740 ب and 741 calculate, and other unknown sources, devaluation (737 n.5), merchandise bought with khums-paid money, necessities not used in the purchase year, mixed money and debts stay settlement or review items. Version 0.4.0 (corrective phase approved by the maintainer after the frozen audit; no feature expansion): Khamenei unpaid business debts reduce only that year's business profit, never below zero (p.40 note); a business loss reduces other earnings only when the person confirms one shared account, otherwise it counts as zero, and lines with a losing line are netted only with one account («محاسبه خمس چند شغل», Q245); first-time capital and emergency savings follow the hardship exemption (p.8 «سرمایه ای که خمس ندارد», Q6, Q120, p.37); missed years leave a year with khums already paid out of the known total. Sistani 1790 offsets lines only when they are the same kind of business AND share one account (Jami' 701 «دو کسب مختلف»); unsold stock stops the business profit (1791); Jami' 620 is limited to payouts credited through the Shetab network under 624/626 n.1 (other pensions stop for review); a living or personal-item loan whose spending is already entered is not deducted again (both Marjas); the missed-year aggregate adds the amount still owed after payments (1783). Re-check of the Sistani first-time branches: 740 ب and 741 only with a Twelver Shia seller and buyer and a rise not from inflation (notes 1–2), a rise from inflation stops (737 note 6, 647), a doubt involving inherited, gifted or khums-paid money and cash of unknown origin stop for review; Khamenei older first-time amounts are used only when the person confirms their meaning (audit T3). 0.3.0 is kept byte-exact in `packages/core/src/provisional/history/` (0.2.0 content was not kept; its digests are recorded) | Implemented (M5.4), awaiting review | No engine, readiness, permission or production change; transcribed rules show as PARTIALLY_VERIFIED (never approved) and production still requires scholar-approved, activated packs. The annual figure is income minus business costs and living expenses within the condition the text states, floored at zero, times one-fifth |
| 61 | Completeness of totals and server-side entry mapping (audit 2026-11-23 C5, T2, T5; engine 0.2.0): a missed-year aggregate carries `completeness` (`COMPLETE`, `PARTIAL`, `UNRESOLVED`) and `openYearIndexes`, and is `COMPLETED` only when every year is; results show a partial sentence whenever figures sit next to open items, and render `meta.disclaimer` verbatim with neutral (never success) styling for provisional results. A provisional calculation on a pack with a fact mapping must send `entries` (sheet and answers): the API maps them with the pack's own mapping and refuses an already-mapped `input` (`ENTRIES_REQUIRED`) or entries that stop (`ENTRIES_NEED_REVIEW`), so browser and server reach the same outcome; `input` remains only for packs without a fact mapping | Implemented, awaiting review | Additive report fields; request contract `ProvisionalCalculationRequest` changed (exactly one of `input`/`entries`); OpenAPI regenerated |
| 62 | Per-year answers for missed years (maintainer approval 2026-11-23, "Option A"): a missed-year fact sheet takes each year's own assessment answers in `yearAnswers` (keyed by the sheet's period ids) and no shared `answers`. `mapFactsToInput` / `prepareAssessmentInput` give each year exactly its own answers (a year without answers gets none, never another year's) and refuse answers in the wrong scope (`ANSWERS_SCOPE_MISMATCH`: shared answers on a missed-year sheet, per-year answers on another workflow, or an unknown period). `ProvisionalCalculationRequest.entries.yearAnswers` is an optional, additive field; the review and results screens ask every question once per year | Implemented, awaiting review | Fresh audit of packs 0.6.0 (HIGH): one set of answers (living status, business lines, shared accounts, unsold stock) was applied to every year, so a year whose own facts call for a stop could show a figure. `AssessmentInput` already carried answers per year; only the mapping, the request contract and the screens changed. Rule-pack content, engine `calculate()` semantics and `ENGINE_VERSION` are unchanged; OpenAPI regenerated |
| 63 | Approval policy (owner decision 2026-11-23; CLAUDE.md rule 1, RELIGIOUS_RULES.md §5 and research/REVIEW_PROCESS.md §17 revised; earlier texts archived byte-for-byte in `docs/archive/` and `docs/research/archive/REVIEW_PROCESS.rev6.md`): a rule is source-verified when the authorized scholar for its Marja has verified its sources, original text, translation and attribution and recorded it; a source-verified rule is approved automatically and is available for scholar testing and public calculation, with no separate approval step and no separate production approval gate. Scholars improve rules only within their assigned Marja permissions (new, audited, re-verified versions). Rules without adequate source verification stay `UNVERIFIED`, staff-only and provisional. AI or tool checks never count as source verification. **Not yet implemented in code:** governance approval, the `PRODUCTION` channel and the readiness gate stay enforced until an approved implementation (Phase 2 or later) changes them; that change keeps source verification and the technical integrity checks. Implemented for rule-builder rules by decision 67 (2026-11-24). |
| 64 | Three-role system (Phase 2 steps 1–2, owner decisions 2026-11-23; `docs/PHASE2_PLAN.md`): the only grantable staff roles are `SUPER_ADMIN` (scope ALL, **every** permission: identity, roles, policies, audit, research on every Marja, governance, provisional packs and calculations, feedback) and `SCHOLAR` (scope MARJA, one or more catalogue Marjas: the former governing-scholar permissions in its Marjas, plus `research.read`, `provisional.pack.read` and `provisional.calculate` for every other Marja through the read-only `ANY_MARJA_PERMISSIONS` rule); `USER` is the public calculator user (no account). The six earlier roles stay readable from the append-only role records but cannot be granted (`ROLE_NOT_GRANTABLE`; contract enum `GRANTABLE_STAFF_ROLES`); `GOVERNING_SCHOLAR` grants exactly `SCHOLAR`'s permissions, the other five keep exactly their earlier permissions until a SUPER_ADMIN converts or revokes them. `SINGLE_SCHOLAR_V1.relaxedForRoles = [SCHOLAR, GOVERNING_SCHOLAR]` (policies are bound to ledgers by id only; nothing re-hashed); relaxation needs the role's own scope and never applies to SUPER_ADMIN. `SCHOLAR` joins `DUAL_CONTROL_ROLES` (single step under `SINGLE_ADMIN_V1`). New `POST admin/staff/accounts/:principalId/roles/:assignmentId/replace` changes a scholar's Marjas or converts a legacy role in one audited unit of work (REVOKED + GRANTED records, one epoch bump, `staff.role.replaced`). Kept: `NOT_SELF`/self-administration refusals, `LAST_SUPER_ADMIN`, separation of duties per bound policy. Removed: the SUPER_ADMIN/religious-role incompatibility (`ROLE_INCOMPATIBLE`, `ROLE_COMBINATION_FORBIDDEN` no longer produced). Pack-content `ApprovalRole` values in sealed packs and ledgers are unchanged. **Supersedes** decision 37 (role incompatibility), decision 56 (SUPER_ADMIN loses activation/normal withdrawal) and decision 57 (research permissions held only by `GOVERNING_SCHOLAR`) where they conflict | Implemented (Phase 2 P2-1), awaiting review | No database rewrite or migration; no collection change. A SUPER_ADMIN's provisional disable is now recorded as a normal (`SCHOLAR`) disable. Cross-Marja writes now answer 403 instead of 404 for research records (the record is readable). Whether a SUPER_ADMIN's source verification counts is an owner decision recorded for step 5 (it does). `AUTH_ARCHITECTURE.md` §5.2 |
| 65 | One deployment: public verified calculator, staff provisional testing, browser-only history (Phase 2 steps 6–7, owner decisions 2026-11-23; `docs/PHASE2_PLAN.md`). **States:** `provisionalActionAllowed` now allows register/enable/calculate/feedback in `SCHOLAR_REVIEW` **and** `PRODUCTION_APPROVED` (never `DEVELOPMENT`); in the public state they stay staff actions — every provisional route is a staff route (session, CSRF) and core authorizes a server-established principal with the permission in the pack's Marja scope, so unauthenticated visitors get 401 and never see a provisional result. `SCHOLAR_REVIEW` stays whole-site private and `DEVELOPMENT` unchanged. Web: the scholar-review pages accept `SCHOLAR_REVIEW` or `PRODUCTION_APPROVED` (still behind the staff sign-in under `/admin`); in public mode staff pages are now `noindex` as well as `no-store`. API: a production `PRODUCTION_APPROVED` deployment must set `KHUMS_REQUIRE_EDGE_SIGNATURE=true` (like `SCHOLAR_REVIEW`). **Public verified calculation:** new unauthenticated reads `GET public/marjas` and `GET public/marjas/:marjaId/pack` (`PublicCalculatorService`, catalogue Marjas only, only in `PRODUCTION_APPROVED`) serve, per Marja, the pack that the governance ledger shows PUBLISHED and ACTIVATED and that passes `checkGovernedProductionReadiness` for every workflow it defines with the fact mapping required (`@khums/core` `checkPublicVerifiedPack` / `selectPublicVerifiedPack`; most recently activated wins; mock and `SCHOLAR_REVIEW`-channel content refused outright; activation rebuilt from the ledger by `activationFromLedger`), with its ledger; otherwise `NOT_AVAILABLE`. The web page loads every Marja's verified pack server-side when rendered (the visitor's Marja is never sent), and the browser re-checks the bundle and calculates with `runVerifiedAssessment` (`calculate(..., { mode: 'production', activation })`; facts never sent, decision 27); results show the verified notice, `meta.disclaimer` when present plus a standing disclaimer, the pack trace (id, version, digest, activation date) and the breakdown; a Marja without a verified pack gets a clear message and no figures. `DEVELOPMENT` keeps the mock pack. **Browser-only history:** opt-in "save on this device" for verified results only (`savedCalculationFromReport`), stored in `localStorage` under one versioned key (`savedCalculationHistorySchema` v1, at most 50 entries; trace and result figures, no facts), delete-one and delete-all on `/history`; never sent, logged or put in a URL | Implemented (Phase 2 P2-2), awaiting review | No engine, money or collection change. Decision 47 superseded where it limited provisional actions to `SCHOLAR_REVIEW`. The public endpoint serves nothing until a `PRODUCTION` pack is taken through governance (steps 3–5 will produce them from source-verified rules). The e2e API now runs in `PRODUCTION_APPROVED` (one public deployment), with a third web server for the public state |
| 66 | Scholar rule builder and developer-requirement check (Phase 2 steps 3–4; `docs/PHASE2_PLAN.md` "Rule builder design"). A builder rule is predefined fields only (`@khums/validation` `builderRuleContentSchema`): one Khums category from a fixed list (`ANNUAL_SURPLUS`, `MINED_PRODUCT`, `TREASURE`, `DIVING_GEMS`, `MIXED_FUNDS`), a research RULING of the same Marja (version resolved by the server), a rate (decimal string, never defaulted), counted entry types, deduction types with the entry types the scholar chooses, yes/no confirmations (scholar's wording, scope ENTRY or CALCULATION, fixed effect INCLUDE / EXCLUDE / STOP_FOR_REVIEW), exceptions, an optional minimum amount, research source/passage ids, requirement flags (dates/timing, market value/inflation, linked entries, proportional split, carry-over, currency conversion, first-time/missed-year, other) and notes. Drafts (missing ruling, sources, rate or entries) may be saved; inconsistent content never. Every save is a new revision in the append-only `scholarRuleRevisions` collection with its audit event. `@khums/core` `checkDeveloperRequirements` compares every field with the engine capability table (`BUILDER_CAPABILITIES`; annual workflow only): any flag, a deduction outside the category template, or a minimum amount (the engine has no money constant) gives **DEVELOPER_IMPLEMENTATION_REQUIRED** with stable capability codes (localized explanations in the web). `compileBuilderPack` turns a Marja's complete latest revisions into a sealed schemaVersion 3 pack (`<marja>-builder`, caller's version and channel) with a fixed template of existing operations (sum of categories, subtract, max with zero, percentage of a parameter, `when` on answers, consult; fact mapping category / exclude / ask / consult with exact amounts and dates only), rules `UNVERIFIED` citing their sources and `<ruling>@<version>`; a developer-required rule compiles to a consult stop; one entry type claimed by two rules refuses compilation. Routes `admin/rules` (list, get with history, create, revise, check, test); the test compiles a `SCHOLAR_REVIEW` test pack (never stored or registered) and calculates in `scholar-review` mode (PROVISIONAL — FOR SCHOLAR REVIEW ONLY; staff states only). Permissions `builder.rule.read` / `.edit` / `.test` (MARJA_RESEARCH); scholars read and test other Marjas read-only | Implemented (Phase 2 P2-3), awaiting review | New collection (additive; production Atlas needs `--migrate-database`, not run). No engine or money change. Source verification, the PRODUCTION version and publication are step 5 |
| 67 | Source verification → automatic approval and publication of builder rules (Phase 2 step 5; owner decisions 2026-11-23; implements decision 63 for rule-builder rules; REVIEW_PROCESS §17, revision 9). **Record:** append-only `ruleVerificationRecords` (`ruleVerificationRecordSchema`): one builder rule revision (rule id + revision + `ruleRevisionContentHash` + `<ruling>@<version>` + the ruling's content record digest), the four explicit attestations (`sourcesAuthentic`, `originalTextMatches`, `translationAccurate`, `attributionCorrect`, each literally `true`), optional notes, actor, time, reason, decision id and the builder pack version it produced. Recorded only with the new permission `builder.rule.verify` (MARJA_RESEARCH; `SCHOLAR` and legacy `GOVERNING_SCHOLAR` in their own Marjas, `SUPER_ADMIN` everywhere; never cross-Marja) by a trusted, server-established staff principal — never AI, automated tests or a system actor. **Preconditions** (`checkVerificationPreconditions`, stable codes): complete content with requirement check `SUPPORTED` (Developer Implementation Required blocks it); the ruling exists in the Marja, is current and is the cited version; every cited source/passage and every passage, translation and source the ruling (or its findings) cites is `VERIFIED` (translations `REVIEWED`); the ruling's pinned provenance and evidence pass the rule-pack reference rules. A later revision, or a changed ruling, is unverified until verified again. **Automatic approval:** in the same unit of work the server compiles the Marja's builder rules into a new `PRODUCTION` version of `<marja>-builder` (next major version) containing ONLY rules whose current revision is source-verified (status `APPROVED`); every other rule is left out and each of its entry types maps to the `builder:not-verified` review stop, so nothing unverified can produce a public figure. Ruling snapshots are built under the new **`SOURCE_VERIFIED` ruling reference policy**: the current DRAFT or APPROVED ruling version with verified evidence (under decision 63 the scholar's verification is the approval; withdrawn/superseded/deleted never). Hand-submitted packs keep the `PRODUCTION` policy (APPROVED rulings only). The pack is sealed and the EXISTING ledger runs through `executeGovernanceCommand` with the verifier as actor of every record: SUBMITTED (binding the new policy **`SOURCE_VERIFIED_AUTO_V1`**) → REVIEW_STARTED → REVIEW_COMPLETED → APPROVED (evidence `rule-verification:<id>`) → PUBLISHED → ACTIVATED, then SUPERSEDED on every earlier published builder version; each record has its audit event (`automatic: true`, `sourceVerification`), plus `builder.rule.verified`. `SOURCE_VERIFIED_AUTO_V1` relaxes separation for `SCHOLAR`, `GOVERNING_SCHOLAR` and `SUPER_ADMIN` (own scope) and is bound only to `<marja>-builder` packs from the version-controlled `BUILDER_GOVERNANCE_POLICIES` (sistani, khamenei); it is never assignable in the dual-controlled registry (core, request contract and registry schema refuse it) and a pack id ending in `-builder` is refused by SUBMIT unless it carries the submitting principal's source verification of a rule the pack approves (`BUILDER_VERIFICATION_REQUIRED`). Its single sign-off is the new approval role **`SOURCE_VERIFIER`**, which the engine readiness gate accepts like `GOVERNING_SCHOLAR`; every other technical check of `checkProductionReadiness` / `checkGovernedProductionReadiness` (integrity, digest binding, rule status, sources, mapping, publication, activation, ledger) is unchanged. Withdrawal: the existing `withdraw` (scholar) and `emergency-withdraw` (SUPER_ADMIN) commands. Routes: `GET admin/rules/:ruleId/verification`, `POST admin/rules/:ruleId/verify`, `GET admin/rules/publications`; web "Verify sources" panel and the dashboard's public builder versions | Implemented (Phase 2 P2-4), awaiting review | New collection (additive; production Atlas needs `--migrate-database`, not run). No engine semantics, money, expression kind or schemaVersion change. `effectiveFrom` of builder production packs is fixed at 2000-01-01 (the builder has no date field). Existing ledgers, policies, registry records and pack history are untouched |
| 68 | Public pack endpoint privacy (Phase 2 step 5 fix of decision 65): `GET public/marjas/:marjaId/pack` no longer serves the governance ledger (it names staff principals). It serves the sealed pack with every approval's `reviewerId` replaced by `redacted-<n>` (approvals are outside the hashed content: digest and approval bindings unchanged) and an extended public summary (`packId`, `version`, `contentDigest`, `publishedAt`, `activatedAt`, `workflows`, the activation's approval and publication references, and every rule id with its verified status). The server runs `checkGovernedProductionReadiness` (ledger); the browser re-checks with `checkPublicPackBundle` (strict schemas, not mock or scholar-review, recomputed digest equals the summary, engine production gate with the activation the summary names, for every workflow) and `runVerifiedAssessment(sheet, { pack, summary })` | Implemented (Phase 2 P2-4), awaiting review | Contract change (`PublicVerifiedPackResponse` without `ledger`; summary fields added); OpenAPI regenerated; api-client and web updated |
| 69 | Audit fixes to decisions 67/68 (Phase 2 P2-5, 2026-11-24; audits BLD-01…09, SEC-01…03). **Live re-check (BLD-01):** a published, activated pack is re-checked against the CURRENT research records on every public serve (`selectLivePublicPack` / `checkLivePackResearch` in core; `LivePackResearch` in the API, also used by the staff views): every cited ruling is still usable under the pack's reference policy (`SOURCE_VERIFIED` for builder packs bound to `SOURCE_VERIFIED_AUTO_V1`, otherwise `PRODUCTION`), carries its snapshot, still has the snapshotted content and verified evidence (`checkRulingSnapshots`), and — for builder packs — every rule's research still meets the verification preconditions (`checkRuleResearch`: cited sources/passages `VERIFIED`, translations `REVIEWED`, findings current and `VERIFIED`/`APPROVED`, ruling current and the cited version). A version that fails is **not served** (`NOT_AVAILABLE`, public message "temporarily under review"); an older version is never served instead. Nothing is written to packs, ledgers or research (computed on read): staff see `publicStatus.status = SUSPENDED` with each affected rule and its codes (rule page, dashboard), and the first time a process sees a suspension it logs `public.pack.research.changed` and appends one `builder.pack.suspended` audit event (ids and codes only). Correction: fix the rule or research, then verify again (a new version). **Findings (BLD-02):** verification and the live re-check require every finding the ruling cites to be current (`FINDING_NOT_CURRENT` for deleted/withdrawn/superseded) and `VERIFIED` or `APPROVED` (`FINDING_NOT_VERIFIED`; a DRAFT finding, including one revised after verification, blocks) — confirmed by the owner as final policy, decision 70. The rule-pack evidence rule also refuses a terminal finding under every policy (tightening only). **Preview and pending revisions (BLD-03):** the verification status carries `preview` (next version; rules included, withheld with reason, and live rules it would remove) shown before verifying, and the panel states "public uses revision N; revision M not yet verified". **No free text in public content (SEC-01):** new PRODUCTION builder versions describe each rule only from its structured fields and citation (no scholar notes); `SOURCE_VERIFIED` ruling snapshots omit the ruling payload's internal `notes` (payload and record digests still bind the stored payload). Earlier versions are untouched (no re-hash). **Cache (SEC-02):** the public selection is cached in process memory for at most 30 s, keyed by the Marja's version list and invalidated in the same process by every governance command, source verification and research change; another API instance may serve a withdrawal or suspension late by at most 30 s. **Repeats (SEC-03):** re-verifying the live, already-verified identical revision is refused (`ALREADY_VERIFIED`, 422; no new version); a verified revision that is not live (e.g. after a withdrawal) may be verified again to republish it. **Revoked verifiers (BLD-07):** a verification counts only while its verifier holds `builder.rule.verify` for the Marja (ACTIVE account, roles in force) at (re)publication; otherwise the rule is withheld (`VERIFIER_NOT_AUTHORIZED`) and shown as needing re-verification. **Refusals (BLD-09):** refused verification attempts write `builder.rule.verification.refused` (codes, revision, decision id). **Codes (BLD-08):** ruling reference issues keep their own blocker code. **Display (BLD-04/05):** several builder figures are labelled as separate (never added together); a figure with more decimals than the currency's minor units is labelled "exact amount (not rounded)" — no rounding is added (maintainer decision). Supersedes the "a later withdrawal/dispute does not unpublish" open point of #67 and the corresponding "not implemented" statement in research/REVIEW_PROCESS.md §17.5 (rev 9; to be reflected in its next revision) | Implemented (Phase 2 P2-5), awaiting review | Contract additions (`RulePublicStatus.status` gains `SUSPENDED` and `suspendedRules`; `RuleVerificationStatusResponse.preview`; `BuilderPublication.active.suspended`/`suspendedRules`; problem code `ALREADY_VERIFIED`); OpenAPI regenerated. No database change, no engine or money change, no pack history change |
| 70 | Final Phase 2 evidence policy (owner decision 2026-11-24; confirms the rulings part of decision 67 and the findings part of decision 69; project requirement): (1) a DRAFT research ruling may support a source-verified builder rule when its evidence, original text, translation and attribution, and the exact rule revision, have been verified by an authorized SCHOLAR of the Marja or a SUPER_ADMIN; (2) a DRAFT finding never supports a source-verified public rule and must first be verified in the Research Workspace (`FINDING_NOT_VERIFIED`); (3) once the rule's evidence is verified it is approved automatically and available for public calculation, with no separate production approval step | Implemented (Phase 2 P2-4/P2-5) | No code change: the software already enforces both rules (tests in core and the API). Recorded in CLAUDE.md rule 1, RELIGIOUS_RULES §5, research/REVIEW_PROCESS §17.5 (revision 11) and PHASE2_PLAN |
| 71 | Opt-in device storage of saved calculations (owner decision 2026-11-24, Phase 3; amends decision 27 and the history part of decision 65). When — and only when — the person taps **Save**, the calculation's entries, answers, assessment dates, label, figures and pack trace (id, version, digest) are stored in this browser's `localStorage`; nothing is saved automatically, and there are no accounts, backend or cloud storage: saved data is never sent, logged or put in a URL. The shared-device privacy warning stays. Saved calculations can be reopened (historical figures shown as saved, with their pack version), edited and recalculated, renamed, copied to a new year and deleted (one or all). Recalculation uses only the Marja's **current** verified pack and always shows which pack version is used (and that it differs from the saved one when it does). Unsaved work stays in page memory only, as decision 27 states. Older saved entries (figures only) stay readable for viewing | Implemented (Phase 3 P3-2), awaiting review | `docs/PHASE3_PLAN.md` step 3. History schema v2 (`@khums/validation`; v1 history read as is, figures only, not editable): label, fact sheet, answers, figures, pack trace; Save asks for a name (default from the dates) and always adds a new entry (a reopened one is never overwritten); `/history` opens the figures as saved (date and pack version), renames, deletes one/all, and hands an entry to the calculator in page memory only for edit or copy-to-a-new-year (dates cleared); only the Marja and type go through the existing Server Function; recalculation uses the current verified pack, restores answers it still accepts (`answersForRecalculation`) and shows its version, warning when it differs; quota-full and blocked storage get clear messages. No server, API, database or engine change. Optional export/import is not implemented. **Audit fixes (2026-11-24):** saved answers are reused only when reopened to edit AND the current verified pack is exactly the saved one (id, version, digest; `savedAnswersToReuse`), otherwise every question is asked again with a notice; a copy to a new year never carries answers; the person's answers are kept in the calculator's memory per Marja, type and exact pack version, so they survive leaving and returning to the results; stored entries are parsed one by one (unreadable ones are left out and counted, the rest kept; the envelope must still verify), and the save box and `/history` say that unreadable data is removed by the next save/rename/delete; storage is reached without a test write (a full quota can still be viewed and cleared); the save box warns before the 50th-entry limit drops the oldest and when an entry's currency differs from the preferred one (the mapping stops on it); a result that cannot be saved gets its own message |
| 72 | Public calculator: availability and entry guidance from the verified pack (Phase 3 steps 1–2, 2026-11-24). **Availability:** in the public state each Marja card on the Marja step is marked "verified rules available" or "no verified rules yet" (from the packs loaded for every Marja at render; decision 23 unchanged), and the "no verified rules" / "could not load" message appears on the assessment and summary steps, before any entry (the details-step alert stays). **Workflows:** a Marja with a verified pack is offered only the workflows that pack defines (`summary.workflows`, re-checked with `checkPublicPackBundle`); the others stay visible, disabled, with the reason. The Server Function enforces it too: `advanceOnboarding` takes an `OnboardingPolicy` from the server (never from the submission) and answers `unsupported` for any other workflow, with or without JavaScript. Development mock mode, scholar-review contexts and Marjas without verified rules (or packs that could not be loaded) are not restricted (no figures are offered there). **Entries:** `describeEntryCoverage` (core, pure) reads the pack's own fact mapping for one workflow exactly as the engine's mapper matches it (workflow, kind, subtype) and classifies each entry type as CALCULATED, EXCLUDED, ASKS_QUESTION (outcome depends on an answer) or REVIEW (explicit consult or the unmatched fallback). In public verified mode the entry form groups types into "used by your Marja's verified rules" and "not yet covered" (none hidden) and warns, as soon as an uncovered type is chosen and before saving, that it will stop the calculation for scholar review. Nothing is inferred beyond pack data; no ruling in code | Implemented (Phase 3) | `docs/PHASE3_PLAN.md` steps 1, 2 and 6 (copy). No engine, money, governance, API-contract or database change; the e2e TEST verified pack now defines the annual workflow only, like builder packs |
| 73 | Result summary and print view (Phase 3 steps 4 and 7, 2026-11-24). **Summary:** every result panel (`ResultsPanel`: verified, mock and provisional) shows a short summary above the breakdown, built only by `summarizeResult` (web view model, pure) from what the mapping and the engine returned: the figure per category exactly as returned (or "not calculated" with the open items that stopped it), the entries counted, deducted and left out (from the mapping trace; "deducted" = categories the pack's own program only ever subtracts, read from the program structure by `deductedCategoryIds`, nothing inferred), the items stopped for scholar review or needing an answer (consultations, clarifications, unsupported entries, the engine's unresolved cases, and a missing required answer when the engine refuses), and the pack trace (id, version, digest). No figure is computed or added: no combined total, the "separate, not added together" and "exact amount (not rounded)" labels are kept, and nothing is listed as counted when nothing was calculated. Mock and provisional summaries repeat their label (semantic `mock`/`provisional` roles) and the notices stay first. **Print:** a "Print or save as PDF" button (`window.print()`; verified and mock results; provisional reports keep their report button) and a print stylesheet (`body.printing-results`, also on Ctrl/Cmd+P while a result is shown) that removes the site header and footer, navigation, buttons and forms and expands rule/source lists; notices, disclaimer, trace, summary and breakdown stay. **Scenario tests:** `packages/core/src/financial/verified-scenarios.test.ts` publishes TEST builder packs for `sistani` and `khamenei` through the real Phase 2 path (TEST research, source verification, automatic governance, public bundle) and checks salaried, business, mined product/treasure, uncovered entries, every condition effect and scope (answered and unanswered), zero/negative surplus, estimated/range/unknown amounts, several currencies, large decimals and many entries, an empty year and an unverified rule, against figures computed independently with `@khums/money` | Implemented (Phase 3), awaiting review | `docs/PHASE3_PLAN.md` steps 4 and 7. No engine, money, governance, API-contract or database change. Builder packs never round (no rounding step), so "explicit rounding where the pack says" is covered only by the mock-based e2e pack (currency HALF_EVEN); a builder pack cannot express rounding, minimum thresholds, currency conversion or the first-time and missed-year workflows (unchanged limitations). **Audit fixes (2026-11-24):** the summary heading is "Used in the calculation" with a note that a used entry does not mean a figure was raised (a figure can still be 0 or stopped by an answer); `deductedCategoryIds` lists a category only when its sign is certain (never one used in a condition, or under `multiply`/`percentage` unless the other operand is a pack parameter whose value is non-negative); scenario tests also assert literal hand-computed decimal strings |
| 74 | AI-prepared research (owner decision 2026-11-24, Phase 4; extends decision 60 from code-built packs to the Research Workspace and the Rule Builder). AI may read the Marjas' official publications and create **DRAFT** research records — sources, verbatim passages, translations, findings and rulings — and rule-builder rule revisions, for `sistani` and `khamenei`. Limits, unchanged from CLAUDE.md rule 1: AI records and encodes only what an office-published text states **explicitly**; anything ambiguous, incomplete, disputed, edition-dependent or unattributed is recorded as an unresolved issue and compiled as a review stop, never answered. Every AI-made record and revision declares its AI involvement; AI never moves a research record beyond DRAFT, never reviews an AI declaration and never verifies (decisions 63, 67, 70 unchanged). Official translations (an office's own edition) are recorded as their own source and passage; AI translations are translation records labelled as AI machine drafts | Research prepared (P4-2), uncommitted | `docs/PHASE4_PLAN.md` D1, §4, §10. Amends REVIEW_PROCESS §11 for these two Marjas (revision 12) and the "nothing here is generated" notes on findings and rulings, which now mean: nothing generated is ever verified or approved without the scholar |
| 75 | The Rule Builder is the single rule-management path for the annual, first-time and missed-year assessments (owner decision 2026-11-24, Phase 4). The hand-built scholar-review packs are frozen at 0.10.0 as history — never edited, deleted, relabelled or re-hashed — and their 59 transcriptions are re-checked and reused as builder rules. The builder and engine are extended (first-time and missed-year templates, dates, valuations, thresholds, carry-over, currency conversion) only where a researched ruling needs it; anything the engine cannot express exactly stays a review stop | Annual: implemented (P4-3), uncommitted; first-time and missed-year: planned | `docs/PHASE4_PLAN.md` D2, §6, §10. Builder additions so far: deductions limited to named counted entries (`against`), per-entry confirmations on deduction entries, business debts as costs of earning; nisab asked as a factual confirmation. Replaces the Phase 3 "out of scope" list. New expression kinds follow the CLAUDE.md engine rules and a `schemaVersion` 4 decision |
| 76 | "Approved for scholar testing" is an AI technical status (owner decision 2026-11-24, Phase 4). After AI has researched, implemented and technically tested a builder rule revision it may mark that revision **Approved for scholar testing**; the rule is then immediately usable in the staff scholar-testing calculator with its sources and calculation breakdown. It is **not** religious approval: the rule stays `UNVERIFIED`, provisional, staff-only and outside every public pack, and the status is always shown as "Approved for scholar testing by AI — not verified by a scholar" next to the PROVISIONAL — FOR SCHOLAR REVIEW ONLY notice. It is never the rule status `APPROVED`. Scholars can test, correct, replace, reject or verify the rule and request missing rules; verification then publishes automatically (decision 63) | Implemented (P4-1), uncommitted | `docs/PHASE4_PLAN.md` D3, §7, §10 |
| 77 | Annual completion audit (2026-11-24, Phase 4 P4-3, within decisions 74–76): (1) builder deduction type `KHUMS_ALREADY_PAID` (annual surplus only): subtracted from the amount due after the rate, never below zero, never limited to entries (`DEDUCTION_AGAINST_NOT_ALLOWED`); existing engine operations only (`max`, `subtract`), no new expression kind or schema version; (2) the shared fact vocabulary gains `EXPENSE:TAX`; the frozen hand-built packs (decision 75) are built from the subtypes as they were at 0.10.0 (`ADDED_AFTER_FREEZE`), so their content and digests are unchanged and a TAX entry reaches them unmatched (review stop); (3) a builder rule may cite up to 40 sources (was 20; additive); (4) `scripts/import-research-bundle.mjs --revise-drafts` revises a DRAFT research record this import created when its bundle payload or references changed, only if nobody revised it since (revision recorded in the state file), keeping its AI declarations | Implemented, uncommitted | `docs/audit/2026-11-24-annual-coverage.md`, `docs/PHASE4_PLAN.md` §10. Rules: tax as spending, khums already paid, receivables of income not yet received, both Marjas; 61 scenarios plus every entry type for both Marjas in `apps/api/test/annual-rules.integration.test.ts` |
| 78 | Annual dates, carry-over, inflation and savings capabilities (2026-11-24, Phase 4 P4-3, owner request; within decisions 74–77). **Engine (schemaVersion 3, additive optional fields; older packs and digests unchanged):** a `periodDays` condition (annual only); `decimal` questions answered per fact; fact-mapping date windows `match.dated` (`IN_PERIOD`, `BEFORE_START`, `AFTER_END` 1–31 days; annual only; windows of one type never overlap; an entry placed by a window is dated at the start or end so the engine's period check holds) and `outOfPeriod`; a category action `adjust` that attaches the fact's own percentage to its entry, applied exactly by the engine when it totals the category (the mapper still never does arithmetic). `@khums/utils` gains pure `daysBetweenIsoDates`/`addDaysToIsoDate`. **Fact sheets:** annual sheets accept dates up to 31 days after the year end (the mapping decides); everything else is unchanged. **Rule Builder:** every annual entry counts only when dated in the khums year (otherwise `builder:out-of-period`, a review stop); deduction options `afterYearEndDays` and `inflation` (`ADDED`/`ONLY`, the person's own figure per entry, never fetched); deduction types `PREVIOUSLY_TAXED_VALUE` (a value dated before the year, limited to the counted entries it measures), `TAXED_PRINCIPAL` (inflation only) and `EXEMPT_SAVINGS`; confirmations for `openingValues`; a rule option `periodLongerThanAYear: STOP_FOR_REVIEW` (366 days, the longest calendar year: technical). Limits raised: 40 conditions, 80 sources per rule. The frozen hand-built packs (decision 75) use none of this | Implemented, uncommitted | `docs/audit/2026-11-24-annual-coverage.md`; `docs/research/RULE_PACK_STRUCTURE.md` §5.6a; `docs/FINANCIAL_INPUT_MODEL.md`. Rules (both Marjas): khums-year length, entries outside the year, separate cycles (review), five days after the year end (Khamenei), taxed stock and capital carried from the previous year, lasting-needs debts carried (Sistani), Khamenei inflation on sale gains, deposit profit and capital growth, Khamenei savings exceptions; Sistani inflation stays an obligatory-precaution review stop |
| 79 | Simple staff console (owner decision 2026-11-24). Scholars sign in, test any Marja's annual calculation in the scholar-testing calculator and read every rule (content, sources, AI preparation status, revision history); they give feedback to the owner directly, outside the app. The owner adds, changes or removes rules in code (`docs/research/bundles/<marja>/rules.json` → `scripts/import-research-bundle.mjs`, new audited revisions). The super administrator creates scholar accounts and reads activity in the audit log. The console shows only Rule builder, Staff and roles, and Audit log (`SHOWN_SECTIONS`); the rule pages no longer show the create, revise, reject, verification and request panels. Nothing is deleted: the other pages stay reachable by address and every API command, permission, audit and gate is unchanged (verification, publication and the public calculator still need a scholar or SUPER_ADMIN source verification, CLAUDE.md rule 1) | Implemented, uncommitted | `apps/web/src/components/console/console-nav.ts`; `apps/web/src/components/rules/rule-content-view.tsx`; e2e journeys make rule changes and verifications through the staff API |
| 80 | Removal of the hand-built scholar-review pack system and in-app feedback (owner decision 2026-11-24; reverses the "kept as history" part of decision 75). Deleted: the web pages Scholar review, Scholar-review packs, Team calculations and Feedback; the API `provisional` module (pack registration, enable/disable, provisional calculations, feedback) and its client methods and contracts; `@khums/core` provisional actions, chains, content checks and review-pack helpers; the `@khums/marja-rules` hand-built review packs (0.10.0 history); their record schemas and types; their integrity chains. The Atlas collections `provisionalPackRecords`, `provisionalCalculations`, `feedbackReports` and `feedbackStatusRecords` were dropped (each verified empty first). Kept: the Rule Builder and its scholar-testing calculator (gated by `scholarTestingAllowed`, the same operational-state rule), research records (rules cite them), governance publication and the public calculator path, operational states and the provisional label | Implemented, uncommitted | 19 collections remain; frozen pack history is no longer in the repository (git history only once committed) |
| 81 | The Al-Bi'that Trust khums form as a research source (owner decision 2026-11-24). The owner shared the trust's "محاسبہ خمس فارم" (November 2026), which a scholar uses today, declared it authenticated and accepted it as a research source for Ayatollah Sistani and Ayatollah Khamenei. New source class `SCHOLAR_PROVIDED` (tier 3); one source record per Marja (`sis-src-bithat-form`, `kha-src-bithat-form`), attributed to the trust (no individual named); short verbatim Urdu excerpts as passages with page and table/note locators (`sheets-bithat.jsonl`, inline text, no fetch). AI transcribes the form's explicit statements into the annual Rule Builder rules; **where the form differs from what the rules took from office texts, the form wins** (e.g. Sistani: an inflation-only rise is taxed by obligatory precaution, investment-insurance premiums are not deducted, capital needed to live is exempt only when khums certainly cannot be paid). Where the form itself says to settle with the Marja's agent by probability, the rule stops for review. Rules stay "Approved for scholar testing by AI — not verified by a scholar", staff-only, until a scholar of the Marja or a SUPER_ADMIN verifies them (which makes them public) | Implemented, uncommitted | Form items encoded (both Marjas): valuation by how a thing was paid for (Tables 1–2: this year, a year passed, unknown, gradual or on loan), loan-bought items at the part repaid, mixed exempt money (note 11), items used for life and work (22), beyond-status items (20), waqf (10), dowry (7–8), family farm land and household animals, gradual homes (15), sale of needed items (18), Hajj savings (19), committee money, prize bonds, things paid ahead, loans given (29), leftover stock, raw materials, animals, crops and trees (27–28), provident fund, gratuity and leave encashment (9), insurance maturity (13), inheritance with khums due (6), partnership (5), unpaid salary (7), transfers not yet received (14), the form's exemptions, minors (4). First-time and earlier-year methods stay P4-4/P4-5 |
| 82 | Treatments for counting an entry, and exact division (2026-11-24, for decision 81). **Engine (schemaVersion 3, additive optional fields; older packs and digests unchanged, following decision 78):** a fact-mapping category action may carry an ordered `adjustments` list: `AMOUNT` (the fact's own answer to a decimal question of unit `AMOUNT` becomes the entry amount; currency precision, 15 integer digits, never negative), `ADD_PERCENT`/`PERCENT` (as before) and `FIXED_PERCENT` (a percentage stated by the pack); entries carry `adjustments`, applied in order by the engine when it totals the category (the mapper still does no arithmetic). Decimal questions gain `unit` (`PERCENT` default, `AMOUNT`). New expression `divide {dividend, divisor, rounding}`: the rounding is part of the operation and required; the divisor must be a non-zero pack parameter (`PROGRAM_INVALID_DIVISOR`); `@khums/money` `Decimal.divide(divisor, scale, mode)` is exact (truncated quotient and remainder decide the rounding). **Rule Builder:** condition effect `COUNT_AS` (per entry, on counted entries) with a `treatment`: amount entered or asked (scholar's wording), optional inflation added, optional portion (fixed or asked percentage), optional `khumsShare {numerator, denominator}` (the entry's khums is that fraction of the amount, added to the khums due, rounded to the currency's minor unit **half up** — owner decision 2026-11-24, a platform rounding choice). `EXEMPT_SAVINGS` may also name assets (a loan given). Limits: 150 conditions, 200 sources, 100 counted entry types. New fact subtypes: assets livestock, crops and trees, raw material, household stock, dowry items, loan given, committee, prize bond, prepaid, partnership share, rental asset; balance Hajj savings; income scholarship, income support, death benefit, dowry received, khula received, provident fund, gratuity, leave encashment; expense fixed-capital loss, shop fit-out | Implemented, uncommitted | `packages/calculation-engine/src/mapping/adjustments.test.ts`; `packages/core/src/rule-builder/rule-builder.test.ts` (decision 82). The plan had proposed schemaVersion 4; kept at 3 like decision 78 |
| 83 | Official monthly consumer price index for inflation figures (owner decision 2026-11-24: "support as many countries as we can, very accurate"). Data: IMF Consumer Price Index dataset (IMF.STA:CPI), all-items index, monthly, compiled by the IMF from national authorities, the OECD and Eurostat; the euro uses the euro-area HICP. Held by the API (`apps/api/src/inflation/cpi-data.ts`, generated by `scripts/fetch-cpi.mjs`, values exactly as published, a month not published is never filled in) for the 30 supported currencies with a monthly index (NZD has none). `@khums/core` `cpiInflation(series, from, to)`: (index at the end month ÷ index at the start month − 1) × 100, rounded half up to 2 places; an unpublished end month uses the latest earlier published month (reported); a missing start month is not available. Staff route `GET admin/rules/inflation`; the staff test panel offers "Fill in the official inflation figure" for each inflation question and shows the months and source; the person may change it; a fall in prices is shown, never entered. Cross-check: Pakistan's monthly index reproduces the form's July–June yearly averages exactly for 13 of the 17 years it lists (2009-10, 2019-20 rebasing and the two latest years differ) | Implemented, uncommitted | Inflation is still the person's answer: the engine never fetches data. Before public use, confirm the IMF data terms for this use |
| 84 | Web and API both on Vercel Hobby (owner decision 2026-11-25; changes the API host of the 2026-11-22 decision from Render to Vercel). Two projects from this repository: `khums-web` (`apps/web`, unchanged) and `khums-api` (`apps/api`). The API runs as one Node function (`apps/api/api/index.js` → `dist/serverless.js`, a second rspack entry): the same Nest application as `main.ts` without `listen()`, created once per warm instance (shared MongoDB pool), refusing to serve (503, no details) on invalid configuration or a maintainer-only key; all paths rewritten to it; region `bom1` next to Atlas; max duration 300 s. Operator commands stay on the owner's machine. Atlas Network Access opened to `0.0.0.0/0` by the owner (functions have no fixed address); the URI stays in the API project's Production environment only. Render Blueprint and Dockerfile kept as a fallback | Prepared, not deployed | `docs/DEPLOYMENT_VERCEL.md`; `apps/api/vercel.json`; `apps/api/test/serverless.integration.test.ts`. Deploying needs separate approval (commit, push, dashboard setup) |

**Approval record (2026-11-19, project owner):** NestJS 12 with Rspack (subject to production smoke
tests), custom schema-validated configuration module, pino logging, Express, calculation engine
receiving the rule set as input, Mongoose for MongoDB, web-only `@khums/ui`, anonymous local-first
calculations by default, and the request/response compatibility policy.

## 12. Shared backend & API contract strategy

**One backend.** `apps/api` (NestJS 12, Express adapter) serves the web app, the mobile app and the
admin console from the same versioned REST API (`/api/v1`). There is no backend-for-frontend.

**Contract flow — declared once, used everywhere:**

```
@khums/validation (Zod schemas, e.g. healthResponseSchema, problemDetailsSchema)
   ├─► apps/api        validates requests (global ZodValidationPipe + createZodDto)
   │                   types responses (z.infer) and documents them in OpenAPI
   │                   └─► apps/api/openapi.json  (committed; drift-tested in CI)
   │                          └─► generate clients for non-TS consumers (openapi-typescript, etc.)
   └─► @khums/api-client  validates responses at runtime, exposes typed methods
          ├─► apps/web     createApiClient({ baseUrl, fetch })
          └─► apps/mobile  createApiClient({ baseUrl, fetch })   (future)
```

- TypeScript consumers import contract types directly — no generated code to keep in sync.
- `apps/api/openapi.json` is regenerated with `pnpm --filter @khums/api openapi`; a contract test
  fails if the committed file and the code disagree, and checks every `$ref` resolves.
- Contract schemas carry `.meta({ id })`; the id is the OpenAPI component name. They are registered
  in `apps/api/src/shared/openapi/contract-schemas.ts` as either `REQUEST_CONTRACTS` or
  `RESPONSE_CONTRACTS`.

**Compatibility policy (approved):**

| Direction | Zod definition                        | Server behaviour                                                                                                                                                                        | OpenAPI output                                   | Client expectation                                         |
| --------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| Request   | `z.strictObject(...)` (nested too)    | Unexpected fields → `400 VALIDATION_FAILED` (`unrecognized_keys`). Global pipe fails closed without a DTO.                                                                              | _input_ mode, `additionalProperties: false`      | Send only documented fields.                               |
| Response  | `z.object(...)` (never `looseObject`) | `ContractResponseInterceptor` parses every body through its schema: undeclared properties are **stripped**, contract violations → logged 500, bodies without a declared contract → 500. | _output_ mode, additional properties **allowed** | Tolerate unknown fields (`@khums/api-client` strips them). |

Why: requests reject surprises (mass-assignment and typo protection; nothing unvalidated reaches
`core`), while responses can gain fields without breaking deployed mobile apps or generated
clients. Adding a response field is non-breaking; removing/renaming a field, changing a type, or
adding a _required_ request field is breaking → new API version. "Where appropriate": a request
schema may be non-strict only with a documented reason (e.g. forwarding an opaque, separately
validated payload), reviewed in the PR.

**Conventions:**

| Topic         | Convention                                                                                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Versioning    | URI prefix `/api/v1`. Breaking changes → `/api/v2` alongside v1 for a deprecation window.                                                                                                                                                                                                                                |
| Errors        | RFC 9457 `application/problem+json` with a stable `code` (`API_ERROR_CODES`), `requestId`, and `errors[]` for validation. 5xx never expose internals; parser errors never echo the body.                                                                                                                                 |
| Validation    | Every `@Body`/`@Query`/`@Param` DTO is `createZodDto(sharedStrictSchema)`. The global pipe **fails closed**: a body/query (or non-string param) without a Zod DTO is rejected as a logged 500 before the handler runs. Unexpected keys are rejected (strict request contracts). Messages never include submitted values. |
| Money in JSON | Decimal strings (`decimalStringSchema`), never numbers.                                                                                                                                                                                                                                                                  |
| Request ids   | `x-request-id` accepted (if `[\w-]{1,64}`) or generated; echoed in responses, logs and problems.                                                                                                                                                                                                                         |
| Security      | helmet (strict CSP for JSON), CORS allow-list from env, 100 kB JSON body limit, `trust proxy` opt-in.                                                                                                                                                                                                                    |
| Lifecycle     | `enableShutdownHooks()`: SIGTERM/SIGINT close the server and run module destroy hooks.                                                                                                                                                                                                                                   |

**Planned feature modules** (not implemented): see `apps/api/README.md` for the module layout of
Auth, Users, Marja, Calculation, FinancialRecords, History, Reports, Donations and Admin.
