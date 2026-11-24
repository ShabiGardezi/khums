import type { ScholarRuleCheckResponse, ScholarRuleStatus } from '@khums/api-client';
import { Alert, AlertDescription, AlertTitle } from '@khums/ui/components/alert';
import { Badge } from '@khums/ui/components/badge';

import type { RulesContent } from '@/content/rules/types';

const STATUS_VARIANT: Readonly<Record<ScholarRuleStatus, 'neutral' | 'warning' | 'info'>> = {
  DRAFT: 'neutral',
  DEVELOPER_IMPLEMENTATION_REQUIRED: 'warning',
  READY_FOR_VERIFICATION: 'info',
};

/** The derived status of a builder rule (never an approval). */
export function RuleStatusBadge(props: {
  readonly status: ScholarRuleStatus;
  readonly rules: RulesContent;
}) {
  return <Badge variant={STATUS_VARIANT[props.status]}>{props.rules.statuses[props.status]}</Badge>;
}

const text = <K extends string>(table: Readonly<Record<K, string>>, code: string): string =>
  (table as Readonly<Record<string, string>>)[code] ?? code;

/**
 * The developer-requirement check and what a draft still lacks (Phase 2 step 4), with every
 * missing capability explained. Codes stay visible next to the explanations.
 */
export function RequirementResult(props: {
  readonly check: ScholarRuleCheckResponse;
  readonly rules: RulesContent;
  readonly headingLevel?: 2 | 3;
}) {
  const { check, rules: r } = props;
  const c = r.check;
  const Heading = props.headingLevel === 3 ? 'h3' : 'h2';
  const required = check.requirement.status === 'DEVELOPER_IMPLEMENTATION_REQUIRED';
  return (
    <section aria-label={c.heading} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Heading className="text-lg font-semibold">{c.heading}</Heading>
        <RuleStatusBadge status={check.status} rules={r} />
      </div>
      {required ? (
        <Alert variant="warning">
          <AlertTitle>{c.developerRequired}</AlertTitle>
          <AlertDescription>
            <p>{c.developerRequiredBody}</p>
            <ul className="mt-2 list-disc ps-5">
              {check.requirement.capabilities.map((gap, i) => (
                <li key={`${gap.code}-${String(i)}`}>
                  {text(c.capabilities, gap.code)}{' '}
                  <code dir="ltr" className="text-xs">
                    {gap.code}
                  </code>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="info">
          <AlertDescription>{c.supported}</AlertDescription>
        </Alert>
      )}
      {check.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>{c.errorsHeading}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ps-5">
              {check.errors.map((e, i) => (
                <li key={`${e.code}-${String(i)}`}>{text(c.errors, e.code)}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {check.missing.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">{c.missingHeading}</p>
          <ul className="list-disc ps-5">
            {check.missing.map((m) => (
              <li key={m.code}>{text(c.missing, m.code)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
