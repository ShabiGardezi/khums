'use client';

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

import { cn } from '../lib/utils';
import { Label } from './label';

interface ControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
}

export interface FieldProps {
  label: ReactNode;
  /** The form control (Input, NativeSelect, Textarea…). Receives id and ARIA wiring. */
  children: ReactElement<ControlProps>;
  description?: ReactNode;
  /** Validation message. When present the control is marked aria-invalid. */
  error?: ReactNode;
  required?: boolean;
  className?: string;
  id?: string;
}

/**
 * Label + control + description + error, with correct accessible wiring:
 * label[for] → control[id]; control[aria-describedby] → description and error;
 * control[aria-invalid] when an error is shown.
 */
export function Field({
  label,
  children,
  description,
  error,
  required,
  className,
  id,
}: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? `${generatedId}-control`;
  const descriptionId = description === undefined ? undefined : `${generatedId}-description`;
  const errorId =
    error === undefined || error === null || error === false ? undefined : `${generatedId}-error`;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: controlId,
        ...(describedBy === undefined ? {} : { 'aria-describedby': describedBy }),
        ...(errorId === undefined ? {} : { 'aria-invalid': true }),
        ...(required === true ? { 'aria-required': true } : {}),
      })
    : children;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={controlId}>
        {label}
        {required === true && (
          <span aria-hidden="true" className="text-destructive-strong ms-0.5">
            *
          </span>
        )}
      </Label>
      {descriptionId !== undefined && (
        <p id={descriptionId} className="text-muted-foreground text-sm">
          {description}
        </p>
      )}
      {control}
      {errorId !== undefined && (
        <p id={errorId} className="text-destructive-strong text-sm font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
