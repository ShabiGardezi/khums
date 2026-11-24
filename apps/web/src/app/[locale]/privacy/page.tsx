import type { Metadata } from 'next';

import { LegalPage } from '@/components/page/legal-page';
import { localizedAlternates } from '@/i18n/metadata';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { locale, pages } = await getI18n();
  return { title: pages.privacy.title, alternates: localizedAlternates(locale, '/privacy') };
}

export default async function PrivacyPage() {
  const { pages } = await getI18n();
  return (
    <LegalPage title={pages.privacy.title} description={pages.privacy.description}>
      <section>
        <h2>Private by design</h2>
        <p>
          You can use the calculator without creating an account. In this version, everything you
          enter is stored only in your browser on this device and is never sent to our servers.
        </p>
      </section>
      <section>
        <h2>What we do not do</h2>
        <ul>
          <li>We do not use advertising or third-party tracking.</li>
          <li>We do not sell or share your information.</li>
          <li>We do not record your financial figures in logs.</li>
        </ul>
      </section>
      <section>
        <h2>Your control</h2>
        <p>
          You can delete saved assessments at any time. Clearing your browser&apos;s site data also
          removes them.
        </p>
      </section>
    </LegalPage>
  );
}
