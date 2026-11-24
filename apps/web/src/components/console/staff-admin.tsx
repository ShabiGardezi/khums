'use client';

import { useId, useState } from 'react';

import {
  GRANTABLE_STAFF_ROLES,
  isLegacyStaffRole,
  type ApiError,
  type GrantableStaffRole,
  type StaffAccount,
  type TemporaryCredentialResponse,
} from '@khums/api-client';
import type { Result } from '@khums/utils';
import { Alert, AlertDescription, AlertTitle } from '@khums/ui/components/alert';
import { Badge } from '@khums/ui/components/badge';

import { staffBrowserApi } from '@/components/admin/staff-browser-api';
import type { ConsoleContent } from '@/content/console/types';
import { formatMessage } from '@/i18n/format';

import { ActionForm, field, ReasonField } from './action-form';

const STATUSES = ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;
const inputClass =
  'border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none';

export interface StaffAdminProps {
  readonly accounts: readonly StaffAccount[];
  readonly marjas: readonly { readonly id: string; readonly name: string }[];
  readonly content: ConsoleContent;
  readonly localeTag: string;
}

/**
 * Staff account and role administration (M4.6.5; decision 64) on the M4.6.2b API. Only
 * Administrator (SUPER_ADMIN, every Marja) and Scholar (SCHOLAR, chosen Marjas) can be granted;
 * legacy roles are shown as legacy with "convert to Scholar" and "revoke". Changing a scholar's
 * Marjas is one audited replacement. The API applies every rule (no self-administration, Marja
 * scopes from the catalogue, no last-administrator lockout, the administrative-control setting)
 * and audits each change with its reason. A temporary password is shown once and never stored.
 */
export function StaffAdmin(props: StaffAdminProps) {
  const { content } = props;
  const s = content.staff;
  const [credential, setCredential] = useState<TemporaryCredentialResponse | null>(null);
  const when = new Intl.DateTimeFormat(props.localeTag, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const marjaName = (id: string) => props.marjas.find((m) => m.id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-8">
      {credential !== null && (
        <Alert variant="info">
          <AlertTitle>{s.credential.heading}</AlertTitle>
          <AlertDescription>
            <p>{s.credential.body}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt>{s.credential.username}</dt>
              <dd dir="ltr" className="text-start font-mono">
                {credential.username}
              </dd>
              <dt>{s.credential.password}</dt>
              <dd dir="ltr" className="text-start font-mono font-semibold">
                {credential.temporaryPassword}
              </dd>
              <dt>{s.credential.expires}</dt>
              <dd>{when.format(new Date(credential.temporaryPasswordExpiresAt))}</dd>
            </dl>
          </AlertDescription>
        </Alert>
      )}

      <section
        aria-labelledby="staff-create"
        className="bg-card flex flex-col gap-4 rounded-lg border p-4"
      >
        <h2 id="staff-create" className="text-lg font-semibold">
          {s.create.heading}
        </h2>
        <ActionForm
          submitLabel={s.create.submit}
          content={content.common}
          onSubmit={(data) =>
            staffBrowserApi().staffAccounts.create({
              username: field(data, 'username'),
              reason: field(data, 'reason'),
            })
          }
          onDone={setCredential}
        >
          <UsernameField label={s.create.username} />
          <ReasonField content={content.common} />
        </ActionForm>
      </section>

      <section aria-labelledby="staff-list" className="flex flex-col gap-4">
        <h2 id="staff-list" className="text-lg font-semibold">
          {s.list.heading}
        </h2>
        <ul className="flex flex-col gap-3">
          {props.accounts.map((account) => (
            <li key={account.principalId} className="bg-card rounded-lg border">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 p-4">
                  <span className="sr-only">
                    {formatMessage(s.list.manage, { username: account.username })}
                  </span>
                  <span aria-hidden="true" dir="ltr" className="font-mono font-semibold">
                    {account.username}
                  </span>
                  <Badge variant={account.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {s.statuses[account.status]}
                  </Badge>
                  {account.mustChangePassword && (
                    <Badge variant="info">{s.list.mustChangePassword}</Badge>
                  )}
                  <span className="text-muted-foreground text-sm">
                    {account.roles.length === 0
                      ? s.list.noRoles
                      : account.roles.map((r) => s.roles.names[r.role]).join(' · ')}
                  </span>
                </summary>
                <div className="flex flex-col gap-6 border-t p-4">
                  <RolesSection
                    account={account}
                    content={content}
                    marjas={props.marjas}
                    marjaName={marjaName}
                    when={when}
                  />
                  <section className="flex flex-col gap-3">
                    <h3 className="font-semibold">{s.actions.status}</h3>
                    <ActionForm
                      submitLabel={s.actions.setStatus}
                      content={content.common}
                      onSubmit={(data) =>
                        staffBrowserApi().staffAccounts.setStatus(account.principalId, {
                          status: field(data, 'status') as (typeof STATUSES)[number],
                          reason: field(data, 'reason'),
                        })
                      }
                    >
                      <SelectField
                        label={s.actions.newStatus}
                        name="status"
                        options={STATUSES.map((status) => ({
                          value: status,
                          label: s.statuses[status],
                        }))}
                      />
                      <ReasonField content={content.common} />
                    </ActionForm>
                  </section>
                  <div className="grid gap-6 md:grid-cols-3">
                    <ReasonAction
                      label={s.actions.resetPassword}
                      content={content}
                      onSubmit={(reason) =>
                        staffBrowserApi().staffAccounts.resetPassword(account.principalId, reason)
                      }
                      onDone={(value) => {
                        setCredential(value as TemporaryCredentialResponse);
                      }}
                    />
                    <ReasonAction
                      label={s.actions.revokeSessions}
                      content={content}
                      onSubmit={(reason) =>
                        staffBrowserApi().staffAccounts.revokeSessions(account.principalId, reason)
                      }
                    />
                    <ReasonAction
                      label={s.actions.clearThrottle}
                      content={content}
                      onSubmit={(reason) =>
                        staffBrowserApi().staffAccounts.clearThrottle(account.principalId, reason)
                      }
                    />
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const marjaScopeOf = (data: FormData) => ({
  kind: 'MARJA' as const,
  marjaIds: data.getAll('marja').filter((v): v is string => typeof v === 'string'),
});

function RolesSection(props: {
  readonly account: StaffAccount;
  readonly content: ConsoleContent;
  readonly marjas: StaffAdminProps['marjas'];
  readonly marjaName: (id: string) => string;
  readonly when: Intl.DateTimeFormat;
}) {
  const { account, content } = props;
  const r = content.staff.roles;
  const [grantRole, setGrantRole] = useState<GrantableStaffRole>('SCHOLAR');
  const api = () => staffBrowserApi().staffAccounts;
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-semibold">{r.heading}</h3>
      {account.roles.length === 0 ? (
        <p className="text-muted-foreground text-sm">{content.staff.list.noRoles}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {account.roles.map((role) => {
            const legacy = isLegacyStaffRole(role.role);
            return (
              <li
                key={role.assignmentId}
                className="flex flex-col gap-3 rounded-md border p-3 text-sm"
              >
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.names[role.role]}</span>
                  <span dir="ltr" className="text-muted-foreground font-mono text-xs">
                    {role.role}
                  </span>
                  {legacy && <Badge variant="warning">{r.legacy}</Badge>}
                </p>
                {legacy && (
                  <p className="text-muted-foreground text-xs">
                    {r.legacyHint}
                    {role.role === 'GOVERNING_SCHOLAR' && <> {r.legacyActsAsScholar}</>}
                  </p>
                )}
                <p>
                  {r.scope}:{' '}
                  {role.scope.kind === 'ALL'
                    ? r.scopeSummaryAll
                    : role.scope.marjaIds.map(props.marjaName).join(', ')}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatMessage(r.grantedBy, {
                    date: props.when.format(new Date(role.grantedAt)),
                  })}
                </p>
                {(role.role === 'SCHOLAR' || legacy) && (
                  <div className="rounded-md border p-3">
                    <ActionForm
                      submitLabel={legacy ? r.convert : r.changeMarjas}
                      content={content.common}
                      onSubmit={(data) =>
                        api().replaceRole(account.principalId, role.assignmentId, {
                          role: 'SCHOLAR',
                          scope: marjaScopeOf(data),
                          reason: field(data, 'reason'),
                        })
                      }
                    >
                      <MarjaChoices
                        content={content}
                        marjas={props.marjas}
                        checked={role.scope.marjaIds}
                      />
                      <ReasonField content={content.common} />
                    </ActionForm>
                  </div>
                )}
                <ActionForm
                  submitLabel={r.revoke}
                  variant="outline"
                  content={content.common}
                  onSubmit={(data) =>
                    api().revokeRole(account.principalId, role.assignmentId, field(data, 'reason'))
                  }
                >
                  <ReasonField content={content.common} />
                </ActionForm>
              </li>
            );
          })}
        </ul>
      )}
      <div className="rounded-md border p-3">
        <ActionForm
          submitLabel={r.grant}
          content={content.common}
          onSubmit={(data) =>
            api().grantRole(account.principalId, {
              role: grantRole,
              scope:
                grantRole === 'SUPER_ADMIN' ? { kind: 'ALL', marjaIds: [] } : marjaScopeOf(data),
              reason: field(data, 'reason'),
            })
          }
        >
          <SelectField
            label={r.role}
            name="role"
            value={grantRole}
            onChange={(value) => {
              setGrantRole(value === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'SCHOLAR');
            }}
            options={GRANTABLE_STAFF_ROLES.map((role) => ({ value: role, label: r.names[role] }))}
          />
          {grantRole === 'SUPER_ADMIN' ? (
            <p className="text-muted-foreground text-xs">{r.superAdminHint}</p>
          ) : (
            <MarjaChoices content={content} marjas={props.marjas} checked={[]} />
          )}
          <ReasonField content={content.common} />
        </ActionForm>
      </div>
    </section>
  );
}

/** Marja checkboxes (catalogue Marjas); the API refuses an empty or unknown selection. */
function MarjaChoices(props: {
  readonly content: ConsoleContent;
  readonly marjas: StaffAdminProps['marjas'];
  readonly checked: readonly string[];
}) {
  const r = props.content.staff.roles;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{r.marjas}</legend>
      <p className="text-muted-foreground text-xs">{r.marjasHint}</p>
      <div className="grid gap-1 sm:grid-cols-2">
        {props.marjas.map((marja) => (
          <label key={marja.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="marja"
              value={marja.id}
              defaultChecked={props.checked.includes(marja.id)}
            />
            {marja.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ReasonAction(props: {
  readonly label: string;
  readonly content: ConsoleContent;
  readonly onSubmit: (reason: string) => Promise<Result<unknown, ApiError>>;
  readonly onDone?: (value: unknown) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <h3 className="text-sm font-semibold">{props.label}</h3>
      <ActionForm<unknown>
        submitLabel={props.label}
        variant="outline"
        content={props.content.common}
        onSubmit={(data) => props.onSubmit(field(data, 'reason'))}
        {...(props.onDone === undefined ? {} : { onDone: props.onDone })}
      >
        <ReasonField content={props.content.common} />
      </ActionForm>
    </div>
  );
}

function UsernameField(props: { readonly label: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {props.label}
      </label>
      <input
        id={id}
        name="username"
        required
        maxLength={200}
        autoComplete="off"
        dir="ltr"
        className={inputClass}
      />
    </div>
  );
}

export function SelectField(props: {
  readonly label: string;
  readonly name: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  /** Controlled value (optional); otherwise the select is uncontrolled. */
  readonly value?: string;
  readonly onChange?: (value: string) => void;
}) {
  const id = useId();
  const controlled =
    props.value === undefined
      ? {}
      : {
          value: props.value,
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
            props.onChange?.(event.target.value),
        };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {props.label}
      </label>
      <select id={id} name={props.name} required className={inputClass} {...controlled}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
