# Sistani scholar-review pack 0.9.0: first-time workflow (Tawdih Jami’ 736–744). Complete review

Reviewer scope: every `ft-*` mapping rule and leaf, the `firstTime` program and its outputs, and every
earlier Sistani first-time finding. Nothing in the repository was changed. Reproductions ran in one temp
test (`packages/core/src/provisional/zz-review-sis-ft.tmp.test.ts`, which went through
`prepareAssessmentInput`, then `calculate(…, {mode:'scholar-review'})`). That file has been deleted.
Raw run log: `<scratchpad>/review/sis-ft-run.txt`.

Every figure below is a TECHNICAL expectation under the provisional transcriptions, never a religious
answer. Every proposed change is either (a) a consult stop or (b) a question or option for a distinction
the cited masʾalah states explicitly. Each such distinction is quoted. No ruling, rate or exemption is
proposed.

## Office pages checked (2026-11-23)

The fetch tool returns summaries, plus short quotes it is allowed to give.

- 736: https://www.sistani.org/persian/book/26576/6550/
- 737 (الف–ه, closing savings paragraph, notes 1–6): https://www.sistani.org/persian/book/26576/6551/
- 738 (notes 1–2): https://www.sistani.org/persian/book/26576/6552/
- 739–744 (notes 1–9): https://www.sistani.org/persian/book/26576/6553/

What the pages show that matters here:

- **737 الف.** The text reads «با درآمد بین سال». The used-necessity condition is «در همان سال از آن استفاده کرده». The examples of things that are not living necessities are «مانند ابزار کار، مال التّجاره، وسایلی که جزء لوازم فعلی زندگی نیست». There is no status condition and no footnote. The clause does not cover a year that has not ended.
- **737 ب.** «با مال مخمّس یا در حکم مخمّس مثل ارث … خمس ندارد؛ مگر آنکه مال‌ التّجاره باشد». Note 1 refers to 645 and 647.
- **737 ج.** Kulli price: «پرداخت خمس به قیمت خرید کافی است». Merchandise exception: «مگر آنکه مال التّجاره باشد که چنانچه قیمت آن افزایش یافته». Specific price: «به ثمن شخصی از فروشنده‌ای که شیعۀ دوازدۀ امامی است خریده».
  - Note 4 defines kulli and gives as examples cash from the pocket, card or account transfer, and cheque.
  - Note 5 uses «مثل 20 برابر یا بیشتر» as an example of extraordinary devaluation, not as a threshold.
  - Note 6 is the inflation note, «ناشی از تورّم و کاهش ارزش پول». It is attached to clause ج.
- **737 د.** «سهم هر مورد را مشخّص نموده و نسبت به هر مورد، باید به حکم همان عمل نماید». The page does not say how a share is measured.
- **738.** «اموالی که هنگام محاسبۀ خمس موجود نیستند و تلف شده‌اند یا در هزینه‌های جاری زندگی یا کسب و کار مصرف شده‌اند».
  - The examples include stolen merchandise and payments of debts.
  - The year-old-income condition is worded on «آن هزینه‌ها». Whether it also governs destroyed property is not stated explicitly.
- **739–744.** All six concern purchased property, never cash held on its own.
  - 740 covers non-trade property: ب is current value; الف and ج are settled by probabilities.
  - 741 covers merchandise: current value.
  - 742 covers household items: always settlement.
  - 743 covers a necessity bought from in-year income where use in that year is unknown: settlement if the item exists.
  - 744 covers a doubt between inherited money and in-year income: settlement if the property exists. Note 8 refers gifts to 602.
  - Notes 1–2 (740–742): the seller and buyer are assumed Twelver Shia, and the rise is assumed not to come from inflation. Other cases are omitted.

## Severity counts

| Severity | Count | Items                                                  |
| -------- | ----- | ------------------------------------------------------ |
| CRITICAL | 0     | —                                                      |
| HIGH     | 8     | SF-01, SF-02, SF-03, SF-04, SF-05, SF-06, SF-07, SF-08 |
| MEDIUM   | 8     | SF-09, SF-10, SF-11, SF-12, SF-13, SF-14, SF-15, SF-16 |
| LOW      | 4     | SF-17, SF-18, SF-19, SF-20                             |

---

## HIGH

### SF-01 HIGH: a purchase-price entry is not linked to its asset entry, so the price khums is dropped or counted twice (F3)

**Location.** Three places:

- `ft-asset` > `ft-asset-source`=old > `ft-old-purchase`=ordinary: for-trade=false → EXCLUDE; for-trade=true + `ft-trade-risen`=false → EXCLUDE.
- `ft-purchase` > `ft-spent-source`=old > `ft-price-basis` (price → `ft-old-spent`; item → EXCLUDE).
- Step `khums-total`.

**Current behaviour (reproduced on 0.9.0).**

- **Price dropped.** LAND 100,000 is answered old income / ordinary / not for trade, and no price entry is made → COMPLETED, total **0**.
- **Price dropped another way.** The same land plus ASSET_PURCHASE 20,000 answered old / “khums on the item’s current value” → COMPLETED **0**.
- **Counted twice.** Land answered old / specific / not inflation (ft-assets 20,000) plus price 20,000 answered old / price / not devalued (4,000) → COMPLETED **24,000**.
- **Price charged against a contradicting asset answer.** HOME 300,000 answered same-year income / used (excluded) plus price 20,000 answered old / price → COMPLETED **4,000**. The asset answer says in-year income.
- **Two assets, one price.** Land and a car, both ordinary / not trade, plus one price entry → COMPLETED **4,000**. One item’s price khums is lost.
- The `ft-old-purchase` label itself says to add the price for any “ordinary purchase”. That includes merchandise whose price has risen, so following the label produces the double count.

**Engine finding.** The expression vocabulary has `compare` on category sums and `all`/`any`/`not`, but no entry count and no fact-to-fact link. So exact pairing needs an engine feature. Pack-only presence checks can close the drop and every one-sided case, but not the case of N assets with M ≠ N prices.

**Proposed change (pack-only, implement now).**

1. New categories:
   - `ft-assets-old`: “Assets bought with income a khums year had passed over, khums on current value (737 ج)”. It is summed.
   - `ft-price-assets`: “Assets bought with year-old income by an ordinary purchase; their khums is on the price entered separately (737 ج, note 5)”. It is never summed and is used only in conditions.
   - `ft-old-price`: “Prices paid from year-old income for things still owned (737 ج, note 5)”. It is summed.
   - `ft-price-item`: “Prices of things whose khums is on their current value (not counted)”. It is never summed and is used only in conditions.
2. Asset leaves, under `ft-asset-source` (renamed in SF-03) = old:
   - `OLD.specific` > `ft-rise-not-inflation`=yes → `ft-assets-old` (was `ft-assets`).
   - `OLD.ordinary` > for-trade=yes > risen=yes > not-inflation=yes → `ft-assets-old` (was `ft-assets`).
   - `OLD.ordinary` > for-trade=no, and `OLD.ordinary` > for-trade=yes > risen=no: replace EXCLUDE with `yesNo('ft-price-entered', category('ASSET','ft-price-assets'), consult('consult-ft-link'))`.
3. New question `ft-price-entered` (boolean): “Have you added the price you paid for THIS item as its own entry ‘Price paid for something you still own’, paid from income a khums year had passed over, one entry for this item only? Its khums is on that price (Tawdih Jami’ 737 ج, note 5).”
4. Change the `ft-old-purchase` label: “How was it bought? Add the price you paid as its own entry only for an ordinary purchase that is not merchandise whose price has risen (Tawdih Jami’ 737 ج).”
5. `ft-purchase` > `ft-spent-funds` (SF-02) = old: first `yesNo('ft-price-item-owned', <basis>, category('EXPENSE','ft-pending'))`.
   - New question `ft-price-item-owned` (boolean): “Do you still own the item bought with this price, and is it entered as its own asset entry at its current value? (Tawdih Jami’ 737 ج)”
   - Then `ft-price-basis`, with new choices (old strings removed):
     - “Its item is entered as ‘An ordinary purchase’ and is not merchandise whose price has risen: its khums is on this price” → the value-loss question (SF-12) → `ft-old-price`.
     - “Its item is entered with its khums on its current value (merchandise whose price has risen, or bought with that specific money)” → `ft-price-item` (was EXCLUDE).
     - “Neither, or I am not sure” → `ft-pending`.
6. Program. Add a condition `LINK` = any of:
   - `all(present(ft-price-assets), not(present(ft-old-price)))`
   - `all(present(ft-old-price), not(present(ft-price-assets)))`
   - `all(present(ft-price-item), not(present(ft-assets-old)))`
   - `all(present(ft-old-price), present(ft-assets-old))`
   - `all(present(ft-price-item), present(ft-price-assets))`

   Then:
   - New step `review-link` = `when(LINK) consult('consult-ft-link') else 0`. Output label: “Price and item check (0 = consistent; not an amount)”.
   - `khums-total` checks `LINK` → `consult-ft-link` straight after the split check.
   - Step `ft-assets` = fifth of `sum(ft-assets, ft-assets-old)`.
   - Step `ft-old-spent` = fifth of `sum(ft-old-spent, ft-old-price)`.

7. New consultation `consult-ft-link`: “Scholar review required: the purchase prices and the items they bought do not match (Tawdih Jami’ 737 ج: the khums of an ordinary purchase from year-old income is on its price; that of merchandise whose price has risen, or a specific-money purchase, on its current value). No total is calculated.”
8. The last two `LINK` clauses deliberately over-stop. A sheet that legitimately holds both an ordinary-purchase item with its price and a current-value item from year-old income gets no total. That is the price of being fail-safe without an engine feature.

**Engine feature (needed to un-block mixtures and catch N ≠ M).** Choose one:

- (a) A new expression `countCategory` (number of entries), so that `count(ft-price-assets) = count(ft-old-price)` and `count(ft-price-item) ≤ count(ft-assets-old)`. This needs structure validation, readiness walking, evaluator support, Zod support and tests, plus a `schemaVersion` decision.
- (b) A real link: an optional `forFactId` on EXPENSE:ASSET_PURCHASE facts and a mapping check that the linked fact is an ASSET answered “ordinary”. This needs a fact-sheet schema version and UI.

Option (b) is the only complete fix. With (a), a false answer to `ft-price-item-owned` / `ft-price-entered` can still misplace a price.

**Source basis.** 737 ج, «پرداخت خمس به قیمت خرید کافی است» (kulli), and for the specific-money purchase «پرداخت خمس به قیمت فعلی واجب می‌باشد». Note 5: «کافی است خمس پول سالگشت شده‌ای که بابت بهای مال به فروشنده داده را بپردازد». Checked on office page /6551/.

**Regression tests (corrected pack).**

- Land ordinary / not trade / `ft-price-entered`=no → mapping `CONSULTATION_REQUIRED` [`consult-ft-link`].
- Land ordinary / not trade / entered=yes, with no price entry → UNRESOLVED [`consult-ft-link`], total null.
- Land ordinary + price old / owned / basis “ordinary” / value-loss “No” → COMPLETED 4,000 (the price khums only).
- Land specific / not inflation + price “ordinary” basis → UNRESOLVED [`consult-ft-link`].
- Land specific + price “current value” basis → COMPLETED 20,000.
- Home same-year used + price old / “ordinary” → UNRESOLVED [`consult-ft-link`].
- Land ordinary + price basis “current value” → UNRESOLVED [`consult-ft-link`].
- Price with `ft-price-item-owned`=no → UNRESOLVED [`consult-ft-pending`].
- Basis “Neither, or I am not sure” → [`consult-ft-pending`].

### SF-02 HIGH: spending and prices paid from “khums-paid or inherited money” are excluded without the deceased’s-unpaid-khums question or the 1771 exceptions (F2)

**Location.** `ft-purchase` and `ft-expense` > `ft-spent-source`=“Money on which khums was paid, or inherited money” → EXCLUDE.

**Current behaviour.**

- TRAVEL 10,000 from “paid or inherited” → COMPLETED **0**.
- ASSET_PURCHASE 20,000 from the same → COMPLETED **0**.
- `holding-inherited-unpaid`, `inh-unexpected` and `inh-valid-rules` are never asked.

**Proposed change.** Replace the question with `ft-spent-funds` (new id, so old answers do not carry over). Choices and leaves:

1. “Income of the same khums year” → as SF-11 for living expenses; `ft-purchase` and BUSINESS → EXCLUDE (unchanged).
2. “Income a khums year had passed over, without khums paid on it” → as now. Purchase: SF-01 step 5. Living or business: `ft-spent-negligent`.
3. “Money on which khums was paid (not inherited, not a gift)” → EXCLUDE sis-737.
4. “Inherited money” → `INH(exclude(sis-737))` (defined below).
5. “Partly from different kinds of money” → `ft-pending`.
6. “Gift money, or another source not listed” → `ft-pending`.
7. “I do not know” → `ft-pending`.

`INH(x)` = `yesNo('inh-unexpected', pending, yesNo('inh-valid-rules', yesNo('holding-inherited-unpaid', pending, x), pending))`. It reuses the existing question ids and labels, with rules sis-1771 and sis-1772. Here `pending` = `category(kind,'ft-pending')`.

**Source basis.** 737 ب, «در حکم مخمّس مثل ارث». The 1771 exceptions (unexpected inheritance; inheritance not under valid rules) and 1772 (unpaid khums of the deceased) are already transcribed in the pack (`sis-1771`, `sis-1772`). Routing their “yes” cases to a stop adds no ruling.

**Regression tests.**

- TRAVEL from “Inherited money” with unexpected=no, valid=yes, unpaid=no → COMPLETED 0.
- … with unpaid=yes → UNRESOLVED [`consult-ft-pending`].
- … with unexpected=yes → [`consult-ft-pending`].
- “Gift money…” → [`consult-ft-pending`].
- An old answer string “Money on which khums was paid, or inherited money” → `NEEDS_CLARIFICATION` (the answer is invalid).

### SF-03 HIGH: assets and balances from “khums-paid or inherited money (or similar)” are excluded without the 1771 exceptions, and gifts and items received rather than bought fall under “(or similar)” (F1 first-time half, F7)

**Location.**

- `ft-asset` > `ft-asset-source`=paid > `holding-inherited-unpaid`=no > for-trade=no → EXCLUDE.
- `ft-balance` > `ft-cash-source`=paid > unpaid=no → EXCLUDE.

**Current behaviour.**

- LAND 100,000 from paid/inherited, unpaid=no → COMPLETED **0**.
- BANK 10,000 the same way → COMPLETED **0**.
- `inh-unexpected` and `inh-valid-rules` are not asked.
- A gifted item has no option of its own. The question asks “What money was it bought with?”, and only “(or similar)” fits, which excludes it, although a gift is income (1770).

**Proposed change.**

New question `ft-asset-funds`, which replaces `ft-asset-source`. Label: “This asset’s amount must be its CURRENT value. How did you get it, or what money was it bought with? (Tawdih Jami’ 736–737)”. Choices and leaves:

1. “Income of a khums year that has ended, and I bought it in that same year” → `ft-asset-use` (BUSINESS_STOCK: SF-06).
2. “Income of my current khums year (that year has not ended yet)” → `ft-pending` (SF-05).
3. “Money on which khums was paid (not inherited, not a gift)” → `forTrade(ft-pending, exclude(sis-737))`.
4. “Inherited money, or the item itself was inherited” → `INH(forTrade(ft-pending, exclude(sis-737)))`.
5. “Income a khums year had passed over, without khums paid on it” → `ft-old-purchase` (SF-01, SF-13).
6. “Partly from different kinds of money” → `ft-split` (see SF-15).
7. “Income, but I do not know if it was year-old income or income of that year” → the unknown chain (SF-16).
8. “Not known: it may also have been inherited, gifted or khums-paid money” → `ft-pending`.
9. “A gift or prize, bought with gift money, or another source not listed” → `ft-pending`.

New question `ft-cash-funds`, which replaces `ft-cash-source`. Choices:

1. “Saved from income, and a khums year has passed over it” → SF-09 → `ft-cash`.
2. “Income of my current khums year (that year has not ended yet)” → EXCLUDE sis-736, sis-1783.
3. “Money on which khums was paid (not inherited, not a gift)” → EXCLUDE sis-737.
4. “Inherited money” → `INH(exclude(sis-737))`.
5. “Partly from different kinds of money” → SF-10.
6. “Gift money, or another source not listed” → `ft-pending`.
7. “I do not know” → `ft-pending`.

**Source basis.** 737 ب «مثل ارث»: inheritance is the only example named. Note 8 to 744 refers gifts to 602. Sis-1770 and sis-1771 are in the pack. Office page /6551/ and /6553/.

**Regression tests.**

- Land “Inherited…” with unexpected=no, valid=yes, unpaid=no, trade=no → COMPLETED 0.
- … with unexpected=yes → [`consult-ft-pending`].
- … with valid=no → [`consult-ft-pending`].
- Land “A gift or prize…” → [`consult-ft-pending`].
- Bank “Inherited money” with unexpected=yes → [`consult-ft-pending`].
- Bank “Money on which khums was paid…” → COMPLETED 0.

### SF-04 HIGH: 738 is applied to CAPITAL_LOSS, SOLD_ITEM_COST and EXPENSE:OTHER (F4, S13, earlier low on OTHER)

**Location.** `ft-expense` > `ft-spent-source`=old > negligent=no → `ft-old-spent`, for the subtypes CAPITAL_LOSS, SOLD_ITEM_COST and OTHER. Answered same-year, these are EXCLUDED.

**Current behaviour.** 10,000 from old income, not negligent → COMPLETED **2,000** each, for CAPITAL_LOSS, SOLD_ITEM_COST and OTHER.

**Why this stops.**

- **CAPITAL_LOSS.** 738 does cover destroyed property, and lists stolen merchandise. But the app subtype also covers wear and damage, which are not «تلف». The year-old-income condition is worded on «آن هزینه‌ها», and the amount basis for destroyed merchandise (price or value) is not stated.
- **SOLD_ITEM_COST.** The price of an item sold this year is neither spent nor destroyed. It is converted into proceeds, so khums transfers under 737 ج / 1787, and none of that is stated here.
- **OTHER.** It has no defined subject.

**Proposed change.** Split the rule:

- `ft-expense` (HOUSEHOLD, HOUSING, EDUCATION, HEALTH, TRAVEL, BUSINESS, DONATION, RELIGIOUS_DUTY): unchanged, plus SF-02 and SF-11.
- New `ft-expense-review` (CAPITAL_LOSS, SOLD_ITEM_COST, OTHER) → `category('EXPENSE','ft-pending')`, with ruleIds sis-737 and sis-738.
- Extend the `consult-ft-pending` label with “…, a loss, the cost of something sold, or another expense …”.

Note: this over-stops the stolen-merchandise case that 738 names, because the amount basis for it is not stated.

**Source basis.** 738: «تلف شده‌اند یا در هزینه‌های جاری زندگی یا کسب و کار مصرف شده‌اند … چنانچه آن هزینه‌ها از درآمد سالگشت». Office page /6552/.

**Regression tests.** Each of the three subtypes, 10,000 from old income → UNRESOLVED [`consult-ft-pending`]. From same-year income → also [`consult-ft-pending`] (no answer is needed).

### SF-05 HIGH: an asset bought with income of the current, unfinished khums year is charged one-fifth, while current-year cash is excluded (F5, S12)

**Location.** `ft-asset` > source=sameYear > use=notNecessity → `ft-assets`.

**Current behaviour.** Gold 4,000, same-year / not a necessity → COMPLETED **800**. Current-year cash is excluded with sis-736 and sis-1783.

**Proposed change.** Add choice 2 of `ft-asset-funds` (SF-03), “Income of my current khums year (that year has not ended yet)”, → `ft-pending`. Make choice 1 say explicitly that the year has ended.

**Source basis.** 736: khums is paid on income «که انتهای هر سال باقی مانده». 737 الف «درآمد بین سال» does not address a running year. Office pages /6550/ and /6551/.

**Regression tests.**

- Gold “current khums year” → UNRESOLVED [`consult-ft-pending`].
- Gold “ended year, bought in it” / not a necessity / `ft-value-current`=yes → COMPLETED 800.

### SF-06 HIGH: merchandise (BUSINESS_STOCK) answered “necessity used” or “not for trade” is excluded

**Location.** `ft-asset` (BUSINESS_STOCK):

- sameYear > use=used → EXCLUDE.
- old > ordinary > for-trade=no → EXCLUDE.
- paid > unpaid=no > for-trade=no → EXCLUDE.

**Current behaviour.** Stock 50,000 → COMPLETED **0** on each of these three paths.

**Proposed change.** New rule `ft-stock` (BUSINESS_STOCK only; remove that subtype from `ft-asset`) built with `assetAction(stock = true)`:

- `forTrade(a, b)` becomes `a`, so `ft-for-trade` is not asked.
- Choice 1 skips `ft-asset-use` and goes to `valueNow(ft-assets)` (SF-09).
- Every other leaf is as for `ft-asset`.

**Source basis.** 737 الف lists «مال التّجاره» among things that are not necessities. 737 ب «مگر آنکه مال‌ التّجاره باشد». 737 ج has the merchandise exception. Office page /6551/.

**Regression tests.**

- Stock, ended-year income → COMPLETED 10,000 (`ft-value-current`=yes).
- Stock, old / ordinary / risen / not inflation → 10,000.
- Stock, old / ordinary / not risen / price entered → `ft-price-assets` (SF-01 rules apply).
- Stock “khums paid…” → [`consult-ft-pending`].

### SF-07 HIGH: a receivable (money owed to the person) is treated as a bought asset

**Location.** `ft-asset` (RECEIVABLE), every leaf.

**Current behaviour.**

- Receivable 10,000, “same-year, not a necessity” → COMPLETED **2,000**.
- The same receivable, “old / ordinary / not trade” → COMPLETED **0**.

737 is about property that was bought. A loan given is neither bought property nor cash in hand, and 736–744 do not mention it. This is the analogue of Khamenei K12.

**Proposed change.** New rule `ft-asset-review` (RECEIVABLE; remove it from `ft-asset`) → `category('ASSET','ft-pending')`. Extend the `consult-ft-pending` label with “money owed to you”.

**Source basis.** 737’s subject is «اموال … تهیّه کرده». No clause of 736–744 covers a receivable (office pages /6551/ and /6553/).

**Regression test.** Receivable 10,000 → UNRESOLVED [`consult-ft-pending`].

### SF-08 HIGH: spending of in-year income is excluded without the conditions that make it a living expense

**Location.** `ft-expense` > `ft-spent-source`=sameYear → EXCLUDE, for the living subtypes.

**Current behaviour.** HOUSEHOLD, TRAVEL or DONATION 10,000 from same-year income → excluded. Spending beyond one’s status is excluded with no question. 736 excludes only what was spent «در مؤونۀ آن سال», and living expense has conditions (598: within status, not extravagant, needed). The annual workflow asks `living-within-status`. This matches Khamenei N6, which was rated HIGH.

**Proposed change.**

- For HOUSEHOLD, HOUSING, EDUCATION, HEALTH, TRAVEL, DONATION and RELIGIOUS_DUTY, “Income of the same khums year” → `yesNo('ft-spent-within-status', exclude(sis-737, sis-598), category('EXPENSE','ft-pending'))`.
- New question `ft-spent-within-status` (boolean): “Was this spending in keeping with your status, needed, and not extravagant or unlawful? (Tawdih Jami’ 598; 736 «صرف در مؤونۀ آن سال»)”.
- BUSINESS keeps EXCLUDE: it is a cost of earning (738 «کسب و کار»).
- 737 الف (necessity bought from in-year income and used) keeps no status question, because its text states none.

**Source basis.** 736 (office page /6550/). Sis-598, whose excerpt lists the five conditions.

**Regression tests.**

- TRAVEL same-year, within status=yes → COMPLETED 0.
- … =no → [`consult-ft-pending`].
- BUSINESS same-year → 0 (no question).

---

## MEDIUM

### SF-09 MEDIUM: a past valuation is used as the “current value”

**Location.** Every leaf ending in `ft-assets`, `ft-assets-old` or `ft-cash`. The date policy reads `valuedOn`. For first-time sheets, the engine checks only that the date is not after `assessmentDate`.

**Current behaviour.**

- Gold valued on 2020-01-01 at 4,000 (assessment 2026-03-01) → COMPLETED 800.
- A bank balance valued on 2020-01-01 → COMPLETED 2,000.

The `ft-asset-source` label asks for the CURRENT value, but nothing enforces it.

**Proposed change (pack-only).**

- `valueNow(c)` = `yesNo('ft-value-current', category(kind, c), consult('consult-entry'))`. Wrap every `ft-assets`, `ft-assets-old` and `ft-cash` leaf in it.
- New question `ft-value-current` (boolean): “Is the amount entered this item’s value, or this balance, on the assessment date, not an earlier value? (Tawdih Jami’ 737: khums «به قیمت فعلی»)”.
- Optional engine follow-up: a `DatePolicy` option that requires `valuedOn` = `assessmentDate`.

**Source basis.** 737 الف and ج, «به قیمت فعلی» (office page /6551/).

**Regression tests.**

- Gold, `ft-value-current`=no → `CONSULTATION_REQUIRED` [`consult-entry`].
- … =yes → 800.

### SF-10 MEDIUM: a balance of mixed origin has no “partly” option

**Location.** `ft-balance` > `ft-cash-source`.

**Current behaviour.** A balance that is partly old savings and partly current salary must be answered as one kind. “current” gives COMPLETED **0**; “old” gives **2,000** on 10,000.

**Proposed change.**

- Choice 5 of `ft-cash-funds`, “Partly from different kinds of money”, → new category `ft-cash-parts`, which is never summed.
- `khums-total` checks `present(ft-cash-parts)` → new consultation `consult-ft-cash-parts`: “Enter each part of this balance as its own entry with its own source (Tawdih Jami’ 736–737). No amount is calculated for a balance of mixed origin.”
- Add `ft-cash-parts` to the parts gate (SF-11).

**Source basis.** 737 د «سهم هر مورد را مشخّص نموده». For cash the share is a plain amount.

**Regression test.** Bank “Partly…” → UNRESOLVED [`consult-ft-cash-parts`].

### SF-11 MEDIUM: parts are shown under a withheld total and can be read as the amount due

**Location.** Steps and outputs `ft-assets`, `ft-cash`, `ft-old-spent` (labels “Of which …”).

**Current behaviour.**

- Bank old 10,000 plus a KHUMS_PAID entry → total null, **ft-cash 2,000** shown (khums was partly paid).
- The same 2,000 is shown with a debt, an income entry, a negligent-spending settlement, or a split asset.

The web adds a “partial” caution, but the pack labels still say “Of which”. After SF-01, an `ft-old-spent` part could also show a price that fails the link check.

**Proposed change.**

- New first step `ft-gate`:
  `when(any(present(ft-split), present(ft-cash-parts), LINK, present(ft-pending), present(ft-debts), present(ft-settle))) consult('consult-ft-parts-withheld') else 0`.
- New consultation `consult-ft-parts-withheld`: “Parts are not shown while the total is withheld: an entry needs review, settlement or re-entry first.”
- Each part becomes `when(<same condition>) consult('consult-ft-parts-withheld') else fifthOf(...)`.
- Relabel the outputs to “Part on assets at current value”, “Part on cash and savings” and “Part on money paid out from year-old income”.
- Scenario “Masāʾil 736–744 do not say how a debt affects…” then expects `ft-cash` null.

**Source basis.** CLAUDE.md, Web UI rules: never make provisional output look final. This is engineering, not a ruling.

**Regression tests.**

- Bank old + KHUMS_PAID → `ft-cash` null.
- Bank old + LOAN → `ft-cash` null.
- Bank old alone → `ft-cash` 2,000, total 2,000.

### SF-12 MEDIUM: note 5’s example (“20 times or more”) is used as a threshold

**Location.** `ft-purchase` > old > price > `ft-money-devalued`=false → `ft-old-spent`.

**Current behaviour.** Money that lost a tenth of its value, answered “no”, gives a figure (price 20,000 → 4,000). Note 5 makes «کاهش ارزش فوق‌العاده» a settlement and only gives «مثل 20 برابر یا بیشتر» as an example.

**Proposed change.** Replace it with the choice question `ft-money-value-loss`. Label: “Since you paid this price, has money lost an extraordinary amount of its value? (Tawdih Jami’ 737 note 5, for example 20 times or more)”. Choices:

- “No, not an extraordinary loss” → `ft-old-price`.
- “Yes, an extraordinary loss” → `ft-settle`.
- “I am not sure” → `ft-pending`.

**Source basis.** 737 note 5 (office page /6551/).

**Regression tests.** “I am not sure” → [`consult-ft-pending`]. “Yes…” → [`consult-ft-settlement`]. “No” → 4,000.

### SF-13 MEDIUM: there is no “I do not know how the price was paid” option for year-old income (739)

**Location.** `ft-old-purchase`.

**Current behaviour.** The choices are ordinary / specific Shia-risen / “something else (specific money but another seller, or not risen)”. A person who does not know the payment form is pushed to “ordinary”, which excludes the asset and charges only the price. If the purchase was really specific money, the current value is due under 737 ج, and that is lost.

**Proposed change.** Add the choice “I do not know how the price was paid” → `ft-pending`.

**Source basis.** 739 covers not knowing «… یا نحوۀ پرداخت ثمن» (the pack’s sis-739 summary) with an obligatory-precaution settlement. The page shows 739 only together with a doubt about which year’s income, so this goes to review rather than settlement. Office page /6553/; note 4 on /6551/.

**Regression test.** Land old / “I do not know how the price was paid” → [`consult-ft-pending`].

### SF-14 MEDIUM: there is no “do not know if I used it in that year” option for a necessity (743)

**Location.** `ft-asset-use`.

**Current behaviour.** Only used / not a necessity / not used. Someone unsure picks “used”, which is excluded (0).

**Proposed change.** Add the choice “A necessity, but I do not know if I used it in that same year” → `ft-settle`.

**Source basis.** 743: a necessity bought from in-year income with unknown use in that year, item still existing → settlement in proportion to probability, by obligatory precaution. Office page /6553/.

**Regression test.** Home, ended-year income, “do not know if used” → UNRESOLVED [`consult-ft-settlement`].

### SF-15 MEDIUM: 737 د share measure (consult-ft-split invites re-entry by an unstated measure)

**Location.** Consultation `consult-ft-split` and category `ft-split`.

**Current behaviour.** The stop tells the person to “Replace this entry with one entry per share”. How a share of the current value is measured (by the proportion of the price paid, or otherwise) is not stated. So re-entered shares carry the person’s own reading into a COMPLETED figure. Example: a 100,000 asset bought half with year-old income → re-entered as 50,000 at current value plus a price entry.

**Proposed change.** Relabel `consult-ft-split`: “Scholar review required: this asset was bought from several kinds of money. Tawdih Jami’ 737 د says each share follows its own rule, but how a share of the current value is measured is not stated here. No amount is calculated.” Remove the re-entry instruction. Balances use SF-10 instead.

**Source basis.** 737 د «سهم هر مورد را مشخّص نموده» (office page /6551/).

**Regression test.** Asset “Partly…” → UNRESOLVED [`consult-ft-split`], with the new label text.

### SF-16 MEDIUM: “no” to the combined 740 ب question, and 741 merchandise that has not risen, are labelled as a precautionary settlement (notes 1–2)

**Location.** `ft-asset` > unknown > for-trade=no > `ft-unknown-specific`=no → `ft-settle`; unknown > for-trade=yes > risen=no → `ft-settle`.

**Current behaviour.** Land, source unknown, `ft-unknown-specific`=no → [`consult-ft-settlement`], which states «by obligatory precaution … settled … in proportion to the probabilities». The combined “no” also covers a non-Shia seller and an inflationary rise, which notes 1–2 say are omitted (not settled). No figure is shown, but a ruling statement is attached to an unstated case.

**Proposed change.**

- In both places, replace `ft-settle` with `yesNo('ft-unknown-shia-no-inflation', category('ASSET','ft-settle'), category('ASSET','ft-pending'))`.
- New question `ft-unknown-shia-no-inflation` (boolean): “Were the seller and you both Twelver Shia, and is any rise in its value not caused by inflation? (Tawdih Jami’ 740–742 notes 1–2)”.

**Source basis.** 739–744 notes 1–2 (office page /6553/).

**Regression tests.**

- Land unknown / not specific / Shia-no-inflation=no → [`consult-ft-pending`].
- … =yes → [`consult-ft-settlement`].

---

## LOW

### SF-17 LOW: the inflation check is uneven between clauses (S14)

**Location.** sameYear > notNecessity → current value, with no inflation question.

**Current behaviour.** Same-year stock 30,000 → 6,000.

**Finding.** Note 6 is attached to clause ج only, and notes 1–2 to 740–742. Clause الف carries no footnote and plainly says «به قیمت فعلی». So the pack follows where the footnotes are placed.

**Proposed change.** No change to the logic. Add to the sis-737 issues: “Note 6 (inflation) is attached to clause ج; clause الف charges current value with no inflation note. The scholar to confirm.” A stop here would block a case the text plainly settles.

**Regression test.** Unchanged: stock, ended-year income, value current → 6,000.

### SF-18 LOW: the `review-settlement` output shows “0”

**Location.** Output `review-settlement`, label “Settlement review (0 = none)”.

**Proposed change.** Relabel it “Settlement review (0 = no entry needs settlement; not an amount)”. Apply the same to `review-link`.

### SF-19 LOW: an empty first-time sheet gives COMPLETED 0, “Total khums due (PROVISIONAL)”

**Location.** Step `khums-total`.

**Proposed change.** No pack change. The UI should require at least one entry before calculating a first-time assessment. A sheet whose every entry is excluded legitimately gives 0.

### SF-20 LOW: `holding-inherited-unpaid` joins two cases (unpaid on the inheritance itself, or owed on other property)

Both go to the same stop, so no figure depends on it. No change, except that under SF-02/03 it is asked only on the “Inherited” path, and its “Answer no if none was inherited” sentence is dropped there.

---

## Verified correct (no change)

- **Entry stops, unanswered and invalid answers.** Every unanswered or invalid answer gives a clarification, never a default: `ft-asset-source` unanswered; “nonsense”; a string for a boolean. Estimated, range or approximate values → `consult-entry`. An unknown amount → clarification.
- **737 الف, used necessity.** Excluded. The text states no status condition.
- **Necessity not used in the year (C11).** → `consult-ft-pending`.
- **737 ب, merchandise bought with khums-paid money (C12, first-time).** → `consult-ft-pending`.
- **737 ج, kulli.** Price; merchandise that has risen and can be sold goes to current value, after the inflation question (note 6). **737 ج, specific money.** A Shia seller, a rise and the inflation question are all required.
- **741 and 740 ب.** Need a Shia seller and buyer and no inflation.
- **739, 740 الف/ج, 742.** Settlement, with no amount calculated.
- **744-type doubt (`unknownOther`) and cash of unknown origin.** Review.
- **Other entry kinds.** MIXED_FUNDS, all INCOME, KHUMS_PAID and all LIABILITY entries stop the total.
- **Halves.** They stop whenever the total stops.
- **Precedence.** The split check comes before pending, then settlement.

## Status of earlier Sistani first-time findings

| Earlier id                           | Subject                                                  | Status on 0.9.0                        | This review                                           |
| ------------------------------------ | -------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| C11                                  | Necessity not used in the year of purchase               | RESOLVED (stops)                       | Kept. 743 adds the “do not know” option (SF-14).      |
| C12 (first-time half)                | Merchandise bought with khums-paid money                 | RESOLVED (stops)                       | Kept. The BUSINESS_STOCK gap is new (SF-06).          |
| S12 / F5                             | Asset from current-year income charged                   | OPEN, reproduced (800)                 | SF-05                                                 |
| S13 / F4                             | CAPITAL_LOSS, SOLD_ITEM_COST under 738                   | OPEN, reproduced (2,000)               | SF-04                                                 |
| Low: 738 on EXPENSE:OTHER            | —                                                        | OPEN, reproduced (2,000)               | SF-04                                                 |
| S14                                  | Inflation check uneven                                   | OPEN (scholar)                         | SF-17: follows footnote placement; no logic change    |
| F1 (first-time half)                 | Inherited holdings without the 1771 exceptions           | OPEN, reproduced (0)                   | SF-03                                                 |
| F2                                   | Spending of paid/inherited money skips the 1772 question | OPEN, reproduced (0)                   | SF-02                                                 |
| F3 / price not linked                | Price dropped or counted twice                           | OPEN, reproduced (0 / 24,000 / 4,000)  | SF-01 (pack-only fail-safe now; engine link for full) |
| F7                                   | “(or similar)” lets a gift count as paid                 | OPEN, reproduced (0)                   | SF-03                                                 |
| 737 د share measure                  | —                                                        | OPEN                                   | SF-15                                                 |
| 739 “don’t know” (how paid)          | —                                                        | OPEN (forced choice can give a figure) | SF-13                                                 |
| 743 “don’t know” (use)               | —                                                        | OPEN (forced choice gives 0)           | SF-14                                                 |
| Partial parts under a stopped total  | —                                                        | OPEN (UI caution only)                 | SF-11                                                 |
| Earlier Khamenei-style lows (labels) | —                                                        | —                                      | SF-18, SF-19                                          |

## Cases that must remain scholar-review stops after the corrections

- Necessity not used in the year of purchase (737 الف is silent on it; 743 gives no amount basis).
- Merchandise bought with khums-paid or inherited money (737 ب with 645 and 647).
- Any inheritance that is unexpected, not under valid rules, or with khums unpaid by the deceased (1771, 1772).
- Gifts and any source not listed; a doubt that includes inherited, gifted or khums-paid money (744 and 602).
- An asset bought with income of the current, unfinished year.
- A year-old-income purchase that is specific money from a non-Shia seller, not risen in value, or with an unknown payment form.
- A rise from inflation (737 note 6; 740–742 note 2), and an extraordinary or uncertain devaluation (note 5). Precautionary settlements stay settlement stops.
- An asset or balance of mixed sources (737 د share measure).
- Capital loss, cost of an item sold, and other expenses. Receivables and joint ownership.
- Cash of unknown origin, mixed funds, all income entries, khums already paid, and all debts.
- Spending beyond one’s status from in-year income.
- Any mismatch between price entries and assets (`consult-ft-link`). Until an engine link exists, this includes legitimate mixtures of ordinary-purchase and current-value items from year-old income.
- Settlement cases 739, 740 الف/ج, 742 and 743: never calculated.

## Implementation notes

- New question ids (`ft-asset-funds`, `ft-cash-funds`, `ft-spent-funds`, `ft-money-value-loss`) and changed choice strings make 0.9.0 answers invalid rather than silently re-read. This is fail-safe.
- Update the scenarios in `scenarios.ts` `sistaniFirstTime`. Each one that reaches `ft-assets`, `ft-assets-old` or `ft-cash` needs `ft-value-current`: true. Paths with an ordinary purchase need `ft-price-entered` / `ft-price-item-owned`. The `ft-price-basis` strings change. The debt scenario’s `ft-cash` becomes null.
- Every new category must be read by the `firstTime` program (MAPPING_CATEGORY_NOT_IN_PROGRAM). The conditions-only categories (`ft-price-assets`, `ft-price-item`, `ft-cash-parts`) are read through `present()`, which counts.
- Update the sis-737 and sis-739 “Encoded:” texts and issues: the link check, the stock rule, receivable and joint review, the S14 note, and note 5 as an example.
- Make it a new pack version (0.10.0). 0.9.0 stays byte-exact.

### Addendum: SF-08b (JOINT_OWNERSHIP)

This item is HIGH by the same reasoning as SF-07, but it is listed under SF-07’s rule.

**Current behaviour.** JOINT_OWNERSHIP 10,000, same-year / not a necessity → COMPLETED **2,000**. The app label is “Share of a jointly owned asset or business”. A share of a business is not a bought item under 737, and whether the amount is the person’s own share is not confirmed.

**Proposed change.** Add JOINT_OWNERSHIP to the new `ft-asset-review` rule → `ft-pending`. This over-stops a jointly owned house share that 737 would settle.

**Regression test.** Joint 10,000 → UNRESOLVED [`consult-ft-pending`].

Note on numbering: in the severity table, SF-08 is the in-year spending status item and SF-08b is counted with SF-07 under HIGH.
