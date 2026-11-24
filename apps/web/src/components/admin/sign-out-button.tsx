'use client';

import { useState } from 'react';

import { Button } from '@khums/ui/components/button';

import { useHydrated } from '@/lib/use-hydrated';

import { staffBrowserApi } from './staff-browser-api';

/** Signs out (revokes the server-side session), then returns to the sign-in page. */
export function SignOutButton(props: {
  readonly label: string;
  readonly busyLabel: string;
  readonly signInHref: string;
}) {
  const [busy, setBusy] = useState(false);
  // Disabled until hydrated: before that a click would do nothing and leave the session open.
  const hydrated = useHydrated();
  return (
    <Button
      variant="outline"
      disabled={busy || !hydrated}
      onClick={() => {
        setBusy(true);
        void staffBrowserApi()
          .staff.logout()
          .finally(() => {
            window.location.assign(props.signInHref);
          });
      }}
    >
      {busy ? props.busyLabel : props.label}
    </Button>
  );
}
