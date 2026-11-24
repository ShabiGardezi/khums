import { getI18n } from '@/i18n/server';

import { FeatureGrid } from './feature-grid';
import { LandingSection } from './section';

export async function PrivacySection() {
  const {
    landing: { privacy },
  } = await getI18n();
  return (
    <LandingSection
      id={privacy.id}
      eyebrow={privacy.eyebrow}
      title={privacy.title}
      description={privacy.description}
      tone="card"
    >
      <FeatureGrid items={privacy.items} columns="four" />
    </LandingSection>
  );
}
