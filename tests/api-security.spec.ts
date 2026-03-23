import { test, expect } from '@playwright/test';

test.describe('API without session', () => {
  test('GET /api/health is public', async ({ request }) => {
    let res = await request.get('/api/health');
    for (let i = 0; i < 5 && !res.ok(); i++) {
      await new Promise((r) => setTimeout(r, 400));
      res = await request.get('/api/health');
    }
    expect(res.ok(), `status ${res.status()}`).toBeTruthy();
    const json = await res.json();
    expect(json).toMatchObject({ status: 'ok' });
  });

  test('GET /api/clients returns 401 JSON', async ({ request }) => {
    const res = await request.get('/api/clients');
    expect(res.status()).toBe(401);
    const json = await res.json().catch(() => ({}));
    expect(json).toMatchObject({ error: 'Unauthorized' });
  });
});
