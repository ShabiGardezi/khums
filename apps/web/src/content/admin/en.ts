import type { AdminContent } from './types';

export const adminEn: AdminContent = {
  title: 'Staff console',
  description: 'For authorized governance staff only. The calculator never requires an account.',
  signOut: 'Sign out',
  signingOut: 'Signing out…',
  unavailable: 'Staff verification is unavailable right now. Please try again later.',
  accountNotActive: 'Your staff account is not active.',
  principalHeading: 'Signed-in staff member',
  username: 'Username',
  principalId: 'Staff id',
  assurance: 'Sign-in strength',
  signedInAt: 'Signed in',
  sessionExpiresAt: 'Session ends',
  rolesHeading: 'Roles',
  noRoles: 'No active roles.',
  allScopes: 'All Marja',
  marjaScope: 'Marja: {ids}',
  permissionsHeading: 'Permissions',
  informationalNote:
    'This list is for information only. Every action is checked again by the server. Signing in gives no religious authority.',
  signInPage: {
    title: 'Staff sign-in',
    description:
      'Sign in with the username and password given to you by the platform administrator.',
    username: 'Username',
    password: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    invalidCredentials: 'The username or password is not correct.',
    throttled: 'Too many attempts. Please wait a few minutes and try again.',
    accountNotActive: 'This staff account is not active. Contact the platform administrator.',
    temporaryExpired:
      'Your temporary password has expired. Ask the platform administrator for a new one.',
    refused: 'The sign-in request was refused. Reload the page and try again.',
    unavailable: 'Staff sign-in is unavailable right now. Please try again later.',
    waking:
      'Starting the secure server. This can take up to a minute after a period of no use; this page continues by itself.',
    wakeFailed: 'The secure server did not start. Please try again in a moment.',
    wakeRetry: 'Try again',
    sessionEnded: 'Your staff session has ended. Please sign in again.',
  },
  passwordPage: {
    title: 'Change password',
    description: 'Choose a new password for your staff account.',
    temporaryNotice:
      'You signed in with a temporary password. Choose your own password before continuing.',
    current: 'Current password',
    next: 'New password',
    confirm: 'Repeat the new password',
    rules:
      'At least 12 characters. A short sentence works well. Do not use your username or a common password.',
    submit: 'Change password',
    submitting: 'Saving…',
    mismatch: 'The two new passwords do not match.',
    invalidCurrent: 'The current password is not correct.',
    policy: 'The new password does not meet the rules above.',
    reused: 'Choose a password different from the current one.',
    throttled: 'Too many attempts. Please wait a few minutes and try again.',
    unavailable: 'The password could not be changed right now. Please try again later.',
    changeLink: 'Change password',
  },
};
