'use client';

import { useId } from 'react';

import type { GovernanceCommandPath, GovernancePackVersion } from '@khums/api-client';

import { staffBrowserApi } from '@/components/admin/staff-browser-api';
import type { ConsoleContent } from '@/content/console/types';

import { ActionForm, field, ReasonField } from './action-form';
import { fileText, invalidFile, parsePackFile } from './pack-file';
import { SelectField } from './staff-admin';

/** Command → the permission that may attempt it (informational; the API decides). */
const COMMANDS: readonly {
  readonly path: GovernanceCommandPath;
  readonly permission: string;
  readonly fields: 'none' | 'evidence' | 'withdraw' | 'supersede' | 'file' | 'emergency' | 'bind';
}[] = [
  { path: 'submit', permission: 'governance.submit', fields: 'file' },
  { path: 'review/start', permission: 'governance.review.start', fields: 'none' },
  {
    path: 'review/request-changes',
    permission: 'governance.review.requestChanges',
    fields: 'evidence',
  },
  { path: 'review/complete', permission: 'governance.review.complete', fields: 'evidence' },
  { path: 'approve', permission: 'governance.approve', fields: 'evidence' },
  { path: 'publish', permission: 'governance.publish', fields: 'none' },
  { path: 'activate', permission: 'governance.activate', fields: 'none' },
  { path: 'withdraw', permission: 'governance.withdraw', fields: 'withdraw' },
  { path: 'supersede', permission: 'governance.supersede', fields: 'supersede' },
  // M5.2.1: administrators only (a published version; reason required).
  { path: 'emergency-withdraw', permission: 'governance.withdraw.emergency', fields: 'emergency' },
  // M5.2.1: only for a legacy version without a recorded policy.
  { path: 'bind-policy', permission: 'governance.policy.bindLegacy', fields: 'bind' },
];

const WITHDRAW_REASONS = [
  'ERROR_FOUND',
  'SOURCE_INVALIDATED',
  'REVIEW_ABANDONED',
  'OTHER',
] as const;
const inputClass =
  'border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none';

/**
 * Lifecycle commands for one governance pack version (M4.6.5). Every command carries the ledger
 * length shown (`expectedSequence`), so a changed ledger is refused; roles, Marja scope,
 * separation of duties, the bound policy and the publication gates are decided by the API.
 */
export function GovernanceCommands(props: {
  readonly pack: GovernancePackVersion;
  readonly permissions: readonly string[];
  readonly content: ConsoleContent;
}) {
  const { pack, content } = props;
  const g = content.governance.commands;
  const labels: Readonly<Record<GovernanceCommandPath, string>> = {
    submit: g.resubmit,
    'review/start': g.startReview,
    'review/request-changes': g.requestChanges,
    'review/complete': g.completeReview,
    approve: g.approve,
    publish: g.publish,
    activate: g.activate,
    withdraw: g.withdraw,
    supersede: g.supersede,
    'emergency-withdraw': g.emergencyWithdraw,
    'bind-policy': g.bindPolicy,
  };
  const legacy = pack.policySource === 'LEGACY_UNRECORDED';
  const available = COMMANDS.filter(
    (c) =>
      props.permissions.includes(c.permission) &&
      (c.fields !== 'bind' || legacy) &&
      (c.fields !== 'emergency' || pack.state === 'PUBLISHED'),
  );
  const call = (path: GovernanceCommandPath, body: Record<string, unknown>) =>
    staffBrowserApi().governance.command(pack.packId, pack.version, path, {
      expectedSequence: pack.expectedSequence,
      ...body,
    });

  return (
    <section aria-labelledby="gov-commands" className="flex flex-col gap-4">
      <h2 id="gov-commands" className="text-lg font-semibold">
        {g.heading}
      </h2>
      <p className="text-muted-foreground text-sm">{g.note}</p>
      {legacy && <p className="text-sm font-medium">{g.legacyNotice}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {available.map((command) => (
          <div key={command.path} className="bg-card flex flex-col gap-2 rounded-lg border p-4">
            <h3 className="font-semibold">{labels[command.path]}</h3>
            <ActionForm
              submitLabel={labels[command.path]}
              variant={
                command.path === 'withdraw' || command.path === 'emergency-withdraw'
                  ? 'destructive'
                  : 'primary'
              }
              content={content.common}
              onSubmit={async (data) => {
                switch (command.fields) {
                  case 'none':
                    return call(command.path, {});
                  case 'evidence':
                    return call(command.path, { evidence: { reference: field(data, 'evidence') } });
                  case 'withdraw':
                    return call(command.path, { reason: field(data, 'withdrawReason') });
                  case 'emergency':
                    return call(command.path, {
                      reason: field(data, 'withdrawReason'),
                      note: field(data, 'reason'),
                    });
                  case 'bind':
                    return call(command.path, { reason: field(data, 'reason') });
                  case 'supersede':
                    return call(command.path, {
                      successorVersion: field(data, 'successorVersion'),
                    });
                  case 'file': {
                    const file = parsePackFile(await fileText(data));
                    if (file.kind === 'INVALID') return invalidFile();
                    return call(command.path, { pack: file.pack });
                  }
                }
              }}
            >
              {command.fields === 'evidence' && (
                <TextField label={g.evidence} hint={g.evidenceHint} name="evidence" />
              )}
              {command.fields === 'emergency' && (
                <>
                  <p className="text-muted-foreground text-sm">{g.emergencyNote}</p>
                  <SelectField
                    label={g.withdrawReason}
                    name="withdrawReason"
                    options={WITHDRAW_REASONS.map((r) => ({
                      value: r,
                      label: g.withdrawReasons[r],
                    }))}
                  />
                  <ReasonField content={content.common} />
                </>
              )}
              {command.fields === 'bind' && <ReasonField content={content.common} />}
              {command.fields === 'withdraw' && (
                <SelectField
                  label={g.withdrawReason}
                  name="withdrawReason"
                  options={WITHDRAW_REASONS.map((r) => ({ value: r, label: g.withdrawReasons[r] }))}
                />
              )}
              {command.fields === 'supersede' && (
                <TextField
                  label={g.successorVersion}
                  name="successorVersion"
                  pattern="\d+\.\d+\.\d+"
                />
              )}
              {command.fields === 'file' && <FileField label={g.file} hint={g.fileHint} />}
            </ActionForm>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TextField(props: {
  readonly label: string;
  readonly name: string;
  readonly hint?: string;
  readonly pattern?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {props.label}
      </label>
      <input
        id={id}
        name={props.name}
        required
        maxLength={500}
        dir="ltr"
        {...(props.pattern === undefined ? {} : { pattern: props.pattern })}
        {...(props.hint === undefined ? {} : { 'aria-describedby': `${id}-hint` })}
        className={inputClass}
      />
      {props.hint !== undefined && (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {props.hint}
        </p>
      )}
    </div>
  );
}

export function FileField(props: { readonly label: string; readonly hint: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {props.label}
      </label>
      <input
        id={id}
        name="file"
        type="file"
        accept="application/json,.json"
        required
        aria-describedby={`${id}-hint`}
        className="text-sm file:me-3 file:rounded-md file:border file:px-3 file:py-1.5"
      />
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
        {props.hint}
      </p>
    </div>
  );
}
