import type { Field, Frame, QueryRequest, QueryResult } from '../api/types';
type Query = QueryRequest['queries'][number];
export function detailMetric(
  q: Query,
  body: QueryRequest,
  from: string,
  to: string,
  state: string | null,
  factor: number,
): QueryResult | undefined {
  const amount = (factor * Math.max(1, (Date.parse(to) - Date.parse(from)) / 86400000)) / 7;
  const frame = (
    labels: Record<string, string>,
    values: Record<string, number | null>,
    units: Record<string, string> = {},
    masked = false,
  ): Frame => {
    const hidden = state === 'masked' || masked;
    const fields: Field[] = Object.keys(values).map((name) => ({
      name,
      type: 'number',
      labels,
      config: { unit: units[name] || 'count', suppressed: hidden, group_size: hidden ? 3 : 12 },
    }));
    return {
      schema: {
        ref_id: q.ref_id,
        metric_id: q.metric_id,
        frame_type: q.frame_type || 'table',
        fields,
        meta: { caveat: '합성 목업 · 추가 필드/params는 실 API 확인 필요' },
      },
      data: { values: Object.values(values).map((v) => [hidden ? null : v]) },
    };
  };
  const count = (v: number) => Math.round(v * amount);
  let frames: Frame[];
  switch (q.metric_id) {
    case 'edit_acceptance_rate':
      frames = ['TypeScript', 'Python', 'Go', 'SQL', 'Shell'].map((language, i) =>
        frame(
          { language },
          {
            acceptance_rate: [0.764, 0.719, 0.682, 0.625, 0][i],
            decisions: count([1204, 842, 310, 96, 3][i]),
            auto_approved: i === 4 ? null : count([388, 261, 74, 12, 0][i]),
          },
          { acceptance_rate: 'ratio' },
          i === 4,
        ),
      );
      break;
    case 'auto_approval_ratio':
      frames = ['config', 'hook'].map((decided_by, i) =>
        frame(
          { decided_by },
          {
            ratio: [215 / 1412, 121 / 1412][i],
            numerator: count([215, 121][i]),
            denominator: count(1412),
          },
          { ratio: 'ratio' },
        ),
      );
      break;
    case 'gate_wait_ms':
      frames = ['accept', 'reject'].map((decision, i) =>
        frame(
          { decision },
          { p50: [4200, 9800][i], p90: [18500, 41200][i], count: count([812, 264][i]) },
          { p50: 'ms', p90: 'ms' },
        ),
      );
      break;
    case 'tool_rejections':
      frames = ['Bash', 'Edit', 'Write', 'WebFetch', 'mcp__github'].flatMap((tool_name, i) =>
        ['user', 'config', 'hook'].map((decided_by, j) =>
          frame(
            { tool_name, decided_by },
            {
              rejections: count(
                [
                  [46, 18, 8],
                  [24, 9, 5],
                  [16, 6, 3],
                  [11, 7, 4],
                  [9, 5, 3],
                ][i][j],
              ),
            },
          ),
        ),
      );
      break;
    case 'mcp_connections':
      frames = ['github', 'jira', 'postgres', 'figma'].map((server_name, i) =>
        frame(
          {
            server_name,
            server_scope: i === 3 ? 'project' : 'org',
            transport_type: ['http', 'stdio', 'stdio', 'sse'][i],
          },
          {
            connections: count([11, 8, 6, 3][i]),
            failure_ratio: i === 3 ? null : [0.012, 0.004, 0.038][i],
          },
          { failure_ratio: 'ratio' },
        ),
      );
      break;
    case 'mcp_failure_ratio':
      frames = ['github', 'jira', 'postgres'].map((server_name, i) =>
        frame(
          { server_name, server_scope: 'org' },
          { ratio: [0.012, 0.004, 0.038][i] },
          { ratio: 'ratio' },
        ),
      );
      break;
    case 'command_prompt_ratio':
      frames = [frame({}, { ratio: 0.18 }, { ratio: 'ratio' })];
      break;
    case 'tool_calls': {
      const errors = q.group_by?.includes('error_type');
      const labels = errors
        ? [
            'timeout',
            'permission_denied',
            'file_not_found',
            'exit_nonzero',
            'rate_limited',
            'parse_error',
            'network',
            'unknown',
          ]
        : ['read', 'search', 'edit', 'exec', 'write', 'fetch', 'other'];
      const values = errors ? [48, 31, 27, 22, 14, 9, 7, 5] : [1998, 1104, 894, 578, 315, 210, 159];
      frames = labels.map((v, i) =>
        frame({ [errors ? 'error_type' : 'action']: v }, { calls: count(values[i]) }),
      );
      break;
    }
    case 'tool_failure_rate':
      frames = [
        frame(
          {},
          {
            failure_rate: 163 / 5258,
            failures: count(163),
            calls: count(5258),
            ...(body.compare !== 'none' ? { failure_rate_compare: 0.035 } : {}),
          },
          { failure_rate: 'ratio', failure_rate_compare: 'ratio' },
        ),
      ];
      break;
    case 'compactions':
    case 'compaction_reduction': {
      const ratio = q.metric_id === 'compaction_reduction';
      if (q.frame_type !== 'timeseries') {
        frames = ratio
          ? [frame({}, { reduction: 0.63 }, { reduction: 'ratio' })]
          : ['auto', 'manual'].map((trigger, i) =>
              frame({ trigger }, { compactions: count([141, 33][i]) }),
            );
        break;
      }
      const start = Date.parse(from),
        end = Date.parse(to),
        step = 86400000;
      const first = Math.floor((start + 32400000) / step) * step - 32400000;
      const times = Array.from(
        { length: Math.min(1000, Math.ceil((end - first) / step)) },
        (_, i) => first + i * step,
      );
      frames = (ratio ? ['reduction'] : ['auto', 'manual']).map((trigger, i) => {
        const f = frame(
          ratio ? {} : { trigger },
          { value: 0 },
          { value: ratio ? 'ratio' : 'count' },
        );
        f.schema.fields.unshift({ name: 'time', type: 'time' });
        const pattern = i ? [5, 6, 4, 7, 5, 1, 0, 5] : [22, 24, 21, 31, 25, 8, 4, 26];
        const weights = times.map((_, j) => pattern[j % 8]);
        const sum = weights.reduce((a, b) => a + b, 0);
        const total = count([141, 33][i]);
        let cumulative = 0;
        const values = times.map((_, j) => {
          if (state === 'masked') return null;
          if (ratio) return [0.61, 0.64, 0.6, 0.67, 0.61, 0.57, 0.54, 0.66][j % 8];
          const before = Math.round((cumulative / sum) * total);
          cumulative += weights[j];
          return Math.round((cumulative / sum) * total) - before;
        });
        f.data.values = [times, values];
        return f;
      });
      break;
    }
    default:
      return undefined;
  }
  return { status: 200, frames: state === 'empty' ? [] : frames };
}
