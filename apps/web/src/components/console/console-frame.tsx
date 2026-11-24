import Link from 'next/link';
import type { ReactNode } from 'react';

import { Alert, AlertDescription } from '@khums/ui/components/alert';
import { Container } from '@khums/ui/components/container';
import { PageHeader } from '@khums/ui/components/page-header';

import type { ConsoleContent } from '@/content/console/types';
import type { ConsoleAccess } from '@/server/console-access';

import { visibleSections, type ConsoleSectionKey } from './console-nav';

/**
 * The frame of every staff console page (M4.6.5): heading, section navigation (by permission,
 * informational) and the page body. Server Component.
 */
export function ConsoleFrame(props: {
  readonly title: string;
  readonly description: string;
  readonly content: ConsoleContent;
  readonly href: (path: string) => string;
  readonly permissions: readonly string[];
  readonly current: ConsoleSectionKey | 'overview';
  readonly children: ReactNode;
}) {
  const sections = visibleSections(props.permissions);
  return (
    <Container className="flex flex-col gap-8 py-10 sm:py-14">
      <nav aria-label={props.content.nav.label} className="print:hidden">
        <ul className="flex flex-wrap gap-2 text-sm">
          <li>
            <Link
              href={props.href('/admin')}
              aria-current={props.current === 'overview' ? 'page' : undefined}
              className="aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary-strong hover:bg-muted block rounded-md border px-3 py-1.5"
            >
              {props.content.nav.overview}
            </Link>
          </li>
          {sections.map((section) => (
            <li key={section.key}>
              <Link
                href={props.href(section.path)}
                aria-current={props.current === section.key ? 'page' : undefined}
                className="aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary-strong hover:bg-muted block rounded-md border px-3 py-1.5"
              >
                {props.content.nav[section.key]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <PageHeader title={props.title} description={props.description} />
      {props.children}
    </Container>
  );
}

/** The message for a console access state that is not READY. */
export function ConsoleAccessMessage(props: {
  readonly access: Exclude<ConsoleAccess, { kind: 'READY' }> | { kind: 'NO_PERMISSION' };
  readonly content: ConsoleContent;
  readonly notActive: string;
}) {
  const text =
    props.access.kind === 'NOT_ACTIVE'
      ? props.notActive
      : props.access.kind === 'NO_PERMISSION'
        ? props.content.common.noPermission
        : props.content.common.unavailable;
  return (
    <Alert variant="warning">
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}
