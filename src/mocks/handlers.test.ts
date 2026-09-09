import { beforeAll, afterAll, afterEach, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers, platformTeam } from './handlers';
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
async function login(role = 'admin') {
  return (
    await (
      await fetch('http://localhost/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: `${role}@pulsemetry.test`, password: 'demo-pulse' }),
      })
    ).json()
  ).access_token;
}
async function query(token: string, state = 'normal', filters = {}) {
  return fetch('http://localhost/v1/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-Mock-Case': state },
    body: JSON.stringify({
      from: 'now-7d',
      to: 'now',
      filters,
      queries: [
        { ref_id: 'A', metric_id: 'telemetry_coverage' },
        { ref_id: 'B', metric_id: 'telemetry_coverage' },
      ],
    }),
  });
}
it('rejects member login and unauthenticated queries', async () => {
  expect(await login('member')).toBeUndefined();
  expect((await query('invalid')).status).toBe(401);
});
it('enforces team scope on direct API calls', async () =>
  expect((await query(await login(), 'normal', { team_ids: [platformTeam] })).status).toBe(403));
it('requires a reason for personal filters', async () =>
  expect((await query(await login(), 'normal', { member_ids: ['member'] })).status).toBe(403));
it('keeps successful results during partial failure', async () => {
  const result = await (await query(await login(), 'partial')).json();
  expect(result.results.A.status).toBe(200);
  expect(result.results.B.status).toBe(504);
});
it('returns empty coverage ratio as null, never zero', async () =>
  expect((await (await query(await login(), 'empty')).json()).coverage.ratio).toBeNull());
it('masks fixture values in API payload', async () => {
  const result = await (await query(await login(), 'masked')).json();
  expect(result.results.A.frames[0].data.values[0][0]).toBeNull();
});
it('omits exact coverage counts for small team and masked cases', async () => {
  const token = await login('owner');
  for (const [state, filters] of [
    ['masked', {}],
    ['normal', { team_ids: ['33333333-3333-4333-8333-333333333333'] }],
  ] as const) {
    const result = await (await query(token, state, filters)).json();
    expect(result.coverage.active_members).toBeUndefined();
    expect(result.coverage.active_installations).toBeUndefined();
    expect(result.coverage.ratio).toBeNull();
    expect(result.results.A.frames[0].data.values).toEqual([[null]]);
  }
});
