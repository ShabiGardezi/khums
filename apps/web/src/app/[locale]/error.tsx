'use client';

import { CircleAlert } from 'lucide-react';
import { useParams } from 'next/navigation';

import { Button } from '@khums/ui/components/button';
import { Container } from '@khums/ui/components/container';
import { EmptyState } from '@khums/ui/components/empty-state';

import { SITE_CONTENT } from '@/content/site';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';

/** Route-level error boundary. Never shows technical details to the user. */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ locale: string }>();
  const { error } = SITE_CONTENT[isLocale(params.locale) ? params.locale : DEFAULT_LOCALE];
  return (
    <Container size="prose" className="py-16">
      <h1 className="sr-only">{error.title}</h1>
      <EmptyState
        icon={<CircleAlert />}
        title={error.title}
        description={error.description}
        action={
          <Button
            onClick={() => {
              reset();
            }}
          >
            {error.action}
          </Button>
        }
      />
    </Container>
  );
}
