import type { Metadata } from 'next';
import { connection } from 'next/server';

import { Alert, AlertDescription } from '@khums/ui/components/alert';

import { AuditLog } from '@/components/console/paged-views';
import { getI18n } from '@/i18n/server';
import { consolePage } from '@/server/console-page';

export async function generateMetadata(): Promise<Metadata> {
  const { console: c } = await getI18n();
  return { title: c.audit.title, robots: { index: false, follow: false } };
}

/** The hash-chained audit log, paged, with the chain verification result (M4.6.5). */
export default async function AuditPage() {
  await connection();
  const { console: c, definition } = await getI18n();
  return consolePage({
    section: 'audit',
    permission: 'audit.log.read',
    title: c.audit.title,
    description: c.audit.description,
    body: async ({ api }) => {
      const page = await api.governance.auditEvents({ limit: 50 });
      if (!page.ok) return null;
      return (
        <div className="flex flex-col gap-4">
          <Alert variant={page.value.chainVerified ? 'success' : 'destructive'}>
            <AlertDescription>
              {page.value.chainVerified ? c.audit.verified : c.audit.broken}
            </AlertDescription>
          </Alert>
          <AuditLog
            initial={page.value.events}
            nextAfterSequence={page.value.nextAfterSequence}
            content={c}
            localeTag={definition.tag}
          />
        </div>
      );
    },
  });
}
