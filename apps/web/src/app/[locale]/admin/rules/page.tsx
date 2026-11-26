import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';

import { PreparationBadges } from '@/components/rules/preparation-status';
import { RuleStatusBadge } from '@/components/rules/requirement-result';
import { RuleTestPanel } from '@/components/rules/rule-test-panel';
import { getI18n } from '@/i18n/server';
import { consolePage } from '@/server/console-page';
import { chosenRuleMarja, RulesShell } from '@/server/rules-workspace';

export async function generateMetadata(): Promise<Metadata> {
  const { rules } = await getI18n();
  return { title: rules.title, robots: { index: false, follow: false } };
}

/**
 * Rule builder of one Marja (Phase 2 steps 3–4): the rules with their derived status, a new-rule
 * form for the Marja's scholars, and the PROVISIONAL test panel. Read-only for other Marjas.
 */
export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { rules: r, console: c, facts, results, href } = await getI18n();
  const query = await searchParams;
  const marjaId = chosenRuleMarja(query.marja);
  return consolePage({
    section: 'rules',
    permission: 'builder.rule.read',
    title: r.title,
    description: r.description,
    body: async ({ api }) => {
      // Decision 79: scholars read and test every Marja's rules here; rules are changed by the
      // owner in code (scripts/import-research-bundle.mjs), never edited in this page.
      const list = await api.rules.list(marjaId);
      if (!list.ok) return null;
      const { rules, canTest } = list.value;
      return (
        <RulesShell rules={r} href={href} marjaId={marjaId}>
          <section aria-labelledby="rules-list" className="flex flex-col gap-3">
            <h2 id="rules-list" className="text-lg font-semibold">
              {r.list.heading}
            </h2>
            {rules.length === 0 ? (
              <p className="text-muted-foreground">{r.list.empty}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {rules.map((rule) => (
                  <li
                    key={rule.ruleId}
                    className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="flex flex-col gap-1">
                      <Link
                        href={href(
                          `/admin/rules/${encodeURIComponent(rule.ruleId)}?marja=${encodeURIComponent(marjaId)}`,
                        )}
                        className="text-primary font-medium underline-offset-4 hover:underline"
                      >
                        {r.categories[rule.category]}
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {r.list.revisions}: {rule.revisions} · {r.list.updated}:{' '}
                        <time dir="ltr" dateTime={rule.updatedAt}>
                          {rule.updatedAt}
                        </time>
                      </span>
                    </div>
                    <RuleStatusBadge status={rule.status} rules={r} />
                    <PreparationBadges aiStage={rule.aiStage} rejected={rule.rejected} rules={r} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {canTest && (
            <RuleTestPanel
              marjaId={marjaId}
              rules={r}
              facts={{ kinds: facts.kinds, subtypes: facts.subtypes }}
              results={{
                provisionalLabel: results.provisionalLabel,
                provisionalNoticeAriaLabel: results.provisionalNoticeAriaLabel,
                provisionalExplanation: results.provisionalExplanation,
                print: results.print,
              }}
              common={c.common}
            />
          )}
        </RulesShell>
      );
    },
  });
}
