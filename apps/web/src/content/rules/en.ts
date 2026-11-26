import type { RulesContent } from './types';

export const rulesEn: RulesContent = {
  title: 'Rule builder',
  description:
    'Scholars describe each Khums category with predefined fields. Every save is a new audited revision.',
  notice:
    'Builder rules are entered by scholars or prepared by AI. They are not religious guidance and are not used by the public calculator until an authorised scholar verifies their sources.',
  readOnly:
    'You can view and test this Marja’s rules, but only scholars assigned to this Marja can change them.',
  preparation: {
    aiApproved: 'Approved for scholar testing by AI — not verified by a scholar',
    aiDraft: 'Prepared by AI (draft) — not verified by a scholar',
    aiExplain:
      'AI researched, implemented and technically tested this revision. It can be tested in the scholar-testing calculator, but it is not religious guidance and is not public until an authorised scholar verifies it.',
    tool: 'Prepared with',
    tests: 'Technical tests',
    rejected: 'Rejected',
    rejectedExplain:
      'This rule is left out of every calculation. To replace it, save a new revision below.',
    rejectHeading: 'Reject this rule',
    rejectDescription:
      'Rejecting saves a new revision that leaves the rule out of every test and public calculation. Its history is kept, and a later revision can replace it.',
    rejectSubmit: 'Reject rule',
  },
  requests: {
    heading: 'Requests',
    description:
      'Ask for a rule that is missing or for a change to how a rule calculates. The Marja’s scholars see every request and mark it resolved.',
    kind: 'Request type',
    kinds: { MISSING_RULE: 'Missing rule', CALCULATION_CHANGE: 'Calculation change' },
    rule: 'About this rule (optional)',
    ruleNone: 'No specific rule',
    message: 'What is needed?',
    submit: 'Send request',
    empty: 'No requests yet.',
    open: 'Open',
    resolved: 'Resolved',
    resolution: 'Resolution',
    resolveNote: 'Resolution note',
    resolveSubmit: 'Mark resolved',
  },
  marja: {
    label: 'Marja',
    names: { sistani: 'Ayatollah Sistani', khamenei: 'Ayatollah Khamenei' },
  },
  statuses: {
    DRAFT: 'Draft',
    DEVELOPER_IMPLEMENTATION_REQUIRED: 'Developer Implementation Required',
    READY_FOR_VERIFICATION: 'Ready for verification',
  },
  list: {
    heading: 'Rules',
    empty: 'No rules have been entered for this Marja yet.',
    category: 'Category',
    status: 'Status',
    revisions: 'Revisions',
    updated: 'Last saved',
    open: 'Open rule',
  },
  categories: {
    ANNUAL_SURPLUS: 'Annual surplus of income',
    MINED_PRODUCT: 'Mined products',
    TREASURE: 'Treasure',
    DIVING_GEMS: 'Gems obtained by diving',
    MIXED_FUNDS: 'Lawful wealth mixed with unlawful wealth',
  },
  deductionTypes: {
    LIVING_EXPENSES: 'Living expenses',
    COSTS_OF_EARNING: 'Costs of earning or extraction',
    DEDUCTIBLE_DEBTS: 'Deductible debts',
    HOLDINGS_PURCHASES: 'Price paid for things still held at year end',
    COST_OF_ITEMS_SOLD: 'Purchase cost of property sold',
    KHUMS_ALREADY_PAID: 'Khums already paid on this year’s income (subtracted from the amount due)',
    PREVIOUSLY_TAXED_VALUE:
      'Value already taxed at the start of the year (entered dated before the year starts)',
    TAXED_PRINCIPAL:
      'Taxed principal whose inflation reduces its profit (dated before the year starts)',
    EXEMPT_SAVINGS: 'Money held at the year end that a confirmation exempts',
  },
  scopes: {
    ENTRY: 'Asked for each matching entry',
    CALCULATION: 'Asked once for the whole calculation',
  },
  effects: {
    INCLUDE: 'If yes: count it (if no: leave it out)',
    EXCLUDE: 'If yes: leave it out',
    STOP_FOR_REVIEW: 'If yes: stop for individual review',
    COUNT_AS: 'If yes: count it as described below',
  },
  thresholdBases: {
    BEFORE_DEDUCTIONS: 'The amount before deductions',
    AFTER_DEDUCTIONS: 'The amount after deductions',
  },
  thresholdEffects: {
    NOT_COUNTED: 'Below the minimum: not counted',
    STOP_FOR_REVIEW: 'Below the minimum: stop for individual review',
  },
  flags: {
    DATES_OR_TIMING: 'Depends on dates or timing',
    MARKET_VALUE_OR_INFLATION: 'Needs the current market value or inflation',
    LINKED_ENTRIES: 'Links one entry to another',
    PROPORTIONAL_SPLIT: 'Splits an amount by proportion',
    CARRY_OVER: 'Carries over between years',
    CURRENCY_CONVERSION: 'Needs currency conversion',
    FIRST_TIME_OR_MISSED_YEAR: 'Applies to first-time or missed-year assessments',
    OTHER: 'Something else (describe it below)',
  },
  form: {
    createHeading: 'New rule',
    reviseHeading: 'Save a new revision',
    create: 'Save rule',
    revise: 'Save revision',
    check: 'Check requirements',
    checking: 'Checking…',
    category: 'Khums category',
    ruling: 'Research ruling',
    rulingNone: 'No ruling yet (draft)',
    rulingHint: 'A ruling recorded in this Marja’s research workspace.',
    rate: 'Rate (percent)',
    rateHint:
      'Enter the rate exactly as stated by the ruling, for example 12.5. Leave it empty while it is not known; it is never filled in automatically.',
    included: 'Entries counted',
    includedHint: 'The kinds of entries this category counts.',
    deductions: 'Deductions',
    deductionsHint:
      'For each deduction type, tick the entries it covers. Leave a type empty if it does not apply.',
    deductionAgainst: 'Only against these counted entries (optional)',
    deductionAgainstHint:
      'If ticked, this deduction reduces only these counted entries and never below zero, so it cannot offset other income. Leave empty to reduce the whole counted amount.',
    deductionInflation: 'Inflation figure per entry (optional)',
    deductionInflationNone: 'None',
    deductionInflationAdded: 'Deduct the entry plus its inflation',
    deductionInflationOnly: 'Deduct only the inflation on the entry',
    deductionAfterDays:
      'Also count entries paid this many days after the khums year end (optional)',
    deductionAfterDaysHint:
      'A whole number of days, only where the ruling states it. Otherwise entries must be dated within the khums year.',
    conditionOpening:
      'Ask it for the values at the start of the year (entered dated before the year starts)',
    treatmentEntered: 'Counted at the amount entered',
    treatmentAsked: 'Counted at the amount the person states: {label}',
    treatmentInflation: 'plus the inflation figure since then',
    treatmentFixedPortion: 'only {percent}% of it',
    treatmentAskedPortion: 'only the share the person states: {label}',
    treatmentShare:
      'its khums is {numerator}/{denominator} of the amount, added to the khums due (rounded half up)',
    periodLongerThanAYear: 'Stop for review if the assessment period is longer than one year',
    periodLongerThanAYearHint:
      'Only where the ruling states that a khums year cannot be extended. Shorter periods are calculated as entered.',
    conditionEntries: 'Asked for these entries (optional)',
    conditionEntriesHint:
      'Only for a per-entry confirmation: the entry types it is asked for, counted or deducted. Leave empty to ask it for every counted entry.',
    exceptions: 'Exceptions',
    exceptionsHint: 'Entries that are explicitly not counted by this category.',
    conditions: 'Yes/no confirmations',
    conditionsHint:
      'Questions in your own words, with a fixed effect when the answer is yes. Per-entry questions are asked for every counted entry.',
    condition: 'Confirmation {number}',
    conditionScope: 'When it is asked',
    conditionLabel: 'Question (your wording)',
    conditionEffect: 'Effect of the answer',
    addCondition: 'Add a confirmation',
    removeCondition: 'Remove confirmation {number}',
    threshold: 'Minimum amount',
    thresholdUse: 'This category has a minimum amount',
    thresholdAmount: 'Minimum amount',
    thresholdCurrency: 'Currency of the minimum (ISO code, for example USD)',
    thresholdBasis: 'Compared with',
    thresholdEffect: 'Below the minimum',
    sources: 'Sources and passages',
    sourcesHint: 'Research sources or passages of this Marja that support the rule.',
    noSources: 'No sources or passages have been recorded for this Marja yet.',
    flags: 'Needs the software may not support yet',
    flagsHint:
      'Tick everything the ruling depends on. Any ticked need is shown as Developer Implementation Required until a developer adds it.',
    otherRequirement: 'Describe the other need',
    notes: 'Notes',
    optional: '(optional)',
  },
  check: {
    heading: 'Requirement check',
    supported: 'Supported: the existing calculation template can calculate this rule.',
    developerRequired: 'Developer Implementation Required',
    developerRequiredBody:
      'This rule needs capabilities the calculation engine does not have yet. It is calculated as a review stop (no amount) and cannot be verified or activated until a developer adds them:',
    missingHeading: 'Still needed before this rule can be tested or verified',
    errorsHeading: 'Please correct',
    capabilities: {
      FLAG_DATES_OR_TIMING:
        'Conditions on dates or timing (for example when an amount was received).',
      FLAG_MARKET_VALUE_OR_INFLATION:
        'Valuing items at current market value or adjusting for inflation.',
      FLAG_LINKED_ENTRIES:
        'Linking one entry to another (for example an item and the money used for it).',
      FLAG_PROPORTIONAL_SPLIT: 'Splitting an amount into parts by proportion.',
      FLAG_CARRY_OVER: 'Carrying amounts over from one year to the next.',
      FLAG_CURRENCY_CONVERSION: 'Converting amounts between currencies.',
      FLAG_FIRST_TIME_OR_MISSED_YEAR:
        'First-time and missed-year assessments (only the annual assessment has a template).',
      FLAG_OTHER: 'The other need you described.',
      DEDUCTION_NOT_IN_TEMPLATE:
        'This deduction type is not part of this category’s calculation template.',
      RATE_NOT_IN_TEMPLATE: 'This category’s template does not apply a rate.',
      CONDITION_NOT_IN_TEMPLATE: 'This confirmation and effect cannot be applied by the template.',
      THRESHOLD_COMPARISON:
        'Comparing with a minimum amount: the engine cannot hold a fixed amount yet, and a minimum in one currency would also need conversion.',
    },
    missing: {
      RULING_REQUIRED: 'Choose the research ruling this rule comes from.',
      SOURCES_REQUIRED: 'Choose at least one source or passage.',
      RATE_REQUIRED: 'Enter the rate stated by the ruling.',
      ENTRIES_REQUIRED: 'Choose at least one kind of entry that is counted.',
    },
    errors: {
      RATE_INVALID: 'The rate must be more than 0 and at most 100.',
      THRESHOLD_AMOUNT_INVALID: 'The minimum amount cannot be negative.',
      ENTRY_DUPLICATE: 'An entry is listed twice.',
      EXCEPTION_DUPLICATE: 'An exception is listed twice.',
      EXCEPTION_ALSO_INCLUDED: 'An entry cannot be both counted and an exception.',
      DEDUCTION_TYPE_DUPLICATE: 'A deduction type is listed twice.',
      DEDUCTION_ENTRY_KIND: 'This deduction type cannot cover that kind of entry.',
      DEDUCTION_ENTRY_DUPLICATE: 'An entry is covered by two deductions.',
      DEDUCTION_ENTRY_ALSO_COUNTED: 'An entry cannot be both deducted and counted or excepted.',
      DEDUCTION_AGAINST_NOT_INCLUDED:
        'A deduction can only be limited to entries this rule counts.',
      DEDUCTION_AGAINST_DUPLICATE: 'A counted entry can be limited to only one deduction.',
      DEDUCTION_AGAINST_REQUIRED:
        'A value taxed at the start of the year must name the counted entries it is measured against.',
      DEDUCTION_OPTION_NOT_ALLOWED:
        'This deduction type cannot take that inflation setting or days after the year end.',
      CONDITION_TREATMENT_INVALID:
        'A "count it as" question must be per entry, name counted entries, and describe how they are counted (a share of khums needs a rate).',
      CONDITION_OPENING_VALUES_INVALID:
        'A question for values at the start of the year must be per entry and name entries of a start-of-year deduction.',
      DEDUCTION_AGAINST_NOT_ALLOWED:
        'Khums already paid is subtracted from the amount due and cannot be limited to entries.',
      CONDITION_ENTRY_NOT_INCLUDED: 'A per-entry confirmation names an entry that is not counted.',
      CONDITION_ENTRIES_NOT_ALLOWED: 'A whole-calculation confirmation cannot name entries.',
      CONDITION_ENTRY_DUPLICATE: 'A confirmation names an entry twice.',
      SOURCE_DUPLICATE: 'A source is listed twice.',
      FLAG_DUPLICATE: 'A need is listed twice.',
      OTHER_REQUIREMENT_REQUIRED: 'Describe the other need.',
      OTHER_REQUIREMENT_WITHOUT_FLAG: 'Tick “Something else” to describe another need.',
    },
  },
  detail: {
    heading: 'Rule',
    back: 'Back to the rules',
    ruleId: 'Rule id',
    current: 'Current revision',
    history: 'Revision history',
    revision: 'Revision {number}',
    by: 'Saved by',
    at: 'Saved at',
    reason: 'Reason',
    rulingVersion: 'Ruling version',
    content: 'Rule content',
    unknownPerson: 'A staff member',
    openSource: 'Open the source',
  },
  test: {
    heading: 'Test the rules',
    description:
      'Compiles the latest revision of every complete rule of this Marja into a test pack and calculates your test entries. Nothing is saved; use test values only.',
    currency: 'Currency (ISO code)',
    periodStart: 'Khums year starts',
    periodEnd: 'Khums year ends',
    entries: 'Test entries',
    entry: 'Entry {number}',
    entryType: 'Kind of entry',
    amount: 'Amount',
    date: 'Date',
    addEntry: 'Add an entry',
    removeEntry: 'Remove entry {number}',
    run: 'Run test',
    running: 'Calculating…',
    answers: 'Answers to the confirmations',
    answerFor: '{question} — entry {entry}',
    percentHint:
      'A percentage you determine (for example 12.5). The calculator never assumes a rate.',
    amountHint: 'An amount in the test currency (for example 120000).',
    inflationFill: 'Fill in the official inflation figure',
    inflationFilled:
      'Official figure: {percent}% ({from} to {to}). Source: {source}. You may change it.',
    inflationLatest: 'The latest published month was used.',
    inflationFell:
      'Prices fell by {percent}% ({from} to {to}): enter the figure you determine. Source: {source}.',
    inflationUnavailable:
      'No official monthly figure is available for this currency and these dates: enter the figure you determine.',
    inflationNeedsDates: 'Enter the test currency, the entry date and the khums year first.',
    dateIssues: {
      PERIOD_REQUIRED: 'Enter the first and last day of the khums year.',
      PERIOD_END_BEFORE_START: 'The last day of the khums year is before its first day.',
      PERIOD_LONGER_THAN_A_YEAR:
        'This period is {days} days. A khums year is at most one year (366 days): set the last day to one day before the same date next year.',
      ENTRY_DATE_REQUIRED: 'Enter the date of this entry.',
      ENTRY_DATE_TOO_LATE:
        'This date is {days} days after the khums year ends. Entries must be inside the khums year (or the year moved to include them).',
      ENTRY_DATE_BEFORE_START:
        'Before the khums year starts: it is read only as a value at the end of last year (opening value), for example taxed stock, shares or a deposit. Anything else stops for review.',
      ENTRY_DATE_AFTER_END:
        '{days} days after the khums year ends: counted only where a rule allows days after the year end (Ayatollah Khamenei: spending within five days). Otherwise it stops for review.',
    },
    fixDatesFirst: 'Fix the dates marked below, then run the test.',
    dateMeaning: {
      NONE: 'Choose the kind of entry to see which date to enter.',
      INCOME: 'The day you received this money.',
      EXPENSE: 'The day you paid this.',
      BALANCE: 'The day of this balance: normally the last day of the khums year.',
      ASSET:
        'The day of the value you enter: normally the last day of the khums year (its value then, not the purchase date). Its price, if asked, is entered separately.',
      LIABILITY: 'The day of the amount still owed: normally the last day of the khums year.',
    },
    neededAnswers:
      '{count} answers are still needed before the khums can be calculated. They are highlighted below.',
    neededBadge: 'Needed to calculate',
    print: {
      entriesHeading: 'Test entries',
      period: 'Khums year {start} to {end}, currency {currency}',
      answersHeading: 'Answers given',
    },
    runAgainAfterAnswers: 'Answer the highlighted questions, then run the test again.',
    entryName: 'Entry {entry}',
    reviewStopGeneric: 'A rule stopped for individual review.',
    refusalText:
      'The calculation could not run with these entries. Check the dates, the amounts and the answers.',
    clarificationReasons: {
      QUESTION_UNANSWERED: 'needs an answer: {question}',
      QUESTION_ANSWER_INVALID: 'the answer is not valid: {question}',
      DATE_APPROXIMATE: 'needs an exact date',
      DATE_UNKNOWN: 'needs a date',
      DATE_NOT_PROVIDED: 'needs a date',
      AMOUNT_ESTIMATED: 'needs an exact amount',
      AMOUNT_RANGE: 'needs an exact amount',
      AMOUNT_UNKNOWN: 'needs an amount',
      AMOUNT_NOT_PROVIDED: 'needs an amount',
      OTHER: 'needs more information',
    },
    unanswered: 'Not answered',
    outcome: {
      CALCULATED: 'Calculated (provisional)',
      NEEDS_REVIEW: 'Answers or individual review are needed before calculating',
      REFUSED: 'The test could not be calculated',
    },
    pack: 'Test pack',
    compiled: 'Rules included',
    developerStop: 'review stop: developer implementation required',
    skipped: 'Rules left out',
    skippedReasons: {
      INCOMPLETE: 'draft (fields missing)',
      INVALID: 'content to correct',
      REJECTED: 'rejected',
    },
    ruling: 'Research ruling',
    sources: 'Sources',
    noSources: 'No source cited',
    outputs: 'Results by category',
    breakdown: 'Calculation steps',
    notCalculated: 'Not calculated (review stop)',
    reviewStops: 'Review stops',
    clarifications: 'Answers needed',
    refusal: 'Reason',
  },
  refusals: {
    RULING_NOT_FOUND: 'The chosen ruling does not exist in this Marja’s research.',
    RULING_NOT_CURRENT: 'The chosen ruling has been withdrawn, superseded or deleted.',
    SOURCE_NOT_FOUND: 'A chosen source does not exist in this Marja’s research.',
    SOURCE_NOT_CURRENT: 'A chosen source has been withdrawn, superseded or deleted.',
    MARJA_NOT_SUPPORTED: 'Rules can only be entered for the research Marjas.',
    RECORD_INVALID: 'The rule could not be saved in this form.',
    NO_COMPILABLE_RULES: 'There is no complete rule to test yet.',
    ENTRY_CLAIMED_BY_SEVERAL_RULES:
      'One kind of entry is used by more than one rule. Each kind of entry may belong to only one rule.',
    SOURCE_UNRESOLVED: 'A cited source could not be found.',
    REVISIONS_INVALID: 'The stored rules could not be read.',
    PACK_INVALID: 'The test pack could not be built.',
  },
  verification: {
    heading: 'Verify sources',
    description:
      'Record that you have personally verified the sources of the current revision of this rule. Recording the verification approves this revision automatically and publishes it to the public calculator in a new version of this Marja’s rules; there is no separate approval step.',
    publicStatus: 'Public status',
    live: 'Verified and live in version {version} (revision {revision}, activated {date}).',
    suspended:
      'Suspended: version {version} (revision {revision}, activated {date}) is not served to the public, because research it rests on has changed. Correct the rule or the research, then verify again.',
    suspendedRule: 'Affected rule {rule}:',
    suspensionCodes: {
      RULING_SNAPSHOT_STALE: 'The cited ruling changed after this version was published.',
      RULING_SNAPSHOT_MISSING: 'The version carries no copy of a cited ruling.',
      RULING_SNAPSHOT_MISMATCH:
        'The version’s copy of a cited ruling differs from the research records.',
      RULING_REFERENCE_REQUIRED: 'A rule of the version cites no ruling.',
      RULING_REFERENCE_UNRESOLVED:
        'A cited ruling version no longer exists in this Marja’s research.',
      RULING_REFERENCE_INVALID: 'A ruling reference is malformed.',
      RULING_NOT_APPROVED: 'The cited ruling is not approved.',
    },
    revisionPending:
      'The public calculator uses revision {live}. Revision {current} is not verified yet and is not public.',
    notPublic: 'Not public: the active version contains no verified revision of this rule.',
    currentVerified: 'The current revision ({revision}) is source-verified.',
    currentNotVerified:
      'The current revision ({revision}) is not source-verified. Until it is, the public calculator keeps using the previously verified version, if any.',
    preconditions: 'Preconditions',
    ready: 'Every precondition is met: this revision can be verified.',
    blockers: {
      RULE_REJECTED: 'A scholar rejected this rule. Save a new revision to replace it first.',
      RULE_INCOMPLETE: 'The rule is a draft: complete the missing fields first.',
      RULE_INVALID: 'The rule’s content needs correcting first.',
      DEVELOPER_IMPLEMENTATION_REQUIRED:
        'Developer Implementation Required: a field needs a capability the calculator does not have yet. This rule cannot be verified until a developer adds it.',
      RULING_NOT_FOUND: 'The cited ruling does not exist in this Marja’s research.',
      RULING_NOT_CURRENT: 'The cited ruling was withdrawn, superseded or deleted.',
      RULING_VERSION_CHANGED:
        'The ruling has a newer version than the one this revision cites: save a new revision first.',
      SOURCE_NOT_FOUND: 'A cited research record does not exist in this Marja’s research.',
      SOURCE_NOT_VERIFIED: 'A cited source is not VERIFIED in the research records yet.',
      PASSAGE_NOT_VERIFIED: 'A cited passage is not VERIFIED in the research records yet.',
      TRANSLATION_NOT_REVIEWED: 'A translation the ruling uses is not REVIEWED yet.',
      RULING_PROVENANCE_INCOMPLETE:
        'The ruling does not cite a finding and a passage, or a cited record cannot be found.',
      RULING_EVIDENCE_UNVERIFIED:
        'The exact passage or source revisions the ruling cites are not verified (or were disputed or withdrawn).',
      FINDING_NOT_CURRENT: 'A finding the ruling cites was deleted, withdrawn or superseded.',
      FINDING_NOT_VERIFIED:
        'A finding the ruling cites is not VERIFIED or APPROVED yet (a draft, or revised after verification).',
    },
    record: '{type} {id} (state: {state})',
    entityTypes: {
      SOURCE: 'Source',
      PASSAGE: 'Passage',
      TRANSLATION: 'Translation',
      FINDING: 'Finding',
      RULING: 'Ruling',
    },
    formHeading: 'Record the source verification',
    attestationsLegend: 'I confirm, for the current revision of this rule, that:',
    attestations: {
      sourcesAuthentic: 'The sources are authentic (edition and authority) and correctly cited.',
      originalTextMatches: 'The original-language text matches the cited sources exactly.',
      translationAccurate: 'Every translation used is accurate.',
      attributionCorrect: 'The attribution of the ruling to this Marja is correct.',
    },
    notes: 'Notes (optional)',
    notesHint: 'No personal data and no amounts.',
    submit: 'Record verification and publish',
    automatic:
      'After you record it, the server compiles a new version containing only source-verified rules and publishes it; unverified rules stop for review and never produce a public figure.',
    aiNote: 'Only a person can record a verification. AI and automated checks never do.',
    cannotVerify:
      'Only a scholar assigned to this Marja or a super administrator can record a source verification.',
    blockedNote: 'Resolve the preconditions above before recording a verification.',
    history: 'Verification history',
    noHistory: 'No verification has been recorded for this rule yet.',
    historyItem: 'Revision {revision} verified',
    by: 'Verified by',
    at: 'Verified at',
    reason: 'Reason',
    notesLabel: 'Notes',
    published: 'Published as version {version}',
    loadError: 'The verification status could not be loaded.',
    preview: {
      heading: 'What verifying now would publish',
      description:
        'Recording this verification publishes version {version} with exactly these rules. Nothing else changes.',
      included: 'Included (source-verified)',
      withheld: 'Withheld (stops for review, no public figure)',
      removed: 'Removed from public use by this version',
      noneRemoved: 'No rule that is public now would be removed.',
      item: 'Rule {rule} (revision {revision})',
      reasons: {
        NOT_VERIFIED: 'its current revision is not source-verified',
        NOT_READY: 'it is a draft or needs a developer implementation',
        EVIDENCE_CHANGED: 'its research changed since it was verified',
        VERIFIER_NOT_AUTHORIZED:
          'the person who verified it no longer holds that right; verify it again',
      },
    },
  },
  publications: {
    heading: 'Public rule-builder versions',
    description:
      'The version of each Marja’s source-verified builder rules that the public calculator uses now.',
    marja: 'Marja',
    active: 'Active version',
    none: 'No public version yet',
    activeVersion: 'Version {version}, activated {date} ({count} verified rules)',
    digest: 'Content digest',
    suspended:
      'Suspended: not served to the public, because research changed. Affected rules: {rules}',
    loadError: 'The public versions could not be loaded.',
  },
};
