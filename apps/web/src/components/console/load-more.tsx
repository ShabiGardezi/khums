'use client';

import { useState, type ReactNode } from 'react';

import type { ApiError } from '@khums/api-client';
import type { Result } from '@khums/utils';
import { Alert, AlertDescription } from '@khums/ui/components/alert';
import { Button } from '@khums/ui/components/button';

import type { ConsoleContent } from '@/content/console/types';

import { problemMessage } from './problem-message';

/**
 * A server-rendered first page plus "Load more" (M4.6.5): each further page is fetched with the
 * previous page's cursor and appended. Loading and failures are announced.
 */
export function LoadMoreList<T, C>(props: {
  readonly initial: readonly T[];
  readonly initialCursor: C | null;
  readonly fetchPage: (
    cursor: C,
  ) => Promise<Result<{ items: readonly T[]; cursor: C | null }, ApiError>>;
  readonly render: (items: readonly T[]) => ReactNode;
  readonly content: ConsoleContent['common'];
}) {
  const [items, setItems] = useState<readonly T[]>(props.initial);
  const [cursor, setCursor] = useState<C | null>(props.initialCursor);
  const [state, setState] = useState<
    { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }
  >({
    kind: 'idle',
  });
  return (
    <div className="flex flex-col gap-4">
      {items.length === 0 ? (
        <p className="text-muted-foreground">{props.content.empty}</p>
      ) : (
        props.render(items)
      )}
      <div role="status" aria-live="polite" className="text-muted-foreground text-sm">
        {state.kind === 'busy' ? props.content.loading : ''}
      </div>
      {state.kind === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {cursor !== null && (
        <div>
          <Button
            variant="outline"
            disabled={state.kind === 'busy'}
            onClick={() => {
              setState({ kind: 'busy' });
              void props.fetchPage(cursor).then((result) => {
                if (!result.ok) {
                  setState({
                    kind: 'error',
                    message: problemMessage(result.error, props.content.errors).message,
                  });
                  return;
                }
                setItems((current) => [...current, ...result.value.items]);
                setCursor(result.value.cursor);
                setState({ kind: 'idle' });
              });
            }}
          >
            {props.content.loadMore}
          </Button>
        </div>
      )}
    </div>
  );
}
