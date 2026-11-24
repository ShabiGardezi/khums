import { createApiClient } from '@khums/api-client';

import { publicEnv } from '@/env';

/**
 * The web app's client for the shared Khums REST API. Mobile creates the same client with its
 * own base URL — request/response types are shared, never redeclared here.
 * Not used by any screen yet: the MVP works anonymously without the API.
 */
export const apiClient = createApiClient({
  baseUrl: publicEnv.NEXT_PUBLIC_API_BASE_URL,
  fetch: (url, init) => fetch(url, init),
});
