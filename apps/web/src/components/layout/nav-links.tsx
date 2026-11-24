'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@khums/ui/lib/utils';

export interface NavItem {
  /** Locale-prefixed href. */
  readonly href: string;
  readonly label: string;
}

const isActive = (pathname: string, href: string) =>
  !href.includes('#') && (pathname === href || pathname.startsWith(`${href}/`));

/** Navigation links with aria-current on the active page. */
export function NavLinks({
  items,
  orientation,
  onNavigate,
}: {
  items: readonly NavItem[];
  orientation: 'horizontal' | 'vertical';
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <ul
      className={cn('flex', orientation === 'horizontal' ? 'items-center gap-1' : 'flex-col gap-1')}
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
              className={cn(
                'block whitespace-nowrap rounded-md text-sm font-medium transition-colors',
                orientation === 'horizontal' ? 'px-3 py-2' : 'px-3 py-3 text-base',
                active
                  ? 'bg-primary-soft text-primary-strong'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
