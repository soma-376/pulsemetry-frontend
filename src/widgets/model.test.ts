import { describe, expect, it } from 'vitest';
import { series, timeline, format } from './model';
import { completedWeeks } from './time';
import { teamMetric } from '../mocks/teamMetrics';
import type { QueryRequest, QueryResult } from '../api/types';
const body: QueryRequest = {
  from: '2026-08-31T00:00:00+09:00',
  to: '2026-09-07T00:00:00+09:00',
  compare: 'previous_week',
  price_basis: 'list',
  filters: { team_ids: ['11111111-1111-4111-8111-111111111111'] },
  queries: [],
};
function result(
  metric: QueryRequest['queries'][number],
  state: string | null = null,
  request = body,
) {
  return teamMetric(metric, request, request.from, request.to, state)!;
}
describe('widget contracts', () => {
  it('keeps field-level group labels while joining time-series, without adding previous fields as current series', () => {
    const r: QueryResult = {
      status: 200,
      frames: [
        {
          schema: {
            ref_id: 'A',
            metric_id: 'tokens',
            frame_type: 'timeseries',
            fields: [
              { name: 'time', type: 'time' },
              { name: 'value', type: 'number', labels: { type: 'input' } },
              { name: 'value_compare', type: 'number' },
            ],
          },
          data: {
            values: [
              [1000, 2000],
              [0, null],
              [4, 5],
            ],
          },
        },
      ],
    };
    const m = series(r);
    expect(m.points).toHaveLength(2);
    expect(timeline(m.points)).toEqual([
      { time: 1000, input: 0 },
      { time: 2000, input: null },
    ]);
    expect(m.points[0].previous?.value).toBe(4);
  });
  it('never exposes suppressed numeric fixture data', () => {
    const m = series(
      result(
        { ref_id: 'A', metric_id: 'sessions', frame_type: 'table', group_by: ['start_type'] },
        'masked',
      ),
    );
    expect(m.state).toBe('masked');
    expect(m.points.every((p) => p.value.value === null)).toBe(true);
  });
  it('distinguishes zero, missing, and zero denominator in text', () => {
    expect(format({ value: 0, state: 'value' })).toBe('0');
    expect(format({ value: null, state: 'missing' })).toBe('미관측');
    expect(format({ value: 999, state: 'zero-denominator' })).toBe('분모 0');
  });
  it('returns all 168 KST hour and weekday groups including observed zero', () => {
    const m = series(
      result({
        ref_id: 'A',
        metric_id: 'usage_heatmap',
        frame_type: 'table',
        group_by: ['weekday', 'hour'],
      }),
    );
    expect(new Set(m.points.map((p) => p.labels.weekday + ':' + p.labels.hour)).size).toBe(168);
    expect(m.points.some((p) => p.value.value === 0 && p.value.state === 'value')).toBe(true);
  });
  it('applies price mode to scalar and attributed costs consistently', () => {
    const request = { ...body, price_basis: 'contract' as const };
    const scalar = series(result({ ref_id: 'A', metric_id: 'cost' }, null, request)).points[0].value
      .value as number;
    const groups = series(
      result(
        { ref_id: 'A', metric_id: 'cost', group_by: ['query_source'], frame_type: 'table' },
        null,
        request,
      ),
    ).points;
    expect(scalar).toBeCloseTo(402.304);
    expect(groups.reduce((a, p) => a + (p.value.value as number), 0)).toBeCloseTo(scalar, 1);
  });
  it('uses eight completed Monday-aligned weeks in KST', () => {
    expect(completedWeeks('now')).toEqual({ from: 'now-8w/w', to: 'now/w' });
    const range = completedWeeks('2026-09-09T16:30:00+09:00');
    expect(range).toEqual({ from: '2026-07-12T15:00:00.000Z', to: '2026-09-06T15:00:00.000Z' });
    const m = series(
      result(
        { ref_id: 'A', metric_id: 'commits', frame_type: 'timeseries', interval: '1w' },
        null,
        { ...body, ...range },
      ),
    );
    expect(m.points).toHaveLength(8);
    expect(new Date(Number(m.points[0].key) + 32400000).getUTCDay()).toBe(1);
  });
  it('rejects unsupported metrics and isolates malformed frames', () => {
    expect(result({ ref_id: 'A', metric_id: 'refusals' })).toBeUndefined();
    expect(
      series({
        status: 200,
        frames: [
          {
            schema: {
              ref_id: 'A',
              metric_id: 'cost',
              frame_type: 'scalar',
              fields: [{ name: 'value', type: 'number' }],
            },
            data: { values: [['bad']] },
          },
        ],
      }).state,
    ).toBe('error');
  });
});
