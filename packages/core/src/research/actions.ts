import type {
  AiInvolvement,
  AuthorizationDecision,
  GovernanceActorRef,
  ResearchChain,
  ResearchEntityType,
  ResearchReference,
  ResearchRevisionKind,
  ResearchRevisionRecord,
} from '@khums/shared-types';
import { researchChainSchema, researchCommandSchema } from '@khums/validation';

import { authorize } from '../authorization/evaluate';
import { isTrustedPrincipal } from '../authorization/principal';
import { isCatalogueQuestion, RESEARCH_CATALOGUE_REVISION } from './catalogue';
import {
  appendResearchRevision,
  replayResearchChain,
  type ResearchIssueCode,
  type ResearchRevisionDraft,
} from './chain';
import { researchDisplayRef } from './ids';
import { APPROVAL_KINDS, researchPermissionFor, type ResearchAction } from './lifecycle';
import {
  checkResearchReferences,
  type ReferenceIssueCode,
  type ReferenceResolver,
} from './references';
import {
  rulingSeriesForCreate,
  type RulingSeriesInput,
  type RulingSeriesIssueCode,
} from './rulings';
import { isResearchMarja } from './scope';

/**
 * The authorized entry point for research commands (M5.3.2). Authorization first (the permission
 * for the action on `MARJA_RESEARCH` of the entity's Marja; never a governance policy, so the
 * authorized scholar may approve their own work and nothing can require a second person), then the
 * research rules. The Marja comes from the stored chain for every command except CREATE, where the
 * requested Marja must be in scope and in the initial research scope (owner D12). The actor and
 * time are the server's. Never throws; fails closed.
 *
 * Stale commands: REVISE and TRANSITION carry `expectedRevision` (the chain length the caller saw)
 * and are refused with `REVISION_CONFLICT` when it differs from the stored chain. This detects stale
 * commands only; two requests evaluated against the same stored chain can both pass here, so the
 * API must also persist atomically (unique `{entityId, revision}` index inside a transaction,
 * M5.3.3) so that exactly one of them is stored.
 *
 * References: a CREATE or REVISE with references needs `resolve`; every reference is checked with
 * the DRAFT requirements before anything is appended (`REFERENCES_UNRESOLVED` without a resolver;
 * validation is never skipped). VERIFIED/REVIEWED/APPROVED re-check them with the APPROVAL ones.
 */

export type ResearchCommand =
  | {
      readonly type: 'CREATE';
      readonly entityType: ResearchEntityType;
      /** A UUIDv7 drawn by the server. */
      readonly entityId: string;
      readonly marjaId: string;
      /** RULING only (≥ 1); null otherwise. */
      readonly rulingVersion: number | null;
      /** FINDING only: a required catalogue question; null otherwise. */
      readonly questionId: string | null;
      readonly payload: Readonly<Record<string, unknown>>;
      readonly references: readonly ResearchReference[];
      readonly aiInvolvement: readonly AiInvolvement[];
    }
  | {
      readonly type: 'REVISE';
      /** The chain length the caller last saw (`ResearchView.length`). */
      readonly expectedRevision: number;
      readonly payload: Readonly<Record<string, unknown>>;
      readonly references: readonly ResearchReference[];
      readonly aiInvolvement: readonly AiInvolvement[];
    }
  | {
      readonly type: 'TRANSITION';
      /** The chain length the caller last saw (`ResearchView.length`). */
      readonly expectedRevision: number;
      readonly kind: Exclude<ResearchRevisionKind, 'CREATED' | 'REVISED'>;
      readonly reason: string | null;
    };

export interface ResearchCommandInput {
  /** A principal returned by `establishPrincipal`. */
  readonly principal: unknown;
  /** The stored chain (null for CREATE). */
  readonly chain: unknown;
  readonly command: unknown;
  readonly context: {
    readonly decisionId: unknown;
    readonly evaluatedAt: unknown;
    readonly session: unknown;
    readonly requestId: string;
  };
  /** Loads referenced chains; required for any command whose (resulting) content has references. */
  readonly resolve?: ReferenceResolver;
  /**
   * RULING only (M5.3.5): the stored versions of the ruling's series. Required to create a
   * correction (version > 1) and to approve any version (approval supersedes the current one).
   */
  readonly rulingSeries?: RulingSeriesInput;
}

export type ResearchRefusalCode =
  | ResearchIssueCode
  | ReferenceIssueCode
  | RulingSeriesIssueCode
  /** CREATE of a non-finding with a catalogue question (only findings are bound to one). */
  | 'QUESTION_NOT_ALLOWED'
  /** CREATE for a Marja outside the initial research scope (D12). */
  | 'MARJA_NOT_IN_RESEARCH_SCOPE'
  /** References cannot be written, verified or approved without resolving them. */
  | 'REFERENCES_UNRESOLVED'
  /** REVISE/TRANSITION built against a different chain length than the stored one. */
  | 'REVISION_CONFLICT';

export type ResearchCommandOutcome =
  | { readonly status: 'DENIED'; readonly decision: AuthorizationDecision }
  | {
      readonly status: 'REFUSED';
      readonly decision: AuthorizationDecision;
      readonly issues: readonly ResearchRefusalCode[];
    }
  | {
      readonly status: 'APPLIED';
      readonly decision: AuthorizationDecision;
      readonly chain: ResearchChain;
      readonly record: ResearchRevisionRecord;
    };

const invalid = (): ResearchCommandOutcome =>
  Object.freeze({
    status: 'DENIED',
    decision: Object.freeze({
      allowed: false,
      decisionId: null,
      permission: null,
      reason: 'INVALID_REQUEST',
      evaluatedAt: null,
    }),
  });

function run(input: ResearchCommandInput): ResearchCommandOutcome {
  const parsed = researchCommandSchema.safeParse(input.command);
  if (!parsed.success) return invalid();
  const command = parsed.data;

  // Where the Marja and entity type come from: the stored chain, except for CREATE.
  let chain: ResearchChain | null = null;
  let length = 0;
  let entityType: ResearchEntityType;
  let marjaId: string;
  if (command.type === 'CREATE') {
    if (input.chain !== null) return invalid();
    entityType = command.entityType;
    marjaId = command.marjaId;
  } else {
    const stored = researchChainSchema.safeParse(input.chain);
    const view = stored.success ? replayResearchChain(stored.data) : null;
    if (view === null || !view.ok || !stored.success) return invalid();
    chain = stored.data;
    length = view.value.length;
    entityType = view.value.entityType;
    marjaId = view.value.marjaId;
  }
  const action: ResearchAction = command.type === 'TRANSITION' ? command.kind : command.type;
  const permission = researchPermissionFor(entityType, action);
  if (permission === null) return invalid();

  const decision = authorize({
    principal: input.principal,
    permission,
    resource: { type: 'MARJA_RESEARCH', marjaId },
    context: {
      decisionId: input.context.decisionId,
      evaluatedAt: input.context.evaluatedAt,
      session: input.context.session,
      governance: null,
    },
  });
  if (!decision.allowed || !isTrustedPrincipal(input.principal)) {
    return Object.freeze({ status: 'DENIED', decision });
  }
  const refuse = (issues: readonly ResearchRefusalCode[]): ResearchCommandOutcome =>
    Object.freeze({ status: 'REFUSED', decision, issues: Object.freeze([...issues]) });

  if (command.type !== 'CREATE' && command.expectedRevision !== length) {
    return refuse(['REVISION_CONFLICT']);
  }
  /** DRAFT-phase reference resolution for content commands; null when every reference passes. */
  const draftReferenceIssues = (
    references: readonly ResearchReference[],
  ): readonly ResearchRefusalCode[] | null => {
    if (references.length === 0) return null;
    if (input.resolve === undefined) return ['REFERENCES_UNRESOLVED'];
    const issues = checkResearchReferences(marjaId, references, input.resolve, 'DRAFT');
    return issues.length > 0 ? issues.map((i) => i.code) : null;
  };

  const actor = Object.freeze({
    kind: 'STAFF_PRINCIPAL',
    subject: input.principal.principalId,
  }) satisfies GovernanceActorRef;
  const common = {
    actor,
    recordedAt: decision.evaluatedAt,
    decisionId: decision.decisionId,
    requestId: input.context.requestId,
  };

  let result;
  if (command.type === 'CREATE') {
    if (!isResearchMarja(command.marjaId)) return refuse(['MARJA_NOT_IN_RESEARCH_SCOPE']);
    const questionId = command.questionId;
    if (command.entityType === 'FINDING' && !isCatalogueQuestion(questionId)) {
      return refuse(['QUESTION_UNKNOWN']);
    }
    // A catalogue question binds findings only.
    if (command.entityType !== 'FINDING' && questionId !== null) {
      return refuse(['QUESTION_NOT_ALLOWED']);
    }
    let rulingSeriesId: string | null = null;
    if (command.entityType === 'RULING') {
      const series = rulingSeriesForCreate(
        command.entityId,
        command.marjaId,
        command.rulingVersion ?? 0,
        input.rulingSeries,
      );
      if (!series.ok) return refuse([series.error]);
      rulingSeriesId = series.value;
    }
    const referenceIssues = draftReferenceIssues(command.references);
    if (referenceIssues !== null) return refuse(referenceIssues);
    const draft: ResearchRevisionDraft = {
      ...common,
      kind: 'CREATED',
      payload: command.payload,
      references: command.references,
      aiInvolvement: command.aiInvolvement,
      reason: null,
    };
    result = appendResearchRevision(
      null,
      {
        entityType: command.entityType,
        entityId: command.entityId,
        displayRef: researchDisplayRef(
          command.entityType,
          command.marjaId,
          command.entityId,
          command.entityType === 'FINDING' ? questionId : null,
        ),
        marjaId: command.marjaId,
        rulingVersion: command.rulingVersion,
        rulingSeriesId,
        question:
          command.entityType === 'FINDING' && questionId !== null
            ? { id: questionId, catalogueRevision: RESEARCH_CATALOGUE_REVISION }
            : null,
      },
      draft,
    );
  } else if (command.type === 'REVISE') {
    const referenceIssues = draftReferenceIssues(command.references);
    if (referenceIssues !== null) return refuse(referenceIssues);
    result = appendResearchRevision(chain, null, {
      ...common,
      kind: 'REVISED',
      payload: command.payload,
      references: command.references,
      aiInvolvement: command.aiInvolvement,
      reason: null,
    });
  } else {
    // The transition itself is checked first (terminal or invalid transitions keep their own
    // refusal code); only a permitted transition goes on to the reference check.
    result = appendResearchRevision(chain, null, {
      ...common,
      kind: command.kind,
      payload: null,
      references: [],
      aiInvolvement: [],
      reason: command.reason,
    });
    // Verifying or approving needs every reference resolved in the required state.
    if (result.ok && APPROVAL_KINDS.has(command.kind) && chain !== null) {
      const view = replayResearchChain(chain);
      if (!view.ok) return refuse([view.error]);
      const references = view.value.content.references;
      if (references.length > 0) {
        if (input.resolve === undefined) return refuse(['REFERENCES_UNRESOLVED']);
        const issues = checkResearchReferences(marjaId, references, input.resolve, 'APPROVAL');
        if (issues.length > 0) return refuse(issues.map((i) => i.code));
      }
    }
  }
  if (!result.ok) return refuse([result.error]);
  return Object.freeze({
    status: 'APPLIED',
    decision,
    chain: result.value.chain,
    record: result.value.record,
  });
}

/** Authorizes and, if allowed, applies one research command. Never throws. */
export function executeResearchCommand(input: ResearchCommandInput): ResearchCommandOutcome {
  try {
    return run(input);
  } catch {
    return invalid();
  }
}
