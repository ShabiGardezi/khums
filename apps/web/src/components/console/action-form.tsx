'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';

import type { ApiError } from '@khums/api-client';
import type { Result } from '@khums/utils';
import { Alert, AlertDescription } from '@khums/ui/components/alert';
import { Button } from '@khums/ui/components/button';

import type { ConsoleContent } from '@/content/console/types';
import { useHydrated } from '@/lib/use-hydrated';

import { problemMessage } from './problem-message';

export interface ActionFormProps<T> {
  readonly submitLabel: string;
  readonly content: ConsoleContent['common'];
  /** Runs the API call with the form's data (native validation has passed). */
  readonly onSubmit: (data: FormData) => Promise<Result<T, ApiError>>;
  /** After success; by default the page's server data is refreshed. */
  readonly onDone?: (value: T) => void;
  /** Refresh the server-rendered page after success (default true). */
  readonly refresh?: boolean;
  readonly variant?: 'primary' | 'outline' | 'destructive';
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * A console action (M4.6.5): native form validation, a busy state, the localized problem message
 * with its stable code on failure, a polite success message, and a server refresh so the page
 * shows the state the API now holds. Every action is authorized and audited by the API.
 */
export function ActionForm<T>(props: ActionFormProps<T>) {
  const router = useRouter();
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'done' }
    | { kind: 'error'; message: string; code: string | null }
  >({ kind: 'idle' });
  // Disabled until hydrated: no early submission before the handler exists (M5.2.1).
  const hydrated = useHydrated();

  return (
    <form
      // Never a native GET: before hydration the fields must not end up in the URL.
      method="post"
      className={props.className ?? 'flex flex-col gap-3'}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setState({ kind: 'busy' });
        void props.onSubmit(data).then((result) => {
          if (!result.ok) {
            setState({ kind: 'error', ...problemMessage(result.error, props.content.errors) });
            return;
          }
          setState({ kind: 'done' });
          form.reset();
          props.onDone?.(result.value);
          if (props.refresh !== false) router.refresh();
        });
      }}
    >
      {props.children}
      <div>
        <Button
          type="submit"
          variant={props.variant ?? 'primary'}
          disabled={state.kind === 'busy' || !hydrated}
        >
          {state.kind === 'busy' ? props.content.saving : props.submitLabel}
        </Button>
      </div>
      <div role="status" aria-live="polite">
        {state.kind === 'done' && (
          <p className="text-success-strong text-sm">{props.content.saved}</p>
        )}
      </div>
      {state.kind === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>
            {state.message}
            {state.code !== null && (
              <>
                {' '}
                <span className="text-xs">
                  ({props.content.code}: <code dir="ltr">{state.code}</code>)
                </span>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}

/** A required reason field (3–500 characters), as every audited administrative action needs. */
export function ReasonField(props: {
  readonly content: ConsoleContent['common'];
  readonly name?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {props.content.reason}
      </label>
      <input
        id={id}
        name={props.name ?? 'reason'}
        required
        minLength={3}
        maxLength={500}
        aria-describedby={`${id}-hint`}
        className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
      />
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
        {props.content.reasonHint}
      </p>
    </div>
  );
}

/** A text value from form data (missing or file fields read as empty). */
export const field = (data: FormData, name: string): string => {
  const value = data.get(name);
  return typeof value === 'string' ? value.trim() : '';
};
