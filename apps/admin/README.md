# apps/admin — Rule management & review console (not yet initialized)

**Status:** workspace boundary reserved. Initialized in Milestone 7 (`docs/DEVELOPMENT_ROADMAP.md`).

## Intended setup

- Next.js App Router app (`@khums/admin`) sharing `@khums/ui`, behind mandatory authentication
  with role-based access (editor, scholar-reviewer, approver) and MFA.
- Purpose: draft, review, approve and publish versioned rule sets with source citations, following
  the workflow in `docs/RELIGIOUS_RULES.md`. Every state change is audit-logged.
- Separate deployment from the public web app; never exposed on the public domain.
