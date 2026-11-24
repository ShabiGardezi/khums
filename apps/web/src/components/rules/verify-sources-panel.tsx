'use client';

import { useId } from 'react';

import { RULE_VERIFICATION_ATTESTATIONS } from '@khums/core';
import type { RuleVerificationStatusResponse } from '@khums/api-client';
import { Alert, AlertDescription } from '@khums/ui/components/alert';

import { staffBrowserApi } from '@/components/admin/staff-browser-api';
import { ActionForm, ReasonField } from '@/components/console/action-form';
import type { ConsoleContent } from '@/content/console/types';
import type { RulesContent } from '@/content/rules/types';
import { formatMessage } from '@/i18n/format';

/** The localized reason of a blocker code (the code itself when it is not a known one). */
const blockerText = (texts: Readonly<Record<string, string>>, code: string): string =>
  Object.hasOwn(texts, code) ? (texts[code] ?? code) : code;

/**
 * "Verify sources" (Phase 2 step 5; decisions 63 and 67): the public status of the rule, the
 * preconditions with their reasons, the four explicit attestations for the CURRENT revision, and
 * the verification history. Recording a verification approves that revision and publishes a new
 * version automatically; the API decides who may verify and re-checks every precondition.
 */
export function VerifySourcesPanel(props: {
  readonly ruleId: string;
  readonly status: RuleVerificationStatusResponse;
  readonly rules: RulesContent;
  readonly common: ConsoleContent['common'];
}) {
  const { status } = props;
  const v = props.rules.verification;
  const notesId = useId();
  const blocked = status.blockers.length > 0;
  const revision = String(status.currentRevision);
  return (
    <section aria-labelledby="rule-verify" className="flex flex-col gap-4">
      <h2 id="rule-verify" className="text-lg font-semibold">
        {v.heading}
      </h2>
      <p className="text-muted-foreground text-sm">{v.description}</p>

      <div className="flex flex-col gap-2" aria-labelledby="rule-public-status">
        <h3 id="rule-public-status" className="font-medium">
          {v.publicStatus}
        </h3>
        <p data-testid="rule-public-status" className="text-sm">
          {status.publicStatus.status === 'NOT_PUBLIC'
            ? v.notPublic
            : formatMessage(status.publicStatus.status === 'LIVE' ? v.live : v.suspended, {
                version: status.publicStatus.version ?? '',
                revision: String(status.publicStatus.liveRevision ?? ''),
                date: status.publicStatus.activatedAt ?? '',
              })}
        </p>
        {status.publicStatus.status === 'SUSPENDED' && (
          // BLD-01: the version is not served; staff see each affected rule and why.
          <Alert variant="warning">
            <AlertDescription>
              <ul className="flex flex-col gap-2" data-testid="rule-suspension">
                {status.publicStatus.suspendedRules.map((rule) => (
                  <li key={rule.ruleId}>
                    <p>{formatMessage(v.suspendedRule, { rule: rule.ruleId })}</p>
                    <ul className="ps-4">
                      {rule.codes.map((code) => (
                        <li key={code}>
                          <code dir="ltr" className="text-xs">
                            {code}
                          </code>{' '}
                          {blockerText({ ...v.suspensionCodes, ...v.blockers }, code)}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {status.publicStatus.liveRevision !== null &&
          status.publicStatus.liveRevision !== status.currentRevision && (
            // BLD-03: a corrected rule's old revision stays public until the new one is verified.
            <p
              data-testid="rule-revision-pending"
              className="text-warning-strong text-sm font-medium"
            >
              {formatMessage(v.revisionPending, {
                live: String(status.publicStatus.liveRevision),
                current: revision,
              })}
            </p>
          )}
        <p data-testid="rule-current-verified" className="text-sm">
          {formatMessage(status.currentVerified ? v.currentVerified : v.currentNotVerified, {
            revision,
          })}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">{v.preconditions}</h3>
        {blocked ? (
          <ul className="flex flex-col gap-2" data-testid="verification-blockers">
            {status.blockers.map((b) => (
              <li
                key={`${b.code}-${b.entityId ?? ''}`}
                className="border-warning bg-card rounded-md border p-3 text-sm"
              >
                <p>
                  <code dir="ltr" className="text-xs">
                    {b.code}
                  </code>{' '}
                  {blockerText(v.blockers, b.code)}
                </p>
                {b.entityType !== null && b.entityId !== null && (
                  <p className="text-muted-foreground">
                    {formatMessage(v.record, {
                      type: v.entityTypes[b.entityType],
                      id: b.entityId,
                      state: b.state ?? '—',
                    })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">{v.ready}</p>
        )}
      </div>

      {!status.canVerify ? (
        <Alert variant="info">
          <AlertDescription>{v.cannotVerify}</AlertDescription>
        </Alert>
      ) : blocked ? (
        <Alert variant="warning">
          <AlertDescription>{v.blockedNote}</AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          {status.preview !== null && (
            <PublicationPreview preview={status.preview} rules={props.rules} />
          )}
          <h3 className="font-medium">{v.formHeading}</h3>
          <p className="text-muted-foreground text-sm">{v.automatic}</p>
          <p className="text-muted-foreground text-sm">{v.aiNote}</p>
          <ActionForm
            submitLabel={v.submit}
            content={props.common}
            onSubmit={(data) => {
              const notes = data.get('notes');
              const reason = data.get('reason');
              return staffBrowserApi().rules.verify(props.ruleId, {
                revision: status.currentRevision,
                // Each box is `required`: the form cannot be sent unless all four are ticked.
                attestations: {
                  sourcesAuthentic: data.get('sourcesAuthentic') === 'on',
                  originalTextMatches: data.get('originalTextMatches') === 'on',
                  translationAccurate: data.get('translationAccurate') === 'on',
                  attributionCorrect: data.get('attributionCorrect') === 'on',
                } as {
                  sourcesAuthentic: true;
                  originalTextMatches: true;
                  translationAccurate: true;
                  attributionCorrect: true;
                },
                notes: typeof notes === 'string' && notes.trim() !== '' ? notes.trim() : null,
                reason: typeof reason === 'string' ? reason : '',
              });
            }}
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">{v.attestationsLegend}</legend>
              {RULE_VERIFICATION_ATTESTATIONS.map((key) => (
                <label key={key} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name={key} required className="mt-1" />
                  <span>{v.attestations[key]}</span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-1">
              <label htmlFor={notesId} className="text-sm font-medium">
                {v.notes}
              </label>
              <textarea
                id={notesId}
                name="notes"
                maxLength={2000}
                rows={3}
                aria-describedby={`${notesId}-hint`}
                className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
              <p id={`${notesId}-hint`} className="text-muted-foreground text-xs">
                {v.notesHint}
              </p>
            </div>
            <ReasonField content={props.common} />
          </ActionForm>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">{v.history}</h3>
        {status.history.length === 0 ? (
          <p className="text-muted-foreground text-sm">{v.noHistory}</p>
        ) : (
          <ol className="flex flex-col gap-2" data-testid="verification-history">
            {[...status.history].reverse().map((h) => (
              <li key={h.verificationId} className="bg-card rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {formatMessage(v.historyItem, { revision: String(h.revision) })}
                </p>
                <dl className="grid gap-1 sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted-foreground">{v.by}</dt>
                  <dd>
                    <code dir="ltr">{h.actor}</code>
                  </dd>
                  <dt className="text-muted-foreground">{v.at}</dt>
                  <dd>
                    <time dir="ltr" dateTime={h.at}>
                      {h.at}
                    </time>
                  </dd>
                  <dt className="text-muted-foreground">{v.reason}</dt>
                  <dd dir="auto">{h.reason}</dd>
                  {h.notes !== null && (
                    <>
                      <dt className="text-muted-foreground">{v.notesLabel}</dt>
                      <dd dir="auto">{h.notes}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">{v.publicStatus}</dt>
                  <dd>{formatMessage(v.published, { version: h.publication.version })}</dd>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

/**
 * BLD-03: before a verification is recorded, exactly which rules the next version will include,
 * which it will withhold (with the reason) and which public rules it would remove. Nothing is
 * dropped from public use silently.
 */
function PublicationPreview(props: {
  readonly preview: NonNullable<RuleVerificationStatusResponse['preview']>;
  readonly rules: RulesContent;
}) {
  const p = props.rules.verification.preview;
  const { preview } = props;
  const item = (rule: { ruleId: string; revision: number }) =>
    formatMessage(p.item, { rule: rule.ruleId, revision: String(rule.revision) });
  const reason = (code: string) => blockerText(p.reasons, code);
  return (
    <section
      aria-labelledby="rule-preview"
      data-testid="publication-preview"
      className="bg-muted/40 flex flex-col gap-2 rounded-md p-3 text-sm"
    >
      <h3 id="rule-preview" className="font-medium">
        {p.heading}
      </h3>
      <p className="text-muted-foreground">
        {formatMessage(p.description, { version: preview.nextVersion })}
      </p>
      <h4 className="font-medium">{p.included}</h4>
      <ul className="ps-4">
        {preview.included.map((rule) => (
          <li key={rule.ruleId}>{item(rule)}</li>
        ))}
      </ul>
      {preview.withheld.length > 0 && (
        <>
          <h4 className="font-medium">{p.withheld}</h4>
          <ul className="ps-4">
            {preview.withheld.map((rule) => (
              <li key={rule.ruleId}>
                {item(rule)}: {reason(rule.reason)}
              </li>
            ))}
          </ul>
        </>
      )}
      <h4 className="font-medium">{p.removed}</h4>
      {preview.removedFromPublic.length === 0 ? (
        <p>{p.noneRemoved}</p>
      ) : (
        <ul className="ps-4" data-testid="preview-removed">
          {preview.removedFromPublic.map((ruleId) => (
            <li key={ruleId}>
              <code dir="ltr" className="text-xs">
                {ruleId}
              </code>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
