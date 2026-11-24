# Khums Platform

A production-grade platform that helps Shia Muslims **calculate, understand, track and manage**
their Khums according to their selected Marja-e-Taqlid — with every result traceable to a versioned,
source-cited, scholar-reviewed rule set. Private by design, free to use, supported by voluntary
donations.

> **Status:** Milestone 1 — project foundation. There is no calculator yet and **no religious
> rulings are encoded**. See [`docs/DEVELOPMENT_ROADMAP.md`](docs/DEVELOPMENT_ROADMAP.md).

## Prerequisites

| Tool    | Version                                |
| ------- | -------------------------------------- |
| Node.js | ≥ 24 (developed on 26 — see `.nvmrc`)  |
| pnpm    | 11.28.12 (pinned via `packageManager`) |
| Git     | any recent version                     |

Enable pnpm through Corepack (ships with Node):

```bash
corepack enable
```

## Installation

```bash
pnpm install
```

Copy environment templates where needed:

```bash
cp apps/web/.env.example apps/web/.env.local
```

```bash
cp apps/api/.env.example apps/api/.env
```

For end-to-end tests, install the Playwright browser once:

```bash
pnpm --filter @khums/web exec playwright install chromium
```

## Commands

Run from the repository root (Turborepo runs tasks across workspaces with caching):

| Command                 | What it does                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm dev`              | Start all dev servers: web http://localhost:3000, API http://localhost:4000/api/v1 (docs at /api/docs). |
| `pnpm build`            | Production build of every workspace that has a build.                                                   |
| `pnpm lint`             | ESLint (type-aware) across all workspaces + root scripts.                                               |
| `pnpm typecheck`        | `tsc --noEmit` in every workspace.                                                                      |
| `pnpm test`             | Vitest unit tests.                                                                                      |
| `pnpm test:e2e`         | Build web, then run Playwright against the production server.                                           |
| `pnpm format`           | Format with Prettier (`format:check` to verify only).                                                   |
| `pnpm check:boundaries` | Verify package dependency rules (no cycles, no platform leaks).                                         |
| `pnpm check`            | Everything CI runs, in order.                                                                           |
| `pnpm clean`            | Remove build outputs, caches and `node_modules`.                                                        |

Target a single workspace with a filter, e.g. `pnpm --filter @khums/web dev` or
`pnpm turbo run test --filter @khums/utils`.

API-specific commands:

| Command                            | What it does                                                           |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `pnpm --filter @khums/api dev`     | Run the API with rebuild-on-change.                                    |
| `pnpm --filter @khums/api build`   | Bundle the API to `apps/api/dist/main.js`.                             |
| `pnpm --filter @khums/api start`   | Run the built API.                                                     |
| `pnpm --filter @khums/api test`    | Unit, HTTP integration and OpenAPI contract tests.                     |
| `pnpm --filter @khums/api openapi` | Regenerate `apps/api/openapi.json` after changing endpoints/contracts. |

## Environment configuration

Each app validates its environment at startup and fails fast with a list of invalid variables
(values are never printed). Templates with documentation: `apps/api/.env.example`,
`apps/web/.env.example`.

| Variable                   | App | Local development              | Production                                 |
| -------------------------- | --- | ------------------------------ | ------------------------------------------ |
| `NODE_ENV`                 | api | `development`                  | `production`                               |
| `HOST` / `PORT`            | api | `0.0.0.0` / `4000`             | set by the platform                        |
| `CORS_ORIGINS`             | api | `http://localhost:3000`        | exact `https://` origins, comma-separated  |
| `LOG_LEVEL` / `LOG_FORMAT` | api | `debug` / `pretty`             | `info` / `json` (`pretty` is rejected)     |
| `SWAGGER_ENABLED`          | api | `true`                         | defaults to `false`                        |
| `TRUST_PROXY`              | api | `false`                        | `true` only behind a trusted load balancer |
| `MONGODB_URI`              | api | optional (unused until M6)     | secret store only — never in files or logs |
| `NEXT_PUBLIC_API_BASE_URL` | web | `http://localhost:4000/api/v1` | public API URL (bundled into browser code) |
| `NEXT_PUBLIC_SITE_URL`     | web | `http://localhost:3000`        | public site URL                            |

Locally, the API reads `apps/api/.env` (git-ignored); in production `.env` files are ignored and
values come from the hosting platform's secret store. See `docs/SECURITY.md` §5.

## Workspace structure

```text
khums-platform/
├── apps/
│   ├── web/                 Next.js App Router web app (MVP)           @khums/web
│   ├── mobile/              Expo / React Native — reserved, not initialized
│   ├── api/                 NestJS REST API — the one backend for all apps @khums/api
│   └── admin/               Rule-management console — reserved, not initialized
├── packages/
│   ├── shared-types/        Domain types (type-only leaf)              @khums/shared-types
│   ├── utils/               Result, invariant, pure helpers            @khums/utils
│   ├── money/               Exact Decimal/Money (wraps decimal.js)     @khums/money
│   ├── validation/          Zod schemas + REST API contracts           @khums/validation
│   ├── api-client/          Typed REST client for web + mobile         @khums/api-client
│   ├── marja-rules/         Versioned, source-cited rule sets (data)   @khums/marja-rules
│   ├── calculation-engine/  Rule-pack interpreter (no embedded formulas) @khums/calculation-engine
│   ├── core/                Use cases & ports used by every app        @khums/core
│   └── ui/                  shadcn/ui components for React DOM         @khums/ui
├── docs/                    Product, architecture, rules, security docs
├── scripts/                 Repository tooling (boundary checker)
├── .github/workflows/       CI
├── CLAUDE.md                Instructions for AI coding assistants
├── turbo.json · pnpm-workspace.yaml · tsconfig.base.json · eslint.config.mjs
```

Dependency direction (enforced by `pnpm check:boundaries` and ESLint):

```text
apps → core → { marja-rules → validation, calculation-engine } → money → utils → shared-types
apps(web, mobile) → api-client → validation          (REST contracts shared with apps/api)
apps(web, admin) → ui → utils
```

Web, mobile and admin all talk to the same NestJS API (`/api/v1`). MongoDB and NestJS code exist
only in `apps/api`.

## Development workflow

1. Branch from `main` (`feat/<scope>-<summary>`).
2. Make changes; keep business logic in `packages/*`, never in UI components.
3. `pnpm check` locally.
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (`feat(core): …`).
5. Open a PR; CI must be green. Rule-data changes also need scholarly sign-off.

## Documentation

| Document                                     | Contents                                           |
| -------------------------------------------- | -------------------------------------------------- |
| [PRD](docs/PRD.md)                           | Vision, audiences, workflows, MVP scope            |
| [Architecture](docs/ARCHITECTURE.md)         | Packages, dependency rules, money, traceability    |
| [Database schema](docs/DATABASE_SCHEMA.md)   | Proposed MongoDB collections                       |
| [Religious rules](docs/RELIGIOUS_RULES.md)   | Sourcing, versioning and review process            |
| [Step 2 research](docs/research/README.md)   | Research plan, matrix, sources, rule-pack proposal |
| [Roadmap](docs/DEVELOPMENT_ROADMAP.md)       | Milestones and exit criteria                       |
| [Coding standards](docs/CODING_STANDARDS.md) | TypeScript, React, testing, Git conventions        |
| [Security](docs/SECURITY.md)                 | Privacy, auth boundaries, secrets                  |

## Disclaimer

This software helps apply published rulings of a user's chosen Marja. It does not issue religious
rulings. For any situation not covered, consult your Marja's office.
