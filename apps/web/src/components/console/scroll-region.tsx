import type { ReactNode } from 'react';

/**
 * A horizontally scrollable region for wide tables (M4.6.5). Keyboard users can focus it and
 * scroll with the arrow keys (WCAG 2.1.1; axe `scrollable-region-focusable`); it is named so the
 * focus stop is announced.
 */
export function ScrollRegion(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={props.label}
      tabIndex={0}
      className="focus-visible:ring-ring overflow-x-auto rounded-lg border focus-visible:ring-2 focus-visible:outline-none"
    >
      {props.children}
    </div>
  );
}
