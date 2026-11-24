# Private scholar-review deployment on free hosting (M4.7)

> **Update 2026-11-25 (decision 84):** the API now deploys to **Vercel** too — see
> `DEPLOYMENT_VERCEL.md`. §3 (Render) is kept as a fallback; every other section still applies.

Owner decision 2026-11-22: the private scholar-review deployment uses **Vercel Hobby** (web),
**Render Free** (API, Docker, Node 26) and the **existing Atlas M0 cluster**, on the free Vercel URL,
for **$0/month**. No AWS, paid hosting, custom domain or other external infrastructure. KMS, WORM
storage and a dedicated (M10+) cluster remain **production** requirements
(`DEPLOYMENT_VERIFICATION.md` §8). This runbook covers what is different from
`DEPLOYMENT_VERIFICATION.md` for this setup; everything else there still applies.

Nothing here approves a calculation. The deployment serves **provisional** results only to
authenticated, authorized staff in `SCHOLAR_REVIEW`; they are never religious guidance.

> Never paste secrets into chat, tickets, commits or logs. Enter them only in the Render and
> Vercel dashboards (or a hidden terminal prompt on your own machine). Nothing in this repository
> contains a secret value.

## 1. Status

| Phase | Work                                                                                                                                    | Status                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1     | Local code: private gate, edge-signature enforcement, Render Docker config, cold-start handling, provisional checkpoints, archive, docs | Implemented locally (uncommitted, 2026-11-22)        |
| 2     | Atlas: least-privilege roles and users, live tests                                                                                      | **Deferred** by the owner (temporary arrangement §9) |
| 3     | Initial database migration (§3.1, mandatory before the first API start), then the API on Render                                         | Not started (needs approval)                         |
| 4     | Web on Vercel                                                                                                                           | Not started (needs approval)                         |
| 5     | Checkpoint key, first archive, backup drill, staff onboarding                                                                           | Not started (needs approval)                         |

## 2. Architecture and cost

```text
Browser ──https──▶ Vercel Hobby: Next.js (apps/web), free *.vercel.app URL
                    • proxy.ts: whole-application private gate (§4.1), noindex, no-store
                    • /api/v1/* rewrite → KHUMS_API_ORIGIN, with an HMAC-signed client IP
                    • Server Components call the API directly, also signed
                   ──https──▶ Render Free: NestJS API (apps/api/Dockerfile, Node 26), Singapore
                               • refuses every unsigned request except GET /api/v1/health (§4.2)
                               • KHUMS_OPERATIONAL_STATE=SCHOLAR_REVIEW
                              ──TLS──▶ MongoDB Atlas M0 (existing cluster, AWS Mumbai)

Maintainer's machine only (never on Render, Vercel or in MongoDB):
  • Ed25519 checkpoint signing key (encrypted at rest)
  • checkpoint archive file (+ an offline encrypted copy)
  • encrypted mongodump backups
```

| Item                 | Plan                    | Monthly cost |
| -------------------- | ----------------------- | ------------ |
| Web                  | Vercel Hobby            | $0           |
| API                  | Render Free web service | $0           |
| Database             | Atlas M0 (existing)     | $0           |
| URL                  | `*.vercel.app`          | $0           |
| Checkpoints, backups | maintainer's machine    | $0           |
| **Total**            |                         | **$0**       |

Paid options (Render Starter for no sleep, Vercel Pro if Hobby is not permitted, a dedicated
Atlas tier) are **not** part of this deployment and need separate owner approval.

## 3. API on Render (Docker)

Files: `apps/api/Dockerfile` (build from the repository root), `.dockerignore`, `render.yaml`.

- **Image:** two stages on `node:26-bookworm-slim`. The build stage installs the API and its
  workspace packages with the pinned pnpm, bundles `dist/main.js` (shared `@khums/*` TypeScript
  compiled in) and prunes to production dependencies (`pnpm deploy --prod`). The runtime stage
  holds only `dist/`, production `node_modules` and `package.json`, and runs as the `node` user.
  `.dockerignore` keeps `.env*`, `*.pem`, `*.key`, `dev-identities.json`, archives and backups out
  of the build context.
- **Before the first deploy:** pin the base image by digest (`node:26-bookworm-slim@sha256:…`,
  from `docker buildx imagetools inspect node:26-bookworm-slim`) in a reviewed change.
- **Memory:** Render Free has 512 MB. The image caps the V8 heap at 384 MB
  (`NODE_OPTIONS=--max-old-space-size=384`). A local production-mode run of this build measured
  about 160 MB resident at idle (no database). Each Argon2id verification uses 64 MiB, so
  concurrent sign-ins are the peak; watch Render's memory graph during the first scholar round.
- **Health check:** `GET /api/v1/health` (`render.yaml` `healthCheckPath`), the only route answered
  without the edge signature.
- **Region:** Singapore (closest Render region to the Atlas cluster in Mumbai).
- **Deploys:** manual (`autoDeploy: false`).
- **Outbound:** the API makes outbound connections only to Atlas. Outgoing email ports (SMTP) are
  blocked on Render Free; the application sends no email.

| Variable                       | Value                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `NODE_ENV`                     | `production` (also set in the image)                                                     |
| `KHUMS_OPERATIONAL_STATE`      | `SCHOLAR_REVIEW`                                                                         |
| `KHUMS_REQUIRE_EDGE_SIGNATURE` | `true` (the API refuses to start in production `SCHOLAR_REVIEW` without it)              |
| `CORS_ORIGINS`                 | the exact Vercel production URL, e.g. `https://<project>.vercel.app`                     |
| `MONGODB_URI`                  | **secret**: the existing Atlas URI (temporary arrangement, §9)                           |
| `MONGODB_DATABASE`             | `khums`                                                                                  |
| `STAFF_AUTH_SECRET`            | **secret**: generated by Render (`generateValue`)                                        |
| `STAFF_EDGE_SECRET`            | **secret**: `openssl rand -base64 48` on your machine; the **same value** goes to Vercel |
| `LOG_FORMAT` / `LOG_LEVEL`     | `json` / `info`                                                                          |
| `SWAGGER_ENABLED`              | `false`                                                                                  |
| `TRUST_PROXY`                  | leave unset (`false`): the API never uses `X-Forwarded-For` for security decisions       |
| never set                      | `AUDIT_CHECKPOINT_SIGNING_KEY` (the API refuses to start), `STAFF_E2E_FIXTURE_FILE`      |

**Atlas network access (later phase, with approval):** Render Free egress uses Render's **shared**
regional outbound ranges (Render dashboard → the service → Connect → Outbound). Add those ranges
for Singapore to the Atlas IP access list; never `0.0.0.0/0`. Because the ranges are shared with
other Render customers, the network list narrows access but does not isolate the cluster: TLS and
the database credentials remain the real protection (§9).

### 3.1 Initial database migration (mandatory, before the first API start)

The API **never** creates its schema, and it does not check for one at startup. If it started
against an unmigrated database, MongoDB would create collections implicitly on the first write,
**without** the unique indexes that stop concurrent appends from forking the hash chains, without
the validators, and without the governance policy registry. So the migration runs **once, before
the API is started for the first time** (Phase 3, before the Render Blueprint is created: Render
deploys a Blueprint's services as soon as they are created).

**What it does** (`node dist/main.js --migrate-database`, `apps/api/src/persistence/migrate.ts`),
only in the database named by `MONGODB_DATABASE` (`khums`):

- creates every application collection that does not exist yet;
- sets each collection's `$jsonSchema` validator (strict; it applies to future writes only);
- creates the indexes, including the unique ones;
- seeds the initial governance policy registry (`INITIAL_GOVERNANCE_POLICIES`: `sistani` and
  `khamenei`, `SINGLE_SCHOLAR_V1`; owner decision 2026-11-22), only into an empty registry. Other
  Marjas stay unconfigured (rule-pack submissions refused) until two administrators configure them.

The exact manifest (18 collections, validators, 49 indexes, 2 policy records) is printed without a
database by `node dist/main.js --print-migration-manifest` and reviewed in
ATLAS_INTEGRATION_TEST_PLAN.md §4.

**It is non-destructive.** It never drops, deletes, renames or empties a collection, never deletes
or modifies a document, never touches another database, and never creates or changes database
users or roles. A registry that already holds a different history is reported as `DIFFERS` and is
never overwritten. It is idempotent: re-running it (later also as `khums-migrator`, Phase 2) is
safe. **Do not drop or delete any existing collection** before, during or after it, and do not
"clean up" anything it reports.

**Credentials (temporary arrangement, owner decision 2026-11-22):** run it once from your own
machine with the **existing Atlas credentials** (the same URI that goes to Render, §9), typed at a
hidden prompt. Your machine's IP must be in the Atlas IP access list (the existing entry). Never
put the URI in a file, an argument or the shell history.

1. Build from this commit and go to the API directory:

   ```bash
   pnpm install --frozen-lockfile && pnpm --filter @khums/api build
   ```

   ```bash
   cd apps/api
   ```

2. Optional, read-only: in the Atlas UI (Browse Collections), confirm that a `khums` database does
   not exist yet, or note what it contains. The migration changes nothing in other databases.

3. Run the migration (`MONGODB_DATABASE` set explicitly: a typo would create a different
   database):

   ```bash
   read -rs MONGODB_URI && export MONGODB_URI
   ```

   ```bash
   NODE_ENV=production MONGODB_DATABASE=khums node dist/main.js --migrate-database
   ```

   ```bash
   unset MONGODB_URI; cd ../..
   ```

**Success (required before Phase 3 continues):** exit code `0`, and JSON in which every
application collection is listed under `created` (first run) or `updated` (later runs), and
`"policyRegistrySeed": "SEEDED"`.

**Stop (do not create the Render service, do not start the API) if:**

- the exit code is not `0`, or the output is `Fatal error …` or mentions `not authorized`;
- `"policyRegistrySeed"` is `DIFFERS` (exit code `0` in that case too: a different registry already
  exists and was left unchanged) or `UNAVAILABLE`;
- an index cannot be created (for example a conflicting index with the same name).

Report the output (it contains collection names and status codes only, no data or credentials)
and investigate before any retry. Never resolve a failure by dropping or deleting collections.

## 4. Private access

### 4.1 Whole-application gate (web, `apps/web/src/proxy.ts`)

`accessMode` (`src/lib/private-access.ts`) is `PRIVATE` when the web operational state is
`SCHOLAR_REVIEW`, and on **every hosted (Vercel) deployment** unless it is `PRODUCTION_APPROVED`
with `KHUMS_PUBLIC_ACCESS=enabled` (the public launch is a separate approval). Decision 65: the
public `PRODUCTION_APPROVED` deployment also hosts staff testing of provisional packs behind the
staff sign-in (staff pages `no-store` and `noindex`), and its API must require the edge signature
(`KHUMS_REQUIRE_EDGE_SIGNATURE=true`) like `SCHOLAR_REVIEW`. In `PRIVATE` mode:

- **Every page** except `/{locale}/admin/sign-in` needs a staff session. Without a session cookie
  the visitor is redirected to sign-in, with no API call needed.
- A cookie is **not trusted**: on each page request the proxy asks the API
  (`GET /api/v1/admin/session`, with the browser's signed client IP) and continues only for a
  session the API confirms. A temporary-password session can only reach the password page.
- If the API does not answer within 8 s (asleep, §5), the visitor goes to sign-in with
  `?wake=1&next=<page>`; the page wakes the API and then continues to `next` (same-origin,
  localized paths only), where the gate checks again.
- Every response is `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`;
  `robots.txt` disallows everything.
- Static files (`/_next/*`, files with an extension such as icons) are not gated: they contain no
  data. All data comes from the API, which authenticates and authorizes every request.

Local development and the test builds stay public unless `KHUMS_PRIVATE_ACCESS=required`, so
anonymous local use keeps working.

### 4.2 Edge-signature enforcement (API)

With `KHUMS_REQUIRE_EDGE_SIGNATURE=true`, a global guard (`EdgeSignatureGuard`, before every other
guard) refuses with `403 EDGE_SIGNATURE_REQUIRED` any request without a valid, fresh (±30 s) HMAC
signature over the client IP, time, method and exact path under `STAFF_EDGE_SECRET`. Only
`GET`/`HEAD /api/v1/health` is exempt. The web tier signs browser requests in `proxy.ts` and Server
Component requests in `src/server/staff-api.ts` and the gate's session check.

So the public `*.onrender.com` URL is useless on its own: sign-in cannot even be attempted there.
The guard **adds** a gate and replaces nothing: sessions, CSRF (Origin, Sec-Fetch-Site and token),
throttling, authorization, the operational state and the audit log apply to every forwarded
request as before. Unknown routes still answer 404 (routing runs before guards).

## 5. Cold starts

Render Free stops the service after about 15 minutes without inbound traffic; the next request
waits about a minute while it starts.

- The sign-in page checks `/api/v1/health` and, only if it is slow (after 1.5 s), shows "Starting
  the secure server…" (English and Urdu). It retries every 3 s for up to 2 minutes, then offers
  "Try again".
- The gate gives up on the API after 8 s and sends the visitor to the wake step (§4.1).
- Server Component calls give up after 15 s and show the existing "unavailable" message instead of
  holding the page until the platform limit.
- **No keep-warm pinger** (it would cost CI minutes or rely on a third-party service). If cold
  starts disrupt the scholar rounds, Render Starter removes them, a paid option needing approval.
- To verify on the deployment (Phase 3/4): Vercel's limits for rewrites to an external origin and
  for function duration on Hobby, with a request made right after the service has slept.

## 6. Integrity checkpoints without KMS (private review only)

**Verified 2026-11-22: the existing interfaces support this without weakening integrity.** The
`CheckpointSigner` port already has an Ed25519 signer from a PEM key (`ed25519Signer`); trusted
public keys are version-controlled (`checkpoint-keys.ts`), so a database administrator cannot add
one; `verifyIntegrity` already accepts checkpoints from an independent archive file; the API
refuses to start with the signing key in its environment. The KMS-free arrangement changes
**where the key and the archive live**, not how checkpoints are made or checked.

M4.7 additions (Phase 1):

- **Provisional chains are checkpointed** (`provisional:{packId}@{version}`), alongside the audit
  chain, the policy registry and every governance ledger. `khumsCheckpoint` gains `find` on
  `provisionalPackRecords`. Feedback status records are not hash-chained; their changes are in the
  audit chain.
- **Archive:** `--create-integrity-checkpoints --archive <file>` appends the new checkpoints to a
  local archive file; `--export-integrity-checkpoints <file>` copies the database's checkpoints
  into it (recovery). Only checkpoints with a valid signature from a **trusted** key enter
  (`verifyCheckpointSignature`); the archive only grows (entries never change or disappear; the
  same id with different content is refused); writes are atomic and owner-readable only (0600).
  With `--archive`, creation is refused before any database write if the signing key is not in the
  trusted list.

### 6.1 Procedure (Phase 5, with approval)

1. **Key, on your machine only.** Generate it in a directory on an encrypted disk (FileVault),
   outside the repository:

   ```bash
   openssl genpkey -algorithm ed25519 -out checkpoint-2026a.pem
   ```

   ```bash
   openssl pkey -in checkpoint-2026a.pem -pubout -out checkpoint-2026a.pub.pem
   ```

   Keep `checkpoint-2026a.pem` (or an encrypted copy) offline as well; losing it only stops new
   checkpoints (rotate to a new key id). Never upload it anywhere.

2. **Trust the public key** through a reviewed commit: add `{ keyId: 'checkpoint-2026a',
publicKeyPem, validFrom, validUntil: null, revokedAt: null }` to `TRUSTED_CHECKPOINT_KEYS` and
   deploy the API. Only the **public** key goes in the repository.

3. **Create checkpoints and archive them** (from `apps/api` after `pnpm --filter @khums/api build`;
   the URI is typed at a hidden prompt):

   ```bash
   read -rs MONGODB_URI && export MONGODB_URI
   ```

   ```bash
   NODE_ENV=production MONGODB_DATABASE=khums AUDIT_CHECKPOINT_KEY_ID=checkpoint-2026a AUDIT_CHECKPOINT_SIGNING_KEY="$(base64 < /path/to/checkpoint-2026a.pem | tr -d '\n')" node dist/main.js --create-integrity-checkpoints --archive ~/khums-integrity/checkpoints.json
   ```

   Expected: every chain `CHECKPOINTED` or `ALREADY_CHECKPOINTED` (or `EMPTY`), and
   `"archive": { "status": "ARCHIVED", … }`. Any `NOT_SIGNED_*` is an integrity incident.

4. **Verify against the archive** (read-only):

   ```bash
   NODE_ENV=production MONGODB_DATABASE=khums node dist/main.js --verify-integrity ~/khums-integrity/checkpoints.json
   ```

   ```bash
   unset MONGODB_URI
   ```

   Every outcome must be `VERIFIED`; anything else (`CHECKPOINT_FAILED`, `CHAIN_MISSING`, …) is an
   integrity incident: stop provisional use and report it.

5. **Copies:** after each run, copy `checkpoints.json` to an offline encrypted medium (a second
   encrypted disk or encrypted USB drive). A copy that is shorter than the previous one, or differs
   in an existing entry, is an incident. Uploading copies to a private repository or cloud storage
   is external infrastructure and needs approval.

6. **Cadence:** before scholars get access, after every pack registration, enable or disable,
   after every governance publication, at least weekly during scholar rounds, and at the end of
   each round.

### 6.2 What this protects, and what it does not

- Detected: a rewrite, truncation, fork or deletion of any checkpointed chain by someone who
  controls the database (including its administrators), as long as the archive and the key stay
  outside their control.
- **Not WORM.** The archive is append-only by procedure, not by storage enforcement. Someone who
  controls both the database and your machine (key and archive) defeats it. Records appended after
  the latest checkpoint are protected only by the chain until the next checkpoint.
- Acceptable for a private, provisional review with no religious authority; **not acceptable for
  production**, where KMS signing, a WORM archive in a separately administered account and a
  scheduled checkpoint job remain mandatory (`DEPLOYMENT_VERIFICATION.md` §8, items 8–11).

## 7. Encrypted backups (M0 has none)

Mandatory before scholars get access, and at least weekly during rounds (Phase 5, with approval).
Requires the MongoDB Database Tools and `gpg` (or `age`) on your machine.

```bash
read -rs MONGODB_URI && export MONGODB_URI
```

```bash
mongodump --uri="$MONGODB_URI" --db=khums --archive --gzip | gpg --symmetric --cipher-algo AES256 --output ~/khums-backups/khums-$(date -u +%Y%m%dT%H%MZ).archive.gz.gpg
```

```bash
unset MONGODB_URI
```

- The passphrase is typed at gpg's prompt and kept in your password manager; never on the same
  medium as the backup.
- Keep at least the last 8 weekly backups on two encrypted media.
- **Restore drill** before the first scholar round: restore into a separate, clearly named database
  (for example `khums_restore_drill`, never over `khums`) and run `--verify-integrity` with
  `MONGODB_DATABASE=khums_restore_drill` against the archive file. Then drop only that drill
  database, after confirming its name. The drill touches Atlas and needs approval.
- Backups contain staff accounts (password hashes, no plain passwords), audit records and
  provisional records (no financial figures: provisional calculations store none).

### 7.1 Research evidence files (M5.3.3)

Evidence files (scans, screenshots, notes attached to research sources) are **not accepted on
this deployment**: Render Free's filesystem is ephemeral and no approved durable, private,
encrypted, no-cost store exists here, so the API answers 503 `EVIDENCE_STORAGE_UNAVAILABLE` and
refuses `KHUMS_EVIDENCE_DIR`/`KHUMS_EVIDENCE_KEY` in production. Research records themselves
(sources, passages, translations) are stored in Atlas and covered by the backups above. On a
maintainer machine, the local encrypted provider keeps AES-256-GCM files in `KHUMS_EVIDENCE_DIR`;
back that directory up with the encrypted media used for §7 (the files are already encrypted; the
key lives in your password manager, never beside the backup). A durable production provider needs
an owner decision first (SCHOLAR_RESEARCH_ARCHITECTURE.md §4.3.1, §15).

### 7.2 Evidence encryption key: backup, access, recovery and rotation (M5.3.3)

The evidence files are only as recoverable as their key (`KHUMS_EVIDENCE_KEY`, 32 random bytes,
base64). Lose the key and every encrypted file is unreadable; leak it and anyone with the files can
read them. No paid service or new infrastructure is needed.

**Generate** once, on the maintainer machine:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

**Back up the key** (never beside the files or their backups):

- primary copy in your password manager as a secure note (`khums evidence key <key id>`);
- a second, offline copy: printed and sealed, or on an encrypted USB drive kept apart from the
  evidence backups;
- record the key id (not the key): every backup manifest lists the `keyId` of each file, so you
  can tell which key a backup needs. `evidenceKeyId` is a one-way hash; it never reveals the key.

**Access control**: only the maintainer holds it. It lives in `apps/api/.env` (mode `600`) on the
machine that runs the local provider, and in no repository, chat, log, ticket or backup. The API
never logs it; configuration errors never echo it; backups contain ciphertext and a manifest only
(tested). In production it is refused outright.

**Recovery** (new machine or lost disk):

1. Restore the evidence backup directory from your encrypted backup medium.
2. Put the key back in `apps/api/.env` from the password manager.
3. `node dist/main.js --verify-evidence-backup <dir>`: every file's ciphertext hash, authenticated
   decryption and SHA-256 must pass (exit 0).
4. `node dist/main.js --restore-evidence <dir>` (verifies everything again before writing a single
   file; never overwrites), then `--verify-evidence` against the database metadata.

**Rotation** (yearly, or at once if the key may have been exposed):

1. Generate a new key; store it in the password manager first.
2. `KHUMS_EVIDENCE_NEW_KEY=<new> node dist/main.js --rotate-evidence-key <new empty dir>`: decrypts
   every file with the current key, checks its SHA-256, re-encrypts with the new key into the new
   directory and verifies every new file. The current directory is not changed. (The API refuses to
   start while `KHUMS_EVIDENCE_NEW_KEY` is set.)
3. Point `KHUMS_EVIDENCE_DIR` and `KHUMS_EVIDENCE_KEY` at the new directory and key; run
   `--verify-evidence`; take and verify a new backup (`--backup-evidence`).
4. Only then archive the old directory and retire the old key (keep both, offline, until older
   backups that need them have expired).

**Operator commands** (maintainer machine; output: keys, counts and codes only):

| Command                                                                         | Effect                                                                                              |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `--verify-evidence`                                                             | every artefact's bytes decrypt and match its SHA-256 and size; lists unreferenced bytes             |
| `--backup-evidence <empty dir>`                                                 | copies ciphertext + manifest, then verifies the backup (hashes, decryption, digests)                |
| `--verify-evidence-backup <dir>` · `--restore-evidence <dir>`                   | verify a backup · restore it after full verification (never overwrites)                             |
| `--evidence-orphans [--grace-days N]`                                           | read-only: stored bytes with no committed metadata, and which are past the grace period (default 7) |
| `--delete-evidence-orphans <keys.json> --confirm "DELETE <n> EVIDENCE ORPHANS"` | deletes only listed, still-unreferenced orphans past the grace period; audited before and after     |
| `--rotate-evidence-key <empty dir>`                                             | key rotation as above                                                                               |

## 8. Web on Vercel (Hobby)

- **Eligibility (owner decision):** Hobby is for non-commercial personal use; deployments that
  anyone is paid to build or run count as commercial. If that applies, Hobby is not permitted
  (Vercel Pro, or the web app as a second Render Free service with
  `KHUMS_PRIVATE_ACCESS=required`, need approval).
- Root Directory `apps/web`; Next.js preset; Node.js version **24.x** (Corepack, needed below, is
  not bundled with Node 25 or later).
- **Production** environment variables (Preview gets none):

| Variable                       | Value                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `KHUMS_API_ORIGIN`             | `https://<service>.onrender.com` (also read at **build** time for the rewrite)                      |
| `STAFF_EDGE_SECRET`            | **secret**: the same value as on Render                                                             |
| `KHUMS_CLIENT_IP_HEADER`       | `x-forwarded-for` (Vercel overwrites it at its edge)                                                |
| `KHUMS_OPERATIONAL_STATE`      | `SCHOLAR_REVIEW`                                                                                    |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1`: build with the repository's pinned pnpm (`packageManager: pnpm@11.28.12`, root `package.json`) |
| never set                      | `KHUMS_PUBLIC_ACCESS`, any database URI or database credential (the web tier has none)              |

- **pnpm version (required check).** By default Vercel picks pnpm 9 or 10 from the lockfile
  version (`9.0`), not pnpm 11, and the workspace uses pnpm 11 settings (`allowBuilds`, supply-chain
  policies). With `ENABLE_EXPERIMENTAL_COREPACK=1`, Corepack installs exactly the version in
  `packageManager`. To make it visible, set the project's Install Command to
  `pnpm --version && pnpm install --frozen-lockfile`. In the first build log, confirm the line
  `11.28.12` before the install output, and that the install finishes without errors. Do not
  promote or use a deployment built with any other pnpm version.
- **If Corepack fails** (the build log shows another pnpm version, `corepack` errors, or pnpm
  complaining about unknown settings or the lockfile), check in this order:
  1. `ENABLE_EXPERIMENTAL_COREPACK=1` is set for the environment being built (Production), then
     redeploy **without** the build cache.
  2. The project's Node.js version is 24.x (Corepack is missing in Node 25+).
  3. The root `package.json` still says `"packageManager": "pnpm@11.28.12"` and no other
     `package.json` declares a `packageManager` (verified 2026-11-22: only the root does).
  4. A Corepack signature or download error: retry once; if it persists, a fallback Install Command
     `npx --yes pnpm@11.28.12 install --frozen-lockfile` uses the same pinned version from the npm
     registry (a configuration change: record it in this runbook).

  Never make the build pass by downgrading pnpm, regenerating the lockfile, removing `allowBuilds`
  or the supply-chain settings, or dropping `--frozen-lockfile`. If none of the above works, stop
  and report the build log lines (they contain no secrets).

- Preview deployments: turn them off (Settings → Git), or leave them without variables. They then
  fail closed: the gate is private (hosted), the `/api/v1` proxy answers 503, and their origin is
  not in `CORS_ORIGINS`.
- Vercel's own Deployment Protection is limited on Hobby; the application gate (§4.1) does not
  depend on it.

## 9. Temporary arrangement and risks (owner decision 2026-11-22)

**Atlas credentials.** Until Phase 2 runs, the API uses the **existing Atlas database user**, which
has the `atlasAdmin` role, in Render's environment only. This is a **documented temporary risk**:

- If Render's environment leaked, the holder would have full administrative control of the whole
  cluster (every database, users and roles), and the append-only and least-privilege guarantees
  (`DATABASE_SCHEMA.md` §3.9) would not hold against them. Checkpoints (§6) would still detect a
  rewrite of checkpointed chains.
- Mitigations until then: the URI exists only in Render's secret environment (never in Vercel, the
  repository, chat or logs); the Atlas IP access list allows only Render's ranges and, temporarily,
  your own IP; rotate the user's password before the first scholar gets access and after any
  suspicion; keep the number of Render and Atlas account holders minimal, with two-factor sign-in.
- Exit: Phase 2 creates `khumsApp`, `khumsMigrator` and `khumsCheckpoint` (§3.1 of
  `DEPLOYMENT_VERIFICATION.md`), switches Render to the `khumsApp` user, and leaves the existing
  user for administration only. Required before production; recommended before scholar round 2.

**Other risks**

| Risk                                                        | Mitigation                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Vercel Hobby use not permitted (commercial use)             | Owner decision (§8); fallbacks need approval                                            |
| Render shared egress ranges (network list is not isolation) | TLS, strong credentials, edge signature (§4.2)                                          |
| Cold starts (about 1 min)                                   | Wake step and timeouts (§5); Render Starter with approval                               |
| No Atlas backups on M0                                      | Encrypted weekly mongodump and restore drill (§7)                                       |
| Atlas M0 pauses after a long period without connections     | The API connects whenever it runs; resume from the Atlas UI if paused                   |
| M0 limits (512 MB storage, about 100 operations/s)          | Ample for the review; watch storage in the Atlas UI                                     |
| Render Free 750 instance hours per month per workspace      | One always-on service fits; the API sleeps when idle                                    |
| Archive is not WORM                                         | Offline copies and the §6.2 limits; WORM is a production requirement                    |
| Free tiers can change or be withdrawn                       | Nothing depends on a provider-specific API; the Docker image runs on any container host |

## 10. Readiness criteria

### 10.1 Private scholar review (this deployment)

No scholar receives access until all of these are done and verified:

1. The roadmap's scholar deployment gate, except the production-only infrastructure items:
   provisional mode (M4.5a), feedback and audit (M4.6.4/M4.5.2), admin console (M4.6.5), and
   **actual sourced proposed rule packs** from the research team (still the main blocker).
2. Phase 1 checks pass locally (`pnpm check`, Playwright).
3. The live Atlas suites pass (`DEPLOYMENT_VERIFICATION.md` §2), including the provisional suites
   still to be written, in the isolated test database (needs approval).
4. §3.1: the initial database migration succeeded **before** the first API start (every collection
   `created` or `updated`, `"policyRegistrySeed": "SEEDED"`), with no collection dropped or deleted.
5. Render: `render.yaml` settings, secrets entered in the dashboard only, base image pinned by
   digest, health check green, a direct request to the onrender.com URL answers
   `403 EDGE_SIGNATURE_REQUIRED`.
6. Vercel: §8 variables in Production only, the build log showing pnpm `11.28.12`, previews off or
   without variables, every page
   redirects anonymous visitors to sign-in, `robots.txt` disallows all.
7. `DEPLOYMENT_VERIFICATION.md` §4 (signed client IP: `clientIpSource: SIGNED_EDGE`, throttling
   `401 ×5, 429`) and §5 (deployed Playwright tests) on the Vercel URL.
8. §6: the checkpoint key generated offline, its public key trusted through a reviewed commit, the
   first checkpoints created, archived and verified (`VERIFIED` everywhere).
9. §7: the first encrypted backup taken and the restore drill passed.
10. §9: the Atlas user's password rotated; the IP access list limited to Render's ranges (plus your
    IP only while operating).
11. `DEPLOYMENT_VERIFICATION.md` §6: the first administrator bootstrapped once, scholar accounts
    created with a safe handover.
12. Fail-closed behaviour confirmed: the API refuses to start with the signing key, or in
    production `SCHOLAR_REVIEW` without `KHUMS_REQUIRE_EDGE_SIGNATURE`; staff routes answer 503
    without the database; provisional actions are refused outside `SCHOLAR_REVIEW`.

### 10.2 Production (unchanged, not this deployment)

Every item of `DEPLOYMENT_VERIFICATION.md` §8 remains mandatory for production: a separate
production Atlas project on a dedicated tier with Cloud Backup, network access restricted to the
API host, the three least-privilege users; a non-exportable, sign-only **KMS** Ed25519 key and its
`CheckpointSigner`; an independent **WORM** archive (Object Lock, compliance mode) in a separately
administered account; a scheduled, alerting checkpoint job; a stable private domain with Deployment
Protection; and the governed production readiness path for every authoritative calculation
(`checkProductionReadiness` with a verified ledger). Nothing in this free-tier setup relaxes them,
and no scholar-review pack can ever become a production pack.

## 11. Later phases: exact steps (each needs approval)

**Phase 2: Atlas (deferred).** `DEPLOYMENT_VERIFICATION.md` §1–§2 and §3.1: test database and
temporary least-privilege user, the 15 live tests plus the provisional suites, then the production
roles and users (re-running the idempotent `--migrate-database` as `khums-migrator` is safe). No
existing data or user is deleted. The **initial** migration does not wait for Phase 2: it is the
first step of Phase 3 (§3.1).

**Phase 3: API on Render.**

1. Generate the edge secret on your machine and keep it in your password manager:

   ```bash
   openssl rand -base64 48
   ```

2. **Run the initial database migration (§3.1)** with the existing Atlas credentials. Continue only
   if it succeeded (exit code `0`, every collection `created` or `updated`,
   `"policyRegistrySeed": "SEEDED"`). Otherwise stop: no Render service is created.
3. Render → New → Blueprint → this repository → `render.yaml`. Confirm the Free instance type and
   the Singapore region.
4. Enter `CORS_ORIGINS` (the Vercel production URL; create the Vercel project first, Phase 4 step
   1, to know it), `MONGODB_URI` and `STAFF_EDGE_SECRET` in the dashboard. Never in a file.
5. Deploy. Expected: the health check turns green; the logs show no secret.
6. Atlas → Network Access: add Render's Singapore outbound ranges (Render → service → Connect →
   Outbound). Do not remove existing entries without checking what uses them.
7. Checks (from your machine):

   ```bash
   curl -sS https://<service>.onrender.com/api/v1/health
   ```

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' https://<service>.onrender.com/api/v1/admin/session
   ```

   Expected: `{"status":"ok",…}`, then `403`.

**Phase 4: Web on Vercel.**

1. Vercel → Add New → Project → this repository; Root Directory `apps/web`; do not deploy yet.
2. Production environment variables from §8 (including `ENABLE_EXPERIMENTAL_COREPACK=1`); Preview:
   none. Node.js version 24.x; Install Command `pnpm --version && pnpm install --frozen-lockfile`.
   Settings → Git: disable preview deployments if possible.
3. Deploy. In the build log, confirm pnpm `11.28.12` (§8); otherwise follow "If Corepack fails"
   and do not use the deployment. Then, signed out: every page (for example `/en`, `/en/start`, `/ur/methodology`) must
   redirect to `/…/admin/sign-in`; `robots.txt` must disallow all.
4. Sign in as the bootstrap administrator (after Phase 5 step 1), and check that a page loads
   right after the API has slept (wake step).
5. Run `DEPLOYMENT_VERIFICATION.md` §4 and §5 against the Vercel URL.

**Phase 5: Integrity, backups, onboarding.**

1. `DEPLOYMENT_VERIFICATION.md` §6.1: bootstrap the first administrator (interactive, once).
2. §6.1 of this runbook: key, trusted public key commit and API redeploy, first checkpoints,
   archive, verification.
3. §7: first encrypted backup and restore drill.
4. Rotate the Atlas user's password (§9) and update `MONGODB_URI` on Render.
5. Create scholar accounts with Marja scopes (`DEPLOYMENT_VERIFICATION.md` §6.2).
6. Register a scholar-review pack **only** when the research team delivers a sourced pack; enable
   it only by a governing scholar. Checkpoint after each change.
