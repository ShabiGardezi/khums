import Link from 'next/link';
import type { ReactNode } from 'react';

import type { ApiClient } from '@khums/api-client';
import { INITIAL_RESEARCH_MARJAS } from '@khums/core';
import { Alert, AlertDescription } from '@khums/ui/components/alert';

import type { RuleCandidate } from '@/components/rules/rule-form';
import type { RulesContent } from '@/content/rules/types';

import { listAll } from './research-workspace';

/**
 * SERVER-ONLY helpers of the rule builder pages (Phase 2 steps 3–4). Reads only, through the API
 * (which authorizes every call per Marja and permission); nothing here decides anything.
 */

type RuleMarja = 'sistani' | 'khamenei';

/** The Marja chosen by `?marja=` among the research Marjas (rules exist only there). */
export function chosenRuleMarja(requested: string | string[] | undefined): RuleMarja {
  const wanted = typeof requested === 'string' ? requested : undefined;
  return (INITIAL_RESEARCH_MARJAS.find((m) => m === wanted) ??
    INITIAL_RESEARCH_MARJAS[0] ??
    'sistani') as RuleMarja;
}

/** Ruling and source/passage choices of one Marja (labels never include research text). */
export async function ruleCandidates(
  api: ApiClient,
  marjaId: string,
): Promise<{ rulings: RuleCandidate[]; sources: RuleCandidate[] } | null> {
  const [rulings, sources, passages] = await Promise.all([
    listAll(api, 'rulings', marjaId),
    listAll(api, 'sources', marjaId),
    listAll(api, 'passages', marjaId),
  ]);
  if (rulings === null || sources === null || passages === null) return null;
  const live = <T extends { state: string }>(items: readonly T[]) =>
    items.filter(
      (i) => i.state !== 'DELETED' && i.state !== 'WITHDRAWN' && i.state !== 'SUPERSEDED',
    );
  return {
    rulings: live(rulings).map((i) => ({
      value: i.entityId,
      label: `${i.displayRef} (v${String(i.rulingVersion ?? '')}, ${i.state})`,
    })),
    sources: live([...sources, ...passages]).map((i) => ({
      value: i.entityId,
      label: i.label === i.displayRef ? i.displayRef : `${i.displayRef} — ${i.label}`,
    })),
  };
}

/** Marja switcher and the standing notice around every rule builder page. */
export function RulesShell(props: {
  readonly rules: RulesContent;
  readonly href: (path: string) => string;
  readonly marjaId: RuleMarja;
  readonly children: ReactNode;
}) {
  const { rules: r } = props;
  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <AlertDescription>{r.notice}</AlertDescription>
      </Alert>
      <nav aria-label={r.marja.label} className="flex flex-wrap gap-2">
        {(INITIAL_RESEARCH_MARJAS as readonly RuleMarja[]).map((m) => (
          <Link
            key={m}
            href={props.href(`/admin/rules?marja=${encodeURIComponent(m)}`)}
            aria-current={m === props.marjaId ? 'page' : undefined}
            className="aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground rounded-md border px-3 py-1.5 text-sm"
          >
            {r.marja.names[m]}
          </Link>
        ))}
      </nav>
      {props.children}
    </div>
  );
}
