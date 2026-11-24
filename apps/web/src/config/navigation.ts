/**
 * Navigation structure (locale-independent). Labels live in the site content modules and paths
 * are localized with `localizePath` at render time.
 */
export type NavLinkKey =
  | 'start'
  | 'howItWorks'
  | 'faq'
  | 'history'
  | 'methodology'
  | 'marjaSupport'
  | 'privacyApproach'
  | 'privacy'
  | 'terms'
  | 'disclaimer';

export const NAV_PATHS: Readonly<Record<NavLinkKey, string>> = {
  start: '/start',
  howItWorks: '/#how-it-works',
  faq: '/#faq',
  history: '/history',
  methodology: '/methodology',
  marjaSupport: '/#marja-support',
  privacyApproach: '/#privacy',
  privacy: '/privacy',
  terms: '/terms',
  disclaimer: '/disclaimer',
};

/** Desktop/tablet navigation; "Start assessment" is the header's primary button there. */
export const MAIN_NAV: readonly NavLinkKey[] = ['howItWorks', 'faq', 'history'];

/** Phone menu: includes the primary action, which is not shown in the header on small screens. */
export const MOBILE_NAV: readonly NavLinkKey[] = ['start', 'howItWorks', 'faq', 'history'];

export type FooterGroupKey = 'product' | 'about' | 'legal';

export const FOOTER_GROUPS: Readonly<Record<FooterGroupKey, readonly NavLinkKey[]>> = {
  product: ['start', 'howItWorks', 'faq', 'history'],
  about: ['methodology', 'marjaSupport', 'privacyApproach'],
  legal: ['privacy', 'terms', 'disclaimer'],
};
