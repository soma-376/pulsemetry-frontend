import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, request, setToken, ApiError } from './client';
beforeEach(() => {
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => {
  setToken();
  vi.unstubAllGlobals();
});
it('sends in-memory token and preserves relative times and abort signal', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  setToken('private-token');
  const controller = new AbortController();
  await api.query(
    { from: 'now-7d', to: 'now', queries: [{ ref_id: 'A', metric_id: 'telemetry_coverage' }] },
    controller.signal,
  );
  const [, init] = fetcher.mock.calls[0];
  expect(init.headers.get('Authorization')).toBe('Bearer private-token');
  expect(init.signal).toBe(controller.signal);
  expect(JSON.parse(init.body).from).toBe('now-7d');
});
it('never replaces real HTTP errors with fixture data', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'Unavailable', request_id: 'r1' }), { status: 503 }),
      ),
  );
  await expect(request('/query')).rejects.toMatchObject({ status: 503, requestId: 'r1' });
});
it('clears authentication on 401 and announces session expiry', async () => {
  const listener = vi.fn();
  window.addEventListener('pulsemetry:unauthorized', listener);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 401 }))
    .mockResolvedValueOnce(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  setToken('secret');
  await expect(api.me()).rejects.toBeInstanceOf(ApiError);
  expect(listener).toHaveBeenCalledOnce();
  await api.me();
  expect(fetcher.mock.calls[1][1].headers.has('Authorization')).toBe(false);
});
it('validates audit reason before issuing a request', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(request('/query', {}, 'short')).rejects.toMatchObject({ status: 400 });
  expect(fetcher).not.toHaveBeenCalled();
});
it('propagates cancellation without fallback or retry', async () => {
  const fetcher = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
  vi.stubGlobal('fetch', fetcher);
  await expect(api.me()).rejects.toHaveProperty('name', 'AbortError');
  expect(fetcher).toHaveBeenCalledOnce();
});
it('CSV uses text negotiation with authentication and cancellation signal', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('metric,value\r\ncost,12'));
  vi.stubGlobal('fetch', fetcher);
  setToken('csv-token');
  const signal = new AbortController().signal;
  expect(
    await api.queryCsv(
      { from: 'now-7d', to: 'now', queries: [{ ref_id: 'A', metric_id: 'cost' }] },
      signal,
    ),
  ).toContain('cost,12');
  const init = fetcher.mock.calls[0][1];
  expect(init.headers.get('Accept')).toBe('text/csv');
  expect(init.headers.get('Authorization')).toBe('Bearer csv-token');
  expect(init.signal).toBe(signal);
});
