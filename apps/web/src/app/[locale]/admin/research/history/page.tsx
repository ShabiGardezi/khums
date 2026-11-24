import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';

import { ScrollRegion } from '@/components/console/scroll-region';
import { getI18n } from '@/i18n/server';
import { consolePage } from '@/server/console-page';
import { chosenMarja, RESEARCH_TYPES, StateBadge } from '@/server/research-workspace';

export async function generateMetadata(): Promise<Metadata> {
  const { research } = await getI18n();
  return { title: research.history.heading, robots: { index: false, follow: false } };
}

/**
 * Research history (M5.3.7): who changed which record and when, for every record type of one
 * Marja. Metadata only (no content, no reasons), so auditors use it too (`research.audit.read`).
 */
export default async function ResearchHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { research: r, href, locale } = await getI18n();
  const query = await searchParams;
  return consolePage({
    section: 'researchHistory',
    permission: 'research.audit.read',
    title: r.history.heading,
    description: r.history.description,
    body: async ({ api }) => {
      const marjas = await api.research.marjas();
      if (!marjas.ok) return null;
      const auditable = marjas.value.marjas.filter((m) =>
        m.permissions.includes('research.audit.read'),
      );
      const marja = chosenMarja(auditable, query.marja);
      if (marja === null) return <p className="text-muted-foreground">{r.marja.none}</p>;
      const pages = await Promise.all(
        RESEARCH_TYPES.map(
          async (type) =>
            [
              type,
              await api.research.metadata(type, { marjaId: marja.marjaId, limit: 100 }),
            ] as const,
        ),
      );
      if (pages.some(([, page]) => !page.ok)) return null;
      const at = (iso: string) =>
        new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(iso),
        );
      const entries = pages
        .flatMap(([type, page]) =>
          page.ok
            ? page.value.items.flatMap((item) =>
                item.records.map((record) => ({ type, item, record })),
              )
            : [],
        )
        .sort((a, b) => (a.record.recordedAt < b.record.recordedAt ? 1 : -1));
      return (
        <div className="flex flex-col gap-4">
          {auditable.length > 1 && (
            <nav aria-label={r.marja.label} className="flex flex-wrap gap-2">
              {auditable.map((m) => (
                <Link
                  key={m.marjaId}
                  href={href(`/admin/research/history?marja=${encodeURIComponent(m.marjaId)}`)}
                  aria-current={m.marjaId === marja.marjaId ? 'page' : undefined}
                  className="aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground rounded-md border px-3 py-1.5 text-sm"
                >
                  {r.marja.names[m.marjaId as 'sistani' | 'khamenei']}
                </Link>
              ))}
            </nav>
          )}
          <p className="text-lg font-semibold">
            {r.marja.names[marja.marjaId as 'sistani' | 'khamenei']}
          </p>
          {entries.length === 0 ? (
            <p className="text-muted-foreground">{r.history.empty}</p>
          ) : (
            <ScrollRegion label={r.history.heading}>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="p-2 text-start font-medium">{r.detail.time}</th>
                    <th className="p-2 text-start font-medium">{r.history.record}</th>
                    <th className="p-2 text-start font-medium">{r.detail.kind}</th>
                    <th className="p-2 text-start font-medium">{r.detail.actor}</th>
                    <th className="p-2 text-start font-medium">{r.detail.state}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(({ type, item, record }) => (
                    <tr key={`${item.entityId}#${String(record.revision)}`} className="border-t">
                      <td className="p-2">{at(record.recordedAt)}</td>
                      <td className="p-2">
                        {r.nav[type]}{' '}
                        <code dir="ltr" className="text-xs">
                          {item.displayRef} · {r.detail.revision} {record.revision}
                        </code>
                      </td>
                      <td className="p-2">
                        <code dir="ltr">{record.kind}</code>
                        {record.hasReason ? ` (${r.history.hasReason})` : ''}
                      </td>
                      <td className="p-2">
                        <code dir="ltr" className="text-xs">
                          {record.actor.subject}
                        </code>
                      </td>
                      <td className="p-2">
                        <StateBadge state={item.state} research={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          )}
        </div>
      );
    },
  });
}
