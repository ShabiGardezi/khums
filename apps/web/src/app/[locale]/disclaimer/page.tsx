import type { Metadata } from 'next';

import { MockCalculationNotice } from '@khums/ui/components/mock-calculation-notice';

import { LegalPage } from '@/components/page/legal-page';
import { localizedAlternates } from '@/i18n/metadata';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { locale, pages } = await getI18n();
  return { title: pages.disclaimer.title, alternates: localizedAlternates(locale, '/disclaimer') };
}

export default async function DisclaimerPage() {
  const { pages, site } = await getI18n();
  return (
    <LegalPage
      title={pages.disclaimer.title}
      description={pages.disclaimer.description}
      lead={
        <MockCalculationNotice label={site.mockNotice.label} ariaLabel={site.mockNotice.ariaLabel}>
          {pages.disclaimer.mockExplanation}
        </MockCalculationNotice>
      }
    >
      <section>
        <h2>Not a fatwa</h2>
        <p>
          This tool does not issue religious rulings. Results depend on the rulings of the Marja you
          choose, as recorded from cited sources, and on the accuracy of the information you enter.
        </p>
      </section>
      <section>
        <h2>When to consult your Marja&apos;s office</h2>
        <p>
          Some situations need individual guidance. When the rules require it, the app will tell you
          and will not produce a figure. For anything not covered, contact your Marja&apos;s office
          directly.
        </p>
      </section>
    </LegalPage>
  );
}
