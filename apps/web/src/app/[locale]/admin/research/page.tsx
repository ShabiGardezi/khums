import type { Metadata } from 'next';
import { connection } from 'next/server';

import { RESEARCH_QUESTION_CATALOGUE } from '@khums/core';

import type { ResearchTopicKey } from '@/content/research/types';
import { formatMessage } from '@/i18n/format';
import { getI18n } from '@/i18n/server';
import { consolePage } from '@/server/console-page';
import { chosenMarja, listAll, ResearchShell, StateBadge } from '@/server/research-workspace';

export async function generateMetadata(): Promise<Metadata> {
  const { research } = await getI18n();
  return { title: research.title, robots: { index: false, follow: false } };
}

/** Best state per question: an approved finding, otherwise any open (draft or verified) one. */
const RANK: Readonly<Record<string, number>> = { APPROVED: 3, VERIFIED: 2, DRAFT: 1 };

/** Research dashboard (M5.3.7): progress of the chosen Marja across the 70 required questions. */
export default async function ResearchDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { research: r, href } = await getI18n();
  const query = await searchParams;
  return consolePage({
    section: 'research',
    permission: 'research.read',
    title: r.title,
    description: r.description,
    body: async ({ api }) => {
      const marjas = await api.research.marjas();
      if (!marjas.ok) return null;
      const readable = marjas.value.marjas.filter((m) => m.permissions.includes('research.read'));
      const marja = chosenMarja(readable, query.marja);
      if (marja === null) return <p className="text-muted-foreground">{r.marja.none}</p>;
      const findings = await listAll(api, 'findings', marja.marjaId);
      if (findings === null) return null;

      const best = new Map<string, { state: string; count: number }>();
      for (const finding of findings) {
        if (finding.questionId === null) continue;
        const current = best.get(finding.questionId);
        const rank = RANK[finding.state] ?? 0;
        best.set(finding.questionId, {
          state:
            rank > (RANK[current?.state ?? ''] ?? 0) ? finding.state : (current?.state ?? 'NONE'),
          count: (current?.count ?? 0) + 1,
        });
      }
      const { questions } = RESEARCH_QUESTION_CATALOGUE;
      const approved = questions.filter((q) => best.get(q.id)?.state === 'APPROVED').length;
      const inProgress =
        questions.filter((q) => (RANK[best.get(q.id)?.state ?? ''] ?? 0) > 0).length - approved;
      const topics = [...new Set(questions.map((q) => q.topic))];

      return (
        <ResearchShell research={r} href={href} marjas={readable} marja={marja} current="dashboard">
          <section aria-labelledby="research-progress" className="flex flex-col gap-4">
            <h2 id="research-progress" className="text-lg font-semibold">
              {r.dashboard.progressHeading}
            </h2>
            <p>
              {formatMessage(r.dashboard.summary, {
                approved: String(approved),
                inProgress: String(inProgress),
                notStarted: String(questions.length - approved - inProgress),
                total: String(questions.length),
              })}
            </p>
            <p className="text-muted-foreground text-sm">{r.dashboard.questionTextNote}</p>
            <div className="grid gap-4 md:grid-cols-2">
              {topics.map((topic) => (
                <section key={topic} className="bg-card rounded-lg border p-4">
                  <h3 className="mb-2 font-semibold">
                    <span dir="ltr">{topic}</span> — {r.dashboard.topics[topic as ResearchTopicKey]}
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {questions
                      .filter((q) => q.topic === topic)
                      .map((q) => {
                        const entry = best.get(q.id);
                        const rank = RANK[entry?.state ?? ''] ?? 0;
                        return (
                          <li
                            key={q.id}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <span dir="ltr" className="font-mono">
                              {q.id}
                            </span>
                            <span className="flex items-center gap-2">
                              {entry !== undefined && (
                                <span className="text-muted-foreground text-xs">
                                  {r.dashboard.findings}: {entry.count}
                                </span>
                              )}
                              {rank > 0 && entry !== undefined ? (
                                <StateBadge state={entry.state} research={r} />
                              ) : (
                                <span className="text-muted-foreground text-xs">
                                  {r.dashboard.notStarted}
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                </section>
              ))}
            </div>
          </section>
          <section aria-labelledby="research-workflow" className="flex flex-col gap-2">
            <h2 id="research-workflow" className="text-lg font-semibold">
              {r.dashboard.workflowHeading}
            </h2>
            <ol className="list-decimal ps-6 text-sm">
              {r.dashboard.workflow.map((step) => (
                <li key={step} className="py-0.5">
                  {step}
                </li>
              ))}
            </ol>
          </section>
        </ResearchShell>
      );
    },
  });
}
