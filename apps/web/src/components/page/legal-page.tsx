import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@khums/ui/components/alert';
import { Container } from '@khums/ui/components/container';
import { PageHeader } from '@khums/ui/components/page-header';

import { getI18n } from '@/i18n/server';

/**
 * Reading-width layout for policy pages. Bodies are English-only drafts for now: in other locales
 * they are marked `lang="en" dir="ltr"` (correct pronunciation and direction) with a notice.
 */
export async function LegalPage({
  title,
  description,
  lead,
  children,
}: {
  title: string;
  description: string;
  /** Localized content shown before the (possibly English-only) body, in the page's locale. */
  lead?: ReactNode;
  children: ReactNode;
}) {
  const { locale, site } = await getI18n();
  const englishOnly = locale !== 'en';
  return (
    <Container size="prose" className="flex flex-col gap-8 py-10 sm:py-14">
      <PageHeader title={title} description={description} />
      <Alert variant="warning">
        <AlertTitle>{site.legal.draftTitle}</AlertTitle>
        <AlertDescription>
          <p>{site.legal.draftBody}</p>
          {englishOnly && <p className="mt-1">{site.legal.englishOnlyBody}</p>}
        </AlertDescription>
      </Alert>
      {lead}
      <div
        {...(englishOnly ? { lang: 'en', dir: 'ltr' } : {})}
        className="flex flex-col gap-6 text-base leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:ps-6"
      >
        {children}
      </div>
    </Container>
  );
}
