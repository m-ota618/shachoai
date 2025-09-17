// tests/api.smoke.spec.ts
import { test, expect } from '@playwright/test';

const APP_URL = process.env.APP_URL;
if (!APP_URL) throw new Error('APP_URL is not set');

const HAS_TOKEN = !!process.env.SUPABASE_TEST_ACCESS_TOKEN;

test.describe('API (auth success path)', () => {
  test.skip(!HAS_TOKEN, 'SUPABASE_TEST_ACCESS_TOKEN not provided');

  test('POST /api/gas (with bearer) -> 200/204 + X-Trace-Id', async ({ request }) => {
    const endpoint = new URL('/api/gas', new URL(APP_URL).toString()).toString();
    const r = await request.post(endpoint, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_TEST_ACCESS_TOKEN as string}`,
      },
      data: { action: 'getUnanswered' },
    });

    expect([200, 204]).toContain(r.status());

    const headers = r.headersArray(); // [{ name, value }] （name は小文字で返る）
    const pick = (n: string) => headers.find(h => h.name === n.toLowerCase())?.value;

    const trace = pick('x-trace-id');
    expect(typeof trace).toBe('string'); // ヘッダ必須

    const expose = (pick('access-control-expose-headers') || '').toLowerCase();
    expect(expose.includes('x-trace-id')).toBe(true); // CORSで露出されていること

    if (r.status() === 200) {
      const ct = (pick('content-type') || '').toLowerCase();
      expect(ct).toContain('application/json');
    }
  });
});
