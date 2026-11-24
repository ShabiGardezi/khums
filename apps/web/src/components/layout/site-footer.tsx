import Link from 'next/link';

import { Separator } from '@khums/ui/components/separator';

import { LogoMark } from '@/components/brand/logo';
import { FOOTER_GROUPS, NAV_PATHS, type FooterGroupKey } from '@/config/navigation';
import { getI18n } from '@/i18n/server';

export async function SiteFooter() {
  const { site, href } = await getI18n();
  const groups = Object.entries(FOOTER_GROUPS) as [
    FooterGroupKey,
    (typeof FOOTER_GROUPS)[FooterGroupKey],
  ][];
  return (
    <footer className="bg-card mt-16 border-t">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="flex max-w-sm flex-col gap-3">
            <div className="flex items-center gap-2.5 font-semibold">
              <LogoMark className="size-7" />
              <span>{site.name}</span>
            </div>
            <p className="text-muted-foreground text-sm">{site.shortDescription}</p>
          </div>
          <nav
            aria-label={site.navigation.footerLabel}
            className="grid grid-cols-2 gap-8 sm:grid-cols-3"
          >
            {groups.map(([group, keys]) => (
              <div key={group} className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold">{site.footer.groups[group]}</h2>
                <ul className="flex flex-col gap-2 text-sm">
                  {keys.map((key) => (
                    <li key={key}>
                      <Link
                        href={href(NAV_PATHS[key])}
                        className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                      >
                        {site.links[key]}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <Separator />
        <p className="text-muted-foreground text-xs leading-relaxed">{site.footer.disclaimer}</p>
      </div>
    </footer>
  );
}
