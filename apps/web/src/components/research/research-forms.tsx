'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import type { ResearchRecordType, ResearchTransitionPath } from '@khums/api-client';
import type { AiInvolvement, ResearchReference } from '@khums/shared-types';
import { Field } from '@khums/ui/components/field';
import { Input } from '@khums/ui/components/input';
import { NativeSelect } from '@khums/ui/components/native-select';
import { Textarea } from '@khums/ui/components/textarea';

import { staffBrowserApi } from '@/components/admin/staff-browser-api';
import { ActionForm } from '@/components/console/action-form';
import type { ConsoleContent } from '@/content/console/types';
import type { ResearchContent } from '@/content/research/types';

import { PAYLOAD_BUILDERS, referencesFrom } from './payloads';

/** A record that may be cited, as a form value (`referenceValue`) and a readable label. */
export interface Candidate {
  readonly value: string;
  readonly entityId: string;
  readonly label: string;
}

export interface Candidates {
  readonly sources?: readonly Candidate[];
  readonly passages?: readonly Candidate[];
  readonly translations?: readonly Candidate[];
  readonly findings?: readonly Candidate[];
}

export interface RecordFormProps {
  readonly type: ResearchRecordType;
  /** `version`: a correction of the current ruling version `entityId` (M5.3.5). */
  readonly mode: 'create' | 'revise' | 'version';
  readonly marjaId: string;
  readonly entityId?: string;
  readonly expectedRevision?: number;
  readonly initial?: {
    readonly payload: Readonly<Record<string, unknown>>;
    readonly references: readonly ResearchReference[];
    readonly aiInvolvement: readonly AiInvolvement[];
  };
  readonly candidates: Candidates;
  readonly questions: readonly { readonly id: string; readonly topic: string }[];
  /** Locale-prefixed path of the type's records, for opening the saved record. */
  readonly recordsPath: string;
  readonly research: ResearchContent;
  readonly common: ConsoleContent['common'];
}

const get = (payload: Readonly<Record<string, unknown>> | undefined, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)[key]
      : undefined;
  }, payload);
const text = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
const joined = (value: unknown): string =>
  Array.isArray(value) ? value.filter((v) => typeof v === 'string').join('\n') : '';

/**
 * Create / revise / correct a research record with plain fields (M5.3.7). The API decides
 * everything: permissions, Marja scope, lifecycle, references and every field rule.
 */
export function ResearchRecordForm(props: RecordFormProps) {
  const router = useRouter();
  const { research: r, type, initial } = props;
  const f = r.fields;
  const p = initial?.payload;
  const cited = new Set(initial?.references.map((ref) => ref.entityId) ?? []);
  const t = (name: string, path: string, label: string, opts: FieldOpts = {}) => (
    <Field
      label={label}
      required={opts.required === true}
      {...(opts.hint === undefined ? {} : { description: opts.hint })}
    >
      <Input
        name={name}
        defaultValue={text(get(p, path))}
        required={opts.required}
        dir={opts.dir}
        type={opts.type}
        min={opts.min}
        max={opts.max}
      />
    </Field>
  );
  const area = (name: string, path: string, label: string, opts: FieldOpts = {}) => (
    <Field
      label={label}
      required={opts.required === true}
      {...(opts.hint === undefined ? {} : { description: opts.hint })}
    >
      <Textarea
        name={name}
        defaultValue={opts.lines === true ? joined(get(p, path)) : text(get(p, path))}
        required={opts.required}
        dir={opts.dir ?? 'auto'}
        rows={opts.rows ?? 3}
      />
    </Field>
  );
  const select = (
    name: string,
    path: string,
    label: string,
    options: Readonly<Record<string, string>>,
  ) => (
    <Field label={label} required>
      <NativeSelect
        name={name}
        defaultValue={text(get(p, path)) || Object.keys(options)[0]}
        required
      >
        {Object.entries(options).map(([value, optionLabel]) => (
          <option key={value} value={value}>
            {optionLabel}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
  const single = (name: string, label: string, list: readonly Candidate[] | undefined) => (
    <Field label={label} required {...(list?.length ? {} : { description: f.noCandidates })}>
      <NativeSelect
        name={name}
        required
        defaultValue={list?.find((c) => cited.has(c.entityId))?.value ?? ''}
      >
        <option value="" disabled>
          —
        </option>
        {(list ?? []).map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
  const many = (
    name: string,
    label: string,
    hint: string,
    list: readonly Candidate[] | undefined,
  ) => (
    <fieldset className="flex flex-col gap-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <p className="text-muted-foreground text-sm">{list?.length ? hint : f.noCandidates}</p>
      {(list ?? []).map((c) => (
        <label key={c.value} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name={name}
            value={c.value}
            defaultChecked={cited.has(c.entityId)}
            className="mt-1"
          />
          <span dir="auto">{c.label}</span>
        </label>
      ))}
    </fieldset>
  );

  let fields: ReactNode;
  switch (type) {
    case 'sources':
      fields = (
        <>
          {t('titleOriginal', 'title.original', f.titleOriginal, { required: true, dir: 'auto' })}
          {t('titleTranslation', 'title.translation', `${f.titleTranslation} ${f.optional}`, {
            dir: 'auto',
          })}
          {t('originalLanguage', 'originalLanguage', f.originalLanguage, {
            required: true,
            hint: f.languageHint,
            dir: 'ltr',
          })}
          {select('sourceClass', 'sourceClass', f.sourceClass, r.options.sourceClass)}
          {t('sourceTier', 'sourceTier', f.sourceTier, {
            required: true,
            hint: f.tierHint,
            type: 'number',
            min: 1,
            max: 4,
          })}
          {t('publisher', 'publisher', `${f.publisher} ${f.optional}`, { dir: 'auto' })}
          {t('edition', 'edition', `${f.edition} ${f.optional}`, { dir: 'auto' })}
          {t(
            'publicationOriginal',
            'publicationDate.original',
            `${f.publicationOriginal} ${f.optional}`,
            {
              dir: 'auto',
            },
          )}
          {t(
            'publicationGregorian',
            'publicationDate.gregorian',
            `${f.publicationGregorian} ${f.optional}`,
            {
              type: 'date',
            },
          )}
          {t('url', 'url', `${f.url} ${f.optional}`, { type: 'url', dir: 'ltr' })}
          {t('statedAuthor', 'authorship.statedAuthor', `${f.statedAuthor} ${f.optional}`, {
            dir: 'auto',
          })}
          {area('establishedBy', 'authorship.establishedBy', `${f.establishedBy} ${f.optional}`)}
          {select(
            'authorshipStatus',
            'authorship.status',
            f.authorshipStatus,
            r.options.authorship,
          )}
          {select(
            'authenticityStatus',
            'authenticity.status',
            f.authenticityStatus,
            r.options.authenticity,
          )}
          {area('compareWith', 'authenticity.compareWith', `${f.compareWith} ${f.optional}`, {
            lines: true,
            hint: f.linesHint,
          })}
          {select('accessStatus', 'accessStatus', f.accessStatus, r.options.access)}
          {select('copyright', 'copyright', f.copyright, r.options.copyright)}
          {select('canonical', 'canonicalForMarja', f.canonical, r.options.canonical)}
          {area('notes', 'notes', `${f.notes} ${f.optional}`)}
        </>
      );
      break;
    case 'passages':
      fields = (
        <>
          {single('source', f.source, props.candidates.sources)}
          <p className="text-muted-foreground text-sm">{f.locatorHint}</p>
          <div className="grid gap-3 md:grid-cols-3">
            {t('volume', 'locator.volume', `${f.volume} ${f.optional}`, { type: 'number', min: 1 })}
            {t('page', 'locator.page', `${f.page} ${f.optional}`)}
            {t('masalah', 'locator.masalah', `${f.masalah} ${f.optional}`)}
            {t('istiftaId', 'locator.istiftaId', `${f.istiftaId} ${f.optional}`)}
            {t('section', 'locator.section', `${f.section} ${f.optional}`, { dir: 'auto' })}
            {t('paragraph', 'locator.paragraph', `${f.paragraph} ${f.optional}`)}
          </div>
          {t('locatorUrl', 'locator.url', `${f.locatorUrl} ${f.optional}`, {
            type: 'url',
            dir: 'ltr',
          })}
          {t('originalLanguage', 'originalLanguage', f.originalLanguage, {
            required: true,
            hint: f.languageHint,
            dir: 'ltr',
          })}
          {area('text', 'text', f.text, { required: true, hint: f.textHint, rows: 6 })}
          {area('precautionWording', 'precautionWording', `${f.precautionWording} ${f.optional}`)}
          {area('notes', 'notes', `${f.notes} ${f.optional}`)}
        </>
      );
      break;
    case 'translations':
      fields = (
        <>
          {single('passage', f.passage, props.candidates.passages)}
          {select('language', 'language', f.language, r.options.translationLanguage)}
          {area('translationText', 'text', f.translationText, { required: true, rows: 6 })}
          {t('translator', 'translator', f.translator, { required: true, dir: 'auto' })}
          {area('notes', 'notes', `${f.notes} ${f.optional}`)}
        </>
      );
      break;
    case 'findings':
    case 'rulings':
      fields = (
        <>
          {type === 'findings' && props.mode === 'create' && (
            <Field label={f.question} required>
              <NativeSelect name="questionId" required defaultValue="">
                <option value="" disabled>
                  —
                </option>
                {props.questions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.id} — {r.dashboard.topics[q.topic as keyof typeof r.dashboard.topics]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {type === 'rulings' &&
            many('findings', f.findings, f.findingsHint, props.candidates.findings)}
          {many('passages', f.passages, f.passagesHint, props.candidates.passages)}
          {many('translations', f.translations, f.translationsHint, props.candidates.translations)}
          {t('writtenIn', 'language', f.writtenIn, {
            required: true,
            hint: f.languageHint,
            dir: 'ltr',
          })}
          {type === 'findings' && area('scenario', 'scenario', `${f.scenario} ${f.optional}`)}
          {area('conclusion', 'conclusion', f.conclusion, { required: true })}
          {area('explanation', 'explanation', f.explanation, { required: true, rows: 5 })}
          {select('precaution', 'precaution', f.precaution, r.options.precaution)}
          {area('conditions', 'conditions', `${f.conditions} ${f.optional}`, {
            lines: true,
            hint: f.linesHint,
          })}
          {area('exceptions', 'exceptions', `${f.exceptions} ${f.optional}`, {
            lines: true,
            hint: f.linesHint,
          })}
          {type === 'findings' &&
            area('qualifications', 'qualifications', `${f.qualifications} ${f.optional}`, {
              lines: true,
              hint: f.linesHint,
            })}
          {type === 'findings' &&
            area('unresolvedIssues', 'unresolvedIssues', `${f.unresolvedIssues} ${f.optional}`, {
              lines: true,
              hint: f.linesHint,
            })}
          {area('notes', 'notes', `${f.notes} ${f.optional}`)}
        </>
      );
      break;
  }

  const submitLabel =
    props.mode === 'create'
      ? r.list.create
      : props.mode === 'revise'
        ? r.detail.revise
        : r.detail.createVersion;
  return (
    <ActionForm
      submitLabel={submitLabel}
      content={props.common}
      refresh={props.mode === 'revise'}
      onSubmit={(data) => {
        const api = staffBrowserApi();
        const payload = PAYLOAD_BUILDERS[type](data);
        const references = referencesFrom(
          data,
          'source',
          'passage',
          'findings',
          'passages',
          'translations',
        );
        if (props.mode === 'create') {
          const questionId = data.get('questionId');
          return api.research.create(type, {
            marjaId: props.marjaId,
            ...(typeof questionId === 'string' ? { questionId } : {}),
            payload,
            references,
            aiInvolvement: [],
          });
        }
        const expectedRevision = props.expectedRevision ?? 0;
        const id = props.entityId ?? '';
        return props.mode === 'revise'
          ? api.research.revise(type, id, {
              expectedRevision,
              payload,
              references,
              // AI declarations are cumulative: every earlier one is carried forward unchanged.
              aiInvolvement: [...(initial?.aiInvolvement ?? [])],
            })
          : api.research.createRulingVersion(id, {
              expectedRevision,
              payload,
              references,
              aiInvolvement: [],
            });
      }}
      onDone={(record) => {
        if (props.mode !== 'revise') {
          router.push(
            `${props.recordsPath}/${encodeURIComponent(record.entityId)}?marja=${encodeURIComponent(props.marjaId)}`,
          );
        }
      }}
    >
      {fields}
    </ActionForm>
  );
}

interface FieldOpts {
  readonly required?: boolean;
  readonly hint?: string;
  readonly dir?: 'ltr' | 'rtl' | 'auto';
  readonly type?: string;
  readonly min?: number;
  readonly max?: number;
  readonly lines?: boolean;
  readonly rows?: number;
}

const PATH_OF: Readonly<Record<string, ResearchTransitionPath>> = {
  VERIFIED: 'verify',
  REVIEWED: 'review',
  APPROVED: 'approve',
  DISPUTED: 'dispute',
  SUPERSEDED: 'supersede',
  WITHDRAWN: 'withdraw',
  DRAFT_DELETED: 'delete-draft',
};

/**
 * The lifecycle actions available from the record's current state (from core's transition table;
 * the API decides whether this scholar may take them).
 */
export function ResearchActions(props: {
  readonly type: ResearchRecordType;
  readonly entityId: string;
  readonly expectedRevision: number;
  readonly actions: readonly { readonly kind: string; readonly reasonRequired: boolean }[];
  readonly research: ResearchContent;
  readonly common: ConsoleContent['common'];
}) {
  const r = props.research;
  if (props.actions.length === 0) {
    return <p className="text-muted-foreground text-sm">{r.detail.noActions}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {props.actions.map(({ kind, reasonRequired }) => {
        const path = PATH_OF[kind];
        if (path === undefined) return null;
        return (
          <ActionForm
            key={kind}
            submitLabel={r.actions[kind as keyof typeof r.actions]}
            content={props.common}
            variant={kind === 'DRAFT_DELETED' || kind === 'WITHDRAWN' ? 'destructive' : 'primary'}
            onSubmit={(data) => {
              const reason = data.get('reason');
              return staffBrowserApi().research.transition(props.type, props.entityId, path, {
                expectedRevision: props.expectedRevision,
                reason: typeof reason === 'string' && reason.trim() !== '' ? reason.trim() : null,
              });
            }}
          >
            {reasonRequired && (
              <Field label={r.actions.reasonFor} required>
                <Input name="reason" required minLength={3} maxLength={500} />
              </Field>
            )}
          </ActionForm>
        );
      })}
    </div>
  );
}
