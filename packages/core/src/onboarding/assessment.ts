import type { Workflow } from '@khums/shared-types';

/**
 * The assessment workflows the platform knows about: exactly the shared `Workflow` type that the
 * calculation engine runs (`annual`, `first-time`, `missed-year`). No other category exists.
 *
 * Listing a workflow here says nothing about whether it applies to a user, or whether a given
 * Marja's rule pack defines it. Each pack decides which workflows it supports (the engine refuses
 * `WORKFLOW_NOT_SUPPORTED` otherwise).
 */
export const ASSESSMENT_WORKFLOWS = [
  'first-time',
  'annual',
  'missed-year',
] as const satisfies readonly Workflow[];

/** Compile-time guard: the list covers every shared workflow (no drift). */
type MissingWorkflows = Exclude<Workflow, (typeof ASSESSMENT_WORKFLOWS)[number]>;
type AssertNever<T extends never> = T;
export type AssessmentWorkflowsAreExhaustive = AssertNever<MissingWorkflows>;

export type AssessmentSelection =
  | { readonly kind: 'workflow'; readonly workflow: Workflow }
  | { readonly kind: 'missing' }
  | { readonly kind: 'invalid' };

const isWorkflow = (value: string): value is Workflow =>
  (ASSESSMENT_WORKFLOWS as readonly string[]).includes(value);

/** Validates an untrusted submitted assessment type. Never defaults to a workflow. */
export function resolveAssessmentSelection(raw: unknown): AssessmentSelection {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { kind: 'missing' };
  }
  if (typeof raw !== 'string') return { kind: 'invalid' };
  const value = raw.trim();
  return isWorkflow(value) ? { kind: 'workflow', workflow: value } : { kind: 'invalid' };
}
