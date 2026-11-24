# sistani 0.9.0 inventory

## Questions

- `living-within-status` (boolean, required) Were all the living expenses you entered in keeping with your status (not beyond it)? (Ruling 1792) rules=['sis-1792', 'sis-1795', 'sis-598']
- `inh-deceased-unpaid` (boolean) Do you know that the person you inherited this from did not pay khums on it? (Ruling 1772) rules=['sis-1772']
- `inh-deceased-non-payer` (boolean) Did the person you inherited from not believe in paying khums, or never pay it, and leave no instruction in their will to pay it from the estate? (Ruling 1772) rules=['sis-1772']
- `inh-deceased-owed` (boolean) Do you know that the person you inherited from owed khums on other property? (Ruling 1772) rules=['sis-1772']
- `pension-shetab-transfer` (boolean) Is this an insurance payout, or a pension or retirement award from a fund that kept a share of your salary (not as a loan), paid by credit transfer through the Shetab interbank network into a savings or current account? Anything else: answer No. (Tawdih Jami’ 620, 624, 626 n.1) rules=['sis-620']
- `pension-withdrawn-or-spent` (boolean) Have you withdrawn this amount in cash, or spent it from the account by transfer (for example paying for goods by card)? Enter amounts withdrawn or spent and amounts still in the account as separate entries. (Tawdih Jami’ 620 and n.3) rules=['sis-620']
- `sale-paid-item` (boolean) Did you sell something you had not bought for business, bought with money on which khums had already been paid? Enter its purchase price separately. (Ruling 1787) rules=['sis-1787']
- `capital-loss-business` (boolean) Was this a loss of business stock, business capital or business tools (for example by theft, fire or wear), rather than a loss on your home, personal car or other personal property? (Ruling 1801; Tawdih Jami’ 685) rules=['sis-1801']
- `living-from-year-income` (boolean) Were all the living expenses you entered paid from this year’s income or profit, rather than from savings on which khums was already paid or from other money? (Ruling 1792; Tawdih Jami’ 598) rules=['sis-1792', 'sis-598']
- `holding-for-sale` (boolean) Is this held as merchandise (for sale)? (Tawdih Jami’ 737 ب «مگر آنکه مال‌التّجاره باشد») rules=['sis-737']
- `business-line-loss` (boolean) Did one line of your business make a loss this year while another made a profit? (Ruling 1790) rules=['sis-1790']
- `business-one-account` (boolean) Do all your lines of business share one account (income and outgoings, cash, and profit and loss kept together)? (Ruling 1790) rules=['sis-1790']
- `business-same-kind` (boolean) Are all your lines of business the same kind of business (for example all trading, such as selling rice, sugar and oil), rather than different kinds such as trade and farming? (Ruling 1790; Tawdih Jami’ 701) rules=['sis-1790']
- `business-stock-unsold` (boolean) Were any of the business costs you entered spent on stock or goods for sale that were still unsold at the end of this khums year? (Ruling 1791) rules=['sis-1791']
- `inh-unexpected` (boolean) Is this an inheritance you did not expect, from someone other than your father or your son? (Ruling 1771) rules=['sis-1771']
- `inh-valid-rules` (boolean) Did it reach you under inheritance rules considered valid (not, for example, by taʿṣīb)? (Ruling 1771) rules=['sis-1771']
- `charity-khums-zakat` (boolean) Was this given to you as khums or zakat, as someone entitled to receive it? (Ruling 1776) rules=['sis-1776']
- `mined-nisab` (boolean) After deducting only the costs of extracting it, does the value of your own share reach fifteen common mithqāls of coined gold? Enter the value after extraction and refining costs. (Rulings 1816, 1821) rules=['sis-1816', 'sis-1817']
- `treasure-nisab` (boolean) Is the value of your own share at least 105 mithqāls of coined silver or fifteen mithqāls of coined gold? (Rulings 1825, 1828) rules=['sis-1825']
- `treasure-own` (boolean) Is it yours to keep under Ruling 1826 (earlier owners informed where required and none claimed it)? rules=['sis-1825']
- `diving-nisab` (boolean) Does the value of your own share, from dives close together, reach eighteen nukhuds of gold? (Ruling 1836) rules=['sis-1836']
- `mixed-amount-known` (boolean) Do you know the amount of the unlawful money in this mixed amount? (Rulings 1830–1831) rules=['sis-1830']
- `mixed-owner-known` (boolean) Do you know who owns the unlawful money? (Rulings 1830, 1832) rules=['sis-1830']
- `mixed-fifth-known` (boolean) Do you know whether the unlawful part is more or less than one-fifth? (Ruling 1830) rules=['sis-1830']
- `mixed-owner-group` (boolean) Is the owner one of a known group of people, without knowing which one? (Ruling 1835) rules=['sis-1831']
- `holding-paid` (boolean) Was this bought with money on which khums was already paid, or with inherited money? (Tawdih Jami’ 737) rules=['sis-737']
- `holding-inherited-unpaid` (boolean) If any of this came from an inheritance: did the deceased leave khums unpaid on it, or owe khums on other property? Answer no if none of it was inherited. (Ruling 1772) rules=['sis-1772']
- `debt-living-this-year` (boolean) Did you borrow this during this khums year to meet this year’s living expenses? Enter the amount you borrowed, and do not enter the spending it paid for again as a living expense. (Ruling 1803) rules=['sis-1803']
- `debt-repaid-some` (boolean) Have you already repaid any part of this loan? Ruling 1803 deducts «the borrowed amount» and does not say how a part already repaid is treated, so a part repaid is reviewed. (Ruling 1803) rules=['sis-1803']
- `debt-personal-item` (boolean) Is it a loan for something necessary for your personal use (such as a car or a house) that you still use, and have you not deducted this amount in an earlier year? (Ruling 1803) rules=['sis-1803']
- `debt-spending-entered` (boolean) Is the spending this loan paid for (living expenses, or the price of the car or house) already among the expenses you entered for this year? If yes, the debt is not deducted again. (Ruling 1803) rules=['sis-1803']
- `ft-asset-source` (choice) This asset’s amount must be its CURRENT value. What money was it bought with? (Tawdih Jami’ 737) choices=["Income of the same khums year in which I bought it", "Money on which khums was paid, or inherited money (or similar)", "Income a khums year had passed over, without khums paid on it", "Partly from different kinds of money", "Income, but I do not know if it was year-old income or income of that year", "Not known: it may also have been inherited, gifted or khums-paid money"] rules=['sis-737']
- `ft-asset-use` (choice) Which describes it? (Tawdih Jami’ 737 الف) choices=["A necessity (home, clothing, personal car, furniture) that I used in that same year", "Not a necessity (work tools, merchandise, things not in current use)", "A necessity that I did not use in that same year"] rules=['sis-737']
- `ft-for-trade` (boolean) Is it merchandise: bought or kept to sell for profit? (Tawdih Jami’ 737, 741) rules=['sis-737', 'sis-739']
- `ft-trade-risen` (boolean) Has its price risen so that it could now be sold at its current value? (Tawdih Jami’ 737 ج, 741) rules=['sis-737', 'sis-739']
- `ft-old-purchase` (choice) How was it bought? For an ordinary purchase, also add the price you paid as a separate entry “Price paid for something you still own”, dated the day you paid. (Tawdih Jami’ 737 ج) choices=["An ordinary purchase: the price was owed and then paid (cash, card, transfer or cheque)", "Bought with that specific money from a Twelver Shia seller, and its value has risen since", "Something else (specific money but another seller, or its value has not risen)"] rules=['sis-737']
- `ft-unknown-specific` (boolean) It is not a necessity, you know it was bought with that specific money, the seller and you are Twelver Shia, and its value has risen, not because of inflation? (Tawdih Jami’ 740 ب, notes 1–2) rules=['sis-739']
- `ft-rise-not-inflation` (boolean) Is the rise in its price NOT caused by inflation (the fall in the value of money)? A rise from inflation has its own ruling. (Tawdih Jami’ 737 note 6, 647; 740–742 note 2) rules=['sis-737', 'sis-739']
- `ft-seller-shia` (boolean) Were the seller and you both Twelver Shia? (Tawdih Jami’ 740–742 note 1) rules=['sis-739']
- `ft-cash-source` (choice) What is this money? (Tawdih Jami’ 736–737) choices=["Saved from income, and a khums year has passed over it", "Income of my current khums year (that year has not ended yet)", "Money on which khums was paid, or inherited money", "I do not know"] rules=['sis-737', 'sis-736', 'sis-1783']
- `ft-spent-source` (choice) This amount is money you paid out. What money did it come from? (Tawdih Jami’ 737 ج, 738) choices=["Income of the same khums year", "Income a khums year had passed over, without khums paid on it", "Money on which khums was paid, or inherited money", "I do not know"] rules=['sis-737', 'sis-738']
- `ft-price-basis` (choice) Where is the khums of this purchase counted? (Tawdih Jami’ 737 ج) choices=["Its khums is on this price (ordinary purchase; not merchandise whose price has risen)", "Its khums is on the item’s current value (entered as the item itself)"] rules=['sis-737']
- `ft-money-devalued` (boolean) Has money lost extraordinary value (20 times or more) since you paid this price? (Tawdih Jami’ 737, note 5) rules=['sis-737']
- `ft-spent-negligent` (boolean) Are you unsure of the amount because you neglected to work out or record khums you knew was due? If not, enter only the amount you are sure of. (Tawdih Jami’ 738) rules=['sis-738']

## Fact mapping (every leaf)

### annual-asset-1 workflows=['annual', 'missed-year'] kinds=['ASSET'] subtypes=['PRECIOUS_METAL', 'REAL_ESTATE', 'VEHICLE', 'INVESTMENT', 'HOUSEHOLD_ITEM', 'RECEIVABLE', 'HOME', 'LAND', 'JEWELLERY', 'PERSONAL_ITEM', 'BUSINESS_EQUIPMENT', 'DIGITAL_ASSET', 'JOINT_OWNERSHIP', 'OTHER'] rules=['sis-737']

- holding-paid=true > holding-inherited-unpaid=true → CAT pending-inheritance
- holding-paid=true > holding-inherited-unpaid=false > holding-for-sale=true → CAT holdings
- holding-paid=true > holding-inherited-unpaid=false > holding-for-sale=false → EXCLUDE sis-737
- holding-paid=true > holding-inherited-unpaid=false > holding-for-sale=<other/invalid> → STOP[consult-entry]
- holding-paid=true > holding-inherited-unpaid=<other/invalid> → STOP[consult-entry]
- holding-paid=false → CAT holdings
- holding-paid=<other/invalid> → STOP[consult-entry]

### annual-asset-2 workflows=['annual', 'missed-year'] kinds=['ASSET'] subtypes=['BUSINESS_STOCK'] rules=['sis-1791', 'q-BUS-02']

- (always) → CAT business-stock

### annual-balance-1 workflows=['annual', 'missed-year'] kinds=['BALANCE'] subtypes=['CASH', 'BANK_ACCOUNT', 'DIGITAL_WALLET', 'OTHER'] rules=['sis-737']

- holding-paid=true > holding-inherited-unpaid=true → CAT pending-inheritance
- holding-paid=true > holding-inherited-unpaid=false → EXCLUDE sis-737
- holding-paid=true > holding-inherited-unpaid=<other/invalid> → STOP[consult-entry]
- holding-paid=false → CAT holdings
- holding-paid=<other/invalid> → STOP[consult-entry]

### annual-balance-2 workflows=['annual', 'missed-year'] kinds=['BALANCE'] subtypes=['MIXED_FUNDS'] rules=['sis-1830', 'sis-1831']

- mixed-amount-known=true > mixed-owner-known=true → CAT mixed-owner
- mixed-amount-known=true > mixed-owner-known=false > mixed-owner-group=true → CAT mixed-group
- mixed-amount-known=true > mixed-owner-known=false > mixed-owner-group=false → CAT mixed-sadaqah
- mixed-amount-known=true > mixed-owner-known=false > mixed-owner-group=<other/invalid> → STOP[consult-entry]
- mixed-amount-known=true > mixed-owner-known=<other/invalid> → STOP[consult-entry]
- mixed-amount-known=false > mixed-owner-known=true → CAT mixed-owner
- mixed-amount-known=false > mixed-owner-known=false > mixed-owner-group=true → CAT pending-mixed
- mixed-amount-known=false > mixed-owner-known=false > mixed-owner-group=false > mixed-fifth-known=true → CAT pending-mixed
- mixed-amount-known=false > mixed-owner-known=false > mixed-owner-group=false > mixed-fifth-known=false → CAT mixed-khums
- mixed-amount-known=false > mixed-owner-known=false > mixed-owner-group=false > mixed-fifth-known=<other/invalid> → STOP[consult-entry]
- mixed-amount-known=false > mixed-owner-known=false > mixed-owner-group=<other/invalid> → STOP[consult-entry]
- mixed-amount-known=false > mixed-owner-known=<other/invalid> → STOP[consult-entry]
- mixed-amount-known=<other/invalid> → STOP[consult-entry]

### annual-income-1 workflows=['annual', 'missed-year'] kinds=['INCOME'] subtypes=['EMPLOYMENT', 'INVESTMENT_RETURN', 'RENTAL', 'FREELANCE', 'BONUS'] rules=['sis-1769']

- (always) → CAT earnings

### annual-income-2 workflows=['annual', 'missed-year'] kinds=['INCOME'] subtypes=['BUSINESS'] rules=['sis-1769', 'sis-1791']

- (always) → CAT business-income

### annual-income-3 workflows=['annual', 'missed-year'] kinds=['INCOME'] subtypes=['SALE'] rules=['sis-1787']

- sale-paid-item=true → CAT sale-several
- sale-paid-item=false → CAT pending-income
- sale-paid-item=<other/invalid> → STOP[consult-entry]

### annual-income-4 workflows=['annual', 'missed-year'] kinds=['INCOME'] subtypes=['GIFT'] rules=['sis-1770', 'sis-1771', 'sis-1776', 'sis-1817', 'sis-620']

- (always) → CAT gains

### annual-income-5 workflows=['annual', 'missed-year'] kinds=['INCOME'] subtypes=['INHERITANCE'] rules=['sis-1771', 'sis-1772']

- inh-deceased-unpaid=true > inh-unexpected=true → CAT pending-inheritance
- inh-deceased-unpaid=true > inh-unexpected=false > inh-valid-rules=true > inh-deceased-non-payer=true → EXCLUDE sis-1772
- inh-deceased-unpaid=true > inh-unexpected=false > inh-valid-rules=true > inh-deceased-non-payer=false > inh-deceased-owed=true → CAT pending-inheritance
- inh-deceased-unpaid=true > inh-unexpected=false > inh-valid-rules=true > inh-deceased-non-payer=false > inh-deceased-owed=false → CAT inheritance-khums
- inh-deceased-unpaid=true > inh-unexpected=false > inh-valid-rules=true > inh-deceased-non-payer=false > inh-deceased-owed=<other/invalid> → STOP[consult-entry]
- inh-deceased-unpaid=true > inh-unexpected=false > inh-valid-rules=true > inh-deceased-non-payer=<other/invalid> → STOP[consult-entry]
- inh-deceased-unpaid=true > inh-unexpected=false > inh-valid-rules=false → CAT pending-inheritance
- inh-deceased-unpaid=true > inh-unexpected=false > inh-valid-rules=<other/invalid> → STOP[consult-entry]
- inh-deceased-unpaid=true > inh-unexpected=<other/invalid> → STOP[consult-entry]
- inh-deceased-unpaid=false > inh-deceased-owed=true > inh-deceased-non-payer=true > inh-unexpected=true → CAT gains
- inh-deceased-unpaid=false > inh-deceased-owed=true > inh-deceased-non-payer=true > inh-unexpected=false > inh-valid-rules=true → EXCLUDE sis-1771
- inh-deceased-unpaid=false > inh-deceased-owed=true > inh-deceased-non-payer=true > inh-unexpected=false > inh-valid-rules=false → CAT gains
- inh-deceased-unpaid=false > inh-deceased-owed=true > inh-deceased-non-payer=true > inh-unexpected=false > inh-valid-rules=<other/invalid> → STOP[consult-entry]
- inh-deceased-unpaid=false > inh-deceased-owed=true > inh-deceased-non-payer=true > inh-unexpected=<other/invalid> → STOP[consult-entry]
- inh-deceased-unpaid=false > inh-deceased-owed=true > inh-deceased-non-payer=false → CAT pending-inheritance
- inh-deceased-unpaid=false > inh-deceased-owed=true > inh-deceased-non-payer=<other/invalid> → STOP[consult-entry]
- inh-deceased-unpaid=false > inh-deceased-owed=false > inh-unexpected=true → CAT gains
- inh-deceased-unpaid=false > inh-deceased-owed=false > inh-unexpected=false > inh-valid-rules=true → EXCLUDE sis-1771
- inh-deceased-unpaid=false > inh-deceased-owed=false > inh-unexpected=false > inh-valid-rules=false → CAT gains
- inh-deceased-unpaid=false > inh-deceased-owed=false > inh-unexpected=false > inh-valid-rules=<other/invalid> → STOP[consult-entry]
- inh-deceased-unpaid=false > inh-deceased-owed=false > inh-unexpected=<other/invalid> → STOP[consult-entry]
- inh-deceased-unpaid=false > inh-deceased-owed=<other/invalid> → STOP[consult-entry]
- inh-deceased-unpaid=<other/invalid> → STOP[consult-entry]

### annual-income-6 workflows=['annual', 'missed-year'] kinds=['INCOME'] subtypes=['PENSION_OR_BENEFIT'] rules=['sis-620']

- pension-shetab-transfer=true > pension-withdrawn-or-spent=true → CAT gains
- pension-shetab-transfer=true > pension-withdrawn-or-spent=false → EXCLUDE sis-620
- pension-shetab-transfer=true > pension-withdrawn-or-spent=<other/invalid> → STOP[consult-entry]
- pension-shetab-transfer=false → CAT pending-income
- pension-shetab-transfer=<other/invalid> → STOP[consult-entry]

### annual-income-7 workflows=['annual', 'missed-year'] kinds=['INCOME'] subtypes=['CHARITY_RECEIVED'] rules=['sis-1776']

- charity-khums-zakat=true → EXCLUDE sis-1776
- charity-khums-zakat=false → CAT gains
- charity-khums-zakat=<other/invalid> → STOP[consult-entry]

### annual-income-8 workflows=['annual', 'missed-year'] kinds=['INCOME'] subtypes=['MINED_PRODUCT'] rules=['sis-1816', 'sis-1817']

- mined-nisab=true → CAT mined
- mined-nisab=false → CAT gains
- mined-nisab=<other/invalid> → STOP[consult-entry]

### annual-income-9 workflows=['annual', 'missed-year'] kinds=['INCOME'] subtypes=['TREASURE'] rules=['sis-1825']

- treasure-nisab=true > treasure-own=true → CAT treasure
- treasure-nisab=true > treasure-own=false → CAT pending-special
- treasure-nisab=true > treasure-own=<other/invalid> → STOP[consult-entry]
- treasure-nisab=false → CAT pending-special
- treasure-nisab=<other/invalid> → STOP[consult-entry]

### annual-income-10 workflows=['annual', 'missed-year'] kinds=['INCOME'] subtypes=['DIVING_GEMS'] rules=['sis-1836']

- diving-nisab=true → CAT diving
- diving-nisab=false → CAT pending-special
- diving-nisab=<other/invalid> → STOP[consult-entry]

### annual-income-11 workflows=['annual', 'missed-year'] kinds=['INCOME'] subtypes=['OTHER'] rules=['q-INC-01', 'q-INC-07']

- (always) → CAT pending-income

### annual-expense-1 workflows=['annual', 'missed-year'] kinds=['EXPENSE'] subtypes=['HOUSEHOLD', 'HOUSING', 'EDUCATION', 'HEALTH', 'TRAVEL', 'DONATION', 'RELIGIOUS_DUTY'] rules=['sis-1792', 'sis-1795', 'sis-598']

- (always) → CAT living

### annual-expense-2 workflows=['annual', 'missed-year'] kinds=['EXPENSE'] subtypes=['BUSINESS'] rules=['sis-1769', 'sis-1791']

- (always) → CAT business-costs

### annual-expense-3 workflows=['annual', 'missed-year'] kinds=['EXPENSE'] subtypes=['CAPITAL_LOSS'] rules=['sis-1801']

- capital-loss-business=true → CAT capital-losses
- capital-loss-business=false → CAT pending-expense
- capital-loss-business=<other/invalid> → STOP[consult-entry]

### annual-expense-4 workflows=['annual', 'missed-year'] kinds=['EXPENSE'] subtypes=['SOLD_ITEM_COST'] rules=['sis-1787']

- (always) → CAT sale-costs

### annual-expense-5 workflows=['annual', 'missed-year'] kinds=['EXPENSE'] subtypes=['ASSET_PURCHASE', 'OTHER'] rules=['q-EXP-01', 'q-EXP-05']

- (always) → CAT pending-expense

### annual-expense-6 workflows=['annual', 'missed-year'] kinds=['EXPENSE'] subtypes=['KHUMS_PAID'] rules=['sis-1783']

- (always) → CAT khums-paid

### annual-liability-1 workflows=['annual', 'missed-year'] kinds=['LIABILITY'] subtypes=['LOAN', 'MORTGAGE', 'CREDIT_CARD', 'UNPAID_BILL', 'BUSINESS_DEBT', 'OTHER'] rules=['sis-1803']

- debt-living-this-year=true > debt-spending-entered=true → EXCLUDE sis-1803
- debt-living-this-year=true > debt-spending-entered=false > debt-repaid-some=true → CAT debts
- debt-living-this-year=true > debt-spending-entered=false > debt-repaid-some=false → CAT debts-deductible
- debt-living-this-year=true > debt-spending-entered=false > debt-repaid-some=<other/invalid> → STOP[consult-entry]
- debt-living-this-year=true > debt-spending-entered=<other/invalid> → STOP[consult-entry]
- debt-living-this-year=false > debt-personal-item=true > debt-spending-entered=true → EXCLUDE sis-1803
- debt-living-this-year=false > debt-personal-item=true > debt-spending-entered=false > debt-repaid-some=true → CAT debts
- debt-living-this-year=false > debt-personal-item=true > debt-spending-entered=false > debt-repaid-some=false → CAT debts-deductible
- debt-living-this-year=false > debt-personal-item=true > debt-spending-entered=false > debt-repaid-some=<other/invalid> → STOP[consult-entry]
- debt-living-this-year=false > debt-personal-item=true > debt-spending-entered=<other/invalid> → STOP[consult-entry]
- debt-living-this-year=false > debt-personal-item=false → CAT debts
- debt-living-this-year=false > debt-personal-item=<other/invalid> → STOP[consult-entry]
- debt-living-this-year=<other/invalid> → STOP[consult-entry]

### annual-liability-2 workflows=['annual', 'missed-year'] kinds=['LIABILITY'] subtypes=['UNPAID_KHUMS'] rules=['q-FTK-01', 'q-MIS-01', 'q-MIS-02', 'q-MIS-05']

- (always) → CAT unpaid-khums

### ft-asset workflows=['first-time'] kinds=['ASSET'] subtypes=['PRECIOUS_METAL', 'REAL_ESTATE', 'VEHICLE', 'INVESTMENT', 'BUSINESS_STOCK', 'HOUSEHOLD_ITEM', 'RECEIVABLE', 'HOME', 'LAND', 'JEWELLERY', 'PERSONAL_ITEM', 'BUSINESS_EQUIPMENT', 'DIGITAL_ASSET', 'JOINT_OWNERSHIP', 'OTHER'] rules=['sis-737', 'sis-739']

- ft-asset-source="Income of the same khums year in which I bought it" > ft-asset-use="A necessity (home, clothing, personal car, furniture) that I used in that same year" → EXCLUDE sis-737
- ft-asset-source="Income of the same khums year in which I bought it" > ft-asset-use="Not a necessity (work tools, merchandise, things not in current use)" → CAT ft-assets
- ft-asset-source="Income of the same khums year in which I bought it" > ft-asset-use="A necessity that I did not use in that same year" → CAT ft-pending
- ft-asset-source="Income of the same khums year in which I bought it" > ft-asset-use=<other/invalid> → STOP[consult-entry]
- ft-asset-source="Money on which khums was paid, or inherited money (or similar)" > holding-inherited-unpaid=true → CAT ft-pending
- ft-asset-source="Money on which khums was paid, or inherited money (or similar)" > holding-inherited-unpaid=false > ft-for-trade=true → CAT ft-pending
- ft-asset-source="Money on which khums was paid, or inherited money (or similar)" > holding-inherited-unpaid=false > ft-for-trade=false → EXCLUDE sis-737
- ft-asset-source="Money on which khums was paid, or inherited money (or similar)" > holding-inherited-unpaid=false > ft-for-trade=<other/invalid> → STOP[consult-entry]
- ft-asset-source="Money on which khums was paid, or inherited money (or similar)" > holding-inherited-unpaid=<other/invalid> → STOP[consult-entry]
- ft-asset-source="Income a khums year had passed over, without khums paid on it" > ft-old-purchase="An ordinary purchase: the price was owed and then paid (cash, card, transfer or cheque)" > ft-for-trade=true > ft-trade-risen=true > ft-rise-not-inflation=true → CAT ft-assets
- ft-asset-source="Income a khums year had passed over, without khums paid on it" > ft-old-purchase="An ordinary purchase: the price was owed and then paid (cash, card, transfer or cheque)" > ft-for-trade=true > ft-trade-risen=true > ft-rise-not-inflation=false → CAT ft-pending
- ft-asset-source="Income a khums year had passed over, without khums paid on it" > ft-old-purchase="An ordinary purchase: the price was owed and then paid (cash, card, transfer or cheque)" > ft-for-trade=true > ft-trade-risen=true > ft-rise-not-inflation=<other/invalid> → STOP[consult-entry]
- ft-asset-source="Income a khums year had passed over, without khums paid on it" > ft-old-purchase="An ordinary purchase: the price was owed and then paid (cash, card, transfer or cheque)" > ft-for-trade=true > ft-trade-risen=false → EXCLUDE sis-737
- ft-asset-source="Income a khums year had passed over, without khums paid on it" > ft-old-purchase="An ordinary purchase: the price was owed and then paid (cash, card, transfer or cheque)" > ft-for-trade=true > ft-trade-risen=<other/invalid> → STOP[consult-entry]
- ft-asset-source="Income a khums year had passed over, without khums paid on it" > ft-old-purchase="An ordinary purchase: the price was owed and then paid (cash, card, transfer or cheque)" > ft-for-trade=false → EXCLUDE sis-737
- ft-asset-source="Income a khums year had passed over, without khums paid on it" > ft-old-purchase="An ordinary purchase: the price was owed and then paid (cash, card, transfer or cheque)" > ft-for-trade=<other/invalid> → STOP[consult-entry]
- ft-asset-source="Income a khums year had passed over, without khums paid on it" > ft-old-purchase="Bought with that specific money from a Twelver Shia seller, and its value has risen since" > ft-rise-not-inflation=true → CAT ft-assets
- ft-asset-source="Income a khums year had passed over, without khums paid on it" > ft-old-purchase="Bought with that specific money from a Twelver Shia seller, and its value has risen since" > ft-rise-not-inflation=false → CAT ft-pending
- ft-asset-source="Income a khums year had passed over, without khums paid on it" > ft-old-purchase="Bought with that specific money from a Twelver Shia seller, and its value has risen since" > ft-rise-not-inflation=<other/invalid> → STOP[consult-entry]
- ft-asset-source="Income a khums year had passed over, without khums paid on it" > ft-old-purchase="Something else (specific money but another seller, or its value has not risen)" → CAT ft-pending
- ft-asset-source="Income a khums year had passed over, without khums paid on it" > ft-old-purchase=<other/invalid> → STOP[consult-entry]
- ft-asset-source="Partly from different kinds of money" → CAT ft-split
- ft-asset-source="Income, but I do not know if it was year-old income or income of that year" > ft-for-trade=true > ft-trade-risen=true > ft-seller-shia=true > ft-rise-not-inflation=true → CAT ft-assets
- ft-asset-source="Income, but I do not know if it was year-old income or income of that year" > ft-for-trade=true > ft-trade-risen=true > ft-seller-shia=true > ft-rise-not-inflation=false → CAT ft-pending
- ft-asset-source="Income, but I do not know if it was year-old income or income of that year" > ft-for-trade=true > ft-trade-risen=true > ft-seller-shia=true > ft-rise-not-inflation=<other/invalid> → STOP[consult-entry]
- ft-asset-source="Income, but I do not know if it was year-old income or income of that year" > ft-for-trade=true > ft-trade-risen=true > ft-seller-shia=false → CAT ft-pending
- ft-asset-source="Income, but I do not know if it was year-old income or income of that year" > ft-for-trade=true > ft-trade-risen=true > ft-seller-shia=<other/invalid> → STOP[consult-entry]
- ft-asset-source="Income, but I do not know if it was year-old income or income of that year" > ft-for-trade=true > ft-trade-risen=false → CAT ft-settle
- ft-asset-source="Income, but I do not know if it was year-old income or income of that year" > ft-for-trade=true > ft-trade-risen=<other/invalid> → STOP[consult-entry]
- ft-asset-source="Income, but I do not know if it was year-old income or income of that year" > ft-for-trade=false > ft-unknown-specific=true → CAT ft-assets
- ft-asset-source="Income, but I do not know if it was year-old income or income of that year" > ft-for-trade=false > ft-unknown-specific=false → CAT ft-settle
- ft-asset-source="Income, but I do not know if it was year-old income or income of that year" > ft-for-trade=false > ft-unknown-specific=<other/invalid> → STOP[consult-entry]
- ft-asset-source="Income, but I do not know if it was year-old income or income of that year" > ft-for-trade=<other/invalid> → STOP[consult-entry]
- ft-asset-source="Not known: it may also have been inherited, gifted or khums-paid money" → CAT ft-pending
- ft-asset-source=<other/invalid> → STOP[consult-entry]

### ft-balance workflows=['first-time'] kinds=['BALANCE'] subtypes=['CASH', 'BANK_ACCOUNT', 'DIGITAL_WALLET', 'OTHER'] rules=['sis-737', 'sis-736', 'sis-1783']

- ft-cash-source="Saved from income, and a khums year has passed over it" → CAT ft-cash
- ft-cash-source="Income of my current khums year (that year has not ended yet)" → EXCLUDE sis-736,sis-1783
- ft-cash-source="Money on which khums was paid, or inherited money" > holding-inherited-unpaid=true → CAT ft-pending
- ft-cash-source="Money on which khums was paid, or inherited money" > holding-inherited-unpaid=false → EXCLUDE sis-737
- ft-cash-source="Money on which khums was paid, or inherited money" > holding-inherited-unpaid=<other/invalid> → STOP[consult-entry]
- ft-cash-source="I do not know" → CAT ft-pending
- ft-cash-source=<other/invalid> → STOP[consult-entry]

### ft-mixed workflows=['first-time'] kinds=['BALANCE'] subtypes=['MIXED_FUNDS'] rules=['sis-737']

- (always) → CAT ft-pending

### ft-income workflows=['first-time'] kinds=['INCOME'] subtypes=['EMPLOYMENT', 'BUSINESS', 'INVESTMENT_RETURN', 'RENTAL', 'SALE', 'GIFT', 'INHERITANCE', 'FREELANCE', 'BONUS', 'PENSION_OR_BENEFIT', 'CHARITY_RECEIVED', 'MINED_PRODUCT', 'TREASURE', 'DIVING_GEMS', 'OTHER'] rules=['sis-737']

- (always) → CAT ft-pending

### ft-purchase workflows=['first-time'] kinds=['EXPENSE'] subtypes=['ASSET_PURCHASE'] rules=['sis-737']

- ft-spent-source="Income of the same khums year" → EXCLUDE sis-737
- ft-spent-source="Income a khums year had passed over, without khums paid on it" > ft-price-basis="Its khums is on this price (ordinary purchase; not merchandise whose price has risen)" > ft-money-devalued=true → CAT ft-settle
- ft-spent-source="Income a khums year had passed over, without khums paid on it" > ft-price-basis="Its khums is on this price (ordinary purchase; not merchandise whose price has risen)" > ft-money-devalued=false → CAT ft-old-spent
- ft-spent-source="Income a khums year had passed over, without khums paid on it" > ft-price-basis="Its khums is on this price (ordinary purchase; not merchandise whose price has risen)" > ft-money-devalued=<other/invalid> → STOP[consult-entry]
- ft-spent-source="Income a khums year had passed over, without khums paid on it" > ft-price-basis="Its khums is on the item’s current value (entered as the item itself)" → EXCLUDE sis-737
- ft-spent-source="Income a khums year had passed over, without khums paid on it" > ft-price-basis=<other/invalid> → STOP[consult-entry]
- ft-spent-source="Money on which khums was paid, or inherited money" → EXCLUDE sis-737
- ft-spent-source="I do not know" → CAT ft-pending
- ft-spent-source=<other/invalid> → STOP[consult-entry]

### ft-expense workflows=['first-time'] kinds=['EXPENSE'] subtypes=['HOUSEHOLD', 'HOUSING', 'EDUCATION', 'HEALTH', 'TRAVEL', 'BUSINESS', 'DONATION', 'RELIGIOUS_DUTY', 'CAPITAL_LOSS', 'SOLD_ITEM_COST', 'OTHER'] rules=['sis-737', 'sis-738']

- ft-spent-source="Income of the same khums year" → EXCLUDE sis-737
- ft-spent-source="Income a khums year had passed over, without khums paid on it" > ft-spent-negligent=true → CAT ft-settle
- ft-spent-source="Income a khums year had passed over, without khums paid on it" > ft-spent-negligent=false → CAT ft-old-spent
- ft-spent-source="Income a khums year had passed over, without khums paid on it" > ft-spent-negligent=<other/invalid> → STOP[consult-entry]
- ft-spent-source="Money on which khums was paid, or inherited money" → EXCLUDE sis-737
- ft-spent-source="I do not know" → CAT ft-pending
- ft-spent-source=<other/invalid> → STOP[consult-entry]

### ft-khums-paid workflows=['first-time'] kinds=['EXPENSE'] subtypes=['KHUMS_PAID'] rules=['sis-737']

- (always) → CAT ft-pending

### ft-liability workflows=['first-time'] kinds=['LIABILITY'] subtypes=['LOAN', 'MORTGAGE', 'CREDIT_CARD', 'UNPAID_BILL', 'BUSINESS_DEBT', 'UNPAID_KHUMS', 'OTHER'] rules=['sis-737']

- (always) → CAT ft-debts

unmatched → {'handling': 'consult', 'consultationId': 'consult-entry'}

## Categories

- `earnings` Earnings (work, rent and other earning) rules=['sis-1769']
- `business-income` Business income rules=['sis-1769', 'sis-1791']
- `business-costs` Costs of earning the business income rules=['sis-1769', 'sis-1791']
- `gains` Other gains added to the profit rules=['sis-1770', 'sis-1771', 'sis-1776', 'sis-1817', 'sis-620']
- `living` Living expenses of the year rules=['sis-1792', 'sis-1795', 'sis-598']
- `debts-deductible` Debts deducted under the transcribed ruling rules=['sis-1803']
- `debts` Debts not covered by the transcribed ruling rules=['sis-1803', 'q-LIA-01', 'q-LIA-02', 'q-LIA-03', 'q-LIA-04']
- `mined` Mined products reaching the niṣāb (value after costs) rules=['sis-1816']
- `treasure` Treasure reaching the niṣāb rules=['sis-1825']
- `diving` Gems from diving reaching the niṣāb rules=['sis-1836']
- `mixed-khums` Mixed amounts purified by paying khums rules=['sis-1830']
- `pending-mixed` Mixed amounts not covered by the transcribed rulings rules=['sis-1830']
- `mixed-sadaqah` Mixed amounts: known unlawful amount, unknown owner (ṣadaqah, not khums) rules=['sis-1831']
- `mixed-owner` Mixed amounts: known owner (settle with the owner, not khums) rules=['sis-1831']
- `mixed-group` Mixed amounts: owner among a known group (not khums) rules=['sis-1831']
- `mixed-over-fifth` Mixed amounts: unlawful part known to exceed one-fifth rules=['sis-1831']
- `capital-losses` Losses of business capital, stock or tools rules=['sis-1801']
- `pending-special` Treasure or gems needing review rules=['sis-1825', 'sis-1836']
- `pending-income` Income not covered by a transcribed rule rules=['q-INC-01', 'q-INC-07']
- `pending-expense` Expenses not covered by a transcribed rule rules=['q-EXP-01', 'q-EXP-05']
- `holdings` Assets and balances (not used by the transcribed rules) rules=['q-PRO-01', 'q-PRO-03', 'q-INV-01', 'q-BUS-01', 'q-BUS-02', 'q-BUS-03', 'q-SAV-02', 'q-NEC-02']
- `unpaid-khums` Khums from earlier years not yet paid (as entered) rules=['q-FTK-01', 'q-MIS-01', 'q-MIS-02', 'q-MIS-05']
- `pending-inheritance` Inheritance needing review (Ruling 1772) rules=['sis-1772']
- `inheritance-khums` Inherited property on which the deceased did not pay khums (Ruling 1772) rules=['sis-1772']
- `business-stock` Unsold business stock (needs review; Ruling 1791) rules=['sis-1791', 'q-BUS-02']
- `sale-costs` Purchase price of what was sold (Ruling 1787) rules=['sis-1787']
- `sale-several` Sales of khums-paid property (each needs review; Ruling 1787) rules=['sis-1787']
- `khums-paid` Khums already paid for this year (Ruling 1783) rules=['sis-1783']
- `ft-assets` Assets whose khums is on their current value (as entered) rules=['sis-737', 'sis-739']
- `ft-cash` Cash and savings saved from income on which a khums year has passed rules=['sis-737']
- `ft-old-spent` Money paid out from income a khums year had passed over (purchase prices and spending) rules=['sis-737', 'sis-738']
- `ft-settle` Entries for settlement with the ḥākim al-sharʿ (source unknown, negligence, devaluation) rules=['sis-737', 'sis-738', 'sis-739']
- `ft-split` Assets bought from several sources (enter each share as its own entry) rules=['sis-737']
- `ft-pending` Entries not settled by masāʾil 736–744 rules=['sis-737']
- `ft-debts` Debts (not covered by masāʾil 736–744) rules=['sis-737', 'q-LIA-02']

## Consultations

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
- `consult-inheritance-unpaid` Scholar review required: khums the deceased owed on other property, or an unexpected inheritance on which khums was not paid (Ruling 1772). The amount owed is needed.
- `consult-business-lines` Scholar review required: one line of business made a loss while another made a profit, and you did not confirm they are the same kind of business sharing one account. By obligatory precaution the loss does not offset the profit (1790; Jami’ 701), so each line’s figures are needed.
- `consult-business-stock` Scholar review required: unsold stock or goods for sale at the end of the khums year. Ruling 1791 deducts the costs of earning profit; stock bought and not yet sold is not such a cost, and how it is valued at the year’s end is not transcribed, so the business profit is not calculated.
- `consult-sale-several` Scholar review required: a sale of khums-paid property. Ruling 1787 concerns each sale’s increase in price, but a purchase price cannot yet be linked to its own sale, so each sale is reviewed on its own (developer implementation required).
- `consult-living-source` Scholar review required: some living expenses were not paid from this year’s income or profit. Ruling 1792 speaks of what is spent from the year’s profit (Tawdih Jami’ 598, first condition), so the deductible amount is not settled.
- `consult-overpaid` Scholar review required: the khums you already paid for this year is more than the total calculated.
- `consult-mixed-sadaqah` Other duty (not khums): the known unlawful amount is given as ṣadaqah on behalf of its unknown owner (with a jurist’s permission where the ruling says so).
- `consult-mixed-owner` Other duty (not khums): the owner is known, so the unlawful part is settled with the owner.
- `consult-mixed-group` Other duty (not khums): inform every possible owner; then settlement, a jurist or lots (Ruling 1835).
- `consult-ft-pending` Scholar review required: an entry is not settled by masāʾil 736–744 (merchandise bought with khums-paid money, a necessity not used in the year of purchase, a specific-money purchase that does not meet 737 ج, mixed money, an income entry or a debt), so the total stops.
- `consult-ft-settlement` Settlement required: by obligatory precaution the khums of these entries is settled with the ḥākim al-sharʿ or his representative in proportion to the probabilities (Tawdih Jami’ 737 note 5, 738, 739–744). No amount is calculated for them.
- `consult-ft-split` Enter each share separately: for an asset bought from several kinds of money, each share follows its own rule (Tawdih Jami’ 737 د). Replace this entry with one entry per share.

## Program: annual

- **earnings** = sum(earnings)
- **business** = (sum(business-income) - sum(business-costs))
- **business-checked** = if (sum(business-stock) gt 0) then STOP[consult-business-stock] else if (@business lt 0) then STOP[consult-business-loss] else if (sum(business-income,business-costs) gt 0) then if ans[business-stock-unsold]==true then STOP[consult-business-stock] else if ans[business-line-loss]==false then @business else if ans[business-same-kind]==true then if ans[business-one-account]==true then @business else STOP[consult-business-lines] else STOP[consult-business-lines] else 0
- **gains** = sum(gains)
- **capital-losses-deducted** = if ALL((sum(capital-losses) gt 0), (sum(capital-losses) gt @business-checked)) then STOP[consult-capital-loss] else sum(capital-losses)
- **sale-gain** = if ANY((sum(sale-several) gt 0), (sum(sale-costs) gt 0)) then STOP[consult-sale-several] else 0
- **profit** = ((@earnings + @business-checked + @gains + @sale-gain) - @capital-losses-deducted)
- **living** = if ans[living-within-status]==true then if (sum(living) gt 0) then if ans[living-from-year-income]==true then sum(living) else STOP[consult-living-source] else 0 else STOP[consult-living-status]
- **debts-deducted** = if ans[living-within-status]==true then sum(debts-deductible) else STOP[consult-living-status]
- **surplus** = if ANY((sum(pending-income) gt 0), (sum(pending-expense) gt 0)) then STOP[consult-pending] else if (sum(pending-inheritance) gt 0) then STOP[consult-inheritance-unpaid] else if (sum(debts) gt 0) then STOP[consult-debts] else max(0, (@profit - @living - @debts-deducted))
- **khums** = pct(@surplus, $khums-rate)
- **khums-inheritance** = pct(sum(inheritance-khums), $khums-rate)
- **khums-mined** = pct(sum(mined), $khums-rate)
- **khums-treasure** = pct(sum(treasure), $khums-rate)
- **khums-diving** = pct(sum(diving), $khums-rate)
- **khums-mixed** = pct(sum(mixed-khums), $khums-rate)
- **khums-total** = if (sum(holdings) gt 0) then STOP[consult-holdings] else if (sum(pending-mixed) gt 0) then STOP[consult-mixed-other] else if (sum(mixed-over-fifth) gt 0) then STOP[consult-mixed-other] else if (sum(mixed-khums,mixed-sadaqah,mixed-owner,mixed-group) gt 0) then STOP[consult-mixed-remainder] else if (sum(pending-special) gt 0) then STOP[consult-special] else (@khums + @khums-inheritance + @khums-mined + @khums-treasure + @khums-diving + @khums-mixed)
- **sahm-imam** = pct(@khums-total, $half-share)
- **sahm-sadat** = pct(@khums-total, $half-share)
- **khums-remaining** = if (sum(khums-paid) gt @khums-total) then STOP[consult-overpaid] else (@khums-total - sum(khums-paid))
- **earlier-unpaid** = sum(unpaid-khums)
- **review-mixed-other** = if (sum(pending-mixed) gt 0) then STOP[consult-mixed-other] else 0
- **review-mixed-sadaqah** = if (sum(mixed-sadaqah) gt 0) then STOP[consult-mixed-sadaqah] else 0
- **review-mixed-owner** = if (sum(mixed-owner) gt 0) then STOP[consult-mixed-owner] else 0
- **review-mixed-group** = if (sum(mixed-group) gt 0) then STOP[consult-mixed-group] else 0
- **review-holdings** = if (sum(holdings) gt 0) then STOP[consult-holdings] else 0

Outputs: khums-total←khums-total, khums-due←khums, khums-inheritance←khums-inheritance, khums-mined←khums-mined, khums-treasure←khums-treasure, khums-diving←khums-diving, khums-mixed←khums-mixed, sahm-imam←sahm-imam, sahm-sadat←sahm-sadat, khums-remaining←khums-remaining, surplus←surplus, earlier-unpaid←earlier-unpaid, review-mixed-other←review-mixed-other, review-mixed-sadaqah←review-mixed-sadaqah, review-mixed-owner←review-mixed-owner, review-mixed-group←review-mixed-group, review-holdings←review-holdings

## Program: firstTime

- **ft-assets** = pct(sum(ft-assets), $khums-rate)
- **ft-cash** = pct(sum(ft-cash), $khums-rate)
- **ft-old-spent** = pct(sum(ft-old-spent), $khums-rate)
- **review-settlement** = if (sum(ft-settle) gt 0) then STOP[consult-ft-settlement] else 0
- **khums-total** = if (sum(ft-split) gt 0) then STOP[consult-ft-split] else if ANY((sum(ft-pending) gt 0), (sum(ft-debts) gt 0)) then STOP[consult-ft-pending] else if (sum(ft-settle) gt 0) then STOP[consult-ft-settlement] else (@ft-assets + @ft-cash + @ft-old-spent)
- **sahm-imam** = pct(@khums-total, $half-share)
- **sahm-sadat** = pct(@khums-total, $half-share)

Outputs: khums-total←khums-total, ft-assets←ft-assets, ft-cash←ft-cash, ft-old-spent←ft-old-spent, sahm-imam←sahm-imam, sahm-sadat←sahm-sadat, review-settlement←review-settlement

## Program: missedYear

- **earnings** = sum(earnings)
- **business** = (sum(business-income) - sum(business-costs))
- **business-checked** = if (sum(business-stock) gt 0) then STOP[consult-business-stock] else if (@business lt 0) then STOP[consult-business-loss] else if (sum(business-income,business-costs) gt 0) then if ans[business-stock-unsold]==true then STOP[consult-business-stock] else if ans[business-line-loss]==false then @business else if ans[business-same-kind]==true then if ans[business-one-account]==true then @business else STOP[consult-business-lines] else STOP[consult-business-lines] else 0
- **gains** = sum(gains)
- **capital-losses-deducted** = if ALL((sum(capital-losses) gt 0), (sum(capital-losses) gt @business-checked)) then STOP[consult-capital-loss] else sum(capital-losses)
- **sale-gain** = if ANY((sum(sale-several) gt 0), (sum(sale-costs) gt 0)) then STOP[consult-sale-several] else 0
- **profit** = ((@earnings + @business-checked + @gains + @sale-gain) - @capital-losses-deducted)
- **living** = if ans[living-within-status]==true then if (sum(living) gt 0) then if ans[living-from-year-income]==true then sum(living) else STOP[consult-living-source] else 0 else STOP[consult-living-status]
- **debts-deducted** = if ans[living-within-status]==true then sum(debts-deductible) else STOP[consult-living-status]
- **surplus** = if ANY((sum(pending-income) gt 0), (sum(pending-expense) gt 0)) then STOP[consult-pending] else if (sum(pending-inheritance) gt 0) then STOP[consult-inheritance-unpaid] else if (sum(debts) gt 0) then STOP[consult-debts] else max(0, (@profit - @living - @debts-deducted))
- **khums** = pct(@surplus, $khums-rate)
- **khums-inheritance** = pct(sum(inheritance-khums), $khums-rate)
- **khums-mined** = pct(sum(mined), $khums-rate)
- **khums-treasure** = pct(sum(treasure), $khums-rate)
- **khums-diving** = pct(sum(diving), $khums-rate)
- **khums-mixed** = pct(sum(mixed-khums), $khums-rate)
- **khums-total** = if (sum(holdings) gt 0) then STOP[consult-holdings] else if (sum(pending-mixed) gt 0) then STOP[consult-mixed-other] else if (sum(mixed-over-fifth) gt 0) then STOP[consult-mixed-other] else if (sum(mixed-khums,mixed-sadaqah,mixed-owner,mixed-group) gt 0) then STOP[consult-mixed-remainder] else if (sum(pending-special) gt 0) then STOP[consult-special] else (@khums + @khums-inheritance + @khums-mined + @khums-treasure + @khums-diving + @khums-mixed)
- **sahm-imam** = pct(@khums-total, $half-share)
- **sahm-sadat** = pct(@khums-total, $half-share)
- **khums-remaining** = if (sum(khums-paid) gt @khums-total) then STOP[consult-overpaid] else (@khums-total - sum(khums-paid))
- **earlier-unpaid** = sum(unpaid-khums)
- **review-mixed-other** = if (sum(pending-mixed) gt 0) then STOP[consult-mixed-other] else 0
- **review-mixed-sadaqah** = if (sum(mixed-sadaqah) gt 0) then STOP[consult-mixed-sadaqah] else 0
- **review-mixed-owner** = if (sum(mixed-owner) gt 0) then STOP[consult-mixed-owner] else 0
- **review-mixed-group** = if (sum(mixed-group) gt 0) then STOP[consult-mixed-group] else 0
- **review-holdings** = if (sum(holdings) gt 0) then STOP[consult-holdings] else 0

Outputs: khums-total←khums-total, khums-due←khums, khums-inheritance←khums-inheritance, khums-mined←khums-mined, khums-treasure←khums-treasure, khums-diving←khums-diving, khums-mixed←khums-mixed, sahm-imam←sahm-imam, sahm-sadat←sahm-sadat, khums-remaining←khums-remaining, surplus←surplus, earlier-unpaid←earlier-unpaid, review-mixed-other←review-mixed-other, review-mixed-sadaqah←review-mixed-sadaqah, review-mixed-owner←review-mixed-owner, review-mixed-group←review-mixed-group, review-holdings←review-holdings

Aggregate outputs: khums-total, khums-remaining

## Rules (transcriptions and placeholders)

- **sis-1769** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1769: «چنانچه از مخارج سال خود او و عیالاتش زیاد بیاید، باید خمس ـ یعنی یک پنجم ـ آن را … بدهد» ("in the event that it exceeds his and his family’s living expenses for the year, he must pay khums – i.e. one-fifth – of it"). Encoded: earnings from work and business profit are profit; khums is one-fifth of what exceeds the year’s living expenses. ISSUES: ['Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1770** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1770: «اگر از غیر کسب مالی به دست آورد … مثلاً چیزی به او ببخشند، چنانچه از مخارج سالش زیاد بیاید، خمس آن را باید بدهد». Encoded: gifts received are added to the profit. ISSUES: ['Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1771** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1771: «و همچنین است ارثی که بر اساس قواعد معتبر در باب ارث به انسان می‏رسد» (no khums); inheritance by another way such as taʿṣīb is a gain; «اگر ارثی به او برسد که توقع آن را نداشته و از غیر پدر و پسر باشد، ـ احتیاط واجب ـ آن است که خمس … بدهد». Encoded from the person’s answers about each inheritance. ISSUES: ['The unexpected-inheritance case is an obligatory precaution (احتیاط واجب), encoded as stated.', 'Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1772** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1772: «If a person inherits some property and knows that the person from whom he inherited it did not pay khums on it, he must pay khums on it»; khums the deceased owed on other property is paid from the estate; «in both cases, if the person from whom he inherited it did not believe in paying khums, or never paid it, and neither stipulated in his will that it be paid from his estate, then it is not necessary for the heir to pay the khums owed by the deceased». Encoded from the person’s answers: an ordinary inheritance (Ruling 1771) on which the deceased did not pay khums owes one-fifth of it, unless the exception applies; khums the deceased owed on other property, or an unexpected inheritance with unpaid khums, stops for review. Since 0.9.0 (fresh audit N3) the same question is asked for assets and balances bought with inherited money; yes stops for review. ISSUES: ['Revised ruling (Appendix 3); the amount the deceased owed on other property is needed.', 'Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1776** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1776: charity (ṣadaqah) received «… ـ بنا بر احتیاط واجب ـ باید خمس آن را بدهد» if it exceeds the year’s expenses; «اگر مالی را از بابت خمس یا زکات از روی استحقاق به او داده باشند لازم نیست خمس خود آن را بدهد». Encoded from the person’s answer. ISSUES: ['Charity other than khums or zakat is liable by obligatory precaution, encoded as stated.', 'Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1790** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1790 (Tawdih Jami’ 701): when all lines of business are the same «in business matters such as income and outcome, bookkeeping, and profit and loss … he can offset the loss from that line with the profit from the other»; with different lines, or separate accounts, «he cannot, based on obligatory precaution, offset the loss of one with the profit of the other». Jami’ 701 adds the case of different kinds of business: «ولی اگر دو کسب مختلف داشته باشد، مثلاً تجارت و زراعت می‌کند، یا اینکه … حساب دخل و خرج این دو رشتۀ تجاری از هم جدا ‌باشد، در این دو صورت، بنابر احتیاط واجب نمی‌تواند ضرر یکی را با سود دیگری جبران نماید». Encoded from the person’s answers (0.4.0): business entries are netted together only if no line made a loss, or every line is the same kind of business AND all share one account; otherwise (different kinds of business, separate accounts, or unanswered), and when the business as a whole made a loss, it stops for review. ISSUES: ['Obligatory precaution (احتیاط واجب): the losing line’s profit and loss figures per line are needed; they are not calculated from combined entries.', 'Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1791** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1791: «خرج‌هایی را که انسان برای به دست آوردن فایده می‏کند، مانند دلاّلی و حمّالی … می‌تواند از منفعت، کسر نماید». Encoded: business costs are deducted from business income. ISSUES: ['Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1792** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1792: «آنچه از منافع کسب در بین سال به مصرف خوراک و پوشاک و اثاثیه و خرید منزل … و زیارت و مانند اینها می‏رساند، در صورتی که از شأن او زیاد نباشد، خمس ندارد». Encoded: the year’s living expenses are deducted only when the person confirms they are not beyond his status and (0.5.0, re-audit S5) that they were paid from the year’s income or profit; spending from other money stops for review. ISSUES: ['Education, health, housing and travel are encoded as living expenses under «و مانند اینها».', 'Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1795** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1795: «مالی را که خرج سفر حج و زیارت‌های دیگر می‏کند، از مخارج سالی حساب می‌شود که در آن سال خرج کرده». Encoded: Hajj and ziyarah costs paid in the year are living expenses. ISSUES: ['Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1799** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1799: «اگر در یک سال منفعتی نبرد، نمی‌تواند، مخارج آن سال را از منفعتی که در سال بعد می‏برد، کسر نماید». Encoded: when expenses exceed the profit, nothing is liable and nothing is carried to another year. ISSUES: ['Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1803** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1803 (revised in the 4th edition): «If he borrows money during the year to meet his living expenses and makes a profit before the year’s end, he can deduct the borrowed amount from his profit»; a loan for «a car or a house for his personal use» may be deducted «while he owes money for the purchase of that item and is using it … provided he has not already deducted that borrowed amount». Encoded from the person’s answers about each debt; any other debt stops for review. Since 0.9.0 (fresh audit N2) the amount borrowed is entered and a loan partly repaid stops for review, since the excerpt does not say how a repaid part is treated. ISSUES: ['Revised ruling (Appendix 3; one of the six major revisions). The amount borrowed is entered; a loan partly repaid stops for review (0.9.0), since the excerpt does not say how a repaid part is treated; the footnote’s limit across later years (cumulative surplus) is the person’s to track.', 'Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1816** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Rulings 1815–1816, 1821: «نصاب معدن «15» مثقال معمولی طلای مسکوک است … پس از کم کردن هزینه بیرون آوردن … مخارج بعدی آن از قبیل هزینه خالص‌سازی، از آن کسر می‌شود، و خمس باقی را بدهد»; each partner’s own share must reach the niṣāb. Encoded: one-fifth of the value after costs when the person confirms the niṣāb. ISSUES: ['The niṣāb is measured after extraction costs only; the person confirms it.', 'Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1817** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1817: below the niṣāb «خمس آن در صورتی لازم است که به تنهایی، یا با منفعت‌های دیگر او از مخارج سالش زیاد بیاید». Encoded: added to the year’s profit. ISSUES: ['Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1825** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Rulings 1824–1826, 1828: «نصاب گنج «105» مثقال نقره مسکوک و یا «15» مثقال طلای مسکوک است»; earlier owners must be informed where Ruling 1826 requires; each finder’s own share counts. Encoded: one-fifth of the treasure when the person confirms the niṣāb and that it is his to keep; otherwise it stops for review. ISSUES: ['Treasure below the niṣāb is not covered by these rulings and stops for review.', 'Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1830** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1830: «صاحب مال حرام و مقدار آن هیچ‌کدام معلوم نباشد، و نداند که مقدار حرام کمتر از خمس است یا زیادتر، با دادن خمس آن حلال می‌شود». Encoded: one-fifth of the whole mixed amount in that case only; a known amount (1831) or a known owner (1832) is a different duty and is listed for review; since 0.8.0 an owner among a known group (1835) with the amount unknown stops for review. Since 0.9.0 (fresh audit N1) any mixed amount withholds the total: the excerpts settle the unlawful part (or its khums), not what remains of the amount. ISSUES: ['By obligatory precaution the khums must go to someone entitled to both khums and radd al-maẓālim (1830).', 'Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1836** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1836: gems from diving «چنانچه قیمت آن به «18» نخود طلا برسد باید خمس آن را بدهد» (dives close together count together; each diver’s own share). Encoded: one-fifth when the person confirms the niṣāb; below it stops for review. ISSUES: ['Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1851** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1851: «خمس را باید دو قسمت کنند: یک قسمت آن سهم سادات است … و نصف دیگر آن سهم امام(علیه السلام) است» (the English says “two parts”; the Persian «نصف دیگر» states halves). Encoded: the total khums is split into two equal halves, shown for information. ISSUES: ['Who receives each half (a poor, orphan or stranded sayyid; the most learned jurist for the Imam’s share) is shown, not calculated.', 'Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1852** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Recipients (Rulings 1851–1866, shown, not calculated): the sayyids’ half goes to a poor sayyid, a poor orphan sayyid or a sayyid stranded on a journey (1851–1852) who is a Twelver Shia (1854), proven a sayyid by two dutiful witnesses or certainty (1856); the Imam’s half to the fully qualified jurist or as he authorises, by obligatory precaution the most learned (1851); by obligatory precaution not more than a year’s expenses to one person at once (1861); not in kind without authorisation (1864). ISSUES: ['Eligibility is the payer’s to establish; the calculator does not check recipients.', 'Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1831** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Other duties for mixed property (not khums): known amount, unknown owner: «آن مقدار را به قصد صدقه از طرف صاحبش بدهد» by obligatory precaution with a jurist’s permission (1831); known owner, unknown amount: settle with the owner, or give what is certain (1832); owner among a known group: inform all, then settlement, a jurist or lots (1835). Shown for review, never added to khums. ISSUES: ['Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1801** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1801: «If part of one’s capital is lost in business and similar activities, he can deduct the lost amount from the profit made in the same year»; damage to tools (1791); Jami’ 685: theft, fire and similar losses of business stock or capital, and wear of business tools, are deducted from that year’s income; losses on a home or personal car are not. Encoded (0.5.0, re-audit S3/S4): a loss the person confirms is of business stock, capital or tools is deducted, up to the year’s business profit; any other loss, or a loss larger than the business profit (whose effect on other income is not settled, Ruling 1790), stops for review. ISSUES: ['Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-737** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Tawdih Jami’ vol. 2 (1403), masʾalah 737. (الف) «اگر آن اموال را با درآمد بین سال تهیّه کرده، چنانچه مؤونه بوده … و در همان سال از آن استفاده کرده، به آنها خمس تعلّق نمی‌گیرد، و اگر مؤونه نبوده - مانند ابزار کار، مال التّجاره … - باید خمسش را به قیمت فعلی پرداخت نماید». (ب) «اگر آن اموال را با مال مخمّس یا در حکم مخمّس مثل ارث تهیّه کرده، خمس ندارد؛ مگر آنکه مال‌ التّجاره باشد که ترقّی قیمتش خمس دارد». (ج) bought with «درآمد (پول) سالگشت شده» (income a khums year passed over, khums unpaid): «در صورتی که ثمن معامله به صورت کلّی در ذمّه بوده، پرداخت خمس به قیمت خرید کافی است» — note 5: «کافی است خمس پول سالگشت شده‌ای که بابت بهای مال به فروشنده داده را بپردازد»; merchandise whose price rose and can be sold at it: current value; bought with that specific money from a Twelver Shia seller and risen in value: «پرداخت خمس به قیمت فعلی واجب می‌باشد». (د) mixed sources: «سهم هر مورد را مشخّص نموده». Savings from in-year income a khums year passed over: «باید خمس آنها پرداخت شود». Encoded from the person’s answers: the asset entry is its current value; the price paid from year-old income is entered separately as money paid out. Since 0.9.0 (fresh audit N3) an asset or balance bought with inherited money asks whether the deceased left khums unpaid (Ruling 1772); yes stops for review. ISSUES: ['Note 5: if the money has lost extraordinary value (20 times or more), «بنابر احتیاط واجب باید به مبالغی بیشتر مصالحه شود»: a settlement review.', 'Merchandise bought with khums-paid money (ب, with masāʾil 645 and 647 on inflation) and a necessity not used in the year of purchase are not settled here and stop for review.', 'Note 6: «اگر ترقّی قیمت ناشی از تورّم و کاهش ارزش پول باشد، حکم ویژه\u200cای دارد» (647): a rise the person does not confirm as non-inflationary stops for review (0.4.0, re-audit).', 'A purchase-price entry is not linked to its asset entry: the person’s answers must keep them consistent (open issue; see the 2026-11-23 audit addendum).', 'Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-738** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Tawdih Jami’ vol. 2 (1403), masʾalah 738: property no longer present, spent on living or business costs, «چنانچه آن هزینه‌ها از درآمد سالگشت انجام شده باشد، فرد ضامن خمس آن می‌باشد»; with doubt about the amount «کافی است تنها به مقداری که یقین یا اطمینان دارد مشمول خمس شده، خمس بپردازد؛ مگر آنکه مکلّف در این موضوع مقصّر باشد که در این صورت بنابر احتیاط واجب، با حاکم شرع یا نمایندۀ وی به نسبت احتمال مصالحه نماید». Encoded: money paid out from year-old income owes one-fifth of the amount the person is sure of; a negligent person’s doubt is a settlement review. ISSUES: ['Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-739** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Tawdih Jami’ vol. 2 (1403), masāʾil 739–744: not knowing whether something was bought with year-old or in-year income, or how the price was paid, «بنابر احتیاط واجب باید به نسبت احتمال با حاکم شرع یا نمایندۀ وی مصالحه نماید» (739). Two cases are stated directly: a non-necessity bought with that specific money (740 ب, seller and buyer Twelver Shia, rise not from inflation) «وی باید خمس قیمت فعلی مال را پرداخت نماید»; merchandise that can be sold at its current value (741) «باید خمس را به قیمت فعلی آن بپردازد». Notes 1–2 (740–742): «فروشنده و خریدار شیعۀ دوازده امامی فرض شده‌اند»; a rise «بابت تورّم … احکام ویژه‌ای دارد». Encoded (0.4.0, re-audit): those two cases owe one-fifth of the current value only when the seller and buyer are Twelver Shia and the rise is not from inflation (otherwise review); the other cases of 739–743 are a settlement review with the ḥākim al-sharʿ (the masāʾil’s worked figures are the settlement itself and are not calculated here); a doubt that includes inherited, gifted or khums-paid money (744 and beyond) and cash of unknown origin stop for scholar review. ISSUES: ['The ḥākim al-sharʿ settlement is never calculated; only the cases the text states directly are.', 'Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-736** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Tawdih Jami’ vol. 2, masʾalah 736: «کسی که حساب سال نداشته و خمس نمی‌داده، ابتدا سال خمسی خود را … پیدا می‌کند، سپس خمس درآمدهایی را که انتهای هر سال باقی مانده و صرف در مؤونۀ آن سال نشده می‌پردازد». Encoded: each missed year is calculated like a regular year and the yearly totals are added. ISSUES: ['The person must determine the start of each khums year as the masʾalah describes.', 'Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-620** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Tawdih Jami’ 626 and 624: retirement awards, pensions and insurance payouts transferred to one’s account take the ruling of a subsidy; 620: «تا زمانی که وجوه مذکور از حساب بانکی به صورت مبلغ نقدی برداشت نشده، مشمول خمس نمی‌باشد؛ امّا اگر وجوه فوق برداشت و تملّک شود، جزء درآمد همان سال محسوب می‌شود». Restricted (0.4.0, audit C7) to the case the text states: 620 concerns government subsidies «به صورت انتقال اعتباری پول از طریق شبکه شتاب بانکی» into a savings or current account; 624 extends it only to insurance payouts and 626 only to pension-fund payouts paid that way, where (626 n.1) the deducted contributions are owned by the fund and are not a loan to it. 620 n.3: buying goods by transfer without withdrawing makes the goods the year’s income. Encoded from the person’s answers: a payout matching all of these is the year’s income once withdrawn in cash or spent from the account by transfer, and not income while it stays in the account; any other pension, benefit or insurance payout stops for review. ISSUES: ['Payments into an investment (wakālah) account follow masʾalah 621 and stop for review.', 'A pension contract that is a loan to the fund (626 n.2) and payments by any other route are not covered and stop for review.', 'Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-598** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Tawdih Jami’ 598: the year’s living expenses include «هدایا و جوایزی که فرد به دیگران می‌دهد، صدقاتی که به فقرا می‌پردازد، انفاقاتی که به دیگران می‌کند» and more, under five conditions (from in-year income, within status, not extravagant or unlawful, needed, spent by year end). Encoded: donations and charity given are living expenses, with the status condition. ISSUES: ['Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1787** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1787: «If a person has purchased property that was not for business and he has paid khums on it, in the event that its price rises and he sells it, he must pay khums on the amount that has increased in price and which exceeds his living expenses for the year». Encoded until 0.6.0: the sale price minus the purchase price (entered separately) was added to the year’s profit and a loss stopped. Since 0.7.0 (re-audits S1, S8) every such sale stops for review: the pack cannot link a purchase price to its own sale or count sale entries, so the increase in price of each sale cannot be calculated without a new interpreter capability. ISSUES: ['Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
- **sis-1783** [UNVERIFIED] PROVISIONAL TRANSCRIPTION. Ruling 1783: «During the year, a person can pay khums on his profit whenever he acquires it». Encoded: khums already paid for this year is subtracted from the total due; paying more than is due stops for review. ISSUES: ['Pack-wide: canonical text and Persian edition unconfirmed; matching numbers do not prove matching text (PRIMARY_SOURCE_INVENTORY §2.1, §5.1).']
