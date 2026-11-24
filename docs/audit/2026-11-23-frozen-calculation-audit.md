# Frozen calculation audit: Sistani and Khamenei scholar-review packs (2026-11-23)

Status: **audit report; no finding below has been corrected.** Corrections need the maintainer's
go-ahead. Nothing here approves, verifies or changes the status of any ruling.

## 0. Baseline (frozen before the audit started)

|                                  | Sistani                                                            | Khamenei                                                           |
| -------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Pack                             | `sistani-scholar-review`                                           | `khamenei-scholar-review`                                          |
| Version / schema / channel       | 0.2.0 / 3 / `SCHOLAR_REVIEW`                                       | 0.2.0 / 3 / `SCHOLAR_REVIEW`                                       |
| SHA-256 content digest           | `001915d9d9e0f06c217bc80f35384492a1e99f28b753326b502c34015cbc29e0` | `9af87d3574db1bd1a5ed672f19f4835e7cbc17dffc5afafc83c4b9f795ded24f` |
| Transcriptions / placeholders    | 26 / 70                                                            | 29 / 70                                                            |
| Mapping rules / scenarios / size | 30 / 46 / 156 kB                                                   | 52 / 53 / 182 kB                                                   |

Tests at baseline: `pnpm check` green (core 557 + 1 intentional skip, API 405, engine 199,
marja-rules 121, web 126, validation 126, money 118, others green); Playwright 498 passed, 3 skipped.
Re-run by the technical auditor: core 557/1 skip, API 405, web 126, marja-rules 121 (digests matched).

Method: three independent audits (Sistani sources and calculations; Khamenei sources and
calculations; technical and UI), each deriving expected results from the primary texts rather than
from existing tests, with 41 (Khamenei) and ~40 (Sistani) new scenarios run through
`prepareAssessmentInput` → `calculate` (scholar-review mode) in temporary tests that were deleted.
The lead then re-checked the decisive findings against the sources (§3, §5 "verified by lead").

Sources used: Sistani — Islamic Laws 4th ed. (English, sistani.org), Tawdih al-Masa'il (Persian),
Tawdih al-Masa'il Jami' vol. 2, 1403 (sistani.org book 26576); Khamenei — «احکام خمس», leader.ir book
215 (2016, office PDF). No third-party mirror was used as evidence.

## 1. Overall result

- **Sistani: NOT READY.** Most transcriptions quote correctly and the core annual arithmetic is
  right, but one rule is generalised beyond its text (Jami' 620), one obligatory precaution is only
  half encoded (1790), and several paths give a figure where the text requires review or where
  double counting is possible.
- **Khamenei: NOT READY.** Quotes match the office PDF, but two encodings produce wrong figures
  (business debt against salary; business loss against salary), an explicit hardship exemption is
  missing from first-time capital, and partial historical totals can be mistaken for the amount due.
- **Technical: sound core, with HIGH versioning and MEDIUM UI/fail-closed findings.**

## 2. Rules verified as correctly implemented (quote and encoding match; scenario confirmed)

Sistani: 1769 (rate), 1799 (floor at zero, no carry), 1770 (gifts), 1771 (valid inheritance excluded;
unexpected inheritance and taʿṣīb as gain, labelled obligatory precaution), 1772 (one-fifth of the
inheritance, non-payer exception, other-property case to review), 1776, 1791, 1792/1795 (status
gate), 1816/1817, 1825, 1836 (below niṣāb → review), 1830, 1831/1835 (other duties listed, never
added), 1851 (two halves; Persian «نصف دیگر»), 1783 (payment subtracted; overpayment → review),
Jami' 684, Jami' 736 quote, Jami' 737 الف (necessity used in year → 0; non-necessity and work tools →
one-fifth of current value), 737 ب (khums-paid → excluded; stock → review), cash saved a year → 20 %.

Khamenei: kha-rate, kha-income/expenses (status gate, floor), kha-current-expenses, kha-business-cost
(quote), kha-gift, kha-inheritance, kha-pension (choice), kha-debts and kha-old-debts (Q152),
kha-mined/treasure/diving, kha-mixed and kha-mixed-other, kha-distribution/recipients, kha-paid
(quote), kha-capital-loss, kha-bank-profit (Q19), kha-payments (review); first-time quotes Q4, Q5,
Q39, Q57, Q126, Q236, Q248–Q253, Q255 exact; doubt gift/earnings → 0; unknown source, unknown khums
year, unknown unpaid amount → settlement; missed years per year with no carry; every `kha-*` rule
cites only the 2016 office book (no successor-office material).

## 3. Incorrect calculations (evidence; expected derived from the source)

| #   | Marja    | Input                                                                                                    | Expected (source)                                                                                                                                                                        | Actual                                                                                                           | Sev.   |
| --- | -------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------ |
| C1  | Khamenei | Salary 50,000, household 30,000, unpaid business debt 8,000 answered "business cost", no business income | 4,000 — business debt deductible only from the income it earned; «از درآمد سال کارمندی قابل کسر و استثنا نیست» (p.40 note) — verified by lead                                            | 2,400                                                                                                            | HIGH   |
| C2  | Khamenei | Salary 50,000; business 10,000 − 15,000; household 30,000                                                | Review, or 4,000 with separate accounts: «اگر در آن رشته ضرر کند، از رشته دیگر جبران نمی شود» (p.60 note, Q245) — verified by lead                                                       | 3,000 (loss offsets salary; no account question)                                                                 | HIGH   |
| C3  | Sistani  | Trade + farming, one shared account, one line at a loss                                                  | Review: different lines cannot offset «بنابر احتیاط واجب» even with one account (1790; Jami' 701 «دو کسب مختلف»)                                                                         | Netted, 4,000 COMPLETED                                                                                          | HIGH   |
| C4  | Sistani  | Salary 50,000, household 30,000 of which 10,000 by card, card debt 10,000                                | 4,000 (1803)                                                                                                                                                                             | 2,000 COMPLETED (only the question wording prevents double counting; `debt-personal-item` has no warning at all) | HIGH   |
| C5  | Sistani  | Missed years: year 1 surplus 10,000 with 2,000 paid; year 2 surplus 10,000                               | Total khums 4,000, 2,000 still owed (736, 1783)                                                                                                                                          | Aggregate 4,000 COMPLETED; an overpaid or holdings-review year also leaves it COMPLETED                          | HIGH   |
| C6  | Sistani  | Business 50,000 − 45,000 (stock purchases), unsold stock 20,000                                          | Review (1791 covers costs of earning, not unsold stock; 1785–1786)                                                                                                                       | 1,000 shown (UNRESOLVED only via holdings)                                                                       | HIGH   |
| C7  | Sistani  | Pension 14,000 withdrawn, 6,000 left, household 10,000                                                   | Review: Jami' 620 concerns government subsidies via the Shetab network; 624/626 extend only to insurance/pension paid that way                                                           | 800 (6,000 excluded)                                                                                             | HIGH   |
| C8  | Khamenei | First-time older capital / savings                                                                       | Calculated or review **plus** the hardship exemption: «مگر آنکه با پرداخت خمس، مقدار باقیمانده برای تأمین هزینه های زندگی … کفایت نکند» (Q6, same page as cited Q4–5) — verified by lead | No question or review for the exemption                                                                          | HIGH   |
| C9  | Sistani  | Sales +20,000 and −15,000                                                                                | Review (1787 states an increase only)                                                                                                                                                    | +5,000 COMPLETED                                                                                                 | MEDIUM |
| C10 | Sistani  | Salary only + capital loss 8,000                                                                         | Review: lost capital must be khums-paid; a person without business capital cannot deduct (Jami' 685–686)                                                                                 | 2,400                                                                                                            | MEDIUM |
| C11 | Sistani  | First-time home (necessity) not used in year of purchase                                                 | Review (737 silent; 1798, 1814 precaution/settlement)                                                                                                                                    | 50,000 (one-fifth of current value)                                                                              | MEDIUM |
| C12 | Sistani  | Trade land bought with khums-paid money (first-time and annual)                                          | Review (737 ب merchandise exception, 645)                                                                                                                                                | 0 COMPLETED                                                                                                      | MEDIUM |
| C13 | Khamenei | Shares bought with older income (first-time)                                                             | Review (growth assets owe yearly increase above inflation; p.11, Q23)                                                                                                                    | Base 8,000 + inflation review                                                                                    | MEDIUM |
| C14 | Khamenei | Khums-paid asset held for trade or growth                                                                | Review («سود و ارزش افزوده مال مخمّس» د, Q23)                                                                                                                                             | Excluded                                                                                                         | MEDIUM |
| C15 | Khamenei | Bonus that is contractual salary                                                                         | Liable (Q197–198)                                                                                                                                                                        | Always excluded                                                                                                  | MEDIUM |
| C16 | Khamenei | Mined product below niṣāb                                                                                | Review (text says only «خمس ندارد» as a mine)                                                                                                                                            | Excluded from profit                                                                                             | MEDIUM |
| C17 | Khamenei | One "missed year" period of three years                                                                  | Review (Q228, Q231: real khums year)                                                                                                                                                     | Calculated as one year                                                                                           | MEDIUM |
| C18 | Khamenei | First-time "current year" items at any date                                                              | Not due before year end (Q227)                                                                                                                                                           | One-fifth at any assessment date                                                                                 | MEDIUM |
| C19 | Both     | Mixed-property owner-group branch (Sistani: only asked when amount known)                                | 1830 requires unknown owner                                                                                                                                                              | 1830 khums when owner is in a known group                                                                        | MEDIUM |
| C20 | Both     | Odd cents (0.01 income)                                                                                  | Exact value, explicitly marked                                                                                                                                                           | 0.002 shown raw next to formatted figures; no rounding policy                                                    | LOW    |

## 4. Missing rules and uncovered scenarios

Sistani: stock valuation at year end (1785–1786); repayment of a no-profit year's living loan
(1803 second half); unused provisions at year end (1797–1798); garden and tree growth (1787–1789);
Hajj journey crossing the year (1795); 1820, 1827, 1829, 1837–1842; mahr, khulʿ, diyah entry types;
Jami' 598's other four conditions; per-year answers in missed years; first-time purchases with
year-old income (737 ج), mixed sources (737 د), unknown sources (737 ه, 739–744), spent year-old
income (738).

Khamenei: hardship exemption (Q6, Q13–16, Q61, Q120, Q140); separate accounts (p.60, Q245);
instalment-bought capital (Q10–12); money lent (Q32–33); receivables (Q30, Q72); non-cash income
valuation; gross-up when paying earlier khums from later income (Q246–247); inflation owed only if
the person could pay (Q264); earlier taxes and business debts (Q149–150); Q81 mixed money with
liable income; Q231 settlement question in missed years; per-year status answers.

## 5. Unsupported or incorrectly attributed rules

- **sis-620 (HIGH):** generalised from Iranian subsidies/insurance/pension paid via the Shetab
  network to any bank transfer; misses 620 n.3 (card purchases count as income), 626 n.2 (pension
  contract as a loan), 624 (customary premiums). Verified by lead against the fetched text.
- **sis-1790 (HIGH):** only the "separate accounts" half of the precaution is encoded.
- **sis-598 (MEDIUM):** cites five conditions, asks one.
- **sis-737 (MEDIUM):** a necessity not used in the purchase year is treated as a non-necessity.
- **kha-business-cost (HIGH via C2):** the sentence «از سود همان سال کسر می گردد» concerns costs paid
  from non-income money; it does not authorise offsetting a business loss against salary.
- **kha-ftk-year (MEDIUM):** the excerpt drops «در اوّلین فرصت نزد وکیل مرجع تقلید».
- **kha-missed-years (MEDIUM):** cites Q247 but omits its gross-up ruling; the inflation review
  understates the basis — Q260, Q261, Q264, Q265 state inflation is owed («ضامن تورّم نیز هست»),
  with Q264's ability condition (verified by lead).
- **kha-ftk-cash (LOW):** "current-year savings owe one-fifth" rests weakly on Q248.
- **Locators (LOW):** kha-income/expenses heading; Sistani `SIS-EN` URL selector never matches
  (all English refs link to page 2306); `SIS-FA` refs point to one generic page.
- No rule attributed to the wrong Marja was found.

## 6. Cases correctly routed to scholar review

Sistani: whole-business loss; separate accounts with a losing line; debts outside 1803; sale at a
loss; sale of non-khums-paid items; unexpected/taʿṣīb/unpaid inheritance cases and other-property
khums; treasure/gems below niṣāb; mixed property with another duty; overpayment; first-time year-old
income, stock, debts, income entries; estimates and ranges.

Khamenei: inflation on older property and savings; unknown source (Q236, Q252); unknown khums year
(Q231); unknown unpaid khums (Q255); missed-year unknown amounts; inflation on missed years; khums
already paid; debts outside the text; dividends; sales; treasure/gems below niṣāb; mixed property
with another duty; first-time stock, mixed money, income, expense and debt entries; continued taqlid
and payee (always).

## 7. Security and technical findings

| #   | Finding                                                                                                                                                                                                                                                                                                                                                | Evidence                                                                                     | Sev.   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------ |
| T1  | Version 0.2.0 reused for different content (CLAUDE.md rule 7); no version→digest pin; printed report shows packId@version without digest. Registration of same version with a different digest fails closed (409 `ALREADY_REGISTERED`, core test only). Whether a 0.2.0 is registered on the hosted store is unknown (not checked: no database access) | build.ts:33; actions.ts:232; provisional.service.ts:582–586; provisional-results.tsx:168–175 | HIGH   |
| T2  | Missed-year aggregate marked COMPLETED whenever the aggregated outputs resolve, even with unresolved items or settlement years; partial and before-inflation outputs render exactly like the amount due                                                                                                                                                | calculate.ts:209–231; results-view.tsx:178–186, 353–381                                      | HIGH   |
| T3  | Khamenei first-time: the single "Amount" field's meaning (current value / purchase price / first-year-end value) is decided only by a later per-entry answer shown on the results page, in English only; "purchase date as the date" is ambiguous (valuedOn vs acquiredOn); no e2e journey                                                             | content/facts/en.ts:164–181; annual.ts:2243; results-view.tsx:617–685                        | HIGH   |
| T4  | Scenario panel shows "khums undefined USD" (reads `outputs.khumsDue`, keys are `'khums-due'` …); scenarios are matched by packId only, not digest                                                                                                                                                                                                      | review-scenarios.tsx:61–64 — verified by lead                                                | MEDIUM |
| T5  | Provisional API accepts an already-mapped `AssessmentInput`; entry-level stops (estimates, approximate dates, per-entry questions) run only in the browser; currency minor units not enforced                                                                                                                                                          | validation/api/provisional.ts:33–37 — verified by lead; actions.ts:404                       | MEDIUM |
| T6  | `meta.disclaimer` never rendered verbatim (static text instead), contrary to CLAUDE.md; green "completed" styling possible on provisional Sistani results                                                                                                                                                                                              | results-view.tsx:160–176, 300–331                                                            | MEDIUM |
| T7  | Assessment questions not filtered by workflow (e.g. `ftk-year-known` in annual runs)                                                                                                                                                                                                                                                                   | results/view-model.ts:26–29                                                                  | LOW    |
| T8  | Review-pack code and scenarios shipped in a static client chunk served without a session (rule text only, not discoverable from public HTML)                                                                                                                                                                                                           | provisional-admin.tsx:57; proxy.ts:132                                                       | LOW    |
| T9  | Engine refusal messages echo submitted identifiers (no amounts)                                                                                                                                                                                                                                                                                        | validate-input.ts:49,56                                                                      | LOW    |
| T10 | 512 kB registration body parsed before authentication                                                                                                                                                                                                                                                                                                  | configure-app.ts:41                                                                          | LOW    |

Verified sound: deterministic, exact Decimal arithmetic (no float math); identical report on
re-run; trace carries packId, version, contentDigest, engine version, rule and source refs; stored
content write-once and digest-verified; Marja isolation (packs, sources, ids, staff scope, one Marja
per packId); provisional only in `SCHOLAR_REVIEW` state for authorised staff, SUPER_ADMIN refused,
production readiness rejects the channel; PROVISIONAL notice always first; strict request schemas;
route-specific body limits; no financial values or personal data logged; RFC 9457 problems with
codes only.

## 8. Required corrections (ranked)

No CRITICAL finding: everything is staff-only, provisional, and blocked from production by the
readiness gate. The HIGH items would nonetheless show scholars figures that misstate the texts.

**HIGH**

1. Khamenei: stop business-debt deductions against non-business income (C1); add the
   separate-accounts question or a review for a business loss against other income (C2).
2. Khamenei first-time: add the hardship exemption as a question/review for capital and savings (C8).
3. Sistani 1790: route different kinds of business to review regardless of accounts (C3).
4. Sistani Jami' 620: restrict to the stated case or route pensions to review (C7).
5. Sistani: prevent loan double counting (C4) and make unsold stock stop the figure (C6).
6. Missed-year aggregates (both): do not present as complete when any year has unresolved items,
   settlement, payments or overpayment; show payments and excluded years next to the aggregate
   (C5, T2).
7. Versioning: bump content to a new version, pin version→digest in a test, show the digest on
   printed reports, add an API duplicate-version test, and check the hosted store before
   registering (T1).
8. Khamenei first-time amount meaning: per-entry callout naming the required value with an edit
   link, Urdu help, e2e journey (T3).

**MEDIUM**
C9–C19, T4 (scenario panel), T5 (server-side mapping), T6 (render `meta.disclaimer`; neutral styling),
sis-598 conditions, kha-ftk-year excerpt, kha-missed-years gross-up and inflation basis (Q246–247,
Q260–265), per-year answers in missed years.

**LOW**
C20 (unrounded display marker and a `TODO(rules)` rounding policy), T7–T10, locator and URL fixes,
sis-1776 faqīr condition, sis-1783 timing precaution, 1820/1827.

## 9. Test results and remaining blockers

Baseline suites green (above). The audit's own scenarios: Sistani — about 40 run, failures C3–C7,
C9–C12, C19; Khamenei — 41 run, failures C1, C2, C8, C13–C18 and labelling failures T2/T3. No suite
was changed by the audit. Blockers: the HIGH items in §8; unknown registration state of 0.2.0 on the
hosted store; Playwright does not cover Khamenei first-time or missed-year journeys.

## 10. Readiness for private scholar validation

Not yet. The packs are safe to keep staff-only, but the HIGH corrections should be made (and the
version bumped) before scholars validate figures, so that they are not asked to review encodings
that misstate the texts.

**Verdict: NOT READY FOR SCHOLAR VALIDATION.**

## Addendum (after the audit; not part of the frozen findings)

At the maintainer's request, Sistani first-time assessments were then extended by Tawdih Jami'
736–744 and the packs were re-versioned to **0.3.0** (CLAUDE.md rule 7). That change addresses C11
and the first-time half of C12 only; every other finding above remains open and uncorrected.

## Corrections (pack 0.4.0, engine 0.2.0; after the audit, not part of the frozen findings)

The maintainer approved a corrective phase. Each correction cites the primary text it rests on
(excerpts checked by script against the office texts) and has a regression scenario whose expected
figure was worked out by hand from that text. Nothing was approved; every rule stays `UNVERIFIED`,
provisional and staff-only. Version history: 0.2.0 (digests above, content not kept), 0.3.0
(snapshot kept in `packages/core/src/provisional/history/`), 0.4.0 (pinned in `history.test.ts`:
Sistani `38fa7555…0128843`, Khamenei `a07e28f9…5b7cc0b2d`).

| #   | Resolution                                                                                                                                                                                                                                                                                                                                  | Evidence                                                  | Regression scenarios                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| C1  | Fixed. Khamenei unpaid business-cost debt goes to `business-debts`, deducted only from that year's business profit, never below zero.                                                                                                                                                                                                       | p.40 note «… از درآمد سال کارمندی قابل کسر و استثنا نیست» | business-debt-salary (4,000), business-debt-exceeds (2,000)                                              |
| C2  | Fixed. A Khamenei business loss reduces other earnings only if the person confirms one shared account; otherwise it counts as zero; unanswered → question. Lines with a losing line are netted only with one account (else review).                                                                                                         | «محاسبه خمس چند شغل» note (p.60), Q245                    | business-loss (6,000), -shared (3,000), -unanswered, business-lines-*                                    |
| C3  | Fixed. Sistani lines offset only when the same kind of business AND one account; otherwise review.                                                                                                                                                                                                                                          | Jami' 701 «دو کسب مختلف … بنابر احتیاط واجب نمی‌تواند»    | business-kinds-shared (review), business-lines-shared (2,000)                                            |
| C4  | Fixed (both Marjas). A living or personal-item loan asks whether its spending is already among the expenses entered; yes → not deducted again; unanswered → clarification.                                                                                                                                                                  | Sistani 1803; Khamenei «بدهی و مال قرضی»                  | card-spending-entered (4,000), card-spending-unanswered                                                  |
| C5  | Fixed. Sistani missed years add `khums-remaining` (after 1783 payments); an overpaid year makes the total UNRESOLVED; Khamenei leaves a year with khums paid out of the known total; the engine marks any total with an open year PARTIAL, never COMPLETED.                                                                                 | Jami' 736; 1783; Khamenei Q247 and «کسب تکلیف»            | missed-year-payment (4,000 / 2,000 COMPLETE), -overpaid, -holdings, Khamenei three-years (2,000 PARTIAL) |
| C6  | Fixed. Sistani unsold stock (entry, or costs answered as unsold stock) stops the business profit.                                                                                                                                                                                                                                           | 1791 (costs of earning)                                   | business-stock-unsold, business-stock-asset                                                              |
| C7  | Fixed. Jami' 620 applies only to insurance or pension-fund payouts credited through the Shetab network (624, 626 n.1); spending by card counts as withdrawal (620 n.3); any other pension stops for review. New question ids, so 0.3.0 answers do not carry over.                                                                           | Jami' 620 «… از طریق شبکه شتاب بانکی»; 624; 626 n.1–2     | pension-other-route (review), pension-spent-by-card (3,600)                                              |
| C8  | Fixed. Khamenei first-time capital and emergency savings have the hardship exemption as the person's own answer.                                                                                                                                                                                                                            | p.8 «سرمایه ای که خمس ندارد», Q6, Q120, p.37 note         | capital-hardship (1,200), -no-hardship (9,200), savings-emergency (0), -unanswered                       |
| T1  | Fixed. New version 0.4.0; 0.3.0 kept byte-exact and re-run in tests; version→digest pinned; printed report shows the digest; scenario panel offered only for the current digest.                                                                                                                                                            | —                                                         | history.test.ts                                                                                          |
| T2  | Fixed. Aggregate `completeness` (COMPLETE / PARTIAL / UNRESOLVED) shown in en/ur; figures next to open items carry a "partial, not the amount due" sentence.                                                                                                                                                                                | —                                                         | calculate.test.ts PARTIAL test; scenario completeness checks                                             |
| T4  | Fixed. Scenario panel shows `khums-total` / `khums-known-years`.                                                                                                                                                                                                                                                                            | —                                                         | review-scenarios.test.ts                                                                                 |
| T5  | Fixed. For packs with a fact mapping the API maps the entries itself and refuses a pre-mapped input (`ENTRIES_REQUIRED`) or stopping entries (`ENTRIES_NEED_REVIEW`).                                                                                                                                                                       | —                                                         | core provisional.test.ts, API provisional.service and integration tests                                  |
| T6  | Fixed. `meta.disclaimer` rendered verbatim; a provisional result is never styled as a success.                                                                                                                                                                                                                                              | —                                                         | e2e                                                                                                      |
| T3  | Fixed at entry level. For an older Khamenei first-time entry the person confirms what the amount is (purchase price dated the purchase day for a necessity; value at the first khums year-end for other property); otherwise the entry stops (`consult-entry`). A per-entry callout with an edit link and Urdu help remains a UI follow-up. | Q236, Q126; «محلّ کسب» 4–5                                 | first-time-amount-meaning-not-confirmed; older-property (48,000 base)                                    |

**Re-check of the Sistani 0.3.0 first-time branches (independent reviewer, given the code and the
texts only).** Confirmed and fixed in 0.4.0: 741 and 740 ب apply only with a Twelver Shia seller and
buyer and a rise not from inflation (740–742 notes 1–2); a doubt that includes inherited, gifted or
khums-paid money is not 740–741 (744) and now stops; a rise from inflation stops (737 note 6, 647);
cash of unknown origin is no longer attributed a 739–744 settlement. Verified correct: 737 الف, ب,
ج, note 5, 738, no settlement figure calculated anywhere, debts and estimates stop, excerpts
verbatim. **Still open:** a purchase-price entry is not linked to its asset entry, so contradictory
answers can double count or drop a price (needs an entry link: a structural change); 737 د share
measure; "don't know" options for 739 (how the price was paid) and 743 (use in that year) — these
end in review, never a figure.

Open MEDIUM/LOW findings from §3–§7 not listed above (C9–C20, T7–T10, locators) are unchanged.
