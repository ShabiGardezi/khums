import type { OnboardingContent } from './types';

/**
 * Onboarding — English.
 * Safeguards: never recommend, rank or pre-select a Marja; never present any Marja as
 * calculation-ready; never decide continued taqlid; keep the four statuses separate.
 */
export const onboardingEn: OnboardingContent = {
  progress: {
    label: 'Assessment setup progress',
    stepOf: 'Step {current} of {total}',
    steps: {
      marja: 'Choose your Marja',
      assessment: 'Choose an assessment',
      details: 'Enter your details',
    },
    state: { complete: 'completed', current: 'current step', upcoming: 'not started' },
  },
  start: {
    metadataTitle: 'Start an assessment',
    eyebrow: 'Start an assessment',
    title: 'Before you begin',
    description:
      'This short setup prepares your assessment. You can stop at any time, and you do not need an account.',
    stepsTitle: 'What happens next',
    steps: [
      {
        title: 'Choose your Marja',
        description:
          'Select the Marja whose rulings you follow. The app never selects, recommends or changes a Marja for you.',
      },
      {
        title: 'Choose an assessment',
        description:
          'First-time, annual or missed-year. You will pick the one that fits your situation.',
      },
      {
        title: 'Enter your details and review',
        description:
          'Record your information and review an explained result, where your Marja’s rules allow it.',
      },
    ],
    preview: {
      title: 'About the figures',
      body: 'Figures are calculated only from rules that qualified scholars have verified for the Marja you choose. If your Marja has no verified rules yet, or an entry or assessment type is not yet covered, the app tells you so instead of showing a figure, and it never uses another Marja’s rules. On development previews, any figure is clearly labelled as mock. The app does not issue rulings.',
    },
    privacy:
      'Your choices are never sent to our servers, and they are not kept in your browser unless you choose to save a calculation on this device. Otherwise you will choose again each time you start.',
    continue: 'Continue',
  },
  marja: {
    metadataTitle: 'Set up your assessment',
    title: 'Which Marja do you follow?',
    description:
      'Choose the Marja whose rulings you follow. This is your decision; the app does not recommend or rank any Marja.',
    legend: 'Marja',
    listNote: {
      title: 'About this list',
      body: 'This list is drawn from our research inventory, in alphabetical order. The statuses shown have not yet been verified by reviewers. Calculations are offered only for a Marja whose rules qualified scholars have verified. Inclusion does not imply endorsement or affiliation.',
    },
    verifiedRules: {
      available: 'Verified rules available',
      none: 'No verified rules yet',
    },
    notListed: {
      label: 'My Marja is not listed',
      description: 'Choose this if the Marja you follow does not appear above.',
    },
    continue: 'Continue',
    back: 'Back',
    errors: {
      required: 'Select the Marja you follow, or choose “My Marja is not listed”.',
      invalid: 'That selection is not recognised. Please choose from the list.',
      lost: 'Your Marja choice could not be confirmed, so it was not carried forward. Please choose your Marja again.',
    },
    temporary:
      'Your choice is not saved. If you leave this page or start again, you will need to choose again.',
  },
  status: {
    fieldLabels: {
      lifecycle: 'Status',
      research: 'Research',
      rulePack: 'Rule pack',
      calculation: 'Calculations',
    },
    lifecycle: {
      LIVING: 'Living (verified)',
      DECEASED: 'Passed away (verified)',
      PENDING_VERIFICATION: 'Status not yet verified',
      UNKNOWN: 'Unknown: no evidence has been assessed yet',
    },
    research: {
      NOT_STARTED: 'Not started',
      IN_PROGRESS: 'In progress',
      SCHOLAR_REVIEW: 'In scholarly review',
      COMPLETE: 'Complete',
    },
    rulePack: {
      NONE: 'None prepared',
      DRAFT: 'Draft (not approved)',
      IN_REVIEW: 'In review (not approved)',
      APPROVED: 'Approved, not yet published',
      PUBLISHED: 'Published',
    },
    calculation: {
      UNAVAILABLE: 'Not available',
      AVAILABLE: 'Available',
    },
  },
  review: {
    metadataTitle: 'Your selection',
    title: 'Your selection',
    description: 'Here is what is currently available for your selection.',
    yourSelection: 'Marja you selected',
    selectedByYou: 'Selected by you',
    statusHeading: 'Current status',
    unavailable: {
      title: 'Calculations are not available for this selection yet',
      body: 'No rule pack has been prepared and approved by qualified scholars for {name}. The app will not calculate using another Marja’s rules instead.',
      consult:
        'For your Khums obligations, please consult the office of the Marja you follow or one of their authorised representatives.',
    },
    deceased: {
      title: 'About following a Marja who has passed away',
      body: 'The app does not decide whether you may continue following a Marja who has passed away. If you are unsure, please consult a qualified person.',
    },
    notListed: {
      title: 'Your Marja is not in our list yet',
      body: 'Calculations are not available for your Marja. The app will not use another Marja’s rules instead. For your Khums obligations, please consult the office of the Marja you follow or one of their authorised representatives.',
    },
    temporary:
      'This selection is not saved. If you leave this page or start again, you will need to choose your Marja again.',
    continue: 'Continue',
    change: 'Change selection',
    home: 'Back to home',
  },
  assessment: {
    title: 'Which assessment would you like to explore?',
    description:
      'Choose a type of assessment. Which types apply to you, and how they are treated, is determined by your Marja’s rulings, not by this app.',
    selectedMarja: 'Your selected Marja',
    unavailable: {
      title: 'No authoritative calculation is available yet',
      body: 'There is no approved rule pack for your selected Marja, so whichever type you choose cannot yet lead to an authoritative calculation. You can still continue to see how the setup works.',
    },
    types: {
      'first-time': {
        title: 'First-time assessment',
        description:
          'For people who are assessing their wealth for the first time and want to record what they currently hold.',
      },
      annual: {
        title: 'Regular annual assessment',
        description:
          'For a recurring assessment of one year, based on the period you define as your Khums year.',
      },
      'missed-year': {
        title: 'Missed-year assessment',
        description:
          'For reconstructing past years that were not assessed. Each year is recorded and reviewed separately.',
      },
    },
    notOffered:
      'Not available yet: {name} has no verified rules for this assessment type. It needs scholar review first.',
    errors: {
      required: 'Select an assessment type.',
      invalid: 'That assessment type is not recognised. Please choose from the list.',
      unsupported:
        'That assessment type is not available for your selected Marja yet, because it has no verified rules. Please choose an available type.',
    },
    temporary:
      'Your choices are not saved. If you leave this page or start again, you will need to choose again.',
    continue: 'Continue',
    back: 'Back',
  },
  summary: {
    title: 'Your setup',
    description: 'These are the choices you made. They have not been saved anywhere.',
    marjaLabel: 'Marja',
    assessmentLabel: 'Assessment type',
    unavailable: {
      title: 'This assessment cannot proceed to a calculation yet',
      body: 'There is no approved rule pack for your selected Marja, so an authoritative calculation is not available. The app will not use another Marja’s rules instead.',
      consult:
        'For your Khums obligations, please consult the office of the Marja you follow or one of their authorised representatives.',
    },
    temporary:
      'These choices are not saved. If you leave this page or start again, you will need to choose again.',
    nextSteps:
      'Next, you can record your financial details. They stay in your browser and are saved on this device only if you choose to save the calculation.',
    continue: 'Continue to financial details',
    changeAssessment: 'Change assessment type',
    changeMarja: 'Change Marja',
    home: 'Back to home',
  },
};
