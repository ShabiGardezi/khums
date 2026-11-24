import type { ComponentProps } from 'react';

import { cn } from '../lib/utils';

/** Shared form-control styling (inputs, selects, textareas). */
export const controlClassName =
  'bg-card text-foreground placeholder:text-muted-foreground flex w-full rounded-md border border-input px-3 text-base shadow-xs transition-colors sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn(controlClassName, 'h-10 py-2', className)} {...props} />;
}
