'use client';

import type { BuilderRuleContent } from '@khums/core';

import { staffBrowserApi } from '@/components/admin/staff-browser-api';
import { ActionForm, ReasonField } from '@/components/console/action-form';
import type { ConsoleContent } from '@/content/console/types';
import type { RulesContent } from '@/content/rules/types';

/**
 * "Reject this rule" (Phase 4): saves a new revision with the current content marked rejected, so
 * the rule is left out of every test and public calculation. History is kept; a later revision
 * replaces it. The API decides who may do this and audits it.
 */
export function RejectRulePanel(props: {
  readonly ruleId: string;
  readonly expectedRevision: number;
  readonly content: BuilderRuleContent;
  readonly rules: RulesContent;
  readonly common: ConsoleContent['common'];
}) {
  const p = props.rules.preparation;
  return (
    <section aria-labelledby="rule-reject" className="flex flex-col gap-2">
      <h2 id="rule-reject" className="text-lg font-semibold">
        {p.rejectHeading}
      </h2>
      <p className="text-muted-foreground text-sm">{p.rejectDescription}</p>
      <ActionForm
        submitLabel={p.rejectSubmit}
        variant="destructive"
        content={props.common}
        onSubmit={(data) => {
          const reason = data.get('reason');
          return staffBrowserApi().rules.revise(props.ruleId, {
            expectedRevision: props.expectedRevision,
            content: props.content,
            reason: typeof reason === 'string' ? reason : '',
            rejected: true,
          });
        }}
      >
        <ReasonField content={props.common} />
      </ActionForm>
    </section>
  );
}
