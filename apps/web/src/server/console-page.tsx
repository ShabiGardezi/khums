import type { ReactNode } from 'react';

import { ConsoleAccessMessage, ConsoleFrame } from '@/components/console/console-frame';
import type { ConsoleSectionKey } from '@/components/console/console-nav';
import { getI18n } from '@/i18n/server';

import { consoleAccess, type ConsoleAccess } from './console-access';

/**
 * SERVER-ONLY scaffold of a console page (M4.6.5): access check, frame, and the permission the
 * section needs (informational; the API decides). `body` runs only when access is READY and the
 * permission is held; it returns the page body or null when its API read failed.
 */
export async function consolePage(options: {
  readonly section: ConsoleSectionKey;
  readonly permission: string;
  readonly title: string;
  readonly description: string;
  readonly body: (access: Extract<ConsoleAccess, { kind: 'READY' }>) => Promise<ReactNode | null>;
}) {
  const { console: c, admin, href } = await getI18n();
  const access = await consoleAccess(href('/admin/sign-in'), href('/admin/password'));
  const permissions = access.kind === 'READY' ? access.session.permissions : [];
  const frame = (body: ReactNode) => (
    <ConsoleFrame
      title={options.title}
      description={options.description}
      content={c}
      href={href}
      permissions={permissions}
      current={options.section}
    >
      {body}
    </ConsoleFrame>
  );
  const message = (kind: 'NOT_ACTIVE' | 'UNAVAILABLE' | 'NO_PERMISSION') =>
    frame(
      <ConsoleAccessMessage access={{ kind }} content={c} notActive={admin.accountNotActive} />,
    );
  if (access.kind !== 'READY') return message(access.kind);
  if (!permissions.includes(options.permission)) return message('NO_PERMISSION');
  const body = await options.body(access);
  return body === null ? message('UNAVAILABLE') : frame(body);
}
