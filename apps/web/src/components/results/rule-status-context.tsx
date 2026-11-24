'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { RuleReviewStatus } from '@khums/shared-types';
import { Badge } from '@khums/ui/components/badge';

/**
 * Rule review statuses for the results panel (M5.4, provisional flow only). The scholar-review
 * page provides the statuses the API derived for this version; without a provider (development and
 * public flows) nothing is shown. A status never approves anything.
 */
interface RuleStatusValue {
  readonly statusOf: (ruleId: string) => RuleReviewStatus | null;
  readonly labels: Readonly<Record<RuleReviewStatus, string>>;
  readonly label: string;
}

const RuleStatusContext = createContext<RuleStatusValue | null>(null);

export function RuleStatusProvider(props: RuleStatusValue & { readonly children: ReactNode }) {
  const { children, ...value } = props;
  return <RuleStatusContext.Provider value={value}>{children}</RuleStatusContext.Provider>;
}

/** Semantic colour role per status: only an approval is ever shown as success. */
export const STATUS_VARIANT: Readonly<
  Record<RuleReviewStatus, 'success' | 'warning' | 'destructive' | 'info' | 'neutral'>
> = {
  SCHOLAR_APPROVED: 'success',
  SOURCE_VERIFIED_AWAITING_SCHOLAR_REVIEW: 'info',
  PARTIALLY_VERIFIED: 'warning',
  SOURCE_UNVERIFIED: 'warning',
  NEEDS_CORRECTION: 'destructive',
  SCHOLAR_REJECTED: 'destructive',
};

export function RuleStatusBadge(props: {
  readonly status: RuleReviewStatus;
  readonly labels: Readonly<Record<RuleReviewStatus, string>>;
  readonly label: string;
}) {
  return (
    <Badge variant={STATUS_VARIANT[props.status]}>
      <span className="sr-only">{props.label}: </span>
      {props.labels[props.status]}
    </Badge>
  );
}

/** The review status badge of one rule, or nothing outside the provisional flow. */
export function RuleStatusFor(props: { readonly ruleId: string }) {
  const value = useContext(RuleStatusContext);
  const status = value?.statusOf(props.ruleId) ?? null;
  if (value === null || status === null) return null;
  return <RuleStatusBadge status={status} labels={value.labels} label={value.label} />;
}
