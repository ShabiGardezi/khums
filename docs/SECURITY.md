# Security & Privacy

Khums data is a detailed picture of a person's finances and religious practice. Treat all of it as
**highly sensitive personal data**.

## 1. Principles

1. **Data minimization.** Collect only what the calculation needs. No analytics on financial values.
2. **Local-first.** Anonymous mode keeps all data on the device; no financial data is sent to any
   server.
3. **Opt-in cloud.** Sync requires explicit sign-in and consent; users can export and delete
   everything.
4. **Defense in depth.** Validation at every trust boundary, least privilege, encryption in transit
   and at rest.
5. **No third-party trackers** or advertising SDKs. Any third-party script requires a security review.

## 2. Data classification

| Class        | Examples                                                  | Handling                                                               |
| ------------ | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Restricted   | Assessment inputs/results, payments, balances             | Encrypted at rest (client-side or field-level), never logged.          |
| Confidential | Email, auth identifiers, preferences (incl. Marja choice) | Encrypted at rest (Atlas), access-controlled, not logged in plaintext. |
| Internal     | Draft rule sets, reviewer notes                           | Admin-only access, audit-logged.                                       |
| Public       | Published rule sets, sources, app content                 | Integrity-protected (content hash).                                    |

## 3. Authentication & authorization boundaries (_proposed_)

- Web MVP: **no authentication for calculator users** (anonymous only, always). Authentication
  exists only for governance staff on `/{locale}/admin`, `/api/v1/staff/*` and `/api/v1/admin/*`.
- **Staff authentication (implemented M4.6.2b, awaiting review; `AUTH_ARCHITECTURE.md` §4.10):** NestJS username/password with Argon2id; server-side sessions
  (hashed ids, validated on every request, rotated at sign-in and password change, revoked on
  password change/reset, suspension and any role change); first-party `__Host-` SameSite=Strict
  cookie through a Vercel rewrite; CSRF defence in depth on every unsafe method (exact Origin,
  `Sec-Fetch-Site: same-origin`, and a session-bound token from a separate readable
  `__Host-khums_csrf` cookie, compared in constant time against the session's stored hash);
  distributed rate limiting with bounded (never permanent) throttling (device cookies exempt a
  scholar's known browser from distributed guessing; account, client and network keys; client IP
  only from the web tier's signed assertion, never `X-Forwarded-For`); temporary passwords that
  expire and can never become permanent; no mandatory MFA (owner decision; optional MFA later).
  Administrative control `SINGLE_ADMIN_V1` initially (audited, mandatory reason), `DUAL_ADMIN_V1`
  later; no self-grants; only `SUPER_ADMIN` (every permission) and `SCHOLAR` (assigned Marjas) can be
  granted (ARCHITECTURE decision 64). Audit: append-only, hash-chained,
  insert-only database user (collection-specific least-privilege roles, `DATABASE_SCHEMA.md`
  §3.9), Ed25519-signed integrity checkpoints whose key lives only in the checkpoint job's KMS or
  protected secret store and whose copies go to an independent WORM archive
  (`AUTH_ARCHITECTURE.md` §4.11), and protected backups (a full-chain rewrite is undetectable
  without them). SUPER_ADMIN bootstrap is a one-time, transactional command with no default
  credentials and no password in arguments, environment or logs. The Auth0 staff path has been removed; Auth0 is reserved for future public Google Sign-In.
- **Detailed design (M4.6.0; authorization engine M4.6.1; Auth0 staff identity M4.6.2, partially
  complete): `docs/AUTH_ARCHITECTURE.md` §4.5–§4.8.** It supersedes the outline below where they
  differ (notably: the staff session is the Auth0 SDK's encrypted cookie on the Next.js server,
  SameSite=Lax, with no refresh tokens).
- **Staff secrets** (`AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`) live only in `apps/web/.env.local`
  locally and in the host's secret store in production. They are never `NEXT_PUBLIC_*`, never
  logged, and never committed. Bearer tokens, cookies and token claims are never logged; the API
  logs authentication refusals as reason codes only.
- API: delegated auth via a standards-based identity provider (OIDC); short-lived access tokens,
  refresh-token rotation; server-side sessions behind an opaque `__Host-` cookie (httpOnly,
  `Secure`; `SameSite=Strict` for governance, `Lax` at most for end users); no tokens in browser
  storage.
- Authorization is enforced **server-side** on every request: users can only access their own
  documents (`userId` scoping in every repository query).
- Admin console: separate deployment, username/password sign-in with server-side sessions (no mandatory MFA; staff authenticate once; no per-action step-up — owner decisions 2026-11-21), permission-based
  RBAC (administrator, author, researcher, scholar reviewer, independent approver, auditor),
  publication under the governance policy bound to each pack version (owner decisions 2026-11-21
  and 2026-11-22: one authorized, in-scope scholar may review, approve and publish alone under
  `SINGLE_SCHOLAR_V1`; no two-person rule for religious-rule work), administrators cannot approve,
  publish or activate (only an emergency withdrawal of a published version, with a reason;
  M5.2.1), legacy pack versions without a recorded policy fail closed until explicitly bound, all
  actions audit-logged.
- Shared packages contain **no** auth logic; they receive an already-authorized context.
- The server never trusts client-computed results: it recomputes from inputs + rule-set version.

## 4. Encryption

- TLS 1.2+ everywhere; HSTS on web domains.
- MongoDB Atlas encryption at rest; restricted network access (private endpoints / IP allowlist).
- **Restricted** fields: client-side encryption (key derived on device, wrapped keys for
  multi-device) or MongoDB Queryable/Client-Side Field Level Encryption — decision in Milestone 6.
- Local storage on web (IndexedDB) and mobile (SQLite / secure store) encrypted with a device key;
  details finalized in Milestones 5 and 8, including the limits of browser-side encryption.

## 5. Secrets management

- Never commit secrets. Only `.env.example` files (with placeholder values) are committed;
  `.gitignore` excludes every other `.env*` file.
- `NEXT_PUBLIC_*` variables are bundled into client code: **never** put secrets in them.
- Local: `apps/web/.env.local` and `apps/api/.env` (both git-ignored). CI: GitHub Actions
  encrypted secrets / environments. Production: hosting provider's secret store. The API **does
  not load `.env` files when `NODE_ENV=production`**.
- Environment variables are validated at startup with Zod (`apps/api/src/config/env.schema.ts`,
  `apps/web/src/env.ts`); the app fails fast on missing/invalid values. Validation errors name the
  variable and rule only — **never the value** (tested), so secrets such as `MONGODB_URI` cannot
  leak through startup logs.
- Production guard rails enforced by the API config: CORS origins must be exact `https://` origins
  (no `*`), pretty logging is rejected, Swagger UI is off unless explicitly enabled.
- `MONGODB_URI` contains credentials: store it only in the secret store, use a least-privilege
  Atlas database user per environment, restrict network access, and never log or echo it.
- The web app has **no secrets at all**: its only variables are public `NEXT_PUBLIC_*` URLs.
- Rotate credentials on staff changes and suspected exposure; prefer short-lived credentials (OIDC
  federation from GitHub Actions to cloud providers).

## 6. Application security

- Input validation with shared Zod schemas on client **and** server.
- Output encoding by React; no `dangerouslySetInnerHTML` without sanitization and review.
- Security headers (baseline set in `apps/web/next.config.ts`); a strict Content-Security-Policy
  with nonces is added before any user data is handled (Milestone 5).
- API (implemented in Step 1.1): helmet with a strict `default-src 'none'` CSP for JSON
  responses (Swagger UI gets a narrow `'self'` policy), `x-powered-by` removed, JSON bodies limited
  to 100 kB, CORS allow-list from `CORS_ORIGINS` (credentials allowed only for listed origins),
  `trust proxy` off unless configured, unknown request keys stripped by Zod validation.
- API errors are RFC 9457 problems: 5xx responses never include internal messages or stacks, and
  body-parser errors are replaced with a generic message because parser messages can echo
  fragments of the submitted (financial) data.
- Rate limiting on the API arrives with authentication (Milestone 6).
- Dependency hygiene: lockfile committed, `pnpm install --frozen-lockfile` in CI, automated
  dependency update PRs, `pnpm audit` in CI before launch. pnpm blocks dependency install scripts
  unless explicitly allowed (`allowBuilds` in `pnpm-workspace.yaml`: only `@swc/core` is permitted;
  the `@scarf/scarf` install-time telemetry from Swagger UI is explicitly blocked). pnpm's
  `minimumReleaseAge` guard is kept on (no exclusions).
- Rule-set integrity: published versions are content-hashed; the client verifies hashes of
  downloaded rule bundles (Milestone 6+).

## 7. Logging

- Structured JSON logs (apps only; shared packages never log). The API uses pino: request logs
  contain only request id, method, **path without query string**, status and duration;
  `authorization`, `cookie`, `x-api-key` and `set-cookie` headers are redacted; bodies are never
  logged; health-check requests are not logged. `LOG_LEVEL` controls verbosity, `LOG_FORMAT=json`
  in production.
- Every response carries an `x-request-id` (accepted from the caller if well-formed, otherwise
  generated) that also appears in logs and problem responses for correlation.
- **Never log**: financial values, assessment inputs/results, tokens, passwords, full emails.
- Error reports scrubbed of request bodies; error monitoring (if adopted) configured with PII
  scrubbing and no session replay on financial screens.

## 8. Privacy & compliance

- Privacy policy and data-processing documentation before launch; consider GDPR/UK GDPR and other
  applicable regimes for target regions (religious belief is special-category data under GDPR).
- User rights: export, delete account (hard delete within 30 days), withdraw sync consent.
- No sale or sharing of user data. Donations processed by a PCI-compliant provider; no card data on
  our servers.

## 9. Reporting a vulnerability

Until a public security contact is published, report vulnerabilities privately to the maintainers
(do not open public issues). A `security.txt` and disclosure policy will be added before launch.
