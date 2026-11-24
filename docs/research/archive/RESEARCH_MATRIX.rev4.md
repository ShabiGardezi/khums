# Research Matrix

> **Status:** template, **FROZEN 2026-11-20** (see [README.md](README.md#freeze)). **All cells `NOT_STARTED`.** No answers are recorded here yet.
> Questions are phrased neutrally so they do not presuppose any Marja's position. Researchers
> record only what the cited source states (see [RESEARCH_PLAN.md §2](RESEARCH_PLAN.md#2-non-negotiable-research-rules)).

## 1. How the matrix works

- Each **question** has a stable ID (`INC-01`, …). IDs never change meaning; retired questions are
  marked retired, not reused.
- For each launch Marja, each question gets one or more **findings** recorded with the
  [finding template](templates/finding.template.md) in `findings/<marja-id>/<topic>.md`.
- The **status grid** (§3) shows progress at a glance. The **comparison tables** (§5) show how
  Maraje differ, with finding IDs as references. The **consultation register** (§6) collects
  everything that must go to a qualified person.
- Example items in a question ("e.g. …") are prompts to check, not claims about any ruling.

Finding IDs: `F-<marja-id>-<question-id>-<nn>` (e.g. `F-sistani-INC-01-01`).
Marja IDs are assigned when the launch set is approved (see [SOURCE_INVENTORY.md](SOURCE_INVENTORY.md)).

## 2. Research questions

For every question the researcher records: the source's exact text, locator, status, any
conditions/exceptions stated in the text, and any explicit referral to the Marja or a representative.

### INC — Income

| ID     | Question                                                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| INC-01 | Which kinds of acquisition/gain does the source state are subject to Khums? Record each category exactly as the source names it. |
| INC-02 | How does the source treat salaries, wages and professional fees?                                                                 |
| INC-03 | How does the source treat gifts, prizes and similar receipts?                                                                    |
| INC-04 | How does the source treat inheritance (expected and unexpected)?                                                                 |
| INC-05 | How does the source treat income from which Khums was already paid by someone else (e.g. a payer, a previous owner)?             |
| INC-06 | Does the source address income of minors or dependants held by a guardian?                                                       |
| INC-07 | Does the source address state benefits, insurance payouts, compensation or pensions received?                                    |

### EXP — Expenses

| ID     | Question                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------- |
| EXP-01 | Which expenses does the source state may be deducted from the year's gains before Khums is assessed? |
| EXP-02 | Does the source state conditions on timing (spent within the same Khums year; paid vs incurred)?     |
| EXP-03 | How does the source treat expenditure beyond what befits the person's standing (extravagance)?       |
| EXP-04 | How does the source distinguish business/earning expenses from personal/household expenses?          |
| EXP-05 | How does the source treat religious and charitable spending (e.g. Hajj, sadaqah, vows, gifts given)? |
| EXP-06 | May expenses be deducted from gains of a different year or from capital, per the source?             |

### SUR — Annual surplus & the Khums year

| ID     | Question                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------- |
| SUR-01 | How does the source define the start of a person's Khums year? May it be chosen or changed, and under what conditions? |
| SUR-02 | Does the source treat all income sources under one year, or allow/require separate years per source?                   |
| SUR-03 | What does the source state about the date and basis of valuation of the surplus (e.g. market value, cost, currency)?   |
| SUR-04 | Can losses (in one source, or in one year) offset gains (in another source or year), per the source?                   |
| SUR-05 | What does the source state about the rate and the base to which it applies? Record the text exactly.                   |
| SUR-06 | What does the source state about paying before the year ends, or delaying payment after it ends?                       |
| SUR-07 | Does the source require permission (from the Marja/representative) for any delay, instalments or conversion?           |

### SAV — Savings

| ID     | Question                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------- |
| SAV-01 | How does the source treat money saved during the year for a future need (e.g. marriage, home, education)? |
| SAV-02 | How does the source treat bank deposits and balances at year end?                                         |
| SAV-03 | How does the source treat savings on which Khums was previously paid, and any growth on them?             |
| SAV-04 | Does the source address retirement/pension funds and mandatory or voluntary contributions?                |

### NEC — Personal necessities (_mu'nah_)

| ID     | Question                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| NEC-01 | How does the source define personal/household necessities (_mu'nah_) and the criterion of the person's standing? |
| NEC-02 | How does the source treat items bought for use and used during the year (e.g. furniture, clothing, vehicle)?     |
| NEC-03 | How does the source treat consumables or items bought for use but still unused at the end of the year?           |
| NEC-04 | How does the source treat items that were necessities but are no longer needed or used?                          |
| NEC-05 | Does the source address jewellery and similar items kept for personal use?                                       |
| NEC-06 | Does the source address books, tools or equipment kept for personal/professional use?                            |

### PRO — Property (real estate)

| ID     | Question                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------- |
| PRO-01 | How does the source treat a residence owned and lived in by the person?                         |
| PRO-02 | How does the source treat land or a house acquired for a future residence?                      |
| PRO-03 | How does the source treat property bought for rental income or for resale?                      |
| PRO-04 | What does the source state about increases in property value (realised or unrealised)?          |
| PRO-05 | How does the source treat property bought with money on which Khums had (or had not) been paid? |
| PRO-06 | Does the source address property acquired with financing (loans, mortgages, instalments)?       |

### INV — Investments

| ID     | Question                                                                                  |
| ------ | ----------------------------------------------------------------------------------------- |
| INV-01 | How does the source treat shares, funds and similar investments (principal and gains)?    |
| INV-02 | Does the source distinguish investments held for income from those held for trade/resale? |
| INV-03 | What does the source state about unrealised gains vs realised gains?                      |
| INV-04 | How does the source treat investment losses?                                              |
| INV-05 | Does the source address digital assets / cryptocurrency? (Record `SOURCE_SILENT` if not.) |

### LIA — Liabilities

| ID     | Question                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------- |
| LIA-01 | How does the source treat debts incurred during the year for necessities?                           |
| LIA-02 | How does the source treat debts carried over from previous years?                                   |
| LIA-03 | How does the source treat debts taken to acquire capital, property or investments?                  |
| LIA-04 | What does the source state about when debt repayments affect the surplus (repayment vs incurrence)? |
| LIA-05 | How does the source treat money owed **to** the person (receivables, loans given)?                  |

### BUS — Business assets

| ID     | Question                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------ |
| BUS-01 | How does the source treat the capital needed to run a business or earn a living (_ra's al-mal_)? |
| BUS-02 | How does the source treat trading stock/inventory and its valuation?                             |
| BUS-03 | How does the source treat equipment, premises and tools of trade?                                |
| BUS-04 | Does the source address partnerships and jointly owned businesses?                               |
| BUS-05 | How does the source treat business receivables and profits not yet collected?                    |

### FTK — First-time Khums

| ID     | Question                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| FTK-01 | What does the source state about assessing existing wealth for a person who has never paid Khums?                 |
| FTK-02 | How does the source treat assets whose source or date of acquisition is unknown or doubtful?                      |
| FTK-03 | What does the source state about items of use (e.g. home, furniture) acquired in the past from un-assessed money? |
| FTK-04 | Does the source mention reconciliation/settlement (_musalahah_) or similar arrangements with the Marja's office?  |
| FTK-05 | Does the source address setting the Khums year at the first assessment?                                           |

### MIS — Missed / irregular years

| ID     | Question                                                                                    |
| ------ | ------------------------------------------------------------------------------------------- |
| MIS-01 | What does the source state about Khums due for past years that were not paid?               |
| MIS-02 | On what basis (value then vs now, currency) does the source say past dues are assessed?     |
| MIS-03 | How does the source treat assets bought in past years with money on which Khums was due?    |
| MIS-04 | Does the source address inflation or currency changes for past dues?                        |
| MIS-05 | Does the source permit instalments or deferral for past dues, and is permission required?   |
| MIS-06 | Does the source address a person who is unsure which years were missed or how much was due? |

### CTQ — Continued taqlid (separate religious research topic)

Researched as a topic in its own right, because rulings of deceased Maraje are preserved in the
platform but **the application never decides whether a user may follow them**. Research covers:
(a) the official position of each **living** launch Marja; and (b) any official guidance published
by the offices of the relevant **deceased** Maraje (sources in
[SOURCE_INVENTORY.md §4.6](SOURCE_INVENTORY.md)). Each position is recorded separately per Marja.
No position is assumed to be shared.

| ID     | Question                                                                                                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CTQ-01 | What does the source state about **remaining** in the taqlid of a mujtahid who has died?                                                                                                     |
| CTQ-02 | What does the source state about **beginning** taqlid of a mujtahid who has already died?                                                                                                    |
| CTQ-03 | Which conditions, if any, does the source attach (e.g. what the follower must have learned or acted upon during the mujtahid's life, comparative knowledge)? Record each condition verbatim. |
| CTQ-04 | According to the source, whose view decides the permissibility of remaining (the deceased mujtahid's, a living mujtahid's, or other)?                                                        |
| CTQ-05 | What does the source state about matters on which the deceased mujtahid left no ruling, or new situations arising after their death?                                                         |
| CTQ-06 | For Khums specifically: whose permission or representative does the source say is relevant for payment, spending or settlement when the follower remains on a deceased mujtahid?             |
| CTQ-07 | Does the office of the deceased Marja publish guidance for followers after the death, and does it answer new questions? Record whose rulings such answers state they apply.                  |
| CTQ-08 | What does the source state a follower should do when unsure whether they meet the conditions?                                                                                                |

Product consequence (design constraint, not a ruling): the app records the user's **own
declaration** of whom they follow. When the declared situation involves a deceased Marja, or the
user is unsure, the app shows the researched positions (with citations) and the consultation
pathway. It **never** infers eligibility, and never switches the user to another Marja.

### ADJ — Adjacent topics (logged, not required for the M2 exit)

| ID     | Question                                                                               |
| ------ | -------------------------------------------------------------------------------------- |
| ADJ-01 | Gold and silver (coins, bullion) — treatment and valuation.                            |
| ADJ-02 | Wealth mixed with unlawful/unknown-owner wealth — whether a distinct category applies. |
| ADJ-03 | _Mahr_ (dower) received or owed.                                                       |
| ADJ-04 | Division of Khums into its shares and the recipients/permissions for each.             |
| ADJ-05 | _Retired. Moved to the `CTQ` topic._                                                   |
| ADJ-06 | Payment in a currency different from the assessed currency.                            |

## 3. Status grid

One column per launch Marja (added when the launch set is approved). Status values:
[RESEARCH_PLAN.md §6](RESEARCH_PLAN.md#6-status-vocabulary).

| Question  | _marja-1_   | _marja-2_   | _marja-3_   |
| --------- | ----------- | ----------- | ----------- |
| INC-01…07 | NOT_STARTED | NOT_STARTED | NOT_STARTED |
| EXP-01…06 | NOT_STARTED | NOT_STARTED | NOT_STARTED |
| SUR-01…07 | NOT_STARTED | NOT_STARTED | NOT_STARTED |
| SAV-01…04 | NOT_STARTED | NOT_STARTED | NOT_STARTED |
| NEC-01…06 | NOT_STARTED | NOT_STARTED | NOT_STARTED |
| PRO-01…06 | NOT_STARTED | NOT_STARTED | NOT_STARTED |
| INV-01…05 | NOT_STARTED | NOT_STARTED | NOT_STARTED |
| LIA-01…05 | NOT_STARTED | NOT_STARTED | NOT_STARTED |
| BUS-01…05 | NOT_STARTED | NOT_STARTED | NOT_STARTED |
| FTK-01…05 | NOT_STARTED | NOT_STARTED | NOT_STARTED |
| MIS-01…06 | NOT_STARTED | NOT_STARTED | NOT_STARTED |
| CTQ-01…08 | NOT_STARTED | NOT_STARTED | NOT_STARTED |

Once research starts, the grid is expanded to one row per question.

## 4. What a filled cell must contain

A cell's status links to finding records. A finding is only complete when it has:

1. Verbatim original-language text (copied, not retyped from memory).
2. Locator: source ID, edition/version, volume, page, mas'alah or istifta' number, URL, access date.
3. Archive reference (snapshot URL and/or stored file with SHA-256).
4. Translation (if any) with translator name and review status.
5. Conditions, exceptions and cross-references stated in the text — copied, not summarised away.
6. Researcher note, clearly labelled **non-authoritative**.
7. Flags: `ambiguous`, `requiresConsultation`, `conflictsWith` (finding IDs).

## 5. Recording differences between Maraje

For each question, a comparison table lists each Marja's finding IDs and a **difference
classification**. The researcher proposes; the scholar reviewer confirms. Until confirmed, the
classification is shown as _proposed_.

| Classification   | Meaning                                                                        |
| ---------------- | ------------------------------------------------------------------------------ |
| `SUBSTANTIVE`    | The sources lead to different treatment for the same situation.                |
| `CONDITIONAL`    | Treatment differs only under certain conditions stated in one or both sources. |
| `TERMINOLOGICAL` | Different wording; scholar reviewer confirms the same treatment.               |
| `NOT_COMPARABLE` | Sources address different situations or different scopes.                      |
| `UNKNOWN`        | At least one side is silent, ambiguous or unverified. **Default.**             |

Rules: equivalence (`TERMINOLOGICAL`) is never assumed; absence of a difference in our reading is
recorded as `UNKNOWN` until the scholar reviewer confirms.

Template:

| Question | Marja | Finding IDs | Status | Classification (proposed / confirmed) | Notes |
| -------- | ----- | ----------- | ------ | ------------------------------------- | ----- |
| INC-03   | …     | …           | …      | UNKNOWN (proposed)                    | …     |

## 6. Consultation case register

Entries are created from research, never pre-filled with answers. Each entry records: case ID
(`C-<marja-id>-<nn>`), related question/finding IDs, trigger (one of the below), description of the
situation in neutral terms, outcome (`OPEN`, `QUERY_SENT`, `ANSWERED` → source ID, `PRODUCT_FLAG`:
the app must route users to the Marja's office instead of calculating).

**Triggers**

1. The source itself refers the matter to the Marja, the office, or an authorized representative.
2. The finding is `AMBIGUOUS` or `CONFLICTING_SOURCES` and the scholar reviewer cannot resolve it.
3. The source is `SOURCE_SILENT` on a situation the app would otherwise need to calculate.
4. The scholar reviewer judges that the situation depends on facts the app cannot reliably capture.
5. The user's declared taqlid situation involves a deceased Marja, or the user is unsure whether
   they may remain on one (`CTQ`).

**Situations to check for consultation status** (prompts for researchers — whether each needs
consultation is a research outcome per Marja, not an assumption):

- Wealth whose lawful origin or ownership is uncertain or mixed.
- Settlement/reconciliation arrangements for large or long-unpaid amounts.
- Past years where records are missing or the amount due is unknown.
- Assets with disputed ownership, joint ownership or partnership.
- Inherited wealth where the deceased may have owed Khums.
- Business structures (companies, partnerships, trusts) and complex financial products.
- Digital assets and other instruments not addressed in the source.
- Requests for deferral, instalments or permission to spend Khums.
- Followers of a deceased Marja (remaining in taqlid, Khums payment permissions, new situations).
- Situations involving minors' or dependants' property.

## 7. Change control

Matrix questions are versioned in git. Adding/changing a question requires research-lead approval
and, if research has started, a note on affected findings. Findings are never edited after
`APPROVED`; corrections create a new finding that `SUPERSEDES` the old one.
