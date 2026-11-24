import { ruleRequestRecordSchema, type RuleRequestRecord } from '@khums/validation';

import { deepFreeze } from '../governance/ledger';

/**
 * Scholar requests (Phase 4): a missing rule or a calculation change, resolved at most once by a
 * second record. Pure: the API supplies stored records, ids, the actor and the clock.
 */

export type RuleRequest = Extract<RuleRequestRecord, { type: 'REQUEST' }>;
export type RuleRequestResolution = Extract<RuleRequestRecord, { type: 'RESOLUTION' }>;

export interface RuleRequestView {
  readonly request: RuleRequest;
  readonly resolution: RuleRequestResolution | null;
}

/**
 * The requests of one Marja with their resolution, newest first; null when the records do not
 * form a valid set (a malformed record, another Marja, a duplicate, or a resolution without its
 * request): fail closed.
 */
export function ruleRequestViews(
  marjaId: string,
  raw: readonly unknown[],
): readonly RuleRequestView[] | null {
  const requests = new Map<string, RuleRequest>();
  const resolutions = new Map<string, RuleRequestResolution>();
  for (const item of raw) {
    const parsed = ruleRequestRecordSchema.safeParse(item);
    if (!parsed.success || parsed.data.marjaId !== marjaId) return null;
    const record = parsed.data;
    const target = record.type === 'REQUEST' ? requests : resolutions;
    if (target.has(record.requestId)) return null;
    if (record.type === 'REQUEST') requests.set(record.requestId, record);
    else resolutions.set(record.requestId, record);
  }
  if ([...resolutions.keys()].some((id) => !requests.has(id))) return null;
  const views = [...requests.values()]
    .sort((a, b) =>
      a.at === b.at ? b.requestId.localeCompare(a.requestId) : b.at.localeCompare(a.at),
    )
    .map((request) => ({ request, resolution: resolutions.get(request.requestId) ?? null }));
  return deepFreeze(views);
}

export type RuleRequestRefusal = 'RECORD_INVALID' | 'REQUEST_NOT_FOUND' | 'ALREADY_RESOLVED';

/** A new request record, or why it cannot be stored. */
export function newRuleRequest(input: {
  readonly requestId: string;
  readonly marjaId: string;
  readonly kind: unknown;
  readonly ruleId: string | null;
  readonly message: unknown;
  readonly actor: string;
  readonly at: string;
}): RuleRequest | 'RECORD_INVALID' {
  const parsed = ruleRequestRecordSchema.safeParse({ type: 'REQUEST', ...input });
  return parsed.success && parsed.data.type === 'REQUEST'
    ? deepFreeze(parsed.data)
    : 'RECORD_INVALID';
}

/** The resolution of an open request, or why it cannot be stored. */
export function resolveRuleRequest(
  views: readonly RuleRequestView[],
  input: {
    readonly requestId: string;
    readonly note: unknown;
    readonly actor: string;
    readonly at: string;
  },
): RuleRequestResolution | RuleRequestRefusal {
  const view = views.find((v) => v.request.requestId === input.requestId);
  if (view === undefined) return 'REQUEST_NOT_FOUND';
  if (view.resolution !== null) return 'ALREADY_RESOLVED';
  const parsed = ruleRequestRecordSchema.safeParse({
    type: 'RESOLUTION',
    marjaId: view.request.marjaId,
    ...input,
  });
  return parsed.success && parsed.data.type === 'RESOLUTION'
    ? deepFreeze(parsed.data)
    : 'RECORD_INVALID';
}
