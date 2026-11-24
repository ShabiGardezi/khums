import type { ReactNode } from 'react';

import { CalculationNotice } from './calculation-notice';

/**
 * Canonical label for every development (mock) calculation, report and export.
 * Never shorten, restyle into something subtle, or hide this text. See CLAUDE.md.
 */
export const MOCK_CALCULATION_LABEL =
  'MOCK CALCULATION — NOT RELIGIOUS GUIDANCE — NOT FOR PRODUCTION';

export interface MockCalculationNoticeProps {
  /** `banner`: full-width block for results/reports. `inline`: compact label next to figures. */
  variant?: 'banner' | 'inline';
  /**
   * Localized label. When it differs from the canonical English label, both are shown: the
   * translation first, the canonical English text after it (marked `lang="en"`).
   */
  label?: string;
  /** Localized accessible name for the banner's note region. */
  ariaLabel?: string;
  /** Optional extra explanation shown under the label (banner only). */
  children?: ReactNode;
  className?: string;
}

/**
 * High-visibility notice that a figure comes from a MOCK / NOT FOR PRODUCTION rule pack.
 * Uses the reserved `mock` colour role so it cannot be confused with normal UI.
 */
export function MockCalculationNotice({
  variant = 'banner',
  label = MOCK_CALCULATION_LABEL,
  ariaLabel = 'Mock calculation notice',
  children,
  className,
}: MockCalculationNoticeProps) {
  return (
    <CalculationNotice
      tone="mock"
      canonical={MOCK_CALCULATION_LABEL}
      variant={variant}
      label={label}
      ariaLabel={ariaLabel}
      className={className}
    >
      {children}
    </CalculationNotice>
  );
}
