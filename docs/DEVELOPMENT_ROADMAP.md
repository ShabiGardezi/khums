# Development Roadmap

Milestones are sequential gates: a milestone is done only when its exit criteria pass in CI and
any required approvals are recorded.

| #   | Milestone                                               | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Project foundation (incl. 1.1 backend)                  | ✅ Done                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2   | Religious research & rules specification                | Docs frozen (2026-11-20). Human research and scholar review run **in parallel**; required before launch (Gate R)                                                                                                                                                                                                                                                                                                                                                               |
| 3   | Calculation engine foundation                           | ✅ Done (2026-11-20). Generic, rule-pack-driven; mock packs only                                                                                                                                                                                                                                                                                                                                                                                                               |
| 4   | Rule packs (data) & verified test cases                 | Tooling/format can proceed with mock packs; **real rule content blocked on Gate R**                                                                                                                                                                                                                                                                                                                                                                                            |
| 5   | Web MVP (Step 4: sub-milestones M4.1–M4.8)              | **In progress.** M4.1, M4.2.1 approved; M4.2.2 (localization) and M4.2.3 approved; M4.2.4 approved; M4.3 approved; M4.4.1 closed; M4.4.2 (rule-pack integrity, FR-1) done; M4.4.3 (rule-pack governance) done; M4.6.0 auth architecture and M4.6.1 authorization engine complete (2026-11-20); M4.6.2 Auth0 identity integration partially complete (2026-11-20); single-scholar governance stages 1–4 done (2026-11-21); revised launch strategy approved (2026-11-21, below) |
| 6   | API, accounts & optional cloud sync                     | Planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 7   | Admin rule-management console                           | Planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 8   | Mobile app (Expo)                                       | Planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 9   | Hardening, **religious approval gate (Gate R)**, launch | Planned — launch impossible without Gate R                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Phases (2026-11-24):** Phase 2 (scholar rule builder, source verification, automatic
publication; `docs/PHASE2_PLAN.md`) and Phase 3 (public calculator; `docs/PHASE3_PLAN.md`) are
implemented, uncommitted. **Phase 4** — AI-researched rules for `sistani` and `khamenei` across the
annual, first-time and missed-year assessments, through the Rule Builder, ready for scholar
testing (decisions 74–76) — is planned in `docs/PHASE4_PLAN.md` and awaits the owner's approval.

## Religious review: a mandatory pre-launch gate, not a development blocker

**Decision (2026-11-20, project owner):** technical and UI development proceeds now. Scholar
review happens once the application is substantially complete, **before production launch**.

- Development uses only rule packs marked `isMock: true` ("MOCK / NOT FOR PRODUCTION"). The engine
  labels every such result `NOT_RELIGIOUS_GUIDANCE` and refuses them in production mode.
- **Gate R (mandatory, pre-launch):** no production release until, for each Marja offered:
  - the human verification and research in `docs/research/` is complete;
  - the rule pack is scholar-reviewed and approved by a separate approver;
  - the pack is published and activated;
  - the engine's production readiness check reports no issues.
- The release evidence policy (`docs/research/RULE_PACK_STRUCTURE.md` §3.3) applies at Gate R:
  directory visibility, historical archive and calculation are separate approvals.
- Nothing built before Gate R may present a mock calculation as religious guidance.
- **Gate R also requires** the future requirements FR-1…FR-5 recorded in
  [research/RULE_PACK_STRUCTURE.md §9](research/RULE_PACK_STRUCTURE.md#9-future-requirements-recorded-in-revision-5)
  to be met:
  - FR-1: content-hash verification;
  - FR-2: authenticated reviewer and approver identities;
  - FR-3: immutable published versions and approval history;
  - FR-4: safe modelling of liabilities, deductions and adjustments;
  - FR-5: engine coverage of every research scenario.

> **Amendment (owner decision, 2026-11-21).** The 2026-11-20 decision above stays on record. Two
> parts of it are amended, not erased:
>
> 1. "Approved by a separate approver" now means "approved under the governance policy bound to the
>    pack version": `INDEPENDENT_REVIEW_V1` (separate reviewer and approver) or `SINGLE_SCHOLAR_V1`
>    (one in-scope governing scholar). See `docs/AUTH_ARCHITECTURE.md`.
> 2. Scholar review no longer waits for a finished release: the complete application is deployed
>    privately for the scholar first (see "Revised launch strategy" below). Gate R still decides
>    **public** authoritative calculations; nothing else about it is weakened.
>
> **Amendment (owner decision, 2026-11-22).** Independent scholar ownership: one authorized scholar
> for the Marja may research, verify, author and approve its rules alone; no second researcher,
> second scholar or separate approver is required for Gate R either
> (`docs/research/REVIEW_PROCESS.md` §16). Source, translation and attribution verification remain
> required.

## Revised launch strategy (owner decision, 2026-11-21)

**Deploying the software for testing is not approving its religious calculations.**

| Operational state     | Where                                 | Who                                    | Rule packs                                                                                                                                                  | Results                                                                                         |
| --------------------- | ------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `DEVELOPMENT`         | Local machines and CI                 | Engineers                              | Mock fixtures only (`isMock: true`)                                                                                                                         | `NOT_RELIGIOUS_GUIDANCE`, MOCK notice                                                           |
| `SCHOLAR_REVIEW`      | One private Vercel deployment         | Authenticated, authorized staff only   | Scholar-review packs (`releaseChannel: 'SCHOLAR_REVIEW'`): actual proposed, sourced rules                                                                   | **PROVISIONAL — FOR SCHOLAR REVIEW ONLY**                                                       |
| `PRODUCTION_APPROVED` | The same project on the public domain | Everyone (staff routes stay protected) | Production packs only: scholar-approved, published, activated, governed readiness passes; signed-in staff also test scholar-review packs here (decision 65) | Authoritative (`APPROVED_RULE_PACK`); staff-only provisional results keep the PROVISIONAL label |

**Workflow.**

1. Complete the application.
2. Deploy it to Vercel (web) with the NestJS API on a managed Node.js host, MongoDB Atlas and Auth0,
   in `SCHOLAR_REVIEW`.
3. The whole application requires Auth0 sign-in, MFA and an explicit staff account (production and
   preview deployments). Public registration is disabled. The unlisted URL is not an access control.
4. The scholar uses the complete application: Marja selection, financial inputs, actual proposed
   calculations, results, explanations and feedback reports.
5. Fixes are made as new pack versions; the scholar runs a second complete review.
6. After the scholar confirms the relevant calculations, final approval produces `PRODUCTION`
   versions through governance; they must pass every production-readiness check (Gate R).
7. Buy the domain, connect it to Vercel and switch to `PRODUCTION_APPROVED`.

**Safeguards (approved).**

- The operational state is enforced server-side (web and API). Provisional packs are never in the
  public client bundle and are served only to authenticated, authorized staff — in
  `SCHOLAR_REVIEW` and, since decision 65 (one deployment), in `PRODUCTION_APPROVED` behind the
  staff sign-in; the public calculator serves only governed, activated, ready `PRODUCTION` packs,
  and the engine refuses scholar-review packs in production mode by channel and readiness.
  Public users may keep results on their own device only (browser-only history, opt-in).
- Scholar-review packs: rule status `UNVERIFIED` or `APPROVED`, never `DRAFT`; every rule sourced.
  An approved rule never makes its pack authoritative. A scholar-review pack never becomes a
  production pack; approval creates a new `PRODUCTION` version (new content hash).
- Provisional enable/disable: in-scope `GOVERNING_SCHOLAR` enables and disables; in-scope
  `SCHOLAR_REVIEWER` disables only; `PLATFORM_ADMIN` emergency-disables only (never enables or
  approves); `AUDITOR` reads only. Disabling takes effect on the next request.
- Pack `schemaVersion` 3 adds `releaseChannel`; versions 1 and 2 remain readable; no historical pack
  is migrated or re-hashed.
- Proposed rule content comes only from sourced research findings authored by the research team;
  never from AI.

**Sequencing adjustments (owner decision, 2026-11-21).**

- **M4.6.2 MFA verification gates scholar access, not development.** The real-tenant confirmation
  of the MFA factor evidence must pass before any scholar account is granted access (an M4.7
  entry criterion). Independent work (M4.5, M4.5a, M4.6.3–M4.6.5) proceeds meanwhile.
- **Documentation moves with each milestone.** Every milestone updates the architecture, security
  and implementation documents it affects (AUTH_ARCHITECTURE, ARCHITECTURE, SECURITY,
  RULE_PACK_STRUCTURE revisions with archived predecessors, RELIGIOUS_RULES, REVIEW_PROCESS,
  package READMEs) as part of its exit criteria. There is no separate documentation phase.
- Religious source research continues in parallel; no unsourced ruling is implemented.

**Staff authentication change (owner decision, 2026-11-21; ARCHITECTURE decisions 36–37).** Staff
sign in with NestJS username/password instead of Auth0; mandatory MFA is removed. The M4.6.2 MFA
verification item above is therefore **superseded** (kept on record); Auth0/Google Sign-In remains
the future public-user option. Revised Step 4 sequence and dependencies:

| Step | Milestone                                                                                                                                                                                                                                                                                                               | Depends on       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1    | **M4.5.1** ✅ results dashboard with the development-only web mock module (complete 2026-11-21; never used for scholar review or production)                                                                                                                                                                            | M4.4             |
| 2    | **M4.6.3a** ✅ (accepted 2026-11-21; live Atlas tests before production) persistence foundation: MongoDB Atlas connection, repositories with in-memory test adapters, insert-only append collections (unique sequence indexes, idempotent retries), least-privilege roles, audit chain and signed integrity checkpoints | —                |
| 3    | **M4.6.2b** ✅ (implemented 2026-11-21, awaiting review) staff username/password authentication: sessions, CSRF, rate limiting, temporary passwords, SUPER_ADMIN bootstrap, `SINGLE_ADMIN_V1`, verified Vercel rewrite cookie behaviour, removal of the Auth0 staff path                                                | M4.6.3a          |
| 4    | **M4.5a** (implemented 2026-11-21, awaiting review) operational states and provisional track: API `KHUMS_OPERATIONAL_STATE`, pack `schemaVersion` 3 `releaseChannel`, engine `scholar-review` mode and gate, provisional pack records, enable/disable, provisional calculations, feedback foundations, permissions      | M4.5.1, M4.6.3a  |
| 5    | **M4.6.4a** (implemented 2026-11-21, awaiting review) governance API: pack ledgers and commands, write-once pack content, session-derived actors, policies, audit reads. **M4.6.4b** (provisional enable/disable and feedback API) was delivered as part of M4.5a's API foundations                                     | M4.6.2b, M4.5a   |
| 6    | **M4.5.2** (implemented 2026-11-21, awaiting review) scholar review results experience: provisional results, breakdown with rules and sources, feedback and status, history, print-to-PDF reports, en/ur                                                                                                                | M4.5.1, M4.6.4   |
| 7    | **M4.6.5** (implemented 2026-11-21, awaiting review) admin console: accounts, roles and Marja scopes, sessions, policies, governance lifecycle, provisional packs, team history, feedback, audit viewer                                                                                                                 | M4.6.4           |
| 8    | Security hardening for the private deployment (part of M4.10)                                                                                                                                                                                                                                                           | 1–7              |
| 9    | **M4.7** private scholar-review deployment                                                                                                                                                                                                                                                                              | everything below |
| 10   | Scholar rounds 1 and 2, then **M4.8** public launch (Gate R)                                                                                                                                                                                                                                                            | M4.7, research   |

**Scholar deployment gate (M4.7 entry criteria).** No scholar receives access until all of these are
done and verified: staff authentication (M4.6.2b) with tested session, CSRF and rate-limit
behaviour through the real Vercel rewrite; the live Atlas suite and the real-deployment staff verification passing (`docs/DEPLOYMENT_VERIFICATION.md`, including `clientIpSource: SIGNED_EDGE`); durable persistence (M4.6.3a) with signed integrity checkpoints produced by the KMS-backed
checkpoint job and archived to the independent WORM store; provisional mode with
server-side state enforcement (M4.5a); feedback reporting and audit (M4.6.4/M4.5.2); the admin
console for account and scope management (M4.6.5); and **actual sourced proposed rule packs**
authored by the research team for the Marjas under review. Mock packs are never part of it.

> **Revision 2026-11-22 (owner decision):** the private scholar-review deployment runs on free
> hosting (Vercel Hobby, Render Free, the existing Atlas M0). For it, KMS signing, the WORM archive
> and a dedicated cluster are replaced by offline Ed25519 signing with an append-only local archive
> and encrypted manual backups (`docs/DEPLOYMENT_FREE_TIER.md` §6, §7, §10.1). KMS, WORM and a
> dedicated tier remain **production** requirements (`docs/DEPLOYMENT_VERIFICATION.md` §8).

--- | ----------------------------------------- | ----------------------------------------------------------------------- |
| 1 | Project foundation (incl. 1.1 backend) | ✅ Done |
| 2 | Religious research & rules specification | Research docs frozen (2026-11-20); Phase A awaits named human reviewers |
| 3 | Domain model, decimal money & engine core | Planned |
| 4 | First rule sets & verified test cases | Planned |
| 5 | Web MVP | Planned |
| 6 | API, accounts & optional cloud sync | Planned |
| 7 | Admin rule-management console | Planned |
| 8 | Mobile app (Expo) | Planned |
| 9 | Hardening, launch & post-launch | Planned |

---

### Milestone 1 — Project foundation

Monorepo (Turborepo + pnpm), strict TypeScript, ESLint/Prettier, Vitest/Playwright, CI, package
boundaries, documentation, minimal Next.js shell.
**Exit:** install, lint, typecheck, test, boundary check and web production build pass.

### Milestone 1.1 — Shared backend & financial precision foundation ✅

- NestJS 12 API in `apps/api`: `/api/v1` prefix, Zod-validated env config, global Zod validation
  pipe, RFC 9457 error filter, Swagger/OpenAPI, health endpoint, CORS from env, helmet, pino
  structured logging, graceful shutdown, Vitest unit + integration tests.
- Shared API contracts in `@khums/validation`; `@khums/api-client` for web and mobile; committed
  `apps/api/openapi.json` with a drift test.
- `@khums/money`: exact `Decimal`/`Money` over decimal.js, explicit rounding modes, ISO 4217
  minor units, formatting kept separate.
- Boundary checks for server-only deps, decimal.js ownership and API contract duplication.
  **Exit:** `pnpm check`, API build/tests, health smoke test and web build pass.

### Milestone 2 — Religious research & rules specification

Plan, matrix, source inventory, rule-pack proposal and review process:
[research/README.md](research/README.md). Exit criteria:
[research/RESEARCH_PLAN.md §8](research/RESEARCH_PLAN.md#8-exit-criteria-for-step-2-milestone-2).

- Select launch Maraje; identify canonical sources and reviewers.
- Catalogue every Khums concept the calculator needs (liable items, exemptions, year definition,
  deductions, debts, gifts/inheritance, gold/silver handling, currency, rounding, consultation
  cases) _per Marja_, each with citations.
- Define the rule-set data schema (JSON + Zod) and the trace format.
- Draft reviewer-verified worked examples.
  **Exit:** written specification approved by the scholarly reviewer(s); open questions logged.
  No code depends on unapproved content.

### Milestone 3 — Calculation engine foundation ✅ (approved 2026-11-20)

Done:

- Shared contracts (`@khums/shared-types`) and Zod schemas (`@khums/validation`) for rule packs,
  inputs, results and activations.
- `@khums/calculation-engine`: a generic rule-pack interpreter with no embedded formulas.
  - annual, first-time and missed-year workflows;
  - structure validation and input validation;
  - a production readiness gate and activation eligibility;
  - traceable breakdowns, unresolved and consultation cases.
- Tests use MOCK packs only; engine coverage is enforced at ≥ 95%.
- The calculation vocabulary is documented as **provisional and non-authoritative**
  ([RULE_PACK_STRUCTURE.md §5.6](research/RULE_PACK_STRUCTURE.md#56-provisional-technical-calculation-vocabulary-revision-5)).

Carried forward (not done in M3):

- `core` use cases and port interfaces → M4/M5.
- Running engine tests in a browser-like environment, in addition to Node → M5.
- Property-based tests for `@khums/money`; exchange-rate and weight types, if research needs them → M4.

### Milestone 4 — Rule-pack tooling, first rule packs & verified test cases

Can proceed before Gate R (with MOCK packs):

- **FR-1:** canonical pack serialization and content-hash verification in `core`/tooling,
  required before any activation.
- **FR-3 (CI part):** CI rejects modification of published pack versions; approval and activation
  records are append-only.
- **FR-4:** review the input model for liabilities, deductions and adjustments (no unsafe
  negative-amount conventions); extend contracts as research requires.
- Rule-pack loading in `core`: Zod validation → structure validation → hash verification.

Blocked on Gate R (real content):

- Encode approved rules for the launch Marja in `@khums/marja-rules`; scholar reviewers confirm the
  encoded programs.
- **FR-5:** a coverage matrix linking research questions and findings to engine constructs and
  reviewer-verified test cases. Every scenario must be expressible exactly or handled by a
  consultation stop.
  **Exit:** scholarly sign-off recorded in each `REVIEW.md`; FR-1, FR-3 (CI), FR-4 done.

### Milestone 5 — Web MVP

Delivered as **Step 4**, in sub-milestones (each reviewed before the next starts; the "M4.x" names
are Step 4 sub-milestones, not roadmap Milestone 4):

> **Numbering (owner decision, 2026-11-20):** M4.5 is results dashboard and PDF reports
> (unchanged). M4.6 is governance authentication and authorization (M4.6.0–M4.6.5, below). Local
> persistence and history is M4.7, and quality and release readiness is M4.8.
>
> **Renumbering (owner decision, 2026-11-21, revised launch strategy):** a new M4.5a adds the
> operational states and provisional track; M4.7 becomes the private scholar-review deployment and
> M4.8 the public launch. The former M4.7 (local persistence) and M4.8 (quality and release
> readiness) become **M4.9** and **M4.10**; their scope is unchanged. Completed sub-milestones keep
> their names.

| Sub-milestone | Scope                                                                                                                                                                                                                                                                                                          | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M4.1          | Web foundation & design system: tokens, shared components, responsive shell                                                                                                                                                                                                                                    | ✅ Done (awaiting review)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| M4.2          | Landing page & onboarding (preferences, Marja selection, assessment type)                                                                                                                                                                                                                                      | In progress — M4.2.1 landing ✅ approved; M4.2.2 localization (English + Urdu, RTL) done; M4.2.3 onboarding intro + Marja selection ✅ approved; M4.2.4 assessment type selection ✅ approved; M4.2.5 next                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| M4.3          | Assessment workflows & financial input components                                                                                                                                                                                                                                                              | In progress — M4.3.1 financial input domain model ✅ approved (currency semantics, input policy and approximate dates clarified; FR-M1 measurements recorded as future work); M4.3.2 financial fact entry UI ✅ approved; M4.3.3 review and local JSON export ✅ approved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| M4.4          | Calculation integration (engine + MOCK packs, traces, unresolved cases)                                                                                                                                                                                                                                        | In progress — M4.4.1 fact mapping ✅ closed; M4.4.2 integrity (FR-1) done; **M4.4.3 governance ledger: approval, publication, immutability (domain level; no auth/DB) done, awaiting review**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| M4.5          | Results dashboard & PDF reports (incl. mock / provisional / approved labels and scholar feedback form)                                                                                                                                                                                                         | In progress — **M4.5.1 ✅ complete (owner, 2026-11-21): development-only MOCK results dashboard** (`KHUMS_OPERATIONAL_STATE=DEVELOPMENT` only; never hosted; isolated from `SCHOLAR_REVIEW` and `PRODUCTION_APPROVED` by server-side gate and tests); M4.5a provisional track implemented (awaiting review); **M4.5.2** scholar review results experience implemented 2026-11-21, awaiting review (provisional results with breakdown, rules and sources; feedback and status; history of calculation records; print-to-PDF reports; English and Urdu)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| M4.5a         | Operational states & provisional track: `KHUMS_OPERATIONAL_STATE`, pack `releaseChannel` (schemaVersion 3), scholar-review calculation mode and readiness, provisional enable/disable records, permissions                                                                                                     | Implemented 2026-11-21, awaiting review: server-side state in the API, `schemaVersion` 3, `scholar-review` engine mode and gate, strict channel separation, provisional pack records (register once, enable/disable, emergency stop), provisional calculations with records (no figures), feedback submit/read/respond, `ProvisionalCalculationNotice`. Live Atlas run of the new collections pending; web results wiring and reports in M4.5.2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| M4.6          | Governance authentication & authorization                                                                                                                                                                                                                                                                      | In progress — **M4.6.0** architecture (`docs/AUTH_ARCHITECTURE.md`) ✅ complete; **M4.6.1** centralized authorization engine ✅ complete (policies approved 2026-11-20); **M4.6.2** trusted identity integration (Auth0; FR-2) — superseded for staff; **M4.6.3a** persistence foundation ✅ accepted (live Atlas integration tests required before production); **M4.6.2b** staff username/password authentication ✅ accepted at code/test level 2026-11-21; hardening pass (signed client IP, device-cookie lockout protection, transaction retries, live Atlas and deployment verification suites) done, awaiting review; live Atlas run passed (12/12, 2026-11-21) and real-deployment verification pending (`docs/DEPLOYMENT_VERIFICATION.md`); **M4.6.4a** governance API (verified `STAFF_PRINCIPAL` ledger actors, write-once pack content, atomic ledger + content + audit) implemented 2026-11-21, awaiting review and its live Atlas run; **M4.6.4b** provisional/feedback API delivered within M4.5a; **M4.6.5** staff console implemented 2026-11-21, awaiting review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| M4.7          | Private scholar-review deployment on free hosting (2026-11-22): Vercel Hobby (web, whole-application private gate), Render Free Docker/Node 26 (API, edge-signature enforcement), existing Atlas M0; `SCHOLAR_REVIEW` state; offline checkpoint signing and encrypted backups (`docs/DEPLOYMENT_FREE_TIER.md`) | Phase 1 (local code) implemented 2026-11-22, uncommitted; Phase 2 (Atlas roles) deferred by the owner; Phases 3–5 (Render, Vercel, onboarding) await approval                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| M4.8          | Public launch: final scholar approval, `PRODUCTION` packs through governance, governed readiness, domain, `PRODUCTION_APPROVED`                                                                                                                                                                                | Planned (2026-11-21; formerly "Quality & release readiness", now M4.10); blocked on Gate R                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| M4.9          | Local persistence & history (behind a repository interface)                                                                                                                                                                                                                                                    | Planned (was M4.7 until 2026-11-21)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| M4.10         | Quality & release readiness (e2e, a11y, responsive, performance, security, docs)                                                                                                                                                                                                                               | Planned (was M4.8 until 2026-11-21); the security and accessibility parts needed for M4.7 are done before M4.7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| M5.3          | Scholar research management (docs/SCHOLAR_RESEARCH_ARCHITECTURE.md)                                                                                                                                                                                                                                            | M5.3.1–M5.3.3 implemented, acceptance review passed 2026-11-22; **M5.3.4 findings and first-version rulings, M5.3.5 ruling versions and supersession, M5.3.6 rule-pack ruling references with in-pack provenance: ✅ complete (final acceptance review passed 2026-11-22)**. Atlas research collections migrated and verified 2026-11-22; **M5.3.7 web research workspace implemented 2026-11-22, awaiting review**. Next: governing-scholar accounts and real research for `sistani` and `khamenei`; M5.3.8 not started                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| M5.4          | Review infrastructure for Sistani and Khamenei (ARCHITECTURE §11 #59)                                                                                                                                                                                                                                          | Implemented 2026-11-23, awaiting review: derived rule review statuses (API, calculator, rule details, research workspace), per-Marja scholar-review packs with review stops only (no rulings encoded), technical test scenarios, Khamenei/Sistani isolation tests. **No rule is source-verified by a scholar yet**: every rule is PARTIALLY_VERIFIED or SOURCE_UNVERIFIED and every calculation stops for review. Inputs completed 2026-11-23: descriptive entry types for every case in the M5.4 brief (freelance, bonus, pension, charity received, home, land, jewellery, personal items, business equipment, digital assets, joint ownership, mixed funds, business debt, unpaid Khums, religious duties) and combined scenarios for both Marjas. Provisional transcriptions 2026-11-23 (ARCHITECTURE §11 #60): both calculators produce PROVISIONAL figures from explicit published rulings for earnings, gifts, inheritance, debts, mined products, treasure, diving gems and mixed property, with the Imam’s and sayyids’ halves, plus (Sistani) business lines, unpaid khums on inheritances, pensions, donations, sale gains and khums already paid, and (Khamenei) earlier debts, bank profit within inflation, first-time assessments and missed years (inflation and individual settlements stay review items); Sistani first-time assessments by Tawdih Jami’ 736–744 (pack 0.3.0, after the frozen audit of 0.2.0); audit corrections in pack 0.4.0 and engine 0.2.0 (ARCHITECTURE §11 #60–61), awaiting a fresh independent re-audit; everything needing interpretation stops for review. Next: governing-scholar accounts, scholar review of the transcriptions, and research records |

- Design system (shadcn/ui), i18n framework with RTL support, onboarding, first-time and annual
  flows, result breakdown with trace and citations, local encrypted storage, export/print.
- Accessibility audit (WCAG 2.2 AA), Playwright journeys, CSP and security review.
  **Exit:** MVP scope in `PRD.md` complete; beta with reviewers; launch.

### Milestone 6 — API, accounts & optional cloud sync

- **FR-2 (part):** authentication and authorization foundation for reviewer and approver identities.
- **FR-3 (storage):** immutable storage of published packs and append-only approval and activation history.

- Feature modules on the existing API foundation (see `apps/api/README.md`): auth provider
  integration, MongoDB Atlas via Mongoose (`shared/database`, readiness check), sync protocol,
  server-side result re-verification, rate limiting, audit logs.
  **Exit:** threat model reviewed; penetration test of auth/sync; data-deletion verified.

### Milestone 7 — Admin rule-management console

- **FR-2:** approvals and activations only by authenticated, authorized reviewers and approvers
  (RBAC + MFA); activation only when `checkActivationEligibility` passes and FR-1 hash verification succeeds.

- RBAC (editor, researcher, scholar-reviewer, approver), MFA, rule authoring with schema-driven
  forms, review workflow, publishing to immutable hashed versions, audit trail.

### Milestone 8 — Mobile app (Expo)

- Initialize Expo app consuming `core`, `validation`, `money` and `api-client` (same REST API as
  web); native UI; local secure storage; sync.
- Verify `@khums/money` (decimal.js, `Intl` string formatting) on Hermes; store submissions.

### Milestone 9 — Hardening, launch & post-launch

- Missed-year assessments (if not in MVP), additional languages, payment records, donations,
  reminders, PWA/offline, monitoring, incident runbooks.
