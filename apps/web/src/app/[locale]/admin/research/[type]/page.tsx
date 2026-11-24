import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { RESEARCH_QUESTION_CATALOGUE } from '@khums/core';
import { NativeSelect } from '@khums/ui/components/native-select';

import { ResearchRecordForm } from '@/components/research/research-forms';
import { getI18n } from '@/i18n/server';
import { consolePage } from '@/server/console-page';
import {
  candidatesFor,
  canCreate,
  chosenMarja,
  isResearchType,
  listAll,
  ResearchShell,
  StateBadge,
} from '@/server/research-workspace';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}): Promise<Metadata> {
  const { research } = await getI18n();
  const { type } = await params;
  const title = isResearchType(type) ? research.nav[type] : research.title;
  return { title, robots: { index: false, follow: false } };
}

const STATES = ['DRAFT', 'VERIFIED', 'REVIEWED', 'APPROVED', 'DISPUTED', 'SUPERSEDED', 'WITHDRAWN'];

/** One record type of the chosen Marja: list with a state filter, and a new-draft form (M5.3.7). */
export default async function ResearchListPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { type } = await params;
  if (!isResearchType(type)) notFound();
  const { console: c, research: r, href } = await getI18n();
  const query = await searchParams;
  const state =
    typeof query.state === 'string' && STATES.includes(query.state) ? query.state : undefined;
  return consolePage({
    section: 'research',
    permission: 'research.read',
    title: r.nav[type],
    description: r.description,
    body: async ({ api }) => {
      const marjas = await api.research.marjas();
      if (!marjas.ok) return null;
      const readable = marjas.value.marjas.filter((m) => m.permissions.includes('research.read'));
      const marja = chosenMarja(readable, query.marja);
      if (marja === null) return <p className="text-muted-foreground">{r.marja.none}</p>;
      const items = await listAll(api, type, marja.marjaId, state);
      if (items === null) return null;
      const creatable = canCreate(type, marja.permissions);
      const candidates = creatable ? await candidatesFor(api, type, marja.marjaId) : {};
      if (candidates === null) return null;
      const recordsPath = href(`/admin/research/${type}`);

      return (
        <ResearchShell research={r} href={href} marjas={readable} marja={marja} current={type}>
          <section aria-labelledby="research-list" className="flex flex-col gap-3">
            <h2 id="research-list" className="text-lg font-semibold">
              {r.list.heading}
            </h2>
            <form method="get" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="marja" value={marja.marjaId} />
              <label className="flex flex-col gap-1 text-sm">
                {r.list.state}
                <NativeSelect name="state" defaultValue={state ?? ''}>
                  <option value="">{r.list.allStates}</option>
                  {STATES.map((s) => (
                    <option key={s} value={s}>
                      {r.states[s as keyof typeof r.states]}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <button type="submit" className="h-10 rounded-md border px-3 text-sm">
                {r.list.filter}
              </button>
            </form>
            {items.length === 0 ? (
              <p className="text-muted-foreground">{r.list.empty}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li
                    key={item.entityId}
                    className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <Link
                        href={`${recordsPath}/${encodeURIComponent(item.entityId)}?marja=${encodeURIComponent(marja.marjaId)}`}
                        className="text-primary font-medium underline-offset-4 hover:underline"
                      >
                        <span dir="auto">{item.label}</span>
                      </Link>
                      <span
                        dir="ltr"
                        className="text-muted-foreground text-start font-mono text-xs"
                      >
                        {item.displayRef}
                        {item.rulingVersion !== null ? ` · v${String(item.rulingVersion)}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">
                        {r.list.revisions}: {item.revisions}
                      </span>
                      <StateBadge state={item.state} research={r} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section
            aria-labelledby="research-create"
            className="bg-card flex flex-col gap-3 rounded-lg border p-4"
          >
            <h2 id="research-create" className="text-lg font-semibold">
              {r.list.createHeading}
            </h2>
            {creatable ? (
              <ResearchRecordForm
                type={type}
                mode="create"
                marjaId={marja.marjaId}
                candidates={candidates}
                questions={RESEARCH_QUESTION_CATALOGUE.questions}
                recordsPath={recordsPath}
                research={r}
                common={c.common}
              />
            ) : (
              <p className="text-muted-foreground text-sm">{r.list.noCreatePermission}</p>
            )}
          </section>
        </ResearchShell>
      );
    },
  });
}
