'use client';

import { useState, type SyntheticEvent } from 'react';

import { Alert, AlertDescription } from '@khums/ui/components/alert';
import { Button } from '@khums/ui/components/button';
import { Field } from '@khums/ui/components/field';
import { Input } from '@khums/ui/components/input';

import type { AdminContent } from '@/content/admin/types';
import { useHydrated } from '@/lib/use-hydrated';

import { formText as text, problemCode, staffBrowserApi } from './staff-browser-api';

/**
 * Password change (M4.6.2b). The API checks the policy, refuses reuse of the current (or
 * temporary) password, revokes every session and issues a new one.
 */
export function PasswordForm(props: {
  readonly content: AdminContent['passwordPage'];
  readonly consoleHref: string;
  readonly signInHref: string;
}) {
  const { content } = props;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Disabled until hydrated: no early submission before the handler exists (M5.2.1).
  const hydrated = useHydrated();

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const newPassword = text(data, 'newPassword');
    if (newPassword !== text(data, 'confirmPassword')) {
      setError(content.mismatch);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await staffBrowserApi().staff.changePassword({
      currentPassword: text(data, 'currentPassword'),
      newPassword,
    });
    if (result.ok) {
      window.location.assign(props.consoleHref);
      return;
    }
    setBusy(false);
    switch (problemCode(result.error)) {
      case 'INVALID_CREDENTIALS':
        setError(content.invalidCurrent);
        break;
      case 'PASSWORD_POLICY_VIOLATION':
      case 'VALIDATION_FAILED':
        setError(content.policy);
        break;
      case 'PASSWORD_REUSED':
        setError(content.reused);
        break;
      case 'LOGIN_THROTTLED':
        setError(content.throttled);
        break;
      case 'AUTHENTICATION_REQUIRED':
      case 'REAUTHENTICATION_REQUIRED':
      case 'SESSION_REVOKED':
        window.location.assign(props.signInHref);
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
      <Field label={content.current} required>
        <Input name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label={content.next} description={content.rules} required>
        <Input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
      </Field>
      <Field label={content.confirm} required>
        <Input name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <div>
        <Button type="submit" disabled={busy || !hydrated}>
          {busy ? content.submitting : content.submit}
        </Button>
      </div>
    </form>
  );
}
