import type { CalculationIssue, CalculationIssueCode, IssueSeverity } from '@khums/shared-types';

export const issue = (
  code: CalculationIssueCode,
  message: string,
  path: string | null,
  severity: IssueSeverity = 'error',
): CalculationIssue => ({ code, severity, message, path });

export const hasErrors = (issues: readonly CalculationIssue[]): boolean =>
  issues.some((i) => i.severity === 'error');

/** Re-labels issues as warnings (development mode surfaces readiness gaps without refusing). */
export const asWarnings = (issues: readonly CalculationIssue[]): CalculationIssue[] =>
  issues.map((i) => ({ ...i, severity: 'warning' }));
