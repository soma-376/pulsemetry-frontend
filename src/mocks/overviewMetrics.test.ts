import { expect, it } from 'vitest';
import { teamMetric } from './teamMetrics';
import { series, number } from '../widgets/model';
import { resultCsv, csvCell } from '../api/csv';
import { overviewQueries } from '../pages/overview/queries';
import type { QueryRequest } from '../api/types';
const body: QueryRequest = {
  from: '2026-08-31T00:00:00+09:00',
  to: '2026-09-07T00:00:00+09:00',
  compare: 'previous_week',
  filters: {},
  queries: [],
};
const run = (q: QueryRequest['queries'][number], b = body, state = 'normal') =>
  teamMetric(q, b, b.from, b.to, state)!;
it('daily costs sum to scalar total for both price bases', () => {
  for (const price_basis of ['list', 'contract'] as const) {
    const b = { ...body, price_basis };
    const total = number(series(run({ ref_id: 'A', metric_id: 'cost' }, b)).points[0].value)!;
    const rows = series(
      run({ ref_id: 'A', metric_id: 'cost', frame_type: 'timeseries', interval: '1d' }, b),
    ).points;
    expect(rows.reduce((n, p) => n + (number(p.value) || 0), 0)).toBeCloseTo(total, 2);
  }
});
it('team comparison keeps public groups and removes private numeric payload', () => {
  const r = run(overviewQueries.teams[0]);
  const m = series(r);
  expect(m.points.filter((p) => p.value.state === 'value')).toHaveLength(2);
  expect(m.points.filter((p) => p.value.state === 'masked')).toHaveLength(1);
  expect(r.frames[2].data.values).toEqual([[null]]);
  expect(resultCsv(r)).toContain('n<5');
});
it('weekly adoption has eight KST Monday columns and masked small team', () => {
  const b = { ...body, from: '2026-07-13T00:00:00+09:00' };
  const r = run(overviewQueries.adoption[0], b);
  expect(r.frames[0].data.values[0]).toHaveLength(8);
  expect(r.frames[2].data.values[1].every((v) => v === null)).toBe(true);
});
it('refusals disallow team filters and team breakdown', () => {
  expect(run(overviewQueries.governance[0]).status).toBe(200);
  expect(
    run(overviewQueries.governance[0], {
      ...body,
      filters: { team_ids: ['11111111-1111-4111-8111-111111111111'] },
    }).status,
  ).toBe(403);
  expect(run({ ...overviewQueries.governance[0], group_by: ['team'] }).status).toBe(403);
});
it('comparison fields omitted when none; TTFT never invents mean', () => {
  const r = run(overviewQueries.trust[0], { ...body, compare: 'none' });
  expect(r.frames[0].schema.fields).toHaveLength(1);
  expect(
    run(overviewQueries.health[1]).frames.map((f) => f.schema.fields[1].labels?.percentile),
  ).toEqual(['p50', 'p90']);
});
it('health uses 24 hourly samples and costs expose actual threshold crossings', () => {
  const b = { ...body, from: '2026-09-06T00:00:00+09:00' };
  expect(run(overviewQueries.health[0], b).frames[0].data.values[0]).toHaveLength(24);
  expect(
    series(run(overviewQueries.cost[2])).points.filter((p) => (number(p.value) || 0) > 2),
  ).toHaveLength(1);
});
it('CSV escapes formulas and delimiters and rejects failed frames', () => {
  expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  expect(csvCell('a,b\nc')).toBe('"a,b\nc"');
  expect(csvCell(-2)).toBe('"-2"');
  expect(() => resultCsv({ status: 403, frames: [] })).toThrow();
});
it('all new metrics preserve empty and masked states', () => {
  for (const qs of Object.values(overviewQueries))
    for (const q of qs) {
      expect(run(q, body, 'empty').frames).toEqual([]);
      const m = series(run(q, body, 'masked'));
      expect(m.points.every((p) => p.value.state === 'masked')).toBe(true);
    }
});
