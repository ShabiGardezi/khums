import type { ProblemDetails } from '@khums/validation';

/**
 * Every failure mode of an API call, as a value. Callers switch on `kind`, and for `http`
 * errors on `problem.code` (stable codes shared with the API via @khums/validation).
 */
export type ApiError =
  | { readonly kind: 'http'; readonly status: number; readonly problem: ProblemDetails }
  | { readonly kind: 'network'; readonly cause: unknown }
  | {
      readonly kind: 'invalid_response';
      readonly status: number;
      readonly issues: readonly string[];
    };
