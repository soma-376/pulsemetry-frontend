import { beforeAll, afterAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { scenarioHandlers, resetScenarioRuns } from './scenarios';
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
afterEach(() => vi.restoreAllMocks());
const call = (path: string, method = 'GET', body?: unknown, actor = 'owner') =>
  fetch('http://localhost/v1' + path, {
    method,
    headers: { Authorization: actor, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
async function complete(actor = 'owner') {
  const response = await call(
    '/scenarios/S1-3/runs',
    'POST',
    {
      params: {
        from: 'now-28d',
        to: 'now',
        moving_avg_days: 7,
        spike_threshold_pct: 200,
        ...(actor === 'admin' ? { team_ids: [own] } : {}),
      },
      price_basis: 'contract',
    },
    actor,
  );
  const run = await response.json();
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now + 7000);
  const done = await (await call('/scenario-runs/' + run.run_id, 'GET', undefined, actor)).json();
  vi.restoreAllMocks();
  return done;
}
it('returns actual embedded frames, absolute bounds and applied price on success', async () => {
  const r = await complete();
  expect(r.status).toBe('succeeded');
  expect(r.result.frames.cost.frames.length).toBeGreaterThan(0);
  expect(r.result.applied_filters.price_basis).toBe('contract');
  expect(Date.parse(r.resolved_to) - Date.parse(r.resolved_from)).toBe(28 * 86400000);
});
it('saves fixed and relative modes with name validation and stable run identity', async () => {
  const r = await complete();
  expect((await call(`/scenario-runs/${r.run_id}/save`, 'POST', { name: ' ' })).status).toBe(400);
  for (const time_mode of ['fixed', 'relative']) {
    const response = await call(`/scenario-runs/${r.run_id}/save`, 'POST', {
      name: '리포트',
      time_mode,
      note: '검증',
    });
    expect(response.status).toBe(201);
    const saved = await response.json();
    expect(saved.run_id).toBe(r.run_id);
    expect(saved.time_mode).toBe(time_mode);
    expect(saved.share_path).toBe(`/runs/${r.run_id}`);
  }
  expect((await (await call('/saved-reports')).json()).items).toHaveLength(2);
});
it('protects linked reports, supports 204 deletion and then returns 404', async () => {
  const r = await complete(),
    saved = await (
      await call(`/scenario-runs/${r.run_id}/save`, 'POST', { name: 'report' })
    ).json();
  expect((await call(`/scenario-runs/${r.run_id}`, 'DELETE')).status).toBe(409);
  expect((await call(`/saved-reports/${saved.saved_id}`, 'DELETE')).status).toBe(204);
  expect((await call(`/scenario-runs/${r.run_id}`)).status).toBe(200);
  expect((await call(`/scenario-runs/${r.run_id}`, 'DELETE')).status).toBe(204);
  expect((await call(`/scenario-runs/${r.run_id}`)).status).toBe(404);
});
it('paginates histories without embedding frames and limits admin visibility', async () => {
  const ownRun = await complete();
  const adminRun = await complete('admin');
  const first = await (await call('/scenario-runs?limit=1')).json();
  expect(first.items[0].run_id).toBe(adminRun.run_id);
  expect(first.items[0].result).toBeUndefined();
  expect(first.next_cursor).toBeTruthy();
  const next = await (await call('/scenario-runs?limit=1&cursor=' + first.next_cursor)).json();
  expect(next.items[0].run_id).toBe(ownRun.run_id);
  expect(next.next_cursor).toBeNull();
  const admin = await (await call('/scenario-runs', 'GET', undefined, 'admin')).json();
  expect(admin.items).toHaveLength(1);
  expect((await call(`/scenario-runs/${ownRun.run_id}`, 'GET', undefined, 'admin')).status).toBe(
    404,
  );
  expect((await call(`/scenario-runs/${adminRun.run_id}`)).status).toBe(200);
});
it('does not save or delete an active run', async () => {
  const r = await (
    await call('/scenarios/S1-3/runs', 'POST', {
      params: { from: 'now-7d', to: 'now', moving_avg_days: 7, spike_threshold_pct: 200 },
    })
  ).json();
  expect((await call(`/scenario-runs/${r.run_id}/save`, 'POST', { name: 'running' })).status).toBe(
    409,
  );
  expect((await call(`/scenario-runs/${r.run_id}`, 'DELETE')).status).toBe(409);
});
it('allows admin to rerun returned server-scoped params when the scenario has no team input', async () => {
  const first = await (
    await call('/scenarios/S3-4/runs', 'POST', { params: { from: 'now-7d', to: 'now' } }, 'admin')
  ).json();
  const response = await call('/scenarios/S3-4/runs', 'POST', { params: first.params }, 'admin');
  expect(response.status).toBe(202);
  expect((await response.json()).params.team_ids).toEqual([own]);
});
