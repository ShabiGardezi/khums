# Product Requirements Document — Khums Platform

> Status: **Draft v0.1** (Milestone 1). Religious content is out of scope for this document; see
> `RELIGIOUS_RULES.md` for how rulings are sourced and approved.

## 1. Vision

Give every Shia Muslim a trustworthy, private and free way to **calculate, understand, track and
manage** their Khums according to their own Marja-e-Taqlid — with every figure explained and
traceable to a verified, cited ruling.

## 2. Problem

- Khums rules differ between Maraje and are spread across risalahs, istifta'at and representative
  offices, often in Arabic or Persian.
- People who have never paid Khums, or missed years, don't know where to start.
- Existing spreadsheets and calculators are generic, unsourced, or require sharing sensitive
  financial data with a third party.

## 3. Target audience

| Segment                    | Need                                                                         |
| -------------------------- | ---------------------------------------------------------------------------- |
| First-time payers          | Guided first assessment of everything they own; understand the concept.      |
| Regular annual payers      | Fast yearly calculation from last year's baseline; history.                  |
| Irregular / missed years   | Reconstruct obligations for past years with clear, cited assumptions.        |
| Families / representatives | (Later) Help someone else understand their calculation — no custody of data. |
| Scholars & reviewers       | (Admin) Review and approve rule sets with full source visibility.            |

Primary locales at launch: English. Planned: Urdu, Persian, Arabic (RTL), Hindi, Turkish, French.

## 4. Product principles

1. **Correctness over convenience.** No result without a verified rule set.
2. **Explain everything.** Each figure links to the step, rule and source that produced it.
3. **Private by default.** Usable anonymously with data stored only on the device.
4. **Neutral and multi-Marja.** The app doesn't promote one Marja; the user selects theirs.
5. **Not a fatwa.** The app helps apply published rulings; it never issues rulings. Users are
   directed to their Marja's office for questions outside documented rules.
6. **Free forever, donation-supported.** No paywalled features; donations are voluntary and never
   tied to Khums payments themselves.

## 5. Key workflows

### 5.1 Onboarding

1. Choose language and currency.
2. Choose Marja (from supported list, each showing rule-set version and review status). The user
   declares whom they follow. There is no default Marja. If their Marja is not supported, or they
   follow (or are unsure about following) a deceased Marja, the app shows the consultation fallback
   ([research/RESEARCH_PLAN.md §4.5](research/RESEARCH_PLAN.md#45-consultation-fallback-design-requirement-for-the-product-not-a-ruling))
   and never substitutes another Marja's rulings.
3. Choose mode: anonymous (default) or sign in to sync.
4. Set or confirm the **Khums year start date** (personal fiscal year).

### 5.2 First-time Khums assessment

Guided inventory of assets that may be liable (cash, bank balances, savings, investments, gold &
silver, business stock, unused provisions, etc. — exact categories defined by the approved rule
set), with exemption questions driven entirely by rule-set data. Output: obligation, breakdown,
trace, and a printable/exportable summary.

### 5.3 Regular annual calculation

Starts from the previous year's closing figures; user updates balances and records the year's
income and expenses as defined by the rule set. Output: this year's obligation and history entry.

### 5.4 Irregular / missed-year assessment

User reconstructs one or more past years with best-known data. The app shows which assumptions were
made, which rule-set version applies, and recommends consulting the Marja's office where the rule
set marks a case as requiring individual guidance.

### 5.5 Tracking & payment records

Record payments made (Sahm-e-Imam / Sahm-e-Sadat split where applicable, recipient office,
receipt reference). The app **does not process Khums payments**.

### 5.6 Learn

Plain-language explanations and glossary, each linked to sources. No AI-generated rulings.

### 5.7 Donations

Optional voluntary donation to support the platform (separate from Khums), via a third-party
payment provider. No card data touches our servers.

## 6. MVP scope (web)

**In scope**

- Onboarding, Marja selection (only Maraje whose rule sets have completed review). **First
  implementation candidate: Sayyid al-Sistani** (recommended for his accessible official English
  Khums material; pending owner approval). The architecture stays multi-Marja; others are added
  through the same pipeline.
- Consultation fallback for unsupported Maraje, deceased-Marja situations and consultation stops.
- First-time assessment and annual calculation.
- Result breakdown with full trace and source citations.
- Anonymous local storage; export/import (JSON) and printable summary.
- English UI with RTL-ready layout.
- Accessibility: WCAG 2.2 AA.

**Out of scope for MVP** (planned later)

- Accounts and cloud sync, mobile app, admin console (rule sets are managed in-repo with review
  until the console ships), missed-year assessment (post-MVP unless rules are ready), additional
  languages, payment records, donations, push reminders.

## 7. Non-functional requirements

| Area          | Requirement                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| Accuracy      | Decimal arithmetic only; deterministic; every published rule set has test cases verified by a reviewer. |
| Privacy       | No financial data leaves the device in anonymous mode. No third-party trackers.                         |
| Performance   | Core Web Vitals "good" on mid-range mobile; calculation < 100 ms.                                       |
| Accessibility | WCAG 2.2 AA; keyboard and screen-reader complete.                                                       |
| Availability  | Static/edge-hosted web app works offline after first load (post-MVP PWA).                               |
| Auditability  | Results reproducible from stored inputs + rule-set version.                                             |

## 8. Success metrics

- Completed assessments per month; completion rate of the first-time flow.
- Share of results where users opened the explanation/trace.
- Zero reported calculation discrepancies against reviewer-verified test cases.
- Accessibility audit pass; Lighthouse ≥ 95 across categories.

## 9. Risks

| Risk                              | Mitigation                                                             |
| --------------------------------- | ---------------------------------------------------------------------- |
| Misrepresenting a Marja's ruling  | Source-cited rules, scholarly review, versioning, visible disclaimers. |
| Users treating the app as a fatwa | Clear "not a ruling" messaging; route edge cases to Marja offices.     |
| Sensitive financial data exposure | Local-first, encryption, minimal server data, security reviews.        |
| Floating-point or rounding errors | Decimal library, single rounding point, property tests.                |

## 10. Open questions

- Which Maraje are in the launch set, and which representatives/offices will review rule sets?
- Is gold/silver price data needed at MVP, and from which source?
- Hosting region and data-residency requirements for synced data.
