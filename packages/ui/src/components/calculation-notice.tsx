import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

/**
 * Shared rendering of the reserved calculation notices (mock and provisional). Each tone uses its
 * own reserved colour role, so neither can be confused with normal UI or with the other. Use the
 * exported wrappers (`MockCalculationNotice`, `ProvisionalCalculationNotice`), never this directly.
 */
export interface CalculationNoticeProps {
  readonly tone: 'mock' | 'provisional';
  /** The canonical English label (always shown, `lang="en"`). */
  readonly canonical: string;
  readonly variant: 'banner' | 'inline';
  readonly label: string;
  readonly ariaLabel: string;
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
}

// Literal class strings (Tailwind only generates classes it can find verbatim).
const TONES = {
  mock: 'bg-mock text-mock-foreground border-mock-border',
  provisional: 'bg-provisional text-provisional-foreground border-provisional-border',
} as const;

export function CalculationNotice({
  tone,
  canonical,
  variant,
  label,
  ariaLabel,
  children,
  className,
}: CalculationNoticeProps) {
  const translated = label !== canonical;
  const canonicalText = (
    <span lang="en" dir="ltr" className="font-bold uppercase tracking-wide">
      {canonical}
    </span>
  );

  if (variant === 'inline') {
    return (
      <span
        className={cn(
          TONES[tone],
          'inline-flex items-start gap-1 rounded border px-1.5 py-0.5 text-[0.6875rem]',
          className,
        )}
      >
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
        <span className="flex flex-col">
          {translated && <span className="font-bold">{label}</span>}
          {canonicalText}
        </span>
      </span>
    );
  }
  return (
    <div
      role="note"
      aria-label={ariaLabel}
      className={cn(TONES[tone], 'flex gap-3 rounded-lg border-2 p-4', className)}
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-col gap-1">
        {translated && <p className="font-bold">{label}</p>}
        <p className={translated ? 'text-xs' : undefined}>{canonicalText}</p>
        {children !== undefined && <div className="text-sm">{children}</div>}
      </div>
    </div>
  );
}
