import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/health/route';

describe('health route', () => {
  it('reports application process health without external dependencies', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
