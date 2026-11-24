import { formatMessage } from '@/i18n/format';
import { getI18n } from '@/i18n/server';

import { LandingIconView } from './icons';
import { LandingSection } from './section';

export async function HowItWorks() {
  const {
    landing: { howItWorks },
    definition,
  } = await getI18n();
  const number = new Intl.NumberFormat(definition.tag);
  return (
    <LandingSection
      id={howItWorks.id}
      eyebrow={howItWorks.eyebrow}
      title={howItWorks.title}
      description={howItWorks.description}
    >
      <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {howItWorks.steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums"
              >
                {number.format(index + 1)}
              </span>
              <LandingIconView name={step.icon} className="text-primary size-5" />
            </div>
            <h3 className="text-base font-semibold">
              <span className="sr-only">
                {formatMessage(howItWorks.stepLabel, { number: number.format(index + 1) })}
              </span>
              {step.title}
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
          </li>
        ))}
      </ol>
    </LandingSection>
  );
}
