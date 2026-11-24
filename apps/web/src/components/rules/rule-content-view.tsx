import type { BuilderEntryRef, BuilderRuleContent, BuilderTreatment } from '@khums/core';

import type { FactsContent } from '@/content/facts/types';
import { formatMessage } from '@/i18n/format';
import type { RulesContent } from '@/content/rules/types';

/**
 * A rule's content, read-only (decision 79): what it counts and deducts, its confirmations and
 * exceptions, its research ruling and sources. Scholars read it here and test it below; changes
 * are made by the owner in code. Server Component.
 */
export function RuleContentView(props: {
  readonly content: BuilderRuleContent;
  readonly rules: RulesContent;
  readonly facts: Pick<FactsContent, 'kinds' | 'subtypes'>;
  /** The cited sources by title and location (from the API; never internal ids). */
  readonly sources: readonly {
    readonly refId: string;
    readonly title: string;
    readonly url: string | null;
    readonly locator: string | null;
  }[];
  /** The research ruling's summary, or null. */
  readonly ruling: string | null;
}) {
  const { content, rules: r } = props;
  const f = r.form;
  const entry = (ref: BuilderEntryRef) => {
    const sub = (props.facts.subtypes[ref.kind] as Readonly<Record<string, string>>)[ref.subtype];
    return `${props.facts.kinds[ref.kind].label}: ${sub ?? ref.subtype}`;
  };
  const list = (refs: readonly BuilderEntryRef[]) => refs.map(entry).join(' · ');
  // Decision 82: a "count it as" treatment, in words (never codes).
  const treatmentText = (t: BuilderTreatment) =>
    [
      t.askedLabel === undefined
        ? f.treatmentEntered
        : formatMessage(f.treatmentAsked, { label: t.askedLabel }),
      t.inflation === 'ADDED' ? f.treatmentInflation : null,
      t.portion === undefined
        ? null
        : 'fixedPercent' in t.portion
          ? formatMessage(f.treatmentFixedPortion, { percent: t.portion.fixedPercent })
          : formatMessage(f.treatmentAskedPortion, { label: t.portion.askedLabel }),
      t.khumsShare === undefined
        ? null
        : formatMessage(f.treatmentShare, {
            numerator: String(t.khumsShare.numerator),
            denominator: String(t.khumsShare.denominator),
          }),
    ]
      .filter((part): part is string => part !== null)
      .join('; ');
  return (
    <section aria-labelledby="rule-content" className="flex flex-col gap-3 text-sm">
      <h2 id="rule-content" className="text-lg font-semibold">
        {r.detail.content}
      </h2>
      <dl className="grid gap-2 sm:grid-cols-[minmax(8rem,auto)_1fr]">
        {content.rate !== null && (
          <>
            <dt className="font-medium">{f.rate}</dt>
            <dd dir="ltr" className="text-start">
              {content.rate}%
            </dd>
          </>
        )}
        <dt className="font-medium">{f.included}</dt>
        <dd>{list(content.includedEntries)}</dd>
        {content.deductions.length > 0 && (
          <>
            <dt className="font-medium">{f.deductions}</dt>
            <dd>
              <ul className="flex flex-col gap-1">
                {content.deductions.map((d) => (
                  <li key={d.type}>
                    <span className="font-medium">{r.deductionTypes[d.type]}</span>:{' '}
                    {list(d.entries)}
                    {d.against !== undefined && (
                      <span className="text-muted-foreground block">
                        {f.deductionAgainst}: {list(d.against)}
                      </span>
                    )}
                    {d.inflation !== undefined && (
                      <span className="text-muted-foreground block">
                        {d.inflation === 'ADDED'
                          ? f.deductionInflationAdded
                          : f.deductionInflationOnly}
                      </span>
                    )}
                    {d.afterYearEndDays !== undefined && (
                      <span className="text-muted-foreground block">
                        {f.deductionAfterDays}: {d.afterYearEndDays}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {content.exceptions.length > 0 && (
          <>
            <dt className="font-medium">{f.exceptions}</dt>
            <dd>{list(content.exceptions)}</dd>
          </>
        )}
        {content.periodLongerThanAYear !== undefined && (
          <>
            <dt className="font-medium">{f.periodLongerThanAYear}</dt>
            <dd>✓</dd>
          </>
        )}
        <dt className="font-medium">{f.ruling}</dt>
        <dd dir="auto" className="whitespace-pre-line">
          {props.ruling ?? f.rulingNone}
        </dd>
      </dl>
      {content.conditions.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">{f.conditions}</h3>
          <ol className="flex list-decimal flex-col gap-2 ps-6">
            {content.conditions.map((c, index) => (
              <li key={index}>
                <p dir="auto">{c.label}</p>
                <p className="text-muted-foreground">
                  {r.scopes[c.scope]} · {r.effects[c.effect]}
                  {c.openingValues === true ? ` · ${f.conditionOpening}` : ''}
                </p>
                {c.entries.length > 0 && <p className="text-muted-foreground">{list(c.entries)}</p>}
                {c.treatment !== undefined && (
                  <p className="text-muted-foreground" dir="auto">
                    {treatmentText(c.treatment)}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">{f.sources}</h3>
        <ul className="flex list-disc flex-col gap-1 ps-6">
          {props.sources.map((src) => (
            <li key={src.refId}>
              <span dir="auto">{src.title}</span>
              {src.locator !== null && (
                <>
                  {' '}
                  · <span dir="auto">{src.locator}</span>
                </>
              )}
              {src.url !== null && (
                <>
                  {' '}
                  ·{' '}
                  <a
                    className="text-primary underline-offset-4 hover:underline"
                    href={src.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    dir="ltr"
                  >
                    {r.detail.openSource}
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
