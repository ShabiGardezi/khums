# Staff authentication deployment verification (M4.6.2b, frozen)

> **Status:** procedure complete, **not yet executed** (2026-11-21). M4.6.2b is frozen. Results of
> this runbook are reported to the maintainer, who approves before M4.6.4 starts. Nothing here runs
> in CI.

## 0. Security precautions (read first)

- **Secrets never leave your machine or the providers' secret stores.** Never paste a connection
  string, password, temporary password or secret into a chat, an issue, a pull request, a commit or
  a screenshot. If one is exposed, rotate it immediately.
- **Avoid shell history.** Enter secrets with `read -rs NAME` (silent, not stored in history) and
  `export NAME`, as shown below. Don't write them on the command line as `NAME=value command`.
- **Git-ignored files only.** The only file this runbook writes a secret to is
  `apps/api/.env.test.local`. It is ignored by `.gitignore` (`.env.*`); confirm with
  `git check-ignore -v apps/api/.env.test.local` before writing it, and delete it when done.
- **Test isolation.** The live tests run in the existing cluster, but only in `khums_test_live`
  with a temporary user whose privileges are confined to it; mandatory guards refuse anything else
  (§1). They never touch `khums` or any other database.
- **Least privilege in production.** The API uses the `khumsApp` user, migrations use the
  `khumsMigrator` user, and the checkpoint job (later) uses `khumsCheckpoint`. No person signs in as
  `khumsApp`.
- **Run commands from the repository root** unless a step says otherwise, on a trusted machine,
  with a build of the exact commit under test.

Generate every random secret locally (never with an online generator):

```bash
openssl rand -base64 48
```

---

## 1. Prepare an isolated test database in the existing Atlas cluster

The live suites run in the **existing** cluster (`khums.4rwn7ov.mongodb.net`), but only in one
dedicated database, **`khums_test_live`**, with a temporary user that can do nothing anywhere else.
The existing `khums` database and every other database stay untouched.

**How that is enforced (three independent layers):**

1. **Atlas permissions (server-side).** The temporary user holds privileges on `khums_test_live`
   only. MongoDB itself refuses any read, write or drop on `khums` or any other database, whatever
   the client code does.
2. **Mandatory configuration guard** (`apps/api/test/support/live-target.ts`, before connecting).
   The suite refuses to run, and never skips silently, unless:
   - `KHUMS_TEST_MONGODB_DATABASE` is set and matches `khums_test_*`, and is not `khums` or a
     configured `MONGODB_DATABASE`;
   - the test URI differs from every production `MONGODB_URI`, from the shell and from
     `apps/api/.env` (read in memory, never printed);
   - the test user differs from the production user.
3. **Mandatory privilege verification** (after connecting, before any write). The server is asked
   for the signed-in user's **effective** privileges, inherited ones included (`connectionStatus`,
   `showPrivileges`). The suite refuses if:
   - any privilege applies to another database, to every database, or to the cluster;
   - any action is outside the **exact nine** in §1.1, even on `khums_test_live` (strict
     allowlist, so only the custom `khumsLiveTest` role passes);
   - a required action is missing;
   - `khums_test_live` contains any collection the suite did not create.

Live suites are also **excluded from every default test command** (`vitest`, `pnpm test`,
`pnpm check`, CI), even when a test URI is exported. They run only through
`pnpm --filter @khums/api test:live`, the only script that sets `KHUMS_LIVE_TESTS=1`, and then one
file after another.

Only after that does it drop and recreate `khums_test_live`, and only that database.

### 1.1 Exact privileges (least privilege)

The suites need exactly these actions, all on database `khums_test_live` (all collections):

| Action             | Why                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `find`             | reads, cursors                                                                              |
| `insert`           | append-only and staff writes                                                                |
| `update`           | staff accounts, sessions, throttle counters (`findOneAndUpdate` also needs find and insert) |
| `createCollection` | migration                                                                                   |
| `createIndex`      | migration (unique sequence, TTL indexes)                                                    |
| `collMod`          | migration (validators on re-run)                                                            |
| `listCollections`  | migration and the ownership check                                                           |
| `listIndexes`      | index management                                                                            |
| `dropDatabase`     | removing `khums_test_live` itself at start (leftovers) and end                              |

The guard accepts **exactly** these nine and nothing more. Not needed and **not to be granted**
(the suite refuses to run if any is present):

- `remove`, `dropCollection`, `renameCollectionSameDB`;
- any role on `admin`, any "any database" role, any cluster action.

### 1.2 Create the custom role and temporary user (Atlas UI)

Project → **Security → Database Access**:

1. **Custom Roles → Add New Custom Role**:
   - Name: `khumsLiveTest`.
   - Add each action from §1.1, all with **Database** `khums_test_live` and **Collection** left
     empty (all collections in that database):
     - Collection Actions: `find`, `insert`, `update`, `createIndex`, `listIndexes`.
     - Database Actions: `createCollection`, `collMod`, `listCollections`, `dropDatabase`.
   - No inherited roles. Save.

   The custom role is **required**. Built-in roles such as `readWrite` or `dbAdmin` grant more than
   the nine actions and are refused by the guard. If your cluster tier does not offer custom roles,
   stop and report it: do not substitute broader roles.

2. **Database Users → Add New Database User**:
   - Authentication: Password. Username `khums-live-test`. **Autogenerate Secure Password**, copied
     straight to your password manager.
   - Database User Privileges: the custom role **`khumsLiveTest`** only. No built-in role of any
     kind (no `readWrite`, `dbAdmin`, "any database" role or Atlas admin).
   - **Restrict Access to Specific Clusters** → only `khums`.
   - **Temporary User** → delete after **1 day**.
3. **Network Access**: only if your current IP is not already allowed, **Add IP Address → Add
   Current IP Address**, tick **This entry is temporary** (6 hours). Change no existing entry.
4. Build the test URI in your password manager (not in chat, not in a file in the repository):
   `mongodb+srv://khums-live-test:<generated password>@khums.4rwn7ov.mongodb.net/?retryWrites=true&w=majority`

## 2. Run all 15 live MongoDB tests (existing data cannot be changed)

Run from the repository root:

```bash
pnpm install --frozen-lockfile
```

```bash
git check-ignore -v apps/api/.env.test.local
```

Expected: `.gitignore:23:.env.*  apps/api/.env.test.local` (in case you choose the file option
below; if nothing is printed, STOP).

Enter the test URI silently (paste at the empty prompt, press Enter), and set the test database:

```bash
read -rs KHUMS_TEST_MONGODB_URI && export KHUMS_TEST_MONGODB_URI
```

```bash
export KHUMS_TEST_MONGODB_DATABASE=khums_test_live
```

```bash
unset MONGODB_URI MONGODB_DATABASE
```

```bash
pnpm --filter @khums/api test:live
```

`test:live` sets `KHUMS_LIVE_TESTS=1`, includes only the three live suites and runs them one after
another (`--no-file-parallelism`), all in `khums_test_live`. Don't export `KHUMS_LIVE_TESTS`
yourself; `vitest` or `pnpm test` run directly never include the live suites.
(Alternative to exporting: put both `KHUMS_TEST_MONGODB_URI=…` and
`KHUMS_TEST_MONGODB_DATABASE=khums_test_live` in `apps/api/.env.test.local` with an editor and
`chmod 600` it; `test:live` loads it.)

**Expected:** `Test Files 3 passed`, `Tests 15 passed` (12 until M4.6.4a added the governance suite):

| File                                        | Test                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/persistence/mongo.integration.test.ts` | migration is idempotent                                                          |
|                                             | 8 concurrent audit appends land in one unforked chain (real unique indexes)      |
|                                             | the `$jsonSchema` validator rejects documents missing chain fields               |
|                                             | seeding the policy registry is idempotent                                        |
| `test/staff-auth.live.test.ts`              | concurrent bootstraps create exactly one SUPER_ADMIN; a second run is refused    |
|                                             | 6 concurrent account creations commit, each audited, one verifiable chain        |
|                                             | 5 concurrent requests for one username create exactly one account                |
|                                             | a role grant bumps the session epoch, is audited, and ends the target's session  |
|                                             | concurrent grants on one account never lose an update                            |
|                                             | administrator session revocation is immediate                                    |
|                                             | when the audit write fails, the account change is rolled back                    |
|                                             | the audit chain is intact after all of the above                                 |
| `test/governance.live.test.ts` (M4.6.4a)    | when the audit event fails, neither the ledger record nor the content is written |
|                                             | 3 concurrent reviewers: exactly one review starts, the others get 409            |
|                                             | full lifecycle commits ledger, content and audit together; SUPER_ADMIN denied    |

`15 skipped` means `KHUMS_TEST_MONGODB_URI` is not set in this shell. `No test files found`
means the suites were run some other way than `test:live`.

**Failure interpretation** (a refusal happens before any write):

| Message                                                                     | Meaning / action                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refused: KHUMS_TEST_MONGODB_DATABASE must be set and match khums_test_*`   | Export `KHUMS_TEST_MONGODB_DATABASE=khums_test_live`.                                                                                                                                                                                                                           |
| `refused: the test URI equals a production MONGODB_URI`                     | The production connection string was entered. Use the `khums-live-test` URI.                                                                                                                                                                                                    |
| `refused: the test URI uses the production database user`                   | Same as above (different password or options, same user).                                                                                                                                                                                                                       |
| `refused: the test user has privileges outside the test database`           | The user's roles are too broad (for example an "any database" role or Atlas admin). Fix them in Atlas; never weaken the guard.                                                                                                                                                  |
| `refused: the test user has actions outside the approved nine: …`           | The user holds more than `khumsLiveTest` (for example a built-in `readWrite`/`dbAdmin`), or the role has an extra action. Remove the listed actions or roles. If Atlas itself adds an action to the custom role, report the list; never add it to the allowlist without review. |
| `refused: the test user lacks … on the test database`                       | An action from §1.1 is missing from `khumsLiveTest`.                                                                                                                                                                                                                            |
| `refused: the test database contains collections this suite did not create` | `khums_test_live` is in use by something else. It is not dropped. Choose another `khums_test_*` name (and scope the role to it) or investigate.                                                                                                                                 |
| `MongoServerSelectionError`, timeouts                                       | Your IP is not allowed in Network Access. Add a temporary entry.                                                                                                                                                                                                                |
| `bad auth` / `Authentication failed`                                        | Wrong username or password in the URI.                                                                                                                                                                                                                                          |
| `not authorized on khums_test_live to execute command …`                    | The role lacks that action (§1.1). Add only that action.                                                                                                                                                                                                                        |
| A concurrency or rollback test fails                                        | A real defect. Do not deploy. Report the test name and output (no secrets).                                                                                                                                                                                                     |

**Cleanup:**

1. The suite drops `khums_test_live` at the end. In Atlas → Database → **Browse Collections**,
   confirm `khums_test_live` is gone and `khums` is unchanged. If a run was interrupted, the next
   run removes the leftovers, or delete `khums_test_live` there by hand. Never delete any other
   database.
2. Clear the secret and settings from your shell and disk:

   ```bash
   unset KHUMS_TEST_MONGODB_URI KHUMS_TEST_MONGODB_DATABASE
   ```

   ```bash
   rm -f apps/api/.env.test.local
   ```

3. In Atlas:
   - delete the `khums-live-test` user (it also expires after one day);
   - delete the `khumsLiveTest` custom role;
   - remove the temporary Network Access entry if you added one.

---

## 3. Configure Vercel (web) and the separate API host

### 3.1 Production Atlas (separate project)

1. A separate Atlas project (e.g. `khums-production`) and cluster (a dedicated tier with **Cloud
   Backup** enabled is recommended for the scholar deployment; see §8).
2. Print the least-privilege role definitions from a build of this commit:

   ```bash
   pnpm --filter @khums/api build
   ```

   ```bash
   cd apps/api && MONGODB_DATABASE=khums node dist/main.js --print-database-roles; cd ../..
   ```

   Create the three custom roles in Atlas → Security → Database Access → **Custom Roles**, exactly as
   printed (`khumsApp`, `khumsCheckpoint`, `khumsMigrator`): action per collection, database `khums`.

3. Create users, each with a generated password, each assigned **only** its custom role:
   `khums-app` → `khumsApp`, `khums-migrator` → `khumsMigrator` (and later `khums-checkpoint` →
   `khumsCheckpoint`).
4. Network Access: the API host's egress addresses if it has static ones (or private networking);
   your own IP only temporarily, for migration and bootstrap, and remove it afterwards.
5. Migrate (as `khums-migrator`), from a trusted machine:

   ```bash
   cd apps/api
   ```

   ```bash
   read -rs MONGODB_URI && export MONGODB_URI
   ```

   ```bash
   NODE_ENV=production MONGODB_DATABASE=khums node dist/main.js --migrate-database
   ```

   ```bash
   unset MONGODB_URI; cd ../..
   ```

   Expected JSON: every collection under `created` (first run) or `updated` (later runs), and
   `"policyRegistrySeed": "SEEDED"`. `DIFFERS` means a different registry already exists: stop and
   investigate (it is never overwritten). Exit code non-zero or `not authorized`: the migrator
   role is incomplete.

### 3.2 API host (managed Node.js host)

The API host is still to be chosen (roadmap M4.7). Requirements for any host:

- **Runtime:** Node.js ≥ 24.7 (`crypto.argon2`). HTTPS only, with the host's managed TLS on a
  stable hostname (e.g. `api.<domain>`).
- **Build:** `pnpm install --frozen-lockfile && pnpm --filter @khums/api build`.
- **Start:** `pnpm --filter @khums/api start` (runs `node --enable-source-maps dist/main.js` in
  `apps/api`).
- **Health check:** `GET /api/v1/health`.
- **At least 512 MB memory:** each Argon2id verification uses 64 MiB.
- **Secrets** in the host's secret store only. Do not upload an `.env` file. `.env` is not read when
  `NODE_ENV=production`.

| Variable                   | Value                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                 | `production`                                                                                                                                                             |
| `HOST` / `PORT`            | as the host requires (e.g. `0.0.0.0` / the host's port)                                                                                                                  |
| `MONGODB_URI`              | production Atlas URI of **`khums-app`** (secret)                                                                                                                         |
| `MONGODB_DATABASE`         | `khums`                                                                                                                                                                  |
| `CORS_ORIGINS`             | the exact web origin, e.g. `https://review.<domain>` (no wildcard, no path)                                                                                              |
| `STAFF_AUTH_SECRET`        | `openssl rand -base64 48` (secret)                                                                                                                                       |
| `STAFF_EDGE_SECRET`        | `openssl rand -base64 48` (secret; **the same value** goes to Vercel)                                                                                                    |
| `TRUST_PROXY`              | `false`                                                                                                                                                                  |
| `LOG_FORMAT` / `LOG_LEVEL` | `json` / `info`                                                                                                                                                          |
| `SWAGGER_ENABLED`          | `false`                                                                                                                                                                  |
| `STAFF_COOKIE_SECURE`      | `true` (default)                                                                                                                                                         |
| `KHUMS_OPERATIONAL_STATE`  | `SCHOLAR_REVIEW` for the private scholar deployment (M4.5a); the same value as on Vercel. Unset refuses every provisional action; `DEVELOPMENT` is refused in production |
| never set                  | `STAFF_E2E_FIXTURE_FILE` (refused in production), `AUDIT_CHECKPOINT_SIGNING_KEY` (the server refuses to start)                                                           |

After the first deploy:

```bash
curl -sS https://<api host>/api/v1/health
```

Expected: `{"status":"ok","service":"khums-api",…}`.

### 3.3 Vercel (web)

1. Project settings:
   - Root Directory `apps/web`.
   - Framework preset Next.js. Leave the install and build defaults: Vercel detects the pnpm
     workspace, and workspace packages are compiled by Next.js (`transpilePackages`).
   - Node.js version 24.x.
2. A **stable** domain for the private deployment (e.g. `review.<domain>`). Its origin must equal
   the API's `CORS_ORIGINS`. Preview deployments have other origins and are refused by the API's
   Origin check by design. Verify on the stable domain; do not add wildcard origins.
3. **Deployment Protection:** enable Vercel Authentication for Production and Preview. For the
   automated checks, enable **Protection Bypass for Automation** and keep its secret in your
   password manager.
4. Environment variables (Production, and Preview if used). Using the CLI keeps values out of
   shell history, because `vercel env add` prompts for the value:

   ```bash
   vercel env add KHUMS_API_ORIGIN production
   ```

   ```bash
   vercel env add KHUMS_CLIENT_IP_HEADER production
   ```

   ```bash
   vercel env add STAFF_EDGE_SECRET production
   ```

   | Variable                 | Value                                                         |
   | ------------------------ | ------------------------------------------------------------- |
   | `KHUMS_API_ORIGIN`       | `https://<api host>` (exact origin; no path, no trailing `/`) |
   | `KHUMS_CLIENT_IP_HEADER` | `x-forwarded-for`                                             |
   | `STAFF_EDGE_SECRET`      | the same value as on the API host                             |
   | `NEXT_PUBLIC_SITE_URL`   | `https://review.<domain>`                                     |
   | do **not** set           | `KHUMS_OPERATIONAL_STATE=DEVELOPMENT` (refused on Vercel)     |

5. **Redeploy after any change:** the `/api/v1` rewrite is fixed at build time.

**Failure interpretation:**

- `/api/v1/*` answers `503 Staff API is not configured.`: `STAFF_EDGE_SECRET` or
  `KHUMS_CLIENT_IP_HEADER` is missing on Vercel.
- `/api/v1/*` answers `404`: the build had no `KHUMS_API_ORIGIN`. Set it and redeploy.
- Staff routes answer `503 AUTHENTICATION_UNAVAILABLE`: `STAFF_AUTH_SECRET` or
  `STAFF_EDGE_SECRET` is missing on the API host.

---

## 4. Verify the signed client IP through the actual Vercel rewrite

Background: Vercel overwrites `X-Forwarded-For` at its edge. `apps/web/src/proxy.ts` removes any
client-supplied `x-khums-client-ip*` headers and forwards the edge address with an HMAC signature
(`STAFF_EDGE_SECRET`, timestamp, method, path). The API (`apps/api/src/auth/client-ip.ts`) accepts
only that signature, at most 30 seconds old; otherwise it uses the TCP peer address. It never uses
`X-Forwarded-For`.

Set two shell variables (not secret):

```bash
WEB=https://review.<domain>; API=https://<api host>
```

If Deployment Protection is on, enter the bypass secret silently:

```bash
read -rs BYPASS && export BYPASS
```

**Check A — forged headers through the web origin are ignored** (a non-existent username; only
your own address's counters for it are affected, and they expire within 24 h):

```bash
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code}\n" -X POST "$WEB/api/v1/staff/auth/login" -H "x-vercel-protection-bypass: ${BYPASS:-}" -H "content-type: application/json" -H "origin: $WEB" -H "sec-fetch-site: same-origin" -H "x-forwarded-for: 198.51.100.$i" -H "x-real-ip: 198.51.100.$i" -H "x-khums-client-ip: 198.51.100.$i" -H "x-khums-client-ip-at: $(date +%s)000" -H "x-khums-client-ip-sig: forged" --data '{"username":"verify-nobody-web","password":"definitely the wrong password"}'; done
```

Expected: `401` five times, then `429`. If you get six `401`s, forged addresses are being trusted:
**blocker**, do not continue.

**Check B — direct calls to the API host cannot forge an address either:**

```bash
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API/api/v1/staff/auth/login" -H "content-type: application/json" -H "origin: $WEB" -H "sec-fetch-site: same-origin" -H "x-forwarded-for: 198.51.100.$i" -H "x-khums-client-ip: 198.51.100.$i" -H "x-khums-client-ip-at: $(date +%s)000" -H "x-khums-client-ip-sig: forged" --data '{"username":"verify-nobody-direct","password":"definitely the wrong password"}'; done
```

Expected: `401` ×5, then `429`.

**Check C — the signature actually arrives through Vercel.** Sign in once on `$WEB/en/admin/sign-in`
(or run §5). Then, in the API host's logs, find the line `Staff signed in`.

Expected: `"clientIpSource":"SIGNED_EDGE"`. The log contains the source only, never the address.

If it says `"PEER"`, the rewrite did not carry the signed headers. Vercel does not document whether
Next.js `proxy.ts` header overrides reach an external rewrite destination. In that case the
deployment is **not ready**: IP-level throttling would group all staff behind Vercel's egress
addresses. The fallback (forwarding from a Next.js route handler) needs maintainer approval. Also
check that `STAFF_EDGE_SECRET` is identical on both sides and that the clocks agree within 30 s
(managed hosts sync time).

Cleanup: `unset BYPASS`. The test usernames do not exist; counters expire after 24 h.

---

## 5. Run all five deployed Playwright tests

Prerequisites: §3 deployed, §6 steps 1–2 done (a SUPER_ADMIN exists). Use a **dedicated
verification administrator** if you have more than one; otherwise your SUPER_ADMIN.

```bash
pnpm --filter @khums/web exec playwright install chromium
```

```bash
export STAFF_VERIFY_BASE_URL=https://review.<domain>
```

```bash
read -rs STAFF_VERIFY_ADMIN_USERNAME && export STAFF_VERIFY_ADMIN_USERNAME
```

```bash
read -rs STAFF_VERIFY_ADMIN_PASSWORD && export STAFF_VERIFY_ADMIN_PASSWORD
```

```bash
read -rs VERCEL_AUTOMATION_BYPASS_SECRET && export VERCEL_AUTOMATION_BYPASS_SECRET
```

```bash
pnpm --filter @khums/web test:deployed
```

**Expected: `5 passed`.**

1. `the /api/v1 rewrite reaches the API`.
2. `sign-in sets first-party __Host- cookies through the rewrite`: the session, CSRF and device
   cookies arrive with HttpOnly (except CSRF), Secure, SameSite=Strict, Path=/, host-only.
3. `cookies are forwarded and Origin, Sec-Fetch-Site and X-CSRF-Token reach the API`:
   - missing token → 403 `CSRF_REJECTED`;
   - browser request with the token → 400 `VALIDATION_FAILED` (passed every CSRF layer, nothing
     changed);
   - cross-site request with cookies and token → 403.
4. `a client cannot spoof its IP`: five forged addresses → 401 each, sixth → 429.
5. `first scholar workflow`: creates `verify-scholar-<time>`, signs in with the temporary password,
   is forced to change it, reaches the console; the account is then **deactivated** and its session
   ends.

`5 skipped` means a variable is missing or the URL is not https.

**Failure interpretation:**

| Failing test | Likely cause                                                                                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1            | Rewrite missing (no `KHUMS_API_ORIGIN` at build), API down, or protection bypass missing (a 401/redirect page).                                                                                                                                       |
| 2            | Login refused: wrong credentials, `CORS_ORIGINS` ≠ the web origin (403 `CSRF_REJECTED`), or the account is throttled. Cookies missing or without `__Host-`: `STAFF_COOKIE_SECURE` is not true, or `Set-Cookie` was stripped by the rewrite (blocker). |
| 3            | 403 where 400 was expected: Origin, Sec-Fetch-Site or the token header did not reach the API (blocker). 2xx on the cross-site request: CSRF enforcement broken (blocker).                                                                             |
| 4            | Six 401s: forged addresses trusted (blocker). An early 429: run again after 15 minutes (earlier attempts from your IP).                                                                                                                               |
| 5            | Stuck on the password page: password policy (the generated password is long; check API logs for the code). Still signed in after deactivation: revocation broken (blocker).                                                                           |

**Cleanup:**

- The scholar account is deactivated by the test. If the test was interrupted, deactivate any
  remaining `verify-scholar-*` account (§6 snippet, `status: "DEACTIVATED"`).
- Clear the variables:

  ```bash
  unset STAFF_VERIFY_ADMIN_USERNAME STAFF_VERIFY_ADMIN_PASSWORD VERCEL_AUTOMATION_BYPASS_SECRET STAFF_VERIFY_BASE_URL
  ```

---

## 6. First SUPER_ADMIN bootstrap and first scholar account

### 6.1 Bootstrap (once, interactive)

On a trusted machine with a build of the deployed commit. Temporarily add your IP to the production
Atlas Network Access list, and remove it afterwards.

```bash
cd apps/api
```

```bash
read -rs MONGODB_URI && export MONGODB_URI
```

(Enter the **`khums-app`** URI. The bootstrap writes only staff, control and audit records.)

```bash
NODE_ENV=production MONGODB_DATABASE=khums node dist/main.js --bootstrap-super-admin <username>
```

- It asks `New SUPER_ADMIN password:` and `Repeat the password:` with echo off. Use a long
  passphrase (≥ 12 characters, not containing the username), generated or stored in your password
  manager.
- Expected output: `{ "principalId": "<uuid>", "role": "SUPER_ADMIN" }`. Nothing else is printed.
- Run the same command again. Expected: `{ "error": "ALREADY_BOOTSTRAPPED" }` **before** any
  password prompt.

```bash
unset MONGODB_URI; cd ../..
```

**Failure interpretation:**

| Output                                | Meaning                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `INTERACTIVE_TERMINAL_REQUIRED`       | Not a real terminal (piped or CI). Run it in an interactive terminal.                          |
| `PASSWORDS_DO_NOT_MATCH`              | Retry. Nothing was written.                                                                    |
| `PASSWORD_POLICY_VIOLATION` + `issue` | Choose a password that meets the policy. Nothing was written.                                  |
| `USERNAME_INVALID`                    | 3–64 characters: letters, digits, `.`, `_`, `-`.                                               |
| `ALREADY_BOOTSTRAPPED` on first run   | A bootstrap record or SUPER_ADMIN already exists in this database. Investigate; never "reset". |
| `MONGODB_URI is required`, timeouts   | Variable not exported, or your IP is not allowed in Atlas.                                     |

### 6.2 Sign in and create the first scholar

There is no account-management UI until M4.6.5. Use the signed-in console's browser DevTools, on your
own trusted machine:

1. Open `https://review.<domain>/en/admin/sign-in` and sign in as the SUPER_ADMIN. The console shows
   `SUPER_ADMIN` and no authoring, review or approval permission.
2. Open DevTools → Console on that page and run (replace the username):

   ```js
   const csrf = document.cookie
     .split('; ')
     .find((c) => c.startsWith('__Host-khums_csrf='))
     ?.split('=')[1];
   const post = (path, body) =>
     fetch(`/api/v1${path}`, {
       method: 'POST',
       headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
       body: JSON.stringify(body),
     }).then(async (r) => ({ status: r.status, body: await r.json() }));
   const created = await post('/admin/staff/accounts', {
     username: 'scholar-username',
     reason: 'First scholar account',
   });
   console.log(created.status, created.body);
   ```

   Expected: `201` with `principalId`, `username`, `temporaryPassword` and
   `temporaryPasswordExpiresAt` (72 h). **The temporary password is shown only once.**

3. Grant the governing role for the scholar's Marja (catalogue id, e.g. `sistani`):

   ```js
   const granted = await post(`/admin/staff/accounts/${created.body.principalId}/roles`, {
     role: 'GOVERNING_SCHOLAR',
     scope: { kind: 'MARJA', marjaIds: ['sistani'] },
     reason: 'First governing scholar',
   });
   console.log(granted.status, granted.body.roles);
   ```

   Expected: `200`, roles `[{ role: 'GOVERNING_SCHOLAR', scope: { kind: 'MARJA', marjaIds: ['sistani'] } … }]`.

4. **Hand over the temporary password safely.**
   - Use a separate trusted channel: in person or by phone.
   - Never send it in the same message as the username, and never by email or chat in plain text.
   - Then clear the console (`console.clear()`) and close DevTools.
5. The scholar signs in at `/en/admin/sign-in` and is taken to **Change password**. The temporary
   password cannot be kept, and the new one must meet the policy. They then see `GOVERNING_SCHOLAR`
   with their Marja.

**Failure interpretation:**

- `403 CSRF_REJECTED`: run the snippet on the deployed console page itself, so the origin matches.
- `409 USERNAME_TAKEN`: choose another username.
- `422 SCOPE_INVALID`: the Marja id is not in the catalogue, or the scope kind is not `MARJA`.
- `409 ROLE_INCOMPATIBLE`: the target holds SUPER_ADMIN; religious roles can never be combined
  with it.
- `403 ACCESS_DENIED`: the signed-in account is not a SUPER_ADMIN, or it is trying to administer
  itself.
- An expired temporary password (`TEMPORARY_PASSWORD_EXPIRED`): issue a new one with
  `post('/admin/staff/accounts/<id>/password-reset', { reason: '…' })`.

**Cleanup:** remove your IP from the production Network Access list; close the DevTools console;
keep the bootstrap principal id with your deployment records (it is not secret).

---

## 7. Reporting results to the maintainer

Report, without any secrets:

- the commit hash;
- the outputs of §2 (`Tests 15 passed`), §4 (status code sequences A and B, and the
  `clientIpSource` value), §5 (`5 passed`) and §6 (the two bootstrap outputs, minus the principal id
  if preferred);
- any deviation from the expected results.

---

## 8. Production hosting and infrastructure entry criteria

> **M4.7 private scholar review (owner decision 2026-11-22)** runs on free hosting (Vercel Hobby,
> Render Free, the existing Atlas M0) with its own readiness criteria:
> `docs/DEPLOYMENT_FREE_TIER.md` §10.1. The criteria below remain **mandatory for production**
> (the public launch and any authoritative calculation); none of them is relaxed.

For production, **all** of the following must be done and verified, together with the
roadmap's scholar deployment gate (provisional mode M4.5a, feedback and audit M4.6.4/M4.5.2, admin
console M4.6.5, actual sourced proposed rule packs; `docs/DEVELOPMENT_ROADMAP.md`).

**Verification of M4.6.3a/M4.6.2b (this runbook)**

1. §2: all 15 live Atlas tests pass in the isolated `khums_test_live` database.
2. §4: checks A and B return `401 ×5, 429`, and check C shows `clientIpSource: SIGNED_EDGE` on the
   real Vercel deployment.
3. §5: all 5 deployed Playwright tests pass on the stable private domain.
4. §6: bootstrap done once (the second run is refused) and the first scholar is created with a safe
   handover.

**Hosting**

5. Vercel:
   - a private project on a stable custom domain;
   - Deployment Protection on Production and Preview;
   - the §3.3 variables set;
   - `KHUMS_OPERATIONAL_STATE=SCHOLAR_REVIEW` only once M4.5a exists (never `DEVELOPMENT`).
6. API host:
   - managed Node.js ≥ 24.7, HTTPS only;
   - secrets only in its secret store, with the §3.2 variables;
   - Swagger off, JSON logs retained for at least 90 days, health checks;
   - at least 512 MB memory per instance.
7. MongoDB Atlas production:
   - a dedicated project, separate from the test project;
   - a dedicated-tier cluster with Cloud Backup / point-in-time restore enabled;
   - encryption at rest (Atlas default);
   - Network Access restricted to the API host (static egress or private networking);
   - the custom roles `khumsApp`, `khumsMigrator` and `khumsCheckpoint`, one user each;
   - project owners named and kept to a minimum;
   - migration run and policy registry `SEEDED`.

**Integrity checkpoints (decision 39; `AUTH_ARCHITECTURE.md` §4.11)**

8. **KMS signing key:**
   - an asymmetric Ed25519 signing key that cannot be exported, in a cloud KMS (for example AWS KMS
     key spec `ECC_NIST_EDWARDS25519`, or Google Cloud KMS `EC_SIGN_ED25519`);
   - the checkpoint job's workload identity may only **sign** with it;
   - key administrators are not Atlas project owners;
   - deletion protection on, and key usage logged (CloudTrail or Cloud Audit Logs).

   A `CheckpointSigner` implementation for that KMS is still to be written (the port exists; the
   current signer reads a PEM key). Building it needs approval as part of hardening.

9. **Trusted public key:**
   - export the KMS public key (SPKI PEM);
   - add it to `apps/api/src/integrity/checkpoint-keys.ts` with its `keyId` and `validFrom`, through a
     reviewed commit;
   - record the rotation and revocation procedure (new `keyId`; `validUntil` on the old key;
     `revokedAt` on compromise).
10. **Independent WORM archive:**
    - object storage with Object Lock in **compliance** mode (for example S3 Object Lock), in a
      **separate cloud account** administered by people who are not database administrators;
    - versioning on, and default retention set by the maintainer (recommended at least 10 years for
      governance records);
    - the checkpoint job may only put objects there (no delete, no retention changes);
    - an archive writer is still to be built (the job currently prints checkpoints for copying).
11. **Checkpoint job:**
    - scheduled at least hourly and after every governance publication;
    - runs with the `khums-checkpoint` user, and verifies every chain before signing (it never signs
      a broken chain);
    - writes to `auditCheckpoints` and to the archive;
    - alerts on failure;
    - a separate scheduled `--verify-integrity <archive copy>` run alerts on any non-`VERIFIED`
      outcome.
12. **Fail-closed behaviour confirmed in production:**
    - staff routes answer 503 without the database or the secrets;
    - the API refuses to start with `AUDIT_CHECKPOINT_SIGNING_KEY` in its environment;
    - integrity verification fails with no trusted keys;
    - append-only and least-privilege guarantees unchanged (no role can update or delete history).

Items 8–11 are recorded in `docs/DEVELOPMENT_ROADMAP.md` (scholar deployment gate) and need
implementation work (KMS signer, archive writer, scheduled job). That work starts only with
maintainer approval, after the live verification of items 1–4.
