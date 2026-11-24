import { describe, expect, it } from 'vitest';

import { apiOrigin } from './staff-api-origin';

describe('staff API origin (rewrite target, M4.6.2b)', () => {
  it('defaults to the local API only outside production', () => {
    expect(apiOrigin({ NODE_ENV: 'development' })).toBe('http://localhost:4000');
    expect(apiOrigin({ NODE_ENV: 'production' })).toBeNull();
  });

  it('requires an exact https origin in production (no paths, no http)', () => {
    expect(
      apiOrigin({ NODE_ENV: 'production', KHUMS_API_ORIGIN: 'https://api.khums.example' }),
    ).toBe('https://api.khums.example');
    for (const bad of ['http://api.khums.example', 'https://api.khums.example/api', 'not a url']) {
      expect(apiOrigin({ NODE_ENV: 'production', KHUMS_API_ORIGIN: bad }), bad).toBeNull();
    }
    expect(apiOrigin({ NODE_ENV: 'test', KHUMS_API_ORIGIN: 'http://127.0.0.1:4100' })).toBe(
      'http://127.0.0.1:4100',
    );
  });
});
