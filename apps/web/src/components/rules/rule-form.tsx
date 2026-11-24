'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import type { FinancialFactKind } from '@khums/shared-types';
import {
  BUILDER_CATEGORIES,
  BUILDER_CONDITION_EFFECTS,
  BUILDER_CONDITION_SCOPES,
  BUILDER_DEDUCTION_TYPES,
  BUILDER_REQUIREMENT_FLAGS,
  BUILDER_THRESHOLD_BASES,
  BUILDER_THRESHOLD_EFFECTS,
  type BuilderConditionEffect,
  type BuilderConditionScope,
  type BuilderEntryRef,
  type BuilderRuleContent,
} from '@khums/core';
import type { ScholarRuleCheckResponse } from '@khums/api-client';
import { Alert, AlertDescription } from '@khums/ui/components/alert';
import { Button } from '@khums/ui/components/button';
import { Field } from '@khums/ui/components/field';
import { Input } from '@khums/ui/components/input';
import { NativeSelect } from '@khums/ui/components/native-select';
import { Textarea } from '@khums/ui/components/textarea';

import { staffBrowserApi } from '@/components/admin/staff-browser-api';
import { ActionForm, ReasonField } from '@/components/console/action-form';
import { problemMessage } from '@/components/console/problem-message';
import type { ConsoleContent } from '@/content/console/types';
import type { FactsContent } from '@/content/facts/types';
import type { RulesContent } from '@/content/rules/types';
import { formatMessage } from '@/i18n/format';

import { RequirementResult } from './requirement-result';
import {
  builderContentFrom,
  ENTRY_TYPES,
  entryValue,
  FACT_KINDS,
  RULE_FIELDS,
  ruleRefusalCodes,
} from './rule-content';

export interface RuleCandidate {
  readonly value: string;
  readonly label: string;
}

export interface RuleFormProps {
  readonly mode: 'create' | 'revise';
  readonly marjaId: string;
  readonly ruleId?: string;
  readonly expectedRevision?: number;
  readonly initial?: BuilderRuleContent;
  readonly rulings: readonly RuleCandidate[];
  readonly sources: readonly RuleCandidate[];
  /** Locale-prefixed path of the rule pages, for opening a created rule. */
  readonly rulesPath: string;
  readonly rules: RulesContent;
  readonly facts: Pick<FactsContent, 'kinds' | 'subtypes'>;
  readonly common: ConsoleContent['common'];
}

interface ConditionRow {
  readonly key: number;
  readonly scope: BuilderConditionScope;
  readonly label: string;
  readonly effect: BuilderConditionEffect;
  readonly entries?: readonly BuilderEntryRef[];
  readonly openingValues?: true;
}

/**
 * The rule builder form (Phase 2 step 3): predefined fields only (selects, checkboxes, decimal
 * inputs, ruling and source pickers). Nothing is pre-filled except the scholar's own previous
 * revision; the rate is never defaulted. "Check requirements" runs the developer-requirement check
 * on the unsaved content; the API validates, authorizes and audits every save.
 */
export function RuleForm(props: RuleFormProps) {
  const router = useRouter();
  const { rules: r, initial } = props;
  const f = r.form;
  const has = (list: readonly BuilderEntryRef[] | undefined, ref: BuilderEntryRef) =>
    list?.some((e) => entryValue(e) === entryValue(ref)) ?? false;
  const subtypeLabel = (ref: BuilderEntryRef) =>
    (props.facts.subtypes[ref.kind] as Readonly<Record<string, string>>)[ref.subtype] ??
    ref.subtype;

  const [conditions, setConditions] = useState<ConditionRow[]>(
    (initial?.conditions ?? []).map((c, key) => ({ key, ...c })),
  );
  const [nextKey, setNextKey] = useState(conditions.length);
  const [threshold, setThreshold] = useState(initial?.threshold !== null && initial !== undefined);
  const [other, setOther] = useState(initial?.requirementFlags.includes('OTHER') ?? false);
  const [check, setCheck] = useState<
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'done'; value: ScholarRuleCheckResponse }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const [refusals, setRefusals] = useState<readonly string[]>([]);

  const entryGroup = (
    name: string,
    legend: string,
    hint: string,
    kinds: readonly FinancialFactKind[],
    selected: readonly BuilderEntryRef[] | undefined,
  ): ReactNode => (
    <fieldset className="flex flex-col gap-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{legend}</legend>
      <p className="text-muted-foreground text-sm">{hint}</p>
      {kinds.map((kind) => (
        <fieldset key={kind} className="flex flex-col gap-1">
          <legend className="text-sm font-medium">{props.facts.kinds[kind].label}</legend>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {ENTRY_TYPES.filter((ref) => ref.kind === kind).map((ref) => (
              <label key={entryValue(ref)} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name={name}
                  value={entryValue(ref)}
                  defaultChecked={has(selected, ref)}
                  className="mt-1"
                />
                <span>{subtypeLabel(ref)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </fieldset>
  );

  const deductionKinds: Readonly<Record<string, readonly FinancialFactKind[]>> = {
    LIVING_EXPENSES: ['EXPENSE'],
    COSTS_OF_EARNING: ['EXPENSE', 'LIABILITY'],
    DEDUCTIBLE_DEBTS: ['LIABILITY'],
    HOLDINGS_PURCHASES: ['EXPENSE'],
    COST_OF_ITEMS_SOLD: ['EXPENSE'],
    KHUMS_ALREADY_PAID: ['EXPENSE'],
    PREVIOUSLY_TAXED_VALUE: ['ASSET', 'BALANCE'],
    TAXED_PRINCIPAL: ['ASSET', 'BALANCE'],
    EXEMPT_SAVINGS: ['BALANCE'],
  };
  /** A collapsible list of entry checkboxes (Phase 4 optional fields). */
  const entryChecks = (
    name: string,
    summary: string,
    hint: string,
    refs: readonly BuilderEntryRef[],
    checked: readonly BuilderEntryRef[] | undefined,
  ) => (
    <details className="rounded-md border p-2">
      <summary className="cursor-pointer text-sm font-medium">{summary}</summary>
      <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {refs.map((ref) => (
          <label key={entryValue(ref)} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value={entryValue(ref)}
              defaultChecked={has(checked, ref)}
              className="mt-1"
            />
            <span>
              {subtypeLabel(ref)}{' '}
              <span className="text-muted-foreground">({props.facts.kinds[ref.kind].label})</span>
            </span>
          </label>
        ))}
      </div>
    </details>
  );

  return (
    <ActionForm
      submitLabel={props.mode === 'create' ? f.create : f.revise}
      content={props.common}
      refresh={props.mode === 'revise'}
      onSubmit={async (data) => {
        setRefusals([]);
        const api = staffBrowserApi();
        const content = builderContentFrom(data);
        const raw = data.get('reason');
        const reason = typeof raw === 'string' ? raw : '';
        const result =
          props.mode === 'create'
            ? await api.rules.create({ marjaId: props.marjaId, content, reason })
            : await api.rules.revise(props.ruleId ?? '', {
                expectedRevision: props.expectedRevision ?? 0,
                content,
                reason,
              });
        if (!result.ok) setRefusals(ruleRefusalCodes(result.error));
        return result;
      }}
      onDone={(rule) => {
        if (props.mode === 'create') {
          router.push(
            `${props.rulesPath}/${encodeURIComponent(rule.ruleId)}?marja=${encodeURIComponent(props.marjaId)}`,
          );
        }
      }}
    >
      <Field label={f.category} required>
        <NativeSelect
          name={RULE_FIELDS.category}
          required
          defaultValue={initial?.category ?? BUILDER_CATEGORIES[0]}
        >
          {BUILDER_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {r.categories[category]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={f.ruling} description={f.rulingHint}>
        <NativeSelect name={RULE_FIELDS.ruling} defaultValue={initial?.rulingId ?? ''}>
          <option value="">{f.rulingNone}</option>
          {props.rulings.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={`${f.rate} ${f.optional}`} description={f.rateHint}>
        <Input
          name={RULE_FIELDS.rate}
          inputMode="decimal"
          dir="ltr"
          autoComplete="off"
          pattern="^(0|[1-9][0-9]*)(\.[0-9]+)?$"
          defaultValue={initial?.rate ?? ''}
        />
      </Field>
      {entryGroup(
        RULE_FIELDS.included,
        f.included,
        f.includedHint,
        FACT_KINDS,
        initial?.includedEntries,
      )}

      <fieldset className="flex flex-col gap-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">{f.deductions}</legend>
        <p className="text-muted-foreground text-sm">{f.deductionsHint}</p>
        {BUILDER_DEDUCTION_TYPES.map((type) => (
          <fieldset key={type} className="flex flex-col gap-1">
            <legend className="text-sm font-medium">{r.deductionTypes[type]}</legend>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {ENTRY_TYPES.filter((ref) => deductionKinds[type]?.includes(ref.kind)).map((ref) => (
                <label key={entryValue(ref)} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={RULE_FIELDS.deduction(type)}
                    value={entryValue(ref)}
                    defaultChecked={has(
                      initial?.deductions.find((d) => d.type === type)?.entries,
                      ref,
                    )}
                    className="mt-1"
                  />
                  <span>
                    {subtypeLabel(ref)}{' '}
                    <span className="text-muted-foreground">
                      ({props.facts.kinds[ref.kind].label})
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {/* Khums already paid reduces the amount due, never chosen entries. */}
            {type !== 'KHUMS_ALREADY_PAID' &&
              entryChecks(
                RULE_FIELDS.deductionAgainst(type),
                f.deductionAgainst,
                f.deductionAgainstHint,
                ENTRY_TYPES.filter((ref) => ref.kind === 'INCOME' || ref.kind === 'ASSET'),
                initial?.deductions.find((d) => d.type === type)?.against,
              )}
            {/* Phase 4 (decision 78): the person's inflation figure, and days after the year end. */}
            {type !== 'KHUMS_ALREADY_PAID' && type !== 'EXEMPT_SAVINGS' && (
              <Field label={f.deductionInflation}>
                <NativeSelect
                  name={RULE_FIELDS.deductionInflation(type)}
                  defaultValue={initial?.deductions.find((d) => d.type === type)?.inflation ?? ''}
                >
                  <option value="">{f.deductionInflationNone}</option>
                  <option value="ADDED">{f.deductionInflationAdded}</option>
                  <option value="ONLY">{f.deductionInflationOnly}</option>
                </NativeSelect>
              </Field>
            )}
            {['LIVING_EXPENSES', 'COSTS_OF_EARNING', 'DEDUCTIBLE_DEBTS'].includes(type) && (
              <Field label={f.deductionAfterDays} description={f.deductionAfterDaysHint}>
                <Input
                  name={RULE_FIELDS.deductionAfterDays(type)}
                  inputMode="numeric"
                  pattern="[0-9]{1,2}"
                  defaultValue={String(
                    initial?.deductions.find((d) => d.type === type)?.afterYearEndDays ?? '',
                  )}
                />
              </Field>
            )}
          </fieldset>
        ))}
      </fieldset>

      {entryGroup(
        RULE_FIELDS.exceptions,
        f.exceptions,
        f.exceptionsHint,
        FACT_KINDS,
        initial?.exceptions,
      )}

      <fieldset className="flex flex-col gap-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">{f.conditions}</legend>
        <p className="text-muted-foreground text-sm">{f.conditionsHint}</p>
        {conditions.map((row, index) => {
          const number = String(index + 1);
          const id = String(row.key);
          return (
            <fieldset key={row.key} className="flex flex-col gap-2 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">
                {formatMessage(f.condition, { number })}
              </legend>
              <input type="hidden" name={RULE_FIELDS.conditionIndex} value={id} />
              <Field label={f.conditionLabel} required>
                <Input
                  name={RULE_FIELDS.condition(id, 'label')}
                  required
                  minLength={3}
                  maxLength={300}
                  dir="auto"
                  defaultValue={row.label}
                />
              </Field>
              <Field label={f.conditionScope} required>
                <NativeSelect
                  name={RULE_FIELDS.condition(id, 'scope')}
                  required
                  defaultValue={row.scope}
                >
                  {BUILDER_CONDITION_SCOPES.map((scope) => (
                    <option key={scope} value={scope}>
                      {r.scopes[scope]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={f.conditionEffect} required>
                <NativeSelect
                  name={RULE_FIELDS.condition(id, 'effect')}
                  required
                  defaultValue={row.effect}
                >
                  {BUILDER_CONDITION_EFFECTS.map((effect) => (
                    <option key={effect} value={effect}>
                      {r.effects[effect]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {entryChecks(
                RULE_FIELDS.conditionEntries(id),
                f.conditionEntries,
                f.conditionEntriesHint,
                ENTRY_TYPES,
                row.entries,
              )}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name={RULE_FIELDS.conditionOpening(id)}
                  defaultChecked={row.openingValues === true}
                  className="mt-1"
                />
                <span>{f.conditionOpening}</span>
              </label>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setConditions((rows) => rows.filter((c) => c.key !== row.key));
                  }}
                >
                  {formatMessage(f.removeCondition, { number })}
                </Button>
              </div>
            </fieldset>
          );
        })}
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={conditions.length >= 30}
            onClick={() => {
              setConditions((rows) => [
                ...rows,
                { key: nextKey, scope: 'CALCULATION', label: '', effect: 'STOP_FOR_REVIEW' },
              ]);
              setNextKey((k) => k + 1);
            }}
          >
            {f.addCondition}
          </Button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">{f.threshold}</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name={RULE_FIELDS.thresholdUse}
            checked={threshold}
            onChange={(event) => {
              setThreshold(event.currentTarget.checked);
            }}
            className="mt-1"
          />
          <span>{f.thresholdUse}</span>
        </label>
        {threshold && (
          <>
            <Field label={f.thresholdAmount} required>
              <Input
                name={RULE_FIELDS.thresholdAmount}
                required
                inputMode="decimal"
                dir="ltr"
                pattern="^(0|[1-9][0-9]*)(\.[0-9]+)?$"
                defaultValue={initial?.threshold?.amount ?? ''}
              />
            </Field>
            <Field label={f.thresholdCurrency} required>
              <Input
                name={RULE_FIELDS.thresholdCurrency}
                required
                dir="ltr"
                pattern="^[A-Za-z]{3}$"
                maxLength={3}
                defaultValue={initial?.threshold?.currency ?? ''}
              />
            </Field>
            <Field label={f.thresholdBasis} required>
              <NativeSelect
                name={RULE_FIELDS.thresholdBasis}
                required
                defaultValue={initial?.threshold?.basis ?? ''}
              >
                <option value="" disabled>
                  —
                </option>
                {BUILDER_THRESHOLD_BASES.map((basis) => (
                  <option key={basis} value={basis}>
                    {r.thresholdBases[basis]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={f.thresholdEffect} required>
              <NativeSelect
                name={RULE_FIELDS.thresholdEffect}
                required
                defaultValue={initial?.threshold?.effect ?? ''}
              >
                <option value="" disabled>
                  —
                </option>
                {BUILDER_THRESHOLD_EFFECTS.map((effect) => (
                  <option key={effect} value={effect}>
                    {r.thresholdEffects[effect]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">{f.sources}</legend>
        <p className="text-muted-foreground text-sm">
          {props.sources.length > 0 ? f.sourcesHint : f.noSources}
        </p>
        {props.sources.map((c) => (
          <label key={c.value} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name={RULE_FIELDS.sources}
              value={c.value}
              defaultChecked={initial?.sourceRefs.includes(c.value) ?? false}
              className="mt-1"
            />
            <span dir="auto">{c.label}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">{f.flags}</legend>
        <p className="text-muted-foreground text-sm">{f.flagsHint}</p>
        {BUILDER_REQUIREMENT_FLAGS.map((flag) => (
          <label key={flag} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name={RULE_FIELDS.flags}
              value={flag}
              defaultChecked={initial?.requirementFlags.includes(flag) ?? false}
              onChange={
                flag === 'OTHER'
                  ? (event) => {
                      setOther(event.currentTarget.checked);
                    }
                  : undefined
              }
              className="mt-1"
            />
            <span>{r.flags[flag]}</span>
          </label>
        ))}
        {other && (
          <Field label={f.otherRequirement} required>
            <Textarea
              name={RULE_FIELDS.otherRequirement}
              required
              minLength={3}
              maxLength={1000}
              dir="auto"
              rows={3}
              defaultValue={initial?.otherRequirement ?? ''}
            />
          </Field>
        )}
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name={RULE_FIELDS.periodLongerThanAYear}
          defaultChecked={initial?.periodLongerThanAYear === 'STOP_FOR_REVIEW'}
          className="mt-1"
        />
        <span>
          {f.periodLongerThanAYear}
          <span className="text-muted-foreground block">{f.periodLongerThanAYearHint}</span>
        </span>
      </label>

      <Field label={`${f.notes} ${f.optional}`}>
        <Textarea
          name={RULE_FIELDS.notes}
          maxLength={2000}
          dir="auto"
          rows={3}
          defaultValue={initial?.notes ?? ''}
        />
      </Field>
      <ReasonField content={props.common} />

      <div className="flex flex-col gap-3 border-t pt-3">
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={check.kind === 'busy'}
            onClick={(event) => {
              const form = event.currentTarget.form;
              if (form === null) return;
              setCheck({ kind: 'busy' });
              void staffBrowserApi()
                .rules.check({
                  marjaId: props.marjaId,
                  content: builderContentFrom(new FormData(form)),
                })
                .then((result) => {
                  setCheck(
                    result.ok
                      ? { kind: 'done', value: result.value }
                      : {
                          kind: 'error',
                          message: problemMessage(result.error, props.common.errors).message,
                        },
                  );
                });
            }}
          >
            {check.kind === 'busy' ? f.checking : f.check}
          </Button>
        </div>
        <div aria-live="polite">
          {check.kind === 'done' && (
            <RequirementResult check={check.value} rules={r} headingLevel={3} />
          )}
          {check.kind === 'error' && (
            <Alert variant="destructive">
              <AlertDescription>{check.message}</AlertDescription>
            </Alert>
          )}
        </div>
        {refusals.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              <ul className="list-disc ps-5">
                {refusals.map((code) => (
                  <li key={code}>
                    {(r.refusals as Readonly<Record<string, string>>)[code] ??
                      (r.check.errors as Readonly<Record<string, string>>)[code] ??
                      code}{' '}
                    <code dir="ltr" className="text-xs">
                      {code}
                    </code>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </ActionForm>
  );
}
