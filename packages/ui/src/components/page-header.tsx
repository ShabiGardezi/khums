import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Small label above the title (e.g. a section name). */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Heading id, so landmarks/sections can reference it with aria-labelledby. */
  id?: string;
}

/** The single h1 of a page, with optional description and actions. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
  id,
}: PageHeaderProps) {
  return (
    <div
      className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="flex max-w-3xl flex-col gap-2">
        {eyebrow !== undefined && <p className="text-primary text-sm font-medium">{eyebrow}</p>}
        <h1 id={id} className="text-2xl font-semibold sm:text-3xl">
          {title}
        </h1>
        {description !== undefined && (
          <p className="text-muted-foreground text-base text-pretty">{description}</p>
        )}
      </div>
      {actions !== undefined && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
