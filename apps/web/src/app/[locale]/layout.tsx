import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { PreviewNotice } from '@/components/layout/preview-notice';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { LOCALES } from '@/i18n/config';
import { getI18n } from '@/i18n/server';

import '../globals.css';

/** Both locales are prerendered; any other first segment is a 404 (the proxy prefixes unlocalized paths). */
export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { site } = await getI18n();
  return {
    title: { default: site.name, template: site.titleTemplate },
    description: site.shortDescription,
    applicationName: site.name,
    robots: { index: false, follow: false }, // Pre-launch: keep out of search indexes.
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff', // Light theme only for now (dark tokens are dormant).
};

/** Root layout per locale: sets the document language and direction for the whole page. */
export default async function LocaleLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { definition, site } = await getI18n();
  return (
    <html lang={definition.tag} dir={definition.dir}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main-content"
          className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
        >
          {site.skipLink}
        </a>
        <PreviewNotice />
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
