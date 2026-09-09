import type { Field, Frame, QueryRequest, QueryResult } from '../api/types';
type Query = QueryRequest['queries'][number];
const scalarValues: Record<string, [number, number, string]> = {
  active_users: [11, 10, 'count'],
  adoption_rate: [11 / 12, 10 / 12, 'ratio'],
  cost: [502.88, 473.52, 'USD'],
  automation_ratio: [96 / 282.4, 0.32, 'ratio'],
  subagent_cost_ratio: [0.29, 0.25, 'ratio'],
  cache_read_ratio: [0.61, 0.57, 'ratio'],
};
const groups: Record<string, [string[], number[]]> = {
  model: [
    ['claude-sonnet-4', 'claude-opus-4-1', 'gpt-5', 'claude-haiku-4-5'],
    [52, 31, 11, 6],
  ],
  query_source: [
    ['main', 'subagent', 'compact'],
    [63, 29, 8],
  ],
  agent_name: [
    ['(main)', 'code-reviewer', 'test-writer', '__other__'],
    [71, 14, 9, 6],
  ],
  mcp_server: [
    ['github', 'jira', 'postgres', '__other__'],
    [44, 27, 18, 11],
  ],
};
export function teamMetric(
  q: Query,
  body: QueryRequest,
  from: string,
  to: string,
  state: string | null,
): QueryResult | undefined {
  const fields = (name: string, unit: string, labels: Record<string, string> = {}): Field => ({
    name,
    type: 'number',
    labels,
    config: { unit, suppressed: state === 'masked', group_size: state === 'masked' ? 3 : 12 },
  });
  const frame = (fs: Field[], values: unknown[][]): Frame => ({
    schema: {
      ref_id: q.ref_id,
      metric_id: q.metric_id,
      frame_type: q.frame_type || 'scalar',
      fields: fs,
      meta: { caveat: '합성 목업 데이터 · 실제 사용량이 아닙니다.' },
    },
    data: {
      values:
        state === 'masked'
          ? values.map((v, i) => (fs[i].type === 'number' ? v.map(() => null) : v))
          : values,
    },
  });
  const end = Date.parse(to),
    start = Date.parse(from);
  const days = Math.max(1, (end - start) / 86400000);
  const selection = body.filters || {};
  const factor =
    (!selection.team_ids?.length
      ? 32 / 11
      : selection.team_ids[0].startsWith('222')
        ? 21 / 11
        : 1) *
    (selection.products?.length === 1 ? 0.65 : 1) *
    (selection.models?.length ? 0.55 : 1);
  const amountFactor = (factor * days) / 7;
  const discount = (q.price_basis || body.price_basis) === 'contract' ? 0.8 : 1;
  const totalCost = 502.88 * amountFactor * discount;
  let frames: Frame[];
  if (q.metric_id === 'cost' && q.group_by?.length) {
    const dim = q.group_by[0];
    const [names, ratios] = groups[dim] || groups.model;
    const entries = names
      .map((name, i) => ({ name, ratio: ratios[i] }))
      .filter(
        (e) => dim !== 'model' || !selection.models?.length || selection.models.includes(e.name),
      );
    const weight = entries.reduce((sum, e) => sum + e.ratio, 0);
    frames = entries.map(({ name, ratio }) =>
      frame(
        [fields('value', 'USD', { [dim]: name })],
        [[+((totalCost * ratio) / weight).toFixed(2)]],
      ),
    );
  } else if (scalarValues[q.metric_id]) {
    const [v, prev, unit] = scalarValues[q.metric_id];
    const scale = unit === 'USD' ? amountFactor * discount : unit === 'count' ? factor : 1;
    const members = !selection.team_ids?.length
      ? 36
      : selection.team_ids[0].startsWith('222')
        ? 24
        : 12;
    const value =
      q.metric_id === 'adoption_rate'
        ? Math.round(11 * factor) / members
        : unit === 'count'
          ? Math.round(v * scale)
          : v * scale;
    const fs = [fields('value', unit)];
    const values = [[value]];
    if (body.compare !== 'none') {
      fs.push(fields('value_compare', unit, { period: 'previous' }));
      values.push([unit === 'count' ? Math.round(prev * scale) : prev * scale]);
    }
    frames = [frame(fs, values)];
  } else if (q.metric_id === 'active_time') {
    frames = ['user', 'cli'].map((type, i) => {
      const v = [186.4, 96][i] * 3600 * amountFactor;
      return frame(
        [
          fields('value', 's', { type }),
          ...(body.compare !== 'none'
            ? [fields('value_compare', 's', { type, period: 'previous' })]
            : []),
        ],
        [[v], ...(body.compare !== 'none' ? [[v / 1.031]] : [])],
      );
    });
  } else if (q.metric_id === 'sessions') {
    frames = ['fresh', 'resume', 'continue', 'agents_view'].map((start_type, i) =>
      frame(
        [fields('value', 'count', { start_type })],
        [[Math.round([184, 76, 38, 20][i] * amountFactor)]],
      ),
    );
  } else if (q.metric_id === 'prompts_per_session') {
    frames = [
      frame(
        [{ name: 'bucket', type: 'string' }, fields('count', 'count')],
        [
          ['1', '2–3', '4–7', '8–15', '16+'],
          [62, 98, 84, 51, 23].map((n) => Math.round(n * amountFactor)),
        ],
      ),
      frame([fields('p50', 'count'), fields('p90', 'count')], [[4], [14]]),
    ];
  } else if (q.metric_id === 'usage_heatmap') {
    frames = Array.from({ length: 168 }, (_, i) => {
      const weekday = Math.floor(i / 24) + 1,
        hour = i % 24;
      const value =
        hour >= 2 && hour < 8
          ? 0
          : weekday > 5
            ? hour > 9 && hour < 18
              ? 12
              : 0
            : hour >= 8 && hour < 22
              ? 40 + ((hour * 13 + weekday * 7) % 75)
              : 7;
      return frame(
        [fields('value', 'count', { weekday: String(weekday), hour: String(hour) })],
        [[Math.round(value * amountFactor)]],
      );
    });
  } else if (['lines_of_code', 'commits', 'pull_requests', 'tokens'].includes(q.metric_id)) {
    const step = q.interval === '1w' ? 604800000 : 86400000;
    const offset = q.interval === '1w' ? 3 * 86400000 : 0;
    const first = Math.floor((start + 32400000 + offset) / step) * step - 32400000 - offset;
    const times = Array.from(
      { length: Math.min(1000, Math.ceil((end - first) / step)) },
      (_, i) => first + i * step,
    );
    const pattern = [0.65, 0.72, 0.61, 0.81, 0.85, 0.77, 0.94, 1];
    const isTokens = q.metric_id === 'tokens';
    const types = isTokens
      ? ['input', 'output', 'cache_read', 'cache_create']
      : q.metric_id === 'lines_of_code'
        ? ['added', 'removed']
        : [q.metric_id];
    frames = types.map((type, i) => {
      const base = isTokens
        ? [2200000, 1400000, 12600000, 5800000][i]
        : q.metric_id === 'lines_of_code'
          ? [4900, 1900][i]
          : q.metric_id === 'commits'
            ? 58
            : 14;
      return frame(
        [
          { name: 'time', type: 'time' },
          fields(
            'value',
            isTokens ? 'token' : q.metric_id === 'lines_of_code' ? 'lines' : 'count',
            { type },
          ),
        ],
        [times, times.map((_, j) => Math.round(base * pattern[j % 8] * factor))],
      );
    });
  } else return undefined;
  return { status: 200, frames: state === 'empty' ? [] : frames };
}
