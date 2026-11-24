# apps/mobile — Expo / React Native (not yet initialized)

**Status:** workspace boundary reserved. Initialization is deliberately deferred until the web MVP
ships (Milestone 8 in `docs/DEVELOPMENT_ROADMAP.md`) so that Expo's React / React Native version
pins do not constrain the web app during MVP development.

## Intended setup

- Expo SDK (latest stable at the time), Expo Router, TypeScript strict (extends `tsconfig.base.json`).
- Initialize with `pnpm create expo-app apps/mobile` and add the package to the workspace as
  `@khums/mobile`.
- Consumes `@khums/core`, `@khums/validation`, `@khums/money`, `@khums/shared-types`, `@khums/utils`
  — the same calculation code the web app uses — and talks to the shared NestJS API only through
  `@khums/api-client` (`createApiClient({ baseUrl: EXPO_PUBLIC_API_BASE_URL, fetch })`). Must **not** import `@khums/ui` (React DOM only); native UI
  goes in a future `packages/ui-native` if shared native components are needed.
- Metro supports pnpm workspace symlinks; confirm `node-linker` / Metro `watchFolders` settings at
  init time and document them here.
- Local-first storage (encrypted, e.g. `expo-secure-store` + SQLite) behind the storage port
  defined in `@khums/core`.
