import type { BuilderAiStage } from '@khums/core';
import { Badge } from '@khums/ui/components/badge';

import type { RulesContent } from '@/content/rules/types';

/**
 * AI preparation and rejection badges of a builder rule revision (Phase 4, decision 76). AI
 * approval is shown with its full wording ("… not verified by a scholar") and never with a
 * success colour, so it can never look like religious approval.
 */
export function PreparationBadges(props: {
  readonly aiStage: BuilderAiStage | null;
  readonly rejected: boolean;
  readonly rules: RulesContent;
}) {
  const p = props.rules.preparation;
  if (props.aiStage === null && !props.rejected) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {props.rejected && (
        <Badge variant="destructive" data-testid="rule-rejected">
          {p.rejected}
        </Badge>
      )}
      {props.aiStage !== null && (
        <Badge variant="warning" data-testid="rule-ai-stage">
          {props.aiStage === 'APPROVED_FOR_SCHOLAR_TESTING' ? p.aiApproved : p.aiDraft}
        </Badge>
      )}
    </span>
  );
}
