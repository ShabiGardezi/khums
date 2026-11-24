import Link from 'next/link';
import type { ReactNode } from 'react';

import type {
  ApiClient,
  ResearchListItem,
  ResearchMarjasResponse,
  ResearchRecordType,
} from '@khums/api-client';
import { Alert, AlertDescription } from '@khums/ui/components/alert';
import { Badge } from '@khums/ui/components/badge';

import { researchPermissionFor } from '@khums/core';
import type { ResearchEntityType } from '@khums/shared-types';

import type { Candidate, Candidates } from '@/components/research/research-forms';
import { referenceValue } from '@/components/research/payloads';
import type { ResearchContent, ResearchStateKey } from '@/content/research/types';

/**
 * SERVER-ONLY helpers of the scholar research workspace (M5.3.7). Reads only, through the API
 * (which authorizes every call per Marja and permission); nothing here decides anything.
 */

export const RESEARCH_TYPES: readonly ResearchRecordType[] = [
  'sources',
  'passages',
  'translations',
  'findings',
  'rulings',
];

export const isResearchType = (value: string): value is ResearchRecordType =>
  (RESEARCH_TYPES as readonly string[]).includes(value);

export type ResearchMarja = ResearchMarjasResponse['marjas'][number];

/** The Marja chosen by `?marja=`, if the caller holds research permissions there; else the first. */
export function chosenMarja(
  marjas: readonly ResearchMarja[],
  requested: string | string[] | undefined,
): ResearchMarja | null {
  const wanted = typeof requested === 'string' ? requested : undefined;
  return marjas.find((m) => m.marjaId === wanted) ?? marjas[0] ?? null;
}

/** Every record of one type in one Marja (all pages; the API pages by 100). */
export async function listAll(
  api: ApiClient,
  type: ResearchRecordType,
  marjaId: string,
  state?: string,
): Promise<ResearchListItem[] | null> {
  const items: ResearchListItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const result = await api.research.list(type, {
      marjaId,
      limit: 100,
      ...(state === undefined ? {} : { state }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!result.ok) return null;
    items.push(...result.value.items);
    cursor = result.value.nextCursor ?? undefined;
    if (cursor === undefined) return items;
  }
  return items;
}

const STATE_VARIANT: Readonly<
  Record<ResearchStateKey, 'neutral' | 'info' | 'success' | 'warning' | 'outline'>
> = {
  DRAFT: 'neutral',
  VERIFIED: 'info',
  REVIEWED: 'info',
  APPROVED: 'success',
  DISPUTED: 'warning',
  SUPERSEDED: 'outline',
  WITHDRAWN: 'outline',
  DELETED: 'outline',
};

export function StateBadge(props: { readonly state: string; readonly research: ResearchContent }) {
  const key = props.state as ResearchStateKey;
  return <Badge variant={STATE_VARIANT[key]}>{props.research.states[key]}</Badge>;
}

/** Marja switcher, section navigation and the standing notice around every workspace page. */
export function ResearchShell(props: {
  readonly research: ResearchContent;
  readonly href: (path: string) => string;
  readonly marjas: readonly ResearchMarja[];
  readonly marja: ResearchMarja;
  readonly current: 'dashboard' | ResearchRecordType;
  readonly children: ReactNode;
}) {
  const { research: r, href, marja } = props;
  const link = (path: string, marjaId = marja.marjaId) =>
    href(`${path}?marja=${encodeURIComponent(marjaId)}`);
  const sections: readonly ['dashboard' | ResearchRecordType, string][] = [
    ['dashboard', '/admin/research'],
    ...RESEARCH_TYPES.map((t) => [t, `/admin/research/${t}`] as [ResearchRecordType, string]),
  ];
  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <AlertDescription>{r.notice}</AlertDescription>
      </Alert>
      {props.marjas.length > 1 && (
        <nav aria-label={r.marja.label} className="flex flex-wrap gap-2">
          {props.marjas.map((m) => (
            <Link
              key={m.marjaId}
              href={link('/admin/research', m.marjaId)}
              aria-current={m.marjaId === marja.marjaId ? 'page' : undefined}
              className="aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground rounded-md border px-3 py-1.5 text-sm"
            >
              {r.marja.names[m.marjaId as 'sistani' | 'khamenei']}
            </Link>
          ))}
        </nav>
      )}
      <p className="text-lg font-semibold">
        {r.marja.names[marja.marjaId as 'sistani' | 'khamenei']}
      </p>
      <nav aria-label={r.nav.label} className="flex flex-wrap gap-2 border-b pb-3">
        {sections.map(([key, path]) => (
          <Link
            key={key}
            href={link(path)}
            aria-current={props.current === key ? 'page' : undefined}
            className="hover:bg-muted aria-[current=page]:bg-muted rounded-md px-3 py-1.5 text-sm font-medium"
          >
            {r.nav[key]}
          </Link>
        ))}
      </nav>
      {props.children}
    </div>
  );
}

const ENTITY: Readonly<Record<ResearchRecordType, ResearchEntityType>> = {
  sources: 'SOURCE',
  passages: 'PASSAGE',
  translations: 'TRANSLATION',
  findings: 'FINDING',
  rulings: 'RULING',
};
export const entityTypeOf = (type: ResearchRecordType): ResearchEntityType => ENTITY[type];
export const recordTypeOf = (entityType: ResearchEntityType): ResearchRecordType =>
  RESEARCH_TYPES.find((t) => ENTITY[t] === entityType) ?? 'sources';

/** Whether the caller's permissions in this Marja allow creating this type (core's mapping). */
export const canCreate = (type: ResearchRecordType, permissions: readonly string[]): boolean => {
  const permission = researchPermissionFor(ENTITY[type], 'CREATE');
  return permission !== null && permissions.includes(permission);
};

const candidate = (item: ResearchListItem): Candidate => ({
  value: referenceValue(item),
  entityId: item.entityId,
  label: `${item.displayRef} — ${item.label}`,
});

/**
 * Records a new or revised record of `type` may cite, in the states its approval will need
 * (verified sources and passages, reviewed translations, approved findings). The API re-checks.
 */
export async function candidatesFor(
  api: ApiClient,
  type: ResearchRecordType,
  marjaId: string,
): Promise<Candidates | null> {
  const load = async (t: ResearchRecordType, state: string) => {
    const items = await listAll(api, t, marjaId, state);
    return items?.map(candidate) ?? null;
  };
  switch (type) {
    case 'sources':
      return {};
    case 'passages': {
      const sources = await load('sources', 'VERIFIED');
      return sources === null ? null : { sources };
    }
    case 'translations': {
      const passages = await load('passages', 'VERIFIED');
      return passages === null ? null : { passages };
    }
    case 'findings':
    case 'rulings': {
      const passages = await load('passages', 'VERIFIED');
      const translations = await load('translations', 'REVIEWED');
      const findings = type === 'rulings' ? await load('findings', 'APPROVED') : [];
      return passages === null || translations === null || findings === null
        ? null
        : { passages, translations, findings };
    }
  }
}
