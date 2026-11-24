import type { Metadata } from 'next';
import { connection } from 'next/server';

import { listMarjaCatalogue } from '@khums/core';

import { PolicyAdmin } from '@/components/console/policy-admin';
import { getI18n } from '@/i18n/server';
import { consolePage } from '@/server/console-page';

export async function generateMetadata(): Promise<Metadata> {
  const { console: c } = await getI18n();
  return { title: c.policies.title, robots: { index: false, follow: false } };
}

/** Per-Marja governance policies with two-administrator changes (M4.6.5). */
export default async function PoliciesPage() {
  await connection();
  const { console: c, locale } = await getI18n();
  return consolePage({
    section: 'policies',
    permission: 'governance.policy.change',
    title: c.policies.title,
    description: c.policies.description,
    body: async ({ api }) => {
      const registry = await api.governance.policies();
      if (!registry.ok) return null;
      const marjaName = Object.fromEntries(listMarjaCatalogue().map((e) => [e.id, e.name[locale]]));
      return <PolicyAdmin registry={registry.value} marjaName={marjaName} content={c} />;
    },
  });
}
