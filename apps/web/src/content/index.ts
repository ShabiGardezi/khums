import type { Locale } from '@/i18n/config';

import { adminEn } from './admin/en';
import type { AdminContent } from './admin/types';
import { adminUr } from './admin/ur';
import { consoleEn } from './console/en';
import type { ConsoleContent } from './console/types';
import { consoleUr } from './console/ur';
import { factsEn } from './facts/en';
import type { FactsContent } from './facts/types';
import { factsUr } from './facts/ur';
import { historyEn } from './history/en';
import type { HistoryContent } from './history/types';
import { historyUr } from './history/ur';
import { landingEn } from './landing/en';
import type { LandingContent } from './landing/types';
import { landingUr } from './landing/ur';
import { onboardingEn } from './onboarding/en';
import type { OnboardingContent } from './onboarding/types';
import { onboardingUr } from './onboarding/ur';
import { pagesEn } from './pages/en';
import type { PagesContent } from './pages/types';
import { pagesUr } from './pages/ur';
import { resultsEn } from './results/en';
import type { ResultsContent } from './results/types';
import { resultsUr } from './results/ur';
import { researchEn } from './research/en';
import type { ResearchContent } from './research/types';
import { researchUr } from './research/ur';
import { rulesEn } from './rules/en';
import type { RulesContent } from './rules/types';
import { rulesUr } from './rules/ur';
import { siteEn } from './site/en';
import type { SiteContent } from './site/types';
import { siteUr } from './site/ur';

/**
 * All localized content, by area and locale. `Record<Locale, …>` makes a missing locale a
 * compile error; the content coverage test catches missing or untranslated strings.
 */
export const CONTENT = {
  site: { en: siteEn, ur: siteUr },
  landing: { en: landingEn, ur: landingUr },
  pages: { en: pagesEn, ur: pagesUr },
  onboarding: { en: onboardingEn, ur: onboardingUr },
  facts: { en: factsEn, ur: factsUr },
  admin: { en: adminEn, ur: adminUr },
  results: { en: resultsEn, ur: resultsUr },
  console: { en: consoleEn, ur: consoleUr },
  research: { en: researchEn, ur: researchUr },
  history: { en: historyEn, ur: historyUr },
  rules: { en: rulesEn, ur: rulesUr },
} as const satisfies {
  site: Record<Locale, SiteContent>;
  landing: Record<Locale, LandingContent>;
  pages: Record<Locale, PagesContent>;
  onboarding: Record<Locale, OnboardingContent>;
  facts: Record<Locale, FactsContent>;
  admin: Record<Locale, AdminContent>;
  results: Record<Locale, ResultsContent>;
  console: Record<Locale, ConsoleContent>;
  research: Record<Locale, ResearchContent>;
  history: Record<Locale, HistoryContent>;
  rules: Record<Locale, RulesContent>;
};

export type ContentArea = keyof typeof CONTENT;
