import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Heading level for the title (default h2). */
  headingLevel?: 2 | 3;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  headingLevel = 2,
}: EmptyStateProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div
      className={cn(
        'bg-card flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      {icon !== undefined && (
        <div
          aria-hidden="true"
          className="bg-muted text-muted-foreground rounded-full p-3 [&_svg]:size-6"
        >
          {icon}
        </div>
      )}
      <Heading className="text-base font-semibold">{title}</Heading>
      {description !== undefined && (
        <p className="text-muted-foreground max-w-md text-sm">{description}</p>
      )}
      {action !== undefined && <div className="mt-2">{action}</div>}
    </div>
  );
}
