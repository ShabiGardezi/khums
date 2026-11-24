import { Info } from 'lucide-react';
import type { Metadata } from 'next';
import { connection } from 'next/server';

import {
  ASSESSMENT_WORKFLOWS,
  isMarjaCalculationAvailable,
  NOT_LISTED_SELECTION,
} from '@khums/core';
import { Alert, AlertDescription, AlertTitle } from '@khums/ui/components/alert';
import { Container } from '@khums/ui/components/container';

import { statusRows } from '@/components/onboarding/marja-status-list';
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow';
import { OnboardingProgress } from '@/components/onboarding/progress';
import { localizedAlternates } from '@/i18n/metadata';
import { getI18n } from '@/i18n/server';
import { sortedCatalogue } from '@/onboarding/selection';
import { calculationFor, type CalculationSource } from '@/results/calculation-source';
import { developmentCalculationPack } from '@/server/development/calculation-pack';
import { loadVerifiedCalculationSource } from '@/server/public-calculator';

export async function generateMetadata(): Promise<Metadata> {
  const { locale, onboarding } = await getI18n();
  return {
    title: onboarding.marja.metadataTitle,
    alternates: localizedAlternates(locale, '/start/marja'),
  };
}

/**
 * Transient assessment setup: Marja selection, review, assessment type and summary, all on this
 * URL. Choices are submitted by POST and never placed in the URL or stored (see OnboardingFlow).
 * No option is pre-selected; the Marja list is alphabetical (no ranking).
 */
export default async function MarjaPage() {
  // Rendered per request: the calculation pack depends on the server-side operational state,
  // which must never be baked into a prerendered page.
  await connection();
  const { locale, definition, onboarding, facts, results, href } = await getI18n();
  const calculation = await calculationSource();
  const { marja, status, review, assessment, summary } = onboarding;

  const options = sortedCatalogue(locale, definition.tag).map((entry) => {
    // Public state (decision 65): available exactly when the Marja has a verified pack.
    const verified =
      calculation?.kind === 'VERIFIED' && calculationFor(calculation, entry.id).kind === 'VERIFIED';
    return {
      id: entry.id,
      name: entry.name[locale],
      statuses: statusRows(entry, status, verified),
      calculationAvailable:
        calculation?.kind === 'VERIFIED' ? verified : isMarjaCalculationAvailable(entry),
      verifiedDeceased:
        entry.lifecycle.status === 'DECEASED' && entry.lifecycle.humanVerification === 'VERIFIED',
    };
  });

  return (
    <Container className="flex flex-col gap-8 py-10 sm:py-14">
      <OnboardingFlow
        backHref={href('/start')}
        homeHref={href('/')}
        options={options}
        notListedId={NOT_LISTED_SELECTION}
        workflows={ASSESSMENT_WORKFLOWS}
        content={{ marja, review, assessment, summary }}
        facts={facts}
        results={results}
        calculation={calculation}
        historyHref={href('/history')}
        localeTag={definition.tag}
        slots={{
          progress: {
            marja: <OnboardingProgress current="marja" />,
            review: <OnboardingProgress current={null} completed={['marja']} />,
            assessment: <OnboardingProgress current="assessment" completed={['marja']} />,
            summary: <OnboardingProgress current={null} completed={['marja', 'assessment']} />,
            details: <OnboardingProgress current="details" completed={['marja', 'assessment']} />,
          },
          marjaIntro: (
            <Alert variant="info">
              <Info aria-hidden="true" />
              <AlertTitle>{marja.listNote.title}</AlertTitle>
              <AlertDescription>
                <p>{marja.listNote.body}</p>
              </AlertDescription>
            </Alert>
          ),
        }}
      />
    </Container>
  );
}

/**
 * The calculation rules for this operational state (server-side): DEVELOPMENT, the non-religious
 * mock pack; PRODUCTION_APPROVED (decision 65), each Marja's verified pack, loaded from the API
 * for every Marja at once; any other state, none. Provisional packs are never offered here.
 */
async function calculationSource(): Promise<CalculationSource | null> {
  const development = developmentCalculationPack();
  if (development !== null) return { kind: 'DEVELOPMENT', pack: development };
  return loadVerifiedCalculationSource();
}
