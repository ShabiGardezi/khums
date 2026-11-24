import type { IconItem } from '@/content/landing/types';

import { LandingIconView } from './icons';

/** Icon + title + description grid used by the privacy and transparency sections. */
export function FeatureGrid({
  items,
  columns,
}: {
  items: readonly IconItem[];
  columns: 'four' | 'five';
}) {
  return (
    <ul
      className={
        columns === 'four'
          ? 'grid gap-6 sm:grid-cols-2 lg:grid-cols-4'
          : 'grid gap-6 sm:grid-cols-2 lg:grid-cols-5'
      }
    >
      {items.map((item) => (
        <li key={item.title} className="flex flex-col gap-2">
          <LandingIconView name={item.icon} className="text-primary mb-1 size-6" />
          <h3 className="text-base font-semibold">{item.title}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
        </li>
      ))}
    </ul>
  );
}
