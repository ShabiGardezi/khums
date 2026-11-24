import type { HTMLAttributes } from 'react';

import { cn } from '../lib/utils';

export type ContainerProps = HTMLAttributes<HTMLDivElement> & {
  /** `prose` for reading-width pages, `default` for app pages, `wide` for dashboards. */
  size?: 'prose' | 'default' | 'wide';
};

const SIZES = { prose: 'max-w-3xl', default: 'max-w-6xl', wide: 'max-w-7xl' } as const;

/** Page-width wrapper with responsive gutters (logical properties for RTL). */
export function Container({ className, size = 'default', ...props }: ContainerProps) {
  return (
    <div className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', SIZES[size], className)} {...props} />
  );
}
