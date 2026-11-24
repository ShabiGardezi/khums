# Financial input model (M4.3.1)

> **Status:** approved (M4.3.1, 2026-11-20), with the clarifications in §3–§4 and §7.
> Implemented as types, schemas and helpers. No UI, persistence or calculation.
> **Contains no rulings.** Nothing in this model says whether anything is liable to Khums,
> deductible, exempt or relevant to a Marja. Those decisions belong only to approved rule packs.

## 1. Purpose

Future assessment forms collect what a user owns, received, spent and owes. This model defines
how those **financial facts** are represented and validated, independently of any Marja, so the
same facts can later be read by any approved rule pack.

| Layer                      | Where                                        | What it holds                                                                                  |
| -------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Financial facts (this doc) | `@khums/shared-types` `financial/`           | Neutral facts as the user states them                                                          |
| Validation                 | `@khums/validation` `financial/`             | Zod schemas, boundaries, consistency checks                                                    |
| Application entry point    | `@khums/core` `financial/`                   | `parseFinancialFactSheet` (path + code issues only), `describeFactCompleteness`, `factsOfKind` |
| Engine input (existing)    | `@khums/shared-types` `calculation/input.ts` | `AssessmentInput` / `FinancialEntry`: amounts under **rule-pack categories**                   |
| Fact → category mapping    | Rule-pack data (**not implemented**)         | How a pack reads facts into its own categories and questions. Scholar-approved, per pack       |

## 2. Domain model

`FinancialFactSheet` = `{ schemaVersion: 1, currency, context, facts[] }`.

- **`currency`**: the **preferred (default) currency** of the assessment, e.g. what a form pre-fills. It must be supported by `@khums/money`. It never changes a fact's currency (§3.1).
- **`context`** mirrors the engine's workflows (the shared `Workflow` type):
  - `annual` → `period { start, end }`
  - `first-time` → `assessmentDate`
  - `missed-year` → `assessmentDate` + `periods[] { id, start, end }`
- **`facts`**: up to 1,000 `FinancialFact`s, a union over `kind`:

| Kind        | Meaning (financial only)             | Dates                                                    | Subtypes (descriptive, provisional)                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ASSET`     | Something owned (not cash/accounts)  | `valuedOn`, `acquiredOn`                                 | `PRECIOUS_METAL`, `REAL_ESTATE`, `VEHICLE`, `INVESTMENT`, `BUSINESS_STOCK`, `HOUSEHOLD_ITEM`, `RECEIVABLE`, `HOME`, `LAND`, `JEWELLERY`, `PERSONAL_ITEM`, `BUSINESS_EQUIPMENT`, `DIGITAL_ASSET`, `JOINT_OWNERSHIP`, `LIVESTOCK`, `CROPS_AND_TREES`, `RAW_MATERIAL`, `HOUSEHOLD_STOCK`, `DOWRY_ITEMS`, `LOAN_GIVEN`, `COMMITTEE`, `PRIZE_BOND`, `PREPAID`, `PARTNERSHIP_SHARE`, `RENTAL_ASSET`, `OTHER` |
| `BALANCE`   | Cash or an account balance at a date | `valuedOn`                                               | `CASH`, `BANK_ACCOUNT`, `DIGITAL_WALLET`, `MIXED_FUNDS`, `HAJJ_SAVINGS`, `OTHER`                                                                                                                                                                                                                                                                                                                       |
| `INCOME`    | Money or value received              | `receivedOn`                                             | `EMPLOYMENT`, `BUSINESS`, `INVESTMENT_RETURN`, `RENTAL`, `SALE`, `GIFT`, `INHERITANCE`, `FREELANCE`, `BONUS`, `PENSION_OR_BENEFIT`, `CHARITY_RECEIVED`, `MINED_PRODUCT`, `TREASURE`, `DIVING_GEMS`, `MAHR`, `DIYAH`, `INSURANCE_PAYOUT`, `SCHOLARSHIP`, `INCOME_SUPPORT`, `DEATH_BENEFIT`, `DOWRY_RECEIVED`, `KHULA_RECEIVED`, `PROVIDENT_FUND`, `GRATUITY`, `LEAVE_ENCASHMENT`, `OTHER`               |
| `EXPENSE`   | Money paid out                       | `paidOn`                                                 | `HOUSEHOLD`, `HOUSING`, `EDUCATION`, `HEALTH`, `TRAVEL`, `BUSINESS`, `DONATION`, `RELIGIOUS_DUTY`, `TAX`, `INSURANCE`, `CAPITAL_LOSS`, `SOLD_ITEM_COST`, `ASSET_PURCHASE`, `KHUMS_PAID`, `FIXED_CAPITAL_LOSS`, `SHOP_FITOUT`, `OTHER`                                                                                                                                                                  |
| `LIABILITY` | Money owed by the user               | `valuedOn`, `incurredOn`, `dueOn` (may be in the future) | `LOAN`, `MORTGAGE`, `CREDIT_CARD`, `UNPAID_BILL`, `BUSINESS_DEBT`, `UNPAID_KHUMS`, `UNPAID_MAHR`, `OTHER`                                                                                                                                                                                                                                                                                              |

Subtypes added for the Al-Bi'that Trust form (decisions 81–82, 2026-11-24) follow the same rule (appended before `OTHER`). Subtypes added in M5.4 (2026-11-23) are descriptive only and were appended before `OTHER`; existing values keep their meaning (`REAL_ESTATE` is now labelled "Other property" because `HOME` and `LAND` exist). A pack mapping must name every subtype, so a pack written before them sends these entries to its unmatched consultation: they are never ignored or guessed.

Every fact also has:

- `id`;
- an optional `label` (≤ 100 characters) and `note` (≤ 500);
- its own `currency`, which is the **actual currency** of that fact (§3.1);
- a `value`;
- `periodId`, which is required in missed-year (it must reference a period) and `null` otherwise.

**Missing, unknown and uncertain** are separate states, for amounts and for dates:

| Amount `value.status` | Date `status`  | Meaning                                        |
| --------------------- | -------------- | ---------------------------------------------- |
| `NOT_PROVIDED`        | `NOT_PROVIDED` | Not answered yet (missing)                     |
| `UNKNOWN`             | `UNKNOWN`      | The user says they do not know                 |
| `ESTIMATED`, `RANGE`  | `APPROXIMATE`  | Uncertain: best estimate, or lower–upper bound |
| `KNOWN`               | `KNOWN`        | Stated exactly                                 |

**Neutrality rules:**

- There are no `liable`, `deductible`, `exempt`, rate or category fields. Strict schemas reject
  any extra field.
- Kinds and subtypes describe financial nature only. For example, `DONATION` or `GIFT` records
  what happened, not how a ruling treats it. The vocabulary is **provisional and
  non-authoritative** (like the expression vocabulary, RULE_PACK_STRUCTURE §5.6): it may be
  extended, but a ruling is never simplified to fit it.
- Facts do not reference a Marja. The same sheet must work with any pack, or with none.

## 3. Money representation

### 3.1 Currency semantics

| Field                         | Meaning                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `FinancialFactSheet.currency` | Preferred/default currency for the assessment. A hint for forms and future reports only |
| `FinancialFact.currency`      | The **actual** currency of that fact, as the user holds, received or paid it            |

- Different facts may use different currencies, and they are kept exactly as entered.
- **No automatic conversion and no cross-currency aggregation.** Nothing in the platform adds,
  compares or nets amounts across currencies; `describeFactCompleteness` counts facts and never
  sums amounts.
- **No exchange rate is inferred.** The model has no rate or converted-amount field, and strict
  schemas reject one. If an approved rule pack ever needs amounts in one currency, the rate
  must be an explicit, sourced input (a future design, §7.3), never a guess or a live lookup.
- Precision is checked against each fact's own currency, not the sheet's.

### 3.2 Approved input policy (`AMOUNT_INPUT_POLICY`, `status: 'APPROVED'`)

| Decision        | Rule                                                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decimal strings | Amounts are strings matching `@khums/money`'s `DECIMAL_STRING_PATTERN` (no exponent, separators, `+`, leading zeros or non-ASCII digits). JS numbers are rejected     |
| Maximum size    | At most **15 integer digits** (`AMOUNT_TOO_LARGE`)                                                                                                                    |
| Precision       | Literal decimal places ≤ the fact currency's ISO 4217 minor units (USD 2, KWD 3, JPY 0). Excess is **rejected** (`AMOUNT_TOO_PRECISE`); `"100.0"` in JPY is rejected  |
| No rounding     | User-provided amounts are **never silently rounded**. The validated value is the exact string entered. Rounding happens only where an approved rule pack names a mode |
| Negative        | **Rejected** (`AMOUNT_NEGATIVE`). Direction comes from the kind, never the sign (FR-4)                                                                                |
| Zero            | **Allowed** (e.g. an empty account)                                                                                                                                   |
| Arithmetic      | Validation compares only through `Decimal` (range bounds). No float maths, `Number()` or `parseFloat`                                                                 |

Changing any of these values needs maintainer approval; a locked test fails otherwise. The
policy covers user-entered monetary amounts only. **Valuation precision** (e.g. unit prices or
per-gram values) and **exchange-rate precision** are separate future decisions (§7.2–§7.3).

## 4. Validation rules

Structural rules are checked first. Consistency rules run only on structurally valid input
(Zod 4 would otherwise run them on malformed data), so the schemas never throw.

- **Amounts and currency:** see §3. A `RANGE` needs `min ≤ max`.
- **Dates** are `YYYY-MM-DD` calendar dates. Ordering and period checks use **`KNOWN`** dates
  only (approximate dates: §4.1).
  - Asset: `valuedOn ≥ acquiredOn`.
  - Liability: `valuedOn ≥ incurredOn` and `dueOn ≥ incurredOn`.
  - No known date except a liability's `dueOn` may be after the reference date: the annual
    `period.end`, or the `assessmentDate`. Annual sheets (Phase 4, decision 78) accept up to 31
    days after `period.end` (the longest window a pack may allow, e.g. a ruling's days after the
    khums year end); the pack's mapping decides what such an entry counts as, or stops it.
  - A known `receivedOn`/`paidOn` must fall inside the fact's period (the annual period, up to 31
    days after its end as above, or its missed-year period). Values dated before the annual period
    (a value at the end of the previous khums year) are valid facts; a pack reads them only through
    a `BEFORE_START` date window.
- **Periods:** `start ≤ end`. Missed-year periods have unique ids, are in ascending order, do not
  overlap, and end on or before the assessment date (matching the engine's input checks).
- **Ids:** fact ids and period ids are unique. Missed-year facts must reference an existing
  period; other workflows must not reference one.
- **Text:** labels and notes are trimmed, non-empty when present (use `null` otherwise), and
  length-limited.

These are logical-consistency checks only. They never decide whether a fact counts, which
period's rules apply, or whether a missing value matters.

### 4.1 Approximate dates

- An `APPROXIMATE` date is **preserved as approximate**. Validation returns it unchanged; it is
  never converted to, or stored as, an exact date.
- It **cannot establish date order or period membership**. Approximate dates are excluded from
  every ordering and period check: such a date is neither rejected nor treated as inside a
  period. The same date stated as `KNOWN` is checked.
- **Rules that need an exact date ask or stop.** `requireExactDate()` in `@khums/core` returns
  the date only when it is `KNOWN`; otherwise it returns `needs-clarification` with the reason
  (`APPROXIMATE`, `UNKNOWN` or `NOT_PROVIDED`). The caller must ask the user to clarify, or the
  rule pack must stop with a consultation. It must never guess.

## 5. Data ownership and privacy

- **The user owns their facts.** There is no persistence, database, sync or account (M4.6 and
  later). Nothing is collected beyond what a future form asks for, and a label is never required.
- **Error output never contains values:** issues expose only a path and a stable code, and tests
  check that amounts, notes and dates are not echoed. Labels and notes are never parsed or
  classified.
- **No logging or analytics** of financial values (CLAUDE.md rule 5). The web app keeps Server
  Function logging disabled. **No values in URLs:** future forms must use POST or in-memory state,
  as onboarding does (ARCHITECTURE §10a).
- Labels should not hold identifiers such as account numbers. Future UI will say so; the schema
  cannot detect them.

## 6. Future integration with the rule-pack interpreter

1. A user completes a fact sheet (M4.3.2+ forms). `parseFinancialFactSheet` validates it.
2. An **approved rule pack** supplies a mapping: which facts (by kind, subtype, dates and
   answers to its questions) feed which of its `InputCategoryDefinition`s, and in which
   workflow. The mapping is pack data, scholar-reviewed like the rest of the pack. A
   `consult` stop covers anything it cannot place.
3. Core builds the engine's `AssessmentInput` (`FinancialEntry` per category) from the mapping.
   Facts that are `UNKNOWN`, `NOT_PROVIDED`, `ESTIMATED` or `RANGE` are handled as the pack
   decides (e.g. a question or a consultation stop), never by app defaults.
4. The engine calculates and returns a traced result.

**M4.4.1:** the mapping structure (step 2) and its execution (step 3) are implemented generically:
pack `schemaVersion` 2 with `factMapping` (RULE_PACK_STRUCTURE §5.7), `prepareAssessmentInput` in
`@khums/core`. No real (scholar-approved) mapping exists; only MOCK fixtures are used in tests.

## 7. Future requirements (not implemented)

### 7.1 FR-M1: non-monetary measurements

Some facts are naturally measured, not priced: a weight of gold or silver, a number of shares or
units, an area of land. A future measurement model must:

- be **separate from monetary amounts**: a measurement is never a `value`, and a value is never
  inferred from a measurement;
- carry an explicit unit (e.g. gram, troy ounce, unit, share) with its own decimal-string
  quantity, precision and boundaries;
- allow the same missing, unknown and uncertain states as amounts;
- carry **no religious meaning**: a measurement never implies that a threshold, rate or
  classification applies. Any such use is rule-pack data.

It needs its own design and approval (likely an optional `measurement` on facts, with a sheet
`schemaVersion` bump). It is not part of M4.3.1.

### 7.2 Valuation precision

Prices per unit or per weight may need more decimal places than currency minor units. This is a
separate policy from §3.2 and is decided with FR-M1.

### 7.3 Exchange rates

If an approved pack ever needs amounts in a single currency, the design must cover:

- who supplies the rate (the user or a cited source);
- rate precision;
- the date it applies to;
- how it is shown and traced.

Until then, there is no conversion of any kind (§3.1).

## 8. Entry UI (M4.3.2)

The first entry screen (ARCHITECTURE §10a, "Financial fact entry") uses this model unchanged:

- **Fields:**
  - the five kinds and their subtypes exactly as in §2;
  - all five amount states and all four date states;
  - an optional label and note.
- **Amounts** are typed as text and validated with §3.2: rejected rather than rounded, and kept
  exactly as typed.
- **Currency:** each entry has its own currency, defaulting to the preferred currency. Amounts
  are shown in their own currency and never added or converted.
- **Approximate dates** are entered as approximate, with a note that they stay approximate (§4.1).
- **Storage:** facts stay in browser memory only (§5). Nothing is persisted, and refreshing or
  restarting clears them.

## 9. Review and local export (M4.3.3)

### 9.1 Review

The read-only review shows:

- the assessment type, the preferred currency, and the dates or past years;
- every fact grouped by kind, with its own currency, amount and amount state, every date and
  its state, the label and the note;
- counts of estimated, ranged, unknown and missing amounts, and of approximate, unknown and
  missing dates;
- facts that no longer match the dates (flagged).

It never totals, rounds, converts, fills in or classifies anything, and it states that it is
**not a Khums result**.

### 9.2 Export format (`FinancialFactSheetExport`, version 1)

```json
{
  "format": "khums-platform.financial-facts",
  "exportVersion": 1,
  "exportedAt": "2026-07-01T09:30:00.000Z",
  "contents": "FINANCIAL_FACTS_ONLY",
  "sheet": {
    "schemaVersion": 1,
    "currency": "USD",
    "context": { "workflow": "annual", "period": { "start": "2025-07-01", "end": "2026-06-30" } },
    "facts": [
      {
        "kind": "INCOME",
        "subtype": "GIFT",
        "label": null,
        "note": null,
        "currency": "KWD",
        "value": { "status": "RANGE", "min": "30.125", "max": "45" },
        "periodId": null,
        "receivedOn": { "status": "APPROXIMATE", "date": "2026-01-01" }
      }
    ]
  }
}
```

| Field           | Meaning                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `format`        | Fixed identifier of this file type                                                                                                       |
| `exportVersion` | Version of the export format. Any incompatible change increments it                                                                      |
| `exportedAt`    | When the user created the file (ISO 8601, UTC)                                                                                           |
| `contents`      | Always `FINANCIAL_FACTS_ONLY`: the file is not a result and contains no classification or calculation                                    |
| `sheet`         | The fact sheet (§2) exactly as validated, except that app-internal fact `id`s are removed. Period ids stay, because facts reference them |

**Excluded:** the selected Marja, fact ids and any app state. Labels and notes are the user's
own text and are included as entered.

**Rules:**

- **Revalidation:** `buildFactSheetExport` (`@khums/core`) revalidates the whole sheet with the
  app's rules; an invalid sheet is never exported. The result is then checked against
  `financialFactExportSchema` (`@khums/validation`, strict).
- **Values:** amounts are the original decimal strings with the original currency codes.
  Uncertainty states and approximate dates are unchanged, and nothing is rounded, converted,
  totalled or filled in.
- **Reading back:** `parseFactSheetExport` validates a file read back (never throws; issues carry
  no values). Importing is not implemented.
- **File name:** `khums-financial-facts-YYYY-MM-DD.json` (the date only).

### 9.3 Privacy

- The file is created in the browser (Blob and a download link) **only when the user activates
  the export button**. It is never sent to a server, and no request is made.
- The sheet itself stays in memory only (§5).
- Once downloaded, the file is the user's to keep or delete. The UI says that it contains their
  entries and dates but not their Marja.
