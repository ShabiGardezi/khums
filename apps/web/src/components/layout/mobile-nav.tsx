'use client';

import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@khums/ui/components/button';

import { NavLinks, type NavItem } from './nav-links';

/**
 * Mobile navigation as a disclosure (button + panel): simple, robust for screen readers,
 * closes on Escape (returning focus to the toggle) and on navigation.
 */
export interface MobileNavLabels {
  readonly open: string;
  readonly close: string;
  readonly nav: string;
}

export function MobileNav({
  items,
  labels,
}: {
  items: readonly NavItem[];
  labels: MobileNavLabels;
}) {
  const pathname = usePathname();
  // The menu is open only for the path it was opened on, so any navigation closes it
  // without an effect (no setState-in-effect, no extra render).
  const [openOnPath, setOpenOnPath] = useState<string | null>(null);
  const open = openOnPath === pathname;
  const setOpen = (value: boolean) => {
    setOpenOnPath(value ? pathname : null);
  };
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenOnPath(null);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <Button
        ref={toggleRef}
        variant="ghost"
        size="icon"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? labels.close : labels.open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </Button>
      <nav
        id={panelId}
        aria-label={labels.nav}
        hidden={!open}
        className="bg-card absolute inset-x-0 top-full border-b px-4 pb-4 pt-2 shadow-md sm:px-6"
      >
        <NavLinks
          items={items}
          orientation="vertical"
          onNavigate={() => {
            setOpen(false);
          }}
        />
      </nav>
    </div>
  );
}
