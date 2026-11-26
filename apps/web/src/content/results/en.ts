import type { ResultsContent } from './types';

export const resultsEn: ResultsContent = {
  title: 'Results',
  description:
    'How the figures were reached, step by step, with the rules and sources each step cites.',
  mockLabel: 'MOCK CALCULATION — NOT RELIGIOUS GUIDANCE — NOT FOR PRODUCTION',
  mockExplanation:
    'This is a development sample. Its buckets, questions and rate are arbitrary engineering values. It is not the ruling of any Marja and must not be used to pay Khums.',
  noticeAriaLabel: 'Mock calculation notice',
  provisionalLabel: 'PROVISIONAL — FOR SCHOLAR REVIEW ONLY',
  provisionalExplanation:
    'These figures use proposed rules that are still under scholarly review. They are not religious guidance, not an approved ruling of any Marja, and must not be used to pay Khums.',
  provisionalNoticeAriaLabel: 'Provisional calculation notice',
  calculate: {
    title: 'Development sample calculation',
    description:
      'Runs your entries through a non-religious sample pack to try the results screen. Nothing leaves this device.',
    button: 'Show sample results',
    notReady: 'Complete the dates and fix any flagged entries first.',
  },
  back: 'Back to review',
  editFact: 'Edit this entry',
  status: {
    ready: 'Ready: run the provisional calculation to see results.',
    completed: 'All figures could be calculated.',
    unresolved: 'Some figures could not be calculated. See what is needed below.',
    needsInput: 'More information is needed before anything can be calculated.',
    refused: 'The calculation could not be run with these entries.',
    provisionalCompleted:
      'Every figure was calculated under the provisional transcribed rules. It is still provisional and for scholar review only.',
  },
  outputs: {
    heading: 'Figures',
    notCalculated: 'Not calculated',
    partial:
      'Partial result: open items remain (listed below). The figures shown are only what could be calculated so far and are not the complete amount due.',
    separate:
      'Each figure belongs to one category only. The figures are separate and are not added together.',
    exact: 'Exact amount (not rounded)',
  },
  summary: {
    heading: 'Summary',
    description:
      'A short overview taken only from the calculation below. The full step-by-step breakdown follows.',
    figuresHeading: 'Amount per category',
    notCalculatedBecause: 'Not calculated: {reasons}',
    notCalculatedSeeBelow: 'Not calculated. See what still needs attention below.',
    noFigures:
      'No figure was calculated. The items listed under “Stopped for scholar review or needs an answer” must be resolved first.',
    entriesNote:
      'How the rules used each entry. Being used does not mean an entry raised a figure: a figure above can still be 0, or not calculated, because of an answer or a stop.',
    counted: {
      heading: 'Used in the calculation',
      empty: 'No entry was used in the calculation.',
    },
    deducted: { heading: 'Deducted', empty: 'No entry was deducted.' },
    excluded: { heading: 'Left out', empty: 'No entry was left out.' },
    stops: {
      heading: 'Stopped for scholar review or needs an answer',
      empty: 'Nothing stopped for review and no answer is missing.',
      review: 'Stopped for scholar review',
      answer: 'Needs an answer',
      detail: 'Needs more detail',
      unsupported: 'Not supported',
    },
    trace: 'Rule pack {packId}, version {version}, content digest {digest}',
    noDigest: 'not available',
  },
  print: {
    button: 'Print or save as PDF',
    hint: 'Prints the notices, the disclaimer, the rules used, the summary and the breakdown, without the site navigation or buttons. You can show the printout to your Marja’s representative to have it checked. Nothing is sent anywhere.',
    reviewNote:
      'To have this calculation checked, show this printout to your Marja’s representative, together with any points listed as needing a consultation. The app does not send it to anyone.',
  },
  disclaimerHeading: 'Calculation disclaimer',
  breakdown: {
    heading: 'Step-by-step breakdown',
    description: 'Each step shows its value, the rules it relies on and their sources.',
    value: 'Value',
    rules: 'Rules',
    sources: 'Sources',
    rounding: 'Rounded to {scale} decimal places ({mode})',
    ruling: 'Ruling {ruling}, version {version} ({state} when this pack version was registered)',
    rulingFindings: 'Findings: {findings}',
    rulingPassages: 'Passages: {passages}',
    rulingNoSnapshot: 'Ruling {ruling}: no provenance recorded in this pack version',
    unresolvedMarker: 'Needs attention',
  },
  unresolved: {
    heading: 'What still needs attention',
    consultation: 'Consultation needed',
    missingAnswer: 'Answer needed',
    consultationHelp:
      'For a real assessment, this situation would need to be put to your Marja’s office or representative; take the printed result with you. The app does not decide it.',
  },
  questions: {
    heading: 'Questions',
    description:
      'Answers are used for this calculation. They are kept only if you save the calculation on this device.',
    yes: 'Yes',
    no: 'No',
    notAnswered: 'Not answered',
    factQuestion: 'About “{fact}”',
    factHeading: 'Questions about your entries',
    yearHeading: 'Questions for {start} to {end}',
    yearDescription:
      'Answer for this year only. Each year has its own answers; nothing is copied from another year.',
  },
  mapping: {
    heading: 'How your entries were used',
    description: 'One line per entry: whether it was counted, left out, or needs something first.',
    fact: 'Entry',
    outcome: 'Outcome',
    bucket: 'Counted in',
    outcomes: {
      ENTRY: 'Counted',
      EXCLUDED: 'Left out',
      CLARIFICATION: 'Needs more detail',
      CONSULTATION: 'Consultation needed',
      UNSUPPORTED: 'Not supported',
    },
  },
  clarifications: {
    heading: 'Entries that need more detail',
    reasons: {
      AMOUNT_ESTIMATED: 'An exact amount is needed instead of an estimate.',
      AMOUNT_RANGE: 'An exact amount is needed instead of a range.',
      AMOUNT_UNKNOWN: 'The amount is needed.',
      AMOUNT_NOT_PROVIDED: 'The amount is needed.',
      DATE_APPROXIMATE: 'An exact date is needed instead of an approximate one.',
      DATE_UNKNOWN: 'The date is needed.',
      DATE_NOT_PROVIDED: 'The date is needed.',
      QUESTION_UNANSWERED: 'Please answer the question about this entry below.',
      QUESTION_ANSWER_INVALID: 'The answer to this entry’s question is not valid.',
    },
  },
  consultations: {
    heading: 'Entries that need a consultation',
    help: 'For a real assessment, these would need to be put to your Marja’s office or representative; take the printed result with you.',
  },
  unsupported: {
    heading: 'Not supported',
    codes: {
      CURRENCY_CONVERSION_UNSUPPORTED:
        'An entry uses a different currency; conversion is not supported.',
      FACT_SHEET_VERSION_UNSUPPORTED: 'This version of your entries is not supported.',
      MAPPING_VERSION_UNSUPPORTED: 'The pack’s entry rules are not supported by this app version.',
      MAPPING_NOT_DEFINED: 'The pack does not define how entries are used.',
      WORKFLOW_NOT_SUPPORTED: 'This assessment type is not supported by the pack.',
      INVALID_FACT_SHEET: 'Your entries could not be read.',
      INVALID_RULE_PACK: 'The rule pack is not valid.',
      FACT_ANSWERS_MISMATCH: 'An answer belongs to a different entry. Please answer again.',
      FACT_ANSWERS_UNKNOWN_FACT: 'An answer refers to an entry that no longer exists.',
      ANSWERS_SCOPE_MISMATCH:
        'Answers were given for the wrong year or in the wrong place. Each missed year needs its own answers.',
    },
  },
  refused: {
    heading: 'Calculation not run',
    body: 'Check your entries and answers, then try again.',
  },
  years: {
    heading: 'Year by year',
    period: '{start} to {end}',
    aggregate: 'Across all years',
    completeness: {
      COMPLETE: 'Complete: every year was fully calculated.',
      PARTIAL: 'Partial: known so far, not the amount due. Years with open items: {count}.',
      UNRESOLVED: 'No total: at least one year could not be calculated.',
    },
  },
  details: {
    heading: 'Technical details',
    pack: 'Rule pack',
    version: 'Version',
    digest: 'Content digest',
    engine: 'Engine version',
    warnings: '{count} readiness gaps (expected for a development sample)',
  },
  unavailable: 'Results are not available here.',
  verified: {
    calculate: {
      title: 'Calculate with verified rules',
      description:
        'Runs your entries through the verified rule pack of your selected Marja, here in your browser. Your entries never leave this device.',
      button: 'Show results',
      notReady: 'Complete the dates and fix any flagged entries first.',
    },
    noticeTitle: 'Calculated with verified rules',
    noticeBody:
      'These figures come from the rule pack that was verified, published and activated for your selected Marja through the platform’s scholar governance process. They were calculated in your browser; your entries were not sent anywhere.',
    disclaimer:
      'This calculator is an aid. Check that your entries are complete and correct. Anything listed as needing attention, and any question about your own situation, should be put to the office of the Marja you follow.',
    traceHeading: 'Rules used',
    traceDescription: 'The exact rule pack behind these figures.',
    activatedAt: 'Activated on',
    noRules: {
      title: 'No verified rules are available right now',
      body: 'There is no verified rule pack for your selected Marja available right now (none yet, or its verified rules are temporarily under review), so no figures can be shown. The app will not use another Marja’s rules or unverified rules instead. Please consult the office of the Marja you follow.',
    },
    loadFailed: {
      title: 'Verified rules could not be loaded',
      body: 'The verified rules could not be loaded just now, so no figures can be shown. Please try again later.',
    },
    notVerified: {
      title: 'These rules could not be verified',
      body: 'The rule pack did not pass the verification check in your browser, so no figures are shown.',
    },
    save: {
      heading: 'Save this calculation on this device',
      description:
        'Optional. Saves your entries, your answers, the assessment dates, the Marja, the rule pack version and these figures in this browser only, so you can open, edit or copy them later. Nothing is sent to us or to anyone else. You can delete saved results at any time on the history page.',
      privacy:
        'Anyone who uses this browser can see saved calculations, including your entries. Do not save on a shared or public device.',
      name: {
        label: 'Name',
        description: 'For example the Khums year. Kept only on this device.',
        required: 'Enter a name of up to 100 characters.',
      },
      defaultAnnual: 'Khums year {start} to {end}',
      defaultDated: 'Assessment on {date}',
      button: 'Save on this device',
      saved: 'Saved on this device.',
      editNote:
        'This is saved as a new saved calculation. The one you opened stays as it was; you can delete it on the history page.',
      failed:
        'This browser did not allow saving (for example in private browsing). Nothing was saved.',
      full: 'This browser has no room left to save this calculation. Delete saved results you no longer need on the history page, then try again. Nothing was saved.',
      notSavable:
        'This result cannot be saved: only a verified result calculated from these entries can be saved. Nothing was saved.',
      unreadableWarning:
        'Some saved data in this browser cannot be read, so it is not shown in your saved results. Saving now removes that unreadable data; every saved calculation that can be read is kept.',
      capWarning:
        'You already have {max} saved calculations, the most this browser keeps. Saving this one removes the oldest, saved on {date}. To keep it, delete another saved calculation on the history page first.',
      viewHistory: 'View saved results',
    },
    reopened: {
      sameTitle: 'Same rule pack version as when saved',
      same: 'These figures use rule pack {packId} version {version}, the same version the saved calculation used.',
      changedTitle: 'The verified rules have changed since this was saved',
      changed:
        'These new figures use the current verified rules: rule pack {packId} version {version}. The saved calculation used rule pack {savedPackId} version {savedVersion}; its saved figures are unchanged on the history page.',
      answersCleared:
        'Because the rules have changed since this was saved, your earlier answers are not reused. Please answer the questions again.',
    },
  },
};
