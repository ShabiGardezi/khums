import { ArrowRight, TriangleAlert } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@khums/ui/components/button';
import { Container } from '@khums/ui/components/container';
import { cn } from '@khums/ui/lib/utils';

import { getI18n } from '@/i18n/server';

export async function Closing() {
  const {
    landing: { disclaimer, finalCta },
    href,
  } = await getI18n();
  return (
    <Container className="flex flex-col gap-10 py-16 sm:py-20">
      <section
        aria-labelledby="disclaimer-heading"
        className="bg-warning-soft text-warning-strong border-warning/60 flex flex-col gap-3 rounded-lg border p-5 sm:p-6"
      >
        <h2 id="disclaimer-heading" className="flex items-center gap-2 text-base font-semibold">
          <TriangleAlert aria-hidden="true" className="size-5" />
          {disclaimer.title}
        </h2>
        <ul className="flex list-disc flex-col gap-1.5 ps-5 text-sm leading-relaxed">
          {disclaimer.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <Link
          href={href('/disclaimer')}
          className="w-fit text-sm font-medium underline underline-offset-4"
        >
          {disclaimer.linkLabel}
        </Link>
      </section>

      <section
        aria-labelledby="final-cta-heading"
        className="bg-primary text-primary-foreground flex flex-col items-start gap-5 rounded-xl px-6 py-10 sm:px-10 md:flex-row md:items-center md:justify-between"
      >
        <div className="flex flex-col gap-2">
          <h2 id="final-cta-heading" className="text-2xl font-semibold">
            {finalCta.title}
          </h2>
          <p className="text-primary-foreground/85 max-w-xl">{finalCta.description}</p>
        </div>
        <Link
          href={href('/start')}
          className={cn(
            buttonVariants({ size: 'lg', variant: 'secondary' }),
            'bg-card text-primary-strong hover:bg-primary-soft',
          )}
        >
          {finalCta.cta}
          <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
        </Link>
      </section>
    </Container>
  );
}
