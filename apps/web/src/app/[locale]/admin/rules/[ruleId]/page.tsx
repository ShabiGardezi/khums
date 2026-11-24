import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { parseBuilderRuleContent } from '@khums/core';
import { Alert, AlertDescription } from '@khums/ui/components/alert';

import { PreparationBadges } from '@/components/rules/preparation-status';
import { RequirementResult } from '@/components/rules/requirement-result';
import { RuleContentView } from '@/components/rules/rule-content-view';
import { formatMessage } from '@/i18n/format';
import { getI18n } from '@/i18n/server';
import { consolePage } from '@/server/console-page';
import { chosenRuleMarja, RulesShell } from '@/server/rules-workspace';

export async function generateMetadata(): Promise<Metadata> {
  const { rules } = await getI18n();
  return { title: rules.title, robots: { index: false, follow: false } };
}

/**
 * One builder rule, read-only (decision 79): its content, sources, AI preparation status, the
 * requirement check and the append-only revision history. Rules are changed by the owner in code.
 */
export default async function RulePage({ params }: { params: Promise<{ ruleId: string }> }) {
  await connection();
  const { rules: r, facts, href } = await getI18n();
  const { ruleId } = await params;
  return consolePage({
    section: 'rules',
    permission: 'builder.rule.read',
    title: r.title,
    description: r.description,
    body: async ({ api }) => {
      const loaded = await api.rules.get(ruleId);
      if (!loaded.ok) {
        if (loaded.error.kind === 'http' && [400, 404].includes(loaded.error.status)) notFound();
        return null;
      }
      const rule = loaded.value;
      const marjaId = chosenRuleMarja(rule.marjaId);
      const content = parseBuilderRuleContent(rule.current.content);
      if (content === null) return null;
      const d = r.detail;
      return (
        <RulesShell rules={r} href={href} marjaId={marjaId}>
          <Link
            href={href(`/admin/rules?marja=${encodeURIComponent(marjaId)}`)}
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            {d.back}
          </Link>
          <section aria-labelledby="rule-heading" className="flex flex-col gap-2">
            <h2 id="rule-heading" className="text-lg font-semibold">
              {r.categories[content.category]}
            </h2>
            <PreparationBadges
              aiStage={rule.current.aiPreparation?.stage ?? null}
              rejected={rule.current.rejected}
              rules={r}
            />
            <dl className="grid gap-1 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="font-medium">{d.current}</dt>
              <dd>{formatMessage(d.revision, { number: String(rule.current.revision) })}</dd>
              {rule.current.aiPreparation !== null && (
                <>
                  <dt className="font-medium">{r.preparation.tool}</dt>
                  <dd dir="ltr">{rule.current.aiPreparation.tool}</dd>
                  {rule.current.aiPreparation.tests !== null && (
                    <>
                      <dt className="font-medium">{r.preparation.tests}</dt>
                      <dd dir="auto">{rule.current.aiPreparation.tests}</dd>
                    </>
                  )}
                </>
              )}
              {rule.current.rulingVersion !== null && (
                <>
                  <dt className="font-medium">{d.rulingVersion}</dt>
                  <dd dir="ltr">{rule.current.rulingVersion}</dd>
                </>
              )}
            </dl>
          </section>
          {rule.current.aiPreparation !== null && (
            <Alert variant="warning">
              <AlertDescription>{r.preparation.aiExplain}</AlertDescription>
            </Alert>
          )}
          {rule.current.rejected && (
            <Alert variant="destructive">
              <AlertDescription>{r.preparation.rejectedExplain}</AlertDescription>
            </Alert>
          )}
          <RequirementResult check={rule.check} rules={r} />
          <RuleContentView
            content={content}
            rules={r}
            facts={{ kinds: facts.kinds, subtypes: facts.subtypes }}
            sources={rule.sources}
            ruling={rule.ruling?.summary ?? null}
          />
          <section aria-labelledby="rule-history" className="flex flex-col gap-2">
            <h2 id="rule-history" className="text-lg font-semibold">
              {d.history}
            </h2>
            <ol className="flex flex-col gap-2">
              {[...rule.history].reverse().map((rev) => (
                <li key={rev.revision} className="bg-card rounded-lg border p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {formatMessage(d.revision, { number: String(rev.revision) })}
                    <PreparationBadges
                      aiStage={rev.aiPreparation?.stage ?? null}
                      rejected={rev.rejected}
                      rules={r}
                    />
                  </p>
                  <dl className="grid gap-1 sm:grid-cols-[auto_1fr]">
                    <dt className="text-muted-foreground">{d.by}</dt>
                    <dd>{rev.actorName ?? d.unknownPerson}</dd>
                    <dt className="text-muted-foreground">{d.at}</dt>
                    <dd>
                      <time dir="ltr" dateTime={rev.at}>
                        {rev.at}
                      </time>
                    </dd>
                    <dt className="text-muted-foreground">{d.reason}</dt>
                    <dd dir="auto">{rev.reason}</dd>
                  </dl>
                </li>
              ))}
            </ol>
          </section>
        </RulesShell>
      );
    },
  });
}
