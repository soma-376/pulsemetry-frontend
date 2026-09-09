import { expect, it } from 'vitest';
import { teamMetric } from './teamMetrics';
import { adaptResult } from '../api/frames';
import type { QueryRequest } from '../api/types';
const body: QueryRequest = {
  from: '2026-08-31T00:00:00+09:00',
  to: '2026-09-07T00:00:00+09:00',
  compare: 'previous_week',
  filters: { team_ids: ['11111111-1111-4111-8111-111111111111'] },
  queries: [],
};
const result = (
  metric_id: QueryRequest['queries'][number]['metric_id'],
  extra: Partial<QueryRequest['queries'][number]> = {},
  state = 'normal',
  request = body,
) => teamMetric({ metric_id, ref_id: 'A', ...extra }, request, request.from, request.to, state)!;
it('keeps public language rows and strips every numeric cell in small groups', () => {
  const r = result('edit_acceptance_rate');
  const rows = adaptResult(r).frames;
  expect(rows[0].rows[0][0].value).toBe(0.764);
  expect(rows[4].fields[0].labels?.language).toBe('Shell');
  expect(rows[4].rows[0].every((c) => c.state === 'masked' && c.value === null)).toBe(true);
  expect(r.frames[4].data.values.every((v) => v[0] === null)).toBe(true);
});
it('exposes only p50/p90 and count for gate wait in milliseconds', () => {
  const r = result('gate_wait_ms', { frame_type: 'distribution' });
  expect(r.frames[1].schema.fields.map((f) => f.name)).toEqual(['p50', 'p90', 'count']);
  expect(r.frames[1].data.values).toEqual([[9800], [41200], [264]]);
  expect(r.frames[1].schema.fields[0].config?.unit).toBe('ms');
});
it('keeps automatic approval numerator and denominator consistent with ratio', () => {
  for (const f of result('auto_approval_ratio').frames) {
    const [ratio, n, d] = f.data.values;
    expect(ratio[0]).toBeCloseTo(Number(n[0]) / Number(d[0]));
  }
});
it('keeps missing MCP failure ratio distinct from zero and excludes private scope in quality', () => {
  expect(adaptResult(result('mcp_connections')).frames[3].rows[0][1].state).toBe('missing');
  expect(
    result('mcp_failure_ratio').frames.every(
      (f) => f.schema.fields[0].labels?.server_scope === 'org',
    ),
  ).toBe(true);
});
it('sums error categories to failed calls and omits comparison when disabled', () => {
  const errors = result('tool_calls', { group_by: ['error_type'] });
  const total = errors.frames.reduce((n, f) => n + Number(f.data.values[0][0]), 0);
  const summary = result('tool_failure_rate', {}, 'normal', { ...body, compare: 'none' });
  expect(total).toBe(summary.frames[0].data.values[1][0]);
  expect(summary.frames[0].schema.fields.some((f) => f.name.endsWith('_compare'))).toBe(false);
});
it('masks small-team metrics in payload, including time-series', () => {
  const request = { ...body, filters: { team_ids: ['33333333-3333-4333-8333-333333333333'] } };
  for (const metric of [
    'edit_acceptance_rate',
    'compactions',
    'tool_calls',
    'active_users',
  ] as const) {
    const r = result(metric, { frame_type: 'timeseries' }, 'normal', request);
    for (const f of r.frames)
      f.schema.fields.forEach((field, i) => {
        if (field.type === 'number') expect(f.data.values[i].every((v) => v === null)).toBe(true);
      });
  }
});
it('preserves empty response semantics across all detailed widgets', () => {
  for (const metric of [
    'edit_acceptance_rate',
    'auto_approval_ratio',
    'gate_wait_ms',
    'tool_rejections',
    'mcp_connections',
    'command_prompt_ratio',
    'tool_calls',
    'tool_failure_rate',
    'compactions',
    'compaction_reduction',
  ] as const)
    expect(result(metric, {}, 'empty').frames).toEqual([]);
});
it('keeps compaction time buckets consistent with scalar count', () => {
  const time = result('compactions', { frame_type: 'timeseries' }),
    totals = result('compactions', { frame_type: 'scalar' });
  time.frames.forEach((f, i) =>
    expect(f.data.values[1].reduce<number>((sum, v) => sum + Number(v), 0)).toBe(
      totals.frames[i].data.values[0][0],
    ),
  );
});
