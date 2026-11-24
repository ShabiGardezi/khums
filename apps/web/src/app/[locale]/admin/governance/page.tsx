import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';

import { Badge } from '@khums/ui/components/badge';

import { GovernanceSubmit } from '@/components/console/governance-submit';
import { formatMessage } from '@/i18n/format';
import { getI18n } from '@/i18n/server';
import { consolePage } from '@/server/console-page';

export async function generateMetadata(): Promise<Metadata> {
  const { console: c } = await getI18n();
  return { title: c.governance.title, robots: { index: false, follow: false } };
}

/** Governance pack versions (production path) and first submissions (M4.6.5). */
export default async function GovernancePage() {
  await connection();
  const { console: c, href } = await getI18n();
  const g = c.governance;
  return consolePage({
    section: 'governance',
    permission: 'governance.ledger.read',
    title: g.title,
    description: g.description,
    body: async ({ api, session }) => {
      const packs = await api.governance.listPacks();
      if (!packs.ok) return null;
      return (
        <div className="flex flex-col gap-8">
          <section aria-labelledby="gov-list" className="flex flex-col gap-3">
            <h2 id="gov-list" className="text-lg font-semibold">
              {g.listHeading}
            </h2>
            {packs.value.packs.length === 0 ? (
              <p className="text-muted-foreground">{g.empty}</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {packs.value.packs.map((p) => (
                  <li
                    key={`${p.packId}@${p.version}`}
                    className="bg-card flex flex-col gap-2 rounded-lg border p-4"
                  >
                    <p dir="ltr" className="text-start font-mono font-semibold">
                      {p.packId}@{p.version}
                    </p>
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{g.state}:</span>
                      <Badge variant={p.state === 'PUBLISHED' ? 'success' : 'neutral'}>
                        {g.states[p.state]}
                      </Badge>
                      {p.activated && <Badge variant="info">{g.activated}</Badge>}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">{g.policy}: </span>
                      {p.policy === null ? '—' : c.policies.names[p.policy]}
                    </p>
                    <Link
                      href={href(
                        `/admin/governance/${encodeURIComponent(p.packId)}/${encodeURIComponent(p.version)}`,
                      )}
                      className="text-primary text-sm underline-offset-4 hover:underline"
                    >
                      {formatMessage(g.open, { packId: p.packId, version: p.version })}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {session.permissions.includes('governance.submit') && <GovernanceSubmit content={c} />}
        </div>
      );
    },
  });
}
