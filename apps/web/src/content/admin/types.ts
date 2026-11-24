/** Staff (administrative) console texts (M4.6.2b). Not shown to calculator users. */
export interface AdminContent {
  readonly title: string;
  readonly description: string;
  readonly signOut: string;
  readonly signingOut: string;
  readonly unavailable: string;
  readonly accountNotActive: string;
  readonly principalHeading: string;
  readonly username: string;
  readonly principalId: string;
  readonly assurance: string;
  readonly signedInAt: string;
  readonly sessionExpiresAt: string;
  readonly rolesHeading: string;
  readonly noRoles: string;
  readonly allScopes: string;
  readonly marjaScope: string;
  readonly permissionsHeading: string;
  readonly informationalNote: string;
  readonly signInPage: {
    readonly title: string;
    readonly description: string;
    readonly username: string;
    readonly password: string;
    readonly submit: string;
    readonly submitting: string;
    readonly invalidCredentials: string;
    readonly throttled: string;
    readonly accountNotActive: string;
    readonly temporaryExpired: string;
    readonly refused: string;
    readonly unavailable: string;
    readonly sessionEnded: string;
    /** M4.7 cold start: the API host may be asleep (free hosting) and takes a moment to start. */
    readonly waking: string;
    readonly wakeFailed: string;
    readonly wakeRetry: string;
  };
  readonly passwordPage: {
    readonly title: string;
    readonly description: string;
    readonly temporaryNotice: string;
    readonly current: string;
    readonly next: string;
    readonly confirm: string;
    readonly rules: string;
    readonly submit: string;
    readonly submitting: string;
    readonly mismatch: string;
    readonly invalidCurrent: string;
    readonly policy: string;
    readonly reused: string;
    readonly throttled: string;
    readonly unavailable: string;
    readonly changeLink: string;
  };
}
