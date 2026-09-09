import { delay, http, HttpResponse } from 'msw';
import data from './scenarioCatalog.json';
import type { Category, Detail, Run, RunInput, Scenario } from '../api/scenarios';
import { activeRun } from '../api/scenarios';
import { labels, validateParams, type Schema } from '../pages/scenarios/params';
export const categories: { id: Category; title: string }[] = [
  '비용·토큰·예산',
  '사용 패턴·시간대·Rate Limit',
  '도입·채택',
  '생산성·활용 역량',
  '보안·컴플라이언스',
  '품질·신뢰성·성능',
  '거버넌스·에이전트',
  'ROI·전략',
].map((title, i) => ({
  id: [
    'cost',
    'usage_pattern',
    'adoption',
    'productivity',
    'security',
    'quality',
    'governance',
    'strategy',
  ][i] as Category,
  title,
}));
const copy: Record<string, [string, string]> = {
  'S1-3': ['비용 스파이크·폭주 감지', '어느 날 비용이 갑자기 튀었는데 원인을 모를 때'],
  'S1-4': ['반복 프롬프트→캐싱 기회', '같은 컨텍스트를 반복 전송해 캐시 절감 여지가 있는지'],
  'S1-5': ['컨텍스트 과다 첨부', '입력 토큰이 출력 대비 과도한 세션이 많은지'],
  'S1-7': ['유휴 라이선스·좀비 시트', '설치는 있지만 오래 쓰지 않는 시트를 회수할 때'],
  'S1-1': ['부서별 토큰 할당 불균형', '예산 대비 소진률이 팀마다 크게 다를 때'],
  'S1-2': ['모델 티어 미스매치', '단순 작업에 상위 모델을 쓰는 팀이 있는지'],
  'S1-6': ['코딩 모델·effort 낭비', '높은 effort 설정이 실제 산출로 이어지는지'],
  'S2-1': ['오전/오후 사용량 변동 진단', '시간대별 사용 편차가 협업 방식과 맞는지'],
  'S2-2': ['Rate Limit 상시 도달', '429가 특정 팀·시간대에 반복될 때'],
  'S2-3': ['요일·스프린트 주기 패턴', '스프린트 후반에 사용이 몰리는지'],
  'S5-1': ['프롬프트 내 민감정보 유출', '프롬프트 본문 미수집으로 대리 측정 불가'],
};
export const catalog: Scenario[] = (data as Scenario[]).map((s) => ({
  ...s,
  title: copy[s.scenario_id]?.[0] || s.title,
  situation: copy[s.scenario_id]?.[1] || `${s.title} 관련 지표와 변화 원인을 확인합니다.`,
}));
const numeric: Record<string, [number, number, number]> = {
  moving_avg_days: [7, 1, 90],
  spike_threshold_pct: [200, 1, 10000],
  io_ratio_threshold: [10, 1, 1000],
  inactive_days: [30, 1, 365],
  window_weeks: [4, 1, 52],
  probe_window_min: [5, 1, 1440],
  probe_count: [10, 1, 10000],
  threshold_ms: [2000, 1, 60000],
  failure_threshold: [0.05, 0, 1],
  density_threshold: [10, 0, 10000],
};
export function scenarioDetail(s: Scenario): Detail {
  const properties: Record<string, Schema> = {};
  for (const k of [
    ...new Set([...(s.required_params || []), ...(s.scenario_id === 'S1-3' ? ['team_ids'] : [])]),
  ]) {
    if (numeric[k]) {
      const [d, min, max] = numeric[k];
      properties[k] = {
        type: ['failure_threshold', 'density_threshold', 'io_ratio_threshold'].includes(k)
          ? 'number'
          : 'integer',
        default: d,
        minimum: min,
        maximum: max,
      };
    } else if (k === 'budget_by_team')
      properties[k] = {
        type: 'object',
        default: {},
        additionalProperties: {
          type: 'object',
          additionalProperties: false,
          properties: {
            usd: { type: 'number', minimum: 0.01 },
            tokens_m: { type: 'number', minimum: 0.000001 },
          },
        },
      };
    else if (
      [
        'team_ids',
        'models',
        'command_names',
        'premium_model_patterns',
        'sprint_dates',
        'wait_thresholds_min',
      ].includes(k)
    )
      properties[k] = {
        type: 'array',
        default:
          k === 'premium_model_patterns'
            ? ['*opus*']
            : k === 'wait_thresholds_min'
              ? [2, 5, 10]
              : [],
        items:
          k === 'wait_thresholds_min'
            ? { type: 'number', minimum: 0 }
            : { type: 'string', minLength: 1, ...(k === 'sprint_dates' ? { format: 'date' } : {}) },
      };
    else if (['pivot_date', 'cohort_from', 'cohort_to'].includes(k))
      properties[k] = {
        type: 'string',
        format: 'date',
        default: k === 'cohort_from' ? '2026-08-01' : '2026-09-01',
      };
    else
      properties[k] = {
        type: 'string',
        minLength: 1,
        maxLength: 256,
        default:
          k === 'from'
            ? s.scenario_id === 'S8-2'
              ? 'now-90d'
              : 'now-7d'
            : ['to', 'as_of'].includes(k)
              ? 'now'
              : k === 'growth_model'
                ? 'linear'
                : k === 'language'
                  ? 'TypeScript'
                  : k === 'model_a'
                    ? 'claude-sonnet-4-6'
                    : k === 'model_b'
                      ? 'gpt-5.3-codex'
                      : '',
        ...(k === 'growth_model' ? { enum: ['linear', 'constant'] } : {}),
      };
    properties[k].title = labels[k] || k;
  }
  return {
    ...s,
    params_schema: {
      type: 'object',
      properties,
      required: s.required_params,
      additionalProperties: false,
    },
    metrics: s.metric_ids?.map((metric_id) => ({
      metric_id,
      availability: s.availability,
      definition:
        metric_id === 'cost' ? '토큰 × 단가 추정 비용 · 청구액 아님' : `${metric_id} 집계`,
      caveat: s.unavailable_reason || undefined,
    })),
    findings_rules: [
      {
        rule_id: 'mock-rule',
        severity: 'info',
        message:
          s.scenario_id === 'S1-3'
            ? '일 비용이 직전 이동평균 대비 임계 비율을 넘는 날을 표시합니다.'
            : '선택한 기간·팀의 관측 지표를 기준으로 판정합니다. 목업 결과는 합성 예시입니다.',
      },
    ],
  };
}
type Stored = { run: Run; started: number; mode: string; actor: string };
const runs = new Map<string, Stored>();
export function resetScenarioRuns() {
  runs.clear();
}
const err = (status: number, error: string, message: string) =>
  HttpResponse.json({ error, message, request_id: 'mock-scenario-request' }, { status });
function settle(r: Stored) {
  if (!activeRun(r.run)) return;
  const elapsed = Date.now() - r.started;
  if (elapsed < 1000) return;
  r.run.status = 'running';
  r.run.progress = { step: Math.min(3, Math.floor(elapsed / 2000)), total: 4, label: '쿼리 실행' };
  if (r.mode === 'loading' || elapsed < 6500) return;
  r.run.finished_at = new Date().toISOString();
  if (r.mode === 'run-failed') {
    r.run.status = 'failed';
    r.run.error = {
      error: 'query_timeout',
      message: '쿼리 시간 초과 — 기간을 줄이거나 팀을 좁혀 다시 실행하세요.',
      request_id: 'mock-run-timeout',
    };
    return;
  }
  const s = catalog.find((s) => s.scenario_id === r.run.scenario_id)!;
  r.run.status = 'succeeded';
  r.run.progress = { step: 4, total: 4, label: '완료' };
  r.run.result = {
    target_page: s.target_page,
    applied_filters: r.run.params,
    highlight_widgets: s.highlight_widgets,
    findings: [
      {
        rule_id: 'mock-rule',
        severity: 'info',
        title: '합성 데이터 분석이 완료되었습니다.',
        action: '실제 운영 판단에는 연결된 서버 데이터를 확인하세요.',
      },
    ],
    frames: {},
  };
  r.run.findings_count = { info: 1, warning: 0, anomaly: 0 };
}
export function scenarioHandlers(
  role: (r: Request) => 'owner' | 'admin' | undefined,
  ownTeam: string,
) {
  const actor = (r: Request) => r.headers.get('Authorization') || '';
  const auth = (r: Request) => (role(r) ? null : err(401, 'unauthorized', '로그인이 필요합니다.'));
  return [
    http.get('*/v1/scenarios', async ({ request }) => {
      const denied = auth(request);
      if (denied) return denied;
      const mode = request.headers.get('X-Mock-Case');
      await delay(mode === 'loading' ? 2500 : 120);
      if (mode === 'error') return err(503, 'internal_error', '카탈로그를 불러오지 못했습니다.');
      const q = new URL(request.url).searchParams;
      return HttpResponse.json({
        categories,
        items:
          mode === 'empty'
            ? []
            : catalog.filter(
                (s) =>
                  (!q.get('category') || s.category === q.get('category')) &&
                  (!q.get('availability') || s.availability === q.get('availability')) &&
                  (!q.get('target_page') || s.target_page === q.get('target_page')) &&
                  `${s.scenario_id} ${s.title} ${s.situation}`
                    .toLowerCase()
                    .includes((q.get('q') || '').toLowerCase()),
              ),
      });
    }),
    http.get('*/v1/scenarios/:id', async ({ request, params }) => {
      const denied = auth(request);
      if (denied) return denied;
      await delay(100);
      const s = catalog.find((s) => s.scenario_id === params.id);
      return s
        ? HttpResponse.json(scenarioDetail(s))
        : err(404, 'not_found', '시나리오가 없습니다.');
    }),
    http.post('*/v1/scenarios/:id/runs', async ({ request, params }) => {
      const denied = auth(request);
      if (denied) return denied;
      const s = catalog.find((s) => s.scenario_id === params.id);
      if (!s) return err(404, 'not_found', '시나리오가 없습니다.');
      let body: RunInput;
      try {
        body = (await request.json()) as RunInput;
      } catch {
        return err(400, 'invalid_request', '올바른 JSON이 필요합니다.');
      }
      const errors = validateParams(scenarioDetail(s).params_schema as Schema, body.params || {});
      if (errors.length) return err(400, 'invalid_request', errors.join(' '));
      if (s.availability === 'unavailable')
        return err(
          409,
          'scenario_unavailable',
          s.unavailable_reason || '어댑터 확장 후 실행할 수 있습니다.',
        );
      const teamIds = (body.params.team_ids || []) as string[],
        budgets = Object.keys((body.params.budget_by_team || {}) as object);
      if (role(request) === 'admin' && [...teamIds, ...budgets].some((t) => t !== ownTeam))
        return err(403, 'forbidden', '소속 팀 범위만 실행할 수 있습니다.');
      // P3 results and org-only refusals require owner under the existing console policy.
      if (
        role(request) === 'admin' &&
        (s.target_page === 'P3' || s.metric_ids?.includes('refusals'))
      )
        return err(403, 'forbidden', '이 시나리오는 owner 권한이 필요합니다.');
      for (const r of runs.values()) settle(r);
      if ([...runs.values()].filter((r) => activeRun(r.run)).length >= 3)
        return err(
          429,
          'run_limit_exceeded',
          '동시에 3개까지 실행할 수 있습니다. 진행 중인 실행을 기다리거나 취소하세요.',
        );
      const id = crypto.randomUUID();
      const run: Run = {
        run_id: id,
        scenario_id: s.scenario_id,
        status: 'queued',
        created_at: new Date().toISOString(),
        params: { ...body.params, ...(role(request) === 'admin' ? { team_ids: [ownTeam] } : {}) },
        params_summary: `${body.params.from || body.params.as_of || body.params.pivot_date || '기간 지정'} → ${body.params.to || ''}`,
        progress: { step: 0, total: 4, label: '대기' },
      };
      runs.set(id, {
        run,
        started: Date.now(),
        mode: request.headers.get('X-Mock-Case') || 'normal',
        actor: actor(request),
      });
      return HttpResponse.json(run, {
        status: 202,
        headers: { Location: `/v1/scenario-runs/${id}`, 'Retry-After': '2' },
      });
    }),
    http.get('*/v1/scenario-runs/:id', ({ request, params }) => {
      const denied = auth(request);
      if (denied) return denied;
      const r = runs.get(String(params.id));
      if (!r || r.actor !== actor(request)) return err(404, 'not_found', '실행이 없습니다.');
      settle(r);
      return HttpResponse.json(r.run, { headers: activeRun(r.run) ? { 'Retry-After': '2' } : {} });
    }),
    http.post('*/v1/scenario-runs/:id/cancel', ({ request, params }) => {
      const denied = auth(request);
      if (denied) return denied;
      const r = runs.get(String(params.id));
      if (!r || r.actor !== actor(request)) return err(404, 'not_found', '실행이 없습니다.');
      settle(r);
      if (!activeRun(r.run))
        return err(409, 'conflict', '이미 종료된 실행입니다. 상태를 새로 확인하세요.');
      r.run.status = 'cancelled';
      r.run.finished_at = new Date().toISOString();
      return HttpResponse.json(r.run);
    }),
  ];
}
