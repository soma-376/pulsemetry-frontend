import { afterEach, expect, it, vi } from 'vitest';
import { pollDelay, scenarioApi } from './scenarios';
import { defaults, validateParams, type Schema } from '../pages/scenarios/params';
afterEach(() => vi.unstubAllGlobals());
it('honors Retry-After and rejects invalid delays', () => {
  expect(pollDelay('5')).toBe(5000);
  expect(pollDelay(null)).toBe(2000);
  expect(pollDelay('-1')).toBe(2000);
  expect(pollDelay('bad')).toBe(2000);
});
it('starts a run with encoded path, exact params, abort and headers', async () => {
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ run_id: 'r', status: 'queued' }), {
        status: 202,
        headers: { 'Retry-After': '4' },
      }),
    );
  vi.stubGlobal('fetch', fetch);
  const c = new AbortController();
  const input = {
    params: { from: 'now-7d', to: 'now' },
    price_basis: 'contract' as const,
    tz: 'Asia/Seoul',
  };
  expect((await scenarioApi.start('S1/3', input, c.signal)).retryMs).toBe(4000);
  expect(fetch.mock.calls[0][0]).toBe('/v1/scenarios/S1%2F3/runs');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(input);
  expect(fetch.mock.calls[0][1].signal).toBe(c.signal);
});
it('defaults preserve zero and arrays without mutating schema', () => {
  const s: Schema = {
    properties: { a: { type: 'number', default: 10 }, b: { type: 'array', default: ['x'] } },
  };
  const v = defaults(s, { a: 0 });
  expect(v.a).toBe(0);
  (v.b as string[]).push('y');
  expect(s.properties?.b.default).toEqual(['x']);
});
it('validates required values, numeric bounds and reversed dates', () => {
  const schema: Schema = {
    type: 'object',
    required: ['n'],
    properties: {
      n: { type: 'integer', minimum: 1, maximum: 90 },
      from: { type: 'string' },
      to: { type: 'string' },
    },
  };
  expect(validateParams(schema, { n: 0 }).length).toBeGreaterThan(0);
  expect(validateParams(schema, { n: 2.5 }).length).toBeGreaterThan(0);
  expect(validateParams(schema, { n: 2, from: 'now', to: 'now-7d' })).toContain(
    '시작은 종료보다 이전이어야 합니다.',
  );
  expect(validateParams(schema, { n: 7, from: 'now-7d', to: 'now' })).toEqual([]);
});
it('rejects unsupported schema rules rather than silently executing', () => {
  expect(
    validateParams({ type: 'object', properties: { x: { $ref: '#/x' } } }, { x: 'x' }).length,
  ).toBe(1);
});
it('requires exclusive budget unit and selected team scope', () => {
  const schema: Schema = { type: 'object' };
  expect(validateParams(schema, { budget_by_team: {} }).length).toBe(1);
  expect(validateParams(schema, { budget_by_team: { a: { usd: 1, tokens_m: 2 } } }).length).toBe(1);
  expect(
    validateParams(schema, { team_ids: ['b'], budget_by_team: { a: { usd: 1 } } }).length,
  ).toBe(1);
  expect(validateParams(schema, { team_ids: ['a'], budget_by_team: { a: { usd: 1 } } })).toEqual(
    [],
  );
});
