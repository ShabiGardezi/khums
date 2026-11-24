import type { SiteContent } from './types';

export const siteEn: SiteContent = {
  name: 'Khums Platform',
  shortDescription:
    'A private, source-cited tool to help you calculate and track Khums according to your chosen Marja-e-Taqlid.',
  titleTemplate: '%s · Khums Platform',
  skipLink: 'Skip to main content',
  previewNotice: {
    ariaLabel: 'Preview notice',
    text: 'Preview: all calculations use mock rule packs and are not religious guidance. Do not rely on any figure.',
  },
  mockNotice: {
    label: 'MOCK CALCULATION — NOT RELIGIOUS GUIDANCE — NOT FOR PRODUCTION',
    ariaLabel: 'Mock calculation notice',
  },
  navigation: {
    mainLabel: 'Main',
    footerLabel: 'Footer',
    menuOpen: 'Open menu',
    menuClose: 'Close menu',
  },
  language: { label: 'Language' },
  links: {
    start: 'Start assessment',
    howItWorks: 'How it works',
    faq: 'FAQ',
    history: 'History',
    methodology: 'How calculations work',
    marjaSupport: 'Marja support',
    privacyApproach: 'Privacy approach',
    privacy: 'Privacy',
    terms: 'Terms',
    disclaimer: 'Disclaimer',
  },
  footer: {
    groups: { product: 'Product', about: 'About', legal: 'Legal' },
    disclaimer:
      'This tool applies published rulings of a Marja chosen by the user; it does not issue religious rulings. For situations not covered, consult your Marja’s office.',
  },
  notFound: {
    title: 'We couldn’t find that page',
    description: 'The page may have moved, or the address may be mistyped.',
    action: 'Go to home',
  },
  error: {
    title: 'Something went wrong',
    description: 'Your saved data on this device is not affected. Please try again.',
    action: 'Try again',
  },
  planned: {
    title: 'Not available yet',
    description: 'This part of the application is planned for milestone {milestone}.',
    back: 'Back to home',
  },
  legal: {
    draftTitle: 'Draft',
    draftBody:
      'This text is a working draft and has not been legally reviewed. It will be finalised before launch.',
    englishOnlyTitle: 'Available in English only',
    englishOnlyBody: 'This page is currently available in English only.',
  },
};
