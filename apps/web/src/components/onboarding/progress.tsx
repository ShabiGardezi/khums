import { Check } from 'lucide-react';

import { cn } from '@khums/ui/lib/utils';

import { formatMessage } from '@/i18n/format';
import { getI18n } from '@/i18n/server';

export type OnboardingStepKey = 'marja' | 'assessment' | 'details';

const STEPS: readonly OnboardingStepKey[] = ['marja', 'assessment', 'details'];

/**
 * Setup progress. Rendered as an ordered list with `aria-current="step"`; each step's state is
 * also spelled out for screen readers (colour is never the only cue).
 */
export async function OnboardingProgress({
  current,
  completed = [],
}: {
  current: OnboardingStepKey | null;
  completed?: readonly OnboardingStepKey[];
}) {
  const { onboarding, definition } = await getI18n();
  const { progress } = onboarding;
  const number = new Intl.NumberFormat(definition.tag);
  const currentIndex = current === null ? -1 : STEPS.indexOf(current);
  return (
    <nav aria-label={progress.label}>
      {currentIndex >= 0 && (
        <p className="text-muted-foreground mb-3 text-sm">
          {formatMessage(progress.stepOf, {
            current: number.format(currentIndex + 1),
            total: number.format(STEPS.length),
          })}
        </p>
      )}
      <ol className="flex flex-col gap-2 sm:flex-row sm:gap-6">
        {STEPS.map((step, index) => {
          const state = completed.includes(step)
            ? 'complete'
            : step === current
              ? 'current'
              : 'upcoming';
          return (
            <li
              key={step}
              aria-current={state === 'current' ? 'step' : undefined}
              className="flex items-center gap-2 text-sm"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
                  state === 'complete' && 'bg-primary border-primary text-primary-foreground',
                  state === 'current' && 'border-primary text-primary-strong border-2',
                  state === 'upcoming' && 'text-muted-foreground',
                )}
              >
                {state === 'complete' ? <Check className="size-4" /> : number.format(index + 1)}
              </span>
              <span className={cn(state === 'upcoming' ? 'text-muted-foreground' : 'font-medium')}>
                {progress.steps[step]}
                <span className="sr-only"> ({progress.state[state]})</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
