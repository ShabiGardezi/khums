import type { ReactNode } from 'react';

import { CalculationNotice } from './calculation-notice';

/**
 * Canonical label for every provisional (scholar-review) calculation, report and export (M4.5a).
 * Identical to `@khums/calculation-engine` PROVISIONAL_LABEL. Never shorten, restyle into
 * something subtle, or hide this text: a provisional result is never religious guidance.
 */
export const PROVISIONAL_CALCULATION_LABEL = 'PROVISIONAL — FOR SCHOLAR REVIEW ONLY';

export interface ProvisionalCalculationNoticeProps {
  /** `banner`: full-width block for results/reports. `inline`: compact label next to figures. */
  variant?: 'banner' | 'inline';
  /** Localized label; the canonical English label is always shown as well. */
  label?: string;
  /** Localized accessible name for the banner's note region. */
  ariaLabel?: string;
  /** Optional extra explanation shown under the label (banner only). */
  children?: ReactNode;
  className?: string;
}

/**
 * High-visibility notice that a figure comes from proposed rules under scholarly review. Uses the
 * reserved `provisional` colour role (distinct from `mock`), so it cannot look approved.
 */
export function ProvisionalCalculationNotice({
  variant = 'banner',
  label = PROVISIONAL_CALCULATION_LABEL,
  ariaLabel = 'Provisional calculation notice',
  children,
  className,
}: ProvisionalCalculationNoticeProps) {
  return (
    <CalculationNotice
      tone="provisional"
      canonical={PROVISIONAL_CALCULATION_LABEL}
      variant={variant}
      label={label}
      ariaLabel={ariaLabel}
      className={className}
    >
      {children}
    </CalculationNotice>
  );
}
