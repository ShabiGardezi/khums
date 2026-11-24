import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '../lib/utils';

const alertVariants = cva(
  'relative grid w-full grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-lg border p-4 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>:not(svg)]:col-start-2',
  {
    variants: {
      variant: {
        info: 'bg-info-soft text-info-strong border-info/30',
        success: 'bg-success-soft text-success-strong border-success/30',
        warning: 'bg-warning-soft text-warning-strong border-warning/60',
        destructive: 'bg-destructive-soft text-destructive-strong border-destructive/30',
        neutral: 'bg-card text-foreground',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export type AlertProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants> & {
    /**
     * `status` (polite) for informational content, `alert` (assertive) only for errors that
     * appear in response to user action. Static page content should usually use `none`.
     */
    live?: 'none' | 'status' | 'alert';
  };

export function Alert({ className, variant, live = 'none', ...props }: AlertProps) {
  return (
    <div
      role={live === 'none' ? undefined : live}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('font-semibold leading-snug', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />;
}
