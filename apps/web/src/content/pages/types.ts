/** Titles and short texts for secondary pages. Legal page bodies are English-only for now. */
export interface PageIntro {
  readonly title: string;
  readonly description: string;
}

export interface PagesContent {
  readonly start: PageIntro;
  readonly history: PageIntro;
  readonly methodology: PageIntro;
  readonly privacy: PageIntro;
  readonly terms: PageIntro;
  readonly disclaimer: PageIntro & { readonly mockExplanation: string };
  readonly designSystem: PageIntro;
}
