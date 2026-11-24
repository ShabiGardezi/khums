import type { FooterGroupKey, NavLinkKey } from '@/config/navigation';

/** Site-wide UI text: chrome, accessibility labels, shared states. Required for every locale. */
export interface SiteContent {
  readonly name: string;
  readonly shortDescription: string;
  /** Page title template; `%s` is replaced by the page title. */
  readonly titleTemplate: string;
  readonly skipLink: string;
  readonly previewNotice: { readonly ariaLabel: string; readonly text: string };
  /** Localized mock label. The canonical English label is always shown alongside it. */
  readonly mockNotice: { readonly label: string; readonly ariaLabel: string };
  readonly navigation: {
    readonly mainLabel: string;
    readonly footerLabel: string;
    readonly menuOpen: string;
    readonly menuClose: string;
  };
  readonly language: { readonly label: string };
  readonly links: Readonly<Record<NavLinkKey, string>>;
  readonly footer: {
    readonly groups: Readonly<Record<FooterGroupKey, string>>;
    readonly disclaimer: string;
  };
  readonly notFound: {
    readonly title: string;
    readonly description: string;
    readonly action: string;
  };
  readonly error: { readonly title: string; readonly description: string; readonly action: string };
  readonly planned: {
    readonly title: string;
    /** `{milestone}` is replaced with the milestone id. */
    readonly description: string;
    readonly back: string;
  };
  readonly legal: {
    readonly draftTitle: string;
    readonly draftBody: string;
    readonly englishOnlyTitle: string;
    readonly englishOnlyBody: string;
  };
}
