import type { MarjaCatalogueEntry } from '@khums/shared-types';
import { cn } from '@khums/ui/lib/utils';

import type { OnboardingContent } from '@/content/onboarding/types';

export interface StatusRow {
  readonly key: 'lifecycle' | 'research' | 'rulePack' | 'calculation';
  readonly label: string;
  readonly value: string;
}

/**
 * The four independent status dimensions, as localized label/value pairs. `verified` (decision
 * 65, public state): the Marja has a verified pack (governed, published, activated), which the
 * governance ledger, not the static catalogue, establishes.
 */
export function statusRows(
  entry: MarjaCatalogueEntry,
  status: OnboardingContent['status'],
  verified = false,
): StatusRow[] {
  return [
    {
      key: 'lifecycle',
      label: status.fieldLabels.lifecycle,
      value: status.lifecycle[entry.lifecycle.status],
    },
    {
      key: 'research',
      label: status.fieldLabels.research,
      value: status.research[entry.research.status],
    },
    {
      key: 'rulePack',
      label: status.fieldLabels.rulePack,
      value: status.rulePack[verified ? 'PUBLISHED' : entry.rulePack.status],
    },
    {
      key: 'calculation',
      label: status.fieldLabels.calculation,
      value: status.calculation[verified ? 'AVAILABLE' : entry.calculation.availability],
    },
  ];
}

/** Presentational list of status rows (usable from Server and Client Components). */
export function MarjaStatusList({
  rows,
  id,
  className,
}: {
  rows: readonly StatusRow[];
  id?: string;
  className?: string;
}) {
  return (
    <dl id={id} className={cn('grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm', className)}>
      {rows.map((row) => (
        <div key={row.key} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className={cn(row.key === 'calculation' && 'text-warning-strong font-medium')}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
