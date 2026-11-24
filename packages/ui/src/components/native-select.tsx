import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '../lib/utils';
import { controlClassName } from './input';

/**
 * A styled native <select>: fully accessible, works with every input method and screen reader,
 * and needs no JavaScript. Preferred over custom listboxes for simple choices.
 */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative w-full">
      <select
        className={cn(controlClassName, 'h-10 appearance-none py-2 pe-9', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2"
      />
    </div>
  );
}
