import { expect, it, vi, afterEach } from 'vitest';
import { eventDetails, durationMs, maskedEmail, opsApi } from './operations';
afterEach(() => vi.unstubAllGlobals());
it('never renders arbitrary payload, prompt body, or span token/cost fields', () => {
  const e = {
    signal: 'span' as const,
    type: 'llm_request',
    payload: {
      content: 'PRIVATE',
      prompt: 'PRIVATE',
      nested: { secret: 'PRIVATE' },
      tokens: { input: 123 },
      cost_usd: 999,
      model: 'gpt-5',
      duration_ms: 300,
    },
  };
  expect(eventDetails(e)).toBe('model: gpt-5');
  expect(durationMs(e)).toBe(300);
  expect(eventDetails({ ...e, signal: 'log', type: 'llm_call' })).toContain('123 tok');
  expect(eventDetails({ ...e, signal: 'log', type: 'llm_call' })).not.toContain('PRIVATE');
});
it('handles missing and invalid duration without manufacturing zero', () => {
  expect(durationMs({ payload: { duration_ms: -1 } })).toBeNull();
  expect(durationMs({ payload: { attrs: { duration_ms: 0 } } })).toBe(0);
  expect(durationMs({})).toBeNull();
});
it('masks email local parts including already masked values', () => {
  expect(maskedEmail('alice@example.com')).toBe('***@example.com');
  expect(maskedEmail('***@example.com')).toBe('***@example.com');
  expect(maskedEmail(null)).toBe('—');
});
it('encodes Korean audit reasons and path identifiers with cancellation', async () => {
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  const fn = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fn);
  const signal = new AbortController().signal;
  await opsApi.events(
    'a/b?c',
    new URLSearchParams({ lookup: 'request_id' }),
    'INC-2291 원인 확인 목적',
    signal,
  );
  const [url, init] = fn.mock.calls[0];
  expect(url).toContain('/sessions/a%2Fb%3Fc/events?lookup=request_id');
  expect(decodeURIComponent(init.headers.get('X-Audit-Reason'))).toBe('INC-2291 원인 확인 목적');
  expect(init.signal).toBe(signal);
});
