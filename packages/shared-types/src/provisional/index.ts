/**
 * Operational states (M4.5a). Deploying the software is not approving its calculations:
 * provisional (scholar-testing) results are PROVISIONAL — FOR SCHOLAR REVIEW ONLY and are never
 * religious guidance. (The hand-built scholar-review pack records were removed, decision 80.)
 */

/**
 * Where a deployment runs, enforced server-side (web and API):
 * - `DEVELOPMENT`: local machines and CI; mock fixtures only.
 * - `SCHOLAR_REVIEW`: the private scholar deployment; scholar testing for authorized staff only.
 * - `PRODUCTION_APPROVED`: public; governed production packs only for visitors; scholar testing
 *   stays a staff action.
 */
export type OperationalState = 'DEVELOPMENT' | 'SCHOLAR_REVIEW' | 'PRODUCTION_APPROVED';
