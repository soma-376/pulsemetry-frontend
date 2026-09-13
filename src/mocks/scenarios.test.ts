import { beforeAll, afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { scenarioHandlers, resetScenarioRuns, catalog, scenarioDetail } from './scenarios';
import { defaults, type Schema } from '../pages/scenarios/params';
const own = '11111111-1111-4111-8111-111111111111';
const server = setupServer(
  ...scenarioHandlers(
    (r) =>
      r.headers.get('Authorization') === 'owner'
        ? 'owner'
        : r.headers.get('Authorization') === 'admin'
          ? 'admin'
          : undefined,
    own,
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(resetScenarioRuns);
afterEach(() => server.resetHandlers());
function call(path: string, method = 'GET', body?: unknown, actor = 'owner', mode = 'normal') {
  return fetch(`http://localhost/v1${path}`, {
    method,
    headers: { Authorization: actor, 'Content-Type': 'application/json', 'X-Mock-Case': mode },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const input = (id = 'S1-3') => ({
  params: defaults(
    scenarioDetail(catalog.find((s) => s.scenario_id === id)!).params_schema as Schema,
    {},
  ),
});
it('returns 46 catalog items, category and text filters', async () => {
  expect((await (await call('/scenarios')).json()).items).toHaveLength(46);
  expect((await (await call('/scenarios?category=cost')).json()).items).toHaveLength(7);
  expect((await (await call('/scenarios?q=S1-3')).json()).items).toHaveLength(1);
});
it('guards unauthenticated access and unavailable scenarios', async () => {
  expect((await call('/scenarios', 'GET', undefined, '')).status).toBe(401);
  expect((await call('/scenarios/S5-1/runs', 'POST', { params: {} })).status).toBe(409);
});
it('validates input, budget exclusivity and admin team constraints', async () => {
  expect((await call('/scenarios/S1-3/runs', 'POST', { params: {} })).status).toBe(400);
  expect(
    (
      await call('/scenarios/S1-1/runs', 'POST', {
        params: {
          from: 'now-7d',
          to: 'now',
          team_ids: [own],
          budget_by_team: { [own]: { usd: 2, tokens_m: 1 } },
        },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call(
        '/scenarios/S1-3/runs',
        'POST',
        { params: { ...input().params, team_ids: ['other'] } },
        'admin',
      )
    ).status,
  ).toBe(403);
  expect((await call('/scenarios/S5-7/runs', 'POST', input('S5-7'), 'admin')).status).toBe(403);
});
it('forces admin scope even when the schema has no team input', async () => {
  const r = await call('/scenarios/S3-4/runs', 'POST', input('S3-4'), 'admin');
  expect(r.status).toBe(202);
  expect((await r.json()).params.team_ids).toEqual([own]);
});
it('enforces three concurrent runs, cancellation and terminal conflict', async () => {
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const r = await call('/scenarios/S1-3/runs', 'POST', input(), 'owner', 'loading');
    expect(r.status).toBe(202);
    expect(r.headers.get('Retry-After')).toBe('2');
    ids.push((await r.json()).run_id);
  }
  expect((await call('/scenarios/S1-3/runs', 'POST', input())).status).toBe(429);
  expect((await (await call(`/scenario-runs/${ids[0]}/cancel`, 'POST')).json()).status).toBe(
    'cancelled',
  );
  expect((await call(`/scenario-runs/${ids[0]}/cancel`, 'POST')).status).toBe(409);
  expect((await call('/scenarios/S1-3/runs', 'POST', input())).status).toBe(202);
});
it('does not allow another login actor to read or cancel a run', async () => {
  const r = await (await call('/scenarios/S1-3/runs', 'POST', input())).json();
  expect((await call(`/scenario-runs/${r.run_id}`, 'GET', undefined, 'admin')).status).toBe(404);
  expect((await call(`/scenario-runs/${r.run_id}/cancel`, 'POST', undefined, 'admin')).status).toBe(
    404,
  );
});
