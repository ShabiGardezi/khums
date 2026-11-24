import type { RuleReviewStatus } from '@khums/shared-types';

/**
 * Scholar research workspace texts (M5.3.7). Placeholders in `{braces}`. Identifiers the API
 * returns (ids, display references, digests, codes) are shown as they are, next to these labels.
 * Nothing here is a ruling: the workspace records research; only the scholar decides.
 */
export type ResearchTypeKey = 'sources' | 'passages' | 'translations' | 'findings' | 'rulings';
export type ResearchStateKey =
  | 'DRAFT'
  | 'VERIFIED'
  | 'REVIEWED'
  | 'APPROVED'
  | 'DISPUTED'
  | 'SUPERSEDED'
  | 'WITHDRAWN'
  | 'DELETED';
export type ResearchTopicKey =
  'INC' | 'EXP' | 'SUR' | 'SAV' | 'NEC' | 'PRO' | 'INV' | 'LIA' | 'BUS' | 'FTK' | 'MIS' | 'CTQ';

export interface ResearchContent {
  readonly title: string;
  readonly description: string;
  /** Always shown: research records are not religious guidance. */
  readonly notice: string;
  readonly marja: {
    readonly label: string;
    readonly names: { readonly sistani: string; readonly khamenei: string };
    readonly none: string;
  };
  readonly nav: {
    readonly label: string;
    readonly dashboard: string;
    readonly history: string;
  } & Readonly<Record<ResearchTypeKey, string>>;
  readonly states: Readonly<Record<ResearchStateKey, string>>;
  /** M5.4: the review status of a ruling version (derived from its state; never an approval). */
  readonly reviewStatus: {
    readonly label: string;
    readonly values: Readonly<Record<RuleReviewStatus, string>>;
  };
  readonly dashboard: {
    readonly progressHeading: string;
    readonly summary: string;
    readonly approved: string;
    readonly inProgress: string;
    readonly notStarted: string;
    readonly question: string;
    readonly status: string;
    readonly findings: string;
    readonly questionTextNote: string;
    readonly workflowHeading: string;
    readonly workflow: readonly string[];
    readonly topics: Readonly<Record<ResearchTopicKey, string>>;
  };
  readonly list: {
    readonly heading: string;
    readonly empty: string;
    readonly createHeading: string;
    readonly create: string;
    readonly open: string;
    readonly state: string;
    readonly allStates: string;
    readonly filter: string;
    readonly revisions: string;
    readonly updated: string;
    readonly noCreatePermission: string;
  };
  readonly detail: {
    readonly content: string;
    readonly references: string;
    readonly noReferences: string;
    readonly history: string;
    readonly revision: string;
    readonly kind: string;
    readonly actor: string;
    readonly time: string;
    readonly reason: string;
    readonly state: string;
    readonly question: string;
    readonly version: string;
    readonly actions: string;
    readonly noActions: string;
    readonly revise: string;
    readonly reviseHint: string;
    readonly versions: string;
    readonly current: string;
    readonly createVersion: string;
    readonly createVersionHint: string;
    readonly back: string;
    readonly aiNone: string;
  };
  readonly actions: {
    readonly VERIFIED: string;
    readonly REVIEWED: string;
    readonly APPROVED: string;
    readonly DISPUTED: string;
    readonly SUPERSEDED: string;
    readonly WITHDRAWN: string;
    readonly DRAFT_DELETED: string;
    readonly reasonFor: string;
  };
  readonly fields: {
    readonly optional: string;
    readonly linesHint: string;
    readonly noCandidates: string;
    readonly notes: string;
    readonly titleOriginal: string;
    readonly titleTranslation: string;
    readonly originalLanguage: string;
    readonly languageHint: string;
    readonly sourceClass: string;
    readonly sourceTier: string;
    readonly tierHint: string;
    readonly publisher: string;
    readonly edition: string;
    readonly publicationOriginal: string;
    readonly publicationGregorian: string;
    readonly url: string;
    readonly statedAuthor: string;
    readonly establishedBy: string;
    readonly authorshipStatus: string;
    readonly authenticityStatus: string;
    readonly compareWith: string;
    readonly accessStatus: string;
    readonly copyright: string;
    readonly canonical: string;
    readonly source: string;
    readonly volume: string;
    readonly page: string;
    readonly masalah: string;
    readonly istiftaId: string;
    readonly section: string;
    readonly paragraph: string;
    readonly locatorUrl: string;
    readonly locatorHint: string;
    readonly text: string;
    readonly textHint: string;
    readonly precautionWording: string;
    readonly passage: string;
    readonly language: string;
    readonly translationText: string;
    readonly translator: string;
    readonly question: string;
    readonly passages: string;
    readonly passagesHint: string;
    readonly translations: string;
    readonly translationsHint: string;
    readonly findings: string;
    readonly findingsHint: string;
    readonly writtenIn: string;
    readonly scenario: string;
    readonly conclusion: string;
    readonly explanation: string;
    readonly precaution: string;
    readonly conditions: string;
    readonly exceptions: string;
    readonly qualifications: string;
    readonly unresolvedIssues: string;
  };
  readonly options: {
    readonly sourceClass: Readonly<Record<string, string>>;
    readonly authorship: Readonly<Record<string, string>>;
    readonly authenticity: Readonly<Record<string, string>>;
    readonly access: Readonly<Record<string, string>>;
    readonly copyright: Readonly<Record<string, string>>;
    readonly canonical: Readonly<Record<string, string>>;
    readonly precaution: Readonly<Record<string, string>>;
    readonly translationLanguage: Readonly<Record<string, string>>;
  };
  readonly history: {
    readonly heading: string;
    readonly description: string;
    readonly empty: string;
    readonly record: string;
    readonly hasReason: string;
  };
}
