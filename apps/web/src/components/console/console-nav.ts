/**
 * Console sections and the permission that makes each one useful (M4.6.5). Informational only:
 * the API authorizes every read and command whatever the navigation shows.
 */
export const CONSOLE_SECTIONS = [
  { key: 'staff', path: '/admin/staff', permission: 'identity.user.read' },
  { key: 'policies', path: '/admin/policies', permission: 'governance.policy.change' },
  { key: 'governance', path: '/admin/governance', permission: 'governance.ledger.read' },
  { key: 'audit', path: '/admin/audit', permission: 'audit.log.read' },
  // M5.3.7: governing scholars of a research Marja; auditors see the history metadata only.
  { key: 'research', path: '/admin/research', permission: 'research.read' },
  { key: 'researchHistory', path: '/admin/research/history', permission: 'research.audit.read' },
  // Phase 2 steps 3–4: the scholar rule builder (own Marjas editable, other Marjas read-only).
  { key: 'rules', path: '/admin/rules', permission: 'builder.rule.read' },
] as const;

export type ConsoleSectionKey = (typeof CONSOLE_SECTIONS)[number]['key'];

/**
 * The sections shown in the console (owner decision 2026-11-24, decision 79): scholars test any
 * Marja's rules and read them; the super administrator manages staff and reads the audit log.
 * The other pages stay reachable by address only (rule changes are made by the owner in code).
 */
export const SHOWN_SECTIONS: readonly ConsoleSectionKey[] = ['rules', 'staff', 'audit'];

export const visibleSections = (permissions: readonly string[]) =>
  CONSOLE_SECTIONS.filter(
    (section) => SHOWN_SECTIONS.includes(section.key) && permissions.includes(section.permission),
  );
