import { getI18n } from '@/i18n/server';

import { FeatureGrid } from './feature-grid';
import { LandingSection } from './section';

export async function TransparencySection() {
  const {
    landing: { transparency },
  } = await getI18n();
  return (
    <LandingSection
      id={transparency.id}
      eyebrow={transparency.eyebrow}
      title={transparency.title}
      description={transparency.description}
    >
      <FeatureGrid items={transparency.items} columns="five" />
    </LandingSection>
  );
}
