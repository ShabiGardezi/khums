import { ArrowRight, Info } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@khums/ui/components/badge';
import { buttonVariants } from '@khums/ui/components/button';
import { Container } from '@khums/ui/components/container';
import { MockCalculationNotice } from '@khums/ui/components/mock-calculation-notice';

import type { LandingContent } from '@/content/landing/types';
import { getI18n } from '@/i18n/server';

/** Static illustration of the result layout — deliberately without any figures. */
function ResultIllustration({
  illustration,
  mockLabel,
}: {
  illustration: LandingContent['hero']['illustration'];
  mockLabel: string;
}) {
  return (
    <figure className="bg-card w-full rounded-xl border p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
        <p className="font-semibold">{illustration.title}</p>
        <Badge variant="outline">{illustration.packLabel}</Badge>
      </div>
      <ol className="flex flex-col gap-3 py-4">
        {illustration.steps.map((step, index) => (
          <li key={step.label} className="bg-background flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{step.label}</span>
              <span aria-hidden="true" className="bg-muted h-2.5 w-14 shrink-0 rounded-full" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="primary">{step.rule}</Badge>
              <Badge>{step.source}</Badge>
              {index === illustration.steps.length - 1 && (
                <Badge variant="warning">{illustration.consultationFlag}</Badge>
              )}
            </div>
          </li>
        ))}
      </ol>
      <MockCalculationNotice variant="inline" label={mockLabel} className="whitespace-normal" />
      <figcaption className="text-muted-foreground mt-3 text-xs">{illustration.caption}</figcaption>
    </figure>
  );
}

export async function Hero() {
  const {
    landing: { hero },
    site,
    href,
  } = await getI18n();
  return (
    <section aria-labelledby="hero-heading" className="bg-card border-b">
      <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-24">
        <div className="flex flex-col gap-6">
          <p className="text-primary text-sm font-semibold">{hero.eyebrow}</p>
          <h1 id="hero-heading" className="text-4xl font-semibold leading-tight sm:text-5xl">
            {hero.title}
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg text-pretty">{hero.description}</p>
          <div className="flex flex-wrap gap-3">
            <Link href={href('/start')} className={buttonVariants({ size: 'lg' })}>
              {hero.primaryCta}
              <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
            </Link>
            <Link
              href={href('/#how-it-works')}
              className={buttonVariants({ size: 'lg', variant: 'outline' })}
            >
              {hero.secondaryCta}
            </Link>
          </div>
          <p className="text-muted-foreground flex max-w-xl items-start gap-2 text-sm">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {hero.previewNote}
          </p>
        </div>
        <ResultIllustration illustration={hero.illustration} mockLabel={site.mockNotice.label} />
      </Container>
    </section>
  );
}
