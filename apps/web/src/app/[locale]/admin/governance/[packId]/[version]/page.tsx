import type { Metadata } from 'next';
import { connection } from 'next/server';

import { Alert, AlertDescription } from '@khums/ui/components/alert';
import { Badge } from '@khums/ui/components/badge';

import { GovernanceCommands } from '@/components/console/governance-commands';
import { getI18n } from '@/i18n/server';
import { consolePage } from '@/server/console-page';
import { ScrollRegion } from '@/components/console/scroll-region';

export async function generateMetadata(): Promise<Metadata> {
  const { console: c } = await getI18n();
  return { title: c.governance.title, robots: { index: false, follow: false } };
}

/** One governance pack version: its verified ledger and lifecycle commands (M4.6.5). */
export default async function GovernanceVersionPage({
  params,
}: {
  params: Promise<{ packId: string; version: string }>;
}) {
  await connection();
  const { packId, version } = await params;
  const { console: c, definition } = await getI18n();
  const g = c.governance;
  const id = { packId: decodeURIComponent(packId), version: decodeURIComponent(version) };
  return consolePage({
    section: 'governance',
    permission: 'governance.ledger.read',
    title: `${g.title}: ${id.packId}@${id.version}`,
    description: g.description,
    body: async ({ api, session }) => {
      const pack = await api.governance.getPack(id.packId, id.version);
      if (!pack.ok) {
        return pack.error.kind === 'http' && pack.error.status === 404 ? (
          <Alert variant="warning">
            <AlertDescription>{c.common.errors.notFound}</AlertDescription>
          </Alert>
        ) : null;
      }
      const p = pack.value;
      const when = new Intl.DateTimeFormat(definition.tag, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      return (
        <div className="flex flex-col gap-8">
          <dl className="bg-card grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border p-4 text-sm">
            <dt className="text-muted-foreground">{g.state}</dt>
            <dd className="flex flex-wrap gap-2">
              <Badge variant={p.state === 'PUBLISHED' ? 'success' : 'neutral'}>
                {g.states[p.state]}
              </Badge>
              {p.activated && <Badge variant="info">{g.activated}</Badge>}
            </dd>
            <dt className="text-muted-foreground">{g.policy}</dt>
            <dd>{p.policy === null ? '—' : c.policies.names[p.policy]}</dd>
            <dt className="text-muted-foreground">{g.records.digest}</dt>
            <dd dir="ltr" className="text-start font-mono text-xs break-all">
              {p.contentDigest ?? '—'}
            </dd>
          </dl>
          <section aria-labelledby="gov-records" className="flex flex-col gap-3">
            <h2 id="gov-records" className="text-lg font-semibold">
              {g.records.heading}
            </h2>
            <ScrollRegion label={g.records.heading}>
              <table className="w-full text-start text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      {g.records.sequence}
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      {g.records.type}
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      {g.records.actor}
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      {g.records.when}
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      {g.records.digest}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.records.map((r) => (
                    <tr key={r.recordId} className="border-t align-top">
                      <td className="px-3 py-2 tabular-nums">{r.sequence}</td>
                      <td dir="ltr" className="px-3 py-2 text-start font-mono text-xs">
                        {r.type}
                      </td>
                      <td dir="ltr" className="px-3 py-2 text-start font-mono text-xs">
                        {r.actor.subject}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {when.format(new Date(r.recordedAt))}
                      </td>
                      <td dir="ltr" className="px-3 py-2 text-start font-mono text-xs break-all">
                        {r.contentDigest === null ? '—' : `${r.contentDigest.slice(0, 16)}…`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </section>
          <GovernanceCommands pack={p} permissions={session.permissions} content={c} />
        </div>
      );
    },
  });
}
