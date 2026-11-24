import { TriangleAlert } from 'lucide-react';

import { getI18n } from '@/i18n/server';

/**
 * Site-wide pre-launch notice. Remove only after Gate R (scholar approval of real rule packs),
 * see docs/DEVELOPMENT_ROADMAP.md.
 */
export async function PreviewNotice() {
  const { site } = await getI18n();
  return (
    <div
      role="note"
      aria-label={site.previewNotice.ariaLabel}
      className="bg-mock text-mock-foreground border-mock-border border-b"
    >
      <p className="mx-auto flex max-w-7xl items-start gap-2 px-4 py-2 text-sm font-medium sm:items-center sm:px-6 lg:px-8">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 sm:mt-0" />
        <span>{site.previewNotice.text}</span>
      </p>
    </div>
  );
}
