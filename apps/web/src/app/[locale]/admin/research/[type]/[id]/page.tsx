import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import {
  REASON_REQUIRED,
  RESEARCH_QUESTION_CATALOGUE,
  RESEARCH_TRANSITIONS,
  researchPermissionFor,
  rulingReviewStatus,
} from '@khums/core';
import type { ResearchState } from '@khums/shared-types';

import { RuleStatusBadge } from '@/components/results/rule-status-context';
import { ResearchActions, ResearchRecordForm } from '@/components/research/research-forms';
import type { ResearchContent } from '@/content/research/types';
import { ScrollRegion } from '@/components/console/scroll-region';
import { getI18n } from '@/i18n/server';
import { consolePage } from '@/server/console-page';
import {
  candidatesFor,
  chosenMarja,
  entityTypeOf,
  isResearchType,
  recordTypeOf,
  ResearchShell,
  StateBadge,
} from '@/server/research-workspace';

export async function generateMetadata(): Promise<Metadata> {
  const { research } = await getI18n();
  return { title: research.title, robots: { index: false, follow: false } };
}

type FieldKey = keyof ResearchContent['fields'];
/** Readable labels for payload fields (anything else shows its field name). */
const LABELS: Readonly<Record<string, FieldKey>> = {
  'title.original': 'titleOriginal',
  'title.translation': 'titleTranslation',
  originalLanguage: 'originalLanguage',
  sourceClass: 'sourceClass',
  sourceTier: 'sourceTier',
  publisher: 'publisher',
  edition: 'edition',
  'publicationDate.original': 'publicationOriginal',
  'publicationDate.gregorian': 'publicationGregorian',
  url: 'url',
  'authorship.statedAuthor': 'statedAuthor',
  'authorship.establishedBy': 'establishedBy',
  'authorship.status': 'authorshipStatus',
  'authenticity.status': 'authenticityStatus',
  'authenticity.compareWith': 'compareWith',
  accessStatus: 'accessStatus',
  copyright: 'copyright',
  canonicalForMarja: 'canonical',
  'locator.volume': 'volume',
  'locator.page': 'page',
  'locator.masalah': 'masalah',
  'locator.istiftaId': 'istiftaId',
  'locator.section': 'section',
  'locator.paragraph': 'paragraph',
  'locator.url': 'locatorUrl',
  precautionWording: 'precautionWording',
  translator: 'translator',
  scenario: 'scenario',
  conclusion: 'conclusion',
  explanation: 'explanation',
  precaution: 'precaution',
  conditions: 'conditions',
  exceptions: 'exceptions',
  qualifications: 'qualifications',
  unresolvedIssues: 'unresolvedIssues',
  notes: 'notes',
};

function rows(value: unknown, prefix = ''): [string, string][] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    const scalar = (v: unknown) =>
      typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : '—';
    const shown = Array.isArray(value) ? value.map(scalar).join('\n') : scalar(value);
    return [[prefix, shown]];
  }
  return Object.entries(value).flatMap(([key, inner]) =>
    rows(inner, prefix === '' ? key : `${prefix}.${key}`),
  );
}

/** One research record (M5.3.7): content, cited revisions, history, actions and versions. */
export default async function ResearchRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { type, id } = await params;
  if (!isResearchType(type)) notFound();
  const { console: c, research: r, href, locale } = await getI18n();
  const query = await searchParams;
  return consolePage({
    section: 'research',
    permission: 'research.read',
    title: r.nav[type],
    description: r.description,
    body: async ({ api }) => {
      const record = await api.research.get(type, id);
      if (!record.ok) {
        if (record.error.kind === 'http' && record.error.status === 404) notFound();
        return null;
      }
      const marjas = await api.research.marjas();
      if (!marjas.ok) return null;
      const readable = marjas.value.marjas.filter((m) => m.permissions.includes('research.read'));
      const marja =
        chosenMarja(readable, record.value.marjaId) ?? chosenMarja(readable, query.marja);
      if (marja === null) notFound();
      const rec = record.value;
      const entityType = entityTypeOf(type);
      const state: ResearchState = rec.state;
      const transitions = RESEARCH_TRANSITIONS[entityType][state] ?? {};
      const allowed = (kind: string) => {
        const permission = researchPermissionFor(
          entityType,
          kind as Parameters<typeof researchPermissionFor>[1],
        );
        return permission !== null && marja.permissions.includes(permission);
      };
      const actions = Object.keys(transitions)
        // Revising is the form below; rulings are superseded only by approving a correction.
        .filter((kind) => kind !== 'REVISED' && !(entityType === 'RULING' && kind === 'SUPERSEDED'))
        .filter(allowed)
        .map((kind) => ({
          kind,
          reasonRequired: REASON_REQUIRED.has(kind as Parameters<typeof REASON_REQUIRED.has>[0]),
        }));
      const canRevise = transitions.REVISED !== undefined && allowed('REVISE');
      const versions = type === 'rulings' ? await api.research.rulingVersions(id) : null;
      if (versions !== null && !versions.ok) return null;
      const canCorrect =
        versions?.ok === true &&
        versions.value.current?.entityId === rec.entityId &&
        versions.value.versions.every((v) => v.state !== 'DRAFT') &&
        allowed('CREATE');
      // M5.4: the ruling's review status, derived from its state (never an approval).
      const reviewStatus =
        entityType === 'RULING'
          ? rulingReviewStatus(
              state,
              versions?.ok === true &&
                versions.value.current?.entityId === rec.entityId &&
                versions.value.versions.some((v) => v.state === 'DRAFT'),
            )
          : null;
      const candidates = canRevise || canCorrect ? await candidatesFor(api, type, rec.marjaId) : {};
      if (candidates === null) return null;
      const recordsPath = href(`/admin/research/${type}`);
      const at = (iso: string) =>
        new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(iso),
        );
      const initial = {
        payload: rec.content.payload,
        references: rec.content.references,
        aiInvolvement: rec.content.aiInvolvement,
      };

      return (
        <ResearchShell research={r} href={href} marjas={readable} marja={marja} current={type}>
          <Link
            href={`${recordsPath}?marja=${encodeURIComponent(rec.marjaId)}`}
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            {r.detail.back}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h2 dir="ltr" className="font-mono text-lg font-semibold">
              {rec.displayRef}
            </h2>
            <StateBadge state={rec.state} research={r} />
            {reviewStatus !== null && (
              <RuleStatusBadge
                status={reviewStatus}
                labels={r.reviewStatus.values}
                label={r.reviewStatus.label}
              />
            )}
            {rec.questionId !== null && (
              <span className="text-sm">
                {r.detail.question}: <code dir="ltr">{rec.questionId}</code>
              </span>
            )}
            {rec.rulingVersion !== null && (
              <span className="text-sm">
                {r.detail.version}: {rec.rulingVersion}
              </span>
            )}
          </div>

          <section aria-labelledby="record-content" className="flex flex-col gap-2">
            <h3 id="record-content" className="font-semibold">
              {r.detail.content}
            </h3>
            <dl className="grid gap-x-4 gap-y-2 md:grid-cols-[minmax(10rem,auto)_1fr]">
              {rows(rec.content.payload).map(([path, value]) => {
                const label =
                  path === 'text'
                    ? type === 'translations'
                      ? r.fields.translationText
                      : r.fields.text
                    : path === 'language'
                      ? type === 'translations'
                        ? r.fields.language
                        : r.fields.writtenIn
                      : LABELS[path] === undefined
                        ? path
                        : r.fields[LABELS[path]];
                return (
                  <div key={path} className="contents">
                    <dt className="text-muted-foreground text-sm">{label}</dt>
                    <dd dir="auto" className="text-sm whitespace-pre-wrap">
                      {value}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {rec.content.aiInvolvement.length === 0 && (
              <p className="text-muted-foreground text-xs">{r.detail.aiNone}</p>
            )}
          </section>

          <section aria-labelledby="record-references" className="flex flex-col gap-2">
            <h3 id="record-references" className="font-semibold">
              {r.detail.references}
            </h3>
            {rec.content.references.length === 0 ? (
              <p className="text-muted-foreground text-sm">{r.detail.noReferences}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {rec.content.references.map((ref) => (
                  <li key={`${ref.entityId}@${String(ref.revision)}`}>
                    <Link
                      href={`${href(`/admin/research/${recordTypeOf(ref.entityType)}`)}/${encodeURIComponent(ref.entityId)}?marja=${encodeURIComponent(rec.marjaId)}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {r.nav[recordTypeOf(ref.entityType)]}
                    </Link>{' '}
                    <code dir="ltr" className="text-xs">
                      {ref.entityId} · {r.detail.revision} {ref.revision}
                    </code>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {versions?.ok === true && (
            <section aria-labelledby="record-versions" className="flex flex-col gap-2">
              <h3 id="record-versions" className="font-semibold">
                {r.detail.versions}
              </h3>
              <ul className="flex flex-col gap-1 text-sm">
                {versions.value.versions.map((v) => (
                  <li key={v.entityId} className="flex items-center gap-2">
                    <Link
                      href={`${recordsPath}/${encodeURIComponent(v.entityId)}?marja=${encodeURIComponent(rec.marjaId)}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {r.detail.version} {v.rulingVersion}
                    </Link>
                    <StateBadge state={v.state} research={r} />
                    {v.current && <strong className="text-xs">{r.detail.current}</strong>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="record-actions" className="flex flex-col gap-3">
            <h3 id="record-actions" className="font-semibold">
              {r.detail.actions}
            </h3>
            <ResearchActions
              type={type}
              entityId={rec.entityId}
              expectedRevision={rec.expectedRevision}
              actions={actions}
              research={r}
              common={c.common}
            />
          </section>

          {canRevise && (
            <section
              aria-labelledby="record-revise"
              className="bg-card flex flex-col gap-3 rounded-lg border p-4"
            >
              <h3 id="record-revise" className="font-semibold">
                {r.detail.revise}
              </h3>
              <p className="text-muted-foreground text-sm">{r.detail.reviseHint}</p>
              <ResearchRecordForm
                type={type}
                mode="revise"
                marjaId={rec.marjaId}
                entityId={rec.entityId}
                expectedRevision={rec.expectedRevision}
                initial={initial}
                candidates={candidates}
                questions={RESEARCH_QUESTION_CATALOGUE.questions}
                recordsPath={recordsPath}
                research={r}
                common={c.common}
              />
            </section>
          )}

          {canCorrect && (
            <section
              aria-labelledby="record-correct"
              className="bg-card flex flex-col gap-3 rounded-lg border p-4"
            >
              <h3 id="record-correct" className="font-semibold">
                {r.detail.createVersion}
              </h3>
              <p className="text-muted-foreground text-sm">{r.detail.createVersionHint}</p>
              <ResearchRecordForm
                type="rulings"
                mode="version"
                marjaId={rec.marjaId}
                entityId={rec.entityId}
                expectedRevision={rec.expectedRevision}
                initial={initial}
                candidates={candidates}
                questions={[]}
                recordsPath={recordsPath}
                research={r}
                common={c.common}
              />
            </section>
          )}

          <section aria-labelledby="record-history" className="flex flex-col gap-2">
            <h3 id="record-history" className="font-semibold">
              {r.detail.history}
            </h3>
            <ScrollRegion label={r.detail.history}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-start">
                    <th className="p-2 text-start font-medium">{r.detail.revision}</th>
                    <th className="p-2 text-start font-medium">{r.detail.kind}</th>
                    <th className="p-2 text-start font-medium">{r.detail.actor}</th>
                    <th className="p-2 text-start font-medium">{r.detail.time}</th>
                    <th className="p-2 text-start font-medium">{r.detail.reason}</th>
                  </tr>
                </thead>
                <tbody>
                  {rec.records.map((entry) => (
                    <tr key={entry.recordId} className="border-t">
                      <td className="p-2">{entry.revision}</td>
                      <td className="p-2">
                        <code dir="ltr">{entry.kind}</code>
                      </td>
                      <td className="p-2">
                        <code dir="ltr" className="text-xs">
                          {entry.actor.subject}
                        </code>
                      </td>
                      <td className="p-2">{at(entry.recordedAt)}</td>
                      <td dir="auto" className="p-2">
                        {entry.reason ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </section>
        </ResearchShell>
      );
    },
  });
}
