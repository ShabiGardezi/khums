# Private scholar-review deployment: web and API on Vercel (decision 84)

Owner decision 2026-11-25: both the web app and the API run on **Vercel Hobby**, as two projects
from this repository, against the existing Atlas cluster. This replaces the Render API of
`DEPLOYMENT_FREE_TIER.md` §3 (the Render Blueprint and Dockerfile stay as a fallback). Everything
else in that runbook still applies: the private-access gate (§4), edge signatures (§4.2), the
operational state, the migration command (§3.1), integrity checkpoints (§6) and the web project
settings (§8).

> Nothing here contains a secret. Every secret is typed into the Vercel dashboard by the owner
> (or generated on the owner's machine). Never paste one into chat, a file or a commit.

## 1. Shape

```text
Browser ──https──▶ khums-web (Vercel, apps/web, Next.js)
                      │  /api/v1/* rewrite + signed edge headers (STAFF_EDGE_SECRET)
                      ▼
                   khums-api (Vercel, apps/api, one Node function: api/index.js → dist/serverless.js)
                      │  TLS + database user (MONGODB_URI, API project only)
                      ▼
                   MongoDB Atlas (AWS Mumbai)
```

- **API function:** `apps/api/api/index.js` re-exports `dist/serverless.js` (built by
  `pnpm --filter @khums/api build`, the same Nest application as `main.ts`, without `listen()`).
  Every path is rewritten to it (`apps/api/vercel.json`). One application per warm instance; the
  MongoDB pool is reused. It refuses to serve (503, no details) on invalid configuration or when a
  maintainer-only key is present.
- **Region:** `bom1` (Mumbai), next to the Atlas cluster. **Max duration:** 300 s.
- **Operator commands** (`--migrate-database`, checkpoints, backups, `--inventory-database`) are
  never run on Vercel: they run from the owner's machine with `node apps/api/dist/main.js …`.

## 2. Before the first deployment (owner)

1. **Atlas network access.** Vercel functions have changing outbound addresses. In Atlas →
   Network Access add `0.0.0.0/0` (owner decision 2026-11-25). Access then depends on the
   database user's password and TLS: keep the URI only in the API project's Production
   environment, and plan the least-privilege `khumsApp` user (`DEPLOYMENT_FREE_TIER.md` §9).
2. **The code must be deployed together with the current Atlas data.** The research records and
   rule revisions imported on 2026-11-24/25 use fields only this code reads (decisions 77–83).
3. **Migration.** Already run on 2026-11-24; no new collection or validator change since. Run
   `--inventory-database` from your machine before go-live to confirm (read-only).
4. **Secrets** (on your machine, never shared): `STAFF_EDGE_SECRET` = `openssl rand -base64 48`
   (the same value goes into both projects); `STAFF_AUTH_SECRET` = `openssl rand -base64 48`
   (API project only).
5. **Commit and push** the repository (Vercel builds from Git). Separate approval.

## 3. Project `khums-api`

Vercel → Add New → Project → this repository.

| Setting                                  | Value                                                   |
| ---------------------------------------- | ------------------------------------------------------- |
| Root Directory                           | `apps/api`                                              |
| Include files outside the root directory | **on** (the workspace packages are needed by the build) |
| Framework Preset                         | Other (from `apps/api/vercel.json`)                     |
| Install / Build / Output                 | from `apps/api/vercel.json` (do not override)           |
| Node.js version                          | **24.x** (the API needs ≥ 24.7 for `crypto.argon2`)     |
| Fluid compute                            | on (default)                                            |
| Preview deployments                      | off (Settings → Git), or leave them without variables   |

**Production** environment variables (Preview gets none):

| Variable                       | Value                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                     | `production`                                                                                                     |
| `KHUMS_OPERATIONAL_STATE`      | `SCHOLAR_REVIEW`                                                                                                 |
| `KHUMS_REQUIRE_EDGE_SIGNATURE` | `true`                                                                                                           |
| `CORS_ORIGINS`                 | the web project's production URL, exactly (`https://<web>.vercel.app`)                                           |
| `MONGODB_URI`                  | **secret**: the Atlas URI (this project only)                                                                    |
| `MONGODB_DATABASE`             | `khums`                                                                                                          |
| `STAFF_AUTH_SECRET`            | **secret**                                                                                                       |
| `STAFF_EDGE_SECRET`            | **secret**: the same value as in the web project                                                                 |
| `LOG_LEVEL` / `LOG_FORMAT`     | `info` / `json`                                                                                                  |
| `SWAGGER_ENABLED`              | `false`                                                                                                          |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` (builds with the pinned pnpm 11.28.12, as for the web project)                                               |
| never set                      | `KHUMS_BACKUP_KEY`, `AUDIT_CHECKPOINT_SIGNING_KEY`, `KHUMS_EVIDENCE_*`, `HOST`, `PORT`, `STAFF_E2E_FIXTURE_FILE` |

In the first build log confirm `11.28.12` (pnpm) and `Rspack … compiled successfully`. The API's
production domain (`https://<api>.vercel.app`) is the one the web project uses; Vercel's standard
protection covers preview and per-deployment URLs, not the production domain, and the API answers
staff routes only with a valid edge signature.

## 4. Project `khums-web`

Exactly `DEPLOYMENT_FREE_TIER.md` §8 (Root Directory `apps/web`, Next.js, Node 24.x, Corepack),
with `KHUMS_API_ORIGIN` = the API project's production domain (`https://<api>.vercel.app`; read at
build time too: redeploy the web after changing it). Create the web project first if you need its
URL for `CORS_ORIGINS`, then deploy the API, then the web.

## 5. Verification after deployment

1. `GET https://<api>.vercel.app/api/v1/health` → 200. A staff route without the web tier's
   signature → refused.
2. `DEPLOYMENT_VERIFICATION.md` §4 and §5 against the web URL (gate, sign-in, throttling, the
   deployed Playwright run).
3. Sign in, Admin → Rules → run a Sistani and a Khamenei test: every result shows **PROVISIONAL —
   FOR SCHOLAR REVIEW ONLY** and "Approved for scholar testing by AI — not verified by a scholar";
   "Fill in the official inflation figure" answers for PKR.
4. Vercel → khums-api → Logs: no `API start failed` line, no stack traces, no values.

## 6. Known limits and risks

| Item                        | Note                                                                                                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Atlas open to all addresses | Owner decision; protection is the database password and TLS. Rotate to `khumsApp` (least privilege).                                                                                                                                                                                       |
| Cold starts                 | The first request after idle builds the Nest app (a few seconds); later requests reuse it.                                                                                                                                                                                                 |
| Long requests               | Function limit 300 s. A large rule save took > 30 s from Pakistan through the local web tier; on Vercel next to Atlas it is much shorter. Imports go through the web tier: if a save times out at the web tier, check the rule revision in Atlas before retrying (it may have been saved). |
| Request body size           | Vercel limits a function request to 4.5 MB; evidence uploads are disabled in production anyway.                                                                                                                                                                                            |
| Hobby plan                  | Non-commercial use only (owner decision, `DEPLOYMENT_FREE_TIER.md` §8).                                                                                                                                                                                                                    |
| IMF CPI data                | Confirm the IMF data terms before public use (decision 83).                                                                                                                                                                                                                                |
| Public calculation          | Unchanged: nothing is verified, so no public calculation is possible until a scholar verifies rules.                                                                                                                                                                                       |
