import { CircleCheck, Info } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@khums/ui/components/alert';

import { getI18n } from '@/i18n/server';

import { LandingSection } from './section';

export async function MarjaSupport() {
  const {
    landing: { marjaSupport },
  } = await getI18n();
  return (
    <LandingSection
      id={marjaSupport.id}
      eyebrow={marjaSupport.eyebrow}
      title={marjaSupport.title}
      description={marjaSupport.description}
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <Alert variant="info" className="h-fit">
          <Info aria-hidden="true" />
          <AlertTitle>{marjaSupport.status.title}</AlertTitle>
          <AlertDescription>
            <p>{marjaSupport.status.body}</p>
          </AlertDescription>
        </Alert>
        <div className="flex flex-col gap-5">
          <ul className="flex flex-col gap-4">
            {marjaSupport.principles.map((principle) => (
              <li key={principle} className="flex gap-3">
                <CircleCheck aria-hidden="true" className="text-primary mt-0.5 size-5 shrink-0" />
                <span className="leading-relaxed">{principle}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground border-t pt-4 text-sm">{marjaSupport.independence}</p>
        </div>
      </div>
    </LandingSection>
  );
}
