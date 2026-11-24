import type { Locale } from '@/i18n/config';

import { siteEn } from './en';
import type { SiteContent } from './types';
import { siteUr } from './ur';

/** Site chrome text only — small enough to ship to Client Components (e.g. the error boundary). */
export const SITE_CONTENT: Readonly<Record<Locale, SiteContent>> = { en: siteEn, ur: siteUr };
