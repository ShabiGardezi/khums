'use client';

import type { GovernancePolicyRegistryResponse } from '@khums/api-client';
import { Alert, AlertDescription } from '@khums/ui/components/alert';

import { staffBrowserApi } from '@/components/admin/staff-browser-api';
import type { ConsoleContent } from '@/content/console/types';
import { formatMessage } from '@/i18n/format';

import { ActionForm, field, ReasonField } from './action-form';
import { SelectField } from './staff-admin';
import { ScrollRegion } from './scroll-region';

const POLICIES = ['INDEPENDENT_REVIEW_V1', 'SINGLE_SCHOLAR_V1'] as const;
type AssignablePolicy = (typeof POLICIES)[number];
const assignableOrNull = (policy: string | null): AssignablePolicy | null =>
  POLICIES.find((p) => p === policy) ?? null;
type Policy = (typeof POLICIES)[number];

/**
 * Per-Marja governance policies (M4.6.5): one administrator proposes, a different one confirms
 * exactly the pending proposal (the API refuses self-confirmation and stale views). Process
 * configuration only; it grants no religious authority.
 */
export function PolicyAdmin(props: {
  readonly registry: GovernancePolicyRegistryResponse;
  readonly marjaName: Readonly<Record<string, string>>;
  readonly content: ConsoleContent;
}) {
  const { registry, content } = props;
  const p = content.policies;
  const name = (id: string) => props.marjaName[id] ?? id;
  const pending = registry.pending;
  return (
    <div className="flex flex-col gap-8">
      <Alert variant="info">
        <AlertDescription>{p.note}</AlertDescription>
      </Alert>
      <ScrollRegion label={p.title}>
        <table className="w-full text-start text-sm">
          <thead className="bg-muted">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                {p.marja}
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                {p.policy}
              </th>
            </tr>
          </thead>
          <tbody>
            {registry.policies.map((row) => (
              <tr key={row.marjaId} className="border-t">
                <td className="px-3 py-2">{name(row.marjaId)}</td>
                <td className="px-3 py-2">{p.names[row.policy]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>

      <section
        aria-labelledby="policy-pending"
        className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      >
        <h2 id="policy-pending" className="text-lg font-semibold">
          {p.pending.heading}
        </h2>
        {pending === null ? (
          <p className="text-muted-foreground text-sm">{p.pending.none}</p>
        ) : (
          <>
            <p>
              {formatMessage(p.pending.change, {
                marja: name(pending.marjaId),
                from: pending.previousPolicy === null ? '—' : p.names[pending.previousPolicy],
                to: p.names[pending.newPolicy],
              })}
            </p>
            <p className="text-sm">
              {p.pending.proposedBy}:{' '}
              <code dir="ltr" className="text-xs">
                {pending.proposedBy}
              </code>
            </p>
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">{pending.reason}</p>
            <ActionForm
              submitLabel={p.pending.confirm}
              content={content.common}
              onSubmit={() =>
                staffBrowserApi().governance.confirmPolicy({
                  proposalRecordId: pending.proposalRecordId,
                  marjaId: pending.marjaId,
                  // The registry never holds the rule-builder policy (decision 67); the server
                  // refuses anything else, so a narrowed value is only a type-level statement.
                  previousPolicy: assignableOrNull(pending.previousPolicy),
                  newPolicy: assignableOrNull(pending.newPolicy) ?? 'INDEPENDENT_REVIEW_V1',
                  reason: pending.reason,
                  proposalRequestId: pending.proposalRequestId,
                })
              }
            />
          </>
        )}
      </section>

      <section
        aria-labelledby="policy-propose"
        className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      >
        <h2 id="policy-propose" className="text-lg font-semibold">
          {p.propose.heading}
        </h2>
        <ActionForm
          submitLabel={p.propose.submit}
          content={content.common}
          onSubmit={(data) =>
            staffBrowserApi().governance.proposePolicy({
              marjaId: field(data, 'marjaId'),
              newPolicy: field(data, 'newPolicy') as Policy,
              reason: field(data, 'reason'),
            })
          }
        >
          <SelectField
            label={p.marja}
            name="marjaId"
            options={registry.policies.map((row) => ({
              value: row.marjaId,
              label: name(row.marjaId),
            }))}
          />
          <SelectField
            label={p.propose.newPolicy}
            name="newPolicy"
            options={POLICIES.map((policy) => ({ value: policy, label: p.names[policy] }))}
          />
          <ReasonField content={content.common} />
        </ActionForm>
      </section>
    </div>
  );
}
