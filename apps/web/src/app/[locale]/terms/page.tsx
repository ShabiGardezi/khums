import type { Metadata } from 'next';

import { LegalPage } from '@/components/page/legal-page';
import { localizedAlternates } from '@/i18n/metadata';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { locale, pages } = await getI18n();
  return { title: pages.terms.title, alternates: localizedAlternates(locale, '/terms') };
}

export default async function TermsPage() {
  const { pages } = await getI18n();
  return (
    <LegalPage title={pages.terms.title} description={pages.terms.description}>
      <section>
        <h2>Pre-release software</h2>
        <p>
          This is a development preview. Calculations use mock rule packs that are not religious
          rulings. Do not use any figure for religious or financial decisions.
        </p>
      </section>
      <section>
        <h2>No religious rulings</h2>
        <p>
          The service is intended to apply published rulings of the Marja you choose, once those
          rulings have been reviewed by qualified scholars. It does not issue rulings of its own.
        </p>
      </section>
    </LegalPage>
  );
}
