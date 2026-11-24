/**
 * Admin console texts (M4.6.5). Placeholders in `{braces}`. Identifiers the API returns (role and
 * state codes, ids, digests) are shown as they are, next to these labels.
 */
export interface ConsoleContent {
  readonly nav: {
    readonly label: string;
    readonly overview: string;
    readonly staff: string;
    readonly policies: string;
    readonly governance: string;
    readonly audit: string;
    readonly research: string;
    readonly researchHistory: string;
    readonly rules: string;
  };
  readonly common: {
    readonly reason: string;
    readonly reasonHint: string;
    readonly saving: string;
    readonly saved: string;
    readonly loading: string;
    readonly loadError: string;
    readonly empty: string;
    readonly loadMore: string;
    readonly noPermission: string;
    readonly unavailable: string;
    readonly code: string;
    readonly yes: string;
    readonly no: string;
    readonly operationalState: string;
    readonly errors: {
      readonly generic: string;
      readonly network: string;
      readonly invalidResponse: string;
      readonly accessDenied: string;
      readonly signedOut: string;
      readonly conflict: string;
      readonly refused: string;
      readonly validation: string;
      readonly stateForbids: string;
      readonly notFound: string;
      readonly usernameTaken: string;
      readonly usernameInvalid: string;
      readonly selfAdministration: string;
      readonly roleIncompatible: string;
      readonly roleNotGrantable: string;
      readonly scopeInvalid: string;
      readonly roleAlreadyHeld: string;
      readonly lastSuperAdmin: string;
      readonly confirmationRequired: string;
      readonly statusUnchanged: string;
      readonly marjaMismatch: string;
      readonly fileInvalid: string;
      readonly alreadyVerified: string;
    };
  };
  readonly overview: {
    readonly heading: string;
    readonly description: string;
  };
  readonly staff: {
    readonly title: string;
    readonly description: string;
    readonly create: {
      readonly heading: string;
      readonly username: string;
      readonly submit: string;
    };
    readonly credential: {
      readonly heading: string;
      readonly body: string;
      readonly username: string;
      readonly password: string;
      readonly expires: string;
    };
    readonly list: {
      readonly heading: string;
      readonly status: string;
      readonly roles: string;
      readonly created: string;
      readonly noRoles: string;
      readonly manage: string;
      readonly mustChangePassword: string;
    };
    readonly statuses: {
      readonly INVITED: string;
      readonly ACTIVE: string;
      readonly SUSPENDED: string;
      readonly DEACTIVATED: string;
    };
    readonly actions: {
      readonly status: string;
      readonly newStatus: string;
      readonly setStatus: string;
      readonly resetPassword: string;
      readonly revokeSessions: string;
      readonly clearThrottle: string;
    };
    readonly roles: {
      readonly heading: string;
      readonly grant: string;
      readonly role: string;
      readonly scope: string;
      readonly marjas: string;
      readonly marjasHint: string;
      /** SUPER_ADMIN: complete access, scope ALL (decision 64). */
      readonly superAdminHint: string;
      readonly revoke: string;
      /** Legacy roles (decision 64): readable, no longer grantable; convert or revoke. */
      readonly legacy: string;
      readonly legacyHint: string;
      readonly legacyActsAsScholar: string;
      readonly changeMarjas: string;
      readonly convert: string;
      readonly grantedBy: string;
      readonly scopeSummaryAll: string;
      readonly names: {
        readonly SUPER_ADMIN: string;
        readonly SCHOLAR: string;
        readonly RULE_PACK_AUTHOR: string;
        readonly RELIGIOUS_RESEARCHER: string;
        readonly SCHOLAR_REVIEWER: string;
        readonly INDEPENDENT_APPROVER: string;
        readonly AUDITOR: string;
        readonly GOVERNING_SCHOLAR: string;
      };
    };
  };
  readonly policies: {
    readonly title: string;
    readonly description: string;
    readonly note: string;
    readonly marja: string;
    readonly policy: string;
    readonly names: {
      readonly INDEPENDENT_REVIEW_V1: string;
      readonly SINGLE_SCHOLAR_V1: string;
      /** Rule-builder packs only (decision 67); never assignable in the registry. */
      readonly SOURCE_VERIFIED_AUTO_V1: string;
    };
    readonly propose: {
      readonly heading: string;
      readonly newPolicy: string;
      readonly submit: string;
    };
    readonly pending: {
      readonly heading: string;
      readonly none: string;
      readonly proposedBy: string;
      readonly change: string;
      readonly confirm: string;
    };
  };
  readonly governance: {
    readonly title: string;
    readonly description: string;
    readonly listHeading: string;
    readonly empty: string;
    readonly state: string;
    readonly policy: string;
    readonly activated: string;
    readonly open: string;
    readonly states: {
      readonly DRAFT: string;
      readonly SUBMITTED: string;
      readonly UNDER_REVIEW: string;
      readonly CHANGES_REQUESTED: string;
      readonly APPROVED: string;
      readonly PUBLISHED: string;
      readonly SUPERSEDED: string;
      readonly WITHDRAWN: string;
    };
    readonly records: {
      readonly heading: string;
      readonly sequence: string;
      readonly type: string;
      readonly actor: string;
      readonly when: string;
      readonly digest: string;
    };
    readonly commands: {
      readonly heading: string;
      readonly note: string;
      readonly submitHeading: string;
      readonly packId: string;
      readonly version: string;
      readonly file: string;
      readonly fileHint: string;
      readonly submit: string;
      readonly startReview: string;
      readonly requestChanges: string;
      readonly completeReview: string;
      readonly approve: string;
      readonly publish: string;
      readonly activate: string;
      readonly withdraw: string;
      readonly withdrawReason: string;
      readonly withdrawReasons: {
        readonly ERROR_FOUND: string;
        readonly SOURCE_INVALIDATED: string;
        readonly REVIEW_ABANDONED: string;
        readonly OTHER: string;
      };
      readonly supersede: string;
      readonly successorVersion: string;
      readonly evidence: string;
      readonly evidenceHint: string;
      readonly resubmit: string;
      /** M5.2.1: administrative emergency withdrawal of a published version. */
      readonly emergencyWithdraw: string;
      readonly emergencyNote: string;
      /** M5.2.1: binding a legacy version to its Marja's current policy. */
      readonly bindPolicy: string;
      readonly legacyNotice: string;
    };
  };
  readonly provisional: {
    readonly title: string;
    readonly description: string;
    readonly listHeading: string;
    readonly empty: string;
    readonly open: string;
    readonly register: {
      readonly heading: string;
      readonly description: string;
      readonly file: string;
      readonly fileHint: string;
      readonly submit: string;
    };
    /** M5.4: download the sealed Sistani / Khamenei review packs (review stops only). */
    readonly reviewPacks: {
      readonly heading: string;
      readonly description: string;
      readonly sistani: string;
      readonly khamenei: string;
    };
    readonly detail: {
      readonly status: string;
      readonly enabled: string;
      readonly disabled: string;
      readonly enable: string;
      readonly disable: string;
      readonly emergencyNote: string;
      /** Decision 64: shown on versions of a Marja outside the scholar's own assignment. */
      readonly readOnly: string;
      readonly records: string;
      readonly kind: string;
      readonly kinds: {
        readonly REGISTERED: string;
        readonly ENABLED: string;
        readonly DISABLED: string;
      };
      readonly disableKinds: { readonly SCHOLAR: string; readonly EMERGENCY: string };
    };
  };
  readonly calculations: {
    readonly title: string;
    readonly description: string;
    readonly privacyNote: string;
    readonly empty: string;
    readonly who: string;
  };
  readonly feedback: {
    readonly title: string;
    readonly description: string;
    readonly filter: string;
    readonly all: string;
    readonly apply: string;
    readonly pack: string;
  };
  readonly audit: {
    readonly title: string;
    readonly description: string;
    readonly verified: string;
    readonly broken: string;
    readonly when: string;
    readonly type: string;
    readonly actor: string;
    readonly system: string;
    readonly unknownPerson: string;
    readonly otherEvent: string;
    readonly events: Readonly<Record<string, string>>;
  };
}
