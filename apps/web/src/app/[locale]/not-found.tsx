import { SearchX } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@khums/ui/components/button';
import { Container } from '@khums/ui/components/container';
import { EmptyState } from '@khums/ui/components/empty-state';

import { getI18n } from '@/i18n/server';

export default async function NotFound() {
  const { site, href } = await getI18n();
  return (
    <Container size="prose" className="py-16">
      <h1 className="sr-only">{site.notFound.title}</h1>
      <EmptyState
        icon={<SearchX />}
        title={site.notFound.title}
        description={site.notFound.description}
        action={
          <Link href={href('/')} className={buttonVariants()}>
            {site.notFound.action}
          </Link>
        }
      />
    </Container>
  );
}
