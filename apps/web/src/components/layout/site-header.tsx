import Link from 'next/link';

import { buttonVariants } from '@khums/ui/components/button';
import { cn } from '@khums/ui/lib/utils';

import { Logo } from '@/components/brand/logo';
import { MAIN_NAV, MOBILE_NAV, NAV_PATHS, type NavLinkKey } from '@/config/navigation';
import { getI18n } from '@/i18n/server';

import { LanguageSwitcher } from './language-switcher';
import { MobileNav } from './mobile-nav';
import { NavLinks } from './nav-links';

export async function SiteHeader() {
  const { locale, site, href } = await getI18n();
  const toItems = (keys: readonly NavLinkKey[]) =>
    keys.map((key) => ({ href: href(NAV_PATHS[key]), label: site.links[key] }));

  return (
    <header className="bg-card/95 supports-[backdrop-filter]:bg-card/85 sticky top-0 z-40 border-b backdrop-blur">
      <div className="relative mx-auto flex h-24 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Logo href={href('/')} name={site.name} />
        <nav aria-label={site.navigation.mainLabel} className="hidden lg:block">
          <NavLinks items={toItems(MAIN_NAV)} orientation="horizontal" />
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher current={locale} label={site.language.label} />
          <Link
            href={href(NAV_PATHS.start)}
            // cn() (tailwind-merge) resolves `hidden` vs the variant's `inline-flex`.
            className={cn(buttonVariants({ size: 'sm' }), 'hidden sm:inline-flex')}
          >
            {site.links.start}
          </Link>
          <MobileNav
            items={toItems(MOBILE_NAV)}
            labels={{
              open: site.navigation.menuOpen,
              close: site.navigation.menuClose,
              nav: site.navigation.mainLabel,
            }}
          />
        </div>
      </div>
    </header>
  );
}
