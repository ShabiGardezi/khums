# khamenei 0.9.0 inventory

## Questions

- `living-within-status` (boolean, required) Were all the living expenses you entered lawful, customary and fitting your status? («درآمد کسب و کار») rules=['kha-expenses', 'kha-current-expenses']
- `pension-kind` (choice) What kind of payment is this? (retirement pension: «حقوق بازنشستگی»; no right to demand it: «هدیه (هبه)») choices=["Retirement pension", "A payment I had no right to demand", "Insurance payout", "Other"] rules=['kha-pension', 'kha-gift']
- `mined-nisab` (boolean) After deducting the costs of extracting and refining it, does the value of your own share equal fifteen mithqāls of gold? Enter the value after those costs. («معدن») rules=['kha-mined']
- `treasure-nisab` (boolean) Is its value at least twenty gold dinars or two hundred silver dirhams? («گنج») rules=['kha-treasure']
- `treasure-own` (boolean) Is it yours to keep (no special legal regulation applies and earlier owners were offered it where required)? («گنج») rules=['kha-treasure']
- `diving-nisab` (boolean) After deducting the costs of extracting it, is its value eighteen nukhuds of gold or more? («جواهری که با غوّاصی به دست آید») rules=['kha-diving']
- `mixed-certain` (boolean) Are you certain that unlawful money is mixed into this amount? («مال مخلوط با حرام») rules=['kha-mixed']
- `mixed-amount-known` (boolean) Do you know the amount of the unlawful money? («مال مخلوط با حرام») rules=['kha-mixed']
- `mixed-owner-known` (boolean) Do you know who owns the unlawful money? («مال مخلوط با حرام») rules=['kha-mixed']
- `mixed-over-fifth` (boolean) Do you know that the unlawful part is more than one-fifth? («مال مخلوط با حرام») rules=['kha-mixed']
- `holding-paid` (boolean) Was this acquired with money on which khums was already paid, or with money not liable to khums (such as a gift or an inheritance)? («اموال مخمّس») rules=['kha-paid']
- `holding-inherited-unpaid` (boolean) If any of this came from an inheritance: did the deceased leave khums unpaid? Answer no if none of it was inherited. («ارث … خمس ندارد» concerns only the heir’s own khums) rules=['kha-inheritance']
- `holding-for-sale` (boolean) Is this held as capital for sale (merchandise)? («ارث»: «مگر اینکه آن را سرمایه (در معرض فروش) قرار دهد») rules=['kha-paid', 'kha-inheritance']
- `living-from-year-income` (boolean) Were all the living expenses you entered paid from this year’s income, rather than from savings on which khums was already paid, a gift, an inheritance or other money? («مؤونه معیشت و زندگی») rules=['kha-expenses']
- `inh-deceased-unpaid` (boolean) Do you know that the person you inherited this from did not pay khums due on it, or owed khums on other property? («ارث») rules=['kha-inheritance']
- `business-stock-unsold` (boolean) Were any of the business costs you entered spent on stock or goods for sale that were still unsold at the end of this khums year? («مؤونه کسب درآمد») rules=['kha-business-cost']
- `capital-loss-business` (boolean) Was this a loss of business capital or business tools (wear, fall in value, an accident, theft or fire), rather than a loss on personal property? («جبران خسارات سرمایه») rules=['kha-capital-loss']
- `debt-living-this-year` (boolean) Is this a debt for this year’s living expenses, incurred after your first income of the year? Do not enter the same spending again as a living expense. («بدهی و مال قرضی») rules=['kha-debts']
- `debt-spending-entered` (boolean) Is the spending this debt paid for already among the living expenses you entered for this year? If yes, the debt is not deducted again. («بدهی و مال قرضی») rules=['kha-debts']
- `debt-business-cost` (boolean) Is it an unpaid cost of earning the business income you entered for this year? It is deducted only from that business profit, never from salary or other income. («بدهی و مال قرضی») rules=['kha-debts']
- `business-loss-one-account` (boolean) Your business costs are more than your business income. Do your business and your other earnings share one account (income and outgoings and cash kept together)? If not, the loss does not reduce your other earnings. («محاسبه خمس چند شغل») rules=['kha-business-lines']
- `business-line-loss` (boolean) Did one line of your business make a loss this year while another made a profit? («محاسبه خمس چند شغل») rules=['kha-business-lines']
- `business-one-account` (boolean) Do all your lines of business share one account (income and outgoings and cash kept together)? («محاسبه خمس چند شغل») rules=['kha-business-lines']
- `debt-earlier-paid-soon` (boolean) Is it a living-expense debt from an earlier year that you paid from this year’s income within five days after the end of this khums year? Enter the amount you paid. («بدهی بابت مئونه زندگی») rules=['kha-old-debts']
- `bank-profit-within-inflation` (boolean) Is this profit on a bank deposit on which khums was paid, and is the profit no more than inflation? Other investment returns, such as dividends, need review. («سود بانکها با توجّه به تورّم») rules=['kha-bank-profit']
- `ftk-year-known` (boolean) Do you know when your khums year really begins (for example the date of your first income)? («احکام خمس» Q231) rules=['kha-ftk-year']
- `ftk-paid-or-exempt` (boolean) Was this acquired with money on which khums was already paid, or with money not liable to khums (such as a gift or an inheritance)? («اموال مخمّس») rules=['kha-paid']
- `ftk-necessity` (boolean) Is it a necessity of your life that you use (such as your home, car, furniture or clothing)? (Q236, Q126) rules=['kha-ftk-necessities']
- `ftk-necessity-status` (boolean) Is it lawful, within what is customary, and fitting your standing in life? («هزینه های مشروعی … در حدّ متعارف و متناسب با شأن») rules=['kha-expenses']
- `ftk-funds` (choice) What money did it come from? For a necessity bought with older income, enter its purchase price as the amount and the purchase date as the date; for other property bought with older income, enter its value at the first khums year-end after you bought it. (Q236, «محلّ کسب», Q39) choices=["Income of my current khums year", "Older saved income (a khums year had passed over it)", "Not sure whether it came from a gift or from earnings", "I do not know which money it came from"] rules=['kha-ftk-necessities', 'kha-ftk-capital', 'kha-ftk-cash', 'kha-ftk-doubt']
- `ftk-amount-known` (boolean) Do you know this amount of earlier unpaid khums exactly? (Q255) rules=['kha-ftk-unpaid']
- `ftk-amount-is-price` (boolean) Is the amount you entered for this item its PURCHASE PRICE, dated the day you bought it (not its value today)? If not, change the entry. (Q236, Q126) rules=['kha-ftk-necessities']
- `ftk-amount-is-first-value` (boolean) Is the amount you entered its value at the FIRST khums year-end after you bought it, dated that year-end (not its price or value today)? If not, change the entry. («محلّ کسب» 4–5) rules=['kha-ftk-capital']
- `ftk-capital-hardship` (boolean) Is this capital you work with (such as a shop, tools or business funds), and after paying one-fifth of it would what remains NOT be enough — or might not be enough — for living costs fitting your status? Your own assessment. («سرمایه ای که خمس ندارد», Q6) rules=['kha-ftk-hardship']
- `ftk-savings-emergency` (boolean) Did you keep this money for possible emergencies, and after paying one-fifth would what remains not be enough, so your worry would not be removed? Your own assessment. (Q120) rules=['kha-ftk-hardship']
- `missed-amount-known` (boolean) Do you know this amount for that year (from records), rather than not knowing it? (Q255) rules=['kha-ftk-unpaid', 'kha-missed-years']

## Fact mapping (every leaf)

### annual-asset-1 workflows=['annual'] kinds=['ASSET'] subtypes=['PRECIOUS_METAL', 'REAL_ESTATE', 'VEHICLE', 'INVESTMENT', 'HOUSEHOLD_ITEM', 'RECEIVABLE', 'HOME', 'LAND', 'JEWELLERY', 'PERSONAL_ITEM', 'BUSINESS_EQUIPMENT', 'DIGITAL_ASSET', 'JOINT_OWNERSHIP', 'OTHER'] rules=['kha-paid']

- holding-paid=true > holding-inherited-unpaid=true → CAT pending-inheritance
- holding-paid=true > holding-inherited-unpaid=false > holding-for-sale=true → CAT holdings
- holding-paid=true > holding-inherited-unpaid=false > holding-for-sale=false → EXCLUDE kha-paid
- holding-paid=true > holding-inherited-unpaid=false > holding-for-sale=<other/invalid> → STOP[consult-entry]
- holding-paid=true > holding-inherited-unpaid=<other/invalid> → STOP[consult-entry]
- holding-paid=false → CAT holdings
- holding-paid=<other/invalid> → STOP[consult-entry]

### annual-asset-2 workflows=['annual'] kinds=['ASSET'] subtypes=['BUSINESS_STOCK'] rules=['kha-business-cost']

- (always) → CAT business-stock

### annual-balance-1 workflows=['annual'] kinds=['BALANCE'] subtypes=['CASH', 'BANK_ACCOUNT', 'DIGITAL_WALLET', 'OTHER'] rules=['kha-paid']

- holding-paid=true > holding-inherited-unpaid=true → CAT pending-inheritance
- holding-paid=true > holding-inherited-unpaid=false → EXCLUDE kha-paid
- holding-paid=true > holding-inherited-unpaid=<other/invalid> → STOP[consult-entry]
- holding-paid=false → CAT holdings
- holding-paid=<other/invalid> → STOP[consult-entry]

### annual-balance-2 workflows=['annual'] kinds=['BALANCE'] subtypes=['MIXED_FUNDS'] rules=['kha-mixed', 'kha-mixed-other']

- mixed-certain=true > mixed-amount-known=true > mixed-owner-known=true → CAT mixed-owner
- mixed-certain=true > mixed-amount-known=true > mixed-owner-known=false → CAT mixed-sadaqah
- mixed-certain=true > mixed-amount-known=true > mixed-owner-known=<other/invalid> → STOP[consult-entry]
- mixed-certain=true > mixed-amount-known=false > mixed-owner-known=true → CAT mixed-owner
- mixed-certain=true > mixed-amount-known=false > mixed-owner-known=false > mixed-over-fifth=true → CAT mixed-over-fifth
- mixed-certain=true > mixed-amount-known=false > mixed-owner-known=false > mixed-over-fifth=false → CAT mixed-khums
- mixed-certain=true > mixed-amount-known=false > mixed-owner-known=false > mixed-over-fifth=<other/invalid> → STOP[consult-entry]
- mixed-certain=true > mixed-amount-known=false > mixed-owner-known=<other/invalid> → STOP[consult-entry]
- mixed-certain=true > mixed-amount-known=<other/invalid> → STOP[consult-entry]
- mixed-certain=false → EXCLUDE kha-mixed
- mixed-certain=<other/invalid> → STOP[consult-entry]

### annual-income-1 workflows=['annual'] kinds=['INCOME'] subtypes=['EMPLOYMENT'] rules=['kha-income', 'kha-pension']

- (always) → CAT earnings

### annual-income-2 workflows=['annual'] kinds=['INCOME'] subtypes=['BUSINESS'] rules=['kha-income', 'kha-business-cost']

- (always) → CAT business-income

### annual-income-3 workflows=['annual'] kinds=['INCOME'] subtypes=['INVESTMENT_RETURN'] rules=['kha-bank-profit']

- bank-profit-within-inflation=true → EXCLUDE kha-bank-profit
- bank-profit-within-inflation=false → CAT pending-income
- bank-profit-within-inflation=<other/invalid> → STOP[consult-entry]

### annual-income-4 workflows=['annual'] kinds=['INCOME'] subtypes=['RENTAL', 'FREELANCE'] rules=['kha-income']

- (always) → CAT work-earnings

### annual-income-5 workflows=['annual'] kinds=['INCOME'] subtypes=['SALE', 'OTHER'] rules=['q-INC-01', 'q-INC-07']

- (always) → CAT pending-income

### annual-income-6 workflows=['annual'] kinds=['INCOME'] subtypes=['GIFT', 'CHARITY_RECEIVED'] rules=['kha-gift']

- (always) → EXCLUDE kha-gift

### annual-income-7 workflows=['annual'] kinds=['INCOME'] subtypes=['INHERITANCE'] rules=['kha-inheritance']

- inh-deceased-unpaid=true → CAT pending-inheritance
- inh-deceased-unpaid=false → EXCLUDE kha-inheritance
- inh-deceased-unpaid=<other/invalid> → STOP[consult-entry]

### annual-income-8 workflows=['annual'] kinds=['INCOME'] subtypes=['BONUS'] rules=['kha-bonus']

- (always) → EXCLUDE kha-bonus

### annual-income-9 workflows=['annual'] kinds=['INCOME'] subtypes=['PENSION_OR_BENEFIT'] rules=['kha-pension', 'kha-gift']

- pension-kind="Retirement pension" → CAT earnings
- pension-kind="A payment I had no right to demand" → EXCLUDE kha-gift
- pension-kind="Insurance payout" → CAT pending-income
- pension-kind="Other" → CAT pending-income
- pension-kind=<other/invalid> → STOP[consult-entry]

### annual-income-10 workflows=['annual'] kinds=['INCOME'] subtypes=['MINED_PRODUCT'] rules=['kha-mined']

- mined-nisab=true → CAT mined
- mined-nisab=false → EXCLUDE kha-mined
- mined-nisab=<other/invalid> → STOP[consult-entry]

### annual-income-11 workflows=['annual'] kinds=['INCOME'] subtypes=['TREASURE'] rules=['kha-treasure']

- treasure-nisab=true > treasure-own=true → CAT treasure
- treasure-nisab=true > treasure-own=false → CAT pending-special
- treasure-nisab=true > treasure-own=<other/invalid> → STOP[consult-entry]
- treasure-nisab=false → CAT pending-special
- treasure-nisab=<other/invalid> → STOP[consult-entry]

### annual-income-12 workflows=['annual'] kinds=['INCOME'] subtypes=['DIVING_GEMS'] rules=['kha-diving']

- diving-nisab=true → CAT diving
- diving-nisab=false → CAT pending-special
- diving-nisab=<other/invalid> → STOP[consult-entry]

### annual-expense-1 workflows=['annual'] kinds=['EXPENSE'] subtypes=['HOUSEHOLD', 'HOUSING', 'EDUCATION', 'HEALTH', 'TRAVEL', 'DONATION', 'RELIGIOUS_DUTY'] rules=['kha-expenses', 'kha-current-expenses']

- (always) → CAT living

### annual-expense-2 workflows=['annual'] kinds=['EXPENSE'] subtypes=['BUSINESS'] rules=['kha-income', 'kha-business-cost']

- (always) → CAT business-costs

### annual-expense-3 workflows=['annual'] kinds=['EXPENSE'] subtypes=['CAPITAL_LOSS'] rules=['kha-capital-loss']

- capital-loss-business=true → CAT capital-losses
- capital-loss-business=false → CAT pending-expense
- capital-loss-business=<other/invalid> → STOP[consult-entry]

### annual-expense-4 workflows=['annual'] kinds=['EXPENSE'] subtypes=['SOLD_ITEM_COST', 'ASSET_PURCHASE', 'OTHER'] rules=['q-EXP-01', 'q-EXP-05']

- (always) → CAT pending-expense

### annual-expense-5 workflows=['annual'] kinds=['EXPENSE'] subtypes=['KHUMS_PAID'] rules=['kha-payments']

- (always) → CAT khums-paid

### annual-liability-1 workflows=['annual'] kinds=['LIABILITY'] subtypes=['LOAN', 'MORTGAGE', 'CREDIT_CARD', 'UNPAID_BILL', 'BUSINESS_DEBT', 'OTHER'] rules=['kha-debts', 'kha-old-debts']

- debt-living-this-year=true > debt-spending-entered=true → EXCLUDE kha-debts
- debt-living-this-year=true > debt-spending-entered=false → CAT debts-deductible
- debt-living-this-year=true > debt-spending-entered=<other/invalid> → STOP[consult-entry]
- debt-living-this-year=false > debt-business-cost=true → CAT business-debts
- debt-living-this-year=false > debt-business-cost=false > debt-earlier-paid-soon=true → CAT debts-deductible
- debt-living-this-year=false > debt-business-cost=false > debt-earlier-paid-soon=false → CAT debts
- debt-living-this-year=false > debt-business-cost=false > debt-earlier-paid-soon=<other/invalid> → STOP[consult-entry]
- debt-living-this-year=false > debt-business-cost=<other/invalid> → STOP[consult-entry]
- debt-living-this-year=<other/invalid> → STOP[consult-entry]

### annual-liability-2 workflows=['annual'] kinds=['LIABILITY'] subtypes=['UNPAID_KHUMS'] rules=['q-FTK-01', 'q-MIS-01', 'q-MIS-02', 'q-MIS-05']

- (always) → CAT unpaid-khums

### ftk-asset workflows=['first-time'] kinds=['ASSET'] subtypes=['PRECIOUS_METAL', 'REAL_ESTATE', 'VEHICLE', 'INVESTMENT', 'HOUSEHOLD_ITEM', 'RECEIVABLE', 'HOME', 'LAND', 'JEWELLERY', 'PERSONAL_ITEM', 'BUSINESS_EQUIPMENT', 'DIGITAL_ASSET', 'JOINT_OWNERSHIP', 'OTHER'] rules=['kha-ftk-necessities', 'kha-ftk-capital', 'kha-ftk-cash']

- ftk-paid-or-exempt=true > holding-inherited-unpaid=true → CAT ftk-review
- ftk-paid-or-exempt=true > holding-inherited-unpaid=false > holding-for-sale=true → CAT ftk-review
- ftk-paid-or-exempt=true > holding-inherited-unpaid=false > holding-for-sale=false → EXCLUDE kha-paid
- ftk-paid-or-exempt=true > holding-inherited-unpaid=false > holding-for-sale=<other/invalid> → STOP[consult-entry]
- ftk-paid-or-exempt=true > holding-inherited-unpaid=<other/invalid> → STOP[consult-entry]
- ftk-paid-or-exempt=false > ftk-necessity=true > ftk-funds="Income of my current khums year" > ftk-necessity-status=true → EXCLUDE kha-expenses,kha-current-expenses
- ftk-paid-or-exempt=false > ftk-necessity=true > ftk-funds="Income of my current khums year" > ftk-necessity-status=false → CAT ftk-review
- ftk-paid-or-exempt=false > ftk-necessity=true > ftk-funds="Income of my current khums year" > ftk-necessity-status=<other/invalid> → STOP[consult-entry]
- ftk-paid-or-exempt=false > ftk-necessity=true > ftk-funds="Older saved income (a khums year had passed over it)" > ftk-amount-is-price=true → CAT ftk-older-purchase
- ftk-paid-or-exempt=false > ftk-necessity=true > ftk-funds="Older saved income (a khums year had passed over it)" > ftk-amount-is-price=false → STOP[consult-entry]
- ftk-paid-or-exempt=false > ftk-necessity=true > ftk-funds="Older saved income (a khums year had passed over it)" > ftk-amount-is-price=<other/invalid> → STOP[consult-entry]
- ftk-paid-or-exempt=false > ftk-necessity=true > ftk-funds="Not sure whether it came from a gift or from earnings" → EXCLUDE kha-ftk-doubt
- ftk-paid-or-exempt=false > ftk-necessity=true > ftk-funds="I do not know which money it came from" → CAT ftk-settle
- ftk-paid-or-exempt=false > ftk-necessity=true > ftk-funds=<other/invalid> → STOP[consult-entry]
- ftk-paid-or-exempt=false > ftk-necessity=false > ftk-capital-hardship=true → EXCLUDE kha-ftk-hardship
- ftk-paid-or-exempt=false > ftk-necessity=false > ftk-capital-hardship=false > ftk-funds="Income of my current khums year" → CAT ftk-current
- ftk-paid-or-exempt=false > ftk-necessity=false > ftk-capital-hardship=false > ftk-funds="Older saved income (a khums year had passed over it)" > ftk-amount-is-first-value=true → CAT ftk-older-capital
- ftk-paid-or-exempt=false > ftk-necessity=false > ftk-capital-hardship=false > ftk-funds="Older saved income (a khums year had passed over it)" > ftk-amount-is-first-value=false → STOP[consult-entry]
- ftk-paid-or-exempt=false > ftk-necessity=false > ftk-capital-hardship=false > ftk-funds="Older saved income (a khums year had passed over it)" > ftk-amount-is-first-value=<other/invalid> → STOP[consult-entry]
- ftk-paid-or-exempt=false > ftk-necessity=false > ftk-capital-hardship=false > ftk-funds="Not sure whether it came from a gift or from earnings" → EXCLUDE kha-ftk-doubt
- ftk-paid-or-exempt=false > ftk-necessity=false > ftk-capital-hardship=false > ftk-funds="I do not know which money it came from" → CAT ftk-settle
- ftk-paid-or-exempt=false > ftk-necessity=false > ftk-capital-hardship=false > ftk-funds=<other/invalid> → STOP[consult-entry]
- ftk-paid-or-exempt=false > ftk-necessity=false > ftk-capital-hardship=<other/invalid> → STOP[consult-entry]
- ftk-paid-or-exempt=false > ftk-necessity=<other/invalid> → STOP[consult-entry]
- ftk-paid-or-exempt=<other/invalid> → STOP[consult-entry]

### ftk-stock workflows=['first-time'] kinds=['ASSET'] subtypes=['BUSINESS_STOCK'] rules=['kha-ftk-year']

- (always) → CAT ftk-review

### ftk-balance workflows=['first-time'] kinds=['BALANCE'] subtypes=['CASH', 'BANK_ACCOUNT', 'DIGITAL_WALLET', 'OTHER'] rules=['kha-ftk-cash']

- ftk-paid-or-exempt=true > holding-inherited-unpaid=true → CAT ftk-review
- ftk-paid-or-exempt=true > holding-inherited-unpaid=false → EXCLUDE kha-paid
- ftk-paid-or-exempt=true > holding-inherited-unpaid=<other/invalid> → STOP[consult-entry]
- ftk-paid-or-exempt=false > ftk-funds="Income of my current khums year" > ftk-savings-emergency=true → EXCLUDE kha-ftk-hardship
- ftk-paid-or-exempt=false > ftk-funds="Income of my current khums year" > ftk-savings-emergency=false → CAT ftk-current
- ftk-paid-or-exempt=false > ftk-funds="Income of my current khums year" > ftk-savings-emergency=<other/invalid> → STOP[consult-entry]
- ftk-paid-or-exempt=false > ftk-funds="Older saved income (a khums year had passed over it)" > ftk-savings-emergency=true → CAT ftk-review
- ftk-paid-or-exempt=false > ftk-funds="Older saved income (a khums year had passed over it)" > ftk-savings-emergency=false → CAT ftk-older-cash
- ftk-paid-or-exempt=false > ftk-funds="Older saved income (a khums year had passed over it)" > ftk-savings-emergency=<other/invalid> → STOP[consult-entry]
- ftk-paid-or-exempt=false > ftk-funds="Not sure whether it came from a gift or from earnings" → EXCLUDE kha-ftk-doubt
- ftk-paid-or-exempt=false > ftk-funds="I do not know which money it came from" → CAT ftk-settle
- ftk-paid-or-exempt=false > ftk-funds=<other/invalid> → STOP[consult-entry]
- ftk-paid-or-exempt=<other/invalid> → STOP[consult-entry]

### ftk-mixed workflows=['first-time'] kinds=['BALANCE'] subtypes=['MIXED_FUNDS'] rules=['kha-ftk-year']

- (always) → CAT ftk-review

### ftk-income workflows=['first-time'] kinds=['INCOME'] subtypes=['EMPLOYMENT', 'BUSINESS', 'INVESTMENT_RETURN', 'RENTAL', 'SALE', 'GIFT', 'INHERITANCE', 'FREELANCE', 'BONUS', 'PENSION_OR_BENEFIT', 'CHARITY_RECEIVED', 'MINED_PRODUCT', 'TREASURE', 'DIVING_GEMS', 'OTHER'] rules=['kha-ftk-year']

- (always) → CAT ftk-review

### ftk-expense workflows=['first-time'] kinds=['EXPENSE'] subtypes=['HOUSEHOLD', 'HOUSING', 'EDUCATION', 'HEALTH', 'TRAVEL', 'BUSINESS', 'DONATION', 'RELIGIOUS_DUTY', 'CAPITAL_LOSS', 'SOLD_ITEM_COST', 'ASSET_PURCHASE', 'KHUMS_PAID', 'OTHER'] rules=['kha-ftk-year']

- (always) → CAT ftk-review

### ftk-unpaid workflows=['first-time'] kinds=['LIABILITY'] subtypes=['UNPAID_KHUMS'] rules=['kha-ftk-unpaid']

- ftk-amount-known=true → CAT ftk-unpaid
- ftk-amount-known=false → CAT ftk-settle
- ftk-amount-known=<other/invalid> → STOP[consult-entry]

### ftk-liability workflows=['first-time'] kinds=['LIABILITY'] subtypes=['LOAN', 'MORTGAGE', 'CREDIT_CARD', 'UNPAID_BILL', 'BUSINESS_DEBT', 'OTHER'] rules=['kha-ftk-year', 'kha-debts']

- (always) → CAT ftk-debts

### missed-asset-1 workflows=['missed-year'] kinds=['ASSET'] subtypes=['PRECIOUS_METAL', 'REAL_ESTATE', 'VEHICLE', 'INVESTMENT', 'HOUSEHOLD_ITEM', 'RECEIVABLE', 'HOME', 'LAND', 'JEWELLERY', 'PERSONAL_ITEM', 'BUSINESS_EQUIPMENT', 'DIGITAL_ASSET', 'JOINT_OWNERSHIP', 'OTHER'] rules=['kha-paid', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true > holding-paid=true > holding-inherited-unpaid=true → CAT pending-inheritance
- missed-amount-known=true > holding-paid=true > holding-inherited-unpaid=false > holding-for-sale=true → CAT holdings
- missed-amount-known=true > holding-paid=true > holding-inherited-unpaid=false > holding-for-sale=false → EXCLUDE kha-paid
- missed-amount-known=true > holding-paid=true > holding-inherited-unpaid=false > holding-for-sale=<other/invalid> → STOP[consult-entry]
- missed-amount-known=true > holding-paid=true > holding-inherited-unpaid=<other/invalid> → STOP[consult-entry]
- missed-amount-known=true > holding-paid=false → CAT holdings
- missed-amount-known=true > holding-paid=<other/invalid> → STOP[consult-entry]
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-asset-2 workflows=['missed-year'] kinds=['ASSET'] subtypes=['BUSINESS_STOCK'] rules=['kha-business-cost', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true → CAT business-stock
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-balance-1 workflows=['missed-year'] kinds=['BALANCE'] subtypes=['CASH', 'BANK_ACCOUNT', 'DIGITAL_WALLET', 'OTHER'] rules=['kha-paid', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true > holding-paid=true > holding-inherited-unpaid=true → CAT pending-inheritance
- missed-amount-known=true > holding-paid=true > holding-inherited-unpaid=false → EXCLUDE kha-paid
- missed-amount-known=true > holding-paid=true > holding-inherited-unpaid=<other/invalid> → STOP[consult-entry]
- missed-amount-known=true > holding-paid=false → CAT holdings
- missed-amount-known=true > holding-paid=<other/invalid> → STOP[consult-entry]
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-balance-2 workflows=['missed-year'] kinds=['BALANCE'] subtypes=['MIXED_FUNDS'] rules=['kha-mixed', 'kha-mixed-other', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true > mixed-certain=true > mixed-amount-known=true > mixed-owner-known=true → CAT mixed-owner
- missed-amount-known=true > mixed-certain=true > mixed-amount-known=true > mixed-owner-known=false → CAT mixed-sadaqah
- missed-amount-known=true > mixed-certain=true > mixed-amount-known=true > mixed-owner-known=<other/invalid> → STOP[consult-entry]
- missed-amount-known=true > mixed-certain=true > mixed-amount-known=false > mixed-owner-known=true → CAT mixed-owner
- missed-amount-known=true > mixed-certain=true > mixed-amount-known=false > mixed-owner-known=false > mixed-over-fifth=true → CAT mixed-over-fifth
- missed-amount-known=true > mixed-certain=true > mixed-amount-known=false > mixed-owner-known=false > mixed-over-fifth=false → CAT mixed-khums
- missed-amount-known=true > mixed-certain=true > mixed-amount-known=false > mixed-owner-known=false > mixed-over-fifth=<other/invalid> → STOP[consult-entry]
- missed-amount-known=true > mixed-certain=true > mixed-amount-known=false > mixed-owner-known=<other/invalid> → STOP[consult-entry]
- missed-amount-known=true > mixed-certain=true > mixed-amount-known=<other/invalid> → STOP[consult-entry]
- missed-amount-known=true > mixed-certain=false → EXCLUDE kha-mixed
- missed-amount-known=true > mixed-certain=<other/invalid> → STOP[consult-entry]
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-income-1 workflows=['missed-year'] kinds=['INCOME'] subtypes=['EMPLOYMENT'] rules=['kha-income', 'kha-pension', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true → CAT earnings
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-income-2 workflows=['missed-year'] kinds=['INCOME'] subtypes=['BUSINESS'] rules=['kha-income', 'kha-business-cost', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true → CAT business-income
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-income-3 workflows=['missed-year'] kinds=['INCOME'] subtypes=['INVESTMENT_RETURN'] rules=['kha-bank-profit', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true > bank-profit-within-inflation=true → EXCLUDE kha-bank-profit
- missed-amount-known=true > bank-profit-within-inflation=false → CAT pending-income
- missed-amount-known=true > bank-profit-within-inflation=<other/invalid> → STOP[consult-entry]
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-income-4 workflows=['missed-year'] kinds=['INCOME'] subtypes=['RENTAL', 'FREELANCE'] rules=['kha-income', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true → CAT work-earnings
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-income-5 workflows=['missed-year'] kinds=['INCOME'] subtypes=['SALE', 'OTHER'] rules=['q-INC-01', 'q-INC-07', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true → CAT pending-income
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-income-6 workflows=['missed-year'] kinds=['INCOME'] subtypes=['GIFT', 'CHARITY_RECEIVED'] rules=['kha-gift', 'kha-missed-years', 'kha-ftk-unpaid']

- (always) → EXCLUDE kha-gift

### missed-income-7 workflows=['missed-year'] kinds=['INCOME'] subtypes=['INHERITANCE'] rules=['kha-inheritance', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true > inh-deceased-unpaid=true → CAT pending-inheritance
- missed-amount-known=true > inh-deceased-unpaid=false → EXCLUDE kha-inheritance
- missed-amount-known=true > inh-deceased-unpaid=<other/invalid> → STOP[consult-entry]
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-income-8 workflows=['missed-year'] kinds=['INCOME'] subtypes=['BONUS'] rules=['kha-bonus', 'kha-missed-years', 'kha-ftk-unpaid']

- (always) → EXCLUDE kha-bonus

### missed-income-9 workflows=['missed-year'] kinds=['INCOME'] subtypes=['PENSION_OR_BENEFIT'] rules=['kha-pension', 'kha-gift', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true > pension-kind="Retirement pension" → CAT earnings
- missed-amount-known=true > pension-kind="A payment I had no right to demand" → EXCLUDE kha-gift
- missed-amount-known=true > pension-kind="Insurance payout" → CAT pending-income
- missed-amount-known=true > pension-kind="Other" → CAT pending-income
- missed-amount-known=true > pension-kind=<other/invalid> → STOP[consult-entry]
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-income-10 workflows=['missed-year'] kinds=['INCOME'] subtypes=['MINED_PRODUCT'] rules=['kha-mined', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true > mined-nisab=true → CAT mined
- missed-amount-known=true > mined-nisab=false → EXCLUDE kha-mined
- missed-amount-known=true > mined-nisab=<other/invalid> → STOP[consult-entry]
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-income-11 workflows=['missed-year'] kinds=['INCOME'] subtypes=['TREASURE'] rules=['kha-treasure', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true > treasure-nisab=true > treasure-own=true → CAT treasure
- missed-amount-known=true > treasure-nisab=true > treasure-own=false → CAT pending-special
- missed-amount-known=true > treasure-nisab=true > treasure-own=<other/invalid> → STOP[consult-entry]
- missed-amount-known=true > treasure-nisab=false → CAT pending-special
- missed-amount-known=true > treasure-nisab=<other/invalid> → STOP[consult-entry]
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-income-12 workflows=['missed-year'] kinds=['INCOME'] subtypes=['DIVING_GEMS'] rules=['kha-diving', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true > diving-nisab=true → CAT diving
- missed-amount-known=true > diving-nisab=false → CAT pending-special
- missed-amount-known=true > diving-nisab=<other/invalid> → STOP[consult-entry]
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-expense-1 workflows=['missed-year'] kinds=['EXPENSE'] subtypes=['HOUSEHOLD', 'HOUSING', 'EDUCATION', 'HEALTH', 'TRAVEL', 'DONATION', 'RELIGIOUS_DUTY'] rules=['kha-expenses', 'kha-current-expenses', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true → CAT living
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-expense-2 workflows=['missed-year'] kinds=['EXPENSE'] subtypes=['BUSINESS'] rules=['kha-income', 'kha-business-cost', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true → CAT business-costs
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-expense-3 workflows=['missed-year'] kinds=['EXPENSE'] subtypes=['CAPITAL_LOSS'] rules=['kha-capital-loss', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true > capital-loss-business=true → CAT capital-losses
- missed-amount-known=true > capital-loss-business=false → CAT pending-expense
- missed-amount-known=true > capital-loss-business=<other/invalid> → STOP[consult-entry]
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-expense-4 workflows=['missed-year'] kinds=['EXPENSE'] subtypes=['SOLD_ITEM_COST', 'ASSET_PURCHASE', 'OTHER'] rules=['q-EXP-01', 'q-EXP-05', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true → CAT pending-expense
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-expense-5 workflows=['missed-year'] kinds=['EXPENSE'] subtypes=['KHUMS_PAID'] rules=['kha-payments', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true → CAT khums-paid
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-liability-1 workflows=['missed-year'] kinds=['LIABILITY'] subtypes=['LOAN', 'MORTGAGE', 'CREDIT_CARD', 'UNPAID_BILL', 'BUSINESS_DEBT', 'OTHER'] rules=['kha-debts', 'kha-old-debts', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true > debt-living-this-year=true > debt-spending-entered=true → EXCLUDE kha-debts
- missed-amount-known=true > debt-living-this-year=true > debt-spending-entered=false → CAT debts-deductible
- missed-amount-known=true > debt-living-this-year=true > debt-spending-entered=<other/invalid> → STOP[consult-entry]
- missed-amount-known=true > debt-living-this-year=false > debt-business-cost=true → CAT business-debts
- missed-amount-known=true > debt-living-this-year=false > debt-business-cost=false > debt-earlier-paid-soon=true → CAT debts-deductible
- missed-amount-known=true > debt-living-this-year=false > debt-business-cost=false > debt-earlier-paid-soon=false → CAT debts
- missed-amount-known=true > debt-living-this-year=false > debt-business-cost=false > debt-earlier-paid-soon=<other/invalid> → STOP[consult-entry]
- missed-amount-known=true > debt-living-this-year=false > debt-business-cost=<other/invalid> → STOP[consult-entry]
- missed-amount-known=true > debt-living-this-year=<other/invalid> → STOP[consult-entry]
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

### missed-liability-2 workflows=['missed-year'] kinds=['LIABILITY'] subtypes=['UNPAID_KHUMS'] rules=['q-FTK-01', 'q-MIS-01', 'q-MIS-02', 'q-MIS-05', 'kha-missed-years', 'kha-ftk-unpaid']

- missed-amount-known=true → CAT unpaid-khums
- missed-amount-known=false → CAT missed-uncertain
- missed-amount-known=<other/invalid> → STOP[consult-entry]

unmatched → {'handling': 'consult', 'consultationId': 'consult-entry'}

## Categories

- `earnings` Earnings (work, rent and other earning) rules=['kha-income', 'kha-pension']
- `business-income` Business income rules=['kha-income', 'kha-business-cost']
- `business-costs` Costs of earning the business income rules=['kha-income', 'kha-business-cost']
- `gains` Other gains added to the profit rules=['kha-income']
- `living` Living expenses of the year rules=['kha-expenses', 'kha-current-expenses']
- `debts-deductible` Debts deducted under the transcribed ruling rules=['kha-debts', 'kha-old-debts']
- `debts` Debts not covered by the transcribed ruling rules=['kha-debts', 'kha-old-debts', 'q-LIA-01', 'q-LIA-02', 'q-LIA-03', 'q-LIA-04']
- `mined` Mined products reaching the niṣāb (value after costs) rules=['kha-mined']
- `treasure` Treasure reaching the niṣāb rules=['kha-treasure']
- `diving` Gems from diving reaching the niṣāb rules=['kha-diving']
- `mixed-khums` Mixed amounts purified by paying khums rules=['kha-mixed']
- `pending-mixed` Mixed amounts not covered by the transcribed rulings rules=['kha-mixed']
- `mixed-sadaqah` Mixed amounts: known unlawful amount, unknown owner (ṣadaqah, not khums) rules=['kha-mixed-other']
- `mixed-owner` Mixed amounts: known owner (settle with the owner, not khums) rules=['kha-mixed-other']
- `mixed-group` Mixed amounts: owner among a known group (not khums) rules=['kha-mixed-other']
- `mixed-over-fifth` Mixed amounts: unlawful part known to exceed one-fifth rules=['kha-mixed-other']
- `capital-losses` Losses of business capital, stock or tools rules=['kha-capital-loss']
- `pending-special` Treasure or gems needing review rules=['kha-treasure', 'kha-diving']
- `pending-income` Income not covered by a transcribed rule rules=['q-INC-01', 'q-INC-07']
- `pending-expense` Expenses not covered by a transcribed rule rules=['q-EXP-01', 'q-EXP-05']
- `holdings` Assets and balances (not used by the transcribed rules) rules=['q-PRO-01', 'q-PRO-03', 'q-INV-01', 'q-BUS-01', 'q-BUS-02', 'q-BUS-03', 'q-SAV-02', 'q-NEC-02']
- `unpaid-khums` Khums from earlier years not yet paid (as entered) rules=['q-FTK-01', 'q-MIS-01', 'q-MIS-02', 'q-MIS-05']
- `khums-paid` Khums already paid for this year (as entered) rules=['kha-payments']
- `business-debts` Unpaid costs of earning this year’s business income (deducted from it only) rules=['kha-debts']
- `pending-inheritance` Inheritance on which the deceased left khums unpaid (needs review) rules=['kha-inheritance']
- `business-stock` Unsold business stock (needs review) rules=['kha-business-cost']
- `work-earnings` Earnings from freelance or rental work rules=['kha-income']
- `ftk-current` Bought or saved from income of the current khums year (current value) rules=['kha-ftk-capital', 'kha-ftk-cash', 'kha-income']
- `ftk-older-purchase` Necessities bought with older saved income (purchase price) rules=['kha-ftk-necessities']
- `ftk-older-capital` Other property bought with older income (value at the first khums year-end after purchase) rules=['kha-ftk-capital']
- `ftk-older-cash` Savings from older income rules=['kha-ftk-cash']
- `ftk-settle` Entries whose source is not known (settlement with the office) rules=['kha-ftk-necessities', 'kha-ftk-unpaid']
- `ftk-review` Entries not covered by the transcribed first-time rulings rules=['kha-ftk-year', 'q-FTK-01', 'q-BUS-01']
- `ftk-debts` Debts (not covered by the transcribed first-time rulings) rules=['kha-debts', 'q-LIA-02']
- `ftk-unpaid` Khums from earlier years not yet paid, amount known (as entered) rules=['kha-ftk-unpaid']
- `missed-uncertain` Amounts of a missed year you do not know (settlement with the office) rules=['kha-ftk-unpaid', 'kha-missed-years']

## Consultations

- `consult-CTQ` Scholar review required: Continued taqlid (CTQ-01, CTQ-02, CTQ-03, CTQ-04, CTQ-05, CTQ-06, CTQ-07, CTQ-08). No scholar-approved ruling is encoded, so nothing is calculated here.
- `consult-FTK` Scholar review required: First-time Khums (FTK-01, FTK-02, FTK-03, FTK-04, FTK-05). No scholar-approved ruling is encoded, so nothing is calculated here.
- `consult-INC` Scholar review required: Income (INC-01, INC-02, INC-03, INC-04, INC-05, INC-06, INC-07). No scholar-approved ruling is encoded, so nothing is calculated here.
- `consult-EXP` Scholar review required: Expenses (EXP-01, EXP-02, EXP-03, EXP-04, EXP-05, EXP-06). No scholar-approved ruling is encoded, so nothing is calculated here.
- `consult-SUR` Scholar review required: Annual surplus and the Khums year (SUR-01, SUR-02, SUR-03, SUR-04, SUR-06, SUR-07). No scholar-approved ruling is encoded, so nothing is calculated here.
- `consult-SAV` Scholar review required: Savings (SAV-01, SAV-02, SAV-03, SAV-04). No scholar-approved ruling is encoded, so nothing is calculated here.
- `consult-NEC` Scholar review required: Personal necessities (NEC-01, NEC-02, NEC-03, NEC-04, NEC-05, NEC-06). No scholar-approved ruling is encoded, so nothing is calculated here.
- `consult-PRO` Scholar review required: Property (PRO-01, PRO-02, PRO-03, PRO-04, PRO-05, PRO-06). No scholar-approved ruling is encoded, so nothing is calculated here.
- `consult-INV` Scholar review required: Investments (INV-01, INV-02, INV-03, INV-04, INV-05). No scholar-approved ruling is encoded, so nothing is calculated here.
- `consult-LIA` Scholar review required: Liabilities (LIA-01, LIA-02, LIA-03, LIA-04, LIA-05). No scholar-approved ruling is encoded, so nothing is calculated here.
- `consult-BUS` Scholar review required: Business assets (BUS-01, BUS-02, BUS-03, BUS-04, BUS-05). No scholar-approved ruling is encoded, so nothing is calculated here.
- `consult-RATE` Scholar review required: Rate and base (SUR-05). No scholar-approved ruling is encoded, so nothing is calculated here.
- `consult-MIS` Scholar review required: Missed or irregular years (MIS-01, MIS-02, MIS-03, MIS-04, MIS-05, MIS-06). No scholar-approved ruling is encoded, so nothing is calculated here.
- `consult-entry-asset` Scholar review required: asset entries cannot be used yet. No scholar-approved rule says how they are treated (related research questions: PRO, INV, BUS, NEC).
- `consult-entry-balance` Scholar review required: cash and balance entries cannot be used yet. No scholar-approved rule says how they are treated (related research questions: SAV, SUR).
- `consult-entry-income` Scholar review required: income entries cannot be used yet. No scholar-approved rule says how they are treated (related research questions: INC).
- `consult-entry-expense` Scholar review required: expense entries cannot be used yet. No scholar-approved rule says how they are treated (related research questions: EXP, NEC).
- `consult-entry-liability` Scholar review required: liability entries cannot be used yet. No scholar-approved rule says how they are treated (related research questions: LIA).
- `consult-entry-gift` Scholar review required: gifts received cannot be used yet. No scholar-approved rule says how they are treated (related research questions: INC-03).
- `consult-entry-charity-received` Scholar review required: charity received cannot be used yet. No scholar-approved rule says how they are treated (related research questions: INC-03).
- `consult-entry-inheritance` Scholar review required: inheritance cannot be used yet. No scholar-approved rule says how they are treated (related research questions: INC-04).
- `consult-entry-pension-or-benefit` Scholar review required: pensions, benefits and insurance payouts cannot be used yet. No scholar-approved rule says how they are treated (related research questions: INC-07, SAV-04).
- `consult-entry-religious-duty` Scholar review required: hajj, ziyarah and other religious obligations cannot be used yet. No scholar-approved rule says how they are treated (related research questions: EXP-05).
- `consult-entry-digital-asset` Scholar review required: digital assets cannot be used yet. No scholar-approved rule says how they are treated (related research questions: INV-05, INV-01).
- `consult-entry-joint-ownership` Scholar review required: jointly owned assets and businesses cannot be used yet. No scholar-approved rule says how they are treated (related research questions: BUS-04).
- `consult-entry-mixed-funds` Scholar review required: money mixed with unlawful or doubtful money (no catalogue question covers this case exactly) cannot be used yet. No scholar-approved rule says how they are treated (related research questions: FTK-02, INC-05).
- `consult-entry-unpaid-khums` Scholar review required: khums from earlier years not yet paid cannot be used yet. No scholar-approved rule says how they are treated (related research questions: FTK-01, MIS-01, MIS-02, MIS-03, MIS-04, MIS-05, MIS-06).
- `consult-entry` Scholar review required: this entry (an estimated amount, a range, an approximate date or an unlisted type) cannot be used without a scholar-approved rule.
- `consult-business-loss` Scholar review required: the business made a loss this year. Whether it offsets other profit is not settled by a transcribed rule.
- `consult-living-status` Scholar review required: you did not confirm that your living expenses meet the condition the ruling attaches to them, so the deductible amount is unknown.
- `consult-debts` Scholar review required: a debt you entered is not covered by the transcribed debt ruling, so its effect on the profit is not settled.
- `consult-pending` Scholar review required: some income or expense entries (for example a sale or “other”) are not covered by a transcribed rule.
- `consult-special` Scholar review required: treasure or gems below the niṣāb, or treasure not yet yours to keep, are not covered by a transcribed rule, so the total stops.
- `consult-mixed-other` Scholar review required: a mixed amount whose unlawful part or owner is known (or exceeds one-fifth) has a different duty than khums.
- `consult-holdings` Scholar review required: the assets and balances you entered are not used by the transcribed rules (capital, stock, property, savings and investments need their own rulings). They could change the khums due, so the total is not given until they are reviewed.
- `consult-mixed-remainder` Scholar review required: what remains of a mixed amount after its unlawful part (or its khums) is settled is not addressed by the transcribed rulings — it may be part of this year’s profit. It could change the khums due, so the total is not given until it is reviewed.
- `consult-capital-loss` Scholar review required: the business capital losses you entered are more than the business profit of the year. Whether the rest reduces your salary or other income is not settled by a transcribed rule.
- `consult-work-costs` Scholar review required: your business costs are more than your business income, and you also have freelance or rental earnings. Costs of that work can only be entered as business costs, so whether they are costs of earning it («هزینه هایی که برای کسب درآمد») cannot be told from the entries.
- `consult-business-lines` Scholar review required: one line of business made a loss while another made a profit, and you did not confirm they share one account. With separate accounts a loss is not made up from another line («محاسبه خمس چند شغل», Q245), so each line’s figures are needed.
- `consult-khums-paid` Scholar review required: you entered khums already paid for this year. How it counts against this total is not stated in the transcribed text; for an excess the book says «از دفتر وجوهات و مسائل شرعیّه کسب تکلیف کنید».
- `consult-living-source` Scholar review required: some living expenses were not paid from this year’s income. The transcribed text defines the year’s expenses but does not say whether costs paid from other money reduce the year’s profit, so the deductible amount is not settled.
- `consult-inheritance-unpaid` Scholar review required: the person you inherited from left khums unpaid. «ارث … خمس ندارد» concerns the heir’s own khums; what is due on khums the deceased did not pay is not stated in the transcribed text.
- `consult-business-stock` Scholar review required: unsold stock or goods for sale at the end of the khums year. The costs of earning that the text deducts («مؤونه کسب درآمد») do not include stock not yet sold, and how it is valued at the year’s end is not transcribed, so the business profit is not calculated.
- `consult-mixed-sadaqah` Other duty (not khums): the known unlawful amount is given as ṣadaqah on behalf of its unknown owner (with a jurist’s permission where the ruling says so).
- `consult-mixed-owner` Other duty (not khums): the owner is known, so the unlawful part is settled with the owner.
- `consult-mixed-over-fifth` Scholar review required: the unlawful part exceeds one-fifth; by precaution khums plus the certain excess is given to the jurist, so the amount is not calculated.
- `consult-payee` Scholar review required: both halves are delivered to «ولیّ امر خمس» with his permission; who that is after the recorded date of death is not settled (CTQ-06, CTQ-07).
- `consult-ftk-inflation` Scholar review required: older property or savings owe khums «همراه با تورّم» (with inflation). One-fifth before inflation is shown; the text does not say how inflation is measured, so the total is not calculated.
- `consult-ftk-settlement` Settlement required: for entries whose source you do not know, the text says to settle with the office or an authorised agent (Q236, Q252, Q255). No amount is calculated for them.
- `consult-ftk-year` Settlement required: you do not know when your khums year begins. The text says the khums year is fixed by settlement with an authorised agent (Q231).
- `consult-ftk-pending` Scholar review required: an entry is not covered by the transcribed first-time rulings (business stock, mixed money, income or expense entries, debts, or khums already paid), so the total stops.
- `consult-missed-settlement` Settlement required: some amounts of this year are not known. For unknown amounts over several years the text says «باید با دفتر وجوهات یا وکیل ما محاسبه و مصالحه کند» (Q255), so this year is not added to the known total.
- `consult-missed-inflation` Scholar review required: khums of an earlier year is paid now. On repaying a debt the text allows the loss in the value of money to be claimed («کسر تورّم»), but it does not say how inflation is measured for khums, so the inflation is not calculated.

## Program: annual

- **review-taqlid** = STOP[consult-CTQ]
- **earnings** = sum(earnings,work-earnings)
- **business** = (sum(business-income) - sum(business-costs))
- **business-checked** = if (sum(business-stock) gt 0) then STOP[consult-business-stock] else if (sum(business-income,business-costs) gt 0) then if ans[business-stock-unsold]==true then STOP[consult-business-stock] else if (@business lt 0) then if ALL(ans[business-line-loss]==true, NOT ans[business-one-account]==true) then STOP[consult-business-lines] else if (sum(earnings,work-earnings,gains) gt 0) then if ans[business-loss-one-account]==false then if (sum(work-earnings) gt 0) then STOP[consult-work-costs] else 0 else STOP[consult-business-loss] else 0 else if ans[business-line-loss]==false then max(0, (@business - sum(business-debts))) else if ans[business-one-account]==true then max(0, (@business - sum(business-debts))) else STOP[consult-business-lines] else 0
- **gains** = sum(gains)
- **capital-losses-deducted** = if ALL((sum(capital-losses) gt 0), (sum(capital-losses) gt @business-checked)) then STOP[consult-capital-loss] else sum(capital-losses)
- **profit** = ((@earnings + @business-checked + @gains) - @capital-losses-deducted)
- **living** = if ans[living-within-status]==true then if (sum(living) gt 0) then if ans[living-from-year-income]==true then sum(living) else STOP[consult-living-source] else 0 else STOP[consult-living-status]
- **debts-deducted** = if ans[living-within-status]==true then sum(debts-deductible) else STOP[consult-living-status]
- **surplus** = if ANY((sum(pending-income) gt 0), (sum(pending-expense) gt 0)) then STOP[consult-pending] else if (sum(pending-inheritance) gt 0) then STOP[consult-inheritance-unpaid] else if (sum(debts) gt 0) then STOP[consult-debts] else max(0, (@profit - @living - @debts-deducted))
- **khums** = pct(@surplus, $khums-rate)
- **khums-mined** = pct(sum(mined), $khums-rate)
- **khums-treasure** = pct(sum(treasure), $khums-rate)
- **khums-diving** = pct(sum(diving), $khums-rate)
- **khums-mixed** = pct(sum(mixed-khums), $khums-rate)
- **khums-total** = if (sum(holdings) gt 0) then STOP[consult-holdings] else if (sum(pending-mixed) gt 0) then STOP[consult-mixed-other] else if (sum(mixed-over-fifth) gt 0) then STOP[consult-mixed-over-fifth] else if (sum(mixed-khums,mixed-sadaqah,mixed-owner,mixed-group) gt 0) then STOP[consult-mixed-remainder] else if (sum(pending-special) gt 0) then STOP[consult-special] else (@khums + @khums-mined + @khums-treasure + @khums-diving + @khums-mixed)
- **sahm-imam** = pct(@khums-total, $half-share)
- **sahm-sadat** = pct(@khums-total, $half-share)
- **khums-remaining** = if (sum(khums-paid) gt 0) then STOP[consult-khums-paid] else @khums-total
- **earlier-unpaid** = sum(unpaid-khums)
- **review-mixed-other** = if (sum(pending-mixed) gt 0) then STOP[consult-mixed-other] else 0
- **review-mixed-sadaqah** = if (sum(mixed-sadaqah) gt 0) then STOP[consult-mixed-sadaqah] else 0
- **review-mixed-owner** = if (sum(mixed-owner) gt 0) then STOP[consult-mixed-owner] else 0
- **review-mixed-over-fifth** = if (sum(mixed-over-fifth) gt 0) then STOP[consult-mixed-over-fifth] else 0
- **review-holdings** = if (sum(holdings) gt 0) then STOP[consult-holdings] else 0
- **review-payee** = STOP[consult-payee]

Outputs: khums-total←khums-total, khums-due←khums, khums-mined←khums-mined, khums-treasure←khums-treasure, khums-diving←khums-diving, khums-mixed←khums-mixed, sahm-imam←sahm-imam, sahm-sadat←sahm-sadat, khums-remaining←khums-remaining, surplus←surplus, earlier-unpaid←earlier-unpaid, review-mixed-other←review-mixed-other, review-mixed-sadaqah←review-mixed-sadaqah, review-mixed-owner←review-mixed-owner, review-mixed-over-fifth←review-mixed-over-fifth, review-holdings←review-holdings, review-payee←review-payee, review-taqlid←review-taqlid

## Program: firstTime

- **review-taqlid** = STOP[consult-CTQ]
- **ftk-current** = pct(sum(ftk-current), $khums-rate)
- **ftk-older-base** = pct(sum(ftk-older-purchase,ftk-older-capital,ftk-older-cash), $khums-rate)
- **review-inflation** = if (sum(ftk-older-purchase,ftk-older-capital,ftk-older-cash) gt 0) then STOP[consult-ftk-inflation] else 0
- **review-settlement** = if (sum(ftk-settle) gt 0) then STOP[consult-ftk-settlement] else 0
- **review-year** = if ans[ftk-year-known]==true then 0 else STOP[consult-ftk-year]
- **khums-total** = if (sum(ftk-review,ftk-debts) gt 0) then STOP[consult-ftk-pending] else if (sum(ftk-older-purchase,ftk-older-capital,ftk-older-cash) gt 0) then STOP[consult-ftk-inflation] else if (sum(ftk-settle) gt 0) then STOP[consult-ftk-settlement] else if ans[ftk-year-known]==true then @ftk-current else STOP[consult-ftk-year]
- **sahm-imam** = pct(@khums-total, $half-share)
- **sahm-sadat** = pct(@khums-total, $half-share)
- **earlier-unpaid** = sum(ftk-unpaid)
- **review-payee** = STOP[consult-payee]

Outputs: khums-total←khums-total, ftk-current←ftk-current, ftk-older-base←ftk-older-base, sahm-imam←sahm-imam, sahm-sadat←sahm-sadat, earlier-unpaid←earlier-unpaid, review-inflation←review-inflation, review-settlement←review-settlement, review-year←review-year, review-payee←review-payee, review-taqlid←review-taqlid

## Program: missedYear

- **review-taqlid** = STOP[consult-CTQ]
- **earnings** = sum(earnings,work-earnings)
- **business** = (sum(business-income) - sum(business-costs))
- **business-checked** = if (sum(business-stock) gt 0) then STOP[consult-business-stock] else if (sum(business-income,business-costs) gt 0) then if ans[business-stock-unsold]==true then STOP[consult-business-stock] else if (@business lt 0) then if ALL(ans[business-line-loss]==true, NOT ans[business-one-account]==true) then STOP[consult-business-lines] else if (sum(earnings,work-earnings,gains) gt 0) then if ans[business-loss-one-account]==false then if (sum(work-earnings) gt 0) then STOP[consult-work-costs] else 0 else STOP[consult-business-loss] else 0 else if ans[business-line-loss]==false then max(0, (@business - sum(business-debts))) else if ans[business-one-account]==true then max(0, (@business - sum(business-debts))) else STOP[consult-business-lines] else 0
- **gains** = sum(gains)
- **capital-losses-deducted** = if ALL((sum(capital-losses) gt 0), (sum(capital-losses) gt @business-checked)) then STOP[consult-capital-loss] else sum(capital-losses)
- **profit** = ((@earnings + @business-checked + @gains) - @capital-losses-deducted)
- **living** = if ans[living-within-status]==true then if (sum(living) gt 0) then if ans[living-from-year-income]==true then sum(living) else STOP[consult-living-source] else 0 else STOP[consult-living-status]
- **debts-deducted** = if ans[living-within-status]==true then sum(debts-deductible) else STOP[consult-living-status]
- **surplus** = if ANY((sum(pending-income) gt 0), (sum(pending-expense) gt 0)) then STOP[consult-pending] else if (sum(pending-inheritance) gt 0) then STOP[consult-inheritance-unpaid] else if (sum(debts) gt 0) then STOP[consult-debts] else max(0, (@profit - @living - @debts-deducted))
- **khums** = pct(@surplus, $khums-rate)
- **khums-mined** = pct(sum(mined), $khums-rate)
- **khums-treasure** = pct(sum(treasure), $khums-rate)
- **khums-diving** = pct(sum(diving), $khums-rate)
- **khums-mixed** = pct(sum(mixed-khums), $khums-rate)
- **khums-total** = if (sum(holdings) gt 0) then STOP[consult-holdings] else if (sum(pending-mixed) gt 0) then STOP[consult-mixed-other] else if (sum(mixed-over-fifth) gt 0) then STOP[consult-mixed-over-fifth] else if (sum(mixed-khums,mixed-sadaqah,mixed-owner,mixed-group) gt 0) then STOP[consult-mixed-remainder] else if (sum(pending-special) gt 0) then STOP[consult-special] else (@khums + @khums-mined + @khums-treasure + @khums-diving + @khums-mixed)
- **sahm-imam** = pct(@khums-total, $half-share)
- **sahm-sadat** = pct(@khums-total, $half-share)
- **khums-remaining** = if (sum(khums-paid) gt 0) then STOP[consult-khums-paid] else @khums-total
- **earlier-unpaid** = sum(unpaid-khums)
- **review-mixed-other** = if (sum(pending-mixed) gt 0) then STOP[consult-mixed-other] else 0
- **review-mixed-sadaqah** = if (sum(mixed-sadaqah) gt 0) then STOP[consult-mixed-sadaqah] else 0
- **review-mixed-owner** = if (sum(mixed-owner) gt 0) then STOP[consult-mixed-owner] else 0
- **review-mixed-over-fifth** = if (sum(mixed-over-fifth) gt 0) then STOP[consult-mixed-over-fifth] else 0
- **review-holdings** = if (sum(holdings) gt 0) then STOP[consult-holdings] else 0
- **review-payee** = STOP[consult-payee]
- **review-uncertain** = if (sum(missed-uncertain) gt 0) then STOP[consult-missed-settlement] else 0
- **khums-year** = if (sum(missed-uncertain) gt 0) then STOP[consult-missed-settlement] else @khums-total
- **khums-known-years** = if ANY((sum(missed-uncertain) gt 0), (sum(khums-paid) gt 0), (sum(holdings) gt 0), (sum(pending-mixed) gt 0), (sum(mixed-over-fifth) gt 0), (sum(mixed-khums,mixed-sadaqah,mixed-owner,mixed-group) gt 0)) then 0 else @khums-total
- **review-inflation** = if (@khums-known-years gt 0) then STOP[consult-missed-inflation] else 0
- **year-khums** = if (sum(missed-uncertain) gt 0) then STOP[consult-missed-settlement] else @khums
- **year-khums-mined** = if (sum(missed-uncertain) gt 0) then STOP[consult-missed-settlement] else @khums-mined
- **year-khums-treasure** = if (sum(missed-uncertain) gt 0) then STOP[consult-missed-settlement] else @khums-treasure
- **year-khums-diving** = if (sum(missed-uncertain) gt 0) then STOP[consult-missed-settlement] else @khums-diving
- **year-khums-mixed** = if (sum(missed-uncertain) gt 0) then STOP[consult-missed-settlement] else @khums-mixed
- **year-khums-remaining** = if (sum(missed-uncertain) gt 0) then STOP[consult-missed-settlement] else @khums-remaining
- **year-surplus** = if (sum(missed-uncertain) gt 0) then STOP[consult-missed-settlement] else @surplus
- **year-earlier-unpaid** = if (sum(missed-uncertain) gt 0) then STOP[consult-missed-settlement] else @earlier-unpaid

Outputs: khums-known-years←khums-known-years, khums-year←khums-year, khums-due←year-khums, khums-mined←year-khums-mined, khums-treasure←year-khums-treasure, khums-diving←year-khums-diving, khums-mixed←year-khums-mixed, khums-remaining←year-khums-remaining, surplus←year-surplus, earlier-unpaid←year-earlier-unpaid, review-mixed-other←review-mixed-other, review-mixed-sadaqah←review-mixed-sadaqah, review-mixed-owner←review-mixed-owner, review-mixed-over-fifth←review-mixed-over-fifth, review-holdings←review-holdings, review-payee←review-payee, review-taqlid←review-taqlid, review-uncertain←review-uncertain, review-inflation←review-inflation

Aggregate outputs: khums-known-years

## Rules (transcriptions and placeholders)

- **kha-rate** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Introduction: «مکلّف باید یک پنجم از درآمدهای خود را به تفصیلی که گفته خواهد شد اداء کند». Encoded: the rate is one-fifth. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-income** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «هر گاه مکلّف از راه فعّالیّت های اقتصادی از قبیل تجارت، صنعت، کشاورزی، دریافت حقوق و اجرت، اجاره ی ملک و مانند آن، مالی به دست آورد، باید در پایان سال خمسی خمس مقدار مازاد بر مخارج خود و افراد تحت تکفّلش را بپردازد». Encoded: salary, wages, freelance work, rent and business profit are profit; khums is due on what exceeds the year’s expenses. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-expenses** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «مراد از مخارج سال علاوه بر آنچه انسان برای کسب درآمد خرج می کند، تمام هزینه های مشروعی است که در حدّ متعارف و متناسب با شأن زندگی او است»; spending beyond what is customary is liable. Encoded: living expenses are deducted only when the person confirms they are lawful, customary and fitting his status, and (0.7.0) that they were paid from the year’s income; costs paid from other money stop for review. Since 0.9.0 (fresh audit N6) a first-time necessity bought with current-year income is excluded only when the person confirms the same condition; otherwise it is reviewed. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-current-expenses** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «دسته سوّم، هزینه های جاری زندگی مانند قبوض آب و برق و گاز، هزینه های درمان، تفریح، هدایا، صدقات»; charity given in keeping with status «خمس ندارد». Encoded: bills, medical costs, recreation, gifts given and charity given are living expenses. ISSUES: ['Hajj and ziyarah costs are encoded as living expenses under the general definition of lawful expenses.', 'Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-business-cost** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «مقداری از درآمد که صرف تحصیل ربح می شود … مانند هزینه حمل و نقل، اجرت کارمند و کارگر، اجاره ی مغازه، هزینه آب و برق و مالیات _ در حکم تلف است و متعلَّق خمس نیست». «و اگر برای این امور از غیر درآمد هزینه شده، از سود همان سال کسر می گردد». Encoded (0.4.0, audit C2): business costs are deducted from business income. A business loss reduces other income only under «محاسبه خمس چند شغل» (kha-business-lines), when the person confirms the business and other earnings share one account; the sentence above is not read as allowing it otherwise. Since 0.5.0 (re-audit K3) unsold stock at the year’s end stops for review: stock is not among the costs listed. Since 0.9.0 (fresh audit N4) a business loss beside freelance or rental earnings stops for review, since their costs can only be entered as business costs. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-gift** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «هر ملک یا کالا یا پول پرداختی به مکلّف که در صورت عدم پرداخت، مکلّف استحقاق مطالبه ی آن را ندارد، پرداخت خمس آن واجب نیست؛ مانند هدیه، … یارانه، جایزه های بانکی، کمک هزینه». Encoded: gifts and charity received are not added to the profit. ISSUES: ['A recommended (not obligatory) precaution to pay khums on gifts left over is noted in the text and not encoded.', 'Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-bonus** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «پرداخت خمس عیدی و پاداش واجب نیست». Encoded: bonuses and rewards are not added to the profit. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-inheritance** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «ارث و پول فروش آن خمس ندارد، هر چند قیمت آن افزایش یافته باشد، مگر اینکه آن را سرمایه (در معرض فروش) قرار دهد». Encoded: inheritance received is not added to the profit. Since 0.5.0 (re-audit K4) an inheritance on which the person knows the deceased left khums unpaid stops for review (the text speaks of the heir’s own khums only), and an inherited or khums-paid asset held as capital for sale is listed for review instead of being excluded. Since 0.9.0 (fresh audit N3) the same question is asked for assets and balances acquired with inherited money (annual, first-time and missed years). ISSUES: ['The exception for inherited property held for sale (obligatory precaution) is not encoded; such a sale stops for review.', 'Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-pension** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «حقوق بازنشستگی که شخص بازنشسته دریافت می کند، مانند حقوق زمان اشتغال متعلّق خمس است». Encoded: a retirement pension is profit like a salary. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-debts** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «میتواند بدهی های مربوط به مئونه را که مربوط به سال جاری است و بعد از حصول اوّلین درآمد سال ایجاد شده است را _ بدون پرداخت _ از درآمد سال کسر کند»; earlier living debts are not deductible by obligatory precaution; an unpaid business-cost debt is deductible only from the income it was incurred for: «اگر بدهی مثلاً مربوط به تجارت است ولی درآمد سال مربوط به حقوق کارمندی است، این بدهی از درآمد سال کارمندی قابل کسر و استثنا نیست» (PDF p.40 note). Encoded from the person’s answers about each debt (0.4.0, audit C1): an unpaid business-cost debt is deducted only from that year’s business profit and never below zero, so it never reduces salary or other income; any other debt stops for review. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-mined** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «چنانچه قیمت موادّ استخراج شده بعد از کم کردن هزینه های استخراج و تصفیه، معادل قیمت پانزده مثقال طلا باشد، واجب است خمس آن پرداخت شود و اگر ارزش آن کمتر از این مقدار باشد، خمس ندارد»; each partner’s share; due at once, not tied to the khums year. Encoded from the person’s confirmation of the niṣāb. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-treasure** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «ارزش آن معادل بیست دینار طلا یا دویست درهم نقره باشد، باید _ بدون لحاظ سال خمسی _ فوراً خمس آن را بپردازد»; special legal regulations and earlier owners take precedence. Encoded: one-fifth when the person confirms the niṣāb and that it is his; otherwise it stops for review. ISSUES: ['Treasure below the niṣāb is not covered by the text and stops for review.', 'Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-diving** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «چنانچه پس از کم کردن مخارج استخراج، به مقدار هجده نخود طلا یا بیشتر ارزش داشته باشد، باید خمس آن را بپردازد». Encoded: one-fifth when the person confirms the niṣāb; below it stops for review. ISSUES: ['Gems taken without diving with a tool are liable by obligatory precaution and are not encoded.', 'Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-mixed** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «اگر یقین به وجودِ مال حرام در اموالش دارد و مقدار آن را نمیداند و صاحب آن را هم نمی شناسد، با پرداخت خمس مجموع آن، حلال می شود … ولی اگر در مخلوط شدن مال حرام با اموال خود شک داشته باشد، چیزی بر عهده او نیست». Encoded: one-fifth of the whole in that case; doubt only: nothing; a known amount, a known owner or more than one-fifth is listed for review. Since 0.9.0 (fresh audit N1) any mixed amount withholds the total: the excerpt settles the unlawful part (or its khums), not what remains of the amount. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-distribution** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «خمس از دو قسمت مساوی تشکیل شده است که بخشی از آن سهم امام(علیه السّلام) و بخشی دیگر سهم سادات بزرگوار است». Encoded: the total khums is split into two equal halves, shown for information. ISSUES: ['Both halves are to be delivered to «ولیّ امر خمس»; who that is after the recorded date of death is a continued-taqlid question for the scholar (CTQ-06, CTQ-07).', 'Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-recipients** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «خمس باید _ هر چند با واسطه _ به ولیّ امر خمس تحویل و قبض ممهور به مهر او دریافت شود و بین سهم امام(علیه السّلام) و سهم سادات تفاوت نیست»; «به طور کلّی مصرف خمس _ سهم سادات و امام (علیه السّلام) _ باید با اجازه ولیّ امر خمس باشد»; paying to poor people, sayyids or others without the Marja’s permission «جایز نیست». Shown, not calculated. ISSUES: ['Who is «ولیّ امر خمس» after the recorded date of death is a continued-taqlid question for the scholar (CTQ-06, CTQ-07).', 'Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-paid** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «درآمدی که یک بار خمس آن داده شد، مجدّداً خمس به آن تعلّق نمی گیرد»; amounts not liable to khums include «هدیه، ارث، پول مخمّس» («بدهی و مال قرضی»). Encoded: assets and balances acquired with khums-paid or non-liable money are not liable again (business stock whose price rose is listed for review); since 0.9.0 (N3) inherited money first asks whether the deceased left khums unpaid. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-capital-loss** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «در سررسید سال خمسی خسارات وارده بر سرمایه _ استهلاک و افت قیمت ابزار و حادثه _ از درآمد کسر می شود … تفاوت نمی کند خسارت قبل از حصول اوّلین درآمد بر سرمایه وارد شده باشد یا بعد از آن»; theft and fire likewise. Encoded (0.5.0, re-audit K2): a loss the person confirms is of business capital or tools is deducted, up to the year’s business profit; any other loss, or a loss larger than the business profit (whose effect on other income is not settled, «محاسبه خمس چند شغل», Q245), stops for review. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-mixed-other** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Other duties for mixed property (not khums): known owners: «باید رضایت آنان را جلب کند»; unknown owners, known amount: «حکم مجهول المالک را دارد که باید از طرف صاحبانش به فقیرِ شرعی صدقه داده شود»; unlawful part known to exceed one-fifth: «بنا بر احتیاط باید خمس را به اضافه مقداری که یقین می کند بیش از خمس، متعلّق به غیر است، به حاکم شرع بدهد». Shown for review, never added to khums. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-old-debts** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «اگر مربوط به سال های قبل باشد، در صورتی که تا پنج روز بعد از سررسید سال خمسی پرداخت کند، خمس تعلّق نمی گیرد». Encoded: an earlier year’s living debt paid from this year’s income within five days after the khums year ends is deducted; otherwise it stops for review. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-bank-profit** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «اگر سپرده مخمّس باشد و سود بیش از مقدار تورّم نباشد، خمس ندارد». Encoded: bank profit on a khums-paid deposit that does not exceed inflation is not added; any other investment return (including cash dividends, which the book does not address explicitly) stops for review. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-payments** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «به طور کلی خمس هر سال از درآمد همان سال پرداخت می شود»; for khums paid in excess or on property not liable to it: «از دفتر وجوهات و مسائل شرعیّه کسب تکلیف کنید». The book does not state how khums paid during the year counts against the year’s total, so an entry of khums already paid stops for review and the total is not reduced. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-ftk-necessities** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Q236 (first assessment): «اگر بداند با درآمد پس اندازشده که سال خمسی بر آن گذشته است خریده است، باید خمس قیمت خرید همراه با تورّم آن را بپردازد و اگر نمی داند … مصالحه شود»; Q126: necessities bought with income whose khums was not paid: «باید خمس قیمت خرید را همراه با تورّم آن بپردازید»; Q252: not knowing whether a year had passed: «بنا بر احتیاط واجب باید با یکی از نمایندگان ما مصالحه نمایید». Encoded: one-fifth of the purchase price is shown before inflation; the inflation is a review item (the text does not say how it is measured) and an unknown source is a settlement review. ISSUES: ['How inflation is measured is not stated in the text.', 'Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-ftk-capital** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Property bought years ago from earnings without a khums year (a shop; farmland): «باید خمس قیمت اوّلین سال خمسی بعد از خرید را همراه با تورّم بپردازید»; «خمس قیمت زمین در سررسید اوّلین سال خمسی پس از خرید، باید محاسبه و همراه با تورّم آن پرداخت شود». Encoded: one-fifth of its value at the first khums year-end after purchase (the amount the person enters) is shown before inflation; the inflation is a review item. Property bought with income of the current khums year is valued now. ISSUES: ['How inflation is measured is not stated in the text.', 'Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-ftk-cash** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Q248: «در سررسید سال خمسی اگر مبلغ موجود بیش از مقدار مخمّس نباشد، خمس ندارد»; money kept in a deposit for four years: «حکم سرمایه را دارد و متعلّق خمس است و باید خمس آن همراه با تورّم (ارزش روز) پرداخت شود». Encoded: savings from income of the current khums year owe one-fifth; older savings owe one-fifth before inflation, with the inflation as a review item. ISSUES: ['How inflation is measured is not stated in the text.', 'Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-ftk-year** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Q231 (no khums year set): «خمس اموالتان را بر اساس سال خمسی واقعی _ اگر زمان آن را میدانید _ محاسبه و پرداخت کنید؛ و اگر زمان آن را نمیدانید، با مصالحه با وکیل مرجع تقلید، زمان محاسبه خمس، سررسید سال خمسی شما است». Encoded: the assessment uses the person’s real khums year when they know it; otherwise the khums year is a settlement review. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-ftk-doubt** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Kinds of doubt: doubt whether khums was paid on property that was liable: «خمس آن واجب است»; doubt between liable property such as earnings and non-liable property such as a gift: «حکم به عدم وجوب خمس می شود»; Q249: thinking it was probably paid: «باید خمس را بپردازید». Encoded: a doubt between gift and earnings excludes the entry; a doubt whether khums was paid is treated as not paid. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-ftk-unpaid** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Q253: «خمس واجب در هر حال باید پرداخت شود»; Q255 (several years unpaid, amount unknown): «باید با دفتر وجوهات یا وکیل ما محاسبه و مصالحه کند». Encoded: khums from earlier years whose amount is known is shown as entered; amounts the person does not know are a settlement review with the office. ISSUES: ['Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-missed-years** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Q231: khums is calculated «بر اساس سال خمسی واقعی»; Q247: «به طور کلی خمس هر سال از درآمد همان سال پرداخت می شود»; on repaying a debt: «طلبکار می تواند مقدار کاهش ارزش پول را مطالبه کند». Encoded: each missed year is calculated like a regular year from its own entries and the yearly results are added; the inflation since each year’s end is a review item, and a year with amounts the person does not know is a settlement review (Q255). ISSUES: ['How inflation is measured is not stated in the text.', 'Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-business-lines** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «کسی که چند رشته کسب دارد … چنانچه در هر رشته ی کسبی که دارد، سرمایه و دخل و خرج و حساب جداگانه دارد، باید در پایان سال خمسی منافع همان رشته را حساب کند و خمس آن را بدهد، و اگر در آن رشته ضرر کند، از رشته دیگر جبران نمی شود و اگر رشته های مختلف در دخل و خرج و حساب صندوق یکی باشند، باید همه را آخر سال یکجا حساب کند»; Q245: «جبران زیان و خسارت یک شغل از محلّ درآمد دیگری جایز نیست». Encoded from the person’s answers: with separate accounts a business loss counts as zero (both texts agree); since 0.9.0 (fresh audit N5) a loss with one shared account stops for review, because Q245 says a loss is not made up from another income while the note nets lines sharing one account, and whether other earnings are such a line is a choice between readings (0.4.0–0.8.0 reduced other earnings). Lines of business with a losing line are netted only when they share one account; with separate accounts each line’s figures are needed (review), also when the business as a whole made a loss (0.8.0). ISSUES: ['Whether salaried employment is a «رشته کسب» with its own account is the person’s answer; the text’s examples are rent, trade and farming.', 'Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
- **kha-ftk-hardship** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. «اگر سرمایه به مقداری باشد که در صورت پرداخت خمس آن، مقدار باقیمانده برای تأمین هزینه های زندگی کافی نباشد یا کفایت آن مشکوک باشد، خمس آن واجب نیست، حتّی اگر مکلّف بتواند به صورت اقساط، خمس آن را بپردازد» (p.8); Q6: «پرداخت خمس محلّ تجاری واجب است، مگر آنکه با پرداخت خمس، مقدار باقیمانده برای تأمین هزینه های زندگی متناسب با شأن عرفی تان کفایت نکند»; Q120: «پس انداز مقداری پول برای پیشامدهای احتمالی چنانچه با دادن خمس، مقدار باقیمانده کفایت نمی کند و نگرانی شخص برطرف نمی شود خمس ندارد». Encoded from the person’s answers (0.4.0, audit C8): capital the person works with, whose remainder after one-fifth would not (or doubtfully would) cover living costs fitting their status, is excluded; savings kept for possible emergencies, whose remainder would not suffice and the worry would not be removed, are excluded when they come from income of the current khums year; for older savings Q39 («متعلّق خمس است») and Q120 would need a choice between readings, so they stop for review (0.5.0, re-audit K5). ISSUES: ['Whether the remainder suffices is the person’s own assessment of their circumstances; the calculator does not judge it.', 'Pack-wide: source-verification record pending; English numbers checked only for Q224–Q271; no successor-office material (PRIMARY_SOURCE_INVENTORY §3.2.1, §3.3).']
