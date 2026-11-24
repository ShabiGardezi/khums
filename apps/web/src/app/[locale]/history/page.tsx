import type { Metadata } from 'next';

import { listMarjaCatalogue } from '@khums/core';
import { Container } from '@khums/ui/components/container';
import { PageHeader } from '@khums/ui/components/page-header';

import { HistoryList } from '@/components/history/history-list';
import { localizedAlternates } from '@/i18n/metadata';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { locale, history } = await getI18n();
  return { title: history.metadataTitle, alternates: localizedAlternates(locale, '/history') };
}

/**
 * Saved results (owner decisions 2026-11-23 and 2026-11-24; decisions 65 and 71): a browser-only
 * history the user opts into per calculation. The server renders only the frame; the saved
 * calculations (with their entries) are read from this browser's storage in the client and never
 * reach the server.
 */
export default async function HistoryPage() {
  const { locale, definition, history, href } = await getI18n();
  const marjaNames = Object.fromEntries(
    listMarjaCatalogue().map((entry) => [entry.id, entry.name[locale]]),
  );
  return (
    <Container className="flex flex-col gap-8 py-10 sm:py-14">
      <PageHeader title={history.title} description={history.description} />
      <HistoryList
        content={history}
        localeTag={definition.tag}
        marjaNames={marjaNames}
        startHref={href('/start')}
        calculatorHref={href('/start/marja')}
      />
    </Container>
  );
}
