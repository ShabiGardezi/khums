'use client';

import { useId } from 'react';

import type { RuleRequestListResponse } from '@khums/api-client';
import { RULE_REQUEST_KINDS } from '@khums/core';

import { staffBrowserApi } from '@/components/admin/staff-browser-api';
import { ActionForm } from '@/components/console/action-form';
import type { ConsoleContent } from '@/content/console/types';
import type { RulesContent } from '@/content/rules/types';

const fieldClass =
  'border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none';

/**
 * Scholar requests (Phase 4): ask for a missing rule or a calculation change, and resolve a
 * request once with a note. The request text is shown to staff of the Marja only; the API never
 * logs or audits it.
 */
export function RuleRequestsPanel(props: {
  readonly list: RuleRequestListResponse;
  /** The Marja's rules for the optional "about this rule" choice. */
  readonly ruleOptions: readonly { readonly ruleId: string; readonly label: string }[];
  readonly rules: RulesContent;
  readonly common: ConsoleContent['common'];
}) {
  const q = props.rules.requests;
  const kindId = useId();
  const ruleId = useId();
  const messageId = useId();
  return (
    <section aria-labelledby="rule-requests" className="flex flex-col gap-3">
      <h2 id="rule-requests" className="text-lg font-semibold">
        {q.heading}
      </h2>
      <p className="text-muted-foreground text-sm">{q.description}</p>
      {props.list.canCreate && (
        <ActionForm
          submitLabel={q.submit}
          content={props.common}
          onSubmit={(data) => {
            const rule = data.get('ruleId');
            const kind = data.get('kind');
            const message = data.get('message');
            return staffBrowserApi().rules.createRequest({
              marjaId: props.list.marjaId,
              kind: kind === 'CALCULATION_CHANGE' ? 'CALCULATION_CHANGE' : 'MISSING_RULE',
              ruleId: typeof rule === 'string' && rule !== '' ? rule : null,
              message: typeof message === 'string' ? message : '',
            });
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={kindId} className="text-sm font-medium">
              {q.kind}
            </label>
            <select id={kindId} name="kind" className={fieldClass} defaultValue="MISSING_RULE">
              {RULE_REQUEST_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {q.kinds[kind]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ruleId} className="text-sm font-medium">
              {q.rule}
            </label>
            <select id={ruleId} name="ruleId" className={fieldClass} defaultValue="">
              <option value="">{q.ruleNone}</option>
              {props.ruleOptions.map((o) => (
                <option key={o.ruleId} value={o.ruleId}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={messageId} className="text-sm font-medium">
              {q.message}
            </label>
            <textarea
              id={messageId}
              name="message"
              required
              minLength={3}
              maxLength={5000}
              rows={4}
              dir="auto"
              className={fieldClass}
            />
          </div>
        </ActionForm>
      )}
      {props.list.requests.length === 0 ? (
        <p className="text-muted-foreground text-sm">{q.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="rule-requests">
          {props.list.requests.map((r) => (
            <li
              key={r.requestId}
              className="bg-card flex flex-col gap-2 rounded-lg border p-3 text-sm"
            >
              <p className="font-medium">
                {q.kinds[r.kind]} · {r.resolution === null ? q.open : q.resolved}
              </p>
              {r.ruleId !== null && (
                <p className="text-muted-foreground text-xs">
                  {q.rule}: <code dir="ltr">{r.ruleId}</code>
                </p>
              )}
              <p dir="auto" className="whitespace-pre-wrap">
                {r.message}
              </p>
              <p className="text-muted-foreground text-xs">
                <code dir="ltr">{r.actor}</code> ·{' '}
                <time dir="ltr" dateTime={r.at}>
                  {r.at}
                </time>
              </p>
              {r.resolution !== null && (
                <p className="text-xs" dir="auto">
                  {q.resolution}: {r.resolution.note}
                </p>
              )}
              {r.resolution === null && props.list.canResolve && (
                <ActionForm
                  submitLabel={q.resolveSubmit}
                  variant="outline"
                  content={props.common}
                  className="flex flex-col gap-2"
                  onSubmit={(data) => {
                    const note = data.get('note');
                    return staffBrowserApi().rules.resolveRequest(r.requestId, {
                      note: typeof note === 'string' ? note : '',
                    });
                  }}
                >
                  <label className="flex flex-col gap-1 text-xs font-medium">
                    {q.resolveNote}
                    <input
                      name="note"
                      required
                      minLength={3}
                      maxLength={2000}
                      dir="auto"
                      className={fieldClass}
                    />
                  </label>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
