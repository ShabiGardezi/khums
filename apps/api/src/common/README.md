# common/

Cross-cutting HTTP building blocks shared by every feature module.

| Folder          | Contents                                                                    |
| --------------- | --------------------------------------------------------------------------- |
| `filters/`      | `ProblemDetailsFilter` — every error → RFC 9457 `application/problem+json`  |
| `pipes/`        | `ZodValidationPipe` + `createZodDto` — validation with shared Zod contracts |
| `errors/`       | Exceptions with a known mapping to problem codes                            |
| `decorators/`   | OpenAPI decorators that reference shared contract schemas                   |
| `guards/`       | (Milestone 6) authentication / authorization guards                         |
| `interceptors/` | (as needed) e.g. response envelopes, timeouts, audit logging                |

Nothing in here may contain business or religious logic.
