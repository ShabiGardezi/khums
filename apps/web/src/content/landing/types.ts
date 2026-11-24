/** Shape of the landing-page content. Every locale must provide all of it (enforced by tests). */

export type LandingIcon =
  | 'settings'
  | 'user-check'
  | 'list'
  | 'file-search'
  | 'sparkles'
  | 'calendar'
  | 'history'
  | 'lock'
  | 'device'
  | 'eye-off'
  | 'trash'
  | 'layers'
  | 'book'
  | 'tag'
  | 'message'
  | 'flask';

export interface IconItem {
  readonly icon: LandingIcon;
  readonly title: string;
  readonly description: string;
}

export interface FaqItem {
  readonly question: string;
  readonly answer: readonly string[];
}

interface SectionIntro {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
}

export interface LandingContent {
  readonly metadata: { readonly title: string; readonly description: string };
  readonly hero: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly primaryCta: string;
    readonly secondaryCta: string;
    readonly previewNote: string;
    readonly illustration: {
      readonly title: string;
      readonly caption: string;
      readonly steps: readonly {
        readonly label: string;
        readonly rule: string;
        readonly source: string;
      }[];
      readonly packLabel: string;
      readonly consultationFlag: string;
    };
  };
  readonly howItWorks: SectionIntro & {
    readonly description: string;
    /** Screen-reader prefix for each step, e.g. "Step {number}: ". */
    readonly stepLabel: string;
    readonly steps: readonly IconItem[];
  };
  readonly assessments: SectionIntro & {
    readonly description: string;
    readonly items: readonly IconItem[];
  };
  readonly marjaSupport: SectionIntro & {
    readonly description: string;
    readonly status: { readonly title: string; readonly body: string };
    readonly principles: readonly string[];
    readonly independence: string;
  };
  readonly privacy: SectionIntro & {
    readonly description: string;
    readonly items: readonly IconItem[];
  };
  readonly transparency: SectionIntro & {
    readonly description: string;
    readonly items: readonly IconItem[];
  };
  readonly faq: SectionIntro & { readonly items: readonly FaqItem[] };
  readonly disclaimer: {
    readonly title: string;
    readonly points: readonly string[];
    readonly linkLabel: string;
  };
  readonly finalCta: { readonly title: string; readonly description: string; readonly cta: string };
}
