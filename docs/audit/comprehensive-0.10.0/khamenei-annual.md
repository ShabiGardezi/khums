# Khamenei scholar-review pack 0.9.0: review of the annual and missed-year workflows

Reviewer scope: `khameneiAnnual`, `holdingTargets`, `debtTargets`, `defaults`, `annualParts` (Khamenei
branch) and `khameneiMissedYearParts` in `packages/marja-rules/src/review-packs/annual.ts`, sealed
pack `khamenei-0.9.0.json`. I did not change any repository file. The temporary test file
`packages/core/src/provisional/zz-review-kha-annual.tmp.test.ts` was created, run through
`prepareAssessmentInput` and then `calculate(…, {mode:'scholar-review'})`, and **deleted**.

Every figure below is a TECHNICAL result under the provisional transcriptions, not a religious
answer. No correction proposes a ruling, rate, threshold or exemption. Each correction is one of
these: a consult stop; a label correction; a question whose condition the cited excerpt itself
states (quoted); or splitting an answer option that joins cases the text treats differently.

**Source check.** Quotes were checked in context against a text extraction of the office PDF
(leader.ir book 215, `booklet_215_[Leader.ir].pdf`, the 2025-10-26 web export; PDF page numbers
below). A prior session made that extraction, and it was read here as data. An attempt to re-fetch
`https://www.leader.ir/fa/book/215/` in this review returned HTTP 404, so nothing is marked
"checked on office page".

Severity: CRITICAL = a wrong figure in a plainly settled case; HIGH = a final figure (total, halves,
remaining, khums-year, known-years) is shown where the text requires a stop or a condition that
was never asked; MEDIUM = a misleading label or part, or a figure that depends on an ambiguous
entry; LOW = an over-stop, wording or consistency issue with no unsupported figure.

**Counts: CRITICAL 0 · HIGH 8 · MEDIUM 9 · LOW 6** (23 items).

Common fixtures: annual period 2025-07-01 to 2026-06-30, USD. "Salary 42,000 + household 30,000"
with `living-within-status`=yes and `living-from-year-income`=yes gives total 2,400; this is the
baseline, and it was reproduced. "Stops" leaves out the permanent `consult-CTQ` and `consult-payee`.

---

## HIGH

### KA-01 (K11): mixed funds answered "doubt only" are excluded completely

- Workflows: annual, missed-year. Location: `annual-balance-2` / `missed-balance-2`, leaf
  `mixed-certain=false → EXCLUDE kha-mixed`.
- Current: salary 42,000, household 30,000, `BALANCE:MIXED_FUNDS` 10,000 with `mixed-certain`=no
  gives **total 2,400, halves 1,200/1,200, remaining 2,400**. The same 10,000 entered as a bank
  account with `holding-paid`=no withholds the total (`consult-holdings`). Missed years: the year
  counts 2,400 in `khums-known-years` (aggregate 4,800).
- Why: «اگر در مخلوط شدن مال حرام با اموال خود شک داشته باشد، چیزی بر عهده او نیست» (PDF p.22,
  Q79) removes only the duty concerning _unlawful money_. It says nothing about whether the
  money is unpaid profit. So the exclusion rests on an unstated reading.
- Change: replace the `mixed-certain=false` leaf with the ordinary BALANCE holdings action, the
  same subtree `holdingTargets` builds for `BALANCE:CASH` (after KA-03, the `holding-source`
  subtree). Keep `kha-mixed` in the mapping rule's ruleIds and add `kha-paid`. In
  `khameneiMissedYearParts` this happens automatically because it wraps the annual rule.
- Regression: the K11 facts with `mixed-certain`=no and `holding-source`="This year's income…"
  give `khums-total` null and stop `consult-holdings`. With `holding-source`="Money on which khums
  was already paid" the result is 2,400. Missed year: the known-years aggregate leaves that year
  out.

### KA-02 (C14): a khums-paid or inherited asset held for price growth is excluded

- Workflows: annual, missed-year. Location: `holdingTargets` for ASSET; question
  `holding-for-sale` («سرمایه (در معرض فروش)»); leaf `holding-paid=true > holding-inherited-unpaid=false >
holding-for-sale=false → EXCLUDE kha-paid`.
- Current: `ASSET:INVESTMENT` 50,000 (paid=yes, inherited-unpaid=no, for-sale=no) with salary and
  household gives **total 2,400**. A person holding land or shares for growth, without a present
  intention to sell, answers "not held for sale".
- Why: «سود و ارزش افزوده مال مخمّس» (PDF p.9–10) covers khums-paid property _and_ property bought
  with gift or inheritance money. In case د (working capital) the increase «در سررسید هر سال خمسی … پس از کسر تورّم مشمول خمس است».
  Q23 covers land bought «تا پس از ترقّی قیمت بفروشد … با اینکه قصد فروش ندارد» and says «در سررسید هر سال خمسی باید … خمس ارزش افزوده را … پرداخت کند».
  Shares «برای رشد قیمت و کسب سود» are treated the same way (p.11). The current question asks only
  about "merchandise".
- Change: replace `holding-for-sale` with a new question `holding-trade-or-growth` (boolean, not
  required, ruleIds `kha-paid`, `kha-inheritance`). Label: «Is it goods you trade or sell, or was it bought to sell later at a higher price or for its price growth (such as land or shares bought for profit)? Answer no if it is for use, or kept only to preserve its value. («سود و ارزش افزوده مال مخمّس» د; Q23)».
  yes → `holdings` (stop `consult-holdings`); no → exclude (`kha-paid`, or `kha-inheritance` /
  `kha-ftk-doubt` on those branches); unanswered → clarification; invalid → `consult-entry`. Update the
  `kha-paid` Encoded text.
- Regression: the INVESTMENT 50,000 case with `holding-trade-or-growth`=yes gives total null and
  stop `consult-holdings`; with no it gives 2,400.

### KA-03 (K7): one "paid" question joins khums-paid, gift, inheritance and "not sure"

- Workflows: annual, missed-year. Location: question `holding-paid` (all ASSET and BALANCE subtypes
  except MIXED_FUNDS and BUSINESS_STOCK).
- Current: a bank balance of 20,000 that the person only _thinks_ was khums-paid has no "not sure"
  option, so the answer is yes and the balance is excluded: **total 2,400**. The label also does not
  say "all of it", so a balance that is part paid savings and part this year's income is answered
  yes and excluded.
- Why: «گاه شک در پرداخت مال است که متعلّق خمس بوده … خمس آن واجب است» (اقسام شک 2, p.61);
  Q249 says that thinking it was probably paid still means «باید خمس را بپردازید»; and «شک بین مال مشمول … با مال غیر مشمول خمسی مثل هدیه … حکم به عدم وجوب خمس می شود» (اقسام شک 3; Q250).
  These are three cases with different treatment, and the current yes/no answer merges them.
- Change: replace `holding-paid` with a new choice question `holding-source` (not required, ruleIds
  `kha-paid`, `kha-inheritance`, `kha-ftk-doubt`). Label: «What money did ALL of this come from? If parts came from different money, enter each part separately. («اموال مخمّس»; اقسام شک)». Choices and leaves:
  1. "Money on which khums was already paid" → ASSET: `holding-trade-or-growth` (KA-02); BALANCE:
     exclude `kha-paid`.
  2. "A gift or an inheritance (or money from one)" → `holding-inherited-unpaid` (yes →
     `pending-inheritance`; no → same as choice 1, citing `kha-inheritance`/`kha-gift`).
  3. "This year's income, or other income on which khums was not paid" → `holdings`.
  4. "Not sure whether khums was paid on it" → `holdings` (ruleIds add `kha-ftk-doubt`).
  5. "Not sure whether it came from a gift or from earnings" → ASSET: `holding-trade-or-growth`
     (no → exclude `kha-ftk-doubt`); BALANCE: exclude `kha-ftk-doubt`. This matches the
     first-time mapping.
  6. "Parts came from different money" → `holdings`.
  - Invalid → `consult-entry`. Shorten the `holding-inherited-unpaid` label by dropping "Answer no if none of
    it was inherited", which becomes unnecessary.
- Regression: (a) BANK 20,000 with "Not sure whether khums was paid" gives total null and
  `consult-holdings`. (b) Choice 6 gives `consult-holdings`. (c) Choice 1 BANK gives 2,400.
  (d) Choice 2 with inherited-unpaid=yes gives `consult-inheritance-unpaid`. (e) Choice 5 BANK gives
  2,400.

### KA-04 (K13): freelance or rental costs inside business costs are netted silently when the business shows a profit

- Workflows: annual, missed-year. Location: step `business-checked` (`khameneiBusiness`), branch
  `present(business-income,business-costs)` without a loss.
- Current: business income 50,000; business costs 8,000 plus 12,000 (the 12,000 were costs of
  freelance work); freelance 5,000; household 30,000; `business-line-loss`=no gives **total 1,000**.
  The freelance loss of 7,000 is absorbed by the business profit, and no question mentions the
  freelance work. A freelance unpaid bill answered "business cost" is likewise subtracted from the
  business profit (business 30,000−10,000, freelance 20,000, debt 15,000 gives total 0).
- Why: «چنانچه در هر رشته ی کسبی که دارد، سرمایه و دخل و خرج و حساب جداگانه دارد … اگر در آن رشته ضرر کند، از رشته دیگر جبران نمی شود» (p.60 note; its examples are rent and trade).
  Also: an unpaid business-cost debt «فقط در صورتی قابل کسر … که آن بدهی مربوط به تحصیل همان درآمد باشد» (p.40 note).
- Change: add a new question `work-costs-in-business` (boolean, ruleIds `kha-business-cost`,
  `kha-business-lines`, `kha-debts`). Label: «You entered freelance or rental earnings and business costs or business debts. Was any of those costs or debts for the freelance or rental work rather than the business? («مؤونه کسب درآمد»; «محاسبه خمس چند شغل»)».
  - In `khameneiBusiness`, wrap the whole `present('business-income','business-costs')` branch,
    and the new branch from KA-05, in
    `when(all(present('work-earnings'), present('business-costs','business-debts')), when(answer('work-costs-in-business', false), <existing>, consult('consult-work-costs')), <existing>)`.
    Unanswered gives MISSING_ANSWER.
  - New `consult-work-costs` label: «Scholar review required: some business costs or debts you entered were for freelance or rental work. Lines with separate accounts are calculated on their own and a loss is not made up from another line («محاسبه خمس چند شغل»), so each line's figures are needed.»
  - Optional: in the loss branch, `when(present('work-earnings'), consult-work-costs, zero)` may
    become `zero` once the answer is "no". Keeping it is safe.
- Regression: the K13 facts with `work-costs-in-business`=yes give total null and stop
  `consult-work-costs`; with no they give 1,000; unanswered gives
  `missing-answer:work-costs-in-business`.

### KA-05 (K14): an unpaid cost-of-earning debt is dropped when no business income is entered

- Workflows: annual, missed-year. Location: `business-checked`, branch
  `present(business-income,business-costs)=false → zero`; category `business-debts`.
- Current: salary 50,000, household 20,000, `BUSINESS_DEBT` 8,000 answered (living=no,
  business-cost=yes) gives **total 6,000**. The same happens for freelance income 50,000 with an
  unpaid bill 8,000 answered "business cost": total 6,000. The person's answer "the business income you
  entered" contradicts the entries (business income missing, or the debt belongs to the freelance
  work, where the p.40 note would allow it against that income).
- Change: replace that `zero` with
  `when(present('business-debts'), consult('consult-business-debt-no-income'), zero)`. New consult
  (ruleIds `kha-debts`): «Scholar review required: you entered an unpaid cost of earning business income but no business income for this year. Such a debt is deducted only from the income it was for («مربوط به تحصیل همان درآمد», p.40 note), so the entries need checking.»
  KA-04 handles the freelance or rental case when business income exists.
- Regression: both K14 cases give total null and stop `consult-business-debt-no-income`. Business
  10,000−4,000 with a business debt of 9,000 (no work earnings) still gives 2,400: the debt is capped
  at the business profit, as the note says.

### KA-06 (new): business tools and equipment entered as business costs are deducted

- Workflows: annual, missed-year. Location: `annual-expense-2` (`EXPENSE:BUSINESS → business-costs`);
  step `business`. The `kha-business-cost` excerpt elides the condition.
- Current: business income 50,000; business expense 20,000 (a machine); household 30,000;
  `business-stock-unsold`=no gives **total 0**. The only lasting-value question concerns unsold stock.
- Why: the costs deducted are «مقداری از درآمد که صرف تحصیل ربح می شود **و چیزی جایگزین آن نمی شود**»
  (p.39). The pack's excerpt replaces the bold words with «…». Tools: «ابزار کسب و کار سرمایه محسوب می شود … باید خمس قیمت آن در اوّلین سال خمسی بعد از خرید پرداخت شود» (Q7, p.7).
  Fittings: Q145 «اگر … موجب ارتقای ارزش … یا قابلیّت نقل و فروش دارد، خمس دارد».
- Change: (1) restore «و چیزی جایگزین آن نمی شود» in the `kha-business-cost` summary. (2) Add a new
  question `business-costs-lasting` (boolean, ruleIds `kha-business-cost`). Label: «Were any of the business costs you entered spent on tools, equipment, fittings or anything else that lasts or can be resold, rather than used up (like transport, wages, shop rent, utilities, tax)? («چیزی جایگزین آن نمی شود»; «ابزار کسب»)».
  (3) In `khameneiBusiness`, right after the `business-stock-unsold` check:
  `when(answer('business-costs-lasting', true), consult('consult-business-capital'), <rest>)`.
  Unanswered gives MISSING_ANSWER. New consult (ruleIds `kha-business-cost`): «Scholar review required: some business costs bought tools, equipment or other lasting things. The text deducts only costs «که … چیزی جایگزین آن نمی شود» and treats business tools as capital (Q7), so they are not deducted here.»
  Add the answer to every Khamenei business scenario.
- Regression: the case above with `business-costs-lasting`=yes gives total null and
  `consult-business-capital`; with no it gives 0; unanswered gives
  `missing-answer:business-costs-lasting`.

### KA-07 (K1 residual, L1): a missed-year amount the person does not know is counted when entered as 0; the Q255 path is otherwise unreachable

- Workflow: missed-year. Location: every `missed-*` rule, leaf `missed-amount-known=false → category
missed-uncertain` with the shared `AMOUNTS` policy; steps `review-uncertain`, `khums-year`,
  `khums-known-years` and `year-*` all test `present('missed-uncertain')`, meaning sum > 0.
- Current: two years, each with salary 42,000 and household 30,000. Year 2 also has a household
  entry with KNOWN amount 0 and `missed-amount-known`=no. Result: year 2 **khums-year 2,400,
  khums-due 2,400, remaining 2,400**, and **aggregate 4,800** (PARTIAL): the settlement stop never
  fires. The same entry with status UNKNOWN gives NEEDS_CLARIFICATION (it asks for an amount the
  person does not know); with ESTIMATED it gives `consult-entry` for the whole sheet. So the only
  way to reach the Q255 stop is to type a positive "known" amount and then answer "not known".
- Why: Q255: «شخصی چندین سال است که خمس … نمیپرداخته و فعلاً نمیداند چه مقدار بدهی … باید با دفتر وجوهات یا وکیل ما محاسبه و مصالحه کند» (p.63).
  The ruling concerns the several unpaid years as a whole.
- Change: in `khameneiMissedYearParts`, replace `uncertain(kind)` (category `missed-uncertain`) with
  the mapping action `{action:'consult', consultationId:'consult-missed-settlement'}`. Any
  entry the person does not know then stops the whole missed-year assessment with the Q255 label,
  whatever its amount status (UNKNOWN, ESTIMATED, RANGE or 0). New `consult-missed-settlement`
  label: «Settlement required: an amount of a missed year is not known. For unknown amounts over several unpaid years the text says «باید با دفتر وجوهات یا وکیل ما محاسبه و مصالحه کند» (Q255), so no missed-year figure is calculated.»
  The `missed-uncertain` category and its `present()` guards may stay as dead defensive code or be
  removed. Update the scenarios and the K1 regression tests, which currently expect per-year
  withholding.
- Regression: (a) the zero-amount case gives mapping `CONSULTATION_REQUIRED` with
  `consult-missed-settlement` and no figures. (b) An UNKNOWN amount with `missed-amount-known`=no
  gives the same, not a clarification. (c) An ESTIMATED amount with `missed-amount-known`=no gives
  the same, not `consult-entry`.

### KA-08 (C17): a period longer than one khums year, or not the person's khums year, is calculated as one year

- Workflows: annual and missed-year. There is no check anywhere: engine `validPeriod` checks only
  the order of the dates.
- Current: annual period 2023-07-01 to 2026-06-30 with salary and household gives 2,400. Missed
  "year" 2021-01-01 to 2023-12-31 with salary 126,000 and household 90,000 gives **khums-year
  7,200, known-years 7,200**: three years pooled into one surplus, so costs offset across years.
- Why: «تعیین سال خمسی اختیاری نیست بلکه بر اساس زمان حصول درآمد» (Q228, p.57); khums is
  calculated «بر اساس سال خمسی واقعی» (Q231); delaying the year-end «جایز نیست» (Q235). Q232 allows
  a solar or lunar year, and Q234 allows bringing the year-end forward, so the pack cannot use a
  fixed day count. It must ask.
- Change: add a new question `period-is-one-khums-year` (boolean, **required: true**, ruleIds
  `kha-ftk-year`, `kha-missed-years`). Label: «Is this period exactly one of your khums years — from the start of your khums year to its end, not longer and not several years together? («تعیین سال خمسی اختیاری نیست», Q228; Q231)».
  - Wrap step `surplus`: `when(answer('period-is-one-khums-year', true), <current surplus>, consult('consult-period'))`.
    This also withholds khums, khums-total, the halves, remaining, khums-year and known-years.
  - New consult (ruleIds `kha-ftk-year`, `kha-missed-years`): «Scholar review required: the period entered is not one of your khums years. Khums is calculated for each real khums year (Q228, Q231), so enter each year separately.»
  - Missed years: it is answered per year through `yearAnswers`.
- Regression: the 3-year missed period with the answer "no" gives khums-year null and stop
  `consult-period`; the aggregate value is null (UNRESOLVED). Annual unanswered gives
  INPUT_MISSING_REQUIRED_ANSWER. Answering yes reproduces the 2,400 baseline.

---

## MEDIUM

### KA-09 (C5 residual): missed `khums-year` shows the gross figure in a year where khums was already paid

- Location: missed step `khums-year`. Current: year 1 with salary 42,000, household 30,000 and
  KHUMS_PAID 1,000 gives **khums-year 2,400** ("Khums of this year before inflation"), while
  `khums-remaining` stops and known-years is 0.
- Change: `khums-year` becomes
  `when(present('missed-uncertain'), consult('consult-missed-settlement'), when(present('khums-paid'), consult('consult-khums-paid'), step('khums-total')))`.
  Basis: `kha-payments` «از دفتر وجوهات … کسب تکلیف کنید».
- Regression: that year gives khums-year null and stop `consult-khums-paid`; aggregate 2,400
  (PARTIAL).

### KA-10 (L2): gross `khums-total` and halves are labelled as amounts due when khums was paid

- Location: annual outputs `khums-total` ("Total khums due (PROVISIONAL)"), `sahm-imam` and
  `sahm-sadat`. Current: salary, household and KHUMS_PAID 1,000 give **total 2,400 and halves
  1,200/1,200**; only remaining stops.
- Change: new output labels.
  - `khums-total`: «Total khums of this assessment, before any khums you already paid (PROVISIONAL)».
  - `sahm-imam`: «Imam’s share: half of the total above (before khums already paid)».
  - `sahm-sadat`: «Sayyids’ share: half of the total above (before khums already paid)».
  - Keep `khums-remaining` as the only "still to pay" figure.
- Regression: an output-label assertion; the values are unchanged.

### KA-11 (N1 residual): parts stay visible under a withheld total, and `surplus` ignores the mixed remainder

- Location: outputs `khums-due` ("Of which on this year’s profit") and `surplus`. Current: with
  land 90,000 (unpaid) the total stops but `khums-due` is 2,400 and `surplus` is 12,000. With a
  mixed amount (the Q79 case), `khums-due` is 2,400 and `khums-mixed` is 2,000, although
  `consult-mixed-remainder` itself says the remainder «may be part of this year’s profit».
- Change: (1) wrap step `surplus` in
  `when(present('mixed-khums','mixed-sadaqah','mixed-owner','mixed-over-fifth','pending-mixed'), consult('consult-mixed-remainder'), <surplus>)`
  (Q81 «ابتدا برای حلال شدن مال باید خمس مجموع … سپس … خمسی که به درآمد تعلّق گرفته»). (2) New
  output labels: `khums-due` «Part: khums on this year’s profit as entered — not the amount due (see the total)»;
  `surplus` «Part: profit exceeding living expenses, as entered — not the amount due».
- Regression: the mixed Q79 case gives surplus and khums-due null, `khums-mixed` 2,000, total null.

### KA-12 (K9 / C15): every BONUS is excluded, including pay the text treats as income

- Location: `annual-income-8` and `missed-income-8` (`EXCLUDE kha-bonus`); the subtype label is "Bonus or reward".
- Current: BONUS 30,000 is excluded (total 2,400).
- Why: «پرداخت خمس عیدی و پاداش واجب نیست» (p.47, Q187–188) versus «حقّ سنوات که بر اساس قرارداد یا قانون کار … در قبال کار کردن … داده می شود، درآمد محسوب شده» (Q189).
- Change: add a new choice question `bonus-kind` (ruleIds `kha-bonus`) with label «What was this payment? («عیدی و پاداش»; «سنوات», Q189)». Choices:
  - "An Eid gift (عیدی) or a reward (پاداش), including an end-of-service reward" → exclude `kha-bonus`.
  - "Pay under a contract or labour law for work done (such as severance years «حقّ سنوات»)" → `pending-income`.
  - "Other or not sure" → `pending-income`.
  - Invalid → `consult-entry`.
- The second choice could later be a transcription to `earnings` (Q189 is explicit); for now it is
  an over-stop.
- Regression: BONUS with the second or third choice gives total null and `consult-pending`; with the
  first choice it gives 2,400.

### KA-13 (K9 / C16): mined product below the niṣāb is excluded from the year's profit

- Location: `annual-income-10` / `missed-income-10`, leaf `mined-nisab=false → EXCLUDE kha-mined`.
- Current: mined 3,000 below the niṣāb gives total 2,400.
- Why: «اگر ارزش آن کمتر از این مقدار باشد، خمس ندارد» (p.23) is stated about khums _as a mine_.
  Whether the value is part of the year's profit («درآمد کسب و کار») is not stated.
- Change: the leaf becomes category `pending-income` (stop `consult-pending`). Add an issue note to
  `kha-mined`.
- Regression: that case gives total null and `consult-pending`. Note: this may over-stop if the
  scholar reads «خمس ندارد» as total.

### KA-14 (new): pension choices make survivors' pensions and lump sums look like a retirement pension

- Location: question `pension-kind`, choice "Retirement pension" → `earnings`.
- Current: PENSION 20,000 with "Retirement pension" gives total 6,400. A widow receiving her late
  husband's pension, or a retiree receiving an end-of-service lump sum, has no matching choice.
- Why: Q223 «مستمرّی ماهانه که پس از فوت بیمه گذار به بازماندگان او پرداخت می شود، متعلّق خمس نیست» (p.56);
  Q11 «پاداش بازنشستگی … خمس شامل آن نمی شود»; Q72 (savings funds paid at retirement) depends on
  whether the deductions were voluntary.
- Change: new choices.
  - "My own monthly retirement pension («حقوق بازنشستگی»)" → `earnings`.
  - "A pension paid to me as survivor of a deceased insured person (Q223)" → `pending-income`.
  - "A lump sum paid at retirement (end-of-service reward or savings fund; Q11, Q72)" → `pending-income`.
  - Keep "A payment I had no right to demand", "Insurance payout" and "Other".
- The survivor choice could later be transcribed as an exclusion (Q223 is explicit); for now it is
  an over-stop.
- Regression: the survivor and lump-sum choices give `consult-pending`; own pension gives 6,400.

### KA-15 (new, Khamenei counterpart of N2): a living-debt deduction depends on which amount is entered

- Location: `debt-living-this-year` → `debt-spending-entered=false → debts-deductible`; the
  LIABILITY amount is "the amount at a date".
- Current: a LOAN of 6,000 deducted gives 1,200. If 10,000 was borrowed and spent, 4,000 repaid
  from salary, and 6,000 entered, only 6,000 is deducted. If part of the loan is still unspent in
  the bank, the whole debt is deducted.
- Why: deducted are «بدهی های مربوط به مئونه … که … بعد از حصول اوّلین درآمد سال ایجاد شده»;
  Q156 «اگر بدهی بر اثر قرض برای مخارج همان سال … و هزینه بعد از حصول اوّلین درآمد سال انجام شده»;
  Q162 «اگر وام یا مقداری از آن مصرف نشده و موجود باشد …».
- Change: new label for `debt-living-this-year`: «Is this a debt (a loan or credit purchase) for this year’s living costs, spent after your first income of the year? Enter the amount borrowed or bought on credit that was spent on those costs, not the amount still owed and not any part still unspent. («بدهی و مال قرضی»; Q156, Q162)».
  New question `debt-unspent-part` (boolean): «Is any of this loan still unspent (kept as money)?»
  yes → `debts` (stop `consult-debts`).
- Regression: LOAN with `debt-unspent-part`=yes gives `consult-debts`.

### KA-16 (new): the living-expense confirmation omits conditions the text states

- Location: required question `living-within-status`.
- Why: Q50 «در صورتی که مورد نیاز نباشد، به قیمت انتهای سال خمسی، متعلّق خمس است»; Q51 «آنچه اضافه بیاید … تا سر سال خمسی باقی بماند … متعلّق خمس است» (p.16); Q94.
  The label asks only about lawful, customary and fitting one's status.
- Change: a new question `living-leftover` (boolean, required when `living` is present: gate it
  inside the `present('living')` branch). Label: «Were any of these living costs spent on things not needed, or on food, cleaning or other consumables still left over with a resale value at the end of the khums year? (Q50, Q51, Q94)».
  yes → new consult `consult-living-leftover`: «Scholar review required: unused items or left-over consumables at the year’s end are liable at their year-end value (Q50, Q51), which is not entered here.»
- Regression: salary, household and `living-leftover`=yes give total null.

### KA-17 (K9: Q247, Q260–265): the missed-years inflation review states the wrong basis, and the Q247 payment-source rule is not flagged

- Location: consult `consult-missed-inflation`; step `review-inflation`.
- Current label: "the text allows the loss in the value of money to be claimed («کسر تورّم»), but
  it does not say how inflation is measured". The text instead says: Q260 «در صورت کاهش ارزش پول (تورّم)، شخص، ضامن تورّم نیز هست»;
  Q261 «در صورت تأخیر باید کاهش ارزش (تورّم) آن جبران شود»; Q264 limits this to someone who did not
  pay «با وجود توانایی»; Q265 «به ارزش روز باید بپردازید»; and Q247 says paying an earlier year's
  khums from later income requires khums on the amount paid.
- Change: new label: «Scholar review required: khums paid late is owed with its loss of value (Q260, Q261, Q265) when the person could have paid (Q264); how it is measured is not stated. Paid from this year’s income, khums is due on the amount paid too (Q247).»
  (≤300 chars).
- Regression: label assertion; the figure is unchanged ("before inflation").

---

## LOW

### KA-18: `missed-amount-known` is asked before entries that would be excluded anyway

- Location: `khameneiMissedYearParts` wraps the rule root
  (`yesNo('missed-amount-known', rule.then, …)`).
- Current: an inheritance with `missed-amount-known`=no and `inh-deceased-unpaid`=no stops its whole
  year (`consult-missed-settlement`), so known-years is 2,400 instead of 4,800.
- Change: apply the wrap recursively at each `category` leaf only, and leave `exclude` and `consult`
  leaves unchanged. With KA-07 the unknown branch is the mapping consult.
- Regression: that case is excluded; a known amount is not asked.

### KA-19: the `consult-living-source` label misstates the text, and the stop over-stops a settled case

- Text: «میتواند مبالغی را که متعلّق خمس نبوده است _ مانند هدیه، ارث، پول مخمّس _ و پس از حصول اوّلین درآمد سال در مصارف فوق مصرف کرده است، از درآمد سال کسر کند» (p.40).
- Change: new label: «Scholar review required: some living costs were not paid from this year’s income. The text allows costs paid from gifts, inheritance or khums-paid money after the year’s first income to be deducted (p.40); other sources are not addressed.»
  Optionally, a transcription could split `living-from-year-income` into choices; that is not proposed here.

### KA-20: earlier-debt wording, and earlier business-cost debts

- Change the `debt-earlier-paid-soon` label to «… that you paid from this year’s income during the year or up to five days after its end?» (Q152 «تا پنج روز بعد»).
- Earlier-year unpaid business costs paid within five days («هزینه های بدون جایگزین سال جاری و سال های قبل را که مربوط به شغل … از درآمد سال جاری بپردازد») still stop at `consult-debts`. That is an over-stop, kept.

### KA-21: missed-year aggregate consistency and coverage

- A year whose total stops for `consult-special`, business stock, lines and similar makes the
  aggregate value null (UNRESOLVED). A year with holdings, mixed funds or khums paid counts as 0
  and leaves the aggregate PARTIAL. Both fail closed.
- Years not entered (gap 2021 and 2024 gives 4,800) are silently outside the sum.
- Change the aggregate label: «Khums of the missed years entered with all amounts known … (a part of the total unless every unpaid year is entered and complete)».
- Earlier lows still open: empty year counts 0; `earlier-unpaid` shown next to a year's khums.

### KA-22: the EMPLOYMENT amount meaning (net or gross)

- Q72: compulsory deductions «جزو درآمد سال وصول است», so salary withheld this year is not this
  year's income.
- Change the salary entry help or question label: «Enter what was actually paid to you this year (after amounts withheld by the employer).»

### KA-23: the five-day rule after the year-end cannot be entered

- Spending or debts paid within five days after the year-end (Q271, p.40 نکته) fall outside the
  period and are refused (UNSUPPORTED). No figure is shown; only documentation is needed.

---

## Status of the earlier Khamenei annual and missed-year findings

| ID                                                     | Status on 0.9.0                                               | Item here                             |
| ------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------- |
| C1 business debt vs salary                             | Resolved; residual when no business income                    | KA-05                                 |
| C2 business loss vs salary                             | Resolved (N5 stop or zero)                                    | —                                     |
| C5 known-years with khums paid                         | Resolved for the aggregate; per-year `khums-year` still gross | KA-09                                 |
| C14 khums-paid asset for trade or growth               | Partly resolved (for-sale only); growth open                  | KA-02                                 |
| C15 bonus scope                                        | Open                                                          | KA-12                                 |
| C16 mined below niṣāb                                  | Open                                                          | KA-13                                 |
| C17 multi-year "missed year"                           | Open (reproduced 7,200); annual too                           | KA-08                                 |
| K1 settlement-year figures                             | Resolved, except an unknown entered as 0                      | KA-07                                 |
| K2 capital loss vs salary                              | Resolved                                                      | —                                     |
| K3 unsold stock                                        | Resolved; tools and equipment open                            | KA-06                                 |
| K4 inheritance and held for sale                       | Resolved (N3)                                                 | KA-03 restructures                    |
| K7 no "not sure"                                       | Open                                                          | KA-03                                 |
| K8 Q245 vs p.60 note                                   | Resolved by the N5 stop                                       | —                                     |
| K9 Q247 gross-up, inflation basis                      | Open                                                          | KA-17 (bonus and mined: KA-12, KA-13) |
| K10 estimated/range; dropped debt; known-years         | Known-years resolved; debt is KA-05; estimated/range          | KA-07                                 |
| K11 mixed doubt                                        | Open (reproduced 2,400)                                       | KA-01                                 |
| K13 freelance costs, profit case                       | Open (reproduced 1,000)                                       | KA-04                                 |
| K14 debt with no business income                       | Open (reproduced 6,000)                                       | KA-05                                 |
| N1 mixed remainder                                     | Resolved for the total; `surplus` residual                    | KA-11                                 |
| N3 inherited holdings                                  | Resolved                                                      | —                                     |
| N4 freelance costs, loss case                          | Resolved                                                      | profit case is KA-04                  |
| N5 shared-account loss                                 | Resolved                                                      | —                                     |
| L1 Q255 path unreachable                               | Open; worse (0 → figure)                                      | KA-07                                 |
| L2 gross total label                                   | Open                                                          | KA-10                                 |
| Low: gross `khums-year` label                          | Open                                                          | KA-09                                 |
| Low: `BUSINESS_DEBT` through the living question       | Acceptable (asked first, then business)                       | —                                     |
| Low: empty year 0; `earlier-unpaid`; partial aggregate | Open, LOW                                                     | KA-21                                 |
| Low: B1 rounding                                       | By design                                                     | —                                     |

## Verified correct (no change)

- Every unanswered per-entry question gives a clarification; an invalid answer gives `consult-entry`.
- An unanswered `living-within-status` gives INVALID_INPUT; unanswered program questions give
  MISSING_ANSWER; ESTIMATED or RANGE gives `consult-entry`.
- Exclusions verified: gift, charity, Eid/پاداش bonus (KA-12 scope aside), inheritance with no
  known unpaid khums, bank profit within inflation on a khums-paid deposit.
- Business behaviour verified: separate-account loss counts as zero; one-account loss stops;
  losing lines need one account; business debts are capped at the business profit; capital losses
  are capped at the business profit (two entries summed, 3,800 verified).
- Living costs, deductible debts, the floor at zero and the rate parameter are correct.
- Mined, treasure and diving figures are kept separate; treasure, gems or special items below the
  niṣāb withhold the total.
- Per-year answer isolation is correct.

## Cases that must remain scholar-review stops

Continued taqlid and payee (always); holdings of unpaid or uncertain source; trade or growth assets
(KA-02); mixed funds with any duty, and the remainder; treasure or gems below the niṣāb or not
owned; inheritance with the deceased's unpaid khums; unsold stock and lasting business purchases
(KA-06); business loss with one account; losing lines without one account; work costs inside
business costs (KA-04); a business debt with no business income (KA-05); capital loss beyond the
business profit or on personal property; debts outside the transcribed debt rulings; living costs
from other sources (KA-19 notes the text partly settles this); khums already paid; sales, "other"
income and expenses, dividends, insurance, survivors' pensions and lump sums, contractual bonuses,
mined below the niṣāb; unknown missed-year amounts (Q255, whole assessment); periods that are not
one khums year; inflation on late khums (Q260–265) and the Q247 payment source.

**Over-stops that block a case the text plainly settles** (acceptable, listed for the scholar):
Q223 survivors' pension; Q189 severance pay as income; p.40 living costs paid from
gift/inheritance/khums-paid money; earlier-year unreplaced business costs paid within five days;
Q250 gift-or-earnings doubt for assets held for growth.
