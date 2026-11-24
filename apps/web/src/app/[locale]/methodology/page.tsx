import type { Metadata } from 'next';

import { PlannedPage } from '@/components/page/planned-page';
import { localizedAlternates } from '@/i18n/metadata';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { locale, pages } = await getI18n();
  return {
    title: pages.methodology.title,
    alternates: localizedAlternates(locale, '/methodology'),
  };
}

export default async function MethodologyPage() {
  const { pages } = await getI18n();
  return (
    <PlannedPage
      title={pages.methodology.title}
      description={pages.methodology.description}
      milestone="M4.10"
    />
  );
}
