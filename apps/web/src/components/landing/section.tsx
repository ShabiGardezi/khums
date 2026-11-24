import type { ReactNode } from 'react';

import { Container } from '@khums/ui/components/container';
import { cn } from '@khums/ui/lib/utils';

export interface LandingSectionProps {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  tone?: 'default' | 'card';
  className?: string;
}

/** A landing-page section: anchor target, labelled region, consistent heading block. */
export function LandingSection({
  id,
  eyebrow,
  title,
  description,
  children,
  tone = 'default',
  className,
}: LandingSectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        'scroll-mt-24 py-16 sm:py-20',
        tone === 'card' && 'bg-card border-y',
        className,
      )}
    >
      <Container className="flex flex-col gap-10">
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="text-primary text-sm font-semibold">{eyebrow}</p>
          <h2 id={headingId} className="text-2xl font-semibold sm:text-3xl">
            {title}
          </h2>
          {description !== undefined && (
            <p className="text-muted-foreground text-base text-pretty sm:text-lg">{description}</p>
          )}
        </div>
        {children}
      </Container>
    </section>
  );
}
