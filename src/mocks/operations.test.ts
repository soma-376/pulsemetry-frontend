import { beforeAll, afterAll, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers, paymentTeam, platformTeam } from './handlers';
import { operationsMetric, mockAuditRecords } from './operations';
import { adaptResult } from '../api/frames';
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
async function token(role = 'owner') {
  return (
    await (
      await fetch('http://localhost/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: `${role}@pulsemetry.test`, password: 'demo-pulse' }),
      })
    ).json()
  ).access_token;
}
async function get(path: string, t: string, reason?: string) {
  return fetch('http://localhost/v1' + path, {
    headers: {
      Authorization: `Bearer ${t}`,
      ...(reason ? { 'X-Audit-Reason': encodeURIComponent(reason) } : {}),
    },
  });
}
it('requires valid audit reason for session and full member emails', async () => {
  const t = await token();
  for (const path of ['/sessions/sess_demo/events', '/meta/members']) {
    expect((await get(path, t)).status).toBe(403);
    expect((await get(path, t, '짧음')).status).toBe(403);
    expect((await get(path, t, '가'.repeat(501))).status).toBe(403);
    expect((await get(path, t, 'INC-2291 장애 원인 확인')).status).toBe(200);
  }
});
it('denies direct admin identity reads and cross-team installations', async () => {
  const t = await token('admin');
  expect((await get('/sessions/sess_demo/events', t, 'INC-2291 investigation')).status).toBe(403);
  expect((await get('/meta/members', t, 'INC-2291 investigation')).status).toBe(403);
  expect((await get('/installations?team_id=' + platformTeam, t)).status).toBe(403);
  const d = await (await get('/installations', t)).json();
  expect(d.items.every((i: { team_ids: string[] }) => i.team_ids.includes(paymentTeam))).toBe(true);
});
it('returns domain-only installations and respects inactivity', async () => {
  const t = await token();
  const d = await (await get('/installations?inactive_days=60', t)).json();
  expect(d.total).toBe(4);
  expect(
    d.items.every(
      (i: { member_email_masked: string }) => i.member_email_masked === '***@pulsemetry.test',
    ),
  ).toBe(true);
});
it('paginates session events and rejects unknown identifiers', async () => {
  const t = await token(),
    reason = 'INC-2291 원인 조사 테스트';
  const d = await (await get('/sessions/sess_demo/events?limit=8', t, reason)).json();
  expect(d.items).toHaveLength(8);
  const next = await (
    await get(
      '/sessions/sess_demo/events?limit=8&cursor=' + encodeURIComponent(d.next_cursor),
      t,
      reason,
    )
  ).json();
  expect(next.items).toHaveLength(6);
  expect(next.next_cursor).toBeNull();
  expect((await get('/sessions/missing/events', t, reason)).status).toBe(404);
});
it('preserves zero refusal categories and masks numeric payloads', () => {
  const q = {
    ref_id: 'A',
    metric_id: 'refusals' as const,
    frame_type: 'table' as const,
    group_by: ['category' as const],
  };
  const body = { from: 'now-7d', to: 'now', queries: [q] };
  const r = operationsMetric(q, body, '2026-08-31', '2026-09-07', null)!;
  expect(adaptResult(r).frames[0].rows[3][1].value).toBe(0);
  const masked = operationsMetric(q, body, '2026-08-31', '2026-09-07', 'masked')!;
  expect(masked.frames[0].data.values.flat().every((v) => v === null)).toBe(true);
});
it('tool failure ratios use matching calls and failures', () => {
  const q = {
    ref_id: 'A',
    metric_id: 'tool_failure_rate' as const,
    frame_type: 'table' as const,
    group_by: ['tool_name' as const],
  };
  const r = operationsMetric(
    q,
    { from: 'now-7d', to: 'now', queries: [q] },
    '2026-08-31',
    '2026-09-07',
    null,
  )!;
  const [names, calls, failures, ratios] = r.frames[0].data.values;
  expect(names).toHaveLength(8);
  expect(ratios[0]).toBe(Number(failures[0]) / Number(calls[0]));
});
it('relative session periods exclude out-of-range events', async () => {
  const t = await token();
  const d = await (
    await get('/sessions/sess_demo/events?from=now-24h&to=now', t, 'INC-2291 기간 경계 테스트')
  ).json();
  expect(d.items).toHaveLength(0);
});

it('records the validated reason and target in mock audit memory', async () => {
  const t = await token();
  const before = mockAuditRecords.length;
  await get('/meta/members', t, 'INC-2291 구성원 확인 사유');
  expect(mockAuditRecords.length).toBe(before + 1);
  expect(mockAuditRecords.at(-1)).toMatchObject({
    role: 'owner',
    target: '/v1/meta/members',
    reason: 'INC-2291 구성원 확인 사유',
  });
});
it('hook blocking daily series sums to overview scalar', () => {
  const q = {
    ref_id: 'A',
    metric_id: 'hook_blocking' as const,
    frame_type: 'timeseries' as const,
    interval: '1d' as const,
  };
  const r = operationsMetric(
    q,
    { from: 'now-7d', to: 'now', queries: [q] },
    '2026-08-31',
    '2026-09-07',
    null,
  )!;
  expect(r.frames[0].data.values[1].reduce((n, v) => Number(n) + Number(v), 0)).toBe(
    Math.round((42 * 35) / 11),
  );
});
