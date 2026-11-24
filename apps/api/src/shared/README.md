# shared/

Application infrastructure used by `main.ts` and feature modules (not business logic).

- `http/` — `configureApp()` (prefix, helmet, CORS, body limits, Swagger, shutdown hooks) and constants.
- `openapi/` — builds the OpenAPI document; component schemas are generated from the shared
  Zod contracts in `@khums/validation` (`contract-schemas.ts`).
- `logging/` — pino configuration (redaction, request ids, no bodies/query strings).
- `lifecycle/` — graceful shutdown hooks.

Future: `database/` (Mongoose connection, Milestone 6) lives here too. Business logic never does —
it belongs in `@khums/core`.
