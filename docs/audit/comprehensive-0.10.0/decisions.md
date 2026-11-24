# Implementation decisions for pack 0.10.0 (coordinator)

Binding for every implementer. Source of the items: review/sistani-annual.md (SA-_),
review/sistani-first-time.md (SF-_), review/khamenei-annual.md (KA-_),
review/khamenei-first-time.md (KF-_). Implement every HIGH, MEDIUM and LOW item in your scope as
proposed, except where a decision below says otherwise.

## Rules (CLAUDE.md rule 1)

- R1. A new question or option is allowed only when the cited excerpt explicitly states the
  condition or distinction; its label cites the ruling/question number. Everything ambiguous,
  incomplete, disputed or needing a choice of reading becomes a `consult` stop that withholds every
  figure depending on it. Never add a ruling, rate, threshold or exemption.
- R2. A question whose meaning changes gets a NEW id. Never reuse an old id with a new meaning.
  Question ids are pack-wide: define each once (annual definitions are shared by missed-year;
  first-time questions live in the first-time parts) — duplicates fail `validateRulePackStructure`.
- R3. Over-stopping is acceptable. Record every over-stop that a text arguably settles in the
  rule's `issues` (and the implementer's notes) so the scholar can lift it.
- R4. Every changed transcription's "Encoded:" text says exactly what 0.10.0 does ("Since 0.10.0
  (comprehensive review, <ID>) …"). Every rule stays `UNVERIFIED`.
- R5. No engine, schema, API, UI, role, permission, governance, database or infrastructure change.
  No new expression kind. Pack content only (annual.ts, scenarios.ts, types if needed) plus tests.
  If an item truly needs an engine feature, implement the fail-safe stop and record the feature as
  a limitation (e.g. SF-01 exact price↔asset linking).
- R6. Labels ≤ 300 characters (zod limit), plain English.

## Cross-Marja consistency (a defect class found in one Marja is fixed in both unless the other's

## own text settles it)

- X1. Parts under a withheld total: when the total is withheld by an item that could change the
  year's profit (holdings, mixed remainder, special remainder, pending entries, khums paid for
  another year, inheritance review, period/khums-year review), `surplus` and `khums-due` are
  withheld too (SA-9, KA-11). Category parts with their own excerpt (`khums-mined`,
  `khums-treasure`, `khums-diving`, `khums-mixed`, `khums-inheritance`) stay visible. First-time:
  part figures are withheld whenever the total is withheld (KF-01, SF-11).
- X2. Remainder of mined product / treasure / gems after their khums (SA-10): same stop for
  Khamenei (`consult-special-remainder`), unless a Khamenei excerpt settles it (then cite it).
- X3. Freelance/rental costs inside business costs (SA-6, KA-04) and business equipment or
  lasting purchases entered as business costs (SA-5, KA-06): both Marjas.
- X4. Receivables (money owed to the person): never through a "bought with paid money" path;
  stop (holdings / ft review) in annual, missed-year and first-time, both Marjas (SA-13, KF-03,
  SF-07).
- X5. Holding source: split "khums-paid / inherited / gift / not sure" into a choice in both
  Marjas (SA-1 with the 1771 follow-ups; KA-03 with Khamenei's kinds of doubt). Sistani has no
  text making "not sure" equal "not paid": not sure → stop. Khamenei: kha-ftk-doubt / Q249 state
  it ("doubt whether paid" = not paid; "doubt gift vs earnings" = not liable) — encode as stated.
- X6. Labels: totals and halves say "before khums already paid" where a paid amount can exist
  (SA-16, KA-10, KA-09).
- X7. Leftover / unneeded living purchases and Jami' 598 conditions (SA-3) vs Khamenei Q50/51/94
  (KA-16): each Marja with its own stated conditions.
- X8. RELIGIOUS_DUTY (SA-4), BUSINESS_DEBT via personal-item path (SA-15), loans (SA-7, KA-15),
  period longer than one khums year (KA-08): apply to the other Marja when the same mapping exists
  there and its own text states the condition; otherwise a stop. KA-08 for Sistani: only if a
  Sistani transcription states the khums-year requirement; if none does, record it as an open
  limitation instead of inventing a question.

## Specific decisions

- SA-14 INVESTMENT_RETURN (Sistani) → pending (stop) until the scholar confirms (strict rule 1).
- SA-19: do NOT adopt the loan-counts-as-year-income reading; leave the over-stop, record it.
- SA-20, SA-23, SF-19 empty sheet / empty year: keep behaviour; improve labels only if cheap.
- KA-07: "amount not known" in a missed year becomes a mapping-level consult
  (`consult-missed-settlement`) — accepted although it stops the whole sheet (fail-safe).
- SF-01: implement the pack-only fail-safe (separate categories + withholding gates) exactly as the
  reviewer specifies; record the engine feature (entry count or fact link) as a limitation.
- KF-04 / KF-06 multi-option questions: accepted if every option maps either to what the text
  states or to a stop.
- Rounding: unchanged (maintainer decision: full precision).
