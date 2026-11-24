/** All routes are served under this prefix. A breaking change gets a new major prefix. */
export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'api/docs';
export const JSON_BODY_LIMIT = '100kb';
/**
 * The one larger JSON body (M5.3.3): an evidence upload carries at most 2 MiB as base64. Only
 * `POST /api/v1/admin/research/evidence` gets it; every other route keeps JSON_BODY_LIMIT.
 */
export const EVIDENCE_JSON_BODY_LIMIT = '3mb';
export const EVIDENCE_UPLOAD_PATH = '/api/v1/admin/research/evidence';
