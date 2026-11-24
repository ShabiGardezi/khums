# apps/api — Khums REST API (NestJS)

The **single backend** for the web app, the mobile app and the admin console. Versioned REST API
under `/api/v1`, OpenAPI documentation, RFC 9457 errors, structured logging.

> Status: foundation (health endpoint, configuration, validation, errors, logging, security
> headers, OpenAPI), **persistence** (M4.6.3a, MongoDB driver, append-only collections, audit
> chain, signed checkpoints) and **staff authentication** (M4.6.2b, `src/auth/`: username/password,
> server-side sessions, account administration). Public routes need no authentication. The former
> Auth0 staff path is removed (`docs/auth0/` is kept as history).

## Run locally

```bash
cp apps/api/.env.example apps/api/.env
```

```bash
pnpm --filter @khums/api dev
```

- Health: http://localhost:4000/api/v1/health
- Swagger UI: http://localhost:4000/api/docs (JSON: `/api/docs/openapi.json`)

## Scripts

| Script      | Description                                                                   |
| ----------- | ----------------------------------------------------------------------------- |
| `dev`       | Nest CLI watch mode (rspack rebuild + restart).                               |
| `build`     | Bundle to `dist/main.js` (ESM). `@khums/*` is compiled in; npm deps external. |
| `start`     | `node --enable-source-maps dist/main.js`.                                     |
| `test`      | Vitest: unit tests, HTTP integration tests, OpenAPI contract-drift test.      |
| `typecheck` | `tsc --noEmit`.                                                               |
| `openapi`   | Regenerate the committed `openapi.json` (run after changing endpoints).       |

## Structure

```text
src/
├── main.ts                 bootstrap: env → validated config → app → listen; --generate-openapi
├── app.module.ts           root module (config, logger, health, global filter + pipe)
├── config/                 Zod env schema, typed AppConfig, @InjectAppConfig(), .env loading
├── common/
│   ├── filters/            ProblemDetailsFilter + pure toProblemDetails()
│   ├── pipes/              ZodValidationPipe + createZodDto()
│   ├── errors/             RequestValidationException
│   ├── decorators/         ApiContractResponse / ApiProblemResponses (OpenAPI)
│   ├── guards/             (Milestone 6) auth guards
│   └── interceptors/       ContractResponseInterceptor (response serialization)
├── auth/                   Staff auth (M4.6.2b): username/password sign-in, server-side sessions,
│                           CSRF, throttling, temporary passwords, bootstrap, account administration
├── persistence/            (M4.6.3a) MongoDB connection, collection specs, append-only collection
│                           port (Mongo + in-memory), least-privilege roles, migration, operator CLI
├── audit/                  (M4.6.3a) hash-chained audit store and AuditService
├── integrity/              (M4.6.3a) Ed25519 checkpoints: signer/verifier, trusted keys, job logic
├── governance/             governance API (M4.6.4a): pack ledgers and commands, write-once pack
│                           content, policies, audit reads; one unit of work per command
├── health/                 GET /api/v1/health
└── shared/
    ├── http/               configureApp(): prefix, helmet, CORS, body limit, Swagger, shutdown
    ├── openapi/            document builder; component schemas from shared Zod contracts
    ├── logging/            pino params (redaction, request ids)
    └── lifecycle/          graceful-shutdown logging
test/                       integration + OpenAPI contract tests
openapi.json                committed OpenAPI 3 spec (source for generated clients)
```

## Conventions

- **Contracts:** request/response schemas come from `@khums/validation` — never declared here
  (enforced by `pnpm check:boundaries`). DTO: `class CreateXDto extends createZodDto(createXSchema) {}`.
  Register response schemas in `src/shared/openapi/contract-schemas.ts` and reference them with
  `@ApiContractResponse(200, 'SchemaId', '…')`.
- **Compatibility:** request contracts are `z.strictObject` (unexpected fields → 400);
  response contracts are additive in OpenAPI, and `ContractResponseInterceptor` strips undeclared
  fields from every response. A handler returning a body without `@ApiContractResponse` → 500.
- **Errors:** throw Nest `HttpException`s (or domain errors mapped in the filter); clients receive
  `application/problem+json` with a stable `code`. 5xx responses never contain internals.
- **Logic:** controllers are thin. Calculations and use cases live in `@khums/core`; this app only
  adapts HTTP, auth and persistence to it.
- **Config:** inject `AppConfig` with `@InjectAppConfig()`; never read `process.env` in modules.
- **Logging:** inject `PinoLogger`. Never log bodies, financial values, tokens or `MONGODB_URI`.
- **Persistence:** history (audit, ledgers, policy registry, role assignments, administrative
  control, checkpoints) is touched only through `AppendOnlyCollection` (insert + find; no update or
  delete method exists). Every read is Zod-validated and chains are verified in `@khums/core`.

## Staff authentication (M4.6.2b)

Design and as-built details: `docs/AUTH_ARCHITECTURE.md` §4.10. Staff sign in with a username and
password (Argon2id, `node:crypto`); the session lives server-side (`staffSessions`) behind the
HttpOnly `__Host-khums_staff` cookie, with the readable `__Host-khums_csrf` cookie for the CSRF
header. Browsers reach these routes through the web origin's `/api/v1` rewrite, so `CORS_ORIGINS`
must list the web origin. Configuration: `STAFF_AUTH_SECRET` and `STAFF_EDGE_SECRET` (both required
in production; the latter verifies the web tier's signed client IP),
`STAFF_COOKIE_SECURE`, `STAFF_SESSION_IDLE_MINUTES`, `STAFF_SESSION_ABSOLUTE_HOURS`.

Create the first SUPER_ADMIN once, against the real database, from an interactive terminal:

```bash
node dist/main.js --bootstrap-super-admin <username>
```

The password is asked twice with echo off (never an argument, variable or log line). The command
refuses to run a second time. Further accounts, roles (Marja-scoped for religious roles), password
resets, suspension and session revocation go through `/api/v1/admin/staff/accounts` (a SUPER_ADMIN;
UI in M4.6.5). `STAFF_E2E_FIXTURE_FILE` is a test-only in-memory fixture for Playwright and is
refused in production.

## Persistence and integrity (M4.6.3a)

Design: `docs/DATABASE_SCHEMA.md` §3.8–§3.9 and `docs/AUTH_ARCHITECTURE.md` §4.11. Operator
commands (after `pnpm --filter @khums/api build`), each run with its own database user:

| Command                                                   | Database user     | What it does                                                                                                                                       |
| --------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node dist/main.js --bootstrap-super-admin <username>`    | `khumsApp`        | Creates the first SUPER_ADMIN (interactive, once only; §Staff authentication).                                                                     |
| `node dist/main.js --print-database-roles`                | none              | Prints the Atlas custom roles (`khumsApp`, `khumsCheckpoint`, `khumsMigrator`) to create in Atlas.                                                 |
| `node dist/main.js --migrate-database`                    | `khumsMigrator`   | Creates collections, strict validators and indexes (idempotent) and seeds the initial policy registry (deterministic, idempotent).                 |
| `node dist/main.js --create-integrity-checkpoints`        | `khumsCheckpoint` | Verifies every chain and signs its head (needs `AUDIT_CHECKPOINT_KEY_ID` and `AUDIT_CHECKPOINT_SIGNING_KEY`). Copy the output to the WORM archive. |
| `node dist/main.js --verify-integrity [checkpoints.json]` | read-only         | Verifies chains against checkpoints from the archive file (preferred) or the database copy. Non-zero exit on any failure.                          |

The checkpoint signing key (`AUDIT_CHECKPOINT_SIGNING_KEY`: base64 of a PKCS#8 PEM Ed25519 key)
lives only in the checkpoint job's protected secret store (target: a sign-only KMS key). The API
server refuses to start if it is present. Trusted public keys are version-controlled in
`src/integrity/checkpoint-keys.ts` (empty until the maintainer provisions the first key).

Live database tests are opt-in: `pnpm --filter @khums/api test:live` with `KHUMS_TEST_MONGODB_URI`
(a temporary user restricted to the test database) and `KHUMS_TEST_MONGODB_DATABASE`
(`khums_test_*`), exported or in the git-ignored `apps/api/.env.test.local`. Only `test:live` sets
`KHUMS_LIVE_TESTS=1`; every other test command excludes the live suites. A mandatory guard
(`test/support/live-target.ts`) refuses production URIs and users and verifies with the server that
the user's effective privileges are exactly the nine approved actions on the test database (custom
`khumsLiveTest` role) before any write; only that database is
dropped. Procedure: `docs/DEPLOYMENT_VERIFICATION.md` §1–§2.

## Planned feature modules (not implemented)

Each module is a folder under `src/modules/<name>/` with `<name>.module.ts`, `*.controller.ts`
(HTTP only), `*.service.ts` (calls `@khums/core`), `*.repository.ts` (MongoDB driver, behind a core
port), and `dto/` (Zod DTOs from `@khums/validation`). Modules depend on each other only through
exported services.

| Module                   | Responsibility                                                                                     | Milestone  |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ---------- |
| `AuthModule`             | Staff sign-in, sessions, CSRF, throttling, account administration, `StaffAuthGuard` (`src/auth/`). | M4.6.2b ✅ |
| `UsersModule`            | Profile, preferences (Marja, currency, Khums year), export & account deletion.                     | 6          |
| `MarjaModule`            | Read-only Maraje and published rule-set versions (signed bundles for clients).                     | 6          |
| `CalculationModule`      | Server-side re-execution/verification of results via `@khums/core` — never trusts client figures.  | 6          |
| `FinancialRecordsModule` | Encrypted, syncable assessment inputs and payment records.                                         | 6          |
| `HistoryModule`          | Past assessments, sync pull/push with conflict detection.                                          | 6          |
| `ReportsModule`          | Printable/exportable summaries generated from stored traces.                                       | 9          |
| `DonationsModule`        | Voluntary donations via a PCI-compliant provider (webhooks; no card data).                         | 9          |
| `AdminModule`            | Rule-set authoring & review workflow API, RBAC, audit log (for `apps/admin`).                      | 7          |

The database connection lives in `src/persistence/` (M4.6.3a); a readiness check in `health/` is
part of hardening.

## Deployment notes

- Node ≥ 24. `dist/main.js` imports npm dependencies at runtime, so deploy with production
  dependencies installed, e.g. `pnpm --filter @khums/api deploy --prod <dir>` then run the build
  output there.
- Configure via environment variables only (see `.env.example`); `.env` is ignored in production.
- Send SIGTERM to stop: in-flight requests finish and shutdown hooks run.
