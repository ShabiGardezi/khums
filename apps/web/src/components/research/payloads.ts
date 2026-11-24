import type { ResearchListItem } from '@khums/api-client';
import type { ResearchEntityType, ResearchReference } from '@khums/shared-types';

/**
 * Form → request helpers for the research workspace (M5.3.7). They only reshape what the scholar
 * typed into the API's payload shapes; the API (core) validates every field and rule. Empty
 * optional fields become null. Nothing here decides anything.
 */

const str = (data: FormData, name: string): string => {
  const value = data.get(name);
  return typeof value === 'string' ? value.trim() : '';
};
const opt = (data: FormData, name: string): string | null => {
  const value = str(data, name);
  return value === '' ? null : value;
};
const lines = (data: FormData, name: string): string[] =>
  str(data, name)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
const int = (data: FormData, name: string): number | null => {
  const value = str(data, name);
  return /^\d+$/.test(value) ? Number(value) : null;
};

/** A reference choice as a form value: `<TYPE>|<entityId>|<revision>|<marjaId>`. */
export const referenceValue = (item: ResearchListItem): string =>
  [item.entityType, item.entityId, String(item.revisions - 1), item.marjaId].join('|');

const referenceOf = (value: string): ResearchReference | null => {
  const [entityType, entityId, revision, marjaId] = value.split('|');
  if (entityType === undefined || entityId === undefined || marjaId === undefined) return null;
  if (!/^\d+$/.test(revision ?? '')) return null;
  return {
    entityType: entityType as ResearchEntityType,
    entityId,
    revision: Number(revision),
    rulingVersion: null,
    marjaId,
  };
};

/** Every reference chosen in the named fields (selects and checkboxes), in form order. */
export function referencesFrom(data: FormData, ...names: string[]): ResearchReference[] {
  return names.flatMap((name) =>
    data
      .getAll(name)
      .filter((v): v is string => typeof v === 'string' && v !== '')
      .flatMap((v) => referenceOf(v) ?? []),
  );
}

export function sourcePayloadFrom(data: FormData): Record<string, unknown> {
  return {
    title: { original: str(data, 'titleOriginal'), translation: opt(data, 'titleTranslation') },
    originalLanguage: str(data, 'originalLanguage'),
    sourceClass: str(data, 'sourceClass'),
    sourceTier: int(data, 'sourceTier') ?? 0,
    publisher: opt(data, 'publisher'),
    edition: opt(data, 'edition'),
    publicationDate: {
      original: opt(data, 'publicationOriginal'),
      gregorian: opt(data, 'publicationGregorian'),
    },
    url: opt(data, 'url'),
    authorship: {
      statedAuthor: opt(data, 'statedAuthor'),
      establishedBy: opt(data, 'establishedBy'),
      status: str(data, 'authorshipStatus'),
    },
    authenticity: {
      status: str(data, 'authenticityStatus'),
      compareWith: lines(data, 'compareWith'),
    },
    accessStatus: str(data, 'accessStatus'),
    copyright: str(data, 'copyright'),
    canonicalForMarja: str(data, 'canonical'),
    notes: opt(data, 'notes'),
  };
}

export function passagePayloadFrom(data: FormData): Record<string, unknown> {
  const paragraph = opt(data, 'paragraph');
  return {
    locator: {
      volume: int(data, 'volume'),
      page: opt(data, 'page'),
      masalah: opt(data, 'masalah'),
      istiftaId: opt(data, 'istiftaId'),
      section: opt(data, 'section'),
      ...(paragraph === null ? {} : { paragraph }),
      url: opt(data, 'locatorUrl'),
    },
    originalLanguage: str(data, 'originalLanguage'),
    text: str(data, 'text'),
    precautionWording: opt(data, 'precautionWording'),
    notes: opt(data, 'notes'),
  };
}

export function translationPayloadFrom(data: FormData): Record<string, unknown> {
  return {
    language: str(data, 'language'),
    text: str(data, 'translationText'),
    translator: str(data, 'translator'),
    notes: opt(data, 'notes'),
  };
}

export function findingPayloadFrom(data: FormData): Record<string, unknown> {
  return {
    language: str(data, 'writtenIn'),
    scenario: opt(data, 'scenario'),
    conclusion: str(data, 'conclusion'),
    explanation: str(data, 'explanation'),
    precaution: str(data, 'precaution'),
    conditions: lines(data, 'conditions'),
    exceptions: lines(data, 'exceptions'),
    qualifications: lines(data, 'qualifications'),
    unresolvedIssues: lines(data, 'unresolvedIssues'),
    notes: opt(data, 'notes'),
  };
}

export function rulingPayloadFrom(data: FormData): Record<string, unknown> {
  return {
    language: str(data, 'writtenIn'),
    conclusion: str(data, 'conclusion'),
    explanation: str(data, 'explanation'),
    precaution: str(data, 'precaution'),
    conditions: lines(data, 'conditions'),
    exceptions: lines(data, 'exceptions'),
    notes: opt(data, 'notes'),
  };
}

export const PAYLOAD_BUILDERS: Readonly<
  Record<
    'sources' | 'passages' | 'translations' | 'findings' | 'rulings',
    (data: FormData) => Record<string, unknown>
  >
> = {
  sources: sourcePayloadFrom,
  passages: passagePayloadFrom,
  translations: translationPayloadFrom,
  findings: findingPayloadFrom,
  rulings: rulingPayloadFrom,
};
