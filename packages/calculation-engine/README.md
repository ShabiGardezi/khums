# @khums/calculation-engine

A generic, deterministic **rule-pack interpreter** for Khums assessments.

> **The engine contains no Khums formula.** Which categories exist, what is added or deducted,
> rates, rounding, aggregation across years and when to stop for consultation are all **rule-pack
> data**. Data that has not been scholar-approved cannot be used in production. Every fixture in
> this package is **MOCK / NOT FOR PRODUCTION** and represents no Marja's position.

## Public API

| Export                                     | Purpose                                                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `calculate(input, pack, options)`          | Runs the `annual`, `first-time` or `missed-year` workflow defined by the pack. Returns `Result<CalculationReport, CalculationRefusal>` |
| `validateRulePackStructure(pack)`          | Static checks: references, duplicates, step ordering, value kinds, rounding, outputs, mock guard                                       |
| `checkProductionReadiness(pack, req)`      | Production gate (see below)                                                                                                            |
| `checkActivationEligibility(pack)`         | The same gate without an activation record. An activation may be created only when it passes                                           |
| `validateInput(input, pack, program)`      | Input checks: currency, dates, periods, entries, answers, year ordering                                                                |
| `ENGINE_VERSION`, `DEVELOPMENT_DISCLAIMER` | Traceability and labelling                                                                                                             |

Contracts (`RulePack`, `AssessmentInput`, `CalculationReport`, …) live in `@khums/shared-types`.
Zod schemas for loading untrusted JSON live in `@khums/validation` (`rulePackSchema`,
`assessmentInputSchema`, `rulePackActivationSchema`).

## How a rule pack drives a calculation

Each workflow in a pack is a **program**: an ordered list of steps, each with an expression, the
rules that justify it, and optional rounding. Steps may only reference earlier steps.

| Expression                      | Meaning                                                 | Kind                 |
| ------------------------------- | ------------------------------------------------------- | -------------------- |
| `sumCategories`                 | Sum of the user's entries in the listed categories      | money                |
| `parameter`                     | A pack parameter (decimal string)                       | scalar               |
| `step`, `zero`                  | An earlier step's value; money zero                     | as referenced; money |
| `add`, `subtract`, `min`, `max` | Exact arithmetic over operands of the same kind         | operand kind         |
| `multiply`, `percentage`        | Value × scalar; value × rate ÷ 100                      | value kind           |
| `when`                          | Branch on a condition (answer, comparison, all/any/not) | branch kind          |
| `consult`                       | Stop: individual consultation is required               | any                  |

**Value kinds are checked statically**, so money and scalars cannot be mixed. Evaluation is pure,
deterministic and lazy: only the chosen branch of `when` is evaluated. Missing answers use
three-valued logic, so they only matter when they would change the outcome.

**Unresolved cases** (`CONSULTATION_REQUIRED`, `MISSING_ANSWER`) propagate through every dependent
step. Any output that depends on one is `null`, never a guess, and the result status is
`UNRESOLVED`.

**Rounding** happens only where a step names a mode (`scale: n | 'currency'`). The currency
precision comes from ISO 4217 via `@khums/money`.

## Fact mapping (pack `schemaVersion` 2)

`mapFactsToInput(sheet, pack, { answers, factAnswers, yearAnswers })` reads neutral financial
facts into the pack's own input categories, using the pack's `factMapping`
(`RULE_PACK_STRUCTURE.md` §5.7):

- **Answers per year (decision 62):** a missed-year sheet takes each year's own answers in
  `yearAnswers` (keyed by period id) and no shared `answers`; each year receives exactly its own
  answers (none if absent, never another year's). Answers in the wrong scope are refused with
  `ANSWERS_SCOPE_MISMATCH`.

- **Matching:** at most one rule may match any (workflow, kind, subtype), and overlaps are a
  structure error, so order never matters. A rule matches on workflow, kind and
  explicit subtypes; there are no wildcards. Its action is `category`, `exclude`, `consult` or
  `ask` (a per-fact question). Every `exclude` cites its own `ruleIds`, and a `category` must be
  read by the workflow's program.
- **Per-fact answers:** `factAnswers[factId] = { workflow, kind, subtype, answers }` must match the
  fact. A mismatch or stale answers are `UNSUPPORTED`; an invalid value is asked again
  (`QUESTION_ANSWER_INVALID`).
- **Fail closed:** `mapFactsToInput` re-runs the mapping structure checks and refuses duplicate
  fact ids, even when called directly.
- **Uncertainty:** each estimated, ranged, unknown or missing amount, and each approximate,
  unknown or missing date, has an explicit pack handling: `use` (or `use-min`/`use-max`),
  `clarify` or `consult`. `KNOWN` amounts are used as entered.
- **Values:** amounts are copied as the original strings. There is no arithmetic and no currency
  conversion, so another currency is `UNSUPPORTED`. Facts are never modified.
- **Result:** `MAPPED` with an `AssessmentInput`, `NEEDS_CLARIFICATION`, `CONSULTATION_REQUIRED`
  or `UNSUPPORTED`, with one trace line per fact and the pack reference.
- **Validation and readiness:**
  - `validateRulePackStructure` also checks the mapping (`MAPPING_*` codes);
  - `checkProductionReadiness` requires the mapping's rules, questions and consultations to be
    approved and sourced;
  - `requireFactMapping: true` refuses packs without a mapping.

Fixtures: `__fixtures__/mock-mapping-pack.ts` (MOCK, never exported).

## Content integrity (FR-1)

`computeRulePackIntegrity(pack)` returns `{ algorithm: 'SHA-256', canonicalization:
'khums-jcs-1', scope: 'rule-pack-content-1', digest }`:

- the digest is SHA-256 over the canonical (RFC 8785 profile) form of the pack, minus
  `metadata.integrity`, `contentHash`, `approvals` and `status`;
- see `RULE_PACK_STRUCTURE.md` §5.8 for the exact rules: key order, arrays kept in order, safe
  integers only, no `undefined`, no Unicode normalization.

**Gates:**

- `validateRulePackStructure` requires canonicalizable content and well-formed integrity records.
- `checkApprovalEligibility`, `checkPublicationEligibility`, `checkActivationEligibility` and
  `checkProductionReadiness` **recompute** the digest every time and compare it with the declared
  integrity, every approval's integrity and the activation's integrity. Stale approvals do not
  count.
- `calculate` and `mapFactsToInput` report the recomputed `contentDigest`.

`RulePackActivation.publicationReference` names the governance publication record. Governance
itself (ledger, lifecycle, separation) lives in `@khums/core` (`RULE_PACK_STRUCTURE.md` §5.9);
`canonicalDigest` is shared with its hash chain.

**Tooling:** `sealRulePack(pack)` sets `metadata.integrity` from the content. `canonicalize` and
`canonicalRulePackContent` expose the canonical text for inspection.

## Workflows

| Workflow      | Input                                                  | Behaviour                                                                                                                                                                 |
| ------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `annual`      | One period; dated entries; answers                     | Evaluates `workflows.annual`                                                                                                                                              |
| `first-time`  | Assessment date; holdings (dates optional); answers    | Evaluates `workflows.firstTime`                                                                                                                                           |
| `missed-year` | Assessment date; ordered, non-overlapping past periods | Evaluates `workflows.missedYear.perYear` for each year. Sums across years **only** the outputs the pack lists in `aggregateOutputIds`; withheld if any year is unresolved |

If the pack does not define a workflow, the engine refuses with `WORKFLOW_NOT_SUPPORTED`.

## Modes, refusal and activation

| Mode          | Allowed packs                                                                                  | Result labelling                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `development` | Any structurally valid pack, including MOCK and DRAFT. Readiness gaps are returned as warnings | `guidance: NOT_RELIGIOUS_GUIDANCE` and `DEVELOPMENT_DISCLAIMER` ("MOCK / NOT FOR PRODUCTION …") |
| `production`  | Only packs that pass `checkProductionReadiness`                                                | `guidance: APPROVED_RULE_PACK`                                                                  |

**Production readiness** requires all of the following:

- `isMock: false` and status `PUBLISHED`;
- a `SCHOLAR_REVIEWER` approval and an `APPROVER` who is a different person;
- declared content integrity that equals the digest recomputed from the content (§ Content integrity);
- approvals bound to that recomputed digest;
- an activation record matching the pack's ID, version, hash and approval references;
- every step, used category, parameter, question and consultation (and missed-year aggregation)
  justified by at least one rule, with every used rule `APPROVED` and citing at least one source;
- the pack's effective dates covering the assessed dates.

Otherwise the engine refuses with `RULE_PACK_NOT_READY`. Malformed packs (`INVALID_RULE_PACK`) and
invalid input (`INVALID_INPUT`) are refused in every mode. A MOCK pack can never be marked
APPROVED or PUBLISHED.

**Activation flow (intended):**

1. Scholar review and approver sign-off are recorded in the pack (`approvals`).
2. The pack is published.
3. `checkActivationEligibility(pack)` returns no issues.
4. An admin creates a `RulePackActivation`, which is stored separately from the immutable pack.
5. The app passes that activation to `calculate()` in production mode.

**Open requirements before production** (`docs/research/RULE_PACK_STRUCTURE.md` §9):

- **FR-1:** real content-hash verification. Today the engine only checks that a hash is present and
  matches the activation; hashing the content needs a platform API and belongs in `core`/the app.
- **FR-2:** authenticated reviewer and approver identities. `reviewerId` and `activatedBy` are
  plain strings today.
- **FR-3:** enforced immutability of published packs, and append-only approval history.
- **FR-4:** liabilities, deductions and adjustments modelled without negative-amount conventions.
  Amounts are non-negative; deductions are pack-defined categories the program subtracts.
- **FR-5:** support for every scenario found in religious research, or a consultation stop for it.

**Provisional vocabulary:** the expression set above is a technical implementation, **not an
authoritative representation of any ruling**. If an approved ruling cannot be expressed exactly,
the interpreter is changed. The ruling is never simplified to fit.

## Testing

`pnpm --filter @khums/calculation-engine test` runs Vitest with coverage thresholds of 95% for
lines, branches, functions and statements. Fixtures are in `src/__fixtures__/` and are **not**
exported. Exhaustive-switch guards that the type system makes unreachable are excluded from
coverage with an explanatory comment.
