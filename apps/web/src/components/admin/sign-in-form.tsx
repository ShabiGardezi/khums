'use client';

import { useState, type SyntheticEvent } from 'react';

import { Alert, AlertDescription } from '@khums/ui/components/alert';
import { Button } from '@khums/ui/components/button';
import { Field } from '@khums/ui/components/field';
import { Input } from '@khums/ui/components/input';

import type { AdminContent } from '@/content/admin/types';
import { useHydrated } from '@/lib/use-hydrated';

import { formText as text, problemCode, staffBrowserApi } from './staff-browser-api';

/** Staff sign-in (M4.6.2b). Credentials go only to the API, in the request body, once. */
export function SignInForm(props: {
  readonly content: AdminContent['signInPage'];
  readonly consoleHref: string;
  readonly passwordHref: string;
}) {
  const { content } = props;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Disabled until hydrated: no early submission before the handler exists (M5.2.1).
  const hydrated = useHydrated();

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const result = await staffBrowserApi().staff.login({
      username: text(data, 'username'),
      password: text(data, 'password'),
    });
    if (result.ok) {
      // A full navigation, so the server renders with the new session cookie.
      window.location.assign(
        result.value.mustChangePassword ? props.passwordHref : props.consoleHref,
      );
      return;
    }
    setBusy(false);
    switch (problemCode(result.error)) {
      case 'INVALID_CREDENTIALS':
      case 'VALIDATION_FAILED':
        setError(content.invalidCredentials);
        break;
      case 'LOGIN_THROTTLED':
        setError(content.throttled);
        break;
      case 'ACCOUNT_NOT_ACTIVE':
        setError(content.accountNotActive);
        break;
      case 'TEMPORARY_PASSWORD_EXPIRED':
        setError(content.temporaryExpired);
        break;
      case 'CSRF_REJECTED':
        setError(content.refused);
        break;
      case null:
      default:
        setError(content.unavailable);
    }
  }

  return (
    <form
      // Never a native GET: before hydration the fields must not end up in the URL.
      method="post"
      className="flex max-w-sm flex-col gap-4"
      onSubmit={(event) => void onSubmit(event)}
      noValidate
    >
      {error !== null && (
        <Alert variant="destructive" live="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Field label={content.username} required>
        <Input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </Field>
      <Field label={content.password} required>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div>
        <Button type="submit" disabled={busy || !hydrated}>
          {busy ? content.submitting : content.submit}
        </Button>
      </div>
    </form>
  );
}
