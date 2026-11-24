import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '../lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-foreground border-transparent',
        primary: 'bg-primary-soft text-primary-strong border-transparent',
        success: 'bg-success-soft text-success-strong border-transparent',
        warning: 'bg-warning-soft text-warning-strong border-transparent',
        destructive: 'bg-destructive-soft text-destructive-strong border-transparent',
        info: 'bg-info-soft text-info-strong border-transparent',
        outline: 'text-foreground border-input bg-transparent',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
