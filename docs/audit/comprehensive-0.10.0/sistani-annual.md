# Sistani 0.9.0: annual and missed-year review (reviewer SA)

Scope: the `annual-*` mapping rules (they serve both `annual` and `missed-year`), the shared
defaults (`defaults`, `holdingTargets`, `debtTargets`), the `annualParts` program, and the Sistani
missed-year wrapper (`perYear: annual.program`, aggregate `khums-total` + `khums-remaining`).
First-time is out of scope (another reviewer has it).

Method: I walked every leaf in the inventory and every program step. I ran 47 combinations
through `prepareAssessmentInput` → `calculate(…, {mode:'scholar-review'})` using a temporary test
file (now deleted). I checked the excerpts on the office pages:

- English 4th ed. `/english/book/48/2306/` (1770–1805) and `/2308/` (1823–1829)
- Persian Tawdih `/persian/book/50/74/` (1772, 1797, 1798, 1801, 1803)
- Jami' vol. 2 `/persian/book/26576/6160/` (masʾalah 598) and `/6383/` (684–690)

All figures below are technical results of provisional transcriptions, not religious answers. Base
facts, unless stated: salary 42,000, household 30,000, `living-within-status` = yes,
`living-from-year-income` = yes. With these facts the baseline is COMPLETED, total 2,400.

Severity: CRITICAL = wrong figure; HIGH = figure where a stop is required, or an interpretation is
encoded; MEDIUM; LOW.

Counts: CRITICAL 0 · HIGH 10 · MEDIUM 6 · LOW 7.

---

## HIGH

### SA-1 Inherited money in holdings excluded without the Ruling 1771 exceptions (F1; F7 class)

- **Workflows:** annual, missed-year.
- **Location:** `annual-asset-1` leaf `holding-paid=true > holding-inherited-unpaid=false > holding-for-sale=false → EXCLUDE sis-737`, and `annual-balance-1` leaf `holding-paid=true > holding-inherited-unpaid=false → EXCLUDE sis-737` (`holdingTargets`).
- **Current behaviour:** `holding-paid` asks "khums already paid, **or** inherited money". This puts the khums-paid and inherited cases under one answer, though 1771 treats them differently. An unexpected inheritance from someone other than the father or son owes khums by obligatory precaution. An inheritance received by taʿṣīb is a gain. Doubt has no "not sure" option.
  - Reproduced: base + REAL_ESTATE 90,000 {paid yes, inherited-unpaid no, for-sale no} → **COMPLETED 2,400**.
  - Reproduced: base + BANK_ACCOUNT 10,000 {paid yes, inherited-unpaid no} → **COMPLETED 2,400**.
- **Proposed change:** in `holdingTargets` (annual and missed-year only), replace boolean `holding-paid` with a new choice question `holding-source`. Label: "What money was this bought with (or how did you get it)? (Tawdih Jami’ 737 ب; Rulings 1771–1772)". Choices:
  - (a) "Money on which khums was already paid"
  - (b) "Inherited money, or the item itself was inherited"
  - (c) "Other money (for example income, a gift), or I am not sure"

  Leaves:
  - (a): ASSET → `holding-for-sale` (yes → `holdings`, no → EXCLUDE sis-737). BALANCE → EXCLUDE sis-737.
  - (b): ask `holding-inherited-unpaid`.
    - Yes → `pending-inheritance`.
    - No → ask new `holding-inh-unexpected`, label "Was the inheritance this came from one you did not expect, from someone other than your father or your son? (Ruling 1771)".
      - Yes → `holdings`.
      - No → ask new `holding-inh-valid`, label "Did that inheritance reach you under inheritance rules considered valid (not, for example, by taʿṣīb)? (Ruling 1771)".
        - No → `holdings`.
        - Yes → ASSET: `holding-for-sale` (yes → `holdings`, no → EXCLUDE sis-737, sis-1771). BALANCE: EXCLUDE sis-737, sis-1771.
  - (c): `holdings`.
  - Invalid → consult-entry.

  Update the "Encoded:" text of sis-737 and sis-1771.

- **Source:** 1771 «اگر ارثی به او برسد که توقع آن را نداشته و از غیر پدر و پسر باشد، ـ احتیاط واجب ـ آن است که خمس … بدهد». Inheritance «به تعصیب» is a gain (pack excerpt). Checked on office page `/english/book/48/2306/` (1771: exemption only for inheritance «received under valid inheritance laws»).
- **Regression:**
  - Base + REAL_ESTATE 90,000 {source b, inherited-unpaid no, inh-unexpected yes} → `consult-holdings`; khums-total, halves and remaining withheld.
  - {source b, no, unexpected no, valid no} → `consult-holdings`.
  - {source b, no, no, yes, for-sale no} → COMPLETED 2,400.
  - {source c} → `consult-holdings`.

### SA-2 Ruling 1772 question can charge one-fifth on inherited property that never owed khums

- **Workflows:** annual, missed-year.
- **Location:** `annual-income-5`, every leaf under `inh-deceased-unpaid=true`. The relevant one is `… > inh-deceased-owed=false → CAT inheritance-khums`.
- **Current behaviour:** the label reads "Do you know that the person you inherited this from did not pay khums on it?". Answered literally, the heir of a home the deceased lived in says yes, although no khums was ever due on it.
  - Reproduced: INHERITANCE 30,000 {unpaid yes, unexpected no, valid yes, non-payer no, owed no} → **COMPLETED total 8,400** (khums-inheritance 6,000).
- **Proposed change:** replace `inh-deceased-unpaid` with a new id `inh-deceased-unpaid-due`. Label: "Do you know that khums was due on this property itself and the person you inherited it from did not pay it? If no khums was ever due on it, answer No. (Ruling 1772)". Keep the same tree. The No branch already asks `inh-deceased-owed`, which is the text's second case.
- **Source:** Persian 1772: «اگر مالی به ارث به او برسد و بداند کسی که این مال از او به ارث رسیده خمس آن را نداده …» against «و همچنین اگر در خود آن مال خمس نباشد». The text separates property that has khums in itself from property that has none. Checked on office page `/persian/book/50/74/`.
- **Regression:** the facts above with `inh-deceased-unpaid-due`: yes → 8,400. No + owed no + unexpected no + valid yes → EXCLUDE, total 2,400. A 0.9.0 answer under the old id → clarification (QUESTION_UNANSWERED), never a figure.

### SA-3 Living expenses deducted without Jami' 598 conditions 3–5 (wasteful or unlawful, need, used by year end)

- **Workflows:** annual, missed-year.
- **Location:** step `living` (and `annual-expense-1`).
- **Current behaviour:** only status (condition 2) and source (condition 1) are asked. Food left over at the year's end, unused durables, and wasteful or unlawful spending are all deducted.
  - Reproduced: base household 30,000 including supplies left over at year end → 2,400. The text makes the left-over part liable (1797).
- **Proposed change:** add program question `living-598-conditions` (boolean). Label (≤300 chars): "Were all the living expenses you entered (and any spending paid by a loan you entered) not wasteful or unlawful, for things you customarily needed this year, and — food and supplies used up, goods such as clothing or furniture put to use — by the end of this khums year? (Tawdih Jami’ 598 conditions 3–5; 1797–1798)".

  Step `living`, inside `living-from-year-income = true`: `when(answer('living-598-conditions', true), sum('living'), consult('consult-living-conditions'))`. Also gate `debts-deducted`: `when(present('debts-deductible'), when(answer('living-598-conditions', true), sum('debts-deductible'), consult('consult-living-conditions')), zero)`.

  New consultation `consult-living-conditions`, label: "Scholar review required: you did not confirm that all living expenses meet Tawdih Jami’ 598 conditions 3–5 (not wasteful or unlawful; customarily needed; used up or put to use by the year’s end). Food left over at the year’s end owes khums (Ruling 1797), so the deductible amount is not settled."

- **Source:** Jami' 598:
  - «سوّم. از موارد اسراف و تبذیر و سائر مصارف حرام نباشد.»
  - «چهارم. … کالا مورد نیاز عرفی فرد در بین سال باشد.»
  - «پنجم. … لازم است تا آخر سال مصرف شده باشند»

  Tawdih 1797: «آذوقه‌ای که … اگر در آخر سال زیاد بیاید باید خمس آن را بدهد».

  Checked on `/persian/book/26576/6160/` and `/persian/book/50/74/`.

- **Regression:** base + {598 = no} → `consult-living-conditions`; total and surplus withheld. {598 = yes} → 2,400. Unanswered with living present → `missing-answer:living-598-conditions`.

### SA-4 "Another religious obligation" deducted as a living expense (earlier khums or zakat paid)

- **Workflows:** annual, missed-year.
- **Location:** `annual-expense-1`, subtype RELIGIOUS_DUTY (UI label "Hajj, ziyarah or another religious obligation").
- **Current behaviour:** khums or zakat owed from an earlier year and paid this year has no subtype of its own, so a user naturally picks RELIGIOUS_DUTY. It is then deducted as a living expense.
  - Reproduced annual: base + RELIGIOUS_DUTY 6,000 → **COMPLETED 1,200**.
  - Reproduced missed-year: year 2 with year 1's khums 2,400 entered this way → year 2 total 1,920, aggregate 4,320 **COMPLETE**.
- **Proposed change:** RELIGIOUS_DUTY → yesNo(new `religious-duty-598`, `living`, `pending-expense`). Label: "Is this the cost of hajj or a ziyarah, or of fulfilling a vow (nadhr) or an expiation (kaffārah) — not khums, zakat or another amount owed from an earlier year? (Ruling 1795; Tawdih Jami’ 598 ج)".
- **Source:** 1795 «The expenses incurred for hajj and other ziyārahs are considered part of one's living expenses» (`/english/book/48/2306/`). Jami' 598 group ج lists pilgrimage travel, vows and expiations; it does not list earlier khums or zakat (`/6160/`).
- **Regression:** base + RELIGIOUS_DUTY 6,000 {no} → `consult-pending`, total withheld. {yes} → 1,200.

### SA-5 Business equipment or other durable purchases deducted as costs of earning

- **Workflows:** annual, missed-year.
- **Location:** `annual-expense-2` (BUSINESS → `business-costs`); step `business-checked`.
- **Current behaviour:** only unsold stock is asked about (`business-stock-unsold`). A tool or vehicle bought this year and entered as a business expense is deducted in full.
  - Reproduced: base + business income 20,000, business cost 15,000 (a machine still owned) {stock-unsold no, line-loss no} → **COMPLETED 3,400**.
- **Proposed change:** add program question `business-costs-capital`. Label: "Were any of the business costs you entered spent on equipment, tools, vehicles, premises or other things the business still owns at the end of this khums year, rather than used up in earning (such as brokerage or transport)? (Ruling 1791; Tawdih Jami’ 737 الف)".

  In `sistaniBusiness`, directly after the `business-stock-unsold` check: `when(answer('business-costs-capital', false), <existing line-loss subtree>, consult('consult-business-capital'))`. Unanswered → missing answer.

  New consultation `consult-business-capital`, label: "Scholar review required: business costs include equipment, tools or other things still owned at the year’s end. Ruling 1791 deducts the costs of earning profit; Tawdih Jami’ 737 الف says work tools bought from the year’s income owe khums at current value, so the business profit is not calculated."

- **Source:** 1791 "costs incurred to earn the profit, such as brokerage, transport, and damage to tools" (`/2306/`). 737 الف «اگر مؤونه نبوده - مانند ابزار کار … - باید خمسش را به قیمت فعلی پرداخت نماید» (pack excerpt).
- **Regression:** the facts above with {capital yes} → `consult-business-capital`. {capital no} → 3,400.

### SA-6 Freelance or rental costs netted inside business costs (Sistani counterpart of K13)

- **Workflows:** annual, missed-year.
- **Location:** `annual-income-1` (FREELANCE and RENTAL → `earnings`); `annual-expense-2`; step `business-checked`.
- **Current behaviour:** freelance or rental costs can only be entered as business costs, so a loss on freelance work is silently offset against business profit. The line-loss question talks about "lines of your business" and does not mention that work.
  - Reproduced: base + freelance 3,000, business income 20,000, business costs 13,000 (8,000 of them freelance costs) {line-loss no} → **COMPLETED 4,400**.
  - If the freelance loss is not offset (1790), the figure is 7,000 business + 0 freelance. The total shown is lower than either reading allows.
- **Proposed change:** new category `work-earnings` (label "Earnings from freelance work or renting out property", rules sis-1769), mapping FREELANCE and RENTAL to it. Step `earnings` = sum('earnings', 'work-earnings').

  In `sistaniBusiness`, before the line-loss check, insert `when(present('work-earnings'), when(answer('business-costs-own-only', true), <rest>, consult('consult-work-costs')), <rest>)`.

  New question `business-costs-own-only`, label: "Were all the business costs you entered costs of the business income you entered only — none of them costs of freelance work, renting out property or other earnings entered separately? (Rulings 1790–1791)".

  New consultation `consult-work-costs`, label: "Scholar review required: some business costs may be costs of freelance or rental work entered as earnings. By obligatory precaution a loss in one kind of work does not offset profit in another (Ruling 1790; Jami’ 701), so each line’s figures are needed."

  A freelance cost with no business income already stops (`consult-business-loss`).

- **Source:** 1790: separate lines «cannot, based on obligatory precaution, offset the loss of one with the profit of the other». Jami' 701 «دو کسب مختلف».
- **Regression:** the facts above {own-only no} → `consult-work-costs`. {own-only yes} → 4,400. Salary-only scenarios are unchanged (the question is not asked).

### SA-7 Personal-item loan deducted in the year it is taken, and partial or earlier deductions not caught

- **Workflows:** annual, missed-year.
- **Location:** `annual-liability-1` leaves `debt-living-this-year=false > debt-personal-item=true > …`.
- **Current behaviour:**
  - Reproduced: base + LOAN 10,000 {living no, personal-item yes, spending-entered no, repaid-some no} → **COMPLETED 400**.
  - 1803 allows this debt only against the income of **later** years ("سال‌های بعد", "future years"). It allows only the part not already deducted («آن مقدار از بدهی»).
  - Note 7 (English) ends the deduction once the cumulative surplus since the loan reaches the outstanding balance.
  - The current question lumps "you still use it" with "have you not deducted this amount", so a partial earlier deduction would be deducted again in full.
- **Proposed change:** on the `debt-personal-item=true` branch, insert two questions before `notEnteredTwice`:
  1. `debt-item-bought-earlier`: "Did you buy the car, house or other item with this loan in an earlier khums year (not this one)? Ruling 1803 deducts such a debt from the income of later years. (Ruling 1803)". Yes → (2). No → `debts`. Invalid → consult-entry.
  2. `debt-item-first-surplus`: "Since you took this loan, has every earlier khums year ended with no profit left after living expenses, and have you never deducted any part of this debt before? (Ruling 1803 and its note 7)". Yes → `notEnteredTwice`. No → `debts`.

  Replace `debt-personal-item` with a new id `debt-personal-item-use`, label: "Is it a loan you used to buy something necessary for your personal use (such as a car or a house) that you still use and still owe money for? (Ruling 1803)".

- **Source:** Persian 1803: «ولی اگر با قرض وسیله‌ای مانند ماشین یا خانه … تا زمانی که بابت خرید آن شیئ بدهکار است و از آن شیئ استفاده می‌کند می‌تواند به مقدار بدهی خود، از درآمد سال‌های بعد کسر کند مشروط بر اینکه آن مقدار از بدهی را در سال‌های قبل کسر نکرده باشد». English note 7: "until the time the person's cumulative surplus income reaches the amount of the outstanding loan balance". Checked on `/persian/book/50/74/` and `/english/book/48/2306/`.
- **Regression:** the facts above:
  - {bought-earlier no} → `consult-debts`.
  - {bought-earlier yes, first-surplus no} → `consult-debts`.
  - {yes, yes, spending-entered no, repaid-some no} → 400.

### SA-8 Capital loss deducted without the khums-paid capital condition (C10 still open)

- **Workflows:** annual, missed-year.
- **Location:** `annual-expense-3` leaf `capital-loss-business=true → CAT capital-losses`.
- **Current behaviour:**
  - Reproduced: base + business income 20,000 + CAPITAL_LOSS 5,000 {business yes} → **COMPLETED 5,400**.
  - Capital bought from income a year had passed over, with khums unpaid, would reduce this year's profit.
- **Proposed change:** on the `capital-loss-business=true` branch, add yesNo(new `capital-loss-paid`, `capital-losses`, `pending-expense`). Label: "Was the lost capital, stock or tool bought with money on which khums had been paid, or money treated as khums-paid? If not, or you are not sure, answer No. (Tawdih Jami’ 684 «مخمّس یا در حکم مخمّس»)".
- **Source:** Jami' 684: «سرمایه در گردش مخمّس یا در حکم مخمّس … می‌تواند مقدار ضرر را با سود و درآمد همان سال جبران نماید». 685 الف treats theft and fire losses as a trade loss. Checked on `/persian/book/26576/6383/`. Over-stop note: 685 ب (tools) does not repeat the condition, so this question also stops tool losses.
- **Regression:** the facts above {paid no} → `consult-pending`. {paid yes} → 5,400.

### SA-9 Part outputs `khums-due` and `surplus` shown when a withheld item could change the year's profit (S7 widened)

- **Workflows:** annual, missed-year.
- **Location:** steps `surplus` and `khums`; outputs `surplus` ("Profit exceeding living expenses") and `khums-due` ("Of which on this year’s profit").
- **Current behaviour:** the stop texts themselves say these items "could change the khums due" or "may be part of this year’s profit". Yet the profit figures are shown:
  - Holdings: base + CASH 10,000 {paid no} → khums-total withheld, **khums-due 2,400, surplus 12,000 shown**.
  - Same for khums-paid merchandise (737 ب: a price rise is profit) → 2,400.
  - Mixed 1830 case → khums-due 2,400.
  - Treasure below niṣāb → khums-due 2,400.
  - Missed year 2 with holdings → year khums-due 2,400.
- **Proposed change:** in step `surplus`, before `pendingGate`, insert:
  1. `when(present('holdings'), consult('consult-holdings'), …)`
  2. then `when(present('pending-mixed','mixed-over-fifth'), consult('consult-mixed-other'), …)`
  3. then `when(present('mixed-khums','mixed-sadaqah','mixed-owner','mixed-group'), consult('consult-mixed-remainder'), …)`
  4. then `when(present('pending-special'), consult('consult-special'), …)`
  5. then (SA-10) `when(present('mined','treasure','diving'), consult('consult-special-remainder'), …)`

  Keep the same gates in `khums-total`; they become redundant but are harmless. The parts `khums-mined`, `khums-treasure`, `khums-diving`, `khums-mixed` and `khums-inheritance` stay visible: each rests on its own excerpt.

- **Source:** the pack's own consultation labels (`consult-holdings`, `consult-mixed-remainder`); 737 ب «مال‌التّجاره باشد که ترقّی قیمتش خمس دارد».
- **Regression:** each reproduction above → surplus and khums-due null, with the same stop id. Base alone → 2,400.

### SA-10 Total includes the khums of mined product, treasure or gems while the remainder's treatment is unaddressed (N1 class)

- **Workflows:** annual, missed-year.
- **Location:** step `khums-total`.
- **Current behaviour:** the four-fifths that remains after the khums of a mine, treasure or dive is never placed. It is not added to the year's profit and not asked about.
  - Reproduced: base + treasure 4,000 {niṣāb yes, own yes} → **COMPLETED 3,200**.
  - Reproduced: base + mined 5,000 {niṣāb yes} → **COMPLETED 3,500**.
  - The excerpts (1816 «خمس باقی را بدهد», 1825, 1836) settle the one-fifth, not the rest.
- **Proposed change:** in `khums-total`, after the `pending-special` gate, add `when(present('mined','treasure','diving'), consult('consult-special-remainder'), sum…)`. Add the same gate to `surplus` (SA-9).

  New consultation `consult-special-remainder`, label: "Scholar review required: what remains of a mined product, treasure or gems after their khums is not addressed by the transcribed rulings; whether it joins this year’s profit is not settled, so the total is not given. Their khums is shown as a part."

  If the scholar confirms the remainder is not liable again, drop this gate. Over-stop accepted until then.

- **Regression:** the treasure and mined facts above → khums-total, halves and remaining withheld (`consult-special-remainder`); khums-treasure 800 and khums-mined 1,000 shown.

---

## MEDIUM

### SA-11 Loan-funded living spending: status and 598 conditions never asked (F6 raised)

- **Workflows:** annual, missed-year.
- **Location:** steps `living` and `debts-deducted`; question `living-within-status`.
- **Current behaviour:** the debt question says not to enter the spending a loan paid for. The status question asks only about "the living expenses you entered". 1803's "living expenses" carry 1792's status condition.
  - Reproduced: salary 42,000 + living LOAN 4,000 {this year, entered no, repaid no}, no living entered → **7,600**. The loan's spending status is never asked.
  - Also, an unspent borrowed sum is deducted.
- **Proposed change:**
  - Change the `living-within-status` label to: "Were all your living expenses this year — those you entered and any paid with a loan you entered as a debt — in keeping with your status (not beyond it)? (Ruling 1792)". A new id is optional; use `living-within-status-all` if carry-over is a concern.
  - Append to the `debt-living-this-year` label: "…and did you spend it on those expenses this year?"
  - SA-3 already covers the 598 conditions.
- **Source:** 1803 «If he borrows money during the year to meet his living expenses …»; 1792 «provided that the amount spent is not beyond his status».
- **Regression:** the facts above with status = no → `consult-living-status`; yes → 7,600.

### SA-12 Khums paid for an earlier year lowers this year's "still to pay" (S10)

- **Workflows:** annual, missed-year.
- **Location:** `annual-expense-6` (KHUMS_PAID → `khums-paid`); step `khums-remaining`.
- **Current behaviour:**
  - Reproduced missed-year: year 2 entry KHUMS_PAID 2,400 (paid for year 1) → year 2 remaining 0, year 1 remaining 2,400. The aggregate is 2,400 COMPLETE.
  - Annual: base + KHUMS_PAID 1,000 → remaining 1,400, whatever year the payment was for.
  - A payment for year N made after year N cannot be dated inside year N's period.
- **Proposed change:** KHUMS_PAID → yesNo(new `khums-paid-this-year`, `khums-paid`, new category `khums-paid-other`). Label: "Was this payment khums on this khums year’s profit (paid during the year, as Ruling 1783 allows), not khums owed for an earlier year? (Ruling 1783)".

  Gate `surplus` with `when(present('khums-paid-other'), consult('consult-khums-paid-other'), …)`. New consultation label: "Scholar review required: a payment of khums owed for an earlier year was entered. How it affects this year’s profit and the amount still to pay is not settled by a transcribed rule."

- **Source:** 1783 «During the year, a person can pay khums on his profit whenever he acquires it» (`/2306/`).
- **Regression:** base + KHUMS_PAID 1,000 {no} → surplus, total and remaining withheld. {yes} → remaining 1,400.

### SA-13 Receivable ("money owed to you") goes through the "bought with khums-paid money" path

- **Workflows:** annual, missed-year.
- **Location:** `annual-asset-1`, subtype RECEIVABLE.
- **Current behaviour:** a receivable is not "bought". It may be unpaid wages or an unpaid sale price containing a 1787 gain.
  - Reproduced: base + RECEIVABLE 5,000 {paid yes, unpaid no, for-sale no} → **COMPLETED 2,400**.
- **Proposed change:** set `t['ASSET:RECEIVABLE'] = { to: 'category', id: 'holdings' }` after `holdingTargets` (→ `consult-holdings`).
- **Source:** 737 ب covers property «تهیّه کرده» (acquired). No excerpt addresses receivables.
- **Regression:** base + RECEIVABLE 5,000 → `consult-holdings`.

### SA-14 INVESTMENT_RETURN pooled with earnings (S15 earnings part)

- **Workflows:** annual, missed-year.
- **Location:** `annual-income-1`.
- **Current behaviour:** base + INVESTMENT_RETURN 2,000 → 2,800. Rental and freelance income is figure-neutral, because 1769 and 1770 both add it to profit on the same terms. But "investment return (e.g. dividends)" also takes bank interest or profit shares, whose lawfulness and duty are not addressed.
- **Proposed change (SCHOLAR DECISION; recommended for strict rule 1):** INVESTMENT_RETURN → `pending-income` (→ `consult-pending`) until the scholar confirms. Otherwise keep it and record it as scholar-confirmed.
- **Source:** 1770 (pack excerpt) covers wealth «از غیر کسب»; neither excerpt addresses interest.
- **Regression:** base + INVESTMENT_RETURN 2,000 → `consult-pending`.

### SA-15 BUSINESS_DEBT can be deducted as a "personal item" loan

- **Workflows:** annual, missed-year.
- **Location:** `annual-liability-1`, subtype BUSINESS_DEBT.
- **Current behaviour:** base + BUSINESS_DEBT 4,000 {living no, personal yes, entered no, repaid no} → **1,600**.
- **Proposed change:** `t['LIABILITY:BUSINESS_DEBT'] = { to: 'category', id: 'debts' }` (→ `consult-debts`).
- **Source:** 1803 covers living loans and personal-use items only.
- **Regression:** the facts above → `consult-debts`.

### SA-16 Label: "Total khums due" is gross when khums was already paid

- **Workflows:** annual, missed-year (including the aggregate label).
- **Location:** outputs `khums-total`, `sahm-imam` and `sahm-sadat`.
- **Current behaviour:** base + KHUMS_PAID 1,000 → "Total khums due (PROVISIONAL)" 2,400 next to remaining 1,400.
- **Proposed change:**
  - `khums-total` label: "Total khums of this year, before khums already paid (PROVISIONAL)".
  - Halves: "Half of the total khums: the Imam’s share (before khums already paid)" and "Half of the total khums: the sayyids’ share (before khums already paid)".
- **Regression:** label snapshot test.

---

## LOW

| Id    | Location                                    | Behaviour                                                                                                                                                                                       | Change                                                                                                                                                                                                                                    |
| ----- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SA-17 | step `living` / `debts-deducted`            | Status = no with no living expenses and no debts → `consult-living-status` (over-stop; reproduced: salary only, status no → withheld)                                                           | Wrap both in `when(present('living','debts-deductible'), …, zero)`                                                                                                                                                                        |
| SA-18 | question `treasure-nisab`                   | 1827 (finds close together counted together, far apart separately) not in the label                                                                                                             | Append "Count finds made close together as one, and finds made far apart separately (Ruling 1827)."                                                                                                                                       |
| SA-19 | C4 vs S5 answers                            | Living spending entered and paid by a loan (`debt-spending-entered` yes) contradicts `living-from-year-income` (loan is "other money"): a truthful "no" over-stops                              | Append to `living-from-year-income`: "Spending paid by a loan you entered as a debt counts as paid from this year’s income for this question (Ruling 1803)." Only if the maintainer accepts that reading; otherwise leave as an over-stop |
| SA-20 | missed-year aggregate                       | A year with no entries is COMPLETE at 0 (reproduced: year 2 empty → aggregate 2,400 COMPLETE)                                                                                                   | BY DESIGN (the user's statement); optionally show "no entries" on that year                                                                                                                                                               |
| SA-21 | output `khums-remaining` / `earlier-unpaid` | "Still to pay" excludes earlier unpaid khums entered (reproduced: unpaid 3,000 → remaining 2,400)                                                                                               | Label "Still to pay for this year (earlier unpaid khums is shown separately)"                                                                                                                                                             |
| SA-22 | `inheritance-khums` amount                  | Which value of the inherited property (at death or now) the one-fifth uses is not stated                                                                                                        | Append to the `inh-deceased-unpaid-due` help: "Enter the value of your share as received." Add a `TODO(rules)` and keep it as a scholar note                                                                                              |
| SA-23 | engine aggregate                            | A missed year that is UNRESOLVED only on a non-total output makes the aggregate PARTIAL with figures. Not reachable on the 0.9.0 Sistani program (every review output also stops `khums-total`) | None; keep the test                                                                                                                                                                                                                       |

---

## Status of earlier Sistani findings

| Finding                                   | Status                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C3 different kinds of business            | RESOLVED                                                                                                                                                                                                     |
| C4 loan double count                      | RESOLVED (residual answer conflict SA-19)                                                                                                                                                                    |
| C5 missed-year payments / aggregate       | RESOLVED; per-year attribution is SA-12                                                                                                                                                                      |
| C6 unsold stock                           | RESOLVED; equipment purchases are SA-5                                                                                                                                                                       |
| C7 Jami' 620 pension                      | RESOLVED (encoding matches the stated case)                                                                                                                                                                  |
| C9 / S1 sales netted                      | RESOLVED (every 1787 sale stops)                                                                                                                                                                             |
| C10 capital must be khums-paid            | OPEN → SA-8                                                                                                                                                                                                  |
| C11, C12 first-time                       | Out of scope (first-time reviewer). Annual half of C12 RESOLVED (S6)                                                                                                                                         |
| C19 / S11 owner group                     | RESOLVED                                                                                                                                                                                                     |
| C20 / B1 rounding                         | BY DESIGN (maintainer decision)                                                                                                                                                                              |
| T1–T6                                     | RESOLVED per corrections reports (not re-verified here)                                                                                                                                                      |
| T7–T10                                    | Not pack content; OPEN LOW per earlier reports (not re-verified)                                                                                                                                             |
| S2 inheritance owed elsewhere             | RESOLVED; new label precision is SA-2                                                                                                                                                                        |
| S3, S4 capital loss                       | RESOLVED; condition gap is SA-8                                                                                                                                                                              |
| S5 living source                          | RESOLVED; conditions 3–5 are SA-3                                                                                                                                                                            |
| S6 merchandise (annual)                   | RESOLVED                                                                                                                                                                                                     |
| S7 treasure below niṣāb, parts shown      | OPEN → SA-9                                                                                                                                                                                                  |
| S8 sale without cost                      | RESOLVED                                                                                                                                                                                                     |
| S9 / N2 debt amount                       | RESOLVED. Note 7 and the Persian «به مقدار بدهی» support the outstanding amount, and a repaid part stops. Personal-item gaps are SA-7                                                                        |
| S10 khums paid for another year           | OPEN → SA-12                                                                                                                                                                                                 |
| S12, S13, S14                             | Out of scope (first-time)                                                                                                                                                                                    |
| S15 interpreted mappings                  | Living part largely supported by Jami' 598 ج (education, medical treatment, travel, donations, vows, expiations): RESOLVED BY SOURCE, except RELIGIOUS_DUTY → SA-4. Earnings part → SA-14 (SCHOLAR DECISION) |
| S16 holdings never block total            | RESOLVED (0.6.0); parts → SA-9                                                                                                                                                                               |
| N1 mixed remainder                        | RESOLVED; same class for mine, treasure and diving → SA-10                                                                                                                                                   |
| N3 inherited holdings, unpaid             | RESOLVED; 1771 exceptions → SA-1                                                                                                                                                                             |
| F1                                        | OPEN → SA-1                                                                                                                                                                                                  |
| F2–F5                                     | Out of scope (first-time)                                                                                                                                                                                    |
| F6 debt status                            | OPEN → SA-11                                                                                                                                                                                                 |
| F7 "(or similar)"                         | First-time label (out of scope). Annual counterpart closed by SA-1                                                                                                                                           |
| Lows: BUSINESS_DEBT path                  | OPEN → SA-15                                                                                                                                                                                                 |
| Lows: gross total label                   | OPEN → SA-16                                                                                                                                                                                                 |
| Lows: earlier-unpaid                      | SA-21                                                                                                                                                                                                        |
| Lows: empty year                          | SA-20                                                                                                                                                                                                        |
| Lows: 1851 halves on 1830 khums           | MOOT (a mixed amount withholds the total)                                                                                                                                                                    |
| Lows: contradictory loan / source answers | SA-19                                                                                                                                                                                                        |

---

## Must remain scholar-review stops (no figure)

- Business loss.
- A losing line next to a profitable line, unless the lines are the same kind of business and share one account.
- Unsold stock.
- Capital loss beyond the business profit.
- Every 1787 sale, or a purchase price entered for one.
- Pension or benefit outside the 620/624/626 case.
- "Other" income and expenses.
- Asset purchases.
- Debts outside 1803, and partly repaid loans.
- Unexpected inheritance with unpaid khums, taʿṣīb with unpaid khums, khums the deceased owed on other property.
- Treasure below niṣāb or not the finder's to keep; gems below niṣāb.
- Every mixed-funds case (total withheld; other duties listed).
- Holdings not from khums-paid or qualifying inherited money; khums-paid merchandise.
- Overpaid khums.
- Estimates, ranges and approximate dates (consult-entry).
- New stops from this review: SA-1 (b, c), SA-3 no, SA-4 no, SA-5 yes, SA-6 no, SA-7, SA-8 no, SA-9, SA-10, SA-12 no, SA-13, SA-14, SA-15.

Over-stops that a text arguably settles (acceptable; listed for the scholar):

- A home, personal item or household item bought from this year's income is listed as holdings (1792 names "purchase of a house").
- A living loan from an earlier year with no profit → `consult-debts` (1803 plainly says it is not deductible).
- A business trade loss → stop (Jami' 684 offsets it with "سود و درآمد همان سال").
- SA-8 stops tool losses (685 ب has no khums-paid condition).
- SA-10, if the remainder is in fact not liable again.

Temporary test file `packages/core/src/provisional/zz-review-sis-annual.tmp.test.ts`: created, run, and **deleted**. No other repository file was touched.
