import type { Run, RunInput, Scenario } from '../api/scenarios';
import type { QueryRequest, QueryResult } from '../api/types';
import { teamMetric } from './teamMetrics';
import { operationsMetric } from './operations';
export function resolveScenarioTime(value: unknown, now: number) {
  const expression = typeof value === 'string' ? value : 'now';
  const match = /^now(?:-(\d+)([hdw]))?$/.exec(expression);
  const ms = match
    ? now -
      Number(match[1] || 0) * ({ h: 3600000, d: 86400000, w: 604800000 }[match[2] || 'd'] || 0)
    : Date.parse(expression);
  return new Date(Number.isFinite(ms) ? ms : now).toISOString();
}
export function scenarioResult(
  run: Run,
  scenario: Scenario,
  input: RunInput,
  mode: string,
): NonNullable<Run['result']> {
  const p = run.params || {};
  const body: QueryRequest = {
    from: run.resolved_from!,
    to: run.resolved_to!,
    price_basis: input.price_basis || 'list',
    tz: input.tz || 'Asia/Seoul',
    filters: {
      team_ids: (p.team_ids as string[]) || [],
      models: (p.models as string[]) || [],
      products: [],
    },
    queries: [],
  };
  const frames: Record<string, QueryResult> = {};
  for (const metric_id of scenario.metric_ids || []) {
    const frame_type = [
      'cost',
      'cost_anomaly',
      'tokens',
      'sessions',
      'active_users',
      'api_retry_attempts',
      'rate_limit_events',
      'llm_duration_ms',
      'llm_ttft_ms',
      'api_error_rate',
    ].includes(metric_id)
      ? 'timeseries'
      : 'scalar';
    const query = {
      ref_id: metric_id,
      metric_id,
      frame_type,
      interval: '1d',
    } as QueryRequest['queries'][number];
    frames[metric_id] = operationsMetric(query, body, body.from, body.to, mode) ||
      teamMetric(query, body, body.from, body.to, mode) || {
        status: 200,
        frames: [],
        error: undefined,
      };
  }
  if (scenario.scenario_id === 'S1-3') {
    const query = {
      ref_id: 'cost',
      metric_id: 'cost',
      frame_type: 'table',
      group_by: ['team'],
    } as QueryRequest['queries'][number];
    const table = teamMetric(query, body, body.from, body.to, mode);
    if (table) frames.cost.frames.push(...table.frames);
  }
  if (mode === 'partial') {
    const key = Object.keys(frames)[1];
    if (key)
      frames[key] = {
        status: 504,
        frames: [],
        error: {
          error: 'query_timeout',
          message: '일부 지표 시간 초과',
          request_id: 'mock-result-partial',
        },
      };
  }
  const masked =
    body.filters?.team_ids?.includes('33333333-3333-4333-8333-333333333333') || mode === 'masked';
  return {
    target_page: scenario.target_page,
    applied_filters: {
      from: p.from || body.from,
      to: p.to || body.to,
      filters: body.filters,
      price_basis: body.price_basis,
      tz: body.tz,
    },
    highlight_widgets: scenario.highlight_widgets,
    findings: masked
      ? [{ rule_id: 'privacy', severity: 'info', title: '최소 집계 단위 미만 · 판정 근거 비공개' }]
      : [
          {
            rule_id: 'observed',
            severity: 'info',
            title: '선택한 범위의 관측 지표를 확인하세요.',
            widget_id: scenario.highlight_widgets?.[0],
            action: '기간과 단가를 확인한 뒤 관련 위젯의 데이터 표에서 근거를 검토하세요.',
            evidence: {
              metric_id:
                scenario.scenario_id === 'S1-3' ? 'cost_anomaly' : scenario.metric_ids?.[0],
              period: `${run.resolved_from} → ${run.resolved_to}`,
              price_basis: body.price_basis,
            },
          },
          ...(scenario.scenario_id === 'S1-3'
            ? [
                {
                  rule_id: 'fixture',
                  severity: 'warning' as const,
                  title: '비용 변동 합성 예시 · 실제 이상 판정 아님',
                  evidence: { metric_id: 'cost_anomaly' },
                  widget_id: 'W1.3',
                  action: '팀별 집계에는 5명 미만 그룹의 수치를 표시하지 않습니다.',
                },
              ]
            : []),
        ],
    frames,
  };
}
