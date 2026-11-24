import { ArrowRight, Info, LockKeyhole } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from '@khums/ui/components/alert';
import { buttonVariants } from '@khums/ui/components/button';
import { Container } from '@khums/ui/components/container';

import { localizedAlternates } from '@/i18n/metadata';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { locale, onboarding } = await getI18n();
  return {
    title: onboarding.start.metadataTitle,
    alternates: localizedAlternates(locale, '/start'),
  };
}

/** Onboarding welcome: what happens next, the preview status, and a single way forward. */
export default async function StartPage() {
  const { onboarding, definition, href } = await getI18n();
  const { start } = onboarding;
  const number = new Intl.NumberFormat(definition.tag);
  return (
    <Container size="prose" className="flex flex-col gap-10 py-10 sm:py-14">
      <div className="flex flex-col gap-3">
        <p className="text-primary text-sm font-semibold">{start.eyebrow}</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">{start.title}</h1>
        <p className="text-muted-foreground text-lg text-pretty">{start.description}</p>
      </div>

      <section aria-labelledby="start-steps-heading" className="flex flex-col gap-4">
        <h2 id="start-steps-heading" className="text-lg font-semibold">
          {start.stepsTitle}
        </h2>
        <ol className="flex flex-col gap-3">
          {start.steps.map((step, index) => (
            <li key={step.title} className="bg-card flex gap-4 rounded-lg border p-4">
              <span
                aria-hidden="true"
                className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums"
              >
                {number.format(index + 1)}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <Alert variant="warning">
        <Info aria-hidden="true" />
        <AlertTitle>{start.preview.title}</AlertTitle>
        <AlertDescription>
          <p>{start.preview.body}</p>
        </AlertDescription>
      </Alert>

      <p className="text-muted-foreground flex items-start gap-2 text-sm">
        <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {start.privacy}
      </p>

      <div>
        <Link href={href('/start/marja')} className={buttonVariants({ size: 'lg' })}>
          {start.continue}
          <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
        </Link>
      </div>
    </Container>
  );
}
