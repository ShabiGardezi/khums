import { Construction } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@khums/ui/components/button';
import { Container } from '@khums/ui/components/container';
import { EmptyState } from '@khums/ui/components/empty-state';
import { PageHeader } from '@khums/ui/components/page-header';

import { formatMessage } from '@/i18n/format';
import { getI18n } from '@/i18n/server';

/** Honest placeholder for a page scheduled in a later Step 4 milestone. */
export async function PlannedPage({
  title,
  description,
  milestone,
}: {
  title: string;
  description: string;
  milestone: string;
}) {
  const { site, href } = await getI18n();
  return (
    <Container className="flex flex-col gap-8 py-10 sm:py-14">
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={<Construction />}
        title={site.planned.title}
        description={formatMessage(site.planned.description, { milestone })}
        action={
          <Link href={href('/')} className={buttonVariants({ variant: 'outline' })}>
            {site.planned.back}
          </Link>
        }
      />
    </Container>
  );
}
