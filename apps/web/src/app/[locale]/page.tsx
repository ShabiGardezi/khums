import type { Metadata } from 'next';

import { AssessmentTypes } from '@/components/landing/assessment-types';
import { Closing } from '@/components/landing/closing';
import { Faq } from '@/components/landing/faq';
import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { MarjaSupport } from '@/components/landing/marja-support';
import { PrivacySection } from '@/components/landing/privacy-section';
import { TransparencySection } from '@/components/landing/transparency-section';
import { localizedAlternates } from '@/i18n/metadata';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { locale, landing } = await getI18n();
  return {
    title: { absolute: landing.metadata.title },
    description: landing.metadata.description,
    alternates: localizedAlternates(locale, '/'),
  };
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <AssessmentTypes />
      <MarjaSupport />
      <PrivacySection />
      <TransparencySection />
      <Faq />
      <Closing />
    </>
  );
}
