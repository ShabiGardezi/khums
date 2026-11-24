'use client';

import type { AuditEventResponse } from '@khums/api-client';

import { staffBrowserApi } from '@/components/admin/staff-browser-api';
import type { ConsoleContent } from '@/content/console/types';

import { LoadMoreList } from './load-more';
import { ScrollRegion } from './scroll-region';

const th = 'px-3 py-2 text-start font-medium';
const td = 'px-3 py-2 align-top';

/**
 * The audit log for the super administrator (decision 79): when, who (by username) and what
 * happened, in words. Internal ids, codes and digests stay in the stored record, never shown.
 */
export function AuditLog(props: {
  readonly initial: readonly AuditEventResponse[];
  readonly nextAfterSequence: number | null;
  readonly content: ConsoleContent;
  readonly localeTag: string;
}) {
  const a = props.content.audit;
  const when = new Intl.DateTimeFormat(props.localeTag, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
  return (
    <LoadMoreList
      initial={props.initial}
      initialCursor={props.nextAfterSequence}
      content={props.content.common}
      fetchPage={async (afterSequence) => {
        const result = await staffBrowserApi().governance.auditEvents({ afterSequence, limit: 50 });
        return result.ok
          ? {
              ok: true,
              value: { items: result.value.events, cursor: result.value.nextAfterSequence },
            }
          : result;
      }}
      render={(items) => (
        <ScrollRegion label={a.title}>
          <table className="w-full text-start text-sm">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className={th}>
                  {a.when}
                </th>
                <th scope="col" className={th}>
                  {a.actor}
                </th>
                <th scope="col" className={th}>
                  {a.type}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.eventId} className="border-t">
                  <td className={`${td} whitespace-nowrap`}>
                    {when.format(new Date(e.occurredAt))}
                  </td>
                  <td className={td}>
                    {e.actorName ?? (e.actor === null ? a.system : a.unknownPerson)}
                  </td>
                  <td className={td}>{a.events[e.type] ?? a.otherEvent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
    />
  );
}
