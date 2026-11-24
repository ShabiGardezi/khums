import type { LandingContent } from './types';

/**
 * Landing page — English (source language).
 *
 * Editorial rules (CLAUDE.md, docs/research/RESEARCH_PLAN.md):
 * - Describe what the TOOL does. Never state, define or paraphrase a religious ruling.
 * - Be honest about availability: figures come only from scholar-verified rules; a Marja without
 *   verified rules gets a message, never another Marja's rules.
 * - Never imply endorsement by, or affiliation with, any Marja or office.
 * - Do not publicly name a provisional Marja.
 */
export const landingEn: LandingContent = {
  metadata: {
    title: 'Khums Platform',
    description:
      'A private, source-cited tool to help you calculate and track Khums according to your chosen Marja-e-Taqlid.',
  },
  hero: {
    eyebrow: 'Khums calculator · Scholar-verified rules only',
    title: 'Understand your Khums, with every figure explained',
    description:
      'Organise your financial information, choose the Marja whose rulings you follow, and review a step-by-step breakdown that shows the rule version and sources behind each figure. No account needed.',
    primaryCta: 'Start assessment',
    secondaryCta: 'See how it works',
    previewNote:
      'Figures are calculated only from rules that qualified scholars have verified for your Marja. Where none are verified yet, the app says so instead of showing a figure. Development previews use clearly labelled mock rules, which are not religious guidance.',
    illustration: {
      title: 'How a result is explained',
      caption: 'Illustration of the result layout. Values are intentionally omitted.',
      steps: [
        { label: 'Step 1 · Entries grouped by category', rule: 'Rule ref', source: 'Source ref' },
        {
          label: 'Step 2 · Adjustments defined by the rule pack',
          rule: 'Rule ref',
          source: 'Source ref',
        },
        {
          label: 'Step 3 · Result, or a consultation notice',
          rule: 'Rule ref',
          source: 'Source ref',
        },
      ],
      packLabel: 'Rule pack · version',
      consultationFlag: 'Consultation flag',
    },
  },

  howItWorks: {
    id: 'how-it-works',
    eyebrow: 'How it works',
    title: 'Four clear steps',
    description: 'The app guides you through the process. You stay in control of every choice.',
    stepLabel: 'Step {number}: ',
    steps: [
      {
        icon: 'settings',
        title: 'Set your preferences',
        description:
          'Choose your country, currency and language. Nothing else is required to begin.',
      },
      {
        icon: 'user-check',
        title: 'Choose your Marja',
        description:
          'You decide whose rulings apply. The app never selects or changes a Marja for you.',
      },
      {
        icon: 'list',
        title: 'Enter your information',
        description:
          'Record amounts in structured categories. The categories come from the selected Marja’s rule pack.',
      },
      {
        icon: 'file-search',
        title: 'Review an explained result',
        description:
          'See each step, the rule version and its sources. Where individual guidance is needed, the app says so instead of guessing.',
      },
    ],
  },

  assessments: {
    id: 'assessments',
    eyebrow: 'Assessment types',
    title: 'Choose the assessment that fits your situation',
    description:
      'Which situations each assessment covers, and how they are treated, is determined by the rule pack of the Marja you select. It is not decided by this app.',
    items: [
      {
        icon: 'sparkles',
        title: 'First-time assessment',
        description:
          'For people who are assessing their wealth for the first time and want to record what they currently hold.',
      },
      {
        icon: 'calendar',
        title: 'Regular annual assessment',
        description:
          'For a recurring assessment of one year, based on the period you define as your Khums year.',
      },
      {
        icon: 'history',
        title: 'Missed-year assessment',
        description:
          'For reconstructing past years that were not assessed. Each year is recorded and reviewed separately.',
      },
    ],
  },

  marjaSupport: {
    id: 'marja-support',
    eyebrow: 'Marja support',
    title: 'Your Marja’s rulings, kept separate and sourced',
    description:
      'Each Marja’s rules are prepared as an independent, versioned rule pack, based on published sources and reviewed by qualified scholars before use.',
    status: {
      title: 'Current status',
      body: 'Calculations are offered only for a Marja whose rules qualified scholars have verified from official published sources. The Marja list in the assessment shows which have verified rules. Where a Marja has none yet, the app shows a message instead of figures and never uses another Marja’s rules. Development previews use clearly labelled mock data.',
    },
    principles: [
      'You choose your Marja. The app never assigns or switches one for you.',
      'Each Marja’s rules are separate. Rules are never copied from one Marja to another.',
      'If your Marja is not supported, the app says so and points you to their official office, instead of using someone else’s rules.',
      'If you follow a Marja who has passed away, the app does not decide whether you may continue. It shows guidance from sources and suggests consulting a qualified person.',
    ],
    independence:
      'This platform is independent. It does not represent, and is not endorsed by, any Marja or their office.',
  },

  privacy: {
    id: 'privacy',
    eyebrow: 'Privacy',
    title: 'Private by design',
    description:
      'Financial information is personal. The app is built so you do not have to share it.',
    items: [
      { icon: 'lock', title: 'No account needed', description: 'Use every feature anonymously.' },
      {
        icon: 'device',
        title: 'Stays on your device',
        description:
          'Your entries and saved assessments are stored in your browser, not on our servers.',
      },
      {
        icon: 'eye-off',
        title: 'No trackers or ads',
        description: 'No advertising, no third-party tracking, and no logging of your figures.',
      },
      {
        icon: 'trash',
        title: 'You stay in control',
        description:
          'Delete saved assessments at any time. Optional sync, if added later, will be opt-in.',
      },
    ],
  },

  transparency: {
    id: 'transparency',
    eyebrow: 'Transparency',
    title: 'Nothing hidden behind a number',
    description: 'Every result is built so it can be checked, understood and reproduced.',
    items: [
      {
        icon: 'layers',
        title: 'Step-by-step breakdown',
        description: 'Each step of the calculation is shown in order, with its intermediate value.',
      },
      {
        icon: 'tag',
        title: 'Rule-pack version recorded',
        description: 'Results record exactly which version of the rule pack produced them.',
      },
      {
        icon: 'book',
        title: 'Source references',
        description:
          'Steps cite the published sources behind them, such as ruling numbers and official answers.',
      },
      {
        icon: 'message',
        title: 'Consultation instead of guesses',
        description:
          'When a case needs individual guidance, no figure is produced for it, and the app explains why.',
      },
      {
        icon: 'flask',
        title: 'Mock results clearly labelled',
        description: 'Development results always carry a prominent “mock calculation” warning.',
      },
    ],
  },

  faq: {
    id: 'faq',
    eyebrow: 'FAQ',
    title: 'Frequently asked questions',
    items: [
      {
        question: 'What does this tool do?',
        answer: [
          'It helps you organise your financial information and apply the published rulings of the Marja you choose, once those rulings have been prepared as a reviewed rule pack. It shows how each figure is reached.',
        ],
      },
      {
        question: 'Is this a fatwa or religious advice?',
        answer: [
          'No. The app does not issue rulings and does not replace your Marja or their office. It only applies rulings that have been recorded from cited sources and reviewed by qualified scholars.',
        ],
      },
      {
        question: 'Can I rely on the results today?',
        answer: [
          'Figures are shown only from rules that qualified scholars have verified for your Marja, and each result names the rule version and sources used. Results depend on the information you enter, and the app does not issue rulings: if you are unsure, or something is not covered, consult your Marja’s office. Figures on a development preview are mock: do not use them for religious or financial decisions.',
        ],
      },
      {
        question: 'Which Maraje are supported?',
        answer: [
          'A Marja is available for calculation only once qualified scholars have verified their rules from official published sources. When you choose your Marja, the list shows which have verified rules; for the others the app shows a message instead of figures.',
          'More Maraje can be added over time using the same process.',
        ],
      },
      {
        question: 'Do I need to create an account?',
        answer: [
          'No. You can use the app anonymously. Nothing you enter is sent to our servers in this version.',
        ],
      },
      {
        question: 'Where is my information stored?',
        answer: [
          'In your browser on this device. You can delete saved assessments at any time, and clearing your browser’s site data removes them too.',
        ],
      },
      {
        question: 'What if my situation is not covered?',
        answer: [
          'When a rule pack marks a situation as needing individual guidance, or does not cover it, the app will not produce a figure for it. It will suggest contacting your Marja’s office.',
        ],
      },
      {
        question: 'What if the Marja I follow has passed away?',
        answer: [
          'The app does not decide whether you may continue following a Marja who has passed away. It records what you tell it, shows guidance from sources where available, and suggests consulting a qualified person when you are unsure.',
        ],
      },
      {
        question: 'Does the app collect or process Khums payments?',
        answer: [
          'No. The app does not handle payments. It is a calculation and record-keeping tool.',
        ],
      },
    ],
  },

  disclaimer: {
    title: 'Important',
    points: [
      'This tool does not issue religious rulings. Results depend on the rulings of the Marja you choose and on the information you enter.',
      'Figures come only from rules verified by qualified scholars for the Marja you choose. Figures on a development preview use mock rule packs and are not religious guidance.',
    ],
    linkLabel: 'Read the full disclaimer',
  },

  finalCta: {
    title: 'Ready to try the assessment flow?',
    description: 'Start without an account. Your information stays on your device.',
    cta: 'Start assessment',
  },
};
