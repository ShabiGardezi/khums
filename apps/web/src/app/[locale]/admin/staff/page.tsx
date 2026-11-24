import type { Metadata } from 'next';
import { connection } from 'next/server';

import { listMarjaCatalogue } from '@khums/core';

import { StaffAdmin } from '@/components/console/staff-admin';
import { getI18n } from '@/i18n/server';
import { consolePage } from '@/server/console-page';

export async function generateMetadata(): Promise<Metadata> {
  const { console: c } = await getI18n();
  return { title: c.staff.title, robots: { index: false, follow: false } };
}

/** Staff accounts, roles and Marja scopes (M4.6.5). The API authorizes and audits everything. */
export default async function StaffPage() {
  await connection();
  const { console: c, locale, definition } = await getI18n();
  return consolePage({
    section: 'staff',
    permission: 'identity.user.read',
    title: c.staff.title,
    description: c.staff.description,
    body: async ({ api }) => {
      const accounts = await api.staffAccounts.list();
      if (!accounts.ok) return null;
      const marjas = listMarjaCatalogue()
        .map((entry) => ({ id: entry.id, name: entry.name[locale] }))
        .sort((a, b) => a.name.localeCompare(b.name, definition.tag));
      return (
        <StaffAdmin
          accounts={accounts.value.accounts}
          marjas={marjas}
          content={c}
          localeTag={definition.tag}
        />
      );
    },
  });
}
