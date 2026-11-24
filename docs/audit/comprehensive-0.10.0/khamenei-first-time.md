# Khamenei scholar-review pack 0.9.0 — first-time workflow: complete review

Reviewer scope: `khameneiFirstTimeParts()` (packages/marja-rules/src/review-packs/annual.ts ~2860–3300),
mapping rules `ftk-asset`, `ftk-stock`, `ftk-balance`, `ftk-mixed`, `ftk-income`, `ftk-expense`,
`ftk-unpaid`, `ftk-liability`, the first-time program and outputs, the transcriptions
`kha-ftk-*`, `kha-paid`, `kha-expenses` as used here.

Method. Every leaf of every first-time mapping rule was walked automatically for every ASSET and
BALANCE subtype (every option of every asked question, plus unanswered and invalid answers) through
`prepareAssessmentInput` → `calculate(…, {mode:'scholar-review'})`, and 24 multi-entry scenarios
were run (temp test `packages/core/src/provisional/zz-review-kha-ft.tmp.test.ts`, now deleted).
Mapping integrity is sound: an unanswered or invalid per-entry answer always gives a clarification
(no figure), `consult-entry` stops withhold the whole input, estimated/range amounts stop, unknown
amounts are asked. All 14 non-stock ASSET subtypes share one identical tree; the 4 non-mixed BALANCE
subtypes share another; `BUSINESS_STOCK` and `MIXED_FUNDS` always go to `ftk-review`.

Source. Quotes and page numbers were checked in context against the office's own text of «احکام خمس»
(leader.ir book 215, PDF export `booklet_215_[Leader.ir].pdf`, 73 pp., generated 2025-10-26; local text
extraction from an earlier session of this project). `https://www.leader.ir/fa/book/215/` returned
HTTP 404 when fetched on 2026-11-23, so no page was re-fetched in this review. Question numbers 1–222
follow the English index numbering printed in the PDF (PRIMARY_SOURCE_INVENTORY §3); 223–271 are
printed. No ruling, rate or exemption is proposed below. Every correction is (a) a consult stop,
(b) a question or option whose distinction the quoted excerpt itself states, or (c) a label or
citation correction.

Program helpers used in the proposals are the ones already in annual.ts: `when` (`{op:'when',…}`),
`present(...)`, `consult(id)`, `fifthOf`, `sum`, `step`, `zero`, `yesNo`, `choiceOf`, `category`,
`exclude`, `entryStop` (`consult-entry`). No new expression kind is needed, so no pack
`schemaVersion` change is needed.

Severity counts: **CRITICAL 0 · HIGH 9 · MEDIUM 8 · LOW 7** (24 items).

---

## HIGH

### KF-01 HIGH — Part figures shown while the total is withheld (includes L1 `ftk-year-known` = no)

Location: steps `ftk-current`, `ftk-older-base`; outputs `ftk-current` ("Of which from the current
khums year"), `ftk-older-base`.

Current behaviour (reproduced). The two part steps are computed unconditionally, so they show figures
whenever `khums-total` is withheld for a reason that also affects them:

| Facts and answers (year known unless stated)                                                  | `khums-total` | `ftk-current` | `ftk-older-base` | stop                |
| --------------------------------------------------------------------------------------------- | ------------- | ------------- | ---------------- | ------------------- |
| bank 10,000 current, no emergency + `BUSINESS_STOCK` 5,000                                    | null          | **2,000**     | 0                | consult-ftk-pending |
| same bank + `LOAN` 4,000 (a debt that may reduce the current-year surplus)                    | null          | **2,000**     | 0                | consult-ftk-pending |
| same bank + `EMPLOYMENT` income 50,000 (current-year income/expense entries are under review) | null          | **2,000**     | 0                | consult-ftk-pending |
| same bank, `ftk-year-known` = **false**                                                       | null          | **2,000**     | 0                | consult-ftk-year    |
| same bank, `ftk-year-known` **unanswered**                                                    | null          | **2,000**     | 0                | missing-answer      |
| bank 10,000 older, `ftk-year-known` = false                                                   | null          | 0             | **2,000**        | inflation + year    |
| home older (price confirmed) 100,000 + stock                                                  | null          | 0             | **20,000**       | pending + inflation |
| necessity of unknown source + current bank 10,000                                             | null          | **2,000**     | 0                | settlement          |

When the khums year is not known (Q231) the person cannot know which money is "of the current khums
year" or "over which a khums year had passed", so both parts rest on an answer the person could not
give. Debts and income/expense entries under review can change the current-year surplus.

Proposed change (exact). Replace the two step expressions; leave labels.

```ts
const atYearEnd: Condition = { kind: 'answer', questionId: 'ftk-at-year-end', equals: true }; // KF-02
const guarded = (inner: Expression): Expression => ({
  op: 'when', condition: present('ftk-review', 'ftk-debts'), then: consult('consult-ftk-pending'),
  otherwise: { op: 'when', condition: present('ftk-settle'), then: consult('consult-ftk-settlement'),
    otherwise: { op: 'when', condition: yearKnown, then: inner, otherwise: consult('consult-ftk-year') } } });
// step ftk-current
expression: guarded({ op: 'when', condition: present('ftk-current'),
  then: { op: 'when', condition: atYearEnd, then: fifthOf(sum('ftk-current')),
          otherwise: consult('consult-ftk-year-end') },
  otherwise: zero }),
// step ftk-older-base
expression: guarded(fifthOf(sum(...older))),
// step khums-total
expression: guarded({ op: 'when', condition: present(...older), then: consult('consult-ftk-inflation'),
  otherwise: step('ftk-current') }),
```

Only an open inflation review then leaves `ftk-current` (a resolved part) and `ftk-older-base`
(labelled "not the amount due") visible.

Source basis: Q231 «اگر زمان آن را نمیدانید، با مصالحه با وکیل مرجع تقلید، زمان محاسبه خمس، سررسید سال خمسی شما است» (PDF p.58).

Regression tests (corrected pack): each row of the table above → `ftk-current`, `ftk-older-base`,
`khums-total`, `sahm-imam`, `sahm-sadat` all null, with the listed stop. Control: bank 10,000 current,
no emergency, year known, `ftk-at-year-end` true → total 2,000; plus older bank 10,000 → total null,
`ftk-current` 2,000, `ftk-older-base` 2,000 (inflation only).

### KF-02 HIGH — Current-year items charged at any assessment date (C18; Q227)

Location: program (`ftk-current`, `khums-total`); categories `ftk-current`; question set.

Current behaviour: `context.assessmentDate` is any date; "Income of my current khums year" savings or
property are charged one-fifth at that date. Bank 10,000 current, assessed on 2026-03-01 (not a
year-end) → `khums-total` 2,000.

Text: khums is on the surplus at the end of the khums year; payment before the year ends is not due,
and spending until then is still deducted. A mid-year figure is not the amount due. The text also
lets a person bring the year-end forward to the date they calculate (Q234), which makes the
assessment date their year-end.

Proposed change:

- New assessment-level boolean question `ftk-at-year-end`, ruleIds `['kha-ftk-year']`, label:
  "Is the assessment date the end of your real khums year, or have you chosen to make this date your new khums year-end by calculating early? («احکام خمس» Q227, Q234)"
- New consultation `consult-ftk-year-end`, ruleIds `['kha-ftk-year']`, label:
  "Scholar review required: khums on income of the current khums year is due only at the end of that year (Q227: «پرداخت خمس قبل از پایان سال واجب نیست»). The assessment date is not your khums year-end, so the current-year part and the total are not calculated."
- Program: as in KF-01 (`ftk-current` guarded by `atYearEnd` only when `ftk-current` entries exist).
- `kha-ftk-capital` summary: replace "Property bought with income of the current khums year is valued now" with "…is valued at the khums year-end («خمس درآمد غیر نقدی بر اساس ارزش آن در سررسید سال خمسی محاسبه می شود», p.5)".
- Category `ftk-current` label: "Bought or saved from income of the current khums year (value at the khums year-end = assessment date)".

Source basis: Q227 «پرداخت خمس قبل از پایان سال واجب نیست» (p.57); Q234 «زودتر از سررسید سال خمسی خمس را محاسبه کنید و همان زمان را سررسید جدید قراردهید، اشکال ندارد» (p.58).

Regression: bank 10,000 current, no emergency, year known, `ftk-at-year-end` false → total and
`ftk-current` null, stop `consult-ftk-year-end`; true → 2,000. Only a current necessity excluded,
`ftk-at-year-end` false → total 0 (no current entries, no stop). Unanswered with a current entry →
missing-answer, no figure.

### KF-03 HIGH — A receivable (money owed to the person) charged as capital (K12)

Location: `ftk-asset` (subtype `RECEIVABLE`), every leaf ending in `ftk-current` or
`ftk-older-capital`.

Current behaviour: RECEIVABLE 10,000, not paid/exempt, not necessity, no hardship, funds current →
`khums-total` **2,000**; funds older + amount-is-first-value → `ftk-older-base` 2,000 under a
"value at the first khums year-end after purchase" label that has no meaning for a debt owed.

Text distinguishes several cases none of which is asked: money lent from income (khums due at the
year-end but payment may wait until received; after collection «فوراً»), wages owed that are not
collectible at the year-end (income of the year received), credit sales (cash price in the sale year;
profit in the year received). Q30 and Q72 are not transcribed.

Proposed change: new mapping rule placed before `ftk-asset`, and `RECEIVABLE` removed from
`ftk-asset`'s subtypes:

```ts
ft('ftk-receivable', 'ASSET', ['RECEIVABLE'], ['kha-ftk-year'], category('ASSET', 'ftk-review')),
```

`consult-ftk-pending` label becomes: "Scholar review required: an entry is not covered by the
transcribed first-time rulings (money owed to you, business stock, mixed money, income or expense
entries, debts, or khums already paid), so the total stops." Category `ftk-review` label unchanged.

Source basis: p.5 «چنانچه مقداری از درآمد موقّتاً از دسترس خارج شود، مانند قرض دادن… می تواند تا زمان دریافت، پرداخت آن را به تأخیر بیندازد»; Q30 «در سررسید سال خمسی قابل دریافت نیست، جزو درآمد سالِ دریافت» (p.12); Q32 «پس از دریافت فوراً» (p.13).

Regression: RECEIVABLE 10,000 + current bank 10,000 → mapping MAPPED, `ftk-receivable` →
`ftk-review`, total/parts null, stop `consult-ftk-pending`; no per-entry question asked for it.

### KF-04 HIGH — Funding-source options cannot express "bought in an earlier year with that year's income"; a 20-year-old shop is charged at today's value

Location: question `ftk-funds` (choices `KHAMENEI_FUNDS`), leaves of `ftk-asset` and `ftk-balance`.

Current behaviour: the only options are "Income of my current khums year" and "Older saved income
(a khums year had passed over it)". A shop bought 20 years ago with that year's earnings fits neither
(no khums year had passed over the money when spent). Answering "current" →
REAL_ESTATE 200,000 → **`khums-total` 40,000** at today's value. Q4 (exactly this case) requires
one-fifth of the value at the first khums year-end after purchase, with inflation (withheld). The
"older" label is also ambiguous about _when_ the year passed (at purchase, or by now). For
necessities the distinction Q236 draws is the age of the money at purchase; for property Q4–Q5
draw it by "bought years ago with earnings, no khums year kept".

Proposed change: retire `ftk-funds` (keep it readable in schema 1/2 history) and add choice question
`ftk-money-source`, ruleIds `['kha-ftk-necessities','kha-ftk-capital','kha-ftk-cash','kha-ftk-doubt']`,
label: "What money did it come from? (Q236, «محلّ کسب» Q4–5, Q39)". Choices (answer values):

1. `current` — "Income of my current khums year (bought or saved during the khums year that ends on the assessment date)"
2. `earlier` — "Income of an earlier khums year, spent on it within the khums year in which it was earned"
3. `older` — "Saved income over which a khums year had already passed when I bought it or put it aside"
4. `doubt` — "Not sure whether it came from a gift or from earnings" (see KF-21)
5. `unknown` — "I do not know which money it came from"

Mapping (paths reached only after KF-06's "earnings/other income" or "not sure if paid" answers):

| Leaf                 | current                                                     | earlier                                                                           | older                                                                         | doubt                   | unknown              |
| -------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------- | -------------------- |
| asset, necessity     | `ftk-necessity-status` → exclude / `ftk-review` (unchanged) | `category ftk-review` (Q236 does not state this case; stop)                       | `ftk-necessity-status` (KF-13) → `ftk-amount-is-price` → `ftk-older-purchase` | exclude `kha-ftk-doubt` | `ftk-settle`         |
| asset, not necessity | `ftk-current`                                               | `ftk-held-for-growth` (KF-10) → `ftk-amount-is-first-value` → `ftk-older-capital` | same as earlier (Q4–5 do not distinguish the age of the money)                | exclude `kha-ftk-doubt` | `ftk-review` (KF-17) |
| balance              | emergency/needs questions (KF-08, KF-09) → … `ftk-current`  | `entryStop` (money still held was not spent)                                      | `ftk-savings-emergency` → `ftk-review` / `ftk-older-cash` (unchanged)         | exclude                 | `ftk-review` (KF-17) |

Also in `ftk-amount-is-price` and `ftk-amount-is-first-value` nothing changes.

Note on over-stopping: necessity + `earlier` (e.g. a home bought ten years ago from that year's
salary) arguably follows from the general expense exemption (p.5) and «خروج از مئونه»; the text
does not state it for a person without a khums year, so it stops for the scholar.

Source basis: Q4 «حدود بیست سال قبل یک باب مغازه خریده ام در حالی که سال خمسی نداشته ام» → «باید خمس قیمت اوّلین سال خمسی بعد از خرید را همراه با تورّم بپردازید» (p.7); Q236 «با درآمد پس اندازشده که سال خمسی بر آن گذشته است خریده است» (p.59).

Regression: REAL_ESTATE 200,000, earnings, not necessity, no hardship, not for growth,
`ftk-money-source` = earlier, `ftk-amount-is-first-value` true → total null, `ftk-older-base`
40,000, stop inflation. HOME, necessity, `earlier` → `ftk-review`, total null. BANK, `earlier` →
`consult-entry`. Old `ftk-funds` answers supplied to the new pack → `QUESTION_UNANSWERED:ftk-money-source`.

### KF-05 HIGH — Property bought with a loan or by instalments charged at its full value

Location: `ftk-asset` leaves ending in `ftk-current`, `ftk-older-capital`, `ftk-older-purchase`.

Current behaviour: no question about credit. A taxi (VEHICLE 30,000) bought by instalments with half
paid from this year's income, answered earnings/not necessity/no hardship/current → `khums-total`
**6,000** (same leaf as the reproduced shop case). The text charges only the paid proportion
(here 3,000).

Proposed change: new boolean question `ftk-bought-on-credit`, ruleIds `['kha-ftk-capital','kha-ftk-necessities']`,
label: "Was any part of its price paid with a loan, or is it being paid by instalments (with part still unpaid)? («تهیّه اقساطی ابزار کسب و سرمایه», Q10–12)".
Asked (yes → `category ftk-review`, no → continue) in: the non-necessity path immediately after
`ftk-capital-hardship` = false (before `ftk-money-source`), and the necessity path after
`ftk-money-source` = older (before `ftk-amount-is-price`). Not asked on necessity + current (excluded
either way; Q123).

Source basis: p.7–8 «اگر قسطی خریده شود… باید خمس مقداری از آن، که اقساط آن پرداخت شده است، به قیمت روز پرداخت شود»; Q10 «خمس نصف قیمت تاکسی» (p.8).

Regression: VEHICLE 30,000, … `ftk-bought-on-credit` true → `ftk-review`, total null; false,
current, at year end → total 6,000.

### KF-06 HIGH — "Khums-paid or non-liable money (such as a gift or an inheritance)" joins different cases; doubt whether paid (K7); partly-paid; borrowed money

Location: question `ftk-paid-or-exempt`; `ftk-asset` and `ftk-balance` first branch.

Current behaviour: one yes/no. (a) "such as" lets the person classify any money as non-liable:
borrowed money answered yes → BANK 10,000 excluded (Q35 makes the part above the unpaid
instalments liable); (b) a person who thinks khums was _probably_ paid answers yes → excluded
(kha-ftk-doubt kind 2 and Q249: khums is due); (c) an account or asset partly from paid money and
partly from income must be answered all-or-nothing (Q11 charges in proportion); (d) proceeds of
selling a necessity are not liable after a year (Q137) but have no option. Each path can show a
completed total from the remaining entries.

Proposed change: retire `ftk-paid-or-exempt`; add choice question `ftk-money-kind`, ruleIds
`['kha-paid','kha-inheritance','kha-ftk-doubt']`, label: "Was it acquired with, or received as, any of the following? («اموال مخمّس»; «بدهی و مال قرضی»: «هدیه، ارث، پول مخمّس»)". Choices:

1. `paid` — "Money on which khums was already paid"
2. `gift` — "A gift, or another payment I had no right to demand («هدیه (هبه)»)"
3. `inheritance` — "An inheritance"
4. `notsure` — "Money on which I am not sure whether khums was paid"
5. `loan` — "Borrowed money (a loan)"
6. `necessity-sale` — "Money from selling something that was a necessity of my life"
7. `partly` — "Partly one of the above and partly other money"
8. `other-exempt` — "Other money I believe is not liable to khums"
9. `earnings` — "None of these: my earnings or other income"

Mapping:

| choice                                     | asset                                                                                                            | balance                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| paid, gift                                 | `ftk-held-for-trade-or-growth` (KF-07) → `ftk-review` / exclude `kha-paid`                                       | exclude `kha-paid`                                             |
| inheritance                                | `holding-inherited-unpaid` → `ftk-review` / (`ftk-held-for-trade-or-growth` → `ftk-review` / exclude `kha-paid`) | `holding-inherited-unpaid` → `ftk-review` / exclude `kha-paid` |
| notsure, earnings                          | continue to the not-paid path (`ftk-necessity` …) — kha-ftk-doubt: doubt whether paid = not paid                 | continue to `ftk-money-source`                                 |
| loan, necessity-sale, partly, other-exempt | `category ftk-review`                                                                                            | `category ftk-review`                                          |

`holding-inherited-unpaid` label in first-time no longer needs "Answer no if none of it was inherited".
Add `kha-ftk-doubt` to the mapping rules' ruleIds.

Source basis: «گاه شک در پرداخت مال است که متعلّق خمس بوده… خمس آن واجب است» (p.61); Q249 «گمان به پرداخت… باید خمس را بپردازید» (p.62); Q35 «خمس مقدار مازاد بر باقیمانده اقساط باید پرداخت شود» (p.13); Q137 «خمس ندارد» (p.37); Q11 (p.8).

Regression: BANK 10,000 `loan` → `ftk-review`, total null; `notsure` → asks `ftk-money-source`,
current, no emergency/needs, at year end → total 2,000 (was 0 when answered yes); `partly` →
`ftk-review`; `paid` → excluded, total 0; LAND `inheritance` + unpaid yes → `ftk-review`.

### KF-07 HIGH — Khums-paid, gifted or inherited property held for its price to rise is excluded (C14)

Location: `ftk-asset` › paid › `holding-inherited-unpaid`=false › `holding-for-sale`.

Current behaviour: the question asks only "held as capital for sale (merchandise)". Khums-paid LAND
90,000 bought to sell after its price rises, answered no (not merchandise, no plan to sell now) →
excluded; with current bank 10,000 → **`khums-total` 2,000**. The text charges the yearly increase
(paid money, Q23) or treats the increase on sale as income (inheritance, gift; by precaution).

Proposed change: new boolean question `ftk-held-for-trade-or-growth` (first-time only; the annual
`holding-for-sale` is left to the annual reviewer), ruleIds `['kha-paid','kha-inheritance']`, label:
"Is it held as working capital for trade, or was it bought or kept so that it can be sold after its price rises? («سود و ارزش افزوده مال مخمّس» د; Q23; «ارث» Q207)". Yes → `category ftk-review`; no → exclude `kha-paid`. Replaces `holding-for-sale` in the first-time asset tree (KF-06 table).

Source basis: Q23 «زمینی را با مال مخمّس خریداری کرده تا پس از ترقّی قیمت بفروشد» → «در سررسید هر سال خمسی… خمس ارزش افزوده را پس از کسر تورّم پرداخت کند» (p.10); Q207 «مگر اینکه نگهداری آن به قصد تجارت و زیاد شدن قیمت باشد» (p.51).

Regression: LAND 90,000 `paid`, `ftk-held-for-trade-or-growth` true + current bank 10,000 → total
null, `consult-ftk-pending`; false → total 2,000.

### KF-08 HIGH — Business capital held as money is charged without the capital hardship exemption (C8 residual)

Location: `ftk-balance` (CASH, BANK_ACCOUNT, DIGITAL_WALLET, OTHER), all leaves to `ftk-current`.

Current behaviour: the asset path asks `ftk-capital-hardship` («سرمایه ای که خمس ندارد», Q6); the
balance path asks only Q120 emergency savings. Business funds 10,000 in a bank, current, no emergency
→ `khums-total` **2,000**, although a person whose remainder would not cover living costs is not
liable on capital. Working capital explicitly includes cash in circulation.

Proposed change: in the balance not-paid path, ask `ftk-capital-hardship` first (yes → exclude
`kha-ftk-hardship`; no → `ftk-money-source` as in KF-04), the same order as the asset path. No new
question. Add `kha-ftk-hardship` to `ftk-balance` ruleIds.

Source basis: p.5 «سرمایه در گردش… که پول نقد در گردش… را شامل می شود»; p.8 «در صورت پرداخت خمس آن، مقدار باقیمانده برای تأمین هزینه های زندگی کافی نباشد یا کفایت آن مشکوک باشد، خمس آن واجب نیست».

Regression: BANK 10,000 `earnings`, `ftk-capital-hardship` true → excluded, total 0; false, current,
no emergency, no needs, at year end → 2,000.

### KF-09 HIGH — Current-year savings charged without the savings exceptions the text states

Location: `ftk-balance` › current › `ftk-savings-emergency`=false → `ftk-current`.

Current behaviour: savings 10,000 kept to buy a needed home soon after the year end, or for marriage
preparations already begun, or spent within five days after the year end → `khums-total` **2,000**.
The text exempts or defers these under conditions that need the person's facts.

Proposed change: new boolean question `ftk-savings-for-needs`, ruleIds `['kha-ftk-cash','kha-expenses']`,
label: "Is this money set aside to buy necessities of life or pay necessary costs (such as a home, building materials or marriage preparations already begun) that you will spend on them soon after your khums year ends, or that you spent within five days after it? (Q141, Q142, Q144, Q266; «پس انداز برای آینده نزدیک»)". Asked after `ftk-savings-emergency` = false on the current path: yes → `category ftk-review`; no → `ftk-current`.
Also correct `kha-ftk-cash` citation: "current-year savings owe one-fifth" rests on «پس انداز پول مطلقاً خمس دارد، مگر آنکه تا پنج روز بعد از سررسید سال خمسی در مئونه مصرف شود» (p.37), not on Q248 (earlier LOW finding).

Source basis: p.37 (quoted above); Q141 «اگر بعد از سال خمسی در آینده ی نزدیک در راه های مذکور مصرف شود، خمس ندارد» (p.38); Q142 (p.38).

Regression: BANK 10,000 current, no emergency, `ftk-savings-for-needs` true → `ftk-review`, total null;
false (year end) → 2,000.

---

## MEDIUM

### KF-10 MEDIUM — Older property held for price growth or trade: the base omits the yearly increases (C13)

Location: `ftk-asset` non-necessity › older → `ftk-older-capital`; output `ftk-older-base`.

Current: INVESTMENT (shares bought for price growth) 40,000 older, first-value confirmed →
`ftk-older-base` 8,000 labelled as if only inflation were missing; the text also charges every later
year's increase above inflation (shares for growth; working capital). Total already withheld.

Proposed: new boolean question `ftk-held-for-growth`, ruleIds `['kha-ftk-capital']`, label:
"Was it bought or kept to trade with, or so that its price would rise (such as shares bought for price growth), rather than to use, to keep the value of money, or for its yearly profit? («سرمایه در گردش» p.5; «سهام و اوراق بهادار» p.10–11)". Asked on non-necessity + earlier/older (KF-04) before `ftk-amount-is-first-value`: yes → `ftk-review`; no → continue.

Source: p.11 «اگر سهام برای رشد قیمت… در سررسید هر سال خمسی باید خمس ترقّی قیمت آن، پس از کسر مقدار تورّم» ; p.10 «برای حفظ ارزش پول یا استفاده از سود سالیانه… پس از آن تا زمانی که فروخته نشود، متعلّق خمس نیست».

Regression: INVESTMENT 40,000 older, growth yes → `ftk-review`, `ftk-older-base` null (KF-01); no →
`ftk-older-base` 8,000, inflation stop.

### KF-11 MEDIUM — Former necessities («خروج از مئونه») treated as ordinary property

Location: `ftk-necessity` ("a necessity … that you use" — present tense) = false path.

Current: a carpet or car that was a necessity and is no longer used goes to the property path; older
→ base one-fifth of its first-year-end value. The text: no khums if it left use after a khums year;
liable at year-end value if before the first year-end.

Proposed: new boolean question `ftk-former-necessity`, ruleIds `['kha-ftk-necessities']`, label:
"Was it a necessity of your life that you used and no longer need or use? («خروج از مئونه», Q128, Q129)". Asked first on `ftk-necessity` = false: yes → `ftk-review`; no → `ftk-capital-hardship` …

Source: «در صورتی که بعد از گذشت سال خمسی از مئونه خارج شده باشد متعلّق خمس نیست» (p.35).

Regression: HOUSEHOLD_ITEM 3,000 earnings, not necessity, former necessity yes → `ftk-review`.

### KF-12 MEDIUM — Earlier unpaid khums shown "as entered" although delayed khums carries the fall in money value

Location: step/output `earlier-unpaid`; category `ftk-unpaid`.

Current: UNPAID_KHUMS 3,000, amount known → output **3,000** ("Earlier unpaid khums, as entered");
with nothing else `khums-total` is 0 and the 3,000 is the only figure — readable as the amount due.

Proposed: step `earlier-unpaid` expression `when(present('ftk-unpaid'), consult('consult-ftk-unpaid-inflation'), zero)`; new consultation `consult-ftk-unpaid-inflation`, ruleIds `['kha-ftk-unpaid']`, label: "Scholar review required: khums paid late must make up the fall in the value of money (Q260, Q265 «به ارزش روز باید بپردازید»), with Q264's condition about ability to pay. The amount you entered is not recalculated, so it is not shown." Output label: "Earlier unpaid khums (separate from this total): scholar review". Add question text to `ftk-amount-known`: "Do not also enter the property or savings on which this khums was worked out."

Source: Q260 «در صورت کاهش ارزش پول (تورّم)، شخص، ضامن تورّم نیز هست» (p.63); Q264 (p.64).

Regression: UNPAID_KHUMS 3,000 known → `earlier-unpaid` null, stop `consult-ftk-unpaid-inflation`,
`khums-total` 0 unaffected; amount unknown → `consult-ftk-settlement` (unchanged).

### KF-13 MEDIUM — Older necessity path does not ask the status condition

Location: necessity › older › `ftk-amount-is-price` → `ftk-older-purchase`.

Current: a "necessity" beyond what is customary is charged on its purchase price (Q236/Q126 path);
what exceeds customary use is not مؤونه, so a different valuation may apply. Base only (total
withheld).

Proposed: ask `ftk-necessity-status` before `ftk-amount-is-price` on the older path: no →
`ftk-review`.

Source: p.5 «مصرف بیش از حدّ متعارف و نیاز، به طوری که مئونه ی زندگی محسوب نشود، موجب عدم تعلّق خمس نمی شود».

Regression: HOME older, status false → `ftk-review`; true + price confirmed → `ftk-older-purchase`.

### KF-14 MEDIUM — Digital assets are charged as ordinary property

Location: `ftk-asset` subtype `DIGITAL_ASSET`.

Current: same tree as land; current → `khums-total` 1/5 of value. The book does not mention digital
assets; treating them as property, capital or currency is a classification the text does not make.

Proposed: move `DIGITAL_ASSET` to the new `ftk-receivable`-style rule: `ft('ftk-digital', 'ASSET', ['DIGITAL_ASSET'], ['kha-ftk-year'], category('ASSET','ftk-review'))`; add "digital assets" to the `consult-ftk-pending` label list. (Over-stop: the scholar may route them to the property tree.)

Regression: DIGITAL_ASSET 5,000 → `ftk-review`, total null.

### KF-15 MEDIUM — Joint ownership: the meaning of the amount is not confirmed

Location: `ftk-asset` subtype `JOINT_OWNERSHIP`.

Current: the whole entered value is charged; the person may have entered the whole property.

Proposed: new boolean question `ftk-amount-is-own-share`, ruleIds `['kha-ftk-capital']`, label: "Is the amount you entered only YOUR OWN share of the jointly owned property? If not, change the entry. (Q297–298: each partner calculates khums on his own share)". Asked first for `JOINT_OWNERSHIP` only (separate rule `ftk-joint` = `yesNo('ftk-amount-is-own-share', assetAction, entryStop)`).

Source: Q297 «محاسبه و پرداخت خمس سهم هر شریک بر عهده خودش است» (p.69–70).

Regression: JOINT_OWNERSHIP, own share false → `consult-entry`; true → normal tree.

### KF-16 MEDIUM — Q231's "at the first opportunity, with the Marja's agent" is dropped from the total

Location: transcription `kha-ftk-year`; output `khums-total` label.

Current: the excerpt starts at «خمس اموالتان را…»; Q231 directs the first calculation to be done
«در اوّلین فرصت نزد وکیل مرجع تقلید» even when the real year is known. The total is labelled
"Total khums due (PROVISIONAL)".

Proposed: `kha-ftk-year` summary quotes the full sentence from «باید در اوّلین فرصت نزد وکیل مرجع تقلید…»; output label: "Total khums of this first assessment (PROVISIONAL; Q231: to be calculated and paid with an authorised agent of the Marja)". No stop (the text does not make the figure unknowable).

Source: Q231 «باید در اوّلین فرصت نزد وکیل مرجع تقلید، خمس اموالتان را بر اساس سال خمسی واقعی… محاسبه و پرداخت کنید» (p.58).

Regression: label snapshot test.

### KF-17 MEDIUM — "Unknown source" for property and money claims a settlement text that covers only necessities and unpaid amounts

Location: non-necessity asset and balance › funds unknown → `ftk-settle` → `consult-ftk-settlement`
("the text says to settle with the office (Q236, Q252, Q255)").

Current: no figure (stop), but the stated reason is an unstated reading for property and savings.

Proposed: non-necessity asset and balance `unknown` → `category ftk-review` (KF-04 table); `ftk-settle`
remains for necessities (Q236, Q252) and unknown unpaid khums (Q255).

Regression: LAND, unknown → `consult-ftk-pending`; HOUSEHOLD_ITEM necessity, unknown → `consult-ftk-settlement`.

---

## LOW

- **KF-18 LOW** — `review-inflation`, `review-settlement`, `review-year` print "0 USD" cards ("Inflation review (0 = none)"), readable as "no inflation owed". Proposed: drop these three from `outputs` (they remain breakdown steps and stops), or label "Inflation review: none needed". Test: outputs list has no review-* money cards.
- **KF-19 LOW** — Empty sheet or only excluded entries → `khums-total` 0 ("Total khums due"). Accurate; no change beyond KF-02/KF-16 labels. Test: unchanged 0.
- **KF-20 LOW** — Q250's limit on the gift-or-earnings doubt (not when the doubt comes from never having calculated) is not in the option. Relabel `doubt`: "Not sure whether it came from a gift or from earnings (and checking my records cannot settle it)". Source Q250 «اگر به دلیل جهل به مقدار و عدم محاسبه باشد، باید بررسی و محاسبه کنید» (p.62).
- **KF-21 LOW** — `ftk-paid-or-exempt` says "acquired with money"; a gifted or inherited _object_ is not acquired with money (KF-06 wording "acquired with, or received as" fixes it).
- **KF-22 LOW** — T3 residual: the amount-meaning confirmation is an English per-entry question on the results page; no per-entry callout, Urdu help or e2e journey (UI, not pack).
- **KF-23 LOW** — `kha-ftk-cash` cites Q248 for "current-year savings owe one-fifth" (fixed in KF-09).
- **KF-24 LOW** — The doubt option on the necessity path excludes without asking status; harmless (doubt → no khums at all), recorded for completeness.

---

## Status of earlier Khamenei first-time findings (on 0.9.0)

| Id                               | Finding                                                        | Status on 0.9.0                                                                                             | Correction here                        |
| -------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| C8                               | hardship exemption missing (capital, savings)                  | Fixed for assets and current-year emergency savings; **open for business funds held as money**              | KF-08                                  |
| C13                              | shares/growth assets with older income                         | **OPEN** (base, total withheld)                                                                             | KF-10                                  |
| C14                              | khums-paid asset for trade or growth excluded                  | **PARTIAL**: merchandise asked (0.7.0), price growth not                                                    | KF-07                                  |
| C18                              | current-year items at any date                                 | **OPEN** (total shown)                                                                                      | KF-02                                  |
| K5                               | Q120 applied to older savings                                  | RESOLVED (older + emergency → review)                                                                       | —                                      |
| K6/N6                            | necessity excluded without status                              | RESOLVED on current path; older path not asked                                                              | KF-13 (base only)                      |
| K7                               | no "not sure" on paid question                                 | **OPEN**                                                                                                    | KF-06                                  |
| K12                              | receivable charged as capital                                  | **OPEN**, reproduced (2,000)                                                                                | KF-03                                  |
| L1                               | `ftk-year-known` = no still shows `ftk-current`                | **OPEN**; also unanswered, and `ftk-older-base`                                                             | KF-01                                  |
| T3                               | meaning of the amount                                          | Fixed at entry level (confirmation questions); option ambiguity "a year had passed" and UI follow-up remain | KF-04, KF-22                           |
| N3 (first-time)                  | inherited holdings excluded without deceased's-unpaid question | RESOLVED (asset and balance)                                                                                | KF-06 makes inheritance its own option |
| kha-ftk-year excerpt             | drops «در اوّلین فرصت نزد وکیل»                                 | **OPEN**                                                                                                    | KF-16                                  |
| kha-ftk-cash LOW                 | weak Q248 basis                                                | OPEN                                                                                                        | KF-09/KF-23                            |
| first-time `EXPENSE:OTHER` (low) | n/a to Khamenei (all expenses → review)                        | RESOLVED by design                                                                                          | —                                      |

## Cases that must remain scholar-review stops (corrected pack)

Inflation on older property, savings, necessities and delayed khums (Q236, Q126, Q4–5, Q39, Q260–265);
unknown khums year (Q231); assessment date not the khums year-end (Q227); unknown source of a
necessity (Q236, Q252) and unknown unpaid khums (Q255); necessity bought in an earlier year with that
year's income; older emergency savings (Q39 vs Q120); savings for near-future needs (Q141–144, Q266);
money owed to the person; digital assets; property bought on credit/instalments; borrowed money;
proceeds of selling a necessity; partly-paid sources; "other" non-liable money; khums-paid, gifted or
inherited property held for trade or price growth; inherited property where the deceased left khums
unpaid; former necessities; necessities beyond customary use; older property held for growth or
trade; business stock; mixed money; every income, expense and debt entry in a first assessment;
khums already paid; continued taqlid and payee (always).

Stops that may block a case the text plainly settles (for the scholar to relax if confirmed):
necessity + `earlier` (general expense exemption, p.5); proceeds of a necessity sold after a year
(Q137 states «خمس ندارد»); digital assets.

## Implementation notes

- New question ids: `ftk-at-year-end`, `ftk-money-source`, `ftk-money-kind`, `ftk-bought-on-credit`,
  `ftk-held-for-trade-or-growth`, `ftk-held-for-growth`, `ftk-former-necessity`,
  `ftk-savings-for-needs`, `ftk-amount-is-own-share`. Retired (kept readable): `ftk-funds`,
  `ftk-paid-or-exempt`. New consultations: `consult-ftk-year-end`, `consult-ftk-unpaid-inflation`.
  New mapping rules: `ftk-receivable`, `ftk-digital`, `ftk-joint` (subtypes removed from `ftk-asset`).
  No new categories (all new stops reuse `ftk-review`), so the structure check for unused categories
  is unaffected; every new question must be referenced or the structure validation fails.
- Order of the not-paid asset tree after the change: `ftk-necessity` → (yes) `ftk-money-source`
  [current → status; earlier → review; older → status → credit → price; doubt; unknown] / (no)
  `ftk-former-necessity` → `ftk-capital-hardship` → `ftk-bought-on-credit` → `ftk-money-source`
  [current → ftk-current; earlier/older → growth → first-value; doubt; unknown → review].
- Balance tree: `ftk-money-kind` → (earnings/notsure) `ftk-capital-hardship` → `ftk-money-source`
  [current → emergency → needs → ftk-current; earlier → consult-entry; older → emergency →
  review/ftk-older-cash; doubt; unknown → review].
- All rules stay `UNVERIFIED`; new version 0.10.0 with a new content hash; 0.9.0 frozen as history.
