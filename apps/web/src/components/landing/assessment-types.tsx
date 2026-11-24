import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@khums/ui/components/card';

import { getI18n } from '@/i18n/server';

import { LandingIconView } from './icons';
import { LandingSection } from './section';

export async function AssessmentTypes() {
  const {
    landing: { assessments },
  } = await getI18n();
  return (
    <LandingSection
      id={assessments.id}
      eyebrow={assessments.eyebrow}
      title={assessments.title}
      description={assessments.description}
      tone="card"
    >
      <ul className="grid gap-4 md:grid-cols-3">
        {assessments.items.map((item) => (
          <li key={item.title}>
            <Card className="bg-background h-full">
              <CardHeader>
                <div className="bg-primary-soft text-primary-strong mb-2 flex size-10 items-center justify-center rounded-lg">
                  <LandingIconView name={item.icon} className="size-5" />
                </div>
                <CardTitle>{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="leading-relaxed">{item.description}</CardDescription>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </LandingSection>
  );
}
