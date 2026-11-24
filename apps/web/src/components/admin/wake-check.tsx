'use client';

import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@khums/ui/components/alert';
import { Button } from '@khums/ui/components/button';

import type { AdminContent } from '@/content/admin/types';

import { staffBrowserApi } from './staff-browser-api';

/** How long the sign-in page keeps trying before it reports that the API did not start. */
export const WAKE_DEADLINE_MS = 120_000;
const WAKE_INTERVAL_MS = 3_000;
/** The notice appears only when the API is slow to answer (no flash when it is awake). */
const NOTICE_DELAY_MS = 1_500;

/**
 * Polls `check` until it succeeds or the deadline passes (M4.7: the free API host sleeps after
 * inactivity and takes up to about a minute to start). Pure scheduling, injected for tests.
 */
export async function pollUntilReady(deps: {
  readonly check: () => Promise<boolean>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly deadlineMs?: number;
  readonly intervalMs?: number;
  readonly cancelled?: () => boolean;
}): Promise<'READY' | 'TIMED_OUT' | 'CANCELLED'> {
  const deadline = deps.now() + (deps.deadlineMs ?? WAKE_DEADLINE_MS);
  for (;;) {
    if (deps.cancelled?.() === true) return 'CANCELLED';
    if (await deps.check()) return 'READY';
    if (deps.cancelled?.() === true) return 'CANCELLED';
    if (deps.now() >= deadline) return 'TIMED_OUT';
    await deps.sleep(deps.intervalMs ?? WAKE_INTERVAL_MS);
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Wakes the API from the sign-in page (M4.7 cold-start handling): checks `/api/v1/health` (through
 * the web origin, like every staff request) and shows a notice while the API is starting. With
 * `continueTo` (a page the gate could not check because the API was asleep), it continues there
 * once the API answers; the gate then checks the session again.
 */
export function WakeCheck(props: {
  readonly content: Pick<AdminContent['signInPage'], 'waking' | 'wakeFailed' | 'wakeRetry'>;
  readonly continueTo: string | null;
}) {
  const { continueTo } = props;
  const [state, setState] = useState<'checking' | 'slow' | 'ready' | 'failed'>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const slow = setTimeout(() => {
      if (!cancelled) setState((current) => (current === 'checking' ? 'slow' : current));
    }, NOTICE_DELAY_MS);
    void pollUntilReady({
      check: async () => (await staffBrowserApi().health.check()).ok,
      sleep,
      now: () => Date.now(),
      cancelled: () => cancelled,
    }).then((outcome) => {
      clearTimeout(slow);
      if (outcome === 'CANCELLED') return;
      if (outcome === 'TIMED_OUT') {
        setState('failed');
        return;
      }
      setState('ready');
      if (continueTo !== null) window.location.assign(continueTo);
    });
    return () => {
      cancelled = true;
      clearTimeout(slow);
    };
  }, [attempt, continueTo]);

  return (
    <div role="status" aria-live="polite">
      {state === 'slow' && (
        <Alert variant="info">
          <LoaderCircle
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
          <AlertDescription>{props.content.waking}</AlertDescription>
        </Alert>
      )}
      {state === 'failed' && (
        <Alert variant="warning">
          <AlertDescription className="flex flex-col items-start gap-3">
            {props.content.wakeFailed}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setState('checking');
                setAttempt((n) => n + 1);
              }}
            >
              {props.content.wakeRetry}
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
