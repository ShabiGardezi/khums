import type { PagesContent } from './types';

export const pagesEn: PagesContent = {
  start: {
    title: 'Start an assessment',
    description: 'Choose your preferences, your Marja and the type of assessment.',
  },
  history: {
    title: 'Assessment history',
    description: 'Assessments you save are stored only on this device.',
  },
  methodology: {
    title: 'How calculations work',
    description: 'How rule packs, sources and scholar review determine every figure.',
  },
  privacy: { title: 'Privacy', description: 'How your information is handled.' },
  terms: { title: 'Terms of use', description: 'The conditions for using this service.' },
  disclaimer: {
    title: 'Disclaimer',
    description: 'Important limits of this tool.',
    mockExplanation:
      'Until scholar-reviewed rule packs are approved, every calculation in this application is a mock used only to develop and test the software.',
  },
  designSystem: { title: 'Design system', description: 'Tokens and shared components (M4.1).' },
};
