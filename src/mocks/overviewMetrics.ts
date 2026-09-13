import type { Field, Frame, QueryRequest, QueryResult } from '../api/types';
type Query = QueryRequest['queries'][number];
const teamRows = [
  ['22222222-2222-4222-8222-222222222222', '플랫폼', 21, 24],
  ['11111111-1111-4111-8111-111111111111', '결제', 11, 12],
  ['33333333-3333-4333-8333-333333333333', '정산', 3, 3],
] as const;
export function overviewMetric(
  q: Query,
  body: QueryRequest,
  from: string,
  to: string,
  state: string | null,
): QueryResult | undefined {
  const dim = q.group_by?.[0];
  const time = q.frame_type === 'timeseries';
  const selected = teamRows.filter(
    (t) => !body.filters?.team_ids?.length || body.filters.team_ids.includes(t[0]),
  );
  const users = selected.reduce((n, t) => n + t[2], 0);
  const multiplier =
    (body.filters?.products?.length === 1 ? 0.65 : 1) * (body.filters?.models?.length ? 0.55 : 1);
  const factor = (users / 11) * multiplier;
  const days = Math.max(1 / 24, (Date.parse(to) - Date.parse(from)) / 86400000);
  const cost =
    ((502.88 * factor * days) / 7) * ((q.price_basis || body.price_basis) === 'contract' ? 0.8 : 1);
  const masked = state === 'masked' || (selected.length === 1 && selected[0][3] < 5);
  const step = q.interval === '1h' ? 3600000 : q.interval === '1w' ? 604800000 : 86400000;
  const start = Date.parse(from),
    end = Date.parse(to);
  const times = Array.from(
    { length: Math.min(1000, Math.ceil((end - start) / step)) },
    (_, i) => start + i * step,
  );
  const pattern = times.map((_, i) => [1, 0.9, 1.1, 3.4, 1.05, 0.8, 0.7, 0.95][i % 8]);
  const totalWeight = pattern.reduce((a, b) => a + b, 0);
  const num = (
    name: string,
    unit: string,
    labels: Record<string, string> = {},
    hide = masked,
  ): Field => ({
    name,
    type: 'number',
    labels,
    config: { unit, group_size: hide ? 3 : 12, suppressed: hide },
  });
  const frame = (fields: Field[], values: unknown[][]): Frame => ({
    schema: {
      ref_id: q.ref_id,
      metric_id: q.metric_id,
      frame_type: q.frame_type || 'scalar',
      fields,
      meta: { caveat: '합성 목업 데이터 · 실제 사용량이 아닙니다.' },
    },
    data: { values: values.map((v, i) => (fields[i].config?.suppressed ? v.map(() => null) : v)) },
  });
  const scalar = (
    value: number,
    unit: string,
    labels: Record<string, string> = {},
    prev = value / 1.08,
  ) =>
    frame(
      [
        num('value', unit, labels),
        ...(body.compare !== 'none' ? [num('value_compare', unit, labels)] : []),
      ],
      [[value], ...(body.compare !== 'none' ? [[prev]] : [])],
    );
  const trend = (
    values: number[],
    unit: string,
    labels: Record<string, string> = {},
    previous = false,
  ) =>
    frame(
      [
        { name: 'time', type: 'time' },
        num('value', unit, labels),
        ...(previous && body.compare !== 'none' ? [num('value_compare', unit, labels)] : []),
      ],
      [
        times,
        values,
        ...(previous && body.compare !== 'none' ? [values.map((v) => v / 1.12)] : []),
      ],
    );
  let frames: Frame[];
  if (q.metric_id === 'cost' && dim === 'team') {
    frames = selected.map((t) =>
      frame(
        [num('value', 'USD', { team: t[0], team_name: t[1] }, masked || t[3] < 5)],
        [[(cost * t[2]) / users]],
      ),
    );
  } else if (q.metric_id === 'cost' && time && !dim) {
    const cents = Math.round(cost * 100);
    let cumulative = 0,
      previous = 0;
    const values = pattern.map((w) => {
      cumulative += w;
      const next = Math.round((cents * cumulative) / totalWeight);
      const v = (next - previous) / 100;
      previous = next;
      return v;
    });
    frames = [trend(values, 'USD', {}, true)];
  } else if (q.metric_id === 'cost_anomaly') {
    frames = [
      trend(
        pattern.map((v, i) => {
          const prev = Array.from({ length: 7 }, (_, j) => pattern[i - j - 1] ?? 1);
          return v / (prev.reduce((a, b) => a + b, 0) / 7) - 1;
        }),
        'ratio',
      ),
    ];
  } else if (q.metric_id === 'cost_per_active_user') {
    const active = Math.round(users * multiplier);
    frames = [
      frame(
        [num('value', 'USD'), ...(body.compare !== 'none' ? [num('value_compare', 'USD')] : [])],
        [
          [active ? cost / active : null],
          ...(body.compare !== 'none' ? [[active ? cost / active / 1.038 : null]] : []),
        ],
      ),
    ];
  } else if (q.metric_id === 'sessions' && q.frame_type === 'scalar' && !dim) {
    frames = [
      scalar(
        [184, 76, 38, 20].reduce((sum, n) => sum + Math.round((n * factor * days) / 7), 0),
        'count',
      ),
    ];
  } else if (q.metric_id === 'lines_of_code' && q.frame_type === 'scalar') {
    frames = [
      scalar(Math.round((4900 * factor * days) / 7), 'lines', { type: 'added' }),
      scalar(Math.round((1900 * factor * days) / 7), 'lines', { type: 'removed' }),
    ];
  } else if (q.metric_id === 'tokens' && dim === 'model') {
    const models = ['claude-sonnet-4', 'claude-opus-4-1', 'gpt-5', 'claude-haiku-4-5'];
    frames = models.flatMap((model, i) =>
      body.filters?.models?.length && !body.filters.models.includes(model)
        ? []
        : [
            scalar(
              Math.round(((3600000 * factor * days) / 7) * [0.46, 0.27, 0.17, 0.1][i]),
              'token',
              { model },
            ),
          ],
    );
  } else if (q.metric_id === 'model_users' && dim === 'model') {
    frames = ['claude-sonnet-4', 'claude-opus-4-1', 'gpt-5', 'claude-haiku-4-5'].flatMap(
      (model, i) =>
        body.filters?.models?.length && !body.filters.models.includes(model)
          ? []
          : [
              scalar(Math.round(users * multiplier * [0.89, 0.52, 0.32, 0.61][i]), 'count', {
                model,
              }),
            ],
    );
  } else if (q.metric_id === 'adoption_rate' && dim === 'team' && time) {
    frames = selected.map((t) =>
      frame(
        [
          { name: 'time', type: 'time' },
          num('value', 'ratio', { team: t[0], team_name: t[1] }, masked || t[3] < 5),
        ],
        [
          times,
          times.map(
            (_, i) => (t[2] / t[3] - 0.2 + (i / Math.max(1, times.length - 1)) * 0.2) * multiplier,
          ),
        ],
      ),
    );
  } else if (q.metric_id === 'integration_depth') {
    frames = [scalar((58 + 14) / 184, 'ratio', {}, 0.36)];
  } else if (['edit_acceptance_rate', 'auto_approval_ratio'].includes(q.metric_id) && !dim) {
    const val = q.metric_id === 'edit_acceptance_rate' ? 0.742 : 336 / 1412;
    frames = [
      time
        ? trend(
            times.map((_, i) => val + ((i % 3) - 1) * 0.01),
            'ratio',
          )
        : scalar(val, 'ratio', {}, val - 0.014),
    ];
  } else if (q.metric_id === 'api_error_rate') {
    frames = [
      trend(
        times.map((_, i) => (i === 7 ? 0.024 : i === 6 ? 0.019 : 0.004 + (i % 3) * 0.001)),
        'ratio',
      ),
    ];
  } else if (q.metric_id === 'llm_ttft_ms') {
    frames = ['p50', 'p90'].map((percentile, i) =>
      trend(
        times.map((_, j) => (i ? 1480 : 612) + (j === 7 ? 400 : (j % 4) * 20)),
        'ms',
        { percentile },
      ),
    );
  } else if (q.metric_id === 'refusals') {
    if (body.filters?.team_ids?.length || q.group_by?.includes('team'))
      return {
        status: 403,
        frames: [],
        error: {
          error: 'forbidden',
          message: '안전 거부는 전사 합계만 제공합니다.',
          request_id: 'mock-refusal-scope',
        },
      };
    frames = [scalar(Math.round(((7 * days) / 7) * multiplier), 'count')];
  } else if (q.metric_id === 'hook_blocking') {
    frames = [scalar(Math.round((42 * factor * days) / 7), 'count')];
  } else if (q.metric_id === 'hook_executions') {
    const sessions = Math.round((318 * factor * days) / 7);
    frames = [
      frame(
        [num('sessions_with_hooks', 'count'), num('sessions', 'count')],
        [[Math.round(sessions * 0.31)], [sessions]],
      ),
    ];
  } else return undefined;
  return { status: 200, frames: state === 'empty' ? [] : frames };
}
